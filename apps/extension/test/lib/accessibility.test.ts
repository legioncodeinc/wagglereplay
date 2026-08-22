// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { computeAccessibleName, computeAccessibleRole } from '../../src/lib/accessibility.js';

describe('computeAccessibleRole', () => {
  it('prefers an explicit role, then the implicit one', () => {
    document.body.innerHTML = '<div role="switch"></div><nav></nav><input type="checkbox">';
    expect(computeAccessibleRole(document.querySelector('div') as Element)).toBe('switch');
    expect(computeAccessibleRole(document.querySelector('nav') as Element)).toBe('navigation');
    expect(computeAccessibleRole(document.querySelector('input') as Element)).toBe('checkbox');
  });
});

describe('computeAccessibleName', () => {
  it('associates a label by its for attribute', () => {
    document.body.innerHTML = '<label for="email">Email address</label><input id="email">';
    const input = document.querySelector('input') as Element;
    expect(computeAccessibleName(input)).toBe('Email address');
  });

  it('falls back to a wrapping label, then the placeholder', () => {
    document.body.innerHTML = '<label>Wrapped<input id="a"></label>';
    expect(computeAccessibleName(document.querySelector('input') as Element)).toBe('Wrapped');

    document.body.innerHTML = '<input id="b" placeholder="Search">';
    expect(computeAccessibleName(document.querySelector('input') as Element)).toBe('Search');
  });

  /**
   * Regression: the label lookup used to interpolate the element's id into
   * a `label[for="..."]` selector, escaping `"` but not `\`. A recorded
   * page controls its own ids, so an id built to close the attribute
   * string early made the selector match a label of the PAGE's choosing,
   * letting a hostile page dictate the accessible name written into the
   * IR. An id ending in a bare backslash instead threw a SyntaxError out
   * of querySelector and killed sampling for that element.
   */
  it('cannot be steered by an id crafted to break out of a selector', () => {
    document.body.innerHTML =
      '<label for="decoy">ATTACKER CONTROLLED</label><input placeholder="real name">';
    const input = document.querySelector('input') as Element;
    input.setAttribute('id', 'a\\" ] , label , [ b="');

    expect(computeAccessibleName(input)).toBe('real name');
  });

  it('does not throw on an id ending in a backslash', () => {
    document.body.innerHTML = '<label for="other">Other</label><input placeholder="fallback">';
    const input = document.querySelector('input') as Element;
    input.setAttribute('id', 'trailing\\');

    expect(() => computeAccessibleName(input)).not.toThrow();
    expect(computeAccessibleName(input)).toBe('fallback');
  });

  it('still matches a label whose for attribute contains a backslash verbatim', () => {
    document.body.innerHTML = '<input placeholder="unused">';
    const label = document.createElement('label');
    label.setAttribute('for', 'odd\\id');
    label.textContent = 'Odd but legal';
    document.body.prepend(label);
    const input = document.querySelector('input') as Element;
    input.setAttribute('id', 'odd\\id');

    expect(computeAccessibleName(input)).toBe('Odd but legal');
  });
});
