import { describe, expect, it } from 'vitest';
import { describeR2EnvRequirements, R2_ENV_VARS, readR2ConfigFromEnv } from '../src/r2/env.js';

const FULL_ENV: NodeJS.ProcessEnv = {
  WAGGLE_R2_ACCOUNT_ID: 'acct123',
  WAGGLE_R2_ACCESS_KEY_ID: 'AKIDEXAMPLE',
  WAGGLE_R2_SECRET_ACCESS_KEY: 'secret',
  WAGGLE_R2_BUCKET: 'my-bucket',
  WAGGLE_R2_PUBLIC_BASE_URL: 'https://cdn.example.com/',
};

/**
 * prd-008 AC3: "absent env config, the command must explain exactly which
 * variables to set. Do not fail obscurely." These tests are the contract
 * for that guidance text, not just the config parsing.
 */
describe('AC3: readR2ConfigFromEnv', () => {
  it('returns ok:true with every field when all five variables are set', () => {
    const result = readR2ConfigFromEnv(FULL_ENV);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config).toEqual({
        accountId: 'acct123',
        accessKeyId: 'AKIDEXAMPLE',
        secretAccessKey: 'secret',
        bucket: 'my-bucket',
        // Trailing slash stripped so URL-joining never double-slashes.
        publicBaseUrl: 'https://cdn.example.com',
      });
    }
  });

  it('reports every missing variable, not just the first', () => {
    const result = readR2ConfigFromEnv({ WAGGLE_R2_BUCKET: 'my-bucket' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect([...result.missing].sort()).toEqual(
        ['accessKeyId', 'accountId', 'publicBaseUrl', 'secretAccessKey'].sort(),
      );
    }
  });

  it('treats an empty or whitespace-only value as missing', () => {
    const result = readR2ConfigFromEnv({ ...FULL_ENV, WAGGLE_R2_BUCKET: '   ' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual(['bucket']);
    }
  });

  it('returns ok:false when no variables at all are set', () => {
    const result = readR2ConfigFromEnv({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toHaveLength(Object.keys(R2_ENV_VARS).length);
    }
  });
});

describe('AC3: describeR2EnvRequirements', () => {
  it('names every WAGGLE_R2_* variable by its exact env var name', () => {
    const text = describeR2EnvRequirements();
    for (const varName of Object.values(R2_ENV_VARS)) {
      expect(text).toContain(varName);
    }
  });

  it('narrows to only the missing variables when given a specific list', () => {
    const text = describeR2EnvRequirements(['bucket']);
    expect(text).toContain(R2_ENV_VARS.bucket);
    expect(text).not.toContain(R2_ENV_VARS.accountId);
  });
});
