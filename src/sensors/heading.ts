import type { HeadingStatus } from '../types';
import { normalizeDegrees } from '../core/direction';

/** 이 시간 안에 방향 값이 한 번도 오지 않으면 방향 감지를 지원하지 않는 기기로 본다 */
export const HEADING_DETECT_TIMEOUT_MS = 3000;
/** 이보다 작은 변화는 알리지 않는다 (화면 떨림 방지) */
export const HEADING_MIN_CHANGE_DEG = 1;
/** 원형 저역 통과 필터 계수. 클수록 새 값을 빨리 따라간다 */
const SMOOTHING = 0.3;

interface OrientationEventLike {
  alpha: number | null;
  absolute?: boolean;
  /** iOS Safari 전용. 북쪽 기준 시계 방향 나침반 방위 */
  webkitCompassHeading?: number;
}

type PermissionRequester = () => Promise<'granted' | 'denied' | 'default'>;

/** 테스트에서 가짜 창을 넣을 수 있도록 필요한 부분만 받는다 */
export interface HeadingEnvironment {
  addEventListener(type: string, listener: (event: OrientationEventLike) => void): void;
  removeEventListener(type: string, listener: (event: OrientationEventLike) => void): void;
  DeviceOrientationEvent?: { requestPermission?: PermissionRequester };
  /** 화면 회전 각도 (0, 90, 180, 270) */
  screenAngle(): number;
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export interface HeadingSource {
  start(onChange: (status: HeadingStatus) => void): void;
  /** iOS에서 사용자 동작(버튼 클릭) 안에서 호출해야 한다 */
  requestPermission(): Promise<void>;
  stop(): void;
}

/** 이벤트에서 북쪽 기준 시계 방향 방위를 꺼낸다. 쓸 수 없는 이벤트면 null */
export function readCompassHeading(event: OrientationEventLike, screenAngle: number): number | null {
  let heading: number | null = null;
  if (typeof event.webkitCompassHeading === 'number' && Number.isFinite(event.webkitCompassHeading)) {
    heading = event.webkitCompassHeading;
  } else if (event.absolute && typeof event.alpha === 'number' && Number.isFinite(event.alpha)) {
    // alpha는 반시계 방향이므로 뒤집는다
    heading = 360 - event.alpha;
  }
  if (heading === null) return null;
  // 가로 화면에서는 화면의 위쪽이 기기의 옆면이므로 회전 각도를 더한다
  return normalizeDegrees(heading + screenAngle);
}

/** 두 각도 사이를 원형으로 보간한다 */
export function smoothHeading(previous: number | null, next: number, factor = SMOOTHING): number {
  if (previous === null) return next;
  let diff = normalizeDegrees(next - previous);
  if (diff > 180) diff -= 360;
  return normalizeDegrees(previous + diff * factor);
}

export function createHeadingSource(env: HeadingEnvironment): HeadingSource {
  let onChange: ((status: HeadingStatus) => void) | null = null;
  let smoothed: number | null = null;
  let lastEmitted: HeadingStatus | null = null;
  let detectTimer: unknown = null;
  let listening = false;

  const emit = (status: HeadingStatus) => {
    if (lastEmitted && lastEmitted.kind === status.kind) {
      if (status.kind !== 'available') return;
      if (lastEmitted.kind === 'available') {
        let diff = Math.abs(status.heading - lastEmitted.heading);
        if (diff > 180) diff = 360 - diff;
        if (diff < HEADING_MIN_CHANGE_DEG) return;
      }
    }
    lastEmitted = status;
    onChange?.(status);
  };

  const handleEvent = (event: OrientationEventLike) => {
    const heading = readCompassHeading(event, env.screenAngle());
    if (heading === null) return;
    if (detectTimer !== null) {
      env.clearTimeout(detectTimer);
      detectTimer = null;
    }
    smoothed = smoothHeading(smoothed, heading);
    emit({ kind: 'available', heading: Math.round(smoothed * 10) / 10 });
  };

  const listen = () => {
    if (listening) return;
    listening = true;
    // 절대 방위 이벤트(Android Chrome)와 일반 이벤트(iOS)를 모두 듣는다
    env.addEventListener('deviceorientationabsolute', handleEvent);
    env.addEventListener('deviceorientation', handleEvent);
    detectTimer = env.setTimeout(() => {
      detectTimer = null;
      if (smoothed === null) emit({ kind: 'unavailable', reason: 'unsupported' });
    }, HEADING_DETECT_TIMEOUT_MS);
  };

  const needsPermission = () => typeof env.DeviceOrientationEvent?.requestPermission === 'function';

  return {
    start(callback) {
      onChange = callback;
      if (!env.DeviceOrientationEvent) {
        emit({ kind: 'unavailable', reason: 'unsupported' });
        return;
      }
      if (needsPermission()) {
        emit({ kind: 'needs-permission' });
        return;
      }
      listen();
    },
    async requestPermission() {
      const request = env.DeviceOrientationEvent?.requestPermission;
      if (typeof request !== 'function') {
        listen();
        return;
      }
      try {
        const result = await request();
        if (result === 'granted') listen();
        else emit({ kind: 'unavailable', reason: 'denied' });
      } catch {
        emit({ kind: 'unavailable', reason: 'denied' });
      }
    },
    stop() {
      env.removeEventListener('deviceorientationabsolute', handleEvent);
      env.removeEventListener('deviceorientation', handleEvent);
      if (detectTimer !== null) env.clearTimeout(detectTimer);
      detectTimer = null;
      listening = false;
      onChange = null;
    },
  };
}

/** 브라우저 창으로 환경을 만든다 */
export function browserHeadingEnvironment(win: Window): HeadingEnvironment {
  return {
    addEventListener: (type, listener) => win.addEventListener(type, listener as unknown as EventListener),
    removeEventListener: (type, listener) => win.removeEventListener(type, listener as unknown as EventListener),
    DeviceOrientationEvent: (win as unknown as { DeviceOrientationEvent?: HeadingEnvironment['DeviceOrientationEvent'] })
      .DeviceOrientationEvent,
    screenAngle: () => win.screen?.orientation?.angle ?? 0,
    setTimeout: (handler, ms) => win.setTimeout(handler, ms),
    clearTimeout: (id) => win.clearTimeout(id as number),
  };
}
