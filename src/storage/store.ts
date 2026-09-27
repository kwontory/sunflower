import type { DailyRecord, SunReading } from '../types';

// 마지막 정상값과 KST 일별 기록을 브라우저 저장소에 보관한다 (D005, D006).
// 저장소 예외나 손상된 데이터로 앱이 멈추지 않도록 모든 함수는 예외를 던지지 않는다.

export const LAST_GOOD_KEY = 'sunflower:v1:lastGood';
export const DAILY_KEY = 'sunflower:v1:daily';
export const MAX_DAILY_RECORDS = 366;

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface Store {
  loadLastGood(): SunReading | null;
  saveLastGood(reading: SunReading): boolean;
  /** 최신 날짜가 앞에 온다. */
  loadDailyRecords(): DailyRecord[];
  /** 날짜별 첫 정상값만 남긴다. 이미 있는 날짜이거나 저장에 실패하면 false. */
  addDailyRecord(kstDate: string, reading: SunReading): boolean;
  clearAll(): void;
  exportRecordsJson(): string;
}

const KST_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumberIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isIsoString(value: unknown): value is string {
  return typeof value === 'string' && ISO_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

/** 저장된 값을 SunReading으로 검증하고, 정해진 필드만 골라 새 객체로 만든다. */
function parseReading(value: unknown): SunReading | null {
  if (!isRecord(value)) return null;
  const { position, coords, observedAt, fetchedAt, source } = value;
  if (!isRecord(position) || !isRecord(coords)) return null;
  const { azimuth, altitude } = position;
  const { latitude, longitude } = coords;
  if (!isNumberIn(azimuth, 0, 360) || azimuth === 360) return null;
  if (!isNumberIn(altitude, -90, 90)) return null;
  if (!isNumberIn(latitude, -90, 90) || !isNumberIn(longitude, -180, 180)) return null;
  if (!isIsoString(observedAt) || !isIsoString(fetchedAt)) return null;
  if (source !== 'USNO') return null;
  return {
    position: { azimuth, altitude },
    coords: { latitude, longitude },
    observedAt,
    fetchedAt,
    source,
  };
}

function parseDailyRecord(value: unknown): DailyRecord | null {
  if (!isRecord(value)) return null;
  const { kstDate } = value;
  if (typeof kstDate !== 'string' || !KST_DATE_PATTERN.test(kstDate)) return null;
  const reading = parseReading(value.reading);
  return reading ? { kstDate, reading } : null;
}

function newestFirst(a: DailyRecord, b: DailyRecord): number {
  return a.kstDate < b.kstDate ? 1 : a.kstDate > b.kstDate ? -1 : 0;
}

export function createStore(storage: KeyValueStorage): Store {
  // 저장소 접근 실패는 undefined, 값 없음은 null로 구분한다.
  function readRaw(key: string): string | null | undefined {
    try {
      return storage.getItem(key);
    } catch {
      return undefined;
    }
  }

  function writeRaw(key: string, value: string): boolean {
    try {
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function parseJson(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  /** 읽기 자체가 실패하면 null. 손상되었거나 형식이 다르면 빈 목록으로 본다. */
  function readDaily(): DailyRecord[] | null {
    const raw = readRaw(DAILY_KEY);
    if (raw === undefined) return null;
    if (raw === null) return [];
    const parsed = parseJson(raw);
    if (!Array.isArray(parsed)) return [];
    const byDate = new Map<string, DailyRecord>();
    for (const item of parsed) {
      const record = parseDailyRecord(item);
      // 같은 날짜가 중복 저장돼 있으면 먼저 나온 것을 남긴다.
      if (record && !byDate.has(record.kstDate)) byDate.set(record.kstDate, record);
    }
    return [...byDate.values()].sort(newestFirst);
  }

  function loadDailyRecords(): DailyRecord[] {
    return readDaily() ?? [];
  }

  return {
    loadLastGood() {
      const raw = readRaw(LAST_GOOD_KEY);
      if (typeof raw !== 'string') return null;
      return parseReading(parseJson(raw));
    },

    saveLastGood(reading) {
      const clean = parseReading(reading);
      if (!clean) return false;
      return writeRaw(LAST_GOOD_KEY, JSON.stringify(clean));
    },

    loadDailyRecords,

    addDailyRecord(kstDate, reading) {
      if (!KST_DATE_PATTERN.test(kstDate)) return false;
      const clean = parseReading(reading);
      if (!clean) return false;
      // 읽기에 실패했을 때 덮어쓰면 기존 기록을 잃으므로 저장하지 않는다.
      const records = readDaily();
      if (records === null) return false;
      if (records.some((r) => r.kstDate === kstDate)) return false;
      const next = [...records, { kstDate, reading: clean }]
        .sort(newestFirst)
        .slice(0, MAX_DAILY_RECORDS);
      if (!next.some((r) => r.kstDate === kstDate)) return false;
      return writeRaw(DAILY_KEY, JSON.stringify(next));
    },

    clearAll() {
      for (const key of [LAST_GOOD_KEY, DAILY_KEY]) {
        try {
          storage.removeItem(key);
        } catch {
          // 지울 수 없어도 앱 동작은 계속한다.
        }
      }
    },

    exportRecordsJson() {
      return JSON.stringify(loadDailyRecords(), null, 2);
    },
  };
}
