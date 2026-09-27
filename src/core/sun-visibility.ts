export interface SunVisibilityInput {
  altitude: number;
  hasHeading: boolean;
  requestFailed: boolean;
  isLastGood: boolean;
}

export interface SunVisibilityState {
  belowHorizon: boolean;
  allowDirectionGuidance: boolean;
  allowTurnGuidance: boolean;
  allowBearingGuidance: boolean;
  showSolarData: boolean;
  showDataStatus: boolean;
  showSource: boolean;
  showFailureState: boolean;
  showLastGood: boolean;
  treatAsLive: boolean;
  message: string;
}

/** 지평선 이하 판정: 고도 0° 이하 (과제 5 고정 검사 SF05-02·03 기준). 화면의 모든 판정은 이 함수를 쓴다 */
export function isBelowHorizon(altitude: number): boolean {
  return altitude <= 0;
}

export function getSunVisibilityState(
  input: SunVisibilityInput,
): SunVisibilityState {
  const belowHorizon = isBelowHorizon(input.altitude);
  const allowDirectionGuidance = !belowHorizon;
  return {
    belowHorizon,
    allowDirectionGuidance,
    allowTurnGuidance: allowDirectionGuidance && input.hasHeading,
    allowBearingGuidance: allowDirectionGuidance && !input.hasHeading,
    showSolarData: true,
    showDataStatus: true,
    showSource: true,
    showFailureState: input.requestFailed,
    showLastGood: input.isLastGood,
    treatAsLive: !input.requestFailed && !input.isLastGood,
    message: belowHorizon ? '해가 지평선 아래에 있어요' : '',
  };
}
