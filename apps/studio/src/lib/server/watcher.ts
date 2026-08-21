import { existsSync, type FSWatcher, watch } from 'node:fs';
import path from 'node:path';

/**
 * AC2 task 3: "Project file watcher + IR load into runes state."
 *
 * Watches the project files Studio's own UI can go stale over - a new IR
 * version and `heatmap.json`/`predraft.json` (written by `waggle record` /
 * `finalizeSession` running outside this browser tab), `narration/script.json`
 * (written by another Studio tab, or by hand), and `studio.json` - and
 * notifies subscribers so `/api/watch` (a Server-Sent Events stream) can
 * tell the client to reload.
 *
 * Two non-recursive `fs.watch` calls rather than one recursive one:
 * `recursive: true` is only implemented on macOS and Windows in Node; a
 * Linux dev machine would silently stop getting `narration/script.json`
 * change events with a recursive watch. Watching the project root and
 * `narration/` separately works identically on all three platforms.
 */

export type ProjectChangeListener = () => void;

const WATCHED_ROOT_PATTERN =
  /^(waggle\.json|walkthrough\.v\d+\.json|heatmap\.json|predraft\.json|studio\.json)$/;

export interface ProjectWatcher {
  subscribe(listener: ProjectChangeListener): () => void;
  close(): void;
}

/** One watcher per project directory, shared across every subscriber (every open `/api/watch` connection). */
const watchersByProjectDir = new Map<string, ProjectWatcher>();

function createWatcher(projectDir: string): ProjectWatcher {
  const listeners = new Set<ProjectChangeListener>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  const fsWatchers: FSWatcher[] = [];
  fsWatchers.push(
    watch(projectDir, (_event, filename) => {
      if (filename !== null && WATCHED_ROOT_PATTERN.test(filename)) notify();
    }),
  );

  const narrationDir = path.join(projectDir, 'narration');
  if (existsSync(narrationDir)) {
    fsWatchers.push(
      watch(narrationDir, (_event, filename) => {
        if (filename === 'script.json') notify();
      }),
    );
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      for (const watcher of fsWatchers) watcher.close();
      listeners.clear();
    },
  };
}

/** Returns the shared watcher for `projectDir`, creating it on first use. */
export function getProjectWatcher(projectDir: string): ProjectWatcher {
  const existing = watchersByProjectDir.get(projectDir);
  if (existing) return existing;
  const watcher = createWatcher(projectDir);
  watchersByProjectDir.set(projectDir, watcher);
  return watcher;
}
