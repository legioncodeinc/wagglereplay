import { describe, expect, it } from 'vitest';
import {
  ANIMATION_KILL_CSS,
  ANIMATION_KILL_INIT_SCRIPT,
  buildDeterminismInitScript,
} from '../src/determinism/assets.js';

describe('buildDeterminismInitScript', () => {
  it('injects the settle exclusions every time', () => {
    const script = buildDeterminismInitScript({ killAnimations: false, networkExclusions: [] });
    expect(script).toContain('window.__waggleSettleExclusions = []');
    expect(script).not.toContain(ANIMATION_KILL_CSS);
  });

  it('injects the animation-kill stylesheet only when toggled on', () => {
    const on = buildDeterminismInitScript({
      killAnimations: true,
      networkExclusions: ['analytics'],
    });
    expect(on).toContain(ANIMATION_KILL_INIT_SCRIPT);
    expect(on).toContain('window.__waggleSettleExclusions = ["analytics"]');
    expect(on).toContain('animation:none!important');
  });

  it('is byte-identical for identical inputs', () => {
    const a = buildDeterminismInitScript({ killAnimations: true, networkExclusions: ['x'] });
    const b = buildDeterminismInitScript({ killAnimations: true, networkExclusions: ['x'] });
    expect(a).toBe(b);
  });
});
