import { describe, expect, it } from 'vitest';
import { getSunVisibilityState, isBelowHorizon } from '../../src/core/sun-visibility';

describe('isBelowHorizon', () => {
  it.each([
    [0.1, false],
    [0.0001, false],
    [0, true],
    [-0, true],
    [-0.1, true],
  ])('%s → %s', (altitude, expected) => {
    expect(isBelowHorizon(altitude)).toBe(expected);
  });

  it('getSunVisibilityState와 같은 기준을 쓴다', () => {
    for (const altitude of [0.1, 0.0001, 0, -0.1]) {
      const state = getSunVisibilityState({ altitude, hasHeading: true, requestFailed: false, isLastGood: false });
      expect(state.belowHorizon).toBe(isBelowHorizon(altitude));
    }
  });
});
