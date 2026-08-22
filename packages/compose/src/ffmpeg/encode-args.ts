// SPDX-License-Identifier: AGPL-3.0-or-later
import { num } from '../expr/piecewise.js';
import type { BuiltGraph } from '../graph/build-graph.js';
import type { RenderPreset } from '../presets.js';

/**
 * The exact ffmpeg argv a render runs (prd-007 AC4, AC7).
 *
 * AC7 requires "render is idempotent (same inputs, same md5 of demuxed
 * streams)". Three groups of flags below are what buys that, and every one
 * of them is load-bearing:
 *
 *  - `-fflags +bitexact` plus `-flags:v/-flags:a +bitexact` stop the
 *    encoders from writing their own version strings into the bitstream.
 *    Without them libx264 stamps an SEI with its build number and the
 *    stream hash changes when ffmpeg is upgraded, which is honest but
 *    useless as a cache key.
 *  - `-map_metadata -1` drops the container's `creation_time` and
 *    `encoder` tags. This is the muxer-level metadata AC7 explicitly
 *    exempts by asking for the hash of the DEMUXED streams; dropping it
 *    means even the whole-file bytes come out identical.
 *  - `-threads` is PINNED. libx264 is deterministic for a given thread
 *    count, but its default thread count is derived from the host's CPU
 *    count, so an unpinned encode is reproducible on one machine and not
 *    across two.
 *
 * `-t` is always set from the computed timeline rather than left to the
 * inputs, because looping sprite inputs never end on their own.
 */

/** Pinned so the encode is reproducible across machines, not just across runs. */
export const DETERMINISTIC_THREADS = 4;

export const GRAPH_FILENAME = 'filtergraph.txt';

export interface EncodeArgsInput {
  readonly graph: BuiltGraph;
  readonly preset: RenderPreset;
  readonly durationMs: number;
  /** Output path, absolute or relative to the work directory. */
  readonly outputPath: string;
  readonly crf?: number;
  readonly x264Preset?: string;
  readonly audioBitrate?: string;
}

export const DEFAULT_CRF = 20;
export const DEFAULT_X264_PRESET = 'medium';
export const DEFAULT_AUDIO_BITRATE = '160k';

export function buildEncodeArgs(input: EncodeArgsInput): string[] {
  const { graph, preset, durationMs, outputPath } = input;

  const args: string[] = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error'];

  // Bit-exact must be set BEFORE the inputs so it applies to demuxing too.
  args.push('-fflags', '+bitexact');

  for (const graphInput of graph.inputs) {
    args.push(...graphInput.options, '-i', graphInput.path);
  }

  // The graph is passed as a FILE, not as a command-line argument. Two
  // reasons, both real: a cursor position expression for a long
  // walkthrough runs to tens of kilobytes and would blow past Windows'
  // 32767-character command-line limit, and a file is the artifact the
  // determinism test hashes.
  args.push('-/filter_complex', GRAPH_FILENAME);

  args.push('-map', `[${graph.videoLabel}]`);
  if (graph.audioLabel !== null) {
    args.push('-map', `[${graph.audioLabel}]`);
  }

  args.push(
    '-c:v',
    'libx264',
    '-preset',
    input.x264Preset ?? DEFAULT_X264_PRESET,
    '-crf',
    String(input.crf ?? DEFAULT_CRF),
    '-pix_fmt',
    'yuv420p',
    '-profile:v',
    'high',
    '-r',
    num(preset.fps),
    '-threads',
    String(DETERMINISTIC_THREADS),
    '-flags:v',
    '+bitexact',
  );

  if (graph.audioLabel !== null) {
    args.push(
      '-c:a',
      'aac',
      '-b:a',
      input.audioBitrate ?? DEFAULT_AUDIO_BITRATE,
      '-ar',
      '48000',
      '-ac',
      '2',
      '-flags:a',
      '+bitexact',
    );
  } else {
    args.push('-an');
  }

  args.push(
    '-t',
    num(durationMs / 1000),
    '-map_metadata',
    '-1',
    '-movflags',
    '+faststart',
    outputPath,
  );

  return args;
}

/**
 * The argv that hashes a rendered file's DEMUXED streams.
 *
 * `-c copy` means no re-decode: the hash is of the stored bitstream, so it
 * is stable in a way a re-encode's would not be. `streamhash` reports one
 * line per stream, which is what makes AC7's claim checkable per track
 * rather than as one opaque number.
 */
export function buildStreamHashArgs(filePath: string): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    filePath,
    '-map',
    '0',
    '-c',
    'copy',
    '-f',
    'streamhash',
    '-hash',
    'md5',
    '-',
  ];
}
