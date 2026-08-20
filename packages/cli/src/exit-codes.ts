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
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
