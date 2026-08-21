import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type RunIngestResult, runIngest } from '@waggle/ingest';

/**
 * AC1: the receiving side of `apps/extension/src/lib/upload-client.ts`'s
 * three calls (`uploadVideoChunk`, `uploadEvents`, `uploadMeta`), and the
 * bridge into `@waggle/ingest`'s `runIngest`.
 *
 * A raw capture session (video chunks, `events.jsonl`, `meta.json`) is NOT
 * part of the ADR-015 project layout - the corpus's project-directory list
 * (`walkthrough-ir-and-project-format.md`) has no entry for it, only for
 * the IR, storyboard assets, and narration/brand/baseline/credential
 * files ingest and Studio actually produce. So the raw session is
 * assembled in a TEMP directory outside the project, handed to
 * `runIngest` (whose real inputs and outputs are both already-established
 * PRD-004 contracts), and deleted once ingest finishes - the project
 * directory only ever gains the files ADR-015 already documents.
 *
 * The extension's own upload-client makes exactly three calls per
 * session, in this order: N video chunks (during recording), then
 * `events.jsonl` once, then `meta.json` once at the very end
 * (`apps/extension/src/background/service-worker.ts`'s `stopCapture`).
 * `meta.json` arriving is therefore the session's finalize signal: at
 * that point every chunk and `events.jsonl` are already on disk, so this
 * module can assemble the video and hand the session to ingest inside the
 * same request that received `meta.json`.
 */

interface SessionWorkspace {
  readonly dir: string;
  readonly chunksDir: string;
}

const workspaces = new Map<string, SessionWorkspace>();
const sessionsRoot = path.join(tmpdir(), 'waggle-studio-sessions');

function workspaceFor(sessionId: string): SessionWorkspace {
  const safeId = safeSessionSegment(sessionId);
  const existing = workspaces.get(safeId);
  if (existing) return existing;

  mkdirSync(sessionsRoot, { recursive: true });
  const dir = mkdtempSync(path.join(sessionsRoot, `${safeId}-`));
  const chunksDir = path.join(dir, 'chunks');
  mkdirSync(chunksDir, { recursive: true });
  const workspace = { dir, chunksDir };
  workspaces.set(safeId, workspace);
  return workspace;
}

/**
 * `sessionId` and `chunkIndex` both ride in the URL (SvelteKit route
 * params), so both are attacker-controlled strings before they are proven
 * safe. This is the one function every upload handler funnels a session
 * id through before it touches a filesystem path, so a `../` (or any
 * other path-separator-bearing) session id can never escape
 * `sessionsRoot`.
 */
function safeSessionSegment(sessionId: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(sessionId) || sessionId === '.' || sessionId === '..') {
    throw new InvalidSessionIdError(sessionId);
  }
  return sessionId;
}

export class InvalidSessionIdError extends Error {
  constructor(sessionId: string) {
    super(`Invalid session id "${sessionId}": expected only letters, digits, "-", "_", ".".`);
    this.name = 'InvalidSessionIdError';
  }
}

export class InvalidChunkIndexError extends Error {
  constructor(raw: string) {
    super(`Invalid chunk index "${raw}": expected a non-negative integer.`);
    this.name = 'InvalidChunkIndexError';
  }
}

function chunkFileName(chunkIndex: number): string {
  // Zero-padded so a lexicographic directory listing already sorts in
  // upload order for up to 10,000 chunks - comfortably more than any real
  // recording produces (recorder.ts's MediaRecorder timeslice makes a
  // chunk every few seconds).
  return `${String(chunkIndex).padStart(5, '0')}.chunk`;
}

/** Writes one uploaded video chunk to disk. */
export function writeVideoChunk(sessionId: string, chunkIndexRaw: string, body: Uint8Array): void {
  if (!/^\d+$/.test(chunkIndexRaw)) {
    throw new InvalidChunkIndexError(chunkIndexRaw);
  }
  const chunkIndex = Number.parseInt(chunkIndexRaw, 10);
  const workspace = workspaceFor(sessionId);
  const filePath = path.join(workspace.chunksDir, chunkFileName(chunkIndex));
  writeFileSync(filePath, body);
}

/** Writes the finished `events.jsonl` body verbatim - `finalizeSession` already validated and ordered it. */
export function writeSessionEvents(sessionId: string, eventsJsonl: string): void {
  const workspace = workspaceFor(sessionId);
  writeFileSync(path.join(workspace.dir, 'events.jsonl'), eventsJsonl, 'utf8');
}

export class InvalidSessionMetaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSessionMetaError';
  }
}

export interface FinalizeSessionResult {
  readonly sessionDir: string;
  readonly ingest: RunIngestResult;
}

/**
 * Assembles every uploaded chunk into the named video file, writes
 * `meta.json`, and runs the full `@waggle/ingest` pipeline against the
 * assembled session - all inside the request that receives `meta.json`,
 * since that upload is the extension's own finalize signal (see module
 * doc comment). The temp session directory is always removed afterward,
 * success or failure, so a repeated recording never accumulates raw video
 * on disk.
 */
export async function finalizeSession(
  projectDir: string,
  sessionId: string,
  metaRaw: unknown,
): Promise<FinalizeSessionResult> {
  // Validated before the workspace is even created: a malformed meta.json
  // must never leave an orphaned temp directory behind.
  const videoFilename = extractVideoFilename(metaRaw);
  const workspace = workspaceFor(sessionId);

  try {
    writeFileSync(
      path.join(workspace.dir, 'meta.json'),
      `${JSON.stringify(metaRaw, null, 2)}\n`,
      'utf8',
    );
    assembleVideo(workspace, videoFilename);
    const ingest = await runIngest({ projectDir, sessionDir: workspace.dir });
    return { sessionDir: workspace.dir, ingest };
  } finally {
    workspaces.delete(sessionId);
    rmSync(workspace.dir, { recursive: true, force: true });
  }
}

function extractVideoFilename(metaRaw: unknown): string {
  if (typeof metaRaw !== 'object' || metaRaw === null) {
    throw new InvalidSessionMetaError('meta.json body is not a JSON object.');
  }
  const video = (metaRaw as Record<string, unknown>).video;
  if (typeof video !== 'object' || video === null) {
    throw new InvalidSessionMetaError('meta.json is missing its "video" object.');
  }
  const filename = (video as Record<string, unknown>).filename;
  if (typeof filename !== 'string' || filename.trim() === '') {
    throw new InvalidSessionMetaError('meta.json\'s "video.filename" must be a non-empty string.');
  }
  // The filename rides straight into a `path.join` below; reject anything
  // that could traverse out of the session workspace before it does.
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new InvalidSessionMetaError(
      `meta.json's "video.filename" ("${filename}") is not a bare file name.`,
    );
  }
  return filename;
}

/**
 * Concatenates every chunk written for this session, in ascending index
 * order, into `<sessionDir>/<videoFilename>`. Buffered rather than
 * streamed: a Studio recording is a short local demo, not a broadcast
 * feed, so holding one session's chunks in memory during assembly is a
 * fine trade for far simpler, more testable code than a hand-rolled
 * stream pipeline.
 */
function assembleVideo(workspace: SessionWorkspace, videoFilename: string): void {
  const chunkFiles = readdirSync(workspace.chunksDir)
    .filter((name) => name.endsWith('.chunk'))
    .sort();

  const buffers = chunkFiles.map((name) => readFileSync(path.join(workspace.chunksDir, name)));
  writeFileSync(path.join(workspace.dir, videoFilename), Buffer.concat(buffers));
}
