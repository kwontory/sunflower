import { MAX_RETRIES, RETRY_BASE_DELAYS_MS, RETRY_JITTER_MS } from '../config';
import type { FetchFailure, Result } from '../types';

/** Retry-After가 이보다 길면 바로 기다리지 않고 재시도를 멈춘다. 이후는 자동 갱신 백오프가 맡는다. */
export const MAX_INLINE_RETRY_AFTER_MS = 30_000;

/** D005 재시도 대상: 시간 초과, 네트워크 오류, HTTP 5xx, HTTP 429 */
export function isRetryable(f: FetchFailure): boolean {
  switch (f.kind) {
    case 'timeout':
    case 'network':
      return true;
    case 'http':
      return f.status !== undefined && (f.status === 429 || (f.status >= 500 && f.status <= 599));
    default:
      return false;
  }
}

/**
 * retryIndex번째 재시도(0부터) 전에 기다릴 시간.
 * 기본 간격 + 무작위 지연이며, Retry-After가 더 길면 그 값을 따른다.
 */
export function retryDelayMs(retryIndex: number, failure: FetchFailure, random: () => number): number {
  const i = Math.min(Math.max(0, retryIndex), RETRY_BASE_DELAYS_MS.length - 1);
  const delay = RETRY_BASE_DELAYS_MS[i] + random() * RETRY_JITTER_MS;
  return failure.retryAfterMs !== undefined ? Math.max(delay, failure.retryAfterMs) : delay;
}

export interface RetryDeps {
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  /** 기본값 MAX_RETRIES */
  maxRetries?: number;
}

/**
 * operation을 실패 시 정책에 따라 다시 실행한다. attempt는 1부터 센다.
 * 성공, 재시도 제외 실패, 긴 Retry-After, 재시도 소진 중 하나에서 멈추고 마지막 결과를 돌려준다.
 * operation이 예외를 던지면 프로그래밍 오류로 보고 그대로 전파한다.
 * (외부 API 실패는 operation이 Result로 돌려줘야 한다.)
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<Result<T, FetchFailure>>,
  deps: RetryDeps,
): Promise<{ result: Result<T, FetchFailure>; attempts: number }> {
  const maxRetries = deps.maxRetries ?? MAX_RETRIES;
  let attempts = 1;
  let result = await operation(attempts);

  while (!result.ok && attempts <= maxRetries) {
    const failure = result.error;
    if (!isRetryable(failure)) break;
    if (failure.retryAfterMs !== undefined && failure.retryAfterMs > MAX_INLINE_RETRY_AFTER_MS) break;
    await deps.sleep(retryDelayMs(attempts - 1, failure, deps.random));
    attempts += 1;
    result = await operation(attempts);
  }

  return { result, attempts };
}
