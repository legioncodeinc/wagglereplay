import type { Locator, Page } from 'playwright-core';

/**
 * The fallback-selector cascade (prd-009 AC1).
 *
 * A step's `selectors` array holds INDEPENDENT alternatives in preference
 * order, exactly as the capture extension ranked them (css with
 * `data-testid` first, then aria, text, xpath, pierce; see
 * apps/extension/src/lib/selectors.ts). Each alternative is either a bare
 * string or a chain whose last entry is the target and whose earlier
 * entries are ancestors.
 *
 * The IR stores the alternatives as Puppeteer-Replay-style prefixed
 * strings (`aria/Name[role="button"]`, `text/Hello`, `xpath///button[1]`,
 * bare CSS otherwise) because ingest keeps only the value half of the
 * extension's `{type, value}` pairs (packages/ingest/src/segment/
 * build-steps.ts). Playwright does not read that spelling natively, so
 * this module is the one place that translates it, and the cascade tries
 * each translated candidate in recorded order until one resolves. This is
 * exactly the mechanism prd-009 AC6's moved-button drift e2e depends on:
 * when a UI change invalidates the primary selector, the next alternative
 * still finds the element and the fallback is RECORDED as drift rather
 * than failing the run.
 */

/** One IR selector alternative: a string or an ancestor chain. */
export type SelectorAlternative = string | readonly string[];

/** One Playwright selector string an alternative can translate to. */
export interface SelectorCandidate {
  /** The exact string handed to `page.locator(...)`. */
  readonly playwrightSelector: string;
  /** Which engine this candidate uses, for the run report. */
  readonly engine: 'css' | 'role' | 'text' | 'xpath' | 'chain';
  /**
   * The recorded alternative this candidate came from, verbatim, so drift
   * notes can quote the IR rather than a translation of it.
   */
  readonly recorded: string;
}

const ARIA_PATTERN = /^aria\/(.+?)(?:\[role="([^"]*)"\])?$/;
const KNOWN_PREFIXES = ['css/', 'text/', 'xpath/', 'pierce/'] as const;

/**
 * Translates one recorded alternative into ordered Playwright candidates.
 *
 * Pure: no browser, no I/O, deterministic for the same input, which is
 * what makes the cascade unit-testable without Chromium.
 */
export function translateSelector(alternative: SelectorAlternative): SelectorCandidate[] {
  if (typeof alternative !== 'string') {
    // Ancestor chain: every segment is CSS (the extension only builds
    // chains from CSS paths), the last entry is the target. Playwright's
    // `>>` chaining matches descendants, and its css engine pierces open
    // shadow roots, which is what the extension's `pierce` chains mean.
    if (alternative.length === 0) {
      return [];
    }
    const chained = alternative.map((segment) => `css=${segment}`).join(' >> ');
    return [
      { playwrightSelector: chained, engine: 'chain', recorded: JSON.stringify(alternative) },
    ];
  }

  const aria = ARIA_PATTERN.exec(alternative);
  if (aria !== null) {
    const name = aria[1] ?? '';
    const role = aria[2] ?? '';
    const candidates: SelectorCandidate[] = [];
    if (role !== '') {
      candidates.push({
        playwrightSelector: `role=${role}[name="${escapeForSelector(name)}"]`,
        engine: 'role',
        recorded: alternative,
      });
    }
    // The text engine is the fallback within the alternative: an author
    // who renames the accessible label but keeps the visible text (or
    // vice versa) still resolves.
    if (name !== '') {
      candidates.push({
        playwrightSelector: `text=${escapeForSelector(name)}`,
        engine: 'text',
        recorded: alternative,
      });
    }
    return candidates;
  }

  if (alternative.startsWith('text/')) {
    const text = alternative.slice('text/'.length);
    return [
      {
        playwrightSelector: `text=${escapeForSelector(text)}`,
        engine: 'text',
        recorded: alternative,
      },
    ];
  }

  if (
    alternative.startsWith('xpath/') ||
    alternative.startsWith('//') ||
    alternative.startsWith('./') ||
    alternative.startsWith('(')
  ) {
    const expr = alternative.startsWith('xpath/')
      ? alternative.slice('xpath/'.length)
      : alternative;
    return [{ playwrightSelector: `xpath=${expr}`, engine: 'xpath', recorded: alternative }];
  }

  if (alternative.startsWith('pierce/')) {
    // A single-string pierce selector is the extension's "same as the css
    // entry" spelling; Playwright's css engine pierces shadow roots.
    return [
      {
        playwrightSelector: `css=${alternative.slice('pierce/'.length)}`,
        engine: 'css',
        recorded: alternative,
      },
    ];
  }

  if (alternative.startsWith('css/')) {
    return [
      {
        playwrightSelector: `css=${alternative.slice('css/'.length)}`,
        engine: 'css',
        recorded: alternative,
      },
    ];
  }

  // Bare string: the CSS engine. Explicit rather than relying on
  // Playwright's bare-string auto-detection, so a pathological-looking
  // test id can never be misparsed as an xpath.
  return [{ playwrightSelector: `css=${alternative}`, engine: 'css', recorded: alternative }];
}

/** Escapes a name into a Playwright attribute-selector literal. */
function escapeForSelector(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

/** True when a raw string carries a selector prefix this module translates. */
export function hasKnownSelectorPrefix(value: string): boolean {
  return value.startsWith('aria/') || KNOWN_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export interface LocateOptions {
  /**
   * Total budget for the whole cascade, in ms. Split across alternatives,
   * with a per-candidate minimum so a long list cannot starve the tail.
   */
  readonly timeoutMs: number;
  /** Minimum time one candidate may use, so early alternatives cannot consume the budget. */
  readonly minCandidateMs?: number;
  /** Resolved for tests; defaults to `page.locator`. */
  readonly now?: () => number;
}

export interface LocateSuccess {
  readonly locator: Locator;
  /** Index into the step's recorded `selectors` array that resolved. */
  readonly alternativeIndex: number;
  /** The candidate that resolved. */
  readonly candidate: SelectorCandidate;
  /** Every candidate tried before it, in order, for the run report. */
  readonly attempted: readonly SelectorCandidate[];
  /** True when the resolved alternative was NOT the recorded first choice. */
  readonly drift: boolean;
}

/**
 * Runs the cascade: for each alternative, for each translated candidate,
 * try to attach within the remaining budget. The first candidate that
 * resolves to at least one element wins; `.first()` disambiguates a
 * multi-match (recorded selectors describe ONE element, and a fallback
 * like a text match may legitimately over-match).
 *
 * Returns `null` when nothing resolves within the budget. Callers turn
 * that into a structured StepFailure rather than letting an exception
 * escape: replay failures are data, not crashes (AC1).
 */
export async function locateWithCascade(
  page: Page,
  alternatives: readonly SelectorAlternative[],
  options: LocateOptions,
): Promise<LocateSuccess | null> {
  const minCandidateMs = options.minCandidateMs ?? 250;
  const startedAt = options.now?.() ?? Date.now();
  const attempted: SelectorCandidate[] = [];

  for (const [alternativeIndex, alternative] of alternatives.entries()) {
    const elapsed = (options.now?.() ?? Date.now()) - startedAt;
    const remaining = options.timeoutMs - elapsed;
    if (remaining <= 0) {
      return null;
    }
    const candidates = translateSelector(alternative);
    for (const candidate of candidates) {
      const candidateBudget = Math.max(minCandidateMs, Math.ceil(remaining / 2));
      const locator = page.locator(candidate.playwrightSelector).first();
      try {
        await locator.waitFor({ state: 'attached', timeout: candidateBudget });
        return {
          locator,
          alternativeIndex,
          candidate,
          attempted: [...attempted],
          drift: alternativeIndex > 0,
        };
      } catch {
        attempted.push(candidate);
      }
    }
  }
  return null;
}
