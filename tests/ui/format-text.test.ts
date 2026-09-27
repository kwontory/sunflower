import { describe, expect, it } from 'vitest';
import {
  formatAltitude,
  formatDegrees,
  formatElapsed,
  formatKstDateLabel,
  formatKstTime,
  formatSignedDegrees,
  minutesUntil,
} from '../../src/ui/format';
import { altitudeCell, facingHeadline, failureMessage, sunSub, turnHeadline } from '../../src/ui/text';

describe('format', () => {
  it('경과 시간', () => {
    const now = '2026-09-27T03:00:00.000Z';
    expect(formatElapsed('2026-09-27T02:59:30.000Z', now)).toBe('방금');
    expect(formatElapsed('2026-09-27T02:58:00.000Z', now)).toBe('2분 전');
    expect(formatElapsed('2026-09-27T01:30:00.000Z', now)).toBe('1시간 전');
    expect(formatElapsed('2026-09-25T03:00:00.000Z', now)).toBe('2일 전');
    expect(formatElapsed('2026-09-27T03:01:00.000Z', now)).toBe('방금');
  });

  it('KST 시각과 날짜 라벨', () => {
    expect(formatKstTime('2026-09-27T03:00:00.000Z')).toBe('12:00');
    expect(formatKstTime('2026-09-27T15:30:00.000Z')).toBe('00:30');
    expect(formatKstDateLabel('2026-09-27')).toBe('2026-09-27 (일)');
  });

  it('각도 표기', () => {
    expect(formatDegrees(170.94)).toBe('170.9°');
    expect(formatDegrees(-12.34)).toBe('-12.3°');
    expect(formatDegrees(-0.01)).toBe('0.0°');
    expect(formatSignedDegrees(0.2)).toBe('+0.2°');
    expect(formatSignedDegrees(-0.4)).toBe('−0.4°');
    expect(formatSignedDegrees(0.01)).toBe('0.0°');
  });

  it('남은 분', () => {
    expect(minutesUntil('2026-09-27T03:05:00.000Z', '2026-09-27T03:02:00.000Z')).toBe(3);
    expect(minutesUntil('2026-09-27T03:00:00.000Z', '2026-09-27T03:02:00.000Z')).toBe(0);
  });
});

describe('text', () => {
  it('실패 원인별 문구', () => {
    expect(failureMessage({ kind: 'timeout', message: '' })).toBe('응답이 늦어지고 있어요');
    expect(failureMessage({ kind: 'http', status: 429, message: '' })).toBe('요청이 너무 많아요. 잠시 기다려 주세요');
    expect(failureMessage({ kind: 'http', status: 503, message: '' })).toBe('불러오지 못했어요');
    expect(failureMessage({ kind: 'network', message: '' })).toBe('불러오지 못했어요');
    expect(failureMessage({ kind: 'invalid-response', message: '' })).toBe('불러오지 못했어요');
    expect(failureMessage({ kind: 'invalid-data', message: '' })).toBe('불러오지 못했어요');
  });

  it('회전 안내', () => {
    expect(turnHeadline({ direction: 'right', degrees: 32.04 })).toBe('오른쪽으로 32° 돌아보세요');
    expect(turnHeadline({ direction: 'left', degrees: 15 })).toBe('왼쪽으로 15° 돌아보세요');
    expect(turnHeadline({ direction: 'front', degrees: 2 })).toBe('지금 해가 정면에 있어요');
    expect(facingHeadline(170.9)).toBe('남쪽(170.9°)을 바라보세요');
  });

  it('해 위치 보조 문장', () => {
    expect(sunSub({ azimuth: 170.9, altitude: 50.5 })).toBe('해는 남쪽, 지평선 위 50.5°에 있어요');
    expect(sunSub({ azimuth: 300, altitude: -12.3 })).toBe('해가 지평선 아래에 있어요 (고도 -12.3°)');
  });
});

describe('고도 표시 (지평선 판정과 숫자가 어긋나 보이지 않게)', () => {
  it.each([
    [50.463, '50.5°'],
    [0.1, '0.1°'],
    [0.04, '0.04°'],
    [0, '0.0°'],
    [-0.04, '-0.04°'],
    [-0.1, '-0.1°'],
    [-18, '-18.0°'],
  ])('%s → %s', (n, expected) => {
    expect(formatAltitude(n)).toBe(expected);
  });

  it('0.04°는 지평선 위, -0.04°는 지평선 이하로 숫자와 설명이 함께 구분된다', () => {
    expect(altitudeCell(0.04)).toBe('0.04°');
    expect(altitudeCell(-0.04)).toBe('-0.04° · 지평선 이하');
    expect(sunSub({ azimuth: 270, altitude: 0.04 })).toContain('지평선 위 0.04°');
    expect(sunSub({ azimuth: 270, altitude: -0.04 })).toContain('고도 -0.04°');
  });
});
