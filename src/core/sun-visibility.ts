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

export function getSunVisibilityState(
  input: SunVisibilityInput,
): SunVisibilityState {
  const belowHorizon = input.altitude <= 0;
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
