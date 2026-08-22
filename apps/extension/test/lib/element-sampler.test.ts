// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { sampleElement } from '../../src/lib/element-sampler.js';

describe('sampleElement', () => {
  it('samples role, name, rect, viewport, and scroll offsets', () => {
    document.body.innerHTML = '<button data-testid="cta-start">Start Walkthrough</button>';
    const el = document.querySelector('[data-testid="cta-start"]');
    expect(el).not.toBeNull();

    const sample = sampleElement(el as Element, window);

    expect(sample.element.role).toBe('button');
    expect(sample.element.name).toBe('Start Walkthrough');
    expect(sample.element.rect).toHaveProperty('x');
    expect(sample.element.rect).toHaveProperty('w');
    expect(sample.viewport.dpr).toBeGreaterThan(0);
    expect(sample.selectors.length).toBeGreaterThan(0);
    expect(sample.selectors[0]?.value).toBe('[data-testid="cta-start"]');
  });

  it('defaults dpr to 1 when devicePixelRatio is falsy', () => {
    document.body.innerHTML = '<div id="x"></div>';
    const el = document.getElementById('x') as Element;
    const fakeWindow = Object.assign(Object.create(window), { devicePixelRatio: 0 });
    const sample = sampleElement(el, fakeWindow);
    expect(sample.viewport.dpr).toBe(1);
  });
});
