# @waggle/narrate

Script drafting and TTS synthesis with word timestamps (prd-006). Governed
by ADR-006 (voice adapter defaults) and ADR-008 (no secrets in project
files).

## Pipeline

```
Walkthrough IR (@waggle/ir)
  -> draftNarrationScript()          AC1: one draft segment per step
  -> narration/script.json           awaits author approval (Studio, prd-005)
  -> getApprovedSegmentTexts()       the ONLY function that hands text to a TTS adapter
  -> createTtsAdapterFromEnv()       AC2: env-based provider selection (ADR-006 default)
  -> synthesizeChunked()             AC3: chunk-stitching under the model's char cap
  -> mapOriginalTextToNormalizedTiming() + aggregateCharsToWords()   AC4
  -> narration/audio.mp3, words.json, captions.srt, captions.vtt, transcript.txt
```

`waggle narrate` (`packages/cli/src/commands/narrate.ts`) wires this end to
end (AC6). Every step is also exported individually from `src/index.ts` so
it can be called directly (Studio, tests, a future `waggle narrate --dry-run`).

## Why the script drafter is not an LLM call

The corpus describes script generation as an LLM job. This environment has
no LLM API access, exactly like it has no TTS API access, so
`draftNarrationScript` (`src/script/segmenter.ts`) is a deterministic,
rule-based drafter: it reads a step's `classification`, `element`,
`domDelta.summary`, and route transition and produces a templated sentence.
This is a deliberate, testable stand-in, not a placeholder pretending to be
an LLM call: the output shape (`NarrationScript`) is identical to what an
LLM-backed drafter would produce, so replacing this one function later
requires no change anywhere downstream. Every consumer only ever reads
`approvedText`, never `draftText`, after a human (today, via hand-editing
`narration/script.json`; eventually, via Studio, prd-005) has signed off.
This is also the literal enforcement of AC1's "author-approved text is the
only input to TTS": `getApprovedSegmentTexts` (`src/script/script-schema.ts`)
throws `NarrationNotApprovedError` if any segment lacks `approved: true` and
a non-null `approvedText`, and it is the only function in this package that
extracts text destined for a TTS adapter.

## The injectable-transport pattern

There are no API keys in this environment (no `ELEVENLABS_API_KEY`, no
`DEEPGRAM_API_KEY`). Every adapter takes its HTTP transport as an
`options.fetchImpl` constructor parameter, defaulting to the real global
`fetch`:

```ts
new ElevenLabsAdapter({ apiKey, voiceId, fetchImpl }); // fetchImpl defaults to `fetch`
new DeepgramAdapter({ apiKey, fetchImpl });
```

Request construction, header setting, retry policy (429/5xx with
exponential backoff, `src/tts/shared/http.ts`), response-shape parsing with
zod (`src/tts/elevenlabs/response-schema.ts`,
`src/tts/deepgram/response-schema.ts`), unit conversion (ElevenLabs' float
seconds to Waggle's milliseconds), and error surfacing are all fully
implemented and exercised in tests against hand-built `Response` objects
matching the shapes documented in
`library/knowledge/private/waggle/voice-and-narration.md`'s receipts. Only
the network call itself is mocked.

## `words.json`: the shared contract

`words.json` (schema and writer in `src/words/schema.ts`,
`src/words/writers.ts`) is deliberately its own module with no dependency on
any TTS adapter, because two completely different pipelines must produce an
identical shape:

- **prd-007** (compositor) reads it to generate karaoke ASS captions.
- **prd-013** (uploaded-audio alignment) must emit the same shape from a
  forced-alignment pipeline (ElevenLabs forced alignment, AssemblyAI, or
  self-hosted WhisperX), not from TTS-native timestamps.

```json
{
  "schemaVersion": 1,
  "provider": "elevenlabs-tts",
  "sourceText": "Navigate to /dashboard. Enter a value in \"Email\".",
  "durationMs": 2400,
  "words": [
    { "word": "Navigate", "startMs": 0, "endMs": 380 },
    { "word": "to", "startMs": 380, "endMs": 520 }
  ]
}
```

- `startMs` / `endMs` are always milliseconds relative to the start of the
  paired audio file, never a provider's native unit.
- `words` is enforced monotonically non-decreasing and non-overlapping by
  `assertMonotonicWords`, which every writer calls before touching disk.
- `sourceText` is the original author-approved text, never a TTS provider's
  internally normalized text (see "Normalized vs. original text" below), so
  neither captions nor the transcript ever show a provider's own number
  expansion back to the reader.
- `provider` is a free-text label, not a closed enum, so prd-013 can add
  pipeline names this schema does not yet know about.

**What prd-013 should import from `@waggle/narrate` rather than
re-declaring:**

```ts
import {
  NarrationWordsDocumentSchema, // the zod schema, for validating a document it produces
  type NarrationWordsDocument, // the TS type
  type WordTiming,
  assertMonotonicWords, // the ordering contract every producer must satisfy
  writeWordsJson, // the writer (re-validates + re-checks monotonicity before writing)
  writeSrt,
  writeVtt,
  formatSrtTimestamp, // comma decimal separator
  formatVttTimestamp, // period decimal separator
  buildCaptionCues, // 42-char, 2-line cue capping (AC4)
  aggregateCharsToWords, // whitespace grouping, if prd-013's own pipeline also returns char-level timing
} from '@waggle/narrate';
```

prd-013's forced-alignment pipeline does not need
`mapOriginalTextToNormalizedTiming` (that function is specific to
reconciling ElevenLabs' own text normalization against the original text);
a forced-alignment pipeline already times the exact original text it was
given.

## Normalized vs. original text (AC3)

ElevenLabs normalizes text before speaking it (`"$13"` is spoken as
"thirteen dollars"), and returns both `alignment` (character timing keyed to
the original text, less reliable for numeric tokens) and
`normalized_alignment` (character timing keyed to what it actually spoke).
The corpus's rule is "use normalized for audio timing, map back to original
text for captions." `mapOriginalTextToNormalizedTiming`
(`src/tts/elevenlabs/alignment-mapping.ts`) implements this in two paths:

1. **Exact** (the common case): when the original and normalized word
   counts match, no expansion happened, and each original word is paired
   1:1, in order, with its normalized counterpart's timing.
2. **Proportional fallback**: when the counts differ (a number, currency, or
   similar token expanded), the normalized words' combined time span is
   redistributed across the original words weighted by character length.
   This is a documented approximation, not a claim of per-word audio
   accuracy at an expansion boundary; it guarantees a monotonic, duration-
   accurate result even for the exact content the corpus warns about. A
   future pass could replace it with proper DP sequence alignment.

## Chunk stitching (AC3)

`synthesizeChunked` (`src/tts/chunked-synthesize.ts`) is the only way
narrate code should call an adapter for a full script: it splits on
`adapter.capabilities.maxCharsPerRequest` (never mid-word), synthesizes each
chunk, concatenates the raw audio bytes in order, and re-bases every
subsequent chunk's character timings by the cumulative duration of the
chunks before it. `test/tts/chunked-synthesize.test.ts` seam-tests this: it
asserts a chunk boundary lands exactly at the previous chunk's total
duration, not at zero.

## Providers (AC2, AC5)

| Provider | Env selector | Model | Timestamps | Notes |
|---|---|---|---|---|
| ElevenLabs (default, ADR-006) | `WAGGLE_TTS_PROVIDER=elevenlabs` (or unset) | Flash (`WAGGLE_ELEVENLABS_MODEL=flash`, default) or v3 (`=v3`, beta, dialogue endpoint) | char-level | Requires `ELEVENLABS_API_KEY`, `WAGGLE_ELEVENLABS_VOICE_ID`. |
| Deepgram Aura-2 (budget) | `WAGGLE_TTS_PROVIDER=deepgram` | `aura-2-thalia-en` (default) | none | Requires `DEEPGRAM_API_KEY`. Alignment pass deferred to prd-013's shared module. |
| xAI (watch list) | `WAGGLE_TTS_PROVIDER=xai` | `grok-voice` | none | Stub: declares honest capabilities, `synthesize()` rejects. No verified request/response contract published yet (ADR-006: "re-evaluate quarterly"). Requires `XAI_API_KEY` to select. |

`createTtsAdapterFromEnv` (`src/tts/provider-selection.ts`) throws
`TtsConfigError` naming the exact missing environment variable rather than
failing deep inside a network call.

## Guardrail (AC7)

`assertShareableAudioAllowed` (`src/guardrails/shareable-audio.ts`) refuses
to proceed when the ElevenLabs plan is free tier, or the selected model is
flagged beta, per the corpus: "Never render shareable audio on free tier";
"beta-model output is excluded" from the commercial license.
`WAGGLE_ALLOW_UNLICENSED_AUDIO=1` overrides the refusal and prints an
explicit warning to stderr before proceeding. `runNarration` calls this
before every synthesis, for every provider (the free-tier check only fires
for `provider === 'elevenlabs'`; the beta-model check is provider-agnostic).

## What needs a live API key to fully verify

Every request/response contract in this package is implemented from the
corpus's documented shapes and exercised against hand-built mock responses
matching them. The one assertion this test suite cannot make is that a real
ElevenLabs (or Deepgram) server actually returns exactly that shape today:

- `ElevenLabsClient.textToDialogueWithTimestamps` (the v3 path,
  `src/tts/elevenlabs/client.ts`): the corpus documents the dialogue
  endpoint's plain (non-timestamped) response shape and the with-timestamps
  endpoint's response shape separately; this adapter assumes the
  with-timestamps dialogue endpoint returns the same `audio_base64` /
  `alignment` / `normalized_alignment` envelope as the plain with-timestamps
  endpoint, since that is what the API reference implies for a
  single-speaker `inputs` array, but this specific combination was not
  independently verified against a live response.
- `ElevenLabsClient.fetchSubscriptionTier`: the exact set of tier name
  strings ElevenLabs' `/v1/user/subscription` can return (`free`, `starter`,
  `creator`, `pro`, `scale`, `business`, `enterprise`, and possibly others)
  is asserted from public pricing pages, not from a live response body.
  `ELEVENLABS_FREE_TIER_NAMES` (`src/tts/elevenlabs/constants.ts`) currently
  matches `free` and `trial`; a live account with an unusual tier name could
  reveal a gap.
- `DeepgramClient.speak`: the corpus verifies Deepgram's pricing and the
  existence of the `/v1/speak` endpoint; the exact success/error response
  shape (raw binary vs. an error JSON envelope) is implemented from
  Deepgram's public API reference, not from a live call.

No test in this package's suite claims to have exercised a real network
call; every HTTP-touching test passes an explicit `fetchImpl` mock.
