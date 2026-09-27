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
  return {
    belowHorizon: false,
    allowDirectionGuidance: true,
    allowTurnGuidance: true,
    allowBearingGuidance: true,
    showSolarData: true,
    showDataStatus: true,
    showSource: true,
    showFailureState: input.requestFailed,
    showLastGood: input.isLastGood,
    treatAsLive: !input.requestFailed,
    message: '',
  };
}

