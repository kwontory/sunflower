import type { Coordinates, FetchFailure, Result, SunReading } from '../types';
import { fetchCelnav } from './usno';
import { parseCelnavSun } from './validate';

export interface SunReadingDeps {
  fetch: typeof fetch;
  now: () => Date;
  timeoutMs?: number;
}

/** USNO 호출과 응답 검증을 거쳐 SunReading 하나를 만든다. 검증을 통과한 값만 ok로 돌려준다. */
export async function getSunReading(
  coords: Coordinates,
  at: Date,
  deps: SunReadingDeps,
): Promise<Result<SunReading, FetchFailure>> {
  const fetched = await fetchCelnav(coords, at, deps);
  if (!fetched.ok) return fetched;

  const parsed = parseCelnavSun(fetched.value);
  if (!parsed.ok) return parsed;

  return {
    ok: true,
    value: {
      position: parsed.value,
      coords: { latitude: coords.latitude, longitude: coords.longitude },
      observedAt: at.toISOString(),
      fetchedAt: deps.now().toISOString(),
      source: 'USNO',
    },
  };
}
