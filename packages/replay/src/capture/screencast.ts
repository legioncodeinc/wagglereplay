import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { FFMPEG_PATH_ENV_VAR, resolveFfmpegPath } from '@waggle/compose';
import type { CDPSession, Page } from 'playwright-core';

/**
 * Screencast capture (prd-009 AC3), per ADR-002: Page.startScreencast
 * JPEG frames, acked per frame, piped to ffmpeg encoding H.264 at the
 * preset fps. A/V-free master: capture emits video only; narration and
 * every other layer are composited later.
 *
 * Wall-clock pacing: screencast frames are DAMAGE-driven (they arrive
 * only when pixels change), but the walkthrough they record unfolds in
 * wall time. The pump therefore runs a fixed-rate emitter: on every tick
 * of 1000/fps ms it writes the MOST RECENT damage frame to ffmpeg's
 * stdin, repeating bytes when the page was quiet. ffmpeg receives a
 * constant-rate image stream whose duration equals the session's wall
 * duration, which is what keeps the per-step timing manifest (and every
 * IR-relative time downstream) aligned with the video without any
 * timestamp surgery.
 */

/** ADR-002: JPEG, quality ~90, target-size frames. */
export const SCREENCAST_QUALITY = 90;

/** Mirrors compose's DETERMINISTIC_THREADS posture: reproducible encodes. */
export const CAPTURE_THREADS = 4;

export interface ScreencastCaptureOptions {
  readonly page: Page;
  /** Output MP4 path; parent directories are created. */
  readonly outputPath: string;
  /** Constant output frame rate. */
  readonly fps: number;
  /** Max frame dimensions passed to CDP; frames arrive at viewport size. */
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly env?: NodeJS.ProcessEnv;
}

export class ScreencastError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScreencastError';
  }
}

/**
 * One capture session. `start()` begins screencast and the ffmpeg pipe;
 * `stop()` tears both down in order and resolves once ffmpeg has flushed
 * and exited. Exactly one capture runs per page at a time.
 */
export class ScreencastCapture {
  private readonly page: Page;
  private readonly options: ScreencastCaptureOptions;
  private cdp: CDPSession | null = null;
  private ffmpeg: ChildProcessWithoutNullStreams | null = null;
  private emitter: ReturnType<typeof setInterval> | null = null;
  private emitterStartedAt = 0;
  private latestFrame: Buffer | null = null;
  private framesWritten = 0;
  private framesReceived = 0;
  private ffmpegExit: Promise<void> | null = null;
  private ffmpegSpawned: Promise<void> | null = null;
  private ffmpegFailure: ScreencastError | null = null;
  private writeBackpressured = false;
  private pendingTicks = 0;
  private stderrTail = '';
  private started = false;
  private stopped = false;

  constructor(options: ScreencastCaptureOptions) {
    this.options = options;
    this.page = options.page;
  }

  /** Frames CDP delivered (damage count) and frames written to the encode (time count). */
  stats(): { received: number; written: number } {
    return { received: this.framesReceived, written: this.framesWritten };
  }

  async start(): Promise<void> {
    if (this.started) {
      throw new ScreencastError('Screencast capture already started.');
    }
    for (const [name, value] of [
      ['fps', this.options.fps],
      ['maxWidth', this.options.maxWidth],
      ['maxHeight', this.options.maxHeight],
    ] as const) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new ScreencastError(
          `${name} must be a positive finite number, received ${String(value)}.`,
        );
      }
    }
    this.started = true;

    mkdirSync(path.dirname(this.options.outputPath), { recursive: true });
    const launched = this.spawnFfmpeg();
    this.ffmpeg = launched.child;
    this.ffmpegSpawned = launched.spawned;
    this.ffmpegExit = new Promise<void>((resolve) => {
      const child = this.ffmpeg;
      if (child === null) {
        resolve();
        return;
      }
      child.on('close', () => resolve());
    });
    try {
      await this.ffmpegSpawned;
      this.cdp = await this.page.context().newCDPSession(this.page);
      this.cdp.on('Page.screencastFrame', (event) => {
        this.framesReceived += 1;
        this.latestFrame = Buffer.from(event.data, 'base64');
        const sessionId = event.sessionId;
        // Ack AFTER grabbing the data: acking tells Chrome it can reuse the
        // frame slot, and the copy above is what makes that safe.
        void this.cdp?.send('Page.screencastFrameAck', { sessionId }).catch((error: unknown) => {
          if (!this.stopped) {
            this.ffmpegFailure = new ScreencastError(
              `Could not acknowledge a screencast frame: ${errorMessage(error)}`,
            );
          }
        });
      });

      await this.cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: SCREENCAST_QUALITY,
        maxWidth: Math.round(this.options.maxWidth),
        maxHeight: Math.round(this.options.maxHeight),
        everyNthFrame: 1,
      });

      // CDP screencast delivery is damage-driven and a blank new page may
      // not emit an initial damage frame. Seed the fixed-rate pump with a
      // JPEG immediately so encoded time starts with session time instead
      // of silently dropping the quiet lead-in before the first mutation.
      if (this.latestFrame === null) {
        this.latestFrame = await this.page.screenshot({
          type: 'jpeg',
          quality: SCREENCAST_QUALITY,
        });
      }

      const intervalMs = 1000 / this.options.fps;
      this.emitterStartedAt = Date.now();
      this.emitter = setInterval(() => {
        this.emitTick();
      }, intervalMs);
    } catch (error: unknown) {
      try {
        await this.stop();
      } catch {
        // The launch error below is the actionable root cause. stop() is
        // best effort here because the child may never have spawned.
      }
      throw error instanceof ScreencastError
        ? error
        : new ScreencastError(`Could not start screencast capture: ${errorMessage(error)}`);
    }
  }

  private emitTick(): void {
    if (this.stopped || this.ffmpeg === null || this.ffmpeg.stdin.destroyed) {
      return;
    }
    if (this.latestFrame === null) {
      // No damage frame yet this tick: skip rather than encode a black
      // frame. ffmpeg's input framerate governs output pacing, and the
      // first real frame anchors the start.
      return;
    }
    const elapsedMs = Math.max(0, Date.now() - this.emitterStartedAt);
    const dueFrames = Math.floor((elapsedMs * this.options.fps) / 1000) + 1;
    const accountedFrames = this.framesWritten + this.pendingTicks;
    this.pendingTicks += Math.max(0, dueFrames - accountedFrames);
    this.flushPendingTicks();
  }

  private flushPendingTicks(): void {
    if (
      this.writeBackpressured ||
      this.ffmpeg === null ||
      this.latestFrame === null ||
      this.ffmpeg.stdin.destroyed
    ) {
      return;
    }
    while (this.pendingTicks > 0) {
      const ok = this.ffmpeg.stdin.write(this.latestFrame);
      this.pendingTicks -= 1;
      this.framesWritten += 1;
      if (!ok) {
        // Keep only a tick count while blocked, not another copy of every
        // JPEG. Drain catches up with the latest frame so wall-time frame
        // count stays aligned without unbounded image buffering.
        this.writeBackpressured = true;
        this.ffmpeg.stdin.once('drain', () => {
          this.writeBackpressured = false;
          this.flushPendingTicks();
        });
        return;
      }
    }
  }

  private spawnFfmpeg(): {
    child: ChildProcessWithoutNullStreams;
    spawned: Promise<void>;
  } {
    const bin = resolveFfmpegPath(this.options.env);
    const args = [
      '-hide_banner',
      '-nostdin',
      '-loglevel',
      'error',
      // image2pipe reads the JPEG stream at a constant rate; the emitter
      // upstream makes that rate wall-clock accurate.
      '-f',
      'image2pipe',
      '-framerate',
      String(this.options.fps),
      '-i',
      'pipe:0',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(this.options.fps),
      '-threads',
      String(CAPTURE_THREADS),
      '-flags:v',
      '+bitexact',
      '-fflags',
      '+bitexact',
      '-map_metadata',
      '-1',
      '-an',
      '-y',
      this.options.outputPath,
    ];
    try {
      const child = spawn(bin, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: this.options.env ?? process.env,
        windowsHide: true,
      });
      if (child.stdin === null || child.stdout === null || child.stderr === null) {
        throw new ScreencastError(`Could not open pipes to "${bin}".`);
      }
      child.stdout.resume();
      child.stderr.on('data', (chunk: Buffer) => {
        this.stderrTail = (this.stderrTail + chunk.toString('utf8')).slice(-4000);
      });
      const spawned = new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', (error: NodeJS.ErrnoException) => {
          const failure = new ScreencastError(
            `Could not launch ffmpeg for capture (set ${FFMPEG_PATH_ENV_VAR} if it is not on PATH): ${error.code ?? error.message}`,
          );
          this.ffmpegFailure = failure;
          reject(failure);
        });
      });
      child.stdin.on('error', (error: NodeJS.ErrnoException) => {
        if (!this.stopped || error.code !== 'EPIPE') {
          this.ffmpegFailure = new ScreencastError(
            `ffmpeg capture input failed: ${error.code ?? error.message}`,
          );
        }
      });
      return { child, spawned };
    } catch (error: unknown) {
      throw new ScreencastError(
        `Could not launch ffmpeg for capture (set ${FFMPEG_PATH_ENV_VAR} if it is not on PATH): ${errorMessage(error)}`,
      );
    }
  }

  /**
   * Stops screencast, flushes the pipe, and waits for ffmpeg to exit.
   * Resolves with the frame stats; rejects if ffmpeg failed.
   */
  async stop(): Promise<{ received: number; written: number }> {
    if (this.stopped) {
      return this.stats();
    }

    if (this.emitter !== null) {
      clearInterval(this.emitter);
      this.emitter = null;
      this.emitTick();
    }
    this.stopped = true;
    if (this.cdp !== null) {
      await this.cdp.send('Page.stopScreencast').catch(() => undefined);
      await this.cdp.detach().catch(() => undefined);
      this.cdp = null;
    }
    if (this.ffmpeg !== null) {
      const child = this.ffmpeg;
      this.flushPendingTicks();
      if (!child.stdin.destroyed) {
        child.stdin.end();
      }
      const killTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, 10_000);
      try {
        await this.ffmpegExit;
      } finally {
        clearTimeout(killTimer);
      }
      const code = child.exitCode;
      this.ffmpeg = null;
      if (this.ffmpegFailure !== null) {
        throw this.ffmpegFailure;
      }
      if (code === null) {
        throw new ScreencastError(
          `ffmpeg capture ended from signal ${child.signalCode ?? 'unknown'}: ${this.stderrTail}`,
        );
      }
      if (code !== 0) {
        throw new ScreencastError(
          `ffmpeg capture exited with code ${String(code)}: ${this.stderrTail}`,
        );
      }
    }
    return this.stats();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
