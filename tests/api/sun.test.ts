import { describe, expect, it, vi } from 'vitest';
import { getSunReading } from '../../src/api/sun';
import { SEOUL_CITY_HALL, celnavBody, jsonResponse } from './fixtures';

const AT = new Date('2026-09-27T03:00:00Z');
const NOW = new Date('2026-09-27T03:00:01.250Z');

const fakeFetch = (impl: () => Promise<Response>) => vi.fn(impl) as unknown as typeof fetch;

describe('getSunReading', () => {
  it('검증을 통과하면 SunReading을 만든다', async () => {
    const r = await getSunReading(SEOUL_CITY_HALL, AT, {
      fetch: fakeFetch(async () => jsonResponse(celnavBody())),
      now: () => NOW,
    });
    expect(r).toEqual({
      ok: true,
      value: {
        position: { azimuth: 170.868399, altitude: 50.463113 },
        coords: { latitude: 37.57, longitude: 126.98 },
        observedAt: '2026-09-27T03:00:00.000Z',
        fetchedAt: '2026-09-27T03:00:01.250Z',
        source: 'USNO',
      },
    });
  });

  it('통신 실패는 그대로 실패로 돌려준다', async () => {
    const r = await getSunReading(SEOUL_CITY_HALL, AT, {
      fetch: fakeFetch(async () => new Response('', { status: 502 })),
      now: () => NOW,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ kind: 'http', status: 502 });
  });

  it('HTTP 200이어도 검증에 실패하면 ok가 아니다', async () => {
    for (const body of [{ error: 'bad date' }, celnavBody(null), celnavBody({ zn: 400, hc: 10 })]) {
      const r = await getSunReading(SEOUL_CITY_HALL, AT, {
        fetch: fakeFetch(async () => jsonResponse(body)),
        now: () => NOW,
      });
      expect(r.ok).toBe(false);
    }
  });
});
