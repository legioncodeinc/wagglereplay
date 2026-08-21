import { existsSync, readFileSync } from 'node:fs';
import {
  CredentialsFileSchema,
  createSensitiveTextScrubber,
  credentialsPath,
  type SensitiveTextLiterals,
  type SensitiveTextScrubber,
  type WalkthroughFlow,
} from '@waggle/ir';

export class PreDraftPrivacyConfigError extends Error {
  constructor() {
    super('Project credential references could not be validated for text scrubbing.');
    this.name = 'PreDraftPrivacyConfigError';
  }
}

function credentialEnvNames(projectDir: string): string[] {
  const filePath = credentialsPath(projectDir);
  if (!existsSync(filePath)) return [];

  try {
    const result = CredentialsFileSchema.safeParse(JSON.parse(readFileSync(filePath, 'utf8')));
    if (!result.success) throw new PreDraftPrivacyConfigError();
    return result.data.credentials.flatMap((credentialSet) =>
      [credentialSet.username_env, credentialSet.secret_env, credentialSet.totp_seed_env].filter(
        (envName): envName is string => envName !== undefined,
      ),
    );
  } catch (error) {
    if (error instanceof PreDraftPrivacyConfigError) throw error;
    throw new PreDraftPrivacyConfigError();
  }
}

function flaggedPlaceholders(flow: WalkthroughFlow): string[] {
  return flow.steps.flatMap((step) =>
    step.type === 'change' && step.waggle.masked ? [step.value] : [],
  );
}

/**
 * Builds the text-only scrubber invoked for every pre-draft provider request,
 * provider reply, warning, and persisted description. Image bytes are not
 * modified by this text utility.
 */
export function createPreDraftTextScrubber(
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
