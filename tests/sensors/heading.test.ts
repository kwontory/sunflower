import { describe, expect, it, vi } from 'vitest';
import type { HeadingStatus } from '../../src/types';
import {
  HEADING_DETECT_TIMEOUT_MS,
  HEADING_MIN_CHANGE_DEG,
  HEADING_SMOOTHING,
  createHeadingSource,
  readCompassHeading,
  smoothHeading,
  type HeadingEnvironment,
} from '../../src/sensors/heading';

type Listener = Parameters<HeadingEnvironment['addEventListener']>[1];

function fakeEnv(options: { requestPermission?: () => Promise<'granted' | 'denied' | 'default'>; hasEvent?: boolean; angle?: number } = {}) {
  const listeners = new Map<string, Set<Listener>>();
  const timers: Array<{ handler: () => void; ms: number; cleared: boolean }> = [];
  const env: HeadingEnvironment = {
    addEventListener: (type, l) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(l);
    },
    removeEventListener: (type, l) => listeners.get(type)?.delete(l),
    DeviceOrientationEvent:
      options.hasEvent === false ? undefined : { requestPermission: options.requestPermission },
    screenAngle: () => options.angle ?? 0,
    setTimeout: (handler, ms) => {
      const t = { handler, ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearTimeout: (id) => {
      (id as { cleared: boolean }).cleared = true;
    },
  };
  const dispatch = (type: string, event: Parameters<Listener>[0]) => listeners.get(type)?.forEach((l) => l(event));
  const fireTimers = () => timers.filter((t) => !t.cleared).forEach((t) => t.handler());
  return { env, dispatch, fireTimers, listeners };
}

describe('readCompassHeading', () => {
  it('iOS webkitCompassHeading을 그대로 쓴다', () => {
    expect(readCompassHeading({ alpha: 10, webkitCompassHeading: 138.9 }, 0)).toBeCloseTo(138.9);
  });

  it('절대 alpha는 반시계 방향이므로 뒤집는다', () => {
    expect(readCompassHeading({ alpha: 90, absolute: true }, 0)).toBe(270);
  });

  it('절대 방위가 아닌 alpha는 쓰지 않는다', () => {
    expect(readCompassHeading({ alpha: 90, absolute: false }, 0)).toBeNull();
    expect(readCompassHeading({ alpha: null, absolute: true }, 0)).toBeNull();
  });

  it('가로 화면 회전 각도를 더한다', () => {
    expect(readCompassHeading({ alpha: 0, webkitCompassHeading: 300 }, 90)).toBe(30);
  });
});

describe('smoothHeading', () => {
  it('359°와 1° 사이를 0° 근처로 보간한다', () => {
    const v = smoothHeading(359, 1, 0.5);
    expect(v === 0 || v > 359.9 || v < 0.1).toBe(true);
  });

  it('첫 값은 그대로 쓴다', () => {
    expect(smoothHeading(null, 42)).toBe(42);
  });
});

describe('createHeadingSource', () => {
  it('DeviceOrientationEvent가 없으면 지원하지 않음으로 알린다', () => {
    const { env } = fakeEnv({ hasEvent: false });
    const onChange = vi.fn();
    createHeadingSource(env).start(onChange);
    expect(onChange).toHaveBeenCalledWith({ kind: 'unavailable', reason: 'unsupported' });
  });

  it('iOS처럼 권한 요청이 필요하면 needs-permission을 알리고, 허용 후 방향을 받는다', async () => {
    const { env, dispatch } = fakeEnv({ requestPermission: async () => 'granted' });
    const statuses: HeadingStatus[] = [];
    const source = createHeadingSource(env);
    source.start((s) => statuses.push(s));
    expect(statuses).toEqual([{ kind: 'needs-permission' }]);

    await source.requestPermission();
    dispatch('deviceorientation', { alpha: 0, webkitCompassHeading: 138.9 });
    expect(statuses.at(-1)).toEqual({ kind: 'available', heading: 138.9 });
  });

  it('권한을 거부하면 denied로 알린다', async () => {
    const { env } = fakeEnv({ requestPermission: async () => 'denied' });
    const statuses: HeadingStatus[] = [];
    const source = createHeadingSource(env);
    source.start((s) => statuses.push(s));
    await source.requestPermission();
    expect(statuses.at(-1)).toEqual({ kind: 'unavailable', reason: 'denied' });
  });

  it('시간 안에 방향 값이 없으면 지원하지 않음으로 알린다 (데스크톱)', () => {
    const { env, fireTimers, dispatch } = fakeEnv();
    const onChange = vi.fn();
    createHeadingSource(env).start(onChange);
    dispatch('deviceorientation', { alpha: null });
    fireTimers();
    expect(onChange).toHaveBeenCalledWith({ kind: 'unavailable', reason: 'unsupported' });
    expect(HEADING_DETECT_TIMEOUT_MS).toBe(3000);
  });

  it('1° 미만 변화는 알리지 않는다', () => {
    const { env, dispatch } = fakeEnv();
    const onChange = vi.fn();
    createHeadingSource(env).start(onChange);
    dispatch('deviceorientationabsolute', { alpha: 360 - 100, absolute: true });
    dispatch('deviceorientationabsolute', { alpha: 360 - 100.5, absolute: true });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('같은 방향이 계속 오면 그 값으로 수렴한다', () => {
    const { env, dispatch } = fakeEnv();
    const statuses: HeadingStatus[] = [];
    createHeadingSource(env).start((s) => statuses.push(s));
    dispatch('deviceorientation', { alpha: 0, webkitCompassHeading: 100 });
    for (let i = 0; i < 60; i++) dispatch('deviceorientation', { alpha: 0, webkitCompassHeading: 130 });
    const last = statuses.at(-1) as Extract<HeadingStatus, { kind: 'available' }>;
    expect(Math.abs(last.heading - 130)).toBeLessThan(HEADING_MIN_CHANGE_DEG + 0.1);
    // 한 번에 건너뛰지 않고 여러 단계로 따라간다
    expect(statuses.length).toBeGreaterThan(3);
  });

  it('작은 흔들림은 걸러서 거의 움직이지 않는다', () => {
    const { env, dispatch } = fakeEnv();
    const statuses: HeadingStatus[] = [];
    createHeadingSource(env).start((s) => statuses.push(s));
    for (let i = 0; i < 40; i++) dispatch('deviceorientation', { alpha: 0, webkitCompassHeading: i % 2 ? 103 : 97 });
    const values = statuses.map((s) => (s as { heading: number }).heading);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(3);
  });

  it('한 번 튀는 값은 버리고, 계속 오면 따라간다', () => {
    const { env, dispatch } = fakeEnv();
    const statuses: HeadingStatus[] = [];
    createHeadingSource(env).start((s) => statuses.push(s));
    dispatch('deviceorientation', { alpha: 0, webkitCompassHeading: 100 });
    dispatch('deviceorientation', { alpha: 0, webkitCompassHeading: 280 });
    dispatch('deviceorientation', { alpha: 0, webkitCompassHeading: 100 });
    expect(statuses).toEqual([{ kind: 'available', heading: 100 }]);

    dispatch('deviceorientation', { alpha: 0, webkitCompassHeading: 200 });
    dispatch('deviceorientation', { alpha: 0, webkitCompassHeading: 200 });
    const last = statuses.at(-1) as { heading: number };
    expect(last.heading).toBeCloseTo(100 + 100 * HEADING_SMOOTHING, 1);
  });

  it('stop 후에는 이벤트를 듣지 않는다', () => {
    const { env, listeners } = fakeEnv();
    const source = createHeadingSource(env);
    source.start(() => {});
    source.stop();
    expect(listeners.get('deviceorientation')?.size ?? 0).toBe(0);
    expect(listeners.get('deviceorientationabsolute')?.size ?? 0).toBe(0);
  });
});
