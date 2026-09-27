import { CACHE_TTL_MS, STALE_AFTER_MS } from '../config';

/** 조회 후 경과 시간(ms). 시계 차이로 음수가 되면 0, 날짜를 읽을 수 없으면 Infinity. */
export function ageMs(fetchedAt: string, now: Date): number {
  const fetched = Date.parse(fetchedAt);
  const current = now.getTime();
  if (Number.isNaN(fetched) || Number.isNaN(current)) return Infinity;
  return Math.max(0, current - fetched);
}

/** 요청 캐시 유효 여부: 경과 시간이 5분 미만 (D005) */
export function isCacheValid(fetchedAt: string, now: Date): boolean {
  return ageMs(fetchedAt, now) < CACHE_TTL_MS;
}

/** stale 여부: 경과 시간이 15분 초과 (D005) */
export function isStale(fetchedAt: string, now: Date): boolean {
  return ageMs(fetchedAt, now) > STALE_AFTER_MS;
}
