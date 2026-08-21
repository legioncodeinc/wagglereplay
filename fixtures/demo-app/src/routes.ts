/**
 * Canonical route paths and `data-testid` catalog for the fixture app. Kept
 * as named constants (rather than inline strings) so this package's tests,
 * its README, and any downstream consumer (extension e2e, replay e2e,
 * vision QA) reference the same single source of truth.
 */
export const ROUTE_PATHS = {
  landing: '/',
  login: '/login',
  items: '/items',
  scroll: '/scroll',
  fetchDemo: '/fetch',
  confirm: '/confirm',
} as const;

export type RoutePath = (typeof ROUTE_PATHS)[keyof typeof ROUTE_PATHS];

/** Every route path, in canonical walkthrough order. */
export const ROUTE_ORDER: readonly RoutePath[] = [
  ROUTE_PATHS.landing,
  ROUTE_PATHS.login,
  ROUTE_PATHS.items,
  ROUTE_PATHS.scroll,
  ROUTE_PATHS.fetchDemo,
  ROUTE_PATHS.confirm,
];

export const TEST_IDS = {
  routeLanding: 'route-landing',
  ctaStart: 'cta-start',

  routeLogin: 'route-login',
  loginForm: 'login-form',
  inputUsername: 'input-username',
  inputPassword: 'input-password',
  btnLogin: 'btn-login',

  routeItems: 'route-items',
  itemList: 'item-list',
  item1: 'item-1',
  item2: 'item-2',
  item3: 'item-3',
  itemDetail: 'item-detail',
  btnContinueToScroll: 'btn-continue-to-scroll',

  routeScroll: 'route-scroll',
  scrollRegion: 'scroll-region',
  btnContinueToFetch: 'btn-continue-to-fetch',

  routeFetch: 'route-fetch',
  fetchTrigger: 'fetch-trigger',
  fetchResult: 'fetch-result',
  btnContinueToConfirm: 'btn-continue-to-confirm',

  routeConfirm: 'route-confirm',
  confirmationMessage: 'confirmation-message',
} as const;

export type TestId = (typeof TEST_IDS)[keyof typeof TEST_IDS];

/** Default artificial network delay for the /fetch route's XHR, in milliseconds. */
export const DEFAULT_FETCH_DELAY_MS = 200;

/** Upper bound accepted for the ?delay= query parameter, to keep tests bounded. */
export const MAX_FETCH_DELAY_MS = 5000;

/** The accessible text of the landing page's call-to-action button, stable across variants. */
export const CTA_START_TEXT = 'Start Walkthrough';
