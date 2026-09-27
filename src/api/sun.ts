import type { Coordinates, FetchFailure, Result, SunLookup } from '../types';
import { fetchCelnav } from './usno';
import { parseCelnavSun } from './validate';

export interface SunReadingDeps {
  fetch: typeof fetch;
  now: () => Date;
  timeoutMs?: number;
}

/**
 * USNO 호출과 응답 검증을 거쳐 조회 결과 하나를 만든다. 검증을 통과한 값만 ok로 돌려준다.
 * 정상 응답에 Sun 항목이 없으면(해가 지평선 아래) 실패가 아니라 sun-absent로 돌려준다.
 */
export async function getSunReading(
  coords: Coordinates,
  at: Date,
  deps: SunReadingDeps,
): Promise<Result<SunLookup, FetchFailure>> {
  const fetched = await fetchCelnav(coords, at, deps);
  if (!fetched.ok) return fetched;

  const parsed = parseCelnavSun(fetched.value);
  if (!parsed.ok) return parsed;

  const base = {
    coords: { latitude: coords.latitude, longitude: coords.longitude },
    observedAt: at.toISOString(),
    fetchedAt: deps.now().toISOString(),
    source: 'USNO' as const,
  };
  if (parsed.value.kind === 'absent') return { ok: true, value: { kind: 'sun-absent', check: base } };
  return { ok: true, value: { kind: 'reading', reading: { position: parsed.value.position, ...base } } };
}
