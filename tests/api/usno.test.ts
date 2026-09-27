import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCelnavUrl, fetchCelnav, parseRetryAfter } from '../../src/api/usno';
import { REQUEST_TIMEOUT_MS } from '../../src/config';
import { SEOUL_CITY_HALL, celnavBody, jsonResponse } from './fixtures';

const AT = new Date('2026-09-27T03:00:00Z');

/** AbortSignal이 오면 AbortError로 거부하고, 아니면 끝나지 않는 fetch */
function hangingFetch(): typeof fetch {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('aborted', 'AbortError')),
      );
    }),
  ) as unknown as typeof fetch;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('buildCelnavUrl', () => {
  it('UTC 날짜·시각과 좌표로 URL을 만든다', () => {
    expect(buildCelnavUrl(SEOUL_CITY_HALL, AT)).toBe(
      'https://aa.usno.navy.mil/api/celnav?date=2026-09-27&time=03:00:00&coords=37.57,126.98',
    );
  });

  it('한 자리 월·일·시·분·초를 0으로 채운다', () => {
    const url = buildCelnavUrl(SEOUL_CITY_HALL, new Date('2026-01-05T04:07:09.900Z'));
    expect(url).toContain('date=2026-01-05&time=04:07:09&');
  });

  it('로컬 시간대가 아니라 UTC를 쓴다 (KST 자정 직후 = UTC 전날)', () => {
    const url = buildCelnavUrl(SEOUL_CITY_HALL, new Date('2026-09-28T00:30:00+09:00'));
    expect(url).toContain('date=2026-09-27&time=15:30:00');
  });
});

describe('parseRetryAfter', () => {
  const now = new Date('2026-09-27T03:00:00Z');
  it('초 단위와 HTTP-date를 밀리초로 바꾼다', () => {
    expect(parseRetryAfter('120', now)).toBe(120_000);
    expect(parseRetryAfter('Sun, 27 Sep 2026 03:00:30 GMT', now)).toBe(30_000);
  });
  it('과거 날짜는 0, 해석 불가·없음은 undefined', () => {
    expect(parseRetryAfter('Sun, 27 Sep 2026 02:00:00 GMT', now)).toBe(0);
    expect(parseRetryAfter('soon', now)).toBeUndefined();
    expect(parseRetryAfter('-5', now)).toBeUndefined();
    expect(parseRetryAfter(null, now)).toBeUndefined();
  });
});

describe('fetchCelnav', () => {
  it('성공하면 JSON 본문을 돌려주고 요청 URL과 signal을 넘긴다', async () => {
    const body = celnavBody();
    const fetch = vi.fn(async () => jsonResponse(body));
    const r = await fetchCelnav(SEOUL_CITY_HALL, AT, { fetch: fetch as unknown as typeof globalThis.fetch });
    expect(r).toEqual({ ok: true, value: body });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(buildCelnavUrl(SEOUL_CITY_HALL, AT));
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('HTTP 500은 http 실패로 상태 코드를 담는다', async () => {
    const fetch = vi.fn(async () => new Response('oops', { status: 500 })) as unknown as typeof globalThis.fetch;
    const r = await fetchCelnav(SEOUL_CITY_HALL, AT, { fetch });
    expect(r).toEqual({ ok: false, error: { kind: 'http', status: 500, message: 'HTTP 500' } });
  });

  it('HTTP 429 + Retry-After 초', async () => {
    const fetch = vi.fn(
      async () => new Response('', { status: 429, headers: { 'Retry-After': '30' } }),
    ) as unknown as typeof globalThis.fetch;
    const r = await fetchCelnav(SEOUL_CITY_HALL, AT, { fetch });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('http');
      expect(r.error.status).toBe(429);
      expect(r.error.retryAfterMs).toBe(30_000);
    }
  });

  it('HTTP 503 + Retry-After HTTP-date (주입한 now 기준)', async () => {
    const fetch = vi.fn(
      async () =>
        new Response('', { status: 503, headers: { 'Retry-After': 'Sun, 27 Sep 2026 03:01:00 GMT' } }),
    ) as unknown as typeof globalThis.fetch;
    const r = await fetchCelnav(SEOUL_CITY_HALL, AT, { fetch, now: () => AT });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.retryAfterMs).toBe(60_000);
  });

  it('해석할 수 없는 Retry-After는 무시한다', async () => {
    const fetch = vi.fn(
      async () => new Response('', { status: 429, headers: { 'Retry-After': 'later' } }),
    ) as unknown as typeof globalThis.fetch;
    const r = await fetchCelnav(SEOUL_CITY_HALL, AT, { fetch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toHaveProperty('retryAfterMs');
  });

  it('fetch 거부는 network 실패', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof globalThis.fetch;
    const r = await fetchCelnav(SEOUL_CITY_HALL, AT, { fetch });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('network');
      expect(r.error.message).toContain('Failed to fetch');
    }
  });

  it('JSON이 아닌 본문은 invalid-response', async () => {
    const fetch = vi.fn(async () => new Response('<html>maintenance</html>')) as unknown as typeof globalThis.fetch;
    const r = await fetchCelnav(SEOUL_CITY_HALL, AT, { fetch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid-response');
  });

  it('기본 타임아웃(REQUEST_TIMEOUT_MS)이 지나면 요청을 중단하고 timeout 실패', async () => {
    vi.useFakeTimers();
    const promise = fetchCelnav(SEOUL_CITY_HALL, AT, { fetch: hangingFetch() });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    let settled = false;
    void promise.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const r = await promise;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('timeout');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('timeoutMs를 주입할 수 있다', async () => {
    vi.useFakeTimers();
    const promise = fetchCelnav(SEOUL_CITY_HALL, AT, { fetch: hangingFetch(), timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    const r = await promise;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('timeout');
  });

  it.each([
    ['성공', async () => jsonResponse(celnavBody())],
    ['HTTP 오류', async () => new Response('', { status: 500 })],
    ['네트워크 오류', async () => Promise.reject(new TypeError('x'))],
    ['JSON 아님', async () => new Response('nope')],
  ])('모든 경로에서 타이머를 정리한다: %s', async (_, impl) => {
    vi.useFakeTimers();
    await fetchCelnav(SEOUL_CITY_HALL, AT, { fetch: vi.fn(impl) as unknown as typeof globalThis.fetch });
    expect(vi.getTimerCount()).toBe(0);
  });
});
