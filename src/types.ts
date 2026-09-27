// 모듈 간 공유 타입. 각 모듈은 이 계약을 기준으로 구현한다.
// 용어는 설계 용어를 쓴다 (D007). 화면 문구 변환은 UI 모듈에서만 한다.

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/** 소수 둘째 자리로 반올림된 좌표 (D005). 정확한 GPS 좌표는 이 타입에 담지 않는다. */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** 태양 위치. 단위는 도(degree). */
export interface SunPosition {
  /** 북쪽 기준 시계 방향 방위각, 0 이상 360 미만 */
  azimuth: number;
  /** 지평선 기준 고도, -90 이상 90 이하 */
  altitude: number;
}

/** 검증을 통과한 외부 API 조회 결과 하나 */
export interface SunReading {
  position: SunPosition;
  coords: Coordinates;
  /** API에 요청한 관측 시각 (ISO 8601, UTC) */
  observedAt: string;
  /** 응답을 받은 시각 (ISO 8601, UTC) */
  fetchedAt: string;
  source: 'USNO';
}

/** 외부 API 실패 종류. 과제 4 실패 5종과의 최종 대응은 구현 단계에서 확정한다 (D007). */
export type FetchFailureKind =
  | 'timeout'
  | 'network'
  | 'http'
  | 'invalid-response'
  | 'invalid-data';

export interface FetchFailure {
  kind: FetchFailureKind;
  /** kind === 'http' 일 때 HTTP 상태 코드 */
  status?: number;
  /** 응답의 Retry-After 헤더를 밀리초로 변환한 값 */
  retryAfterMs?: number;
  /** 개발자용 설명 (화면에 그대로 노출하지 않는다) */
  message: string;
}

/** 일별 기록: KST 날짜마다 첫 번째 정상값 하나 (D005) */
export interface DailyRecord {
  /** KST 기준 날짜 'YYYY-MM-DD' */
  kstDate: string;
  reading: SunReading;
}

/** 기기가 향한 방향 상태 */
export type HeadingStatus =
  | { kind: 'available'; /** 북쪽 기준 시계 방향, 0 이상 360 미만 */ heading: number }
  | { kind: 'needs-permission' }
  | { kind: 'unavailable'; reason: 'unsupported' | 'denied' };

/** 태양 데이터 상태 (설계 용어) */
export type DataStatus =
  | { kind: 'loading' }
  | { kind: 'fresh'; reading: SunReading }
  | { kind: 'cached'; reading: SunReading }
  | { kind: 'stale'; reading: SunReading }
  | { kind: 'failed'; failure: FetchFailure; lastGood: SunReading | null; nextAttemptAt: string | null }
  | { kind: 'no-location'; reason: 'denied' | 'unavailable' };

/** 요청 기록 한 줄 (상태 탭 표시용) */
export interface RequestLogEntry {
  at: string;
  trigger: 'auto' | 'manual' | 'initial';
  outcome: 'success' | 'failure' | 'cache-hit';
  attempts: number;
  failure?: FetchFailure;
}

export type Tab = 'now' | 'records' | 'status';

/**
 * 조회에 쓰는 위치의 상태.
 * - locating: 위치를 확인하는 중 (아직 쓸 좌표 없음)
 * - current: 이번에 확인한 현재 위치
 * - provisional: 현재 위치를 확인하는 동안 마지막으로 받은 값의 반올림 좌표를 임시로 사용
 * - last-known: 현재 위치를 확인하지 못해 마지막으로 받은 값의 반올림 좌표를 계속 사용
 * - none: 쓸 수 있는 위치 없음
 */
export type LocationStatus = 'locating' | 'current' | 'provisional' | 'last-known' | 'none';

/** 화면이 그리는 전체 상태 */
export interface AppState {
  tab: Tab;
  /** 화면 기준 현재 시각 (ISO). 경과 시간 계산에 쓴다. */
  now: string;
  data: DataStatus;
  heading: HeadingStatus;
  location: LocationStatus;
  /** 브라우저가 이 사이트의 위치 권한을 막고 있어 권한 창을 다시 띄울 수 없는 상태 */
  locationBlocked: boolean;
  /** 다음 자동 갱신 예정 시각 (ISO) */
  nextRefreshAt: string | null;
  records: DailyRecord[];
  requestLog: RequestLogEntry[];
}
