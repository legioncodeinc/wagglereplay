/**
 * Canonical exit-code table for the `waggle` CLI.
 *
 * This file is the single source of truth: every code the CLI can exit with
 * is defined here with a doc comment explaining when it fires. The table in
 * packages/cli/README.md is a rendered copy of this file for humans; if you
 * add or change a code, update both.
 */

export const ExitCode = {
  /** The command completed successfully. */
  SUCCESS: 0,

  /**
   * An unexpected error, or a CLI usage error surfaced by commander itself
   * (unknown command, unknown option, missing required argument, malformed
   * flag value). This is also commander's own default exit code for parsing
   * failures, so it is intentionally not overloaded with a second meaning.
   */
  GENERIC_ERROR: 1,

  /**
   * `waggle init <name>` refused to run because a Waggle project already
   * exists at the target directory (a `waggle.json` was found). Nothing was
   * modified.
   */
  PROJECT_ALREADY_EXISTS: 3,

  /**
   * The resolved project directory has no `waggle.json`. Run `waggle init
   * <name>` first, or pass `--project <dir>` / `--dir <dir>` pointing at an
   * existing Waggle project.
   */
  PROJECT_NOT_FOUND: 4,

  /**
   * A `waggle.json` was found but failed to load: either it is not valid
   * JSON, or it does not satisfy the manifest schema. The error message
   * names the file and the offending JSON path (or line/column for a syntax
   * error).
   */
  MANIFEST_INVALID: 5,

  /**
   * The command's project-resolution and manifest-loading succeeded, but
   * the command's actual behavior is not implemented yet in this PRD wave.
   * The error message names the PRD that owns the implementation.
   */
  NOT_IMPLEMENTED: 6,

  /**
   * `waggle narrate` drafted (or re-drafted after new steps appeared)
   * `narration/script.json` and is waiting on author approval, or the
   * script has segments still unapproved. Nothing was sent to a TTS
   * provider. Review and approve the pending segments, then run
   * `waggle narrate` again.
   */
  NARRATION_NOT_APPROVED: 7,

  /**
   * `waggle narrate` could not construct a TTS adapter from the
   * environment: an unknown `WAGGLE_TTS_PROVIDER`, or a required
   * provider-specific variable (e.g. `ELEVENLABS_API_KEY`,
   * `WAGGLE_ELEVENLABS_VOICE_ID`) is not set. The error message names the
   * exact missing variable.
   */
  TTS_CONFIG_INVALID: 8,

  /**
   * `waggle narrate` refused to render shareable audio because the
   * ElevenLabs plan is free tier or the selected model is flagged beta
   * (ADR-006). Set `WAGGLE_ALLOW_UNLICENSED_AUDIO=1` to override.
   */
  SHAREABLE_AUDIO_REFUSED: 9,

  /**
   * `waggle record` was run with no `--session <dir>`: interactive capture
   * (launching Studio, driving the extension) is prd-005's job and does
   * not exist yet in this PRD wave. Pass `--session <dir>` pointing at a
   * finished capture session (events.jsonl, meta.json, and the video file
   * - the exact output of the extension's finalizer) to ingest it now.
   */
  INGEST_SESSION_REQUIRED: 10,

  /**
   * `waggle record --session <dir>` pointed at a directory that is missing
   * `events.jsonl`/`meta.json`, fails to validate against those schemas,
   * is not seq-ordered, or names a video file that does not exist. The
   * error message names the exact file and problem.
   */
  INGEST_INVALID_SESSION: 11,

  /**
   * `waggle render` could not assemble the inputs a render needs: the
   * project has no recorded IR, the IR points at a source recording that
   * is missing, or narration audio and `words.json` disagree about whether
   * the project has been narrated. The message names the exact file.
   */
  RENDER_INPUT_MISSING: 12,

  /**
   * `waggle render` could not run the compositor backend, or the backend
   * failed. Either ffmpeg is not installed and not named by
   * `WAGGLE_FFMPEG_PATH`, or it exited non-zero; in the second case the
   * tail of its stderr is included in the message.
   */
  FFMPEG_FAILED: 13,

  /**
   * `waggle render --brand-kit <id>` named a kit that does not exist under
   * `brand/`, or the kit file is not valid JSON or fails the brand kit
   * schema. The message names every offending field.
   */
  BRAND_KIT_INVALID: 14,

  /**
   * `waggle render --preset <id>` named a preset that is neither built in
   * nor declared in `waggle.json`, or the manifest's own entry for it is
   * malformed. The message lists the known preset ids.
   */
  PRESET_UNKNOWN: 15,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
