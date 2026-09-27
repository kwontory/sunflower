// D005에서 확정한 호출 간격, 캐시, 재시도 정책 값

const SECOND = 1000;
const MINUTE = 60 * SECOND;

export const REFRESH_INTERVAL_MS = 5 * MINUTE;
export const MANUAL_REFRESH_COOLDOWN_MS = 60 * SECOND;
export const CACHE_TTL_MS = 5 * MINUTE;
export const STALE_AFTER_MS = 15 * MINUTE;

export const REQUEST_TIMEOUT_MS = 8 * SECOND;
export const MAX_RETRIES = 2;
/** 재시도 간 기본 대기 시간 (여기에 무작위 지연을 더한다) */
export const RETRY_BASE_DELAYS_MS = [2 * SECOND, 6 * SECOND] as const;
export const RETRY_JITTER_MS = 1 * SECOND;

/** 연속 실패 횟수에 따른 자동 갱신 간격: 0회 5분, 1회 10분, 2회 20분, 3회 이상 30분 */
export const BACKOFF_INTERVALS_MS = [5 * MINUTE, 10 * MINUTE, 20 * MINUTE, 30 * MINUTE] as const;

/** 좌표 반올림 자릿수 (약 1.1km) */
export const COORDINATE_DECIMALS = 2;

/** 이 각도 이내면 "정면"으로 안내 */
export const FACING_TOLERANCE_DEG = 5;

export const USNO_CELNAV_URL = 'https://aa.usno.navy.mil/api/celnav';
