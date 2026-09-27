// 화면 문구. 설계 용어 → 화면 표기 변환은 이 파일에서만 한다 (D007).
import type { FetchFailure, RequestLogEntry, SunPosition, Tab } from '../types';
import { compassPoint, type Turn } from '../core/direction';
import { formatDegrees, formatWholeDegrees } from './format';

export const TAB_LABELS: Record<Tab, string> = {
  now: '지금',
  records: '기록',
  status: '상태',
};

export const T = {
  headingOff: '방향 감지 안 됨',
  loading: '해의 위치를 확인하고 있어요',
  checking: '확인 중',
  noLocationTitle: '지금 위치를 확인할 수 없어요',
  noLocationBody: '해의 방향을 찾으려면 위치가 필요해요',
  allowLocation: '위치 허용하기',
  allowHeading: '방향 감지 허용하기',
  headingNeedsPermission: '방향 감지를 허용하면 돌아야 할 방향을 알려드려요',
  headingUnsupported: '이 기기는 향한 방향을 알 수 없어서 방위로 알려드려요',
  headingDenied: '방향 감지가 허용되지 않아서 방위로 알려드려요',
  retryLater: '잠시 후 다시 시도해 주세요',
  refresh: '새로고침',
  lastGood: '마지막으로 받은 값',
  azimuth: '해 방위각',
  altitude: '해 고도',
  source: 'USNO',
  sourceFull: 'USNO celnav',
  recordsTitle: 'KST 일별 기록',
  recordsSubtitle: '날짜별 첫 번째 값',
  recordsEmpty: '아직 기록이 없어요',
  recordsExport: '기록 내보내기 (JSON)',
  recordsNote: '기록은 이 브라우저에만 저장돼요',
  compareTitle: '날짜 비교',
  compareFrom: '기준 날짜',
  compareTo: '비교 날짜',
  compareNeedTwo: '비교하려면 기록이 두 개 이상 필요해요',
  azimuthChange: '방위각 변화',
  altitudeChange: '고도 변화',
  statusTitle: '현재 상태',
  device: '기기',
  location: '위치',
  heading: '향한 방향',
  requestLog: '요청 기록',
  requestLogEmpty: '아직 요청 기록이 없어요',
  policy: '호출 정책',
  crossCheck: 'JPL Horizons로 교차 검증 · 배포 방식 결정 후',
  fetchedAt: '조회 시각',
  nextRefresh: '다음 자동 갱신',
  nextAttempt: '다음 시도',
  untilStale: '오래된 값 표시까지',
  sourceLabel: '출처',
} as const;

export function freshPill(elapsed: string): string {
  return `실시간 · ${elapsed}`;
}
export function cachedPill(elapsed: string): string {
  return `최근 값 · ${elapsed}`;
}
export function stalePill(elapsed: string): string {
  return `오래된 값 · ${elapsed}`;
}

/** 외부 요청 실패 원인별 안내 문장 */
export function failureMessage(failure: FetchFailure): string {
  if (failure.kind === 'timeout') return '응답이 늦어지고 있어요';
  if (failure.kind === 'http' && failure.status === 429) return '요청이 너무 많아요. 잠시 기다려 주세요';
  return '불러오지 못했어요';
}

export function statusHeadline(kind: 'fresh' | 'cached' | 'stale'): string {
  if (kind === 'fresh') return '실시간으로 받아오고 있어요';
  if (kind === 'cached') return '최근에 받은 값을 보여주고 있어요';
  return '오래된 값을 보여주고 있어요';
}

export function turnHeadline(turn: Turn): string {
  if (turn.direction === 'front') return '지금 해가 정면에 있어요';
  const side = turn.direction === 'right' ? '오른쪽' : '왼쪽';
  return `${side}으로 ${formatWholeDegrees(turn.degrees)} 돌아보세요`;
}

/** 방향 센서 없이 방위로 안내: "남쪽(170.9°)을 바라보세요" */
export function facingHeadline(azimuth: number): string {
  return `${compassPoint(azimuth)}쪽(${formatDegrees(azimuth)})을 바라보세요`;
}

export function sunSub(position: SunPosition): string {
  if (position.altitude < 0) return `해가 지평선 아래에 있어요 (고도 ${formatDegrees(position.altitude)})`;
  return `해는 ${compassPoint(position.azimuth)}쪽, 지평선 위 ${formatDegrees(position.altitude)}에 있어요`;
}

export function lastGoodLabel(kstTime: string): string {
  return `${T.lastGood} (${kstTime} KST)`;
}

export function sourceLine(kstTime: string, nextMinutes: number | null): string {
  const base = `${T.source} · ${kstTime} KST 조회`;
  return nextMinutes === null ? base : `${base} · 다음 자동 갱신 ${nextMinutes}분 후`;
}

export function nextAttemptText(kstTime: string): string {
  return `다음 시도 ${kstTime} KST`;
}

export function headingActive(heading: number): string {
  return `방향 감지 중 (${formatDegrees(heading)})`;
}

export function outcomeLabel(outcome: RequestLogEntry['outcome']): string {
  if (outcome === 'success') return '성공';
  if (outcome === 'failure') return '실패';
  return '최근 값';
}

export function triggerLabel(trigger: RequestLogEntry['trigger']): string {
  if (trigger === 'auto') return '자동 갱신';
  if (trigger === 'manual') return '새로고침';
  return '처음 조회';
}

export function minutesLeft(n: number): string {
  return `${n}분 남음`;
}
export function minutesLater(n: number): string {
  return `${n}분 후`;
}
export function attemptsText(n: number): string {
  return `시도 ${n}회`;
}
