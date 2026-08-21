/**
 * Heuristic accessible role/name computation.
 *
 * This is a deliberately small subset of the W3C accname algorithm
 * (https://www.w3.org/TR/accname-1.2/), not a full implementation: it
 * covers the attribute and element shapes the fixture app and most
 * real-world SPA markup actually use (aria-label, aria-labelledby, a
 * `<label>` association, alt text, title, and trimmed text content), in
 * that precedence order. It exists so the element sampler (AC4) and the
 * selector generator's `aria/` fallback (AC4) can describe an element the
 * same way a screen reader roughly would, without pulling in a full
 * accessibility-tree computation library for a pre-alpha extension.
 */

const IMPLICIT_ROLES: Readonly<Record<string, string>> = {
  a: 'link',
  button: 'button',
  footer: 'contentinfo',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  header: 'banner',
  img: 'img',
  li: 'listitem',
  main: 'main',
  nav: 'navigation',
  select: 'combobox',
  table: 'table',
  textarea: 'textbox',
  ul: 'list',
};

const INPUT_TYPE_ROLES: Readonly<Record<string, string>> = {
  button: 'button',
  checkbox: 'checkbox',
  email: 'textbox',
  number: 'spinbutton',
  password: 'textbox',
  radio: 'radio',
  range: 'slider',
  reset: 'button',
  search: 'searchbox',
  submit: 'button',
  text: 'textbox',
};

/** Fallback role for anything with no explicit or mapped implicit role. */
const GENERIC_ROLE = 'generic';

function implicitInputRole(el: Element): string {
  const type = (el.getAttribute('type') ?? 'text').toLowerCase();
  return INPUT_TYPE_ROLES[type] ?? 'textbox';
}

/** Computes the accessible role, preferring an explicit `role` attribute. */
export function computeAccessibleRole(el: Element): string {
  const explicit = el.getAttribute('role');
  if (explicit && explicit.trim().length > 0) {
    return explicit.trim().split(/\s+/)[0] ?? GENERIC_ROLE;
  }
  const tag = el.tagName.toLowerCase();
  if (tag === 'input') return implicitInputRole(el);
  return IMPLICIT_ROLES[tag] ?? GENERIC_ROLE;
}

function labelledByText(el: Element): string | null {
  const ids = el.getAttribute('aria-labelledby');
  if (!ids) return null;
  const doc = el.ownerDocument;
  const parts = ids
    .split(/\s+/)
    .filter((id) => id.length > 0)
    .map((id) => doc.getElementById(id)?.textContent?.trim())
    .filter((text): text is string => Boolean(text && text.length > 0));
  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * Finds the `<label for="...">` associated with an element id.
 *
 * The id comes from the page being recorded, which is attacker-influenced
 * whenever an author records a page they do not control, so it is never
 * interpolated into a selector string. The previous implementation escaped
 * `"` but not `\`, so an id containing a backslash either threw a
 * `SyntaxError` out of `querySelector` (killing the content script's
 * sampling for that element) or terminated the attribute selector early
 * and matched an element of the page's choosing, letting a hostile page
 * dictate the accessible name recorded into the IR.
 *
 * Comparing the `for` attribute directly removes the selector-injection
 * class entirely rather than escaping around it: there is no selector to
 * escape. `CSS.escape` would also be correct, but it is a global whose
 * presence depends on the realm the element lives in, whereas this works
 * anywhere an `Element` does. Document order is preserved, so the element
 * chosen matches what `querySelector` returned for a benign id.
 */
function labelForInput(el: Element): string | null {
  const doc = el.ownerDocument;
  const id = el.getAttribute('id');
  if (id) {
    for (const label of doc.querySelectorAll('label[for]')) {
      if (label.getAttribute('for') !== id) continue;
      const explicitText = label.textContent?.trim();
      if (explicitText) return explicitText;
      break;
    }
  }
  const wrapping = el.closest('label');
  const wrappingText = wrapping?.textContent?.trim();
  if (wrappingText) return wrappingText;
  return null;
}

/**
 * Computes the accessible name using this Bee's precedence subset:
 * aria-label, aria-labelledby, associated `<label>`, `alt`, `title`, then
 * trimmed text content (truncated to keep IR steps and selector strings
 * bounded).
 */
export function computeAccessibleName(el: Element): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim().length > 0) return ariaLabel.trim();

  const labelledBy = labelledByText(el);
  if (labelledBy) return labelledBy;

  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    const labelText = labelForInput(el);
    if (labelText) return labelText;
    const placeholder = el.getAttribute('placeholder');
    if (placeholder && placeholder.trim().length > 0) return placeholder.trim();
  }

  if (tag === 'img') {
    const alt = el.getAttribute('alt');
    if (alt && alt.trim().length > 0) return alt.trim();
  }

  const title = el.getAttribute('title');
  if (title && title.trim().length > 0) return title.trim();

  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
  return text.slice(0, 160);
}
