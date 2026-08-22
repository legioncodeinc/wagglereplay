// SPDX-License-Identifier: AGPL-3.0-or-later
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../src/cli.js';
import { ExitCode } from '../src/exit-codes.js';
import { assertPortAvailable, resolveStudioServerEntry } from '../src/studio/launch.js';

/**
 * AC1: `waggle studio` launch mechanics.
 *
 * `resolveStudioServerEntry`/`assertPortAvailable` are covered directly
 * (no subprocess needed). The happy-path proof that the REAL
 * `@waggle/studio` build actually boots and serves a request is done by
 * spawning `node <resolved entry>` exactly the way
 * `../src/commands/studio.ts`'s `runStudioServer` does, rather than
 * through `runCli()`: `runCli(['studio', ...])` blocks until its child
 * process exits (by design, so a real terminal session behaves like any
 * other dev server), which this test process cannot cleanly interrupt
 * from inside itself. Spawning directly gives the test full control to
 * poll, assert, and kill.
 */
describe('waggle studio (AC1)', () => {
  const cleanupDirs: string[] = [];
  const children: ChildProcess[] = [];

  afterEach(() => {
    for (const child of children.splice(0)) {
      child.kill('SIGTERM');
    }
    for (const dir of cleanupDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempParentDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'waggle-cli-studio-'));
    cleanupDirs.push(dir);
    return dir;
  }

  it('resolves the built @waggle/studio server entry', () => {
    // apps/studio must be built (`pnpm --filter @waggle/studio build`)
    // before this assertion can pass; the DoD run builds it as part of
    // the workspace `pnpm build`.
    const entryPath = resolveStudioServerEntry();
    expect(entryPath.endsWith(path.join('build', 'index.js'))).toBe(true);
  });

  it('`waggle studio` against a directory with no manifest exits PROJECT_NOT_FOUND without spawning anything', async () => {
    const parent = tempParentDir();
    const code = await runCli(['node', 'waggle', 'studio', '--project', parent]);
    expect(code).toBe(ExitCode.PROJECT_NOT_FOUND);
  });

  it('assertPortAvailable throws STUDIO_PORT_UNAVAILABLE when the port is already bound', async () => {
    const occupied = net.createServer();
    await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve));
    const address = occupied.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;

    await expect(assertPortAvailable(port, '127.0.0.1')).rejects.toMatchObject({
      code: ExitCode.STUDIO_PORT_UNAVAILABLE,
    });

    await new Promise<void>((resolve) => occupied.close(() => resolve()));
  });

  it('the real built server boots on localhost, serves the project, and its upload route matches the extension contract', async () => {
    const parent = tempParentDir();
    const initCode = await runCli(['node', 'waggle', 'init', 'demo', '--dir', parent]);
    expect(initCode).toBe(ExitCode.SUCCESS);
    const projectDir = path.join(parent, 'demo');

    const entryPath = resolveStudioServerEntry();
    const port = await findFreePort();

    const child = spawn(process.execPath, [entryPath], {
      env: {
        ...process.env,
        WAGGLE_PROJECT_DIR: projectDir,
        HOST: '127.0.0.1',
        PORT: String(port),
        BODY_SIZE_LIMIT: 'Infinity',
      },
      stdio: 'pipe',
    });
    children.push(child);

    await waitForServer(`http://127.0.0.1:${String(port)}/`, 15_000);

    const pageResponse = await fetch(`http://127.0.0.1:${String(port)}/`);
    expect(pageResponse.status).toBe(200);
    const html = await pageResponse.text();
    expect(html).toContain('demo');

    // The extension's exact upload URL shape (apps/extension/src/lib/upload-client.ts).
    const eventsResponse = await fetch(
      `http://127.0.0.1:${String(port)}/waggle/sessions/probe-session/events`,
      { method: 'POST', headers: { 'content-type': 'application/x-ndjson' }, body: '' },
    );
    expect(eventsResponse.status).toBe(204);
  }, 30_000);
});

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Server at ${url} did not become ready in time: ${String(lastError)}`);
}
