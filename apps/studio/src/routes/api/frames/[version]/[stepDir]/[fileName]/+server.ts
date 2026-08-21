import { existsSync, readFileSync } from 'node:fs';
import { error, type RequestHandler } from '@sveltejs/kit';
import { InvalidFramePathError, resolveFramePath } from '$lib/server/frame-path.js';
import { getProjectDir } from '$lib/server/project-context.js';

/**
 * AC2/AC3: serves one extracted keyframe PNG
 * (`<projectDir>/steps/v<version>/<stepDir>/<fileName>`, `@waggle/ingest`'s
 * own layout) to the film strip and the frame scrubber. A project
 * directory lives wherever the author put it on disk, so it cannot be
 * served from SvelteKit's `static/` - this route reads the file directly,
 * with every path segment validated by `$lib/server/frame-path.ts` before
 * it ever reaches `path.join`.
 */
export const GET: RequestHandler = ({ params }) => {
  const projectDir = getProjectDir();

  let filePath: string;
  try {
    filePath = resolveFramePath(
      projectDir,
      params.version ?? '',
      params.stepDir ?? '',
      params.fileName ?? '',
    );
  } catch (err) {
    if (err instanceof InvalidFramePathError) {
      error(400, err.message);
    }
    throw err;
  }

  if (!existsSync(filePath)) {
    error(404, 'Frame not found.');
  }

  return new Response(readFileSync(filePath), {
    headers: {
      'content-type': 'image/png',
      // Frames for a given IR version are immutable once extracted
      // (ADR-015: IR versions are immutable), so the browser can cache
      // them indefinitely.
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};
