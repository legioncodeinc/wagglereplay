/**
 * `@waggle/narrate`: script drafting and TTS synthesis with word
 * timestamps (prd-006).
 *
 * Governed by:
 *  - ADR-006, voice adapter defaults (ElevenLabs Flash default, v3
 *    premium, Deepgram budget, xAI watch list)
 *  - ADR-008, no secrets in project files: every TTS API key is read from
 *    the environment, never written to a project file or a prompt
 *  - library/knowledge/private/waggle/voice-and-narration.md
 *
 * See README.md for the full deliverable list, the `words.json` shared
 * contract prd-007 and prd-013 both consume, and which specific
 * assertions in this package's test suite need a live TTS API key to run
 * for real.
 */

// --- Guardrails (AC7) --------------------------------------------------------
export {
  assertShareableAudioAllowed,
  checkShareableAudioAllowed,
  SHAREABLE_AUDIO_OVERRIDE_ENV_VAR,
  type ShareableAudioCheckInput,
  type ShareableAudioCheckResult,
  ShareableAudioGuardError,
} from './guardrails/shareable-audio.js';
// --- Full pipeline (AC6) ------------------------------------------------------
export {
  NarrationDraftPendingApprovalError,
  NoRecordingError,
  type RunNarrationOptions,
  type RunNarrationResult,
  runNarration,
} from './narrate/run-narration.js';
// --- Script drafting (AC1) --------------------------------------------------
export {
  computeDurationHintMs,
  countWords,
  readingTimeMs,
  TARGET_WORDS_PER_MINUTE,
} from './script/pace.js';
export {
  NarrationScriptInvalidError,
  narrationScriptExists,
  readNarrationScript,
  writeNarrationScript,
} from './script/script-io.js';
export {
  getApprovedSegmentTexts,
  NARRATION_SCRIPT_SCHEMA_VERSION,
  NarrationNotApprovedError,
  type NarrationScript,
  NarrationScriptSchema,
  type NarrationSegmentDraft,
  NarrationSegmentDraftSchema,
} from './script/script-schema.js';
export { draftNarrationScript, draftSegmentText } from './script/segmenter.js';
export {
  type StitchedSynthesisResult,
  splitTextIntoChunks,
  synthesizeChunked,
  type TextChunk,
} from './tts/chunked-synthesize.js';
// --- Deepgram adapter (AC5) --------------------------------------------------
export { DeepgramAdapter, type DeepgramAdapterOptions } from './tts/deepgram/adapter.js';
export { DEEPGRAM_DEFAULT_MODEL } from './tts/deepgram/constants.js';

// --- ElevenLabs adapter (AC3, AC7) ------------------------------------------
export { ElevenLabsAdapter, type ElevenLabsAdapterOptions } from './tts/elevenlabs/adapter.js';
export { mapOriginalTextToNormalizedTiming } from './tts/elevenlabs/alignment-mapping.js';
export { ElevenLabsClient } from './tts/elevenlabs/client.js';
export {
  DEFAULT_ELEVENLABS_MODEL_ALIAS,
  ELEVENLABS_MODEL_ALIASES,
  ELEVENLABS_MODELS,
  type ElevenLabsModelAlias,
  type ElevenLabsModelId,
} from './tts/elevenlabs/constants.js';
export {
  createTtsAdapterFromEnv,
  DEFAULT_TTS_PROVIDER,
  TTS_PROVIDERS,
  TtsConfigError,
  type TtsProvider,
} from './tts/provider-selection.js';
export type { FetchLike } from './tts/shared/http.js';
// --- TTS adapter interface (AC2) --------------------------------------------
export type {
  SynthesizeOptions,
  SynthesizeResult,
  TtsAdapter,
  TtsCapabilities,
  TtsTimestampGranularity,
} from './tts/types.js';
export { TtsProviderError, TtsRequestTooLargeError } from './tts/types.js';
// --- xAI stub adapter (AC5) --------------------------------------------------
export { XaiAdapter } from './tts/xai/adapter.js';
// --- Char-to-word aggregation and words.json (AC4) --------------------------
// This is the shared contract prd-007 and prd-013 both consume: import
// these from @waggle/narrate rather than re-declaring the shape.
export { aggregateCharsToWords, type CharAlignment } from './words/aggregate.js';
export {
  buildCaptionCues,
  type CaptionCue,
  DEFAULT_MAX_CHARS_PER_LINE,
  DEFAULT_MAX_LINES_PER_CUE,
} from './words/captions.js';
export {
  assertMonotonicWords,
  NARRATION_WORDS_SCHEMA_VERSION,
  type NarrationWordsDocument,
  NarrationWordsDocumentSchema,
  type WordTiming,
  WordTimingOrderError,
  WordTimingSchema,
} from './words/schema.js';
export {
  formatSrtTimestamp,
  formatVttTimestamp,
  renderSrt,
  renderTranscript,
  renderVtt,
  writeSrt,
  writeTranscript,
  writeVtt,
  writeWordsJson,
} from './words/writers.js';
