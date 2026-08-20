import { ELEVENLABS_FREE_TIER_NAMES } from '../tts/elevenlabs/constants.js';

/** Set to `1` or `true` to render anyway despite a refusal, printing an explicit warning (AC7). */
export const SHAREABLE_AUDIO_OVERRIDE_ENV_VAR = 'WAGGLE_ALLOW_UNLICENSED_AUDIO';

export interface ShareableAudioCheckInput {
  readonly provider: string;
  /** The ElevenLabs plan tier (from `ElevenLabsAdapter.fetchAccountTier()`), or `null` for a non-ElevenLabs provider. */
  readonly planTier: string | null;
  readonly modelIsBeta: boolean;
  readonly env?: NodeJS.ProcessEnv;
}

export interface ShareableAudioCheckResult {
  readonly allowed: boolean;
  readonly blockedReasons: readonly string[];
  readonly warnings: readonly string[];
}

function isOverrideSet(env: NodeJS.ProcessEnv): boolean {
  const raw = env[SHAREABLE_AUDIO_OVERRIDE_ENV_VAR];
  return raw === '1' || raw?.toLowerCase() === 'true';
}

/**
 * AC7: refuses to render shareable audio when the ElevenLabs plan is free
 * tier, or when the selected model is flagged beta (ADR-006 /
 * corpus: "Never render shareable audio on free tier"; "beta-model output
 * is excluded" from the commercial license). Pure function: does not read
 * `process.env` unless the caller omits `env`, and never writes to
 * stdout/stderr itself, so it is trivially unit-testable; `assertShareableAudioAllowed`
 * below is the side-effecting wrapper the CLI actually calls.
 */
export function checkShareableAudioAllowed(
  input: ShareableAudioCheckInput,
): ShareableAudioCheckResult {
  const env = input.env ?? process.env;
  const reasons: string[] = [];

  if (
    input.provider === 'elevenlabs' &&
    input.planTier !== null &&
    ELEVENLABS_FREE_TIER_NAMES.has(input.planTier.toLowerCase())
  ) {
    reasons.push(
      `ElevenLabs plan is "${input.planTier}" (free tier). Free-tier audio requires attribution and is not licensed for shareable/customer-facing renders.`,
    );
  }
  if (input.modelIsBeta) {
    reasons.push(
      'The selected TTS model is flagged beta. Beta-model output is excluded from the commercial license.',
    );
  }

  if (reasons.length === 0) {
    return { allowed: true, blockedReasons: [], warnings: [] };
  }

  if (isOverrideSet(env)) {
    return {
      allowed: true,
      blockedReasons: [],
      warnings: [
        `WARNING: ${SHAREABLE_AUDIO_OVERRIDE_ENV_VAR} is set; rendering anyway despite: ${reasons.join(' ')}`,
      ],
    };
  }

  return { allowed: false, blockedReasons: reasons, warnings: [] };
}

/** Thrown by `assertShareableAudioAllowed` when the guardrail refuses and no override is set. */
export class ShareableAudioGuardError extends Error {
  constructor(reasons: readonly string[]) {
    super(
      `Refusing to render shareable audio:\n${reasons.map((r) => `  - ${r}`).join('\n')}\nSet ${SHAREABLE_AUDIO_OVERRIDE_ENV_VAR}=1 to override (prints an explicit warning and proceeds anyway).`,
    );
    this.name = 'ShareableAudioGuardError';
  }
}

/**
 * The side-effecting entry point the narrate pipeline calls before
 * synthesizing shareable audio: writes any override warning to stderr,
 * then throws `ShareableAudioGuardError` if still not allowed.
 */
export function assertShareableAudioAllowed(input: ShareableAudioCheckInput): void {
  const result = checkShareableAudioAllowed(input);
  for (const warning of result.warnings) {
    process.stderr.write(`${warning}\n`);
  }
  if (!result.allowed) {
    throw new ShareableAudioGuardError(result.blockedReasons);
  }
}
