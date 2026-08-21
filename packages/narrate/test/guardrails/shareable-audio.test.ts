import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertShareableAudioAllowed,
  checkShareableAudioAllowed,
  SHAREABLE_AUDIO_OVERRIDE_ENV_VAR,
  ShareableAudioGuardError,
} from '../../src/guardrails/shareable-audio.js';

describe('checkShareableAudioAllowed', () => {
  it('allows a paid ElevenLabs tier with a non-beta model', () => {
    const result = checkShareableAudioAllowed({
      provider: 'elevenlabs',
      planTier: 'creator',
      modelIsBeta: false,
      env: {},
    });
    expect(result.allowed).toBe(true);
    expect(result.blockedReasons).toEqual([]);
  });

  it('refuses a free-tier ElevenLabs plan (AC7)', () => {
    const result = checkShareableAudioAllowed({
      provider: 'elevenlabs',
      planTier: 'free',
      modelIsBeta: false,
      env: {},
    });
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons[0]).toMatch(/free tier/i);
  });

  it('refuses a beta-flagged model regardless of plan tier (AC7)', () => {
    const result = checkShareableAudioAllowed({
      provider: 'elevenlabs',
      planTier: 'scale',
      modelIsBeta: true,
      env: {},
    });
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons[0]).toMatch(/beta/i);
  });

  it('reports both reasons when free tier AND beta model coincide', () => {
    const result = checkShareableAudioAllowed({
      provider: 'elevenlabs',
      planTier: 'free',
      modelIsBeta: true,
      env: {},
    });
    expect(result.blockedReasons).toHaveLength(2);
  });

  it('ignores planTier for a non-ElevenLabs provider', () => {
    const result = checkShareableAudioAllowed({
      provider: 'deepgram',
      planTier: null,
      modelIsBeta: false,
      env: {},
    });
    expect(result.allowed).toBe(true);
  });

  it('overrides a refusal when the env var is set, and returns an explicit warning', () => {
    const result = checkShareableAudioAllowed({
      provider: 'elevenlabs',
      planTier: 'free',
      modelIsBeta: false,
      env: { [SHAREABLE_AUDIO_OVERRIDE_ENV_VAR]: '1' },
    });
    expect(result.allowed).toBe(true);
    expect(result.warnings[0]).toMatch(/WARNING/);
    expect(result.warnings[0]).toMatch(/free tier/i);
  });

  it('does not override on an unrecognized env value', () => {
    const result = checkShareableAudioAllowed({
      provider: 'elevenlabs',
      planTier: 'free',
      modelIsBeta: false,
      env: { [SHAREABLE_AUDIO_OVERRIDE_ENV_VAR]: 'nope' },
    });
    expect(result.allowed).toBe(false);
  });
});

describe('assertShareableAudioAllowed', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('does not throw and writes nothing when allowed outright', () => {
    expect(() =>
      assertShareableAudioAllowed({
        provider: 'elevenlabs',
        planTier: 'creator',
        modelIsBeta: false,
        env: {},
      }),
    ).not.toThrow();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('throws ShareableAudioGuardError when refused with no override', () => {
    expect(() =>
      assertShareableAudioAllowed({
        provider: 'elevenlabs',
        planTier: 'free',
        modelIsBeta: false,
        env: {},
      }),
    ).toThrow(ShareableAudioGuardError);
  });

  it('prints the explicit warning to stderr and proceeds when overridden', () => {
    expect(() =>
      assertShareableAudioAllowed({
        provider: 'elevenlabs',
        planTier: 'free',
        modelIsBeta: false,
        env: { [SHAREABLE_AUDIO_OVERRIDE_ENV_VAR]: 'true' },
      }),
    ).not.toThrow();
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stderrSpy.mock.calls[0]?.[0]).toMatch(/WARNING/);
  });
});
