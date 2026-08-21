import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { WalkthroughStep } from '@waggle/ir';
import { afterEach, describe, expect, it } from 'vitest';
import { CredentialBindingError, createCredentialBindings } from '../../src/credentials/binding.js';

type ChangeStep = Extract<WalkthroughStep, { type: 'change' }>;

function changeStep(selectors: ChangeStep['selectors'], value = '[credential]'): ChangeStep {
  return {
    type: 'change',
    selectors,
    value,
    waggle: { classification: 'input', masked: true },
  };
}

async function valueObservedInsideAct(
  bindings: ReturnType<typeof createCredentialBindings>,
  step: ChangeStep,
): Promise<string> {
  let observed = '';
  await bindings.actWithValue(step, async (value) => {
    observed = value;
  });
  return observed;
}

describe('project credential bindings (prd-010 AC2)', () => {
  const cleanup: string[] = [];
  afterEach(() => {
    for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function project(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'waggle-creds-'));
    cleanup.push(dir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, 'credentials.json'),
      JSON.stringify({
        schemaVersion: 1,
        credentials: [
          {
            id: 'demo',
            label: 'Demo',
            username_env: 'DEMO_USER',
            secret_env: 'DEMO_SECRET',
            totp_seed_env: 'DEMO_TOTP',
            applies_to: {
              username: ['#username'],
              secret: ['#password'],
              totp: ['#code'],
            },
          },
        ],
      }),
    );
    writeFileSync(path.join(dir, 'studio.json'), JSON.stringify({ credentialSetId: 'demo' }));
    return dir;
  }

  it('does not read env values until the act callback and matches every selector alternative', async () => {
    const reads: string[] = [];
    const env = new Proxy(
      { DEMO_USER: 'canary-user', DEMO_SECRET: 'canary-secret', DEMO_TOTP: 'JBSWY3DPEHPK3PXP' },
      {
        get(target, property: string) {
          reads.push(property);
          return target[property as keyof typeof target];
        },
      },
    );
    const bindings = createCredentialBindings({ projectDir: project(), env });
    expect(reads).toEqual([]);

    const fallbackStep = changeStep(['#stale', '#password']);
    expect(bindings.matchStep(fallbackStep)).toEqual({
      fieldKind: 'secret',
      envRef: 'DEMO_SECRET',
    });
    expect(bindings.scrubMessage('Missing DEMO_SECRET during replay')).toBe(
      'Missing [REDACTED] during replay',
    );
    expect(bindings.isCredentialStep(fallbackStep, 9)).toBe(true);
    expect(reads).toEqual([]);
    expect(await valueObservedInsideAct(bindings, fallbackStep)).toBe('canary-secret');
    expect(reads).toEqual(['DEMO_SECRET']);
  });

  it('matches a configured selector inside a chain alternative', async () => {
    const bindings = createCredentialBindings({
      projectDir: project(),
      env: { DEMO_USER: 'alice' },
    });
    expect(await valueObservedInsideAct(bindings, changeStep([['iframe#auth', '#username']]))).toBe(
      'alice',
    );
  });

  it('generates TOTP at callback time using the injected clock', async () => {
    const bindings = createCredentialBindings({
      projectDir: project(),
      env: { DEMO_TOTP: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' },
      now: () => 59_000,
    });
    expect(await valueObservedInsideAct(bindings, changeStep(['#code']))).toBe('287082');
  });

  it('keeps the resolved value inside a void-only action boundary', async () => {
    const bindings = createCredentialBindings({
      projectDir: project(),
      env: { DEMO_SECRET: 'callback-only-canary' },
    });
    let observedInsideAction = '';
    const result = await bindings.actWithValue(changeStep(['#password']), async (value) => {
      observedInsideAction = value;
    });

    expect(observedInsideAction).toBe('callback-only-canary');
    expect(result).toBeUndefined();
  });

  it('returns the recorded placeholder without reading env for unbound projects', async () => {
    const dir = project();
    writeFileSync(path.join(dir, 'studio.json'), JSON.stringify({ credentialSetId: null }));
    const env = new Proxy(
      {},
      {
        get: () => {
          throw new Error('env must not be read');
        },
      },
    );
    const bindings = createCredentialBindings({ projectDir: dir, env });
    const step = changeStep(['#password']);
    expect(bindings.isCredentialStep(step, 0)).toBe(false);
    expect(bindings.scrubMessage('DEMO_SECRET remains ordinary text when unbound')).toBe(
      'DEMO_SECRET remains ordinary text when unbound',
    );
    expect(await valueObservedInsideAct(bindings, step)).toBe('[credential]');
  });

  it('never includes a canary value in missing or invalid seed errors', async () => {
    const dir = project();
    const missing = createCredentialBindings({ projectDir: dir, env: {} });
    await expect(valueObservedInsideAct(missing, changeStep(['#password']))).rejects.toMatchObject({
      code: 'missing-env',
      envRef: 'DEMO_SECRET',
    });

    const canary = 'canary-invalid-seed-[.*]';
    const invalid = createCredentialBindings({ projectDir: dir, env: { DEMO_TOTP: canary } });
    let thrown: unknown;
    try {
      await valueObservedInsideAct(invalid, changeStep(['#code']));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CredentialBindingError);
    expect(JSON.stringify(thrown)).not.toContain(canary);
    expect((thrown as Error).message).not.toContain(canary);
  });

  it('scrubs a resolved canary from an act-time error and leaves public metadata clean', async () => {
    const canary = 'CANARY-fill.value+[42]';
    const step = changeStep(['#password']);
    const bindings = createCredentialBindings({
      projectDir: project(),
      env: { DEMO_SECRET: canary },
    });

    let thrown: unknown;
    try {
      await bindings.actWithValue(step, async (value) => {
        throw new Error(`Playwright fill(${value}) failed for DEMO_SECRET`);
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CredentialBindingError);
    expect(thrown).toMatchObject({ code: 'credential-act-failed', envRef: 'DEMO_SECRET' });
    expect((thrown as Error).message).toContain('[REDACTED]');
    expect((thrown as Error).message).not.toContain(canary);
    expect(JSON.stringify(thrown)).not.toContain(canary);
    expect(step.value).toBe('[credential]');
    expect(
      JSON.stringify({
        credentialSetId: bindings.credentialSetId,
        match: bindings.matchStep(step),
      }),
    ).not.toContain(canary);
  });

  it('rejects a change step whose alternatives map to different credential kinds', () => {
    const bindings = createCredentialBindings({ projectDir: project(), env: {} });
    expect(() => bindings.matchStep(changeStep(['#username', '#password']))).toThrow(
      /more than one credential field kind/,
    );
  });
});
