import { describe, expect, it } from 'vitest';
import { formatKstDateLabel, formatKstTime, kstDateKey } from '../../src/core/time';

describe('kstDateKey', () => {
  it('UTC 자정을 넘기면 KST 다음 날이 된다', () => {
    expect(kstDateKey(new Date('2026-09-26T15:30:00Z'))).toBe('2026-09-27');
  });

  it('KST 자정 직전은 같은 날이다', () => {
    expect(kstDateKey(new Date('2026-09-26T14:59:59.999Z'))).toBe('2026-09-26');
    expect(kstDateKey(new Date('2026-09-26T15:00:00Z'))).toBe('2026-09-27');
  });

  it('연말을 넘긴다', () => {
    expect(kstDateKey(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01');
  });
});

describe('formatKstTime', () => {
  it('KST 24시간제 HH:MM 으로 표시한다', () => {
    expect(formatKstTime(new Date('2026-09-26T15:30:00Z'))).toBe('00:30');
    expect(formatKstTime(new Date('2026-09-27T05:07:59Z'))).toBe('14:07');
    expect(formatKstTime(new Date('2026-09-27T14:59:00Z'))).toBe('23:59');
  });
});

describe('formatKstDateLabel', () => {
  it('한국어 요일을 붙인다', () => {
    expect(formatKstDateLabel('2026-09-27')).toBe('2026-09-27 (일)');
    expect(formatKstDateLabel('2026-09-28')).toBe('2026-09-28 (월)');
    expect(formatKstDateLabel('2026-10-03')).toBe('2026-10-03 (토)');
  });

  it('형식이 맞지 않으면 그대로 돌려준다', () => {
    expect(formatKstDateLabel('not-a-date')).toBe('not-a-date');
  });
});
