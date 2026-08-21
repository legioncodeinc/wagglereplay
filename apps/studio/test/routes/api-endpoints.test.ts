import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { RequestEvent } from '@sveltejs/kit';
import { credentialsPath, subdirPath, writeNextIrVersion } from '@waggle/ir';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultStudioSettings } from '../../src/lib/schemas/studio-settings.js';
import { resetProjectDirCacheForTests } from '../../src/lib/server/project-context.js';
import { writeStudioSettings } from '../../src/lib/server/settings-store.js';
import {
  GET as getCredentialMarkings,
  PUT as putCredentialMarking,
} from '../../src/routes/api/credential-markings/+server.js';
import { GET as getFrame } from '../../src/routes/api/frames/[version]/[stepDir]/[fileName]/+server.js';
import { PUT as putSettings } from '../../src/routes/api/settings/+server.js';
import { PUT as putDescription } from '../../src/routes/api/steps/[stepIndex]/description/+server.js';
import { seedProjectDir } from '../helpers/fixtures.js';
import { buildTwoStepFlow } from '../helpers/flow-fixture.js';

function fakeEvent(params: Record<string, string>, request?: Request): RequestEvent {
  return { params, request } as unknown as RequestEvent;
}

describe('AC3/AC4/AC6 API routes', () => {
  const cleanup: string[] = [];

  beforeEach(() => {
    resetProjectDirCacheForTests();
  });

  afterEach(() => {
    delete process.env.WAGGLE_PROJECT_DIR;
    delete process.env.DEMO_USER;
    resetProjectDirCacheForTests();
    for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('AC3: serves an extracted frame PNG with a 400 for a path-traversal file name', async () => {
    const projectDir = seedProjectDir();
    cleanup.push(projectDir);
    process.env.WAGGLE_PROJECT_DIR = projectDir;

    const stepDir = path.join(subdirPath(projectDir, 'steps'), 'v1', 'step-000');
    mkdirSync(stepDir, { recursive: true });
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    writeFileSync(path.join(stepDir, 'settled.png'), pngBytes);

    const response = await getFrame(
      fakeEvent({ version: '1', stepDir: 'step-000', fileName: 'settled.png' }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    const body = new Uint8Array(await response.arrayBuffer());
    expect(body).toEqual(pngBytes);

    // GET is a synchronous handler, so a rejected SvelteKit `error()` call
    // throws synchronously rather than returning a rejected promise -
    // `.rejects` would never see it.
    expect(() =>
      getFrame(fakeEvent({ version: '1', stepDir: 'step-000', fileName: '../../../etc/passwd' })),
    ).toThrowError(expect.objectContaining({ status: 400 }));
  });

  it('AC4: PUT /api/steps/:stepIndex/description clears the machine-drafted flag', async () => {
    const projectDir = seedProjectDir();
    cleanup.push(projectDir);
    process.env.WAGGLE_PROJECT_DIR = projectDir;
    mkdirSync(subdirPath(projectDir, 'narration'), { recursive: true });
    writeNextIrVersion(projectDir, buildTwoStepFlow());

    // Seed narration/script.json the same way `+page.server.ts`'s load does.
    const { ensureNarrationScript } = await import('../../src/lib/server/narration-store.js');
    ensureNarrationScript(projectDir, buildTwoStepFlow(), null);

    const request = new Request('http://127.0.0.1:4310/api/steps/0/description', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Click the start button' }),
    });
    const response = await putDescription(fakeEvent({ stepIndex: '0' }, request));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      segment: { approved: boolean; approvedText: string };
    };
    expect(body.segment.approved).toBe(true);
    expect(body.segment.approvedText).toBe('Click the start button');
  });

  it('AC6: PUT /api/settings persists a partial update', async () => {
    const projectDir = seedProjectDir();
    cleanup.push(projectDir);
    process.env.WAGGLE_PROJECT_DIR = projectDir;

    const request = new Request('http://127.0.0.1:4310/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brandKitId: 'acme', presetIds: ['16x9'] }),
    });
    const response = await putSettings(fakeEvent({}, request));
    expect(response.status).toBe(200);
    const settings = await response.json();
    expect(settings.brandKitId).toBe('acme');
    expect(settings.presetIds).toEqual(['16x9']);
    // Never a credential value: only the schema's known reference fields exist.
    expect(Object.keys(settings).sort()).toEqual(
      ['brandKitId', 'credentialSetId', 'presetIds', 'schemaVersion', 'voiceId'].sort(),
    );
  });

  it('AC6: PUT /api/settings rejects an invalid patch with 400', async () => {
    const projectDir = seedProjectDir();
    cleanup.push(projectDir);
    process.env.WAGGLE_PROJECT_DIR = projectDir;

    const request = new Request('http://127.0.0.1:4310/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brandKitId: 123 }),
    });
    await expect(putSettings(fakeEvent({}, request))).rejects.toMatchObject({ status: 400 });
  });

  it('PRD-010 AC4: persists a marking into canonical applies_to and exposes selector roles only', async () => {
    const projectDir = seedProjectDir();
    cleanup.push(projectDir);
    process.env.WAGGLE_PROJECT_DIR = projectDir;
    writeFileSync(
      credentialsPath(projectDir),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          credentials: [
            {
              id: 'demo',
              label: 'Demo account',
              username_env: 'DEMO_USER',
              secret_env: 'DEMO_PASSWORD',
              applies_to: { username: [], secret: [], totp: [] },
            },
          ],
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    writeStudioSettings(projectDir, {
      ...defaultStudioSettings(),
      credentialSetId: 'demo',
    });
    process.env.DEMO_USER = 'value-that-must-never-leave-the-server';

    const request = new Request('http://127.0.0.1:4310/api/credential-markings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selector: '[data-testid="opaque-login"]', kind: 'username' }),
    });
    const putResponse = await putCredentialMarking(fakeEvent({}, request));
    expect(putResponse.status).toBe(200);
    const persisted = readFileSync(credentialsPath(projectDir), 'utf8');
    expect(JSON.parse(persisted).credentials[0].applies_to.username).toEqual([
      '[data-testid="opaque-login"]',
    ]);

    const getResponse = await getCredentialMarkings();
    const safeBody = JSON.stringify(await getResponse.json());
    expect(safeBody).toContain('[data-testid=\\"opaque-login\\"]');
    expect(safeBody).not.toContain('DEMO_USER');
    expect(safeBody).not.toContain('DEMO_PASSWORD');
    expect(safeBody).not.toContain(process.env.DEMO_USER);
  });
});
