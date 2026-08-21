/**
 * Shared HTTP plumbing for TTS provider clients (ElevenLabs, Deepgram):
 * the injectable-transport type and the retry policy every client applies
 * to transient failures. Kept here rather than duplicated per-provider
 * because the retry semantics (what counts as retryable, backoff shape)
 * are a Waggle-wide policy, not a provider-specific one.
 */

/**
 * A fetch-compatible function. Every network call in this package goes
 * through this type instead of the global `fetch` directly: production
 * code defaults to real `fetch`, tests inject a function returning
 * hand-built `Response` objects that match the shapes documented in the
 * corpus, and every other line of request construction, retry, and
 * response parsing still runs for real against that fake transport.
 */
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

/**
 * Calls `fetchImpl` and retries on 429/5xx with exponential backoff, up to
 * `policy.maxRetries` additional attempts. Returns the first response that
 * is either non-retryable or the final attempt, whichever the caller then
 * decides how to handle (2xx vs error): retry policy is a transport
 * concern, response-shape validation is not, so this function never reads
 * the response body.
 */
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
