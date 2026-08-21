import { existsSync, readFileSync } from 'node:fs';
import {
  CredentialsFileSchema,
  createSensitiveTextScrubber,
  credentialsPath,
  type SensitiveTextLiterals,
  type SensitiveTextScrubber,
  type WalkthroughFlow,
} from '@waggle/ir';

export class NarrationPrivacyConfigError extends Error {
  constructor() {
    super('Project credential references could not be validated for narration text scrubbing.');
    this.name = 'NarrationPrivacyConfigError';
  }
}

function credentialEnvNames(projectDir: string): string[] {
  const filePath = credentialsPath(projectDir);
  if (!existsSync(filePath)) return [];
  try {
    const result = CredentialsFileSchema.safeParse(JSON.parse(readFileSync(filePath, 'utf8')));
    if (!result.success) throw new NarrationPrivacyConfigError();
    return result.data.credentials.flatMap((credentialSet) =>
      [credentialSet.username_env, credentialSet.secret_env, credentialSet.totp_seed_env].filter(
        (envName): envName is string => envName !== undefined,
      ),
    );
  } catch (error) {
    if (error instanceof NarrationPrivacyConfigError) throw error;
    throw new NarrationPrivacyConfigError();
  }
}

function flaggedPlaceholders(flow: WalkthroughFlow): string[] {
  return flow.steps.flatMap((step) =>
    step.type === 'change' && step.waggle.masked ? [step.value] : [],
  );
}

/**
 * Mandatory text scrubber for script, TTS request, transcript, words, and
 * caption boundaries. It does not modify audio or image bytes.
 */
export function createNarrationTextScrubber(
  projectDir: string,
  flow: WalkthroughFlow,
  additional: SensitiveTextLiterals = {},
): SensitiveTextScrubber {
  return createSensitiveTextScrubber({
    envNames: [...credentialEnvNames(projectDir), ...(additional.envNames ?? [])],
    values: additional.values,
    placeholders: [...flaggedPlaceholders(flow), ...(additional.placeholders ?? [])],
    canaries: additional.canaries,
  });
}
