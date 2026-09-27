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

/**
 * 해가 지평선보다 충분히 낮을 때의 celnav 응답 모양 (Sun 항목 없음).
 * 2026-09-27 00:00 KST 서울시청 좌표 실제 응답에서 달·항성 한 개씩만 남겨 줄였다.
 */
export function celnavNightBody() {
  return {
    apiversion: '4.0.1',
    geometry: { coordinates: [126.98, 37.57], type: 'Point' },
    properties: {
      data: [
        {
          almanac_data: { dec: 9.884744, gha: 217.903377, hc: 59.147876, zn: 149.935313 },
          altitude_corrections: {},
          object: 'Moon',
        },
        {
          almanac_data: { dec: 29.241093, gha: 228.967388, hc: 81.012893, zn: 156.748805 },
          altitude_corrections: {},
          nav_star_number: 1,
          object: 'Alpheratz',
        },
      ],
      day: 27,
      month: 9,
      year: 2026,
      time: 15.0,
      tz: 0,
    },
    type: 'Feature',
  };
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, ...init });
}
