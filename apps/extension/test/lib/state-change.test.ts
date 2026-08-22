// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { observeStateChangeWindow } from '../../src/lib/state-change.js';

describe('observeStateChangeWindow', () => {
  it('reports no change for a click with no visible effect', async () => {
    document.body.innerHTML = '<div id="target">static</div>';
    const target = document.getElementById('target') as Element;

    const resultPromise = observeStateChangeWindow({ target, document, windowMs: 20 });
    const result = await resultPromise;
    expect(result.changed).toBe(false);
  });

  it('reports a state change when the subtree grows (fixtures/demo-app items case)', async () => {
    document.body.innerHTML = '<div id="item-detail">Select an item to see details.</div>';
    const target = document.getElementById('item-detail') as Element;

    const resultPromise = observeStateChangeWindow({ target, document, windowMs: 20 });
    // Simulate the app updating the panel in place, the way clicking
    // item-2 updates fixtures/demo-app's #item-detail with no route change.
    setTimeout(() => {
      target.textContent = '';
      const p = document.createElement('p');
      p.textContent = 'Item 2: a widget';
      target.appendChild(p);
    }, 5);

    const result = await resultPromise;
    expect(result.changed).toBe(true);
    expect(result.domDelta?.summary).toContain('added');
  });

  it('reports an aria attribute flip as a change', async () => {
    document.body.innerHTML = '<button id="toggle" aria-expanded="false">Menu</button>';
    const target = document.getElementById('toggle') as Element;

    const resultPromise = observeStateChangeWindow({ target, document, windowMs: 20 });
    setTimeout(() => target.setAttribute('aria-expanded', 'true'), 5);

    const result = await resultPromise;
    expect(result.changed).toBe(true);
    expect(result.domDelta?.ariaChanges.length).toBeGreaterThan(0);
    expect(result.domDelta?.ariaChanges[0]?.change).toBe('updated');
  });
});
