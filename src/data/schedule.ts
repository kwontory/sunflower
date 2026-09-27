import { BACKOFF_INTERVALS_MS, MANUAL_REFRESH_COOLDOWN_MS, REFRESH_INTERVAL_MS } from '../config';

// 호출 시점 판단만 하는 순수 함수. 타이머 연결은 컨트롤러가 한다.

/** 연속 실패 횟수에 따른 자동 갱신 간격 (5분 → 10분 → 20분 → 최대 30분) */
export function autoRefreshIntervalMs(consecutiveFailures: number): number {
  const i = Math.min(Math.max(0, Math.floor(consecutiveFailures)), BACKOFF_INTERVALS_MS.length - 1);
  return BACKOFF_INTERVALS_MS[i];
}

/** 다음 자동 갱신 시각. Retry-After가 있으면 그보다 이르지 않게 한다. */
export function nextAutoRefreshAt(lastAttemptAt: Date, consecutiveFailures: number, retryAfterMs?: number): Date {
  // 서버가 지나치게 긴 Retry-After를 보내도 자동 갱신이 멈추지 않도록 최대 간격(30분)으로 제한한다
  const maxWait = BACKOFF_INTERVALS_MS[BACKOFF_INTERVALS_MS.length - 1];
  const retryAfter = Number.isFinite(retryAfterMs) ? Math.min(Math.max(retryAfterMs ?? 0, 0), maxWait) : 0;
  const wait = Math.max(autoRefreshIntervalMs(consecutiveFailures), retryAfter);
  return new Date(lastAttemptAt.getTime() + wait);
}

/** 수동 새로고침으로 실제 요청을 보내도 되는지. 직전 요청 후 60초 이내면 false (캐시 사용). */
export function canManualRefresh(lastRequestAt: Date | null, now: Date): boolean {
  if (lastRequestAt === null) return true;
  return now.getTime() - lastRequestAt.getTime() >= MANUAL_REFRESH_COOLDOWN_MS;
}

/** 탭에 돌아왔을 때 호출할지. 받은 값이 없거나 마지막 정상값이 5분보다 오래됐으면 true. */
export function shouldFetchOnVisible(lastSuccessAt: Date | null, now: Date): boolean {
  if (lastSuccessAt === null) return true;
  return now.getTime() - lastSuccessAt.getTime() > REFRESH_INTERVAL_MS;
}
