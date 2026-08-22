// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Locator, Page } from 'playwright-core';

/**
 * Per-step settle (prd-009 AC1): element assertion primary, quiescence
 * heuristic with exclusions secondary, timeout tertiary.
 *
 * The corpus (replay-and-render.md) is explicit that
 * `waitForLoadState('networkidle')` is officially discouraged; the
 * primary signal is a per-step element assertion. This module implements
 * the full ladder, and reports WHICH rung settled the step so the run
 * report (prd-009 AC7) can record settle sources the way the capture
 * extension does.
 */

/** Which rung of the settle ladder fired. */
export const REPLAY_SETTLE_SOURCES = [
  'element-assertion',
  'mutation-quiet',
  'network-idle',
  'timeout',
] as const;
export type ReplaySettleSource = (typeof REPLAY_SETTLE_SOURCES)[number];

export interface SettleOutcome {
  readonly source: ReplaySettleSource;
  /** Wall time spent settling, in ms. */
  readonly ms: number;
}

export interface SettleOptions {
  /** Tertiary budget for the whole ladder, in ms. */
  readonly timeoutMs: number;
  /** How long the page must stay mutation-free and network-free. Default 150ms. */
  readonly quietMs?: number;
  // Removed 2026-08-21 (Run 4 guardrail pass): a `networkExclusions` field
  // used to sit here but settleStep never read it; the quiescence probe's
  // exclusion list is page state installed once by the determinism context
  // (`createDeterministicContext`'s `networkExclusions`, which becomes
  // `window.__waggleSettleExclusions`). A per-step copy that was silently
  // dropped read as working configuration; the live path is unchanged.
}

/**
 * The quiescence probe injected at context creation (see
 * ../determinism/context.ts). Kept as one string so it can be reused by
 * the init script and unit-tested by running it in a page.
 *
 * Tracks two signals:
 *  - DOM mutations (MutationObserver on the whole document), timestamped;
 *  - in-flight fetch/XHR, via patched constructors with a URL exclusion
 *    list, so analytics beacons do not hold a page "busy" forever.
 *
 * Exposed as `window.__waggleQuiescence` with a `snapshot()` that returns
 * `{ lastMutationAt, inFlight }`; `snapshot()` is null until the observer
 * has attached, which distinguishes "not installed" from "quiet since
 * epoch 0".
 */
export const QUIESCENCE_PROBE_SOURCE = String.raw`
(() => {
  if (window.__waggleQuiescence) return;
  const state = { lastMutationAt: performance.now(), inFlight: 0 };
  const excluded = (url) => {
    const exclusions = (window.__waggleSettleExclusions || []).map((s) => String(s).toLowerCase());
    const u = String(url || '').toLowerCase();
    return exclusions.some((needle) => needle !== '' && u.includes(needle));
  };
  const observe = (root) => {
    try {
      new MutationObserver(() => { state.lastMutationAt = performance.now(); })
        .observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    } catch { /* a detached root cannot be observed; the next navigation reinstalls */ }
  };
  observe(document.documentElement || document);
  const wrap = (native) => {
    return function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (excluded(url)) return native.apply(this, arguments);
      state.inFlight += 1;
      const settle = () => { state.inFlight = Math.max(0, state.inFlight - 1); };
      try {
        const promise = native.apply(this, arguments);
        promise.then(settle, settle);
        return promise;
      } catch (error) {
        settle();
        throw error;
      }
    };
  };
  if (window.fetch) window.fetch = wrap(window.fetch.bind(window));
  if (window.XMLHttpRequest) {
    const XHR = window.XMLHttpRequest;
    const open = XHR.prototype.open;
    XHR.prototype.open = function (method, url) {
      this.__waggleUrl = String(url || '');
      return open.apply(this, arguments);
    };
    const send = XHR.prototype.send;
    XHR.prototype.send = function () {
      if (!excluded(this.__waggleUrl)) {
        state.inFlight += 1;
        const settle = () => { state.inFlight = Math.max(0, state.inFlight - 1); };
        this.addEventListener('loadend', settle);
      }
      return send.apply(this, arguments);
    };
  }
  window.__waggleQuiescence = {
    snapshot() {
      return { lastMutationAt: state.lastMutationAt, inFlight: state.inFlight };
    },
  };
})();
`;

/** Serialized shape of `window.__waggleQuiescence.snapshot()`. */
export interface QuiescenceSnapshot {
  readonly lastMutationAt: number;
  readonly inFlight: number;
}

const POLL_INTERVAL_MS = 25;

/**
 * Shape of the probe the init script installs. The evaluate callbacks
 * below run IN THE BROWSER, but this package compiles against Node
 * types, where `window` does not exist; they read the probe off
 * `globalThis` inline (a closure over a helper would not survive
 * Playwright's serialization of the callback) so the same code
 * typechecks in both worlds.
 */
interface QuiescenceGlobal {
  __waggleQuiescence?: { snapshot(): QuiescenceSnapshot };
}

/**
 * Rung 1: the per-step element assertion.
 *
 * What "asserted" means depends on what the step itself says it expected:
 * a step that recorded a route change asserts the new URL (this catches
 * History-API navigations too, which never fire a load event), and any
 * step with selectors asserts its target element is still attached. A
 * step with neither (rare: bare navigations) skips straight to rung 2.
 */
async function elementAssertion(
  page: Page,
  target: Locator | null,
  expectedRoute: string | undefined,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  if (expectedRoute !== undefined && expectedRoute !== '') {
    try {
      await page.waitForURL(`**${expectedRoute}`, { timeout: Math.max(1, deadline - Date.now()) });
    } catch {
      return false;
    }
  }
  if (target !== null) {
    try {
      await target.waitFor({ state: 'visible', timeout: Math.max(1, deadline - Date.now()) });
    } catch {
      return false;
    }
  }
  return target !== null || expectedRoute !== undefined;
}

/**
 * Rung 2: the quiescence heuristic with exclusions. Polls the injected
 * probe until the page has been mutation-free and network-free for
 * `quietMs`, or the deadline passes. Returns which signal was still loud
 * when the deadline hit, so rung 3 can report honestly.
 */
async function quiescence(
  page: Page,
  quietMs: number,
  timeoutMs: number,
): Promise<{ settled: true; source: 'mutation-quiet' | 'network-idle' } | { settled: false }> {
  const deadline = Date.now() + timeoutMs;
  const minQuietSince = Date.now() - quietMs;
  let lastMutationAt = minQuietSince;
  let sawInFlight = false;

  while (Date.now() < deadline) {
    const snapshot = (await page
      .evaluate(() => {
        const probe = (globalThis as unknown as QuiescenceGlobal).__waggleQuiescence;
        return probe ? probe.snapshot() : null;
      })
      .catch(() => null)) as QuiescenceSnapshot | null;
    if (snapshot !== null) {
      if (snapshot.lastMutationAt > lastMutationAt) {
        lastMutationAt = snapshot.lastMutationAt;
      }
      // `performance.now()` in the page and `Date.now()` here are
      // different clocks; the probe's lastMutationAt is page-relative, so
      // quietness is judged inside the page below rather than here.
      const pageQuiet = await page
        .evaluate((quiet) => {
          const probe = (globalThis as unknown as QuiescenceGlobal).__waggleQuiescence;
          if (!probe) return false;
          const snap = probe.snapshot();
          return snap.inFlight === 0 && performance.now() - snap.lastMutationAt >= quiet;
        }, quietMs)
        .catch(() => false);
      if (pageQuiet) {
        return {
          settled: true,
          source: sawInFlight ? 'network-idle' : 'mutation-quiet',
        };
      }
      if (snapshot.inFlight > 0) {
        sawInFlight = true;
      }
    }
    await page.waitForTimeout(POLL_INTERVAL_MS).catch(() => undefined);
  }

  return { settled: false };
}

export interface SettleInput {
  readonly page: Page;
  /** The located target locator, when the step had selectors. */
  readonly target: Locator | null;
  /** `step.waggle.routeAfter`, when the step recorded a route change. */
  readonly expectedRoute: string | undefined;
  readonly options: SettleOptions;
}

/**
 * Runs the settle ladder for one step. Never throws: when nothing
 * settles inside the budget the ladder resolves with source `timeout`,
 * because "the page never went quiet" is a recorded observation, not a
 * replay failure (AC1 keeps failures for locate/act).
 */
export async function settleStep(input: SettleInput): Promise<SettleOutcome> {
  const { page, target, expectedRoute, options } = input;
  const startedAt = Date.now();
  const quietMs = options.quietMs ?? 150;

  const assertionBudget = Math.min(
    options.timeoutMs,
    Math.max(200, Math.floor(options.timeoutMs / 2)),
  );
  if (await elementAssertion(page, target, expectedRoute, assertionBudget)) {
    return { source: 'element-assertion', ms: Date.now() - startedAt };
  }

  const remaining = options.timeoutMs - (Date.now() - startedAt);
  if (remaining > 0) {
    const result = await quiescence(page, quietMs, remaining);
    if (result.settled) {
      return { source: result.source, ms: Date.now() - startedAt };
    }
  }

  return { source: 'timeout', ms: Date.now() - startedAt };
}
