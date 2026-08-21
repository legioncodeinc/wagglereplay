import type { Page } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import { locateWithCascade, translateSelector } from '../src/steps/selector-cascade.js';

describe('translateSelector', () => {
  it('passes bare CSS through with an explicit engine', () => {
    expect(translateSelector('[data-testid="cta-start"]')).toEqual([
      {
        playwrightSelector: 'css=[data-testid="cta-start"]',
        engine: 'css',
        recorded: '[data-testid="cta-start"]',
      },
    ]);
  });

  it('translates an aria alternative into role then text candidates', () => {
    const candidates = translateSelector('aria/Start Walkthrough[role="button"]');
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual({
      playwrightSelector: 'role=button[name="Start Walkthrough"]',
      engine: 'role',
      recorded: 'aria/Start Walkthrough[role="button"]',
    });
    expect(candidates[1]?.engine).toBe('text');
  });

  it('falls back to text only when the aria alternative has no role', () => {
    const candidates = translateSelector('aria/Sign in');
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual({
      playwrightSelector: 'text=Sign in',
      engine: 'text',
      recorded: 'aria/Sign in',
    });
  });

  it('translates text alternatives', () => {
    expect(translateSelector('text/Continue')).toEqual([
      { playwrightSelector: 'text=Continue', engine: 'text', recorded: 'text/Continue' },
    ]);
  });

  it('translates xpath alternatives, prefixed and bare', () => {
    expect(translateSelector('xpath///button[1]')).toEqual([
      { playwrightSelector: 'xpath=//button[1]', engine: 'xpath', recorded: 'xpath///button[1]' },
    ]);
    expect(translateSelector('//main/button[2]')[0]?.playwrightSelector).toBe(
      'xpath=//main/button[2]',
    );
  });

  it('translates single-string pierce selectors to the css engine', () => {
    expect(translateSelector('pierce/[data-testid="x"]')).toEqual([
      {
        playwrightSelector: 'css=[data-testid="x"]',
        engine: 'css',
        recorded: 'pierce/[data-testid="x"]',
      },
    ]);
  });

  it('chains ancestor chains with the css engine', () => {
    expect(translateSelector(['#host', '[data-testid="inner"]'])).toEqual([
      {
        playwrightSelector: 'css=#host >> css=[data-testid="inner"]',
        engine: 'chain',
        recorded: '["#host","[data-testid=\\"inner\\"]"]',
      },
    ]);
  });

  it('escapes quotes inside aria names', () => {
    const candidates = translateSelector('aria/Say "hi"[role="button"]');
    expect(candidates[0]?.playwrightSelector).toBe('role=button[name="Say \\"hi\\""]');
  });
});

/**
 * A minimal Page stand-in: only `locator(...).first().waitFor(...)` is on
 * the cascade's critical path, so the fake resolves exactly the selector
 * strings named in `resolvable`.
 */
function fakePage(resolvable: readonly string[]): Page {
  const page = {
    locator(selector: string) {
      return {
        first() {
          return {
            async waitFor() {
              if (resolvable.includes(selector)) {
                return undefined;
              }
              throw new Error(`timeout: ${selector}`);
            },
          };
        },
      };
    },
  };
  return page as unknown as Page;
}

describe('locateWithCascade', () => {
  const cascadeOptions = { timeoutMs: 600, minCandidateMs: 50 };

  it('resolves the first alternative without drift', async () => {
    const result = await locateWithCascade(
      fakePage(['css=[data-testid="cta-start"]']),
      ['[data-testid="cta-start"]'],
      cascadeOptions,
    );
    expect(result).not.toBeNull();
    expect(result?.alternativeIndex).toBe(0);
    expect(result?.drift).toBe(false);
    expect(result?.attempted).toHaveLength(0);
  });

  it('records drift when a fallback alternative rescues the step', async () => {
    const alternatives = ['[data-testid="cta-start"]', 'aria/Start Walkthrough[role="button"]'];
    const result = await locateWithCascade(
      fakePage(['role=button[name="Start Walkthrough"]']),
      alternatives,
      cascadeOptions,
    );
    expect(result).not.toBeNull();
    expect(result?.alternativeIndex).toBe(1);
    expect(result?.drift).toBe(true);
    // The failed first alternative is reported for the run report.
    expect(result?.attempted.map((candidate) => candidate.playwrightSelector)).toEqual([
      'css=[data-testid="cta-start"]',
    ]);
  });

  it('returns null when nothing resolves', async () => {
    const result = await locateWithCascade(
      fakePage([]),
      ['#missing', 'text/Nowhere'],
      cascadeOptions,
    );
    expect(result).toBeNull();
  });
});
