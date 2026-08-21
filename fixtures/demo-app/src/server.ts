import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import { buildDocument } from './markup.js';
import { DEFAULT_FETCH_DELAY_MS, MAX_FETCH_DELAY_MS } from './routes.js';
import type { FixtureVariant } from './variant.js';
import { isFixtureVariant } from './variant.js';

const DEFAULT_HOST = '127.0.0.1';

export interface FixtureAppOptions {
  /** Which fixture shape to serve. Defaults to "default". */
  variant?: FixtureVariant;
  /** Port to bind. Defaults to 0 (an ephemeral port chosen by the OS). */
  port?: number;
  /** Host to bind. Defaults to 127.0.0.1. */
  host?: string;
}

export interface FixtureAppHandle {
  /** Base URL of the running server, e.g. "http://127.0.0.1:53214/". */
  url: string;
  /** The bound TCP port (useful when `port: 0` was requested). */
  port: number;
  /** The variant this instance is serving. */
  variant: FixtureVariant;
  /** Shuts the server down. Resolves once all connections have closed. */
  close: () => Promise<void>;
}

/**
 * Boots the fixture app's static HTTP server on an ephemeral (or explicit)
 * port and resolves once it is ready to accept requests. Node built-ins
 * only, no framework: every route this app exposes serves the same
 * self-contained document (see `markup.ts`), except `/api/data`, the one
 * same-origin JSON endpoint the document's own script calls.
 */
export async function startFixtureApp(options: FixtureAppOptions = {}): Promise<FixtureAppHandle> {
  const variant = options.variant ?? 'default';
  if (!isFixtureVariant(variant)) {
    throw new Error(`fixtures/demo-app: unknown variant "${variant}"`);
  }
  const host = options.host ?? DEFAULT_HOST;

  const server: Server = createServer((req, res) => {
    handleRequest(req, res, variant);
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error): void => reject(err);
    server.once('error', onError);
    server.listen(options.port ?? 0, host, () => {
      server.removeListener('error', onError);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('fixtures/demo-app: server did not bind to a TCP port');
  }
  const port = address.port;
  const url = `http://${host}:${port}/`;

  return {
    url,
    port,
    variant,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}

function handleRequest(req: IncomingMessage, res: ServerResponse, variant: FixtureVariant): void {
  const method = req.method ?? 'GET';
  const requestUrl = new URL(req.url ?? '/', 'http://fixture.local');

  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method not allowed');
    return;
  }

  if (requestUrl.pathname === '/api/data') {
    handleApiData(requestUrl, res, method);
    return;
  }

  // SPA fallback: any other path is server-rendered for that exact
  // pathname (see markup.ts), so a full navigation (typed URL, link with a
  // real href, reload) resolves to a real page load with real content for
  // every route, not just "/".
  const document = buildDocument(requestUrl.pathname, variant);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(method === 'HEAD' ? undefined : document);
}

/**
 * Turns the caller's `?delay=` into a timer duration that is ALWAYS inside
 * `[0, MAX_FETCH_DELAY_MS]`.
 *
 * The clamp is the unconditional last operation on every path rather than
 * living inside one branch of a ternary. The settle-marker tests
 * (PRD-003, PRD-009) need a caller-chosen delay, so the capability stays;
 * what changes is that no future edit to the validity guard can drop the
 * upper bound and let a caller-supplied value reach `setTimeout` and pin
 * the fixture server open (CodeQL `js/resource-exhaustion`).
 */
function clampFetchDelayMs(rawDelay: string | null): number {
  const parsed = rawDelay === null ? DEFAULT_FETCH_DELAY_MS : Number(rawDelay);
  const requested = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_FETCH_DELAY_MS;
  return Math.min(requested, MAX_FETCH_DELAY_MS);
}

function handleApiData(url: URL, res: ServerResponse, method: string): void {
  const delay = clampFetchDelayMs(url.searchParams.get('delay'));

  setTimeout(() => {
    const body = JSON.stringify({ value: 'settled', delay });
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(method === 'HEAD' ? undefined : body);
  }, delay);
}
