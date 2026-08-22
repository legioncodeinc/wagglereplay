// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { buildCssPath, buildXPath, generateSelectors } from '../../src/lib/selectors.js';

function elementFromHtml(html: string): Element {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const el = doc.body.firstElementChild;
  if (!el) throw new Error('test fixture markup produced no element');
  return el;
}

/** Like `elementFromHtml`, but returns the whole body for multi-root markup. */
function bodyFromHtml(html: string): Element {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return doc.body;
}

describe('generateSelectors', () => {
  it('prefers data-testid for the css selector', () => {
    const el = elementFromHtml('<button data-testid="cta-start">Start Walkthrough</button>');
    const selectors = generateSelectors(el);
    const css = selectors.find((s) => s.type === 'css');
    expect(css?.value).toBe('[data-testid="cta-start"]');
  });

  it('falls back to a computed css path with no data-testid', () => {
    const el = elementFromHtml('<div><span><em>x</em></span></div>').querySelector('em');
    expect(el).not.toBeNull();
    const selectors = generateSelectors(el as Element);
    const css = selectors.find((s) => s.type === 'css');
    expect(css?.value).toContain('em');
  });

  it('produces an aria selector from the accessible name', () => {
    const el = elementFromHtml('<button aria-label="Continue">Go</button>');
    const selectors = generateSelectors(el);
    const aria = selectors.find((s) => s.type === 'aria');
    expect(aria?.value).toBe('aria/Continue[role="button"]');
  });

  it('produces a text selector from trimmed textContent', () => {
    const el = elementFromHtml('<button>  Start   Walkthrough  </button>');
    const selectors = generateSelectors(el);
    const text = selectors.find((s) => s.type === 'text');
    expect(text?.value).toBe('text/Start Walkthrough');
  });

  it('always produces a non-empty xpath selector', () => {
    const el = elementFromHtml('<div id="root"><button>Click</button></div>').querySelector(
      'button',
    );
    const selectors = generateSelectors(el as Element);
    const xpath = selectors.find((s) => s.type === 'xpath');
    expect(typeof xpath?.value).toBe('string');
    expect((xpath?.value as string).length).toBeGreaterThan(0);
  });

  it('still finds the button after data-testid and DOM position change (moved-button variant)', () => {
    // Mirrors fixtures/demo-app's `moved-button` variant: the cta-start
    // button loses its data-testid and moves after a footer, but keeps its
    // role and accessible text - exactly what AC4's fallback selectors
    // (and prd-009's replay cascade) are supposed to survive.
    const el = bodyFromHtml(
      '<footer class="fixture-footer"></footer><button class="cta">Start Walkthrough</button>',
    ).querySelector('button.cta') as Element;

    const selectors = generateSelectors(el);
    const aria = selectors.find((s) => s.type === 'aria');
    const text = selectors.find((s) => s.type === 'text');
    expect(aria?.value).toContain('Start Walkthrough');
    expect(text?.value).toBe('text/Start Walkthrough');
  });

  it('every generated selector is non-empty', () => {
    const el = elementFromHtml('<a href="/x">link text</a>');
    const selectors = generateSelectors(el);
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      const value = selector.value;
      if (typeof value === 'string') {
        expect(value.length).toBeGreaterThan(0);
      } else {
        expect(value.length).toBeGreaterThan(0);
        for (const chainEntry of value) expect(chainEntry.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('buildCssPath', () => {
  it('disambiguates same-tag siblings with nth-of-type', () => {
    const parent = elementFromHtml('<ul><li>a</li><li>b</li><li>c</li></ul>');
    const second = parent.children[1];
    expect(second).toBeDefined();
    expect(buildCssPath(second as Element)).toContain('li:nth-of-type(2)');
  });
});

describe('buildXPath', () => {
  it('uses an id shortcut when available', () => {
    const el = elementFromHtml('<div id="unique-id"></div>');
    expect(buildXPath(el)).toBe('//*[@id="unique-id"]');
  });

  it('builds an absolute path with sibling indices otherwise', () => {
    const parent = elementFromHtml('<section><p>a</p><p>b</p></section>');
    const second = parent.children[1] as Element;
    expect(buildXPath(second)).toMatch(/\/p\[2\]$/);
  });
});
