import { afterEach, describe, expect, it } from 'vitest';
import { ROUTE_PATHS, TEST_IDS } from '../src/routes.js';
import type { FixtureAppHandle } from '../src/server.js';
import { startFixtureApp } from '../src/server.js';

const ROUTE_TEST_IDS: ReadonlyArray<readonly [string, string]> = [
  [ROUTE_PATHS.landing, TEST_IDS.routeLanding],
  [ROUTE_PATHS.login, TEST_IDS.routeLogin],
  [ROUTE_PATHS.items, TEST_IDS.routeItems],
  [ROUTE_PATHS.scroll, TEST_IDS.routeScroll],
  [ROUTE_PATHS.fetchDemo, TEST_IDS.routeFetch],
  [ROUTE_PATHS.confirm, TEST_IDS.routeConfirm],
];

let handle: FixtureAppHandle | undefined;

afterEach(async () => {
  if (handle) {
    await handle.close();
    handle = undefined;
  }
});

async function getText(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url);
  return { status: res.status, body: await res.text() };
}

describe('startFixtureApp: boot and shutdown', () => {
  it('binds an ephemeral port and reports a matching url', async () => {
    handle = await startFixtureApp();
    expect(handle.port).toBeGreaterThan(0);
    expect(handle.url).toBe(`http://127.0.0.1:${handle.port}/`);
  });

  it('serves every canonical route with a 200 and its server-rendered route test id', async () => {
    handle = await startFixtureApp();
    for (const [path, routeTestId] of ROUTE_TEST_IDS) {
      const { status, body } = await getText(new URL(path, handle.url).toString());
      expect(status, `GET ${path}`).toBe(200);
      expect(body, `GET ${path} body`).toContain(`data-testid="${routeTestId}"`);
    }
  });

  it('falls back to the landing route for an unmapped deep link (SPA fallback)', async () => {
    handle = await startFixtureApp();
    const { status, body } = await getText(new URL('/items/deep/link', handle.url).toString());
    expect(status).toBe(200);
    expect(body).toContain(`data-testid="${TEST_IDS.routeLanding}"`);
  });

  it('rejects non-GET/HEAD methods', async () => {
    handle = await startFixtureApp();
    const res = await fetch(handle.url, { method: 'POST' });
    expect(res.status).toBe(405);
  });

  it('closes cleanly: further requests fail once closed', async () => {
    const app = await startFixtureApp();
    const url = app.url;
    await app.close();
    handle = undefined;
    await expect(fetch(url)).rejects.toBeTruthy();
  });
});

describe('startFixtureApp: /api/data settle endpoint', () => {
  it('honors the delay query parameter', async () => {
    handle = await startFixtureApp();
    const delayMs = 40;
    const started = Date.now();
    const res = await fetch(new URL(`/api/data?delay=${delayMs}`, handle.url).toString());
    const elapsed = Date.now() - started;
    const data = (await res.json()) as { value: string; delay: number };
    expect(res.status).toBe(200);
    expect(data.value).toBe('settled');
    expect(data.delay).toBe(delayMs);
    expect(elapsed).toBeGreaterThanOrEqual(delayMs - 5);
  });

  it('clamps an out-of-range delay to the documented maximum', async () => {
    handle = await startFixtureApp();
    const res = await fetch(new URL('/api/data?delay=999999999', handle.url).toString());
    const data = (await res.json()) as { delay: number };
    expect(data.delay).toBe(5000);
  });

  it('falls back to the default delay for a malformed value', async () => {
    handle = await startFixtureApp();
    const res = await fetch(new URL('/api/data?delay=not-a-number', handle.url).toString());
    const data = (await res.json()) as { delay: number };
    expect(data.delay).toBe(200);
  });
});

describe('startFixtureApp: variants', () => {
  it('default variant keeps the cta-start test id on the landing page', async () => {
    handle = await startFixtureApp({ variant: 'default' });
    const { body } = await getText(handle.url);
    expect(body).toContain(`data-testid="${TEST_IDS.ctaStart}"`);
    expect(body).toContain('Start Walkthrough');
  });

  it('moved-button variant drops the cta-start test id but keeps the button text and role', async () => {
    handle = await startFixtureApp({ variant: 'moved-button' });
    const { body } = await getText(handle.url);
    expect(body).not.toContain(`data-testid="${TEST_IDS.ctaStart}"`);
    expect(body).toContain('Start Walkthrough');
    // The button still exists as a real <button>, just without the test id,
    // and it appears after the footer instead of directly inside <main>.
    expect(body).toContain(
      '<button type="button" data-action="go-login">Start Walkthrough</button>',
    );
    const footerIndex = body.indexOf('fixture-footer');
    const buttonIndex = body.indexOf('data-action="go-login"');
    expect(footerIndex).toBeGreaterThan(-1);
    expect(buttonIndex).toBeGreaterThan(footerIndex);
  });

  it('broken variant embeds the item-selection defect in its served bytes; default does not', async () => {
    const defaultApp = await startFixtureApp({ variant: 'default' });
    const brokenApp = await startFixtureApp({ variant: 'broken' });
    try {
      const defaultBody = (await getText(defaultApp.url)).body;
      const brokenBody = (await getText(brokenApp.url)).body;
      expect(brokenBody).toContain('fixture-app broken variant: item selection handler failed');
      expect(defaultBody).not.toContain('fixture-app broken variant');
    } finally {
      await defaultApp.close();
      await brokenApp.close();
    }
  });

  it('rejects an unknown variant', async () => {
    // @ts-expect-error deliberately passing an invalid variant to test the runtime guard
    await expect(startFixtureApp({ variant: 'not-a-variant' })).rejects.toThrow(/unknown variant/);
  });
});
