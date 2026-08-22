// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import {
  type CaptureEvent,
  CaptureEventSchema,
  type SessionMeta,
  SessionMetaSchema,
} from '@waggle/extension';
import { IngestSessionError } from '../errors.js';

export const EVENTS_FILENAME = 'events.jsonl';
export const META_FILENAME = 'meta.json';

export interface LoadedSession {
  readonly events: readonly CaptureEvent[];
  readonly meta: SessionMeta;
  /** Absolute path to the session's video file (`meta.video.filename` resolved inside `sessionDir`). */
  readonly videoPath: string;
}

function isWithinDirectory(rootDir: string, candidatePath: string): boolean {
  const relative = path.relative(rootDir, candidatePath);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function resolveSessionVideo(sessionDir: string, filename: string): string {
  if (path.isAbsolute(filename)) {
    throw new IngestSessionError(
      'Session video filename must resolve inside the session directory.',
    );
  }
  const sessionRoot = realpathSync(path.resolve(sessionDir));
  const candidate = path.resolve(sessionRoot, filename);
  if (!isWithinDirectory(sessionRoot, candidate)) {
    throw new IngestSessionError(
      'Session video filename must resolve inside the session directory.',
    );
  }
  if (!existsSync(candidate)) {
    throw new IngestSessionError(
      `Session meta.json names video "${filename}" but it does not exist.`,
    );
  }
  const realCandidate = realpathSync(candidate);
  if (!isWithinDirectory(sessionRoot, realCandidate)) {
    throw new IngestSessionError(
      'Session video filename must resolve inside the session directory.',
    );
  }
  return realCandidate;
}

function readJsonFile(filePath: string, subject: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new IngestSessionError(`No ${subject} at "${filePath}".`, { cause: error });
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new IngestSessionError(`"${filePath}" is not valid JSON: ${(error as Error).message}`, {
      cause: error,
    });
  }
}

function parseMeta(filePath: string): SessionMeta {
  const parsed = readJsonFile(filePath, 'session meta.json');
  const result = SessionMetaSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new IngestSessionError(`"${filePath}" failed meta.json validation:\n${detail}`);
  }
  return result.data;
}

function parseEvents(filePath: string): CaptureEvent[] {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new IngestSessionError(`No events.jsonl at "${filePath}".`, { cause: error });
  }

  const events: CaptureEvent[] = [];
  const lines = raw.split('\n');
  for (const [lineIndex, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    let parsedLine: unknown;
    try {
      parsedLine = JSON.parse(trimmed);
    } catch (error) {
      throw new IngestSessionError(
        `"${filePath}" line ${String(lineIndex + 1)} is not valid JSON: ${(error as Error).message}`,
        { cause: error },
      );
    }
    const result = CaptureEventSchema.safeParse(parsedLine);
    if (!result.success) {
      const detail = result.error.issues
        .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
        .join('\n');
      throw new IngestSessionError(
        `"${filePath}" line ${String(lineIndex + 1)} failed event validation:\n${detail}`,
      );
    }
    events.push(result.data);
  }

  for (let i = 1; i < events.length; i += 1) {
    const previous = events[i - 1];
    const current = events[i];
    if (previous !== undefined && current !== undefined && current.seq <= previous.seq) {
      throw new IngestSessionError(
        `"${filePath}" is not seq-ordered: line ${String(i)} has seq=${String(current.seq)}, ` +
          `which does not come after the previous event's seq=${String(previous.seq)}.`,
      );
    }
  }

  return events;
}

/**
 * AC5: loads and validates a finished capture session (the exact output
 * of `apps/extension/src/lib/finalizer.ts`'s `finalizeSession`) - the
 * boundary at which "whatever the extension produced" becomes "data
 * ingest trusts". Every failure throws `IngestSessionError` naming the
 * exact file and problem; `packages/cli`'s `record` command translates
 * that into `ExitCode.INGEST_INVALID_SESSION`.
 */
export function loadSession(sessionDir: string): LoadedSession {
  const meta = parseMeta(path.join(sessionDir, META_FILENAME));
  const events = parseEvents(path.join(sessionDir, EVENTS_FILENAME));

  const videoPath = resolveSessionVideo(sessionDir, meta.video.filename);

  return { events, meta, videoPath };
}
