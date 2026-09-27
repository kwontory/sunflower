import { FACING_TOLERANCE_DEG } from '../config';

export type TurnDirection = 'left' | 'right' | 'front';

export interface Turn {
  direction: TurnDirection;
  /** 돌아야 하는 각도, 0 이상 180 이하 */
  degrees: number;
}

/** 각도를 0 이상 360 미만으로 맞춘다. */
export function normalizeDegrees(deg: number): number {
  const r = deg % 360;
  const n = r < 0 ? r + 360 : r;
  // 아주 작은 음수는 더하면 360이 되고, -360 같은 값은 -0 이 되므로 0 으로 맞춘다.
  return n >= 360 || n === 0 ? 0 : n;
}

/**
 * 기기가 향한 방향(heading)에서 태양 방위각(azimuth)을 보려면 어느 쪽으로 몇 도 돌아야 하는지 계산한다.
 * 두 값 모두 북쪽 기준 시계 방향 각도다.
 */
export function computeTurn(sunAzimuth: number, deviceHeading: number): Turn {
  // -180 초과 180 이하로 맞춘 부호 있는 차이. 양수면 오른쪽(시계 방향).
  let diff = normalizeDegrees(sunAzimuth - deviceHeading);
  if (diff > 180) diff -= 360;
  const degrees = Math.abs(diff);
  if (degrees <= FACING_TOLERANCE_DEG) return { direction: 'front', degrees };
  return { direction: diff > 0 ? 'right' : 'left', degrees };
}

const COMPASS_8 = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'] as const;
export type CompassPoint = (typeof COMPASS_8)[number];

/** 방위각을 8방위 한국어 이름으로 바꾼다. 예: 170.9 → '남' */
export function compassPoint(azimuth: number): CompassPoint {
  const index = Math.round(normalizeDegrees(azimuth) / 45) % 8;
  return COMPASS_8[index];
}
