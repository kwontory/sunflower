import { describe, expect, it } from 'vitest';
import { compassPoint, computeTurn, normalizeDegrees } from '../../src/core/direction';

describe('normalizeDegrees', () => {
  it('0 이상 360 미만으로 맞춘다', () => {
    expect(normalizeDegrees(370)).toBe(10);
    expect(normalizeDegrees(-10)).toBe(350);
    expect(normalizeDegrees(360)).toBe(0);
  });

  it('아주 작은 음수도 360이 되지 않는다', () => {
    const r = normalizeDegrees(-1e-14);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(360);
  });

  it('-0 을 내보내지 않는다', () => {
    expect(Object.is(normalizeDegrees(-360), 0)).toBe(true);
  });
});

describe('computeTurn', () => {
  it('해가 오른쪽에 있으면 right', () => {
    expect(computeTurn(120, 90)).toEqual({ direction: 'right', degrees: 30 });
  });

  it('해가 왼쪽에 있으면 left', () => {
    expect(computeTurn(60, 90)).toEqual({ direction: 'left', degrees: 30 });
  });

  it('같은 방향이면 front', () => {
    expect(computeTurn(90, 90)).toEqual({ direction: 'front', degrees: 0 });
  });

  it('북쪽을 가로지르는 경우를 처리한다', () => {
    expect(computeTurn(10, 350)).toEqual({ direction: 'right', degrees: 20 });
    expect(computeTurn(350, 10)).toEqual({ direction: 'left', degrees: 20 });
  });

  it('정확히 반대편(180도)이면 180도 회전', () => {
    const turn = computeTurn(270, 90);
    expect(turn.degrees).toBe(180);
    expect(turn.direction).not.toBe('front');
  });

  it('허용 오차 5도 이내는 front, 초과는 회전', () => {
    expect(computeTurn(95, 90)).toEqual({ direction: 'front', degrees: 5 });
    expect(computeTurn(85, 90)).toEqual({ direction: 'front', degrees: 5 });
    const right = computeTurn(95.1, 90);
    expect(right.direction).toBe('right');
    expect(right.degrees).toBeCloseTo(5.1);
    const left = computeTurn(84.9, 90);
    expect(left.direction).toBe('left');
    expect(left.degrees).toBeCloseTo(5.1);
  });
});

describe('compassPoint', () => {
  it.each([
    [0, '북'],
    [22.4, '북'],
    [22.6, '북동'],
    [90, '동'],
    [170.9, '남'],
    [270, '서'],
    [359, '북'],
    [-45, '북서'],
  ])('%s° → %s', (azimuth, expected) => {
    expect(compassPoint(azimuth)).toBe(expected);
  });
});
