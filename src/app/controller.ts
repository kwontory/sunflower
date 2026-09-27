import type {
  AppState,
  Coordinates,
  DataStatus,
  FetchFailure,
  HeadingStatus,
  RequestLogEntry,
  Result,
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
  let lastGood: SunReading | null = deps.store.loadLastGood();
  let lastRequestAt: Date | null = null;
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
    lastRequestAt = deps.now();
    inFlight = (async () => {
      try {
        const { result, attempts } = await withRetry(
          () => getSunReading(target, deps.now(), { fetch: deps.fetch, now: deps.now }),
          { sleep: deps.sleep, random: deps.random },
        );
        if (result.ok) onSuccess(result.value, trigger, attempts);
        else onFailure(result.error, trigger, attempts);
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

  const locateOnce = async (trigger: Trigger) => {
    const located = await deps.requestLocation();
    if (!located.ok) {
      coords = null;
      clearRefreshTimer();
      publish({ data: { kind: 'no-location', reason: located.error }, nextRefreshAt: null });
      return;
    }
    coords = located.value;

    // 같은 위치에서 5분 안에 받은 값이 있으면 호출하지 않는다 (D005 요청 캐시)
    if (lastGood && sameCoords(lastGood.coords, coords) && isCacheValid(lastGood.fetchedAt, deps.now())) {
      publish({
        data: { kind: 'cached', reading: lastGood },
        requestLog: log({ trigger, outcome: 'cache-hit', attempts: 0 }),
      });
      scheduleRefresh(nextAutoRefreshAt(new Date(lastGood.fetchedAt), 0));
      return;
    }
    await fetchSun(trigger);
  };

  return {
    async start() {
      deps.heading.start(updateHeading);
      publish({});
      startClock();
      await locateAndLoad('initial');
    },

    async refresh() {
      if (!coords) {
        await locateAndLoad('manual');
        return;
      }
      if (!canManualRefresh(lastRequestAt, deps.now())) {
        // 60초 안의 재요청은 호출하지 않고 받아 둔 값을 보여준다
        publish({
          data: lastGood ? withFreshness({ kind: 'cached', reading: lastGood }) : state.data,
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
      if (shouldFetchOnVisible(lastSuccessAt, deps.now())) {
        void fetchSun('auto');
      } else if (lastSuccessAt) {
        scheduleRefresh(nextAutoRefreshAt(lastSuccessAt, consecutiveFailures));
      }
    },

    handleLocationPermission(permission) {
      if (permission === 'granted' && !coords) void locateAndLoad('initial');
    },

    exportRecords() {
      return deps.store.exportRecordsJson();
    },

    getState() {
      return state;
    },
  };
}
