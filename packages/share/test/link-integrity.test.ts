// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkLinkIntegrity } from '../src/bundle/link-integrity.js';
import { makeTempDir } from './fixtures.js';

/**
 * prd-008 AC2: "passes a link-integrity check ... every href and src in
 * the emitted page resolves to a file that actually exists in the
 * bundle." This is the check itself, exercised directly rather than only
 * indirectly through the bundle e2e test, so a regression in the checker
 * fails here with a precise reason instead of surfacing as a confusing
 * bundle-test failure.
 */
describe('AC2: checkLinkIntegrity', () => {
  it('passes when every href/src resolves inside the bundle directory', () => {
    const dir = makeTempDir('link-ok');
    writeFileSync(path.join(dir, 'video.mp4'), 'fake');
    writeFileSync(path.join(dir, 'poster.jpg'), 'fake');
    writeFileSync(path.join(dir, 'captions.vtt'), 'WEBVTT\n');

    const html = `<video src="video.mp4" poster="poster.jpg"><track src="captions.vtt"></video>
      <a href="video.mp4" download>Download</a>`;

    const result = checkLinkIntegrity(html, dir);
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.checked).toContain('video.mp4');
  });

  it('reports every reference that does not resolve', () => {
    const dir = makeTempDir('link-missing');
    writeFileSync(path.join(dir, 'video.mp4'), 'fake');

    const html = `<video src="video.mp4"></video><a href="missing.txt">x</a><img src="ghost.jpg">`;

    const result = checkLinkIntegrity(html, dir);
    expect(result.ok).toBe(false);
    expect([...result.missing].sort()).toEqual(['ghost.jpg', 'missing.txt']);
  });

  it('ignores external URLs, mailto/tel links, data URIs, and bare fragments', () => {
    const dir = makeTempDir('link-external');
    const html = `
      <a href="https://example.com/other">external</a>
      <a href="mailto:someone@example.com">email</a>
      <a href="tel:+15551234567">call</a>
      <a href="#top">fragment</a>
      <img src="data:image/png;base64,AAAA">
    `;
    const result = checkLinkIntegrity(html, dir);
    expect(result.ok).toBe(true);
    expect(result.checked).toEqual([]);
  });

  it('strips a fragment suffix before resolving a bundle-relative link', () => {
    const dir = makeTempDir('link-fragment-suffix');
    writeFileSync(path.join(dir, 'transcript.txt'), 'hello');
    const html = `<a href="transcript.txt#section-2">jump</a>`;
    const result = checkLinkIntegrity(html, dir);
    expect(result.ok).toBe(true);
    expect(result.checked).toEqual(['transcript.txt']);
  });

  it('resolves a nested relative path against the bundle directory', () => {
    const dir = makeTempDir('link-nested');
    mkdirSync(path.join(dir, 'assets'), { recursive: true });
    writeFileSync(path.join(dir, 'assets', 'poster.jpg'), 'fake');
    const html = `<img src="assets/poster.jpg">`;
    const result = checkLinkIntegrity(html, dir);
    expect(result.ok).toBe(true);
  });
});
