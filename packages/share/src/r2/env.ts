/**
 * The optional R2 uploader's env configuration (prd-008 AC3, ADR-009: "An
 * optional uploader pushes render artifacts to the user's own R2 bucket
 * ... when configured"). Named `WAGGLE_R2_*` for the same reason every
 * other Waggle-specific env var in this workspace is prefixed
 * (`WAGGLE_TTS_PROVIDER`, `WAGGLE_FFMPEG_PATH`): no secret ever lives in a
 * project file (ADR-008), only an environment-variable name a project
 * file may reference.
 *
 * There are no live R2 credentials in this environment (nor should there
 * ever be committed anywhere): this module's whole job is to read
 * whichever of these variables ARE set and say, precisely, which ones are
 * not, rather than let a partially configured upload fail deep inside an
 * HTTP call.
 */

export const R2_ENV_VARS = {
  accountId: 'WAGGLE_R2_ACCOUNT_ID',
  accessKeyId: 'WAGGLE_R2_ACCESS_KEY_ID',
  secretAccessKey: 'WAGGLE_R2_SECRET_ACCESS_KEY',
  bucket: 'WAGGLE_R2_BUCKET',
  publicBaseUrl: 'WAGGLE_R2_PUBLIC_BASE_URL',
} as const;

const R2_ENV_VAR_DESCRIPTIONS: Record<keyof typeof R2_ENV_VARS, string> = {
  accountId:
    'Cloudflare account id (the R2 API endpoint is https://<account id>.r2.cloudflarestorage.com)',
  accessKeyId: 'R2 API token access key id (Cloudflare dashboard: R2 > Manage API tokens)',
  secretAccessKey: 'R2 API token secret access key (shown once, when the token is created)',
  bucket: 'name of the R2 bucket to upload the share bundle into',
  publicBaseUrl:
    "the base URL the bucket is served from (a connected custom domain, or the bucket's r2.dev URL) so a public download link can be printed",
};

export interface R2Config {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
  readonly publicBaseUrl: string;
}

export type R2ConfigResult =
  | { readonly ok: true; readonly config: R2Config }
  | { readonly ok: false; readonly missing: readonly (keyof typeof R2_ENV_VARS)[] };

/**
 * Reads every `WAGGLE_R2_*` variable from `env` and reports either a
 * complete config or exactly which keys are missing. Never throws: AC3
 * requires the CLI to explain what to set, which means the caller needs
 * the list of missing keys, not an exception naming only the first one.
 */
export function readR2ConfigFromEnv(env: NodeJS.ProcessEnv): R2ConfigResult {
  const missing: (keyof typeof R2_ENV_VARS)[] = [];
  const values: Partial<Record<keyof typeof R2_ENV_VARS, string>> = {};

  for (const key of Object.keys(R2_ENV_VARS) as (keyof typeof R2_ENV_VARS)[]) {
    const value = env[R2_ENV_VARS[key]];
    if (value === undefined || value.trim() === '') {
      missing.push(key);
    } else {
      values[key] = value;
    }
  }

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  return {
    ok: true,
    config: {
      accountId: values.accountId as string,
      accessKeyId: values.accessKeyId as string,
      secretAccessKey: values.secretAccessKey as string,
      bucket: values.bucket as string,
      publicBaseUrl: (values.publicBaseUrl as string).replace(/\/+$/, ''),
    },
  };
}

/**
 * The exact-guidance text AC3 requires when R2 is not configured: every
 * variable name, in one place, with what it is for. Used verbatim by
 * `waggle export --upload` so a user never has to guess a variable name.
 */
export function describeR2EnvRequirements(missing?: readonly (keyof typeof R2_ENV_VARS)[]): string {
  const keys = missing ?? (Object.keys(R2_ENV_VARS) as (keyof typeof R2_ENV_VARS)[]);
  const lines = keys.map((key) => `  ${R2_ENV_VARS[key]}: ${R2_ENV_VAR_DESCRIPTIONS[key]}`);
  return [
    'R2 upload is not configured. Set the following environment variable(s), then re-run with --upload:',
    ...lines,
  ].join('\n');
}
