import { describe, expect, it } from 'vitest';
import {
  ANIMATION_KILL_CSS,
  ANIMATION_KILL_STYLE_ID,
  buildDeterminismInitPayload,
} from '../src/determinism/assets.js';

describe('buildDeterminismInitPayload', () => {
  it('keeps dynamic configuration in serializable data', () => {
    const payload = buildDeterminismInitPayload({
      killAnimations: false,
      networkExclusions: [],
    });
    expect(payload).toEqual({
      killAnimations: false,
      networkExclusions: [],
      animationCss: ANIMATION_KILL_CSS,
      animationStyleId: ANIMATION_KILL_STYLE_ID,
    });
  });

  it('copies exclusions so later caller mutation cannot alter the payload', () => {
    const exclusions = ['analytics'];
    const payload = buildDeterminismInitPayload({
      killAnimations: true,
      networkExclusions: exclusions,
    });
    exclusions.push('late-mutation');
    expect(payload.networkExclusions).toEqual(['analytics']);
    expect(payload.animationCss).toContain('animation:none!important');
  });

  it('is byte-identical for identical inputs', () => {
    const a = buildDeterminismInitPayload({ killAnimations: true, networkExclusions: ['x'] });
    const b = buildDeterminismInitPayload({ killAnimations: true, networkExclusions: ['x'] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
