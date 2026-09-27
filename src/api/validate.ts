import type { FetchFailure, Result, SunPosition } from '../types';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const invalidResponse = (message: string): Result<never, FetchFailure> => ({
  ok: false,
  error: { kind: 'invalid-response', message },
});

/**
 * celnav 응답에서 태양 항목을 찾아 방위각(zn)·고도(hc)를 검증한다.
 * 구조가 다르면 invalid-response, 값 범위가 이상하면 invalid-data.
 */
export function parseCelnavSun(json: unknown): Result<SunPosition, FetchFailure> {
  if (!isRecord(json)) return invalidResponse('응답이 객체가 아님');
  // USNO는 HTTP 200으로 {"error": "..."}를 돌려주기도 한다.
  if ('error' in json) return invalidResponse(`USNO 오류: ${String(json.error)}`);

  const properties = json.properties;
  if (!isRecord(properties) || !Array.isArray(properties.data)) {
    return invalidResponse('properties.data 없음');
  }

  const sun = properties.data.find((item) => isRecord(item) && item.object === 'Sun');
  if (!isRecord(sun)) return invalidResponse('Sun 항목 없음');

  const almanac = sun.almanac_data;
  if (!isRecord(almanac)) return invalidResponse('Sun almanac_data 없음');

  const zn = almanac.zn;
  const hc = almanac.hc;
  if (typeof zn !== 'number' || !Number.isFinite(zn)) return invalidResponse(`zn 값 이상: ${String(zn)}`);
  if (typeof hc !== 'number' || !Number.isFinite(hc)) return invalidResponse(`hc 값 이상: ${String(hc)}`);

  if (zn < 0 || zn > 360) {
    return { ok: false, error: { kind: 'invalid-data', message: `방위각 범위 밖: ${zn}` } };
  }
  if (hc < -90 || hc > 90) {
    return { ok: false, error: { kind: 'invalid-data', message: `고도 범위 밖: ${hc}` } };
  }

  // 360은 북쪽(0)과 같다.
  return { ok: true, value: { azimuth: zn === 360 ? 0 : zn, altitude: hc } };
}
