import type { AudioStyle } from '../brand/schema.js';
import { num } from '../expr/piecewise.js';
import type { RenderTimeline } from '../timeline.js';

/**
 * The audio graph: narration muxed over the recording's own audio, with
 * configurable ducking (prd-007 AC6).
 *
 * Ducking is a SIDECHAIN compressor keyed off the narration, not a static
 * gain cut on the source. The difference is the whole point: a static cut
 * leaves the app's own sound buried for the entire video, while a
 * sidechain only pulls it down while a voice is actually present and lets
 * it back up in the gaps.
 *
 * The narration is split before the compressor so the same signal is both
 * the key input and part of the final mix; that is the standard sidechain
 * wiring and the reason `asplit` appears here rather than a second decode
 * of the same file.
 */

export const AUDIO_SAMPLE_RATE = 48_000;
export const AUDIO_CHANNEL_LAYOUT = 'stereo';

/** Normalizes any input to one sample format so `sidechaincompress` and `amix` agree. */
const AFORMAT = `aformat=sample_fmts=fltp:sample_rates=${AUDIO_SAMPLE_RATE}:channel_layouts=${AUDIO_CHANNEL_LAYOUT}`;

export interface AudioChainInput {
  /** Stream specifier for the source recording's audio, or `null` when it is silent. */
  readonly sourceLabel: string | null;
  /** Stream specifier for the narration audio, or `null` when the project has none. */
  readonly narrationLabel: string | null;
  readonly style: AudioStyle;
  readonly timeline: RenderTimeline;
  readonly outputLabel: string;
}

export interface AudioChain {
  /** Filter chains, or an empty array when the render has no audio at all. */
  readonly chains: readonly string[];
  /** `true` when `outputLabel` exists and should be mapped. */
  readonly hasAudio: boolean;
  /** Human-readable summary for the layer manifest. */
  readonly detail: string;
}

function gain(label: string, db: number): string {
  return db === 0 ? '' : `,volume=${num(db)}dB`;
}

/**
 * Shifts a track to where the recording's own first frame lands, then pads
 * and trims it to the exact composited duration.
 *
 * `apad` followed by `atrim` rather than either alone: `apad` guarantees
 * the track reaches the end of an extended timeline (an outro card outlives
 * the audio), and `atrim` guarantees it does not run past it. Without both,
 * the output duration depends on which input happened to be longest.
 */
function alignTrack(timeline: RenderTimeline): string {
  const delay =
    timeline.bodyStartMs > 0 ? `,adelay=delays=${Math.round(timeline.bodyStartMs)}:all=1` : '';
  return `${delay},apad,atrim=start=0:end=${num(timeline.totalMs / 1000)},asetpts=N/SR/TB`;
}

export function buildAudioChain(input: AudioChainInput): AudioChain {
  const { sourceLabel, narrationLabel, style, timeline, outputLabel } = input;

  if (sourceLabel === null && narrationLabel === null) {
    return { chains: [], hasAudio: false, detail: 'no audio track' };
  }

  const align = alignTrack(timeline);

  if (narrationLabel === null && sourceLabel !== null) {
    return {
      chains: [
        `[${sourceLabel}]${AFORMAT}${gain('source', style.sourceGainDb)}${align}[${outputLabel}]`,
      ],
      hasAudio: true,
      detail: `source audio only, ${num(style.sourceGainDb)}dB`,
    };
  }

  if (sourceLabel === null && narrationLabel !== null) {
    return {
      chains: [
        `[${narrationLabel}]${AFORMAT}${gain('narration', style.narrationGainDb)}${align}[${outputLabel}]`,
      ],
      hasAudio: true,
      detail: `narration only, ${num(style.narrationGainDb)}dB`,
    };
  }

  // Both tracks present.
  const chains: string[] = [
    `[${sourceLabel}]${AFORMAT}${gain('source', style.sourceGainDb)}${align}[wsrc]`,
  ];

  if (!style.ducking.enabled) {
    chains.push(
      `[${narrationLabel}]${AFORMAT}${gain('narration', style.narrationGainDb)}${align}[wnarr]`,
      `[wsrc][wnarr]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[${outputLabel}]`,
    );
    return {
      chains,
      hasAudio: true,
      detail: `narration ${num(style.narrationGainDb)}dB over source ${num(style.sourceGainDb)}dB, ducking off`,
    };
  }

  chains.push(
    `[${narrationLabel}]${AFORMAT}${gain('narration', style.narrationGainDb)}${align},asplit=2[wnarr][wkey]`,
    `[wsrc][wkey]sidechaincompress=threshold=${num(style.ducking.threshold)}:ratio=${num(style.ducking.ratio)}:attack=${num(style.ducking.attackMs)}:release=${num(style.ducking.releaseMs)}:makeup=1[wducked]`,
    `[wducked][wnarr]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[${outputLabel}]`,
  );

  return {
    chains,
    hasAudio: true,
    detail: `narration ${num(style.narrationGainDb)}dB over source ${num(style.sourceGainDb)}dB, sidechain ducking ratio ${num(style.ducking.ratio)}`,
  };
}
