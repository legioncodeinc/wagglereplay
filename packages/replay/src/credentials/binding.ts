import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  type CredentialSet,
  CredentialsFileSchema,
  createSensitiveTextScrubber,
  credentialsPath,
  type SensitiveTextScrubber,
  type WalkthroughStep,
} from '@waggle/ir';
import { z } from 'zod';
import { scrubActTimeCredentialError } from '../security/credential-scrub.js';
import { generateTotp } from './totp.js';

export type CredentialFieldKind = 'username' | 'secret' | 'totp';

export interface CredentialStepMatch {
  readonly fieldKind: CredentialFieldKind;
  /** Environment variable name only. Never a resolved value. */
  readonly envRef: string;
}

export type ChangeStep = Extract<WalkthroughStep, { type: 'change' }>;

export interface CredentialBindings {
  /** Bound set id from studio.json, or null when this project is unbound. */
  readonly credentialSetId: string | null;
  readonly matchStep: (step: ChangeStep) => CredentialStepMatch | null;
  /**
   * Primary act-time boundary. The resolved value remains local to this
   * call, and an action error is scrubbed before it can reach a run report.
   */
  readonly actWithValue: (
    step: ChangeStep,
    action: (resolvedValue: string) => Promise<void>,
  ) => Promise<void>;
  /** Scrubs bound environment reference names from persisted report text. */
  readonly scrubMessage: SensitiveTextScrubber;
  readonly isCredentialStep: (step: WalkthroughStep, stepIndex: number) => boolean;
}

export interface CreateCredentialBindingsOptions {
  readonly projectDir: string;
  /** Captured by reference, but no property is read until an act-time callback runs. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Injected clock for deterministic RFC 6238 tests. Read only for TOTP steps. */
  readonly now?: () => number;
}

export type CredentialBindingErrorCode =
  | 'credentials-invalid'
  | 'studio-invalid'
  | 'bound-set-missing'
  | 'ambiguous-step'
  | 'missing-env'
  | 'invalid-totp-seed'
  | 'credential-act-failed';

export class CredentialBindingError extends Error {
  readonly code: CredentialBindingErrorCode;
  readonly credentialSetId: string | undefined;
  readonly envRef: string | undefined;

  constructor(
    code: CredentialBindingErrorCode,
    message: string,
    metadata: { credentialSetId?: string; envRef?: string } = {},
  ) {
    super(message);
    this.name = 'CredentialBindingError';
    this.code = code;
    this.credentialSetId = metadata.credentialSetId;
    this.envRef = metadata.envRef;
  }
}

const StudioCredentialBindingSchema = z.object({
  credentialSetId: z.string().trim().min(1).nullable(),
});

function parseJsonFile(filePath: string, code: CredentialBindingErrorCode): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  } catch {
    throw new CredentialBindingError(code, `Credential configuration at "${filePath}" is invalid.`);
  }
}

function loadCredentialSets(projectDir: string): CredentialSet[] {
  const filePath = credentialsPath(projectDir);
  if (!existsSync(filePath)) {
    return [];
  }
  const result = CredentialsFileSchema.safeParse(parseJsonFile(filePath, 'credentials-invalid'));
  if (!result.success) {
    throw new CredentialBindingError(
      'credentials-invalid',
      `Credential references at "${filePath}" failed validation.`,
    );
  }
  return result.data.credentials;
}

function loadBoundSetId(projectDir: string): string | null {
  const filePath = path.join(projectDir, 'studio.json');
  if (!existsSync(filePath)) {
    return null;
  }
  const result = StudioCredentialBindingSchema.safeParse(parseJsonFile(filePath, 'studio-invalid'));
  if (!result.success) {
    throw new CredentialBindingError(
      'studio-invalid',
      `Credential binding at "${filePath}" failed validation.`,
    );
  }
  return result.data.credentialSetId;
}

function selectorStrings(step: ChangeStep): string[] {
  return step.selectors.flatMap((alternative) =>
    typeof alternative === 'string' ? [alternative] : alternative,
  );
}

function selectorBindings(credentialSet: CredentialSet): Map<string, CredentialStepMatch> {
  const bindings = new Map<string, CredentialStepMatch>();
  const add = (
    fieldKind: CredentialFieldKind,
    envRef: string | undefined,
    selectors: readonly string[],
  ): void => {
    if (envRef === undefined) return;
    for (const selector of selectors) {
      bindings.set(selector, { fieldKind, envRef });
    }
  };
  add('username', credentialSet.username_env, credentialSet.applies_to.username);
  add('secret', credentialSet.secret_env, credentialSet.applies_to.secret);
  add('totp', credentialSet.totp_seed_env, credentialSet.applies_to.totp);
  return bindings;
}

/**
 * Reads reference-only project files and returns callbacks compatible with
 * runRegen/runReplaySession. Environment values are not read here. They are
 * accessed only when actWithValue runs.
 */
export function createCredentialBindings(
  options: CreateCredentialBindingsOptions,
): CredentialBindings {
  const credentialSets = loadCredentialSets(options.projectDir);
  const credentialSetId = loadBoundSetId(options.projectDir);
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;

  if (credentialSetId === null) {
    const actWithValue = async (
      step: ChangeStep,
      action: (resolvedValue: string) => Promise<void>,
    ): Promise<void> => {
      await action(step.value);
    };
    return {
      credentialSetId: null,
      matchStep: () => null,
      actWithValue,
      scrubMessage: (message) => message,
      isCredentialStep: () => false,
    };
  }

  const credentialSet = credentialSets.find((candidate) => candidate.id === credentialSetId);
  if (credentialSet === undefined) {
    throw new CredentialBindingError(
      'bound-set-missing',
      `Bound credential set "${credentialSetId}" does not exist.`,
      { credentialSetId },
    );
  }
  const bindings = selectorBindings(credentialSet);
  const scrubMessage = createSensitiveTextScrubber({
    envNames: [
      credentialSet.username_env,
      credentialSet.secret_env,
      credentialSet.totp_seed_env,
    ].filter((envRef): envRef is string => envRef !== undefined),
  });

  const matchStep = (step: ChangeStep): CredentialStepMatch | null => {
    const matches = new Map<CredentialFieldKind, CredentialStepMatch>();
    for (const selector of selectorStrings(step)) {
      const match = bindings.get(selector);
      if (match !== undefined) matches.set(match.fieldKind, match);
    }
    if (matches.size > 1) {
      throw new CredentialBindingError(
        'ambiguous-step',
        'A change step matches more than one credential field kind.',
        { credentialSetId },
      );
    }
    return matches.values().next().value ?? null;
  };

  const resolveStepValue = (
    step: ChangeStep,
  ): { match: CredentialStepMatch | null; value: string } => {
    const match = matchStep(step);
    if (match === null) return { match, value: step.value };

    const envValue = env[match.envRef];
    if (envValue === undefined || envValue.length === 0) {
      throw new CredentialBindingError(
        'missing-env',
        `Credential environment reference ${match.envRef} is not set.`,
        { credentialSetId, envRef: match.envRef },
      );
    }

    let resolvedValue = envValue;
    if (match.fieldKind === 'totp') {
      try {
        resolvedValue = generateTotp(envValue, { timeMs: now() });
      } catch (error) {
        const safeReason = scrubActTimeCredentialError(error, match.envRef, envValue);
        throw new CredentialBindingError(
          'invalid-totp-seed',
          `Could not generate a TOTP from ${match.envRef}: ${safeReason}`,
          { credentialSetId, envRef: match.envRef },
        );
      }
    }

    return { match, value: resolvedValue };
  };

  const actWithValue = async (
    step: ChangeStep,
    action: (resolvedValue: string) => Promise<void>,
  ): Promise<void> => {
    const resolved = resolveStepValue(step);
    if (resolved.match === null) {
      await action(resolved.value);
      return;
    }

    try {
      await action(resolved.value);
    } catch (error) {
      const safeReason = scrubActTimeCredentialError(error, resolved.match.envRef, resolved.value);
      throw new CredentialBindingError(
        'credential-act-failed',
        `Credential fill failed: ${safeReason}`,
        { credentialSetId, envRef: resolved.match.envRef },
      );
    }
  };

  return {
    credentialSetId,
    matchStep,
    actWithValue,
    isCredentialStep: (step) => step.type === 'change' && matchStep(step) !== null,
    scrubMessage,
  };
}
