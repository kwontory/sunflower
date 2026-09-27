// 테스트 전용 좌표와 USNO 응답 예시 (서울시청, 공개 장소)
import type { Coordinates } from '../../src/types';

export const SEOUL_CITY_HALL: Coordinates = { latitude: 37.57, longitude: 126.98 };

export function celnavBody(sun: { zn: unknown; hc: unknown } | null = { zn: 170.868399, hc: 50.463113 }) {
  const data: unknown[] = [
    {
      almanac_data: { dec: -20.409428, gha: 197.817661, hc: 23.228817, zn: 143.987034 },
      altitude_corrections: {},
      object: 'Venus',
    },
  ];
  if (sun) {
    data.unshift({
      almanac_data: { dec: -1.604011, gha: 227.221557, ...sun },
      altitude_corrections: {},
      object: 'Sun',
    });
  }
  return { apiversion: '4.0.1', geometry: {}, properties: { data }, type: 'Feature' };
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, ...init });
}
