import { describe, expect, it } from 'vitest';
import { requestLocation } from '../../src/sensors/location';

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
