import { computeAccessibleName, computeAccessibleRole } from './accessibility.js';
import type { GeneratedSelector } from './events.js';

/**
 * Fallback selector generation (AC4), mirroring the Chrome DevTools
 * Recorder's strategy (corpus: capture-layer.md, and
 * https://developer.chrome.com/docs/devtools/recorder/reference): every
 * click gets a ranked list of independent selector strategies (css, aria,
 * text, xpath, pierce), `data-testid` preferred within the `css` entry.
 * Replay (prd-009) tries each in order until one resolves, which is what
 * lets the `moved-button` fixture variant still be found after its
 * `data-testid` and DOM position both change.
 */

const DATA_TESTID_ATTR = 'data-testid';
const MAX_TEXT_SELECTOR_LENGTH = 200;
const MAX_CSS_PATH_DEPTH = 8;

function escapeAttributeValue(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, (ch) => `\\${ch}`);
}

/** Builds a short CSS path using `#id` or `:nth-of-type` disambiguation, up to `MAX_CSS_PATH_DEPTH` ancestors. */
export function buildCssPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node !== null && depth < MAX_CSS_PATH_DEPTH) {
    let segment = node.tagName.toLowerCase();
    const id = node.getAttribute('id');
    if (id) {
      segment += `#${escapeAttributeValue(id)}`;
      parts.unshift(segment);
      break;
    }
    const parent: Element | null = node.parentElement;
    if (parent) {
      const sameTagSiblings = Array.from(parent.children).filter(
        (child) => child.tagName === node?.tagName,
      );
      if (sameTagSiblings.length > 1) {
        const index = sameTagSiblings.indexOf(node) + 1;
        segment += `:nth-of-type(${index})`;
      }
    }
    parts.unshift(segment);
    node = parent;
    depth += 1;
  }
  return parts.join(' > ');
}

/** Builds an absolute XPath from the document root, indexed by same-tag sibling position. */
export function buildXPath(el: Element): string {
  if (el.id) {
    return `//*[@id="${el.id}"]`;
  }
  const parts: string[] = [];
  let node: Element | null = el;
  while (node !== null) {
    let index = 1;
    let sibling = node.previousElementSibling;
    while (sibling !== null) {
      if (sibling.tagName === node.tagName) index += 1;
      sibling = sibling.previousElementSibling;
    }
    parts.unshift(`${node.tagName.toLowerCase()}[${index}]`);
    node = node.parentElement;
  }
  return `/${parts.join('/')}`;
}

/** Returns the shadow-root host if `el` lives inside one, else `null`. */
function findShadowHost(el: Element): Element | null {
  const root = el.getRootNode();
  if (typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot) {
    return root.host;
  }
  return null;
}

/**
 * Generates every fallback selector for `el`, ordered `css` (data-testid
 * preferred), `aria`, `text`, `xpath`, `pierce`.
 */
export function generateSelectors(el: Element): GeneratedSelector[] {
  const selectors: GeneratedSelector[] = [];

  const testId = el.getAttribute(DATA_TESTID_ATTR);
  const cssValue = testId
    ? `[${DATA_TESTID_ATTR}="${escapeAttributeValue(testId)}"]`
    : buildCssPath(el);
  selectors.push({ type: 'css', value: cssValue });

  const role = computeAccessibleRole(el);
  const name = computeAccessibleName(el);
  if (name.length > 0) {
    const roleSuffix = role !== 'generic' ? `[role="${role}"]` : '';
    selectors.push({ type: 'aria', value: `aria/${name}${roleSuffix}` });
  }

  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
  if (text.length > 0 && text.length <= MAX_TEXT_SELECTOR_LENGTH) {
    selectors.push({ type: 'text', value: `text/${text}` });
  }

  selectors.push({ type: 'xpath', value: buildXPath(el) });

  const shadowHost = findShadowHost(el);
  if (shadowHost) {
    selectors.push({ type: 'pierce', value: [buildCssPath(shadowHost), buildCssPath(el)] });
  } else {
    const firstSelector = selectors[0];
    selectors.push({ type: 'pierce', value: firstSelector ? firstSelector.value : cssValue });
  }

  return selectors;
}
