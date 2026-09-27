import { describe, expect, it } from 'vitest';
import {
  autoRefreshIntervalMs,
  canManualRefresh,
  nextAutoRefreshAt,
  shouldFetchOnVisible,
} from '../../src/data/schedule';

const MIN = 60_000;
const t0 = new Date('2026-09-27T03:00:00Z');
const after = (ms: number) => new Date(t0.getTime() + ms);

describe('autoRefreshIntervalMs', () => {
  it.each([
    [0, 5 * MIN],
    [1, 10 * MIN],
    [2, 20 * MIN],
    [3, 30 * MIN],
    [10, 30 * MIN],
    [-1, 5 * MIN],
  ])('연속 실패 %i회 → %i ms', (n, expected) => {
    expect(autoRefreshIntervalMs(n)).toBe(expected);
  });
});

describe('nextAutoRefreshAt', () => {
  it('지나치게 긴 Retry-After는 최대 간격 30분으로 제한한다', () => {
    expect(nextAutoRefreshAt(t0, 0, 365 * 24 * 60 * MIN)).toEqual(after(30 * MIN));
    expect(nextAutoRefreshAt(t0, 0, Number.POSITIVE_INFINITY)).toEqual(after(5 * MIN));
    expect(nextAutoRefreshAt(t0, 0, -1)).toEqual(after(5 * MIN));
  });

  it('마지막 시도 시각에 간격을 더한다', () => {
    expect(nextAutoRefreshAt(t0, 0)).toEqual(after(5 * MIN));
    expect(nextAutoRefreshAt(t0, 2)).toEqual(after(20 * MIN));
  });

  it('Retry-After가 더 길면 그보다 이르지 않다', () => {
    expect(nextAutoRefreshAt(t0, 0, 7 * MIN)).toEqual(after(7 * MIN));
  });

  it('Retry-After가 더 짧으면 간격을 따른다', () => {
    expect(nextAutoRefreshAt(t0, 1, 30_000)).toEqual(after(10 * MIN));
  });
});

describe('canManualRefresh', () => {
  it('요청한 적이 없으면 허용한다', () => {
    expect(canManualRefresh(null, t0)).toBe(true);
  });

  it('60초 미만이면 막고, 60초부터 허용한다', () => {
    expect(canManualRefresh(t0, after(0))).toBe(false);
    expect(canManualRefresh(t0, after(59_999))).toBe(false);
    expect(canManualRefresh(t0, after(60_000))).toBe(true);
  });
});

describe('shouldFetchOnVisible', () => {
  it('정상값이 없으면 호출한다', () => {
    expect(shouldFetchOnVisible(null, t0)).toBe(true);
  });

  it('마지막 정상값이 5분보다 오래됐을 때만 호출한다', () => {
    expect(shouldFetchOnVisible(t0, after(4 * MIN))).toBe(false);
    expect(shouldFetchOnVisible(t0, after(5 * MIN))).toBe(false);
    expect(shouldFetchOnVisible(t0, after(5 * MIN + 1))).toBe(true);
  });
});
