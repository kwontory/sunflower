// Asia/Seoul 은 UTC+9 고정이고 서머타임이 없으므로 Intl 대신 고정 오프셋으로 계산한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** UTC 필드를 읽으면 KST 값이 나오도록 9시간 민 Date */
function toKstShifted(date: Date): Date {
  return new Date(date.getTime() + KST_OFFSET_MS);
}

/** KST 기준 날짜 키 'YYYY-MM-DD' */
export function kstDateKey(date: Date): string {
  const k = toKstShifted(date);
  return `${k.getUTCFullYear()}-${pad2(k.getUTCMonth() + 1)}-${pad2(k.getUTCDate())}`;
}

/** KST 기준 24시간제 'HH:MM' */
export function formatKstTime(date: Date): string {
  const k = toKstShifted(date);
  return `${pad2(k.getUTCHours())}:${pad2(k.getUTCMinutes())}`;
}

/** 'YYYY-MM-DD' → 'YYYY-MM-DD (요일)'. 형식이 맞지 않으면 입력을 그대로 돌려준다. */
export function formatKstDateLabel(kstDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(kstDate);
  if (!m) return kstDate;
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(day.getTime())) return kstDate;
  return `${kstDate} (${WEEKDAYS_KO[day.getUTCDay()]})`;
}
