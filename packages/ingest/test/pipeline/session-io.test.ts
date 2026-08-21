import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { IngestSessionError } from '../../src/errors.js';
import { loadSession } from '../../src/pipeline/session-io.js';
import { loadSixStepFixture } from '../helpers/load-fixture.js';

describe('AC5: loadSession', () => {
  const cleanup: string[] = [];
  afterEach(() => {
    for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'waggle-session-io-'));
    cleanup.push(dir);
    return dir;
  }

  it('throws IngestSessionError when meta.json is missing', () => {
    const dir = tempDir();
    expect(() => loadSession(dir)).toThrow(IngestSessionError);
    expect(() => loadSession(dir)).toThrow(/meta\.json/);
  });

  it('throws IngestSessionError when events.jsonl contains malformed JSON', () => {
    const dir = tempDir();
    const { meta } = loadSixStepFixture();
    writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta), 'utf8');
    writeFileSync(path.join(dir, 'events.jsonl'), 'not json\n', 'utf8');
    expect(() => loadSession(dir)).toThrow(/not valid JSON/);
  });

  it('throws IngestSessionError when events are not seq-ordered', () => {
    const dir = tempDir();
    const { meta } = loadSixStepFixture();
    writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta), 'utf8');
    const lines = [
      JSON.stringify({ seq: 1, epochMs: 1000, tabId: 1, type: 'pointermove', x: 0, y: 0 }),
      JSON.stringify({ seq: 0, epochMs: 900, tabId: 1, type: 'pointermove', x: 0, y: 0 }),
    ];
    writeFileSync(path.join(dir, 'events.jsonl'), lines.join('\n'), 'utf8');
    expect(() => loadSession(dir)).toThrow(/seq-ordered/);
  });

  it('fails closed when a credential event has no bounded redaction rectangle', () => {
    const dir = tempDir();
    const { meta } = loadSixStepFixture();
    writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta), 'utf8');
    writeFileSync(
      path.join(dir, 'events.jsonl'),
      JSON.stringify({
        seq: 0,
        epochMs: meta.startEpochMs + 10,
        tabId: 1,
        type: 'input',
        inputType: 'insertText',
        selectors: [{ type: 'css', value: '#credential' }],
        value: { placeholder: '[REDACTED]', masked: true },
        credential: true,
      }),
      'utf8',
    );
    expect(() => loadSession(dir)).toThrow(/failed event validation/);
  });

  it('throws IngestSessionError when the video file named in meta.json does not exist', () => {
    const dir = tempDir();
    const { meta } = loadSixStepFixture();
    writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta), 'utf8');
    writeFileSync(path.join(dir, 'events.jsonl'), '', 'utf8');
    expect(() => loadSession(dir)).toThrow(new RegExp(meta.video.filename));
  });

  it('rejects a video filename that escapes the session directory', () => {
    const root = tempDir();
    const dir = path.join(root, 'session');
    mkdirSync(dir);
    const { meta } = loadSixStepFixture();
    writeFileSync(path.join(root, 'outside.mp4'), 'private-video', 'utf8');
    writeFileSync(
      path.join(dir, 'meta.json'),
      JSON.stringify({ ...meta, video: { ...meta.video, filename: '../outside.mp4' } }),
      'utf8',
    );
    writeFileSync(path.join(dir, 'events.jsonl'), '', 'utf8');

    expect(() => loadSession(dir)).toThrow(/inside the session directory/);
  });

  it('loads the real fixture session cleanly once a video file is present', () => {
    // Copies the checked-in fixture's events.jsonl/meta.json into an
    // isolated temp dir rather than writing a video stand-in directly
    // into the shared fixtures/six-step-session directory: that
    // directory is read by several test FILES across two packages
    // (packages/ingest's own suite and packages/cli's record-command
    // tests), which vitest and pnpm -r both run concurrently in separate
    // processes - mutating a shared path there is a real race, not a
    // theoretical one (it was caught failing intermittently under `pnpm
    // -r run test`). A private temp copy has no such neighbor.
    const { dir: fixtureDir, meta } = loadSixStepFixture();
    const dir = tempDir();
    writeFileSync(path.join(dir, 'meta.json'), readFileSync(path.join(fixtureDir, 'meta.json')));
    writeFileSync(
      path.join(dir, 'events.jsonl'),
      readFileSync(path.join(fixtureDir, 'events.jsonl')),
    );
    // The checked-in fixture directory has events.jsonl/meta.json but no
    // binary video (heavy media is not checked in, per ADR-015): a
    // zero-byte stand-in satisfies the existence check for this
    // schema/parsing-only test.
    writeFileSync(path.join(dir, meta.video.filename), '', 'utf8');

    const session = loadSession(dir);
    expect(session.events.length).toBe(meta.eventCount);
    expect(session.meta.sessionId).toBe(meta.sessionId);
  });
});
