import type { AppState, DailyRecord, SunReading } from '../../src/types';
import type { UiHandlers } from '../../src/ui/render';
import { vi } from 'vitest';

// 테스트용 공개 좌표 (서울 도심, 소수 둘째 자리)
export const NOW = '2026-09-27T03:02:00.000Z'; // 12:02 KST

export function reading(overrides: Partial<SunReading> = {}, pos = { azimuth: 170.9, altitude: 50.5 }): SunReading {
  return {
    position: pos,
    coords: { latitude: 37.57, longitude: 126.98 },
    observedAt: '2026-09-27T03:00:00.000Z',
    fetchedAt: '2026-09-27T03:00:00.000Z', // 12:00 KST, 2분 전
    source: 'USNO',
    ...overrides,
  };
}

export function state(overrides: Partial<AppState> = {}): AppState {
  return {
    tab: 'now',
    now: NOW,
    data: { kind: 'fresh', reading: reading() },
    heading: { kind: 'available', heading: 138.9 },
    location: 'current',
    nextRefreshAt: '2026-09-27T03:05:00.000Z',
    records: [],
    requestLog: [],
    ...overrides,
  };
}

export function record(kstDate: string, azimuth: number, altitude: number): DailyRecord {
  return {
    kstDate,
    reading: reading({ fetchedAt: `${kstDate}T03:00:00.000Z`, observedAt: `${kstDate}T03:00:00.000Z` }, { azimuth, altitude }),
  };
}

export function handlers() {
  return {
    onTabChange: vi.fn<UiHandlers['onTabChange']>(),
    onRefresh: vi.fn<UiHandlers['onRefresh']>(),
    onRequestHeading: vi.fn<UiHandlers['onRequestHeading']>(),
    onRequestLocation: vi.fn<UiHandlers['onRequestLocation']>(),
    onExportRecords: vi.fn<UiHandlers['onExportRecords']>(),
  } satisfies UiHandlers;
}

export function buttonByText(root: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
}
