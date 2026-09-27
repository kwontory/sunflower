import type { Coordinates, Result } from '../types';
import { isValidCoordinates, roundCoordinates } from '../core/geo';

export type LocationFailure = 'denied' | 'unavailable';

// 권한 창이 떠 있는 시간까지 제한 시간에 포함하는 브라우저가 있어 넉넉히 둔다
export const LOCATION_TIMEOUT_MS = 20_000;
// 좌표를 반올림해서 쓰므로 기기에 남아 있는 위치를 1시간까지 그대로 쓴다 (수 km 이동해도 해 방향 차이는 0.1° 수준)
export const LOCATION_MAX_AGE_MS = 60 * 60_000;

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

export type LocationPermissionState = 'granted' | 'denied' | 'prompt';

interface PermissionsLike {
  query(descriptor: { name: 'geolocation' }): Promise<{
    state: string;
    addEventListener?: (type: 'change', listener: () => void) => void;
    onchange?: (() => void) | null;
  }>;
}

/**
 * 위치 권한 상태가 바뀔 때마다 알린다. 권한 창에서 "허용"을 누른 순간을 잡아 다시 시도하는 데 쓴다.
 * Permissions API가 없거나 geolocation 조회를 지원하지 않는 브라우저에서는 아무 일도 하지 않는다.
 */
export function watchLocationPermission(
  permissions: PermissionsLike | undefined,
  onChange: (state: LocationPermissionState) => void,
): void {
  if (!permissions?.query) return;
  permissions
    .query({ name: 'geolocation' })
    .then((status) => {
      const notify = () => {
        const s = status.state;
        if (s === 'granted' || s === 'denied' || s === 'prompt') onChange(s);
      };
      if (typeof status.addEventListener === 'function') status.addEventListener('change', notify);
      else status.onchange = notify;
    })
    .catch(() => {
      // 지원하지 않으면 화면 복귀 시 재시도(컨트롤러)로 대신한다
    });
}
