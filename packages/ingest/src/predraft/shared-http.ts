// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Shared HTTP plumbing for the pre-draft LLM adapters, deliberately
 * mirroring `@waggle/narrate`'s `packages/narrate/src/tts/shared/http.ts`
 * (same `FetchLike` shape, same retry policy) so the two packages' network
 * boundaries read the same way. Not imported from `@waggle/narrate`
 * directly: narration (prd-006) and pre-drafting (prd-004) are separate
 * PRDs with no reason to share a runtime dependency for eleven lines of
 * generic retry logic, and this package must not reach into a package
 * outside its own scope boundary. Extracting this into a tiny shared
 * `@waggle/http-retry` package if a third consumer shows up is a
 * reasonable future refactor, flagged here rather than done speculatively.
 */

/** A fetch-compatible function; production defaults to real `fetch`, tests inject a fake. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryPolicy {
  readonly maxRetries: number;
  readonly retryDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = { maxRetries: 2, retryDelayMs: 200 };

/** Retries a transport-level call on 429/5xx with exponential backoff. */
export async function fetchWithRetry(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    const response = await fetchImpl(url, init);
    if (response.ok || !isRetryableStatus(response.status) || attempt >= policy.maxRetries) {
      return response;
    }
    attempt += 1;
    await sleep(policy.retryDelayMs * 2 ** (attempt - 1));
  }
}
