import { describe, expect, it } from 'vitest';
import {
  DAILY_KEY,
  LAST_GOOD_KEY,
  MAX_DAILY_RECORDS,
  createStore,
  type KeyValueStorage,
} from '../../src/storage/store';
import type { SunReading } from '../../src/types';

// 메모리 기반 가짜 저장소
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: KeyValueStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: (key) => void data.delete(key),
  };
  return { storage, data };
}

function throwingStorage(): KeyValueStorage {
  const fail = () => {
    throw new DOMException('blocked', 'SecurityError');
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

// 공개 테스트 좌표 (서울시청 부근, 반올림)
function reading(overrides: Partial<SunReading> = {}): SunReading {
  return {
    position: { azimuth: 170.9, altitude: 50.5 },
    coords: { latitude: 37.57, longitude: 126.98 },
    observedAt: '2026-09-27T03:00:00.000Z',
    fetchedAt: '2026-09-27T03:00:01.000Z',
    source: 'USNO',
    ...overrides,
  };
}

function dateString(i: number): string {
  const d = new Date(Date.UTC(2025, 0, 1) + i * 86_400_000);
  return d.toISOString().slice(0, 10);
}

describe('마지막 정상값', () => {
  it('저장한 값을 그대로 다시 읽는다', () => {
    const { storage } = memoryStorage();
    const store = createStore(storage);
    expect(store.loadLastGood()).toBeNull();
    expect(store.saveLastGood(reading())).toBe(true);
    expect(store.loadLastGood()).toEqual(reading());
  });

  it('SunReading 외의 필드는 저장하지 않는다', () => {
    const { storage, data } = memoryStorage();
    const extra = { ...reading(), exactLatitude: 1.23456 } as SunReading;
    createStore(storage).saveLastGood(extra);
    expect(data.get(LAST_GOOD_KEY)).not.toContain('exactLatitude');
  });

  it('손상된 JSON이나 형식이 다른 값은 무시한다', () => {
    for (const raw of ['{not json', '42', '[]', JSON.stringify({ ...reading(), source: 'JPL' })]) {
      const { storage } = memoryStorage({ [LAST_GOOD_KEY]: raw });
      expect(createStore(storage).loadLastGood()).toBeNull();
    }
  });

  it('범위를 벗어난 값은 무시한다', () => {
    const bad = [
      reading({ position: { azimuth: 360, altitude: 10 } }),
      reading({ position: { azimuth: 10, altitude: 91 } }),
      reading({ coords: { latitude: 37.57, longitude: 181 } }),
      reading({ observedAt: 'yesterday' }),
    ];
    for (const r of bad) {
      const { storage } = memoryStorage({ [LAST_GOOD_KEY]: JSON.stringify(r) });
      expect(createStore(storage).loadLastGood()).toBeNull();
    }
  });
});

describe('KST 일별 기록', () => {
  it('날짜별 첫 정상값만 남긴다', () => {
    const { storage } = memoryStorage();
    const store = createStore(storage);
    expect(store.addDailyRecord('2026-09-27', reading())).toBe(true);
    const later = reading({ position: { azimuth: 200, altitude: 40 } });
    expect(store.addDailyRecord('2026-09-27', later)).toBe(false);
    expect(store.loadDailyRecords()).toEqual([{ kstDate: '2026-09-27', reading: reading() }]);
  });

  it('최신 날짜가 앞에 오도록 정렬한다', () => {
    const store = createStore(memoryStorage().storage);
    store.addDailyRecord('2026-09-26', reading());
    store.addDailyRecord('2026-09-28', reading());
    store.addDailyRecord('2026-09-27', reading());
    expect(store.loadDailyRecords().map((r) => r.kstDate)).toEqual([
      '2026-09-28',
      '2026-09-27',
      '2026-09-26',
    ]);
  });

  it(`최대 ${MAX_DAILY_RECORDS}개까지 보관하고 오래된 기록부터 지운다`, () => {
    const store = createStore(memoryStorage().storage);
    for (let i = 0; i < MAX_DAILY_RECORDS + 2; i++) {
      expect(store.addDailyRecord(dateString(i), reading())).toBe(true);
    }
    const records = store.loadDailyRecords();
    expect(records).toHaveLength(MAX_DAILY_RECORDS);
    expect(records[0].kstDate).toBe(dateString(MAX_DAILY_RECORDS + 1));
    expect(records.at(-1)?.kstDate).toBe(dateString(2));
  });

  it('잘못된 날짜 형식은 저장하지 않는다', () => {
    const store = createStore(memoryStorage().storage);
    expect(store.addDailyRecord('2026/09/27', reading())).toBe(false);
    expect(store.loadDailyRecords()).toEqual([]);
  });

  it('손상된 JSON은 빈 목록으로 보고, 새 기록을 저장할 수 있다', () => {
    const { storage } = memoryStorage({ [DAILY_KEY]: '[{broken' });
    const store = createStore(storage);
    expect(store.loadDailyRecords()).toEqual([]);
    expect(store.addDailyRecord('2026-09-27', reading())).toBe(true);
    expect(store.loadDailyRecords()).toHaveLength(1);
  });

  it('목록 일부가 잘못되면 그 항목만 버린다', () => {
    const raw = JSON.stringify([
      { kstDate: '2026-09-27', reading: reading() },
      { kstDate: '27-09-2026', reading: reading() },
      { kstDate: '2026-09-26', reading: { ...reading(), position: { azimuth: 'south', altitude: 1 } } },
      null,
      'text',
      { kstDate: '2026-09-25', reading: reading({ source: 'JPL' as 'USNO' }) },
      { kstDate: '2026-09-24', reading: reading() },
    ]);
    const store = createStore(memoryStorage({ [DAILY_KEY]: raw }).storage);
    expect(store.loadDailyRecords().map((r) => r.kstDate)).toEqual(['2026-09-27', '2026-09-24']);
  });

  it('배열이 아닌 값은 빈 목록으로 본다', () => {
    const store = createStore(memoryStorage({ [DAILY_KEY]: '{"a":1}' }).storage);
    expect(store.loadDailyRecords()).toEqual([]);
  });
});

describe('저장소 예외', () => {
  it('getItem, setItem, removeItem이 예외를 던져도 앱으로 전파하지 않는다', () => {
    const store = createStore(throwingStorage());
    expect(store.loadLastGood()).toBeNull();
    expect(store.saveLastGood(reading())).toBe(false);
    expect(store.loadDailyRecords()).toEqual([]);
    expect(store.addDailyRecord('2026-09-27', reading())).toBe(false);
    expect(() => store.clearAll()).not.toThrow();
    expect(store.exportRecordsJson()).toBe('[]');
  });

  it('setItem만 실패하면(용량 초과) false를 돌려준다', () => {
    const { storage } = memoryStorage();
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    const store = createStore(storage);
    expect(store.saveLastGood(reading())).toBe(false);
    expect(store.addDailyRecord('2026-09-27', reading())).toBe(false);
  });

  it('읽기에 실패하면 기존 기록을 덮어쓰지 않는다', () => {
    const existing = JSON.stringify([{ kstDate: '2026-09-26', reading: reading() }]);
    const { storage, data } = memoryStorage({ [DAILY_KEY]: existing });
    storage.getItem = () => {
      throw new Error('blocked');
    };
    expect(createStore(storage).addDailyRecord('2026-09-27', reading())).toBe(false);
    expect(data.get(DAILY_KEY)).toBe(existing);
  });
});

describe('clearAll, exportRecordsJson', () => {
  it('clearAll은 두 키를 모두 지운다', () => {
    const { storage, data } = memoryStorage();
    const store = createStore(storage);
    store.saveLastGood(reading());
    store.addDailyRecord('2026-09-27', reading());
    store.clearAll();
    expect(data.size).toBe(0);
    expect(store.loadLastGood()).toBeNull();
    expect(store.loadDailyRecords()).toEqual([]);
  });

  it('일별 기록을 보기 좋은 JSON으로 내보낸다', () => {
    const store = createStore(memoryStorage().storage);
    store.addDailyRecord('2026-09-26', reading());
    store.addDailyRecord('2026-09-27', reading());
    const json = store.exportRecordsJson();
    expect(json).toContain('\n  ');
    expect(JSON.parse(json)).toEqual([
      { kstDate: '2026-09-27', reading: reading() },
      { kstDate: '2026-09-26', reading: reading() },
    ]);
  });
});
