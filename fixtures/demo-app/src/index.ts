/**
 * Shared fixture app used by prd-003 (capture extension e2e), prd-009
 * (replay engine drift e2e), and prd-011 (vision QA seeded-defect run). See
 * README.md in this package for the route table, the `data-testid` catalog,
 * and the canonical six-step walkthrough these PRDs record and replay
 * against.
 */

export { buildDocument, renderRouteHtml } from './markup.js';
export type { RoutePath, TestId } from './routes.js';
export {
  CTA_START_TEXT,
  DEFAULT_FETCH_DELAY_MS,
  MAX_FETCH_DELAY_MS,
  ROUTE_ORDER,
  ROUTE_PATHS,
  TEST_IDS,
} from './routes.js';
export type { FixtureAppHandle, FixtureAppOptions } from './server.js';
export { startFixtureApp } from './server.js';
export type { FixtureVariant } from './variant.js';
export { FIXTURE_VARIANTS, isFixtureVariant } from './variant.js';
