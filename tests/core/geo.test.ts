import { describe, expect, it } from 'vitest';
import { isValidCoordinates, roundCoordinates } from '../../src/core/geo';

// 공개 장소 좌표만 사용한다 (서울시청, 남산서울타워, 시드니 오페라하우스, 에펠탑).
describe('roundCoordinates', () => {
  it('소수 둘째 자리로 반올림한다', () => {
    expect(roundCoordinates(37.56654, 126.97797)).toEqual({ latitude: 37.57, longitude: 126.98 });
    expect(roundCoordinates(37.5512, 126.9882)).toEqual({ latitude: 37.55, longitude: 126.99 }); // 남산서울타워
  });

  it('음수 좌표를 0에서 먼 쪽으로 대칭 반올림한다', () => {
    expect(roundCoordinates(-33.85678, 151.21530)).toEqual({ latitude: -33.86, longitude: 151.22 });
    expect(roundCoordinates(-0.125, 0.125)).toEqual({ latitude: -0.13, longitude: 0.13 });
  });

  it('-0 을 내보내지 않는다', () => {
    const r = roundCoordinates(-0.001, -0.004);
    expect(Object.is(r.latitude, 0)).toBe(true);
    expect(Object.is(r.longitude, 0)).toBe(true);
    const z = roundCoordinates(-0, -0);
    expect(Object.is(z.latitude, 0)).toBe(true);
    expect(Object.is(z.longitude, 0)).toBe(true);
  });

  it('결과에 소수 셋째 자리 이하가 남지 않는다', () => {
    const r = roundCoordinates(48.858370, 2.294481); // 에펠탑
    expect(r.latitude.toString()).toMatch(/^-?\d+(\.\d{1,2})?$/);
    expect(r.longitude.toString()).toMatch(/^-?\d+(\.\d{1,2})?$/);
  });
});

describe('isValidCoordinates', () => {
  it('범위 안의 좌표와 경계값은 유효하다', () => {
    expect(isValidCoordinates(37.57, 126.98)).toBe(true);
    expect(isValidCoordinates(90, 180)).toBe(true);
    expect(isValidCoordinates(-90, -180)).toBe(true);
  });

  it('범위를 벗어나면 유효하지 않다', () => {
    expect(isValidCoordinates(90.01, 0)).toBe(false);
    expect(isValidCoordinates(-90.01, 0)).toBe(false);
    expect(isValidCoordinates(0, 180.01)).toBe(false);
    expect(isValidCoordinates(0, -180.01)).toBe(false);
  });

  it('유한한 숫자가 아니면 유효하지 않다', () => {
    expect(isValidCoordinates(Number.NaN, 0)).toBe(false);
    expect(isValidCoordinates(0, Number.POSITIVE_INFINITY)).toBe(false);
  });
});
