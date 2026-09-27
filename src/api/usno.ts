import { REQUEST_TIMEOUT_MS, USNO_CELNAV_URL } from '../config';
import type { Coordinates, FetchFailure, Result } from '../types';

export interface CelnavFetchDeps {
  fetch: typeof fetch;
  timeoutMs?: number;
  /** Retry-After HTTP-date 계산용 현재 시각. 없으면 시스템 시각을 쓴다. */
  now?: () => Date;
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** celnav 요청 URL. 날짜·시각은 UTC, 좌표는 받은 그대로 쓴다 (이미 반올림된 값). */
export function buildCelnavUrl(coords: Coordinates, at: Date): string {
  const date = `${pad(at.getUTCFullYear(), 4)}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
  const time = `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}`;
  // ':'와 ','는 USNO 문서 예시처럼 인코딩하지 않는다.
  return `${USNO_CELNAV_URL}?date=${date}&time=${time}&coords=${coords.latitude},${coords.longitude}`;
}

/** Retry-After 헤더(초 또는 HTTP-date)를 밀리초로 바꾼다. 해석할 수 없으면 undefined. */
export function parseRetryAfter(value: string | null, now: Date): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  // Date.parse는 '-5' 같은 값도 연도로 해석하므로 요일·월 이름이 있는 HTTP-date만 받는다.
  if (!/[A-Za-z]/.test(trimmed)) return undefined;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now.getTime());
}

const fail = (error: FetchFailure): Result<never, FetchFailure> => ({ ok: false, error });

/**
 * celnav를 호출해 JSON 본문을 돌려준다. 본문 구조 검증은 validate.ts에서 한다.
 * 예외를 던지지 않고 실패는 모두 FetchFailure로 돌려준다.
 */
export async function fetchCelnav(
  coords: Coordinates,
  at: Date,
  deps: CelnavFetchDeps,
): Promise<Result<unknown, FetchFailure>> {
  const timeoutMs = deps.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const timeoutFailure = (): Result<never, FetchFailure> =>
    fail({ kind: 'timeout', message: `응답 없음 (${timeoutMs}ms 초과)` });

  try {
    let res: Response;
    try {
      res = await deps.fetch(buildCelnavUrl(coords, at), { signal: controller.signal });
    } catch (e) {
      if (timedOut) return timeoutFailure();
      return fail({ kind: 'network', message: `네트워크 오류: ${describe(e)}` });
    }

    if (!res.ok) {
      const now = deps.now ? deps.now() : new Date();
      const retryAfterMs = parseRetryAfter(res.headers.get('Retry-After'), now);
      const error: FetchFailure = { kind: 'http', status: res.status, message: `HTTP ${res.status}` };
      if (retryAfterMs !== undefined) error.retryAfterMs = retryAfterMs;
      return fail(error);
    }

    // 본문 읽기 중에도 타임아웃이 적용된다.
    let text: string;
    try {
      text = await res.text();
    } catch (e) {
      if (timedOut) return timeoutFailure();
      return fail({ kind: 'network', message: `본문 읽기 실패: ${describe(e)}` });
    }
    if (timedOut) return timeoutFailure();

    try {
      return { ok: true, value: JSON.parse(text) as unknown };
    } catch {
      return fail({ kind: 'invalid-response', message: 'JSON이 아닌 응답' });
    }
  } finally {
    clearTimeout(timer);
  }
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
