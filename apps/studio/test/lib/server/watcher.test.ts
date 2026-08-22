// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getProjectWatcher } from '../../../src/lib/server/watcher.js';

/** Task 3: "Project file watcher..." - proves a change to a watched top-level project file notifies subscribers. */
describe('getProjectWatcher', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    for (const teardown of cleanup.splice(0)) teardown();
  });

  it('notifies a subscriber when a watched project file changes', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'waggle-studio-watch-'));
    const manifestFile = path.join(dir, 'waggle.json');
    writeFileSync(manifestFile, '{}', 'utf8');
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));

    const watcher = getProjectWatcher(dir);
    cleanup.push(() => watcher.close());

    const notified = new Promise<void>((resolve) => {
      const unsubscribe = watcher.subscribe(() => {
        unsubscribe();
        resolve();
      });
    });

    // Give fs.watch a beat to register before the write it's meant to see.
    await new Promise((resolve) => setTimeout(resolve, 100));
    writeFileSync(manifestFile, '{"changed":true}', 'utf8');

    await notified;
  }, 10_000);
});
