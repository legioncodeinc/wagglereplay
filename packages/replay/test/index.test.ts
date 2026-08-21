import { describe, expect, it } from 'vitest';
import { REPLAY_PRESETS, ReplayPresetError, resolveReplayPreset } from '../src/index.js';

describe('replay preset registry', () => {
  it('carries the PRD-009 AC4 matrix with DPR and mobile flags', () => {
    expect(Object.keys(REPLAY_PRESETS).sort()).toEqual([
      '16x9',
      '1x1',
      '9x16',
      'desktop',
      'mobile',
    ]);
    expect(REPLAY_PRESETS['16x9']).toMatchObject({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      isMobile: false,
      composePresetId: '16x9',
    });
    expect(REPLAY_PRESETS.mobile).toMatchObject({
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      composePresetId: '9x16',
    });
    expect(REPLAY_PRESETS.desktop).toMatchObject({
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      isMobile: false,
      composePresetId: '16x9',
    });
  });

  it('rejects unknown preset ids with the known list', () => {
    expect(() => resolveReplayPreset('nope')).toThrow(ReplayPresetError);
    expect(() => resolveReplayPreset('nope')).toThrow(/Known replay presets/);
  });
});
