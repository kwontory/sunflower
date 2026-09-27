import { describe, expect, it, vi } from 'vitest';
import type { AppState, Coordinates, HeadingStatus, Result, SunReading } from '../../src/types';
import type { LocationFailure } from '../../src/sensors/location';
import type { HeadingSource } from '../../src/sensors/heading';
import { HEADING_RENDER_INTERVAL_MS, createController } from '../../src/app/controller';
import { createStore } from '../../src/storage/store';
import { SEOUL_CITY_HALL, celnavBody, jsonResponse } from '../api/fixtures';

const MINUTE = 60_000;
const START = new Date('2026-09-27T03:00:00.000Z'); // 12:00 KST

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

function reading(fetchedAt: Date, coords: Coordinates = SEOUL_CITY_HALL): SunReading {
  return {
    position: { azimuth: 170.7, altitude: 50.8 },
    coords,
    observedAt: fetchedAt.toISOString(),
    fetchedAt: fetchedAt.toISOString(),
    source: 'USNO',
  };
}

function setup(options: {
  fetch?: typeof fetch;
  location?: Result<Coordinates, LocationFailure>;
  locate?: () => Promise<Result<Coordinates, LocationFailure>>;
  reloadForLocationPrompt?: () => boolean;
  lastGood?: SunReading;
  visible?: boolean;
} = {}) {
  let now = START.getTime();
  const timers: Array<{ at: number; handler: () => void; id: number; done: boolean }> = [];
  let nextId = 1;
  const storage = memoryStorage();
  const store = createStore(storage);
  if (options.lastGood) store.saveLastGood(options.lastGood);

  const fetchMock = vi.fn(options.fetch ?? (async () => jsonResponse(celnavBody())));
  const states: AppState[] = [];
  let visible = options.visible ?? true;
  let headingCallback: ((s: HeadingStatus) => void) | null = null;
  const heading: HeadingSource = {
    start: (cb) => {
      headingCallback = cb;
    },
    requestPermission: async () => {},
    stop: () => {},
  };

  const controller = createController({
    fetch: fetchMock as unknown as typeof fetch,
    now: () => new Date(now),
    sleep: async (ms) => {
      now += ms;
    },
    random: () => 0,
    setTimer: (handler, ms) => {
      const t = { at: now + ms, handler, id: nextId++, done: false };
      timers.push(t);
      return t.id;
    },
    clearTimer: (id) => {
      const t = timers.find((x) => x.id === id);
      if (t) t.done = true;
    },
    isVisible: () => visible,
    store,
    requestLocation: options.locate ?? (async () => options.location ?? { ok: true, value: SEOUL_CITY_HALL }),
    heading,
    onState: (s) => states.push(s),
    reloadForLocationPrompt: options.reloadForLocationPrompt,
  });

  /** 시계를 ms만큼 진행하며 그 사이 예약된 타이머를 순서대로 실행한다 */
  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = timers.filter((t) => !t.done && t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      now = Math.max(now, due.at);
      due.done = true;
      due.handler();
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    }
    now = end;
  };

  return {
    controller,
    fetchMock,
    store,
    states,
    advance,
    setVisible: (v: boolean) => {
      visible = v;
    },
    emitHeading: (s: HeadingStatus) => headingCallback?.(s),
    last: () => states[states.length - 1],
  };
}

describe('controller', () => {
  it('처음 시작하면 위치를 얻고 USNO에서 받아 실시간 상태로 보여준다', async () => {
    const t = setup();
    await t.controller.start();

    expect(t.fetchMock).toHaveBeenCalledTimes(1);
    const url = String(t.fetchMock.mock.calls[0][0]);
    expect(url).toContain('coords=37.57,126.98');

    const state = t.last();
    expect(state.data.kind).toBe('fresh');
    if (state.data.kind === 'fresh') expect(state.data.reading.position.azimuth).toBeCloseTo(170.868399);
    expect(state.nextRefreshAt).toBe(new Date(START.getTime() + 5 * MINUTE).toISOString());
    expect(state.requestLog[0]).toMatchObject({ trigger: 'initial', outcome: 'success', attempts: 1 });
    expect(t.store.loadLastGood()).not.toBeNull();
    expect(t.store.loadDailyRecords().map((r) => r.kstDate)).toEqual(['2026-09-27']);
  });

  it('위치를 얻지 못하면 호출하지 않고 no-location 상태가 된다', async () => {
    const t = setup({ location: { ok: false, error: 'denied' } });
    await t.controller.start();
    expect(t.fetchMock).not.toHaveBeenCalled();
    expect(t.last().data).toEqual({ kind: 'no-location', reason: 'denied' });
  });

  it('실패하면 재시도 후 실패 상태가 되고, 마지막 정상값을 현재값으로 쓰지 않는다', async () => {
    const lastGood = reading(new Date(START.getTime() - 60 * MINUTE));
    const t = setup({ lastGood, fetch: async () => new Response('down', { status: 503 }) });
    await t.controller.start();

    expect(t.fetchMock).toHaveBeenCalledTimes(3);
    const state = t.last();
    expect(state.data.kind).toBe('failed');
    if (state.data.kind === 'failed') {
      expect(state.data.failure).toMatchObject({ kind: 'http', status: 503 });
      expect(state.data.lastGood?.fetchedAt).toBe(lastGood.fetchedAt);
    }
    expect(state.requestLog[0]).toMatchObject({ outcome: 'failure', attempts: 3 });
    // 연속 실패 1회 → 10분 뒤 자동 시도
    const failedAt = new Date(state.now).getTime();
    expect(new Date(state.nextRefreshAt!).getTime() - failedAt).toBe(10 * MINUTE);
    // 실패해도 저장된 정상값은 그대로다
    expect(t.store.loadLastGood()?.fetchedAt).toBe(lastGood.fetchedAt);
  });

  it('검증에 실패한 응답은 재시도하지 않고 실패로 처리한다', async () => {
    const t = setup({ fetch: async () => jsonResponse(celnavBody({ zn: 999, hc: 50 })) });
    await t.controller.start();
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
    const data = t.last().data;
    expect(data.kind === 'failed' && data.failure.kind).toBe('invalid-data');
  });

  it('같은 위치에서 5분 안에 받은 값이 있으면 호출하지 않고 최근 값으로 보여준다', async () => {
    const t = setup({ lastGood: reading(new Date(START.getTime() - 2 * MINUTE)) });
    await t.controller.start();
    expect(t.fetchMock).not.toHaveBeenCalled();
    expect(t.last().data.kind).toBe('cached');
    expect(t.last().requestLog[0]).toMatchObject({ outcome: 'cache-hit' });
  });

  it('다른 위치의 저장값은 캐시로 쓰지 않는다', async () => {
    const elsewhere = reading(new Date(START.getTime() - 2 * MINUTE), { latitude: -33.86, longitude: 151.21 });
    const t = setup({ lastGood: elsewhere });
    await t.controller.start();
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('60초 안에 다시 새로고침하면 호출하지 않는다', async () => {
    const t = setup();
    await t.controller.start();
    await t.advance(30_000);
    await t.controller.refresh();
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
    expect(t.last().data.kind).toBe('cached');
    expect(t.last().requestLog[0]).toMatchObject({ trigger: 'manual', outcome: 'cache-hit' });

    await t.advance(31_000);
    await t.controller.refresh();
    expect(t.fetchMock).toHaveBeenCalledTimes(2);
    expect(t.last().data.kind).toBe('fresh');
  });

  it('5분마다 자동으로 갱신한다', async () => {
    const t = setup();
    await t.controller.start();
    await t.advance(5 * MINUTE);
    expect(t.fetchMock).toHaveBeenCalledTimes(2);
    expect(t.last().requestLog[0]).toMatchObject({ trigger: 'auto', outcome: 'success' });
  });

  it('탭이 가려져 있으면 자동 갱신을 하지 않고, 돌아왔을 때 5분이 지났으면 호출한다', async () => {
    const t = setup();
    await t.controller.start();
    t.setVisible(false);
    t.controller.handleVisibilityChange();
    await t.advance(20 * MINUTE);
    expect(t.fetchMock).toHaveBeenCalledTimes(1);

    t.setVisible(true);
    t.controller.handleVisibilityChange();
    await t.advance(0);
    expect(t.fetchMock).toHaveBeenCalledTimes(2);
  });

  it('cached 상태로 15분이 지나면 stale이 된다', async () => {
    const t = setup({ lastGood: reading(new Date(START.getTime() - 4 * MINUTE)) });
    t.setVisible(true);
    await t.controller.start();
    expect(t.last().data.kind).toBe('cached');
    // 자동 갱신이 오기 전 탭을 가렸다가 16분 뒤 시계만 확인
    t.setVisible(false);
    t.controller.handleVisibilityChange();
    await t.advance(16 * MINUTE);
    t.setVisible(true);
    // 가시성 복귀 직후 첫 상태 발행에서 stale로 표시되어야 한다
    const before = t.states.length;
    t.controller.handleVisibilityChange();
    expect(t.states.slice(before).some((s) => s.data.kind === 'stale')).toBe(true);
  });

  it('방향 감지 종류가 바뀌면 바로 반영한다', async () => {
    const t = setup();
    await t.controller.start();
    t.emitHeading({ kind: 'available', heading: 138.9 });
    expect(t.last().heading).toEqual({ kind: 'available', heading: 138.9 });
    t.emitHeading({ kind: 'unavailable', reason: 'denied' });
    expect(t.last().heading).toEqual({ kind: 'unavailable', reason: 'denied' });
  });

  it('방향 값만 연달아 바뀌면 250ms에 한 번만 화면을 갱신한다 (T12)', async () => {
    const t = setup();
    await t.controller.start();
    t.emitHeading({ kind: 'available', heading: 100 });
    const before = t.states.length;
    for (let i = 1; i <= 10; i += 1) t.emitHeading({ kind: 'available', heading: 100 + i * 2 });
    expect(t.states.length).toBe(before);

    await t.advance(HEADING_RENDER_INTERVAL_MS);
    expect(t.states.length).toBe(before + 1);
    expect(t.last().heading).toEqual({ kind: 'available', heading: 120 });
  });

  it('권한 창을 기다리다 위치 요청이 실패해도, 허용되는 순간 다시 시도한다', async () => {
    const results: Array<Result<Coordinates, LocationFailure>> = [
      { ok: false, error: 'unavailable' }, // 권한 창을 기다리다 시간 초과
      { ok: true, value: SEOUL_CITY_HALL },
    ];
    const locate = vi.fn(async () => results.shift()!);
    const t = setup({ locate });
    await t.controller.start();
    expect(t.last().data.kind).toBe('no-location');

    t.controller.handleLocationPermission('granted');
    await vi.waitFor(() => expect(t.last().data.kind).toBe('fresh'));
    expect(locate).toHaveBeenCalledTimes(2);
  });

  it('이미 위치가 있으면 권한 변경 알림으로 다시 요청하지 않는다', async () => {
    const locate = vi.fn(async (): Promise<Result<Coordinates, LocationFailure>> => ({ ok: true, value: SEOUL_CITY_HALL }));
    const t = setup({ locate });
    await t.controller.start();
    t.controller.handleLocationPermission('granted');
    await t.advance(0);
    expect(locate).toHaveBeenCalledTimes(1);
  });

  it('위치가 없는 상태에서 앱으로 돌아오면 위치를 다시 요청한다', async () => {
    const results: Array<Result<Coordinates, LocationFailure>> = [
      { ok: false, error: 'denied' },
      { ok: true, value: SEOUL_CITY_HALL },
    ];
    const locate = vi.fn(async () => results.shift()!);
    const t = setup({ locate });
    await t.controller.start();
    t.setVisible(false);
    t.controller.handleVisibilityChange();
    t.setVisible(true);
    t.controller.handleVisibilityChange();
    await vi.waitFor(() => expect(t.last().data.kind).toBe('fresh'));
    expect(locate).toHaveBeenCalledTimes(2);
  });

  it('느린 위치 요청 중에 권한 허용 알림이 오면 새로 요청하고, 먼저 얻은 결과를 쓴다', async () => {
    const pending: Array<(v: Result<Coordinates, LocationFailure>) => void> = [];
    const locate = vi.fn(() => new Promise<Result<Coordinates, LocationFailure>>((r) => pending.push(r)));
    const t = setup({ locate });
    const started = t.controller.start();
    await Promise.resolve();
    t.controller.handleLocationPermission('granted');
    expect(locate).toHaveBeenCalledTimes(2);

    pending[1]({ ok: true, value: SEOUL_CITY_HALL }); // 허용 뒤 요청이 먼저 성공
    await vi.waitFor(() => expect(t.last().data.kind).toBe('fresh'));
    pending[0]({ ok: false, error: 'unavailable' }); // 처음 요청은 나중에 시간 초과
    await started;
    expect(t.last().data.kind).toBe('fresh');
  });

  it('버튼을 여러 번 눌러도 위치 요청은 겹치지 않는다', async () => {
    let release: (v: Result<Coordinates, LocationFailure>) => void = () => {};
    const locate = vi.fn(() => new Promise<Result<Coordinates, LocationFailure>>((r) => (release = r)));
    const t = setup({ locate });
    const started = t.controller.start();
    await Promise.resolve();
    void t.controller.retryLocation();
    void t.controller.retryLocation();
    expect(locate).toHaveBeenCalledTimes(1);
    release({ ok: true, value: SEOUL_CITY_HALL });
    await started;
  });

  it('위치 허용하기를 눌렀는데 권한 창 없이 바로 거부되면 페이지를 다시 읽어 권한 창을 띄운다', async () => {
    const reload = vi.fn(() => true);
    const t = setup({ location: { ok: false, error: 'denied' }, reloadForLocationPrompt: reload });
    await t.controller.start();
    expect(reload).not.toHaveBeenCalled(); // 처음 시작할 때는 다시 읽지 않는다
    await t.controller.retryLocation();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('다시 읽기를 할 수 없으면 위치 없음 상태를 유지한다', async () => {
    const t = setup({ location: { ok: false, error: 'denied' }, reloadForLocationPrompt: () => false });
    await t.controller.start();
    await t.controller.retryLocation();
    expect(t.last().data).toEqual({ kind: 'no-location', reason: 'denied' });
  });

  it('네트워크가 돌아오면 실패 상태에서 바로 다시 조회한다', async () => {
    let online = false;
    const t = setup({
      fetch: async () => (online ? jsonResponse(celnavBody()) : Promise.reject(new TypeError('Failed to fetch'))),
    });
    await t.controller.start();
    expect(t.last().data.kind).toBe('failed');
    online = true;
    t.controller.handleOnline();
    await vi.waitFor(() => expect(t.last().data.kind).toBe('fresh'));
  });

  it('이미 실시간 값이면 네트워크가 돌아와도 다시 조회하지 않는다', async () => {
    const t = setup();
    await t.controller.start();
    t.controller.handleOnline();
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
  });

  describe('이전 위치로 먼저 보여주기 (T22 A)', () => {
    const SYDNEY = { latitude: -33.86, longitude: 151.21 }; // 공개 장소 (시드니 오페라하우스 부근)

    it('저장된 값이 없으면 위치 확인 중으로 시작한다', async () => {
      const t = setup();
      const started = t.controller.start();
      expect(t.states[0].location).toBe('locating');
      await started;
      expect(t.last().location).toBe('current');
    });

    it('이전 좌표로 먼저 조회하고, 현재 위치가 같으면 다시 부르지 않는다', async () => {
      let release: (v: Result<Coordinates, LocationFailure>) => void = () => {};
      const locate = vi.fn(() => new Promise<Result<Coordinates, LocationFailure>>((r) => (release = r)));
      const t = setup({ locate, lastGood: reading(new Date(START.getTime() - 120 * MINUTE)) });
      const started = t.controller.start();
      await vi.waitFor(() => expect(t.last().data.kind).toBe('fresh'));
      expect(t.last().location).toBe('provisional'); // 위치 확인 전인데 이미 값이 보인다
      release({ ok: true, value: SEOUL_CITY_HALL });
      await started;
      expect(t.fetchMock).toHaveBeenCalledTimes(1);
      expect(t.last().location).toBe('current');
    });

    it('현재 위치가 다르면 새 좌표로 다시 조회한다', async () => {
      const t = setup({ lastGood: reading(new Date(START.getTime() - 120 * MINUTE), SYDNEY) });
      await t.controller.start();
      await vi.waitFor(() => expect(t.fetchMock).toHaveBeenCalledTimes(2));
      expect(String(t.fetchMock.mock.calls[0][0])).toContain('coords=-33.86,151.21');
      expect(String(t.fetchMock.mock.calls[1][0])).toContain('coords=37.57,126.98');
      await vi.waitFor(() => {
        const d = t.last().data;
        expect(d.kind === 'fresh' && d.reading.coords).toEqual(SEOUL_CITY_HALL);
      });
    });

    it('위치 권한을 거부하면 이전 좌표도 쓰지 않는다', async () => {
      const t = setup({ location: { ok: false, error: 'denied' }, lastGood: reading(new Date(START.getTime() - 120 * MINUTE)) });
      await t.controller.start();
      expect(t.last().data).toEqual({ kind: 'no-location', reason: 'denied' });
      expect(t.last().location).toBe('none');
    });

    it('위치를 잠시 못 잡으면 이전 위치 기준 값을 계속 보여주고 그 사실을 표시한다', async () => {
      const t = setup({ location: { ok: false, error: 'unavailable' }, lastGood: reading(new Date(START.getTime() - 120 * MINUTE)) });
      await t.controller.start();
      expect(t.last().data.kind).toBe('fresh');
      expect(t.last().location).toBe('last-known');
    });
  });

  it('탭 전환', async () => {
    const t = setup();
    await t.controller.start();
    t.controller.setTab('records');
    expect(t.last().tab).toBe('records');
  });
});
