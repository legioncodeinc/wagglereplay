// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The three fixed shapes this fixture app can serve. Every variant renders
 * the same six routes with the same test ids, except for the one documented
 * difference each variant exists to exercise:
 *
 * - "default": the baseline walkthrough, stable selectors throughout.
 * - "moved-button": the landing page's call-to-action button loses its
 *   `data-testid` and moves to a different position in the DOM, while
 *   keeping its text and accessible role, for prd-009 AC6's fallback
 *   selector cascade test.
 * - "broken": selecting an item on the items route throws instead of
 *   updating the detail panel, for prd-011's seeded-defect QA run.
 */
export const FIXTURE_VARIANTS = ['default', 'moved-button', 'broken'] as const;

export type FixtureVariant = (typeof FIXTURE_VARIANTS)[number];

export function isFixtureVariant(value: string): value is FixtureVariant {
  return (FIXTURE_VARIANTS as readonly string[]).includes(value);
}
