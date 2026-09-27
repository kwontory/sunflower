import { describe, expect, it, vi } from 'vitest';
import { requestLocation, watchLocationPermission } from '../../src/sensors/location';

// 공개 장소(서울시청) 좌표만 사용한다
const CITY_HALL = { latitude: 37.5663, longitude: 126.9779 };

function fakeGeolocation(outcome: { coords?: { latitude: number; longitude: number }; errorCode?: number }): Geolocation {
  return {
    getCurrentPosition(success, error) {
      if (outcome.coords) {
        success({ coords: outcome.coords } as GeolocationPosition);
      } else {
        error?.({ code: outcome.errorCode ?? 2, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: '' } as GeolocationPositionError);
      }
    },
    watchPosition: () => 0,
    clearWatch: () => {},
  };
}

describe('requestLocation', () => {
  it('좌표를 소수 둘째 자리로 반올림해서 돌려준다', async () => {
    const result = await requestLocation(fakeGeolocation({ coords: CITY_HALL }));
    expect(result).toEqual({ ok: true, value: { latitude: 37.57, longitude: 126.98 } });
  });

  it('권한 거부는 denied', async () => {
    expect(await requestLocation(fakeGeolocation({ errorCode: 1 }))).toEqual({ ok: false, error: 'denied' });
  });

  it('위치 확인 실패·시간 초과는 unavailable', async () => {
    expect(await requestLocation(fakeGeolocation({ errorCode: 2 }))).toEqual({ ok: false, error: 'unavailable' });
    expect(await requestLocation(fakeGeolocation({ errorCode: 3 }))).toEqual({ ok: false, error: 'unavailable' });
  });

  it('Geolocation이 없으면 unavailable', async () => {
    expect(await requestLocation(undefined)).toEqual({ ok: false, error: 'unavailable' });
  });

  it('범위를 벗어난 좌표는 unavailable', async () => {
    const result = await requestLocation(fakeGeolocation({ coords: { latitude: 200, longitude: 0 } }));
    expect(result).toEqual({ ok: false, error: 'unavailable' });
  });
});

describe('watchLocationPermission', () => {
  it('권한 상태가 바뀌면 알린다', async () => {
    const status: { state: string; onchange: (() => void) | null } = { state: 'prompt', onchange: null };
    const onChange = vi.fn();
    watchLocationPermission({ query: async () => status }, onChange);
    await Promise.resolve();
    await Promise.resolve();
    status.state = 'granted';
    status.onchange?.();
    expect(onChange).toHaveBeenCalledWith('granted');
  });

  it('Permissions API가 없거나 조회가 실패해도 오류 없이 넘어간다', async () => {
    expect(() => watchLocationPermission(undefined, () => {})).not.toThrow();
    watchLocationPermission({ query: () => Promise.reject(new TypeError('unsupported')) }, () => {});
    await Promise.resolve();
  });
});

describe('watchLocationPermission 처음 상태', () => {
  it('처음 조회한 상태도 알린다 (이미 차단된 경우 바로 안내하기 위해)', async () => {
    const onChange = vi.fn();
    watchLocationPermission({ query: async () => ({ state: 'denied', onchange: null }) }, onChange);
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith('denied'));
  });
});
