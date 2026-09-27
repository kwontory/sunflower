import type {
  AppState,
  Coordinates,
  DataStatus,
  FetchFailure,
  HeadingStatus,
  RequestLogEntry,
  Result,
  SunAbsentCheck,
  SunReading,
  Tab,
} from '../types';
import type { LocationFailure } from '../sensors/location';
import type { HeadingSource } from '../sensors/heading';
import type { createStore } from '../storage/store';
import { getSunReading } from '../api/sun';
import { withRetry } from '../data/retry';
import { canManualRefresh, nextAutoRefreshAt, shouldFetchOnVisible } from '../data/schedule';
import { isCacheValid, isStale } from '../core/freshness';
import { kstDateKey } from '../core/time';

/** 화면의 경과 시간과 stale 전환을 갱신하는 주기 */
export const CLOCK_TICK_MS = 30_000;
/** 방향 값만 바뀔 때 화면을 다시 그리는 최소 간격 (초당 최대 4번) */
export const HEADING_RENDER_INTERVAL_MS = 250;
const REQUEST_LOG_LIMIT = 20;

type Store = ReturnType<typeof createStore>;
type Trigger = RequestLogEntry['trigger'];

export interface ControllerDeps {
  fetch: typeof fetch;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  setTimer: (handler: () => void, ms: number) => unknown;
  clearTimer: (id: unknown) => void;
  isVisible: () => boolean;
  store: Store;
  requestLocation: () => Promise<Result<Coordinates, LocationFailure>>;
  heading: HeadingSource;
  onState: (state: AppState) => void;
}

export interface Controller {
  start(): Promise<void>;
  refresh(): Promise<void>;
  setTab(tab: Tab): void;
  requestHeading(): Promise<void>;
  retryLocation(): Promise<void>;
  /** 네트워크가 다시 연결됐을 때 */
  handleOnline(): void;
  handleVisibilityChange(): void;
  /** 위치 권한 상태가 바뀌었을 때 (권한 창에서 허용을 누른 경우 등) */
  handleLocationPermission(state: 'granted' | 'denied' | 'prompt'): void;
  exportRecords(): string;
  getState(): AppState;
}

function sameCoords(a: Coordinates, b: Coordinates): boolean {
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

export function createController(deps: ControllerDeps): Controller {
  const nowIso = () => deps.now().toISOString();

  let coords: Coordinates | null = null;
  /** 이번 실행에서 현재 위치를 확인했는지 (임시로 쓰는 이전 좌표와 구분) */
  let confirmed = false;
  /** 이번 실행에서 마지막으로 조회를 시도한 좌표 (같은 좌표로 중복 호출하지 않기 위해) */
  let attemptedCoords: Coordinates | null = null;
  /** 마지막으로 알게 된 위치 권한 상태 */
  let lastPermission: 'granted' | 'denied' | 'prompt' | null = null;
  let lastGood: SunReading | null = deps.store.loadLastGood();
  let lastRequestAt: Date | null = null;
  /** 마지막으로 정상 응답(해 위치 또는 해 없음)을 받은 시각 */
  let lastSuccessAt: Date | null = lastGood ? new Date(lastGood.fetchedAt) : null;
  let consecutiveFailures = 0;
  let inFlight: Promise<void> | null = null;
  let refreshTimer: unknown = null;
  let clockTimer: unknown = null;

  let state: AppState = {
    tab: 'now',
    now: nowIso(),
    data: { kind: 'loading' },
    heading: { kind: 'needs-permission' },
    location: 'locating',
    locationBlocked: false,
    nextRefreshAt: null,
    records: deps.store.loadDailyRecords(),
    requestLog: [],
  };

  const publish = (patch: Partial<AppState>) => {
    state = { ...state, ...patch, now: nowIso() };
    deps.onState(state);
  };

  // 방향 값은 초당 수십 번 올 수 있으므로 모아서 반영한다. 종류가 바뀌면 바로 반영한다
  let pendingHeading: HeadingStatus | null = null;
  let headingTimer: unknown = null;
  const updateHeading = (heading: HeadingStatus) => {
    if (heading.kind !== state.heading.kind) {
      if (headingTimer !== null) deps.clearTimer(headingTimer);
      headingTimer = null;
      pendingHeading = null;
      publish({ heading });
      return;
    }
    pendingHeading = heading;
    if (headingTimer !== null) return;
    headingTimer = deps.setTimer(() => {
      headingTimer = null;
      if (pendingHeading) publish({ heading: pendingHeading });
      pendingHeading = null;
    }, HEADING_RENDER_INTERVAL_MS);
  };

  const log = (entry: Omit<RequestLogEntry, 'at'>) => {
    const next = [{ at: nowIso(), ...entry }, ...state.requestLog].slice(0, REQUEST_LOG_LIMIT);
    return next;
  };

  /** 받은 지 오래된 값은 stale로 바꾼다. 실패 상태는 그대로 둔다 */
  const withFreshness = (data: DataStatus): DataStatus => {
    if ((data.kind === 'fresh' || data.kind === 'cached') && isStale(data.reading.fetchedAt, deps.now())) {
      return { kind: 'stale', reading: data.reading };
    }
    return data;
  };

  const clearRefreshTimer = () => {
    if (refreshTimer !== null) deps.clearTimer(refreshTimer);
    refreshTimer = null;
  };

  const scheduleRefresh = (at: Date) => {
    clearRefreshTimer();
    const delay = Math.max(0, at.getTime() - deps.now().getTime());
    refreshTimer = deps.setTimer(() => {
      refreshTimer = null;
      void fetchSun('auto');
    }, delay);
    publish({ nextRefreshAt: at.toISOString() });
  };

  const startClock = () => {
    if (clockTimer !== null) return;
    const tick = () => {
      clockTimer = deps.setTimer(tick, CLOCK_TICK_MS);
      publish({ data: withFreshness(state.data) });
    };
    clockTimer = deps.setTimer(tick, CLOCK_TICK_MS);
  };

  const stopClock = () => {
    if (clockTimer !== null) deps.clearTimer(clockTimer);
    clockTimer = null;
  };

  const onSuccess = (reading: SunReading, trigger: Trigger, attempts: number) => {
    const now = deps.now();
    lastGood = reading;
    lastSuccessAt = now;
    consecutiveFailures = 0;
    deps.store.saveLastGood(reading);
    deps.store.addDailyRecord(kstDateKey(now), reading);
    publish({
      data: { kind: 'fresh', reading },
      records: deps.store.loadDailyRecords(),
      requestLog: log({ trigger, outcome: 'success', attempts }),
    });
    scheduleRefresh(nextAutoRefreshAt(now, 0));
  };

  /** 정상 응답인데 해가 지평선 아래라 Sun 항목이 없음: 실패로 세지 않고, 마지막 정상값과 기록은 그대로 둔다 */
  const onSunAbsent = (check: SunAbsentCheck, trigger: Trigger, attempts: number) => {
    const now = deps.now();
    lastSuccessAt = now;
    consecutiveFailures = 0;
    publish({
      data: { kind: 'sun-absent', checkedAt: check.fetchedAt, lastGood },
      requestLog: log({ trigger, outcome: 'sun-absent', attempts }),
    });
    scheduleRefresh(nextAutoRefreshAt(now, 0));
  };

  const onFailure = (failure: FetchFailure, trigger: Trigger, attempts: number) => {
    const now = deps.now();
    consecutiveFailures += 1;
    const next = nextAutoRefreshAt(now, consecutiveFailures, failure.retryAfterMs);
    // 실패한 데이터는 현재값으로 쓰지 않고, 마지막 정상값만 함께 보여준다
    publish({
      data: { kind: 'failed', failure, lastGood, nextAttemptAt: next.toISOString() },
      requestLog: log({ trigger, outcome: 'failure', attempts, failure }),
    });
    scheduleRefresh(next);
  };

  const fetchSun = (trigger: Trigger): Promise<void> => {
    if (inFlight) return inFlight;
    if (!coords) return Promise.resolve();
    if (trigger === 'auto' && !deps.isVisible()) {
      // 탭이 가려진 동안에는 호출하지 않는다. 돌아오면 handleVisibilityChange가 판단한다
      clearRefreshTimer();
      return Promise.resolve();
    }
    const target = coords;
    attemptedCoords = target;
    lastRequestAt = deps.now();
    inFlight = (async () => {
      try {
        const { result, attempts } = await withRetry(
          () => getSunReading(target, deps.now(), { fetch: deps.fetch, now: deps.now }),
          { sleep: deps.sleep, random: deps.random },
        );
        // 그사이 위치가 거부됐거나 다른 좌표로 바뀌었으면 이 결과는 쓰지 않는다
        if (!coords || !sameCoords(coords, target)) return;
        if (!result.ok) onFailure(result.error, trigger, attempts);
        else if (result.value.kind === 'reading') onSuccess(result.value.reading, trigger, attempts);
        else onSunAbsent(result.value.check, trigger, attempts);
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };

  // 위치 요청이 겹치지 않게 한다 (권한 변경 알림과 버튼이 동시에 올 수 있다)
  let locating: Promise<void> | null = null;
  const locateAndLoad = (trigger: Trigger): Promise<void> => {
    if (locating) return locating;
    locating = locateOnce(trigger).finally(() => {
      locating = null;
    });
    return locating;
  };

  /** 권한 창 없이 바로 거부가 돌아온 것으로 보는 시간 (브라우저가 차단한 상태) */
  const INSTANT_DENIAL_MS = 1500;

  /** 현재 좌표로 보여줄 값을 준비한다: 5분 안에 받은 같은 위치의 값이 있으면 호출하지 않는다 (D005 요청 캐시) */
  const loadForCoords = async (trigger: Trigger) => {
    // 이전 좌표로 받던 요청이 있으면 끝난 뒤 판단한다
    if (inFlight) await inFlight;
    if (!coords) return;
    if (lastGood && sameCoords(lastGood.coords, coords) && isCacheValid(lastGood.fetchedAt, deps.now())) {
      const d = state.data;
      if ((d.kind === 'fresh' || d.kind === 'cached') && sameCoords(d.reading.coords, coords)) return;
      publish({
        data: withFreshness({ kind: 'cached', reading: lastGood }),
        requestLog: log({ trigger, outcome: 'cache-hit', attempts: 0 }),
      });
      scheduleRefresh(nextAutoRefreshAt(new Date(lastGood.fetchedAt), 0));
      return;
    }
    await fetchSun(trigger);
  };

  const locateOnce = async (trigger: Trigger) => {
    const startedAt = deps.now().getTime();
    const located = await deps.requestLocation();
    if (!located.ok) {
      // 다른 요청이 먼저 현재 위치를 얻었으면 이 실패는 무시한다
      if (confirmed) return;
      // 버튼을 눌렀는데 권한 창 없이 바로 거부가 오면, 브라우저가 이 사이트를 차단한 상태다
      const blocked =
        located.error === 'denied' &&
        (state.locationBlocked || (trigger === 'manual' && deps.now().getTime() - startedAt < INSTANT_DENIAL_MS));
      if (blocked !== state.locationBlocked) publish({ locationBlocked: blocked });
      // 위치를 잠시 못 잡은 경우에만 이전 위치 기준 값을 계속 보여준다. 거부했다면 이전 좌표도 쓰지 않는다
      if (located.error === 'unavailable' && coords && state.location === 'provisional') {
        publish({ location: 'last-known' });
        return;
      }
      coords = null;
      clearRefreshTimer();
      publish({ data: { kind: 'no-location', reason: located.error }, location: 'none', nextRefreshAt: null });
      return;
    }
    confirmed = true;
    coords = located.value;
    publish({ location: 'current', locationBlocked: false });
    // 이전 좌표와 같은 곳이면 이미 조회를 시도했으므로 다시 부르지 않는다 (D004)
    if (attemptedCoords && sameCoords(attemptedCoords, coords)) {
      if (inFlight) await inFlight;
      return;
    }
    await loadForCoords(trigger);
  };

  return {
    async start() {
      deps.heading.start(updateHeading);
      publish({});
      startClock();
      // 마지막으로 받은 값이 있으면 그 반올림 좌표로 먼저 보여주고, 현재 위치는 동시에 확인한다
      if (lastGood) {
        coords = lastGood.coords;
        publish({ location: 'provisional' });
        const provisional = loadForCoords('initial');
        await Promise.all([provisional, locateAndLoad('initial')]);
        return;
      }
      await locateAndLoad('initial');
    },

    async refresh() {
      if (!coords) {
        await locateAndLoad('manual');
        return;
      }
      if (!canManualRefresh(lastRequestAt, deps.now())) {
        // 60초 안의 재요청은 호출하지 않는다. 실시간 값은 최근 값으로 보여주고,
        // 실패·해 없음 상태는 그대로 둔다 (마지막 정상값으로 덮으면 실패가 가려진다)
        const d = state.data;
        publish({
          data: withFreshness(d.kind === 'fresh' ? { kind: 'cached', reading: d.reading } : d),
          requestLog: log({ trigger: 'manual', outcome: 'cache-hit', attempts: 0 }),
        });
        return;
      }
      await fetchSun('manual');
    },

    setTab(tab) {
      publish({ tab });
    },

    async requestHeading() {
      await deps.heading.requestPermission();
    },

    async retryLocation() {
      await locateAndLoad('manual');
    },

    handleVisibilityChange() {
      if (!deps.isVisible()) {
        clearRefreshTimer();
        stopClock();
        return;
      }
      startClock();
      publish({ data: withFreshness(state.data) });
      if (!coords) {
        // 설정에서 위치 권한을 바꾸고 돌아왔을 수 있으므로 다시 시도한다
        if (state.data.kind === 'no-location') void locateAndLoad('manual');
        return;
      }
      // 이전 위치 기준으로 보여주는 중이면 현재 위치를 다시 확인한다
      if (state.location === 'last-known') void locateAndLoad('manual');
      if (shouldFetchOnVisible(lastSuccessAt, deps.now())) {
        void fetchSun('auto');
      } else if (lastSuccessAt) {
        scheduleRefresh(nextAutoRefreshAt(lastSuccessAt, consecutiveFailures));
      }
    },

    handleLocationPermission(permission) {
      // 사이트 설정에서 차단 중이면 권한 창을 띄울 수 없으므로 설정 안내를 보여준다
      const blocked = permission === 'denied';
      if (blocked !== state.locationBlocked) publish({ locationBlocked: blocked });
      // 허용으로 바뀌었거나 위치가 없는 상태에서 허용을 알게 되면 새로 요청한다.
      // 처음부터 허용된 상태를 알리는 경우에는 이미 시작한 요청이 있으므로 다시 요청하지 않는다
      const changedToGranted = permission === 'granted' && lastPermission !== null && lastPermission !== 'granted';
      lastPermission = permission;
      if (confirmed || permission !== 'granted') return;
      if (changedToGranted || state.data.kind === 'no-location') void locateOnce('initial');
    },

    handleOnline() {
      if (!coords) {
        if (state.data.kind === 'no-location') void locateAndLoad('manual');
        return;
      }
      // 실패했거나 받아 둔 값만 있는 상태면 바로 다시 조회한다
      if (state.data.kind !== 'fresh') void fetchSun('auto');
    },

    exportRecords() {
      return deps.store.exportRecordsJson();
    },

    getState() {
      return state;
    },
  };
}
