import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * The link-integrity check prd-008 AC2 requires: "every href and src in
 * the emitted page resolves to a file that actually exists in the
 * bundle." Deliberately a real parse of the HTML actually written, not a
 * re-derivation of what the template function intended to link, so a
 * future edit to the template that introduces a broken reference is
 * caught here rather than trusted on faith.
 */

/** Matches `href="..."` or `src="..."` (double- or single-quoted). Attribute-value only; not a general HTML parser. */
const LINK_ATTRIBUTE_PATTERN = /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/** A scheme, `#fragment`, or `data:` URI is not a bundle-relative file reference. */
function isExternalOrNonFileReference(href: string): boolean {
  if (href === '' || href.startsWith('#')) {
    return true;
  }
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href);
}

export interface LinkIntegrityResult {
  readonly ok: boolean;
  /** Every href/src value found, for reporting even when `ok` is true. */
  readonly checked: readonly string[];
  /** References that do not resolve to a file inside the bundle directory. */
  readonly missing: readonly string[];
}

/**
 * Extracts every `href`/`src` from `html`, resolves each bundle-relative
 * one against `bundleDir`, and reports which are missing on disk.
 */
export function checkLinkIntegrity(html: string, bundleDir: string): LinkIntegrityResult {
  const checked: string[] = [];
  const missing: string[] = [];

  for (const match of html.matchAll(LINK_ATTRIBUTE_PATTERN)) {
    const raw = match[1] ?? match[2] ?? '';
    if (isExternalOrNonFileReference(raw)) {
      continue;
    }
    const withoutFragment = raw.split('#')[0] ?? raw;
    const decoded = decodeURIComponent(withoutFragment);
    checked.push(decoded);
    const resolved = path.join(bundleDir, decoded);
    if (!existsSync(resolved)) {
      missing.push(decoded);
    }
  }

  return { ok: missing.length === 0, checked, missing };
}
