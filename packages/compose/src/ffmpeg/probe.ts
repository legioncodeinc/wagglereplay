import { z } from 'zod';
import type { SourceVideo, SourceVideoKind } from '../compositor.js';
import { resolveFfprobePath, run, stderrTail } from './run-ffmpeg.js';

/**
 * Reading a media file's real shape with ffprobe.
 *
 * The IR carries the RECORDED VIEWPORT in CSS pixels, which is what
 * coordinates are normalized against and is deliberately not the same
 * thing as the video's pixel size (a 2x display records a 1280 CSS-pixel
 * viewport into a 2560-pixel-wide file). The compositor needs both: the
 * viewport for coordinate projection, the pixel size for the cover
 * geometry. This module supplies the second.
 *
 * ffprobe's output is parsed with zod rather than trusted, for the same
 * reason every other external boundary in this workspace is: a probe of an
 * unexpected file should fail with a named problem, not with `undefined`
 * propagating into a filter graph.
 */

const ProbeStreamSchema = z.object({
  codec_type: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  duration: z.string().optional(),
});

const ProbeOutputSchema = z.object({
  streams: z.array(ProbeStreamSchema).optional(),
  format: z.object({ duration: z.string().optional() }).optional(),
});

export class ProbeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProbeError';
  }
}

export interface ProbeResult {
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
  readonly hasAudio: boolean;
}

export async function probeMedia(
  filePath: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProbeResult> {
  const result = await run(
    resolveFfprobePath(env),
    [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type,width,height,duration',
      '-show_entries',
      'format=duration',
      '-of',
      'json',
      filePath,
    ],
    { env },
  );

  if (result.code !== 0) {
    throw new ProbeError(
      `ffprobe could not read "${filePath}" (exit ${String(result.code)}):\n${stderrTail(result.stderr)}`,
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(result.stdout);
  } catch (error) {
    throw new ProbeError(
      `ffprobe returned output that is not JSON for "${filePath}": ${(error as Error).message}`,
    );
  }

  const parsed = ProbeOutputSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new ProbeError(
      `ffprobe returned an unexpected shape for "${filePath}": ${parsed.error.issues
        .map((issue) => issue.path.join('.'))
        .join(', ')}`,
    );
  }

  const streams = parsed.data.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  if (video === undefined || video.width === undefined || video.height === undefined) {
    throw new ProbeError(`"${filePath}" has no decodable video stream.`);
  }

  const durationSeconds = Number.parseFloat(
    parsed.data.format?.duration ?? video.duration ?? 'NaN',
  );
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new ProbeError(`"${filePath}" reports no usable duration.`);
  }

  return {
    width: video.width,
    height: video.height,
    durationMs: Math.round(durationSeconds * 1000),
    hasAudio: streams.some((stream) => stream.codec_type === 'audio'),
  };
}

/**
 * Probes a file and packages it as the compositor's `SourceVideo`.
 *
 * `kind` is passed in rather than inferred: it is the prd-009 seam (see
 * ../compositor.ts), and inferring it from a filename would make the swap
 * a guess instead of a decision.
 */
export async function probeSourceVideo(
  filePath: string,
  kind: SourceVideoKind,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SourceVideo> {
  const probed = await probeMedia(filePath, env);
  return {
    kind,
    path: filePath,
    width: probed.width,
    height: probed.height,
    durationMs: probed.durationMs,
    hasAudio: probed.hasAudio,
  };
}
