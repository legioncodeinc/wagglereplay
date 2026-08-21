/**
 * The preset-job concurrency limiter (prd-009 AC8).
 *
 * `WAGGLE_RENDER_CONCURRENCY` bounds how many preset jobs (a replay
 * capture plus its composite) run at once. Each job drives a Chromium
 * context AND an ffmpeg encode, so unbounded parallelism would trade a
 * fast regen for memory pressure and nondeterministic capture pacing on
 * anything but a big machine.
 *
 * Parsing rules, deliberately strict and documented:
 *  - unset: default (2; one capture plus one encode headroom on a laptop)
 *  - an integer 1..MAX: exactly that many slots
 *  - anything else (0, negative, non-numeric, fractional): the regen
 *    fails with an actionable message rather than silently falling back,
 *    because a typo like `WAGGLE_RENDER_CONCURRENCY=1O` must not quietly
 *    half the user's throughput.
 */

export const CONCURRENCY_ENV_VAR = 'WAGGLE_RENDER_CONCURRENCY';
export const DEFAULT_CONCURRENCY = 2;
export const MAX_CONCURRENCY = 8;

export class ConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConcurrencyError';
  }
}

export function parseConcurrency(raw: string | undefined): number {
  if (raw === undefined || raw === '') {
    return DEFAULT_CONCURRENCY;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_CONCURRENCY) {
    throw new ConcurrencyError(
      `${CONCURRENCY_ENV_VAR} must be an integer between 1 and ${MAX_CONCURRENCY}, received "${raw}".`,
    );
  }
  return value;
}

/**
 * Runs `jobs` with at most `limit` in flight. Preserves input order in
 * the result. A rejected job does not cancel its siblings: every job
 * runs, and the caller (regen) reports per-preset failures instead of
 * aborting the whole run.
 */
export async function runWithConcurrency<T>(
  jobs: readonly (() => Promise<T>)[],
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  if (limit < 1) {
    throw new ConcurrencyError(`limit must be >= 1, received ${String(limit)}.`);
  }
  const results: PromiseSettledResult<T>[] = new Array(jobs.length);
  let nextIndex = 0;

  const workers: Promise<void>[] = [];
  const workerCount = Math.max(1, Math.min(limit, jobs.length));
  for (let worker = 0; worker < workerCount; worker += 1) {
    workers.push(
      (async () => {
        while (nextIndex < jobs.length) {
          const index = nextIndex;
          nextIndex += 1;
          const job = jobs[index];
          if (job === undefined) {
            continue;
          }
          try {
            results[index] = { status: 'fulfilled', value: await job() };
          } catch (error) {
            results[index] = { status: 'rejected', reason: error };
          }
        }
      })(),
    );
  }
  await Promise.all(workers);
  return results;
}
