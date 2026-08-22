// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Ingest-specific error types. Every one of these is caught somewhere on
 * the way to `packages/cli`'s `waggle record` command
 * (../../../packages/cli/src/commands/record.ts), which translates it into
 * one of the documented exit codes rather than letting a bare stack trace
 * reach the terminal.
 */

/** The session directory, or one of its required files, could not be read or does not validate. */
export class IngestSessionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'IngestSessionError';
  }
}

/** ffmpeg itself failed (non-zero exit, or was not found on PATH). */
export class FrameExtractionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FrameExtractionError';
  }
}
