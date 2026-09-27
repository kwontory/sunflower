// 화면 표시용 숫자·시각 포맷.
// KST 변환은 고정 +9시간 오프셋을 쓴다. core/time.ts가 안정되면 그쪽으로 옮길 수 있다.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const KST_OFFSET_MS = 9 * HOUR;
const MINUS = '−';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 조회 후 경과 시간: "방금", "2분 전", "1시간 전", "3일 전" */
export function formatElapsed(fromIso: string, nowIso: string): string {
  const ms = Date.parse(nowIso) - Date.parse(fromIso);
  if (!Number.isFinite(ms) || ms < MINUTE) return '방금';
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}분 전`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}시간 전`;
  return `${Math.floor(ms / DAY)}일 전`;
}

/** 지금부터 target까지 남은 분 (올림, 최소 0) */
export function minutesUntil(targetIso: string, nowIso: string): number {
  const ms = Date.parse(targetIso) - Date.parse(nowIso);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.ceil(ms / MINUTE);
}

/** ISO 시각을 KST 'HH:MM'으로 */
export function formatKstTime(iso: string): string {
  const d = new Date(Date.parse(iso) + KST_OFFSET_MS);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** 'YYYY-MM-DD' → '2026-09-27 (일)' */
export function formatKstDateLabel(kstDate: string): string {
  const [y, m, d] = kstDate.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const name = WEEKDAYS[day];
  return name ? `${kstDate} (${name})` : kstDate;
}

function round1(n: number): number {
  const r = Math.round(n * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

/** 각도 소수 첫째 자리: "170.9°", "-12.3°" */
export function formatDegrees(n: number): string {
  return `${round1(n).toFixed(1)}°`;
}

/** 변화량: "+0.2°", "−0.4°"(U+2212), "0.0°" */
export function formatSignedDegrees(n: number): string {
  const r = round1(n);
  if (r > 0) return `+${r.toFixed(1)}°`;
  if (r < 0) return `${MINUS}${Math.abs(r).toFixed(1)}°`;
  return '0.0°';
}

/** 회전 각도는 정수로: "32°" */
export function formatWholeDegrees(n: number): string {
  return `${Math.round(n)}°`;
}
