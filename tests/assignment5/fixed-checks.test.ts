import { describe, expect, it } from 'vitest';
import { getSunVisibilityState } from '../../src/core/sun-visibility';

describe('Assignment 5 fixed checks', () => {
  it('SF05-01: 고도 20도에서는 일반 방향 안내를 허용한다', () => {
    const result = getSunVisibilityState({
      altitude: 20,
      hasHeading: true,
      requestFailed: false,
      isLastGood: false,
    });

    expect(result.belowHorizon).toBe(false);
    expect(result.allowDirectionGuidance).toBe(true);
  });

  it('SF05-02: 고도 0.1도에서는 일반 방향 안내를 허용한다', () => {
    const result = getSunVisibilityState({
      altitude: 0.1,
      hasHeading: true,
      requestFailed: false,
      isLastGood: false,
    });

    expect(result.belowHorizon).toBe(false);
    expect(result.allowDirectionGuidance).toBe(true);
  });

  it('SF05-03: 고도 0도에서는 지평선 이하 상태로 처리한다', () => {
    const result = getSunVisibilityState({
      altitude: 0,
      hasHeading: true,
      requestFailed: false,
      isLastGood: false,
    });

    expect(result.belowHorizon).toBe(true);
    expect(result.allowDirectionGuidance).toBe(false);
  });

  it('SF05-04: 고도 -0.1도에서는 지평선 아래 상태로 처리한다', () => {
    const result = getSunVisibilityState({
      altitude: -0.1,
      hasHeading: true,
      requestFailed: false,
      isLastGood: false,
    });

    expect(result.belowHorizon).toBe(true);
    expect(result.allowDirectionGuidance).toBe(false);
  });

  it('SF05-05: 고도 -18도에서는 지평선 아래 상태를 표시한다', () => {
    const result = getSunVisibilityState({
      altitude: -18,
      hasHeading: true,
      requestFailed: false,
      isLastGood: false,
    });

    expect(result.belowHorizon).toBe(true);
    expect(result.message).toBe('해가 지평선 아래에 있어요');
  });

  it('SF05-06: 지평선 아래이고 방향 센서가 있어도 회전 안내를 허용하지 않는다', () => {
    const result = getSunVisibilityState({
      altitude: -18,
      hasHeading: true,
      requestFailed: false,
      isLastGood: false,
    });

    expect(result.allowTurnGuidance).toBe(false);
  });

  it('SF05-07: 지평선 아래이고 방향 센서가 없어도 일반 방위 안내를 허용하지 않는다', () => {
    const result = getSunVisibilityState({
      altitude: -18,
      hasHeading: false,
      requestFailed: false,
      isLastGood: false,
    });

    expect(result.allowBearingGuidance).toBe(false);
  });

  it('SF05-08: 지평선 아래여도 태양 위치 데이터 자체는 숨기지 않는다', () => {
    const result = getSunVisibilityState({
      altitude: -18,
      hasHeading: true,
      requestFailed: false,
      isLastGood: false,
    });

    expect(result.showSolarData).toBe(true);
  });

  it('SF05-09: 지평선 아래여도 데이터 상태와 출처는 숨기지 않는다', () => {
    const result = getSunVisibilityState({
      altitude: -18,
      hasHeading: true,
      requestFailed: false,
      isLastGood: false,
    });

    expect(result.showDataStatus).toBe(true);
    expect(result.showSource).toBe(true);
  });

  it('SF05-10: 요청 실패 + 마지막 정상값이 지평선 아래일 때 의미를 유지한다', () => {
    const result = getSunVisibilityState({
      altitude: -18,
      hasHeading: true,
      requestFailed: true,
      isLastGood: true,
    });

    expect(result.belowHorizon).toBe(true);
    expect(result.showFailureState).toBe(true);
    expect(result.showLastGood).toBe(true);
    expect(result.treatAsLive).toBe(false);
  });
});

