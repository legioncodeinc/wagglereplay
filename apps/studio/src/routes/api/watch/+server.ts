// SPDX-License-Identifier: AGPL-3.0-or-later
import type { RequestHandler } from '@sveltejs/kit';
import { getProjectDir } from '$lib/server/project-context.js';
import { getProjectWatcher } from '$lib/server/watcher.js';

const HEARTBEAT_MS = 25_000;

/**
 * AC2 task 3: a Server-Sent Events stream that tells the client when a
 * watched project file changed on disk (a new IR version from `waggle
 * record`, an ingest run finalized by the upload endpoints, an edit made
 * in another Studio tab). `+page.svelte` turns each `changed` message into
 * `invalidate('waggle:project')`, rerunning `+page.server.ts`'s `load` and
 * refreshing the runes state without a full page reload.
 */
export const GET: RequestHandler = () => {
  const projectDir = getProjectDir();
  const watcher = getProjectWatcher(projectDir);
  const encoder = new TextEncoder();

  let unsubscribe: () => void = () => undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      unsubscribe = watcher.subscribe(() => {
        controller.enqueue(encoder.encode('event: changed\ndata: {}\n\n'));
      });
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
      }, HEARTBEAT_MS);
    },
    cancel() {
      unsubscribe();
      if (heartbeat !== undefined) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
};
