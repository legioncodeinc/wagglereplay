// SPDX-License-Identifier: AGPL-3.0-or-later
import { parse } from '@puppeteer/replay';
import { describe, expect, it } from 'vitest';
import {
  exportToPuppeteerReplay,
  importChromeRecorderFlow,
  WalkthroughFlowSchema,
} from '../src/index.js';
import { loadFixture, RECORDER_FIXTURES, VALID_FLOW_FIXTURES } from './fixtures.js';

/**
 * AC5: export strips the Waggle keys and the result passes
 * `@puppeteer/replay`'s own `parse()` on every fixture.
 *
 * This calls the real upstream parser, not a stand-in. A hand-rolled
 * approximation of `parse()` would only prove that the export matches our
 * own reading of the schema, which is precisely the thing ADR-001 does not
 * want us to be the authority on.
 */

/** Walks a parsed JSON document and reports every path that carries a `waggle` key. */
function findWaggleKeys(value: unknown, path = '(root)'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findWaggleKeys(entry, `${path}[${index}]`));
  }
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  const found: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (key === 'waggle') {
      found.push(childPath);
    }
    found.push(...findWaggleKeys(child, childPath));
  }
  return found;
}

describe('AC5: export to @puppeteer/replay', () => {
  it.each(VALID_FLOW_FIXTURES)('%s survives the real parse()', (name) => {
    const flow = WalkthroughFlowSchema.parse(loadFixture(name));
    const exported = exportToPuppeteerReplay(flow);

    // The real upstream parser. It throws on anything it cannot replay.
    const parsed = parse(exported);

    expect(parsed.title).toBe(flow.title);
    expect(parsed.steps).toHaveLength(flow.steps.length);
    expect(parsed.steps.map((step) => step.type)).toEqual(flow.steps.map((step) => step.type));
  });

  it.each(VALID_FLOW_FIXTURES)('%s has no waggle key left anywhere after export', (name) => {
    const flow = WalkthroughFlowSchema.parse(loadFixture(name));

    // Sanity: the IR itself is full of waggle keys before the strip.
    expect(findWaggleKeys(flow).length).toBeGreaterThan(1);

    expect(findWaggleKeys(exportToPuppeteerReplay(flow))).toEqual([]);
  });

  it.each(VALID_FLOW_FIXTURES)('%s is not mutated by exporting it', (name) => {
    const flow = WalkthroughFlowSchema.parse(loadFixture(name));
    const before = JSON.stringify(flow);
    exportToPuppeteerReplay(flow);
    expect(JSON.stringify(flow)).toBe(before);
  });

  it.each(RECORDER_FIXTURES)('%s round-trips import -> export -> parse() unchanged', (name) => {
    const source = loadFixture(name);
    const exported = exportToPuppeteerReplay(importChromeRecorderFlow(source));

    expect(exported).toEqual(source);
    expect(() => parse(exported)).not.toThrow();
  });

  it('preserves every core field the replay engine needs', () => {
    const flow = WalkthroughFlowSchema.parse(loadFixture('flow-mixed'));
    const parsed = parse(exportToPuppeteerReplay(flow));

    expect(parsed.timeout).toBe(30_000);
    expect(parsed.selectorAttribute).toBe('data-testid');

    const clickStep = parsed.steps.find((step) => step.type === 'click');
    if (clickStep === undefined) {
      throw new Error('flow-mixed lost its click step during export');
    }
    expect(clickStep.selectors).toEqual(['[data-testid=sign-in-submit]', 'aria/Continue']);
    expect(clickStep.offsetX).toBe(60);
    expect(clickStep.offsetY).toBe(22);
    expect(clickStep.assertedEvents).toEqual([
      { type: 'navigation', url: 'https://demo.example.com/dashboard', title: undefined },
    ]);
  });

  it('rejects a flow whose export would not be a valid core flow', () => {
    const flow = WalkthroughFlowSchema.parse(loadFixture('flow-state-change'));
    // A caller reaching past the type system to smuggle in a broken core
    // field must be caught by export's own re-validation, not by the
    // replay engine at run time.
    const smuggled = structuredClone(flow) as unknown as {
      steps: Array<Record<string, unknown>>;
    };
    const step = smuggled.steps[0];
    if (step === undefined) {
      throw new Error('fixture lost its first step');
    }
    step.selectors = [];

    expect(() => exportToPuppeteerReplay(smuggled as never)).toThrowError(
      /failed Walkthrough IR validation/,
    );
  });
});
