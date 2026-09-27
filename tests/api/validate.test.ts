import { describe, expect, it } from 'vitest';
import { parseCelnavSun } from '../../src/api/validate';
import { celnavBody, celnavNightBody } from './fixtures';

describe('parseCelnavSun', () => {
  it('Sun 항목의 zn·hc를 방위각·고도로 꺼낸다', () => {
    expect(parseCelnavSun(celnavBody())).toEqual({
      ok: true,
      value: { kind: 'position', position: { azimuth: 170.868399, altitude: 50.463113 } },
    });
  });

  it('다른 천체만 있고 Sun 항목이 없으면 실패가 아니라 absent (Venus 값을 쓰지 않는다)', () => {
    expect(parseCelnavSun(celnavBody(null))).toEqual({ ok: true, value: { kind: 'absent' } });
  });

  it('심야 실제 응답 모양(달·항성만 있음)은 absent', () => {
    expect(parseCelnavSun(celnavNightBody())).toEqual({ ok: true, value: { kind: 'absent' } });
  });

  it.each([
    ['data가 빈 배열', { properties: { data: [] } }],
    ['천체 이름 없음', { properties: { data: [{ almanac_data: { zn: 1, hc: 1 } }] } }],
    ['almanac_data 없는 천체만 있음', { properties: { data: [{ object: 'Moon' }] } }],
  ])('Sun 항목이 없고 다른 천체 항목도 정상이 아니면 invalid-response: %s', (_, json) => {
    const r = parseCelnavSun(json);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid-response');
  });

  it('HTTP 200 + {"error"} 응답은 invalid-response, 메시지에 오류 문구 포함', () => {
    const r = parseCelnavSun({ error: 'Invalid coordinates' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('invalid-response');
      expect(r.error.message).toContain('Invalid coordinates');
    }
  });

  it.each([
    ['null', null],
    ['문자열', 'hello'],
    ['배열', []],
    ['properties 없음', { type: 'Feature' }],
    ['data가 배열 아님', { properties: { data: {} } }],
    ['almanac_data 없음', { properties: { data: [{ object: 'Sun' }] } }],
  ])('구조가 다르면 invalid-response: %s', (_, json) => {
    const r = parseCelnavSun(json);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid-response');
  });

  it.each([
    ['zn NaN', { zn: NaN, hc: 10 }],
    ['hc Infinity', { zn: 10, hc: Infinity }],
    ['zn 문자열', { zn: '170.8', hc: 10 }],
    ['hc 문자열', { zn: 170, hc: '50' }],
    ['zn 없음', { zn: undefined, hc: 10 }],
  ])('숫자가 아니면 invalid-response: %s', (_, sun) => {
    const r = parseCelnavSun(celnavBody(sun));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid-response');
  });

  it.each([
    ['zn 음수', { zn: -0.1, hc: 10 }],
    ['zn 360 초과', { zn: 360.1, hc: 10 }],
    ['hc 90 초과', { zn: 10, hc: 90.5 }],
    ['hc -90 미만', { zn: 10, hc: -91 }],
  ])('범위를 벗어나면 invalid-data: %s', (_, sun) => {
    const r = parseCelnavSun(celnavBody(sun));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid-data');
  });

  it('경계값은 통과하고 zn 360은 0으로 바꾼다', () => {
    expect(parseCelnavSun(celnavBody({ zn: 360, hc: 90 }))).toEqual({
      ok: true,
      value: { kind: 'position', position: { azimuth: 0, altitude: 90 } },
    });
    expect(parseCelnavSun(celnavBody({ zn: 0, hc: -90 }))).toEqual({
      ok: true,
      value: { kind: 'position', position: { azimuth: 0, altitude: -90 } },
    });
  });
});
