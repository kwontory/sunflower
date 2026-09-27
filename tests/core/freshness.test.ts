import { describe, expect, it } from 'vitest';
import { CACHE_TTL_MS, STALE_AFTER_MS } from '../../src/config';
import { ageMs, isCacheValid, isStale } from '../../src/core/freshness';

const FETCHED = '2026-09-27T03:00:00.000Z';
const at = (ms: number) => new Date(Date.parse(FETCHED) + ms);

describe('ageMs', () => {
  it('경과 시간을 계산한다', () => {
    expect(ageMs(FETCHED, at(90_000))).toBe(90_000);
  });

  it('시계 차이로 음수가 되면 0', () => {
    expect(ageMs(FETCHED, at(-60_000))).toBe(0);
  });

  it('읽을 수 없는 날짜는 무한대', () => {
    expect(ageMs('garbage', at(0))).toBe(Infinity);
    expect(ageMs(FETCHED, new Date(Number.NaN))).toBe(Infinity);
  });
});

describe('isCacheValid', () => {
  it('5분 미만이면 유효, 정확히 5분이면 만료', () => {
    expect(isCacheValid(FETCHED, at(0))).toBe(true);
    expect(isCacheValid(FETCHED, at(CACHE_TTL_MS - 1))).toBe(true);
    expect(isCacheValid(FETCHED, at(CACHE_TTL_MS))).toBe(false);
  });

  it('미래 시각(시계 차이)은 유효', () => {
    expect(isCacheValid(FETCHED, at(-60_000))).toBe(true);
  });

  it('잘못된 날짜는 유효하지 않다', () => {
    expect(isCacheValid('', at(0))).toBe(false);
  });
});

describe('isStale', () => {
  it('정확히 15분은 아직 stale 아님, 초과하면 stale', () => {
    expect(isStale(FETCHED, at(STALE_AFTER_MS))).toBe(false);
    expect(isStale(FETCHED, at(STALE_AFTER_MS + 1))).toBe(true);
  });

  it('음수 경과 시간은 stale 아님', () => {
    expect(isStale(FETCHED, at(-60_000))).toBe(false);
  });

  it('잘못된 날짜는 stale', () => {
    expect(isStale('garbage', at(0))).toBe(true);
  });
});
