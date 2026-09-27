import { describe, expect, it } from 'vitest';
import { MAX_INLINE_RETRY_AFTER_MS, isRetryable, retryDelayMs, withRetry } from '../../src/data/retry';
import type { FetchFailure, Result } from '../../src/types';

const fail = (f: Partial<FetchFailure> & Pick<FetchFailure, 'kind'>): FetchFailure => ({ message: 'test', ...f });
const err = (f: FetchFailure): Result<string, FetchFailure> => ({ ok: false, error: f });
const ok = (v: string): Result<string, FetchFailure> => ({ ok: true, value: v });

function fakeSleep() {
  const calls: number[] = [];
  return { calls, sleep: async (ms: number) => void calls.push(ms) };
}

/** 미리 정한 결과를 차례로 돌려주는 operation */
function scripted(results: Result<string, FetchFailure>[]) {
  const seen: number[] = [];
  const op = async (attempt: number) => {
    seen.push(attempt);
    return results[attempt - 1];
  };
  return { op, seen };
}

describe('isRetryable', () => {
  it.each([
    [fail({ kind: 'timeout' }), true],
    [fail({ kind: 'network' }), true],
    [fail({ kind: 'http', status: 500 }), true],
    [fail({ kind: 'http', status: 503 }), true],
    [fail({ kind: 'http', status: 599 }), true],
    [fail({ kind: 'http', status: 429 }), true],
    [fail({ kind: 'http', status: 400 }), false],
    [fail({ kind: 'http', status: 404 }), false],
    [fail({ kind: 'http', status: 499 }), false],
    [fail({ kind: 'http' }), false],
    [fail({ kind: 'invalid-response' }), false],
    [fail({ kind: 'invalid-data' }), false],
  ])('%o → %s', (f, expected) => {
    expect(isRetryable(f)).toBe(expected);
  });
});

describe('retryDelayMs', () => {
  const f = fail({ kind: 'timeout' });

  it('기본 간격 2초, 6초에 jitter를 더한다', () => {
    expect(retryDelayMs(0, f, () => 0)).toBe(2000);
    expect(retryDelayMs(1, f, () => 0)).toBe(6000);
    expect(retryDelayMs(0, f, () => 0.999)).toBeCloseTo(2999);
    expect(retryDelayMs(1, f, () => 0.999)).toBeCloseTo(6999);
  });

  it('Retry-After가 더 길면 그 값을 따른다', () => {
    const r = fail({ kind: 'http', status: 429, retryAfterMs: 10_000 });
    expect(retryDelayMs(0, r, () => 0.5)).toBe(10_000);
  });

  it('Retry-After가 더 짧으면 기본 간격을 쓴다', () => {
    const r = fail({ kind: 'http', status: 429, retryAfterMs: 1000 });
    expect(retryDelayMs(0, r, () => 0.5)).toBe(2500);
  });
});

describe('withRetry', () => {
  it('첫 시도에 성공하면 1회로 끝난다', async () => {
    const { calls, sleep } = fakeSleep();
    const { op, seen } = scripted([ok('a')]);
    const out = await withRetry(op, { sleep, random: () => 0 });
    expect(out).toEqual({ result: ok('a'), attempts: 1 });
    expect(seen).toEqual([1]);
    expect(calls).toEqual([]);
  });

  it('세 번째 시도에 성공하고 2초, 6초를 기다린다', async () => {
    const { calls, sleep } = fakeSleep();
    const { op, seen } = scripted([err(fail({ kind: 'timeout' })), err(fail({ kind: 'network' })), ok('c')]);
    const out = await withRetry(op, { sleep, random: () => 0 });
    expect(out).toEqual({ result: ok('c'), attempts: 3 });
    expect(seen).toEqual([1, 2, 3]);
    expect(calls).toEqual([2000, 6000]);
  });

  it('세 번 모두 실패하면 마지막 실패를 돌려준다', async () => {
    const { calls, sleep } = fakeSleep();
    const last = fail({ kind: 'http', status: 503, message: 'last' });
    const { op } = scripted([err(fail({ kind: 'timeout' })), err(fail({ kind: 'network' })), err(last)]);
    const out = await withRetry(op, { sleep, random: () => 0.999 });
    expect(out.attempts).toBe(3);
    expect(out.result).toEqual(err(last));
    expect(calls[0]).toBeCloseTo(2999);
    expect(calls[1]).toBeCloseTo(6999);
  });

  it('재시도 제외 실패는 1회로 멈춘다', async () => {
    const { calls, sleep } = fakeSleep();
    const { op, seen } = scripted([err(fail({ kind: 'invalid-data' })), ok('x')]);
    const out = await withRetry(op, { sleep, random: () => 0 });
    expect(out.attempts).toBe(1);
    expect(out.result.ok).toBe(false);
    expect(seen).toEqual([1]);
    expect(calls).toEqual([]);
  });

  it('HTTP 404는 재시도하지 않는다', async () => {
    const { sleep } = fakeSleep();
    const { op } = scripted([err(fail({ kind: 'http', status: 404 }))]);
    expect((await withRetry(op, { sleep, random: () => 0 })).attempts).toBe(1);
  });

  it('Retry-After를 대기 시간에 반영한다', async () => {
    const { calls, sleep } = fakeSleep();
    const { op } = scripted([err(fail({ kind: 'http', status: 429, retryAfterMs: 20_000 })), ok('y')]);
    const out = await withRetry(op, { sleep, random: () => 0 });
    expect(out.attempts).toBe(2);
    expect(calls).toEqual([20_000]);
  });

  it('Retry-After가 30초 이하면 기다리고, 넘으면 멈춘다', async () => {
    const at = scripted([err(fail({ kind: 'http', status: 429, retryAfterMs: MAX_INLINE_RETRY_AFTER_MS })), ok('z')]);
    const s1 = fakeSleep();
    expect((await withRetry(at.op, { sleep: s1.sleep, random: () => 0 })).attempts).toBe(2);
    expect(s1.calls).toEqual([30_000]);

    const over = fail({ kind: 'http', status: 429, retryAfterMs: MAX_INLINE_RETRY_AFTER_MS + 1 });
    const beyond = scripted([err(over), ok('z')]);
    const s2 = fakeSleep();
    const out = await withRetry(beyond.op, { sleep: s2.sleep, random: () => 0 });
    expect(out).toEqual({ result: err(over), attempts: 1 });
    expect(s2.calls).toEqual([]);
  });

  it('maxRetries로 재시도 횟수를 줄일 수 있다', async () => {
    const { calls, sleep } = fakeSleep();
    const { op } = scripted([err(fail({ kind: 'timeout' })), err(fail({ kind: 'timeout' })), ok('n')]);
    const out = await withRetry(op, { sleep, random: () => 0, maxRetries: 0 });
    expect(out.attempts).toBe(1);
    expect(calls).toEqual([]);
  });

  it('operation이 던진 예외는 그대로 전파한다', async () => {
    const { sleep } = fakeSleep();
    const op = async (): Promise<Result<string, FetchFailure>> => {
      throw new Error('bug');
    };
    await expect(withRetry(op, { sleep, random: () => 0 })).rejects.toThrow('bug');
  });
});
