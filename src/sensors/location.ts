import type { Coordinates, Result } from '../types';
import { isValidCoordinates, roundCoordinates } from '../core/geo';

export type LocationFailure = 'denied' | 'unavailable';

const LOCATION_TIMEOUT_MS = 10_000;
// 좌표를 반올림해서 쓰므로 조금 오래된 위치도 충분하다
const LOCATION_MAX_AGE_MS = 10 * 60_000;

/**
 * 현재 위치를 한 번 얻어 반올림한 좌표로 돌려준다.
 * 정확한 좌표는 이 함수 밖으로 내보내지 않고, 기록하거나 출력하지도 않는다.
 */
export function requestLocation(
  geolocation: Geolocation | undefined,
): Promise<Result<Coordinates, LocationFailure>> {
  if (!geolocation) return Promise.resolve({ ok: false, error: 'unavailable' });

  return new Promise((resolve) => {
    geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (!isValidCoordinates(latitude, longitude)) {
          resolve({ ok: false, error: 'unavailable' });
          return;
        }
        resolve({ ok: true, value: roundCoordinates(latitude, longitude) });
      },
      (error) => {
        resolve({ ok: false, error: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable' });
      },
      { enableHighAccuracy: false, timeout: LOCATION_TIMEOUT_MS, maximumAge: LOCATION_MAX_AGE_MS },
    );
  });
}
