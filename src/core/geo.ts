import { COORDINATE_DECIMALS } from '../config';
import type { Coordinates } from '../types';

/** 위도 -90~90, 경도 -180~180 범위의 유한한 숫자인지 확인한다. */
export function isValidCoordinates(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  // 음수도 0에서 먼 쪽으로 반올림해 부호와 관계없이 대칭이 되게 한다.
  const rounded = (Math.sign(value) * Math.round(Math.abs(value) * factor)) / factor;
  // -0 은 0 으로 바꾼다.
  return rounded === 0 ? 0 : rounded;
}

/**
 * 좌표를 소수 둘째 자리로 반올림한다 (D005).
 * 정확한 GPS 좌표는 이 함수 밖으로 반올림 없이 나가지 않게 한다.
 */
export function roundCoordinates(lat: number, lon: number): Coordinates {
  return {
    latitude: roundTo(lat, COORDINATE_DECIMALS),
    longitude: roundTo(lon, COORDINATE_DECIMALS),
  };
}
