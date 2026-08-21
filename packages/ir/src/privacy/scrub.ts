/**
 * Pure text redaction shared by replay, ingest, and narration (prd-010 AC5).
 *
 * This module deliberately performs no file or environment I/O. Callers
 * provide the exact literals that are sensitive at their boundary. Keeping
 * resolution outside this lowest shared package preserves ADR-008: only
 * packages/replay may read a demo credential value from the environment.
 */

export const DEFAULT_SCRUB_REPLACEMENT = '[REDACTED]';

export interface SensitiveTextLiterals {
  /** Environment variable names stored by reference in credentials.json. */
  readonly envNames?: readonly string[];
  /** Resolved values, supplied only by an authorized act-time caller. */
  readonly values?: readonly string[];
  /** Masked or flagged field values already present in an in-memory document. */
  readonly placeholders?: readonly string[];
  /** Test sentinels that must be treated exactly like production literals. */
  readonly canaries?: readonly string[];
}

export interface SensitiveTextScrubberOptions extends SensitiveTextLiterals {
  readonly replacement?: string;
}

export type SensitiveTextScrubber = (text: string) => string;

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function orderedUniqueLiterals(options: SensitiveTextLiterals): string[] {
  const literals = [
    ...(options.envNames ?? []),
    ...(options.values ?? []),
    ...(options.placeholders ?? []),
    ...(options.canaries ?? []),
  ].filter((literal) => literal.length > 0);

  return [...new Set(literals)].sort((left, right) => {
    const byLength = right.length - left.length;
    return byLength === 0 ? left.localeCompare(right) : byLength;
  });
}

/**
 * Creates a deterministic literal scrubber. Longer overlapping literals are
 * matched first, regex metacharacters are escaped, and replacement text is
 * returned from a callback so `$&` and similar sequences stay literal.
 */
export function createSensitiveTextScrubber(
  options: SensitiveTextScrubberOptions,
): SensitiveTextScrubber {
  const literals = orderedUniqueLiterals(options);
  if (literals.length === 0) {
    return (text) => text;
  }

  const replacement = options.replacement ?? DEFAULT_SCRUB_REPLACEMENT;
  const pattern = new RegExp(literals.map(escapeRegExpLiteral).join('|'), 'g');
  return (text) => text.replace(pattern, () => replacement);
}

/** One-shot form for provider and persistence boundaries. */
export function scrubSensitiveText(text: string, options: SensitiveTextScrubberOptions): string {
  return createSensitiveTextScrubber(options)(text);
}
