import { describe, expect, it, vi } from 'vitest';
import {
  ensureOffscreenDocument,
  type OffscreenHost,
} from '../../src/background/offscreen-bridge.js';

describe('ensureOffscreenDocument', () => {
  it('creates a document when none exists', async () => {
    const host: OffscreenHost = {
      hasDocument: vi.fn().mockResolvedValue(false),
      createDocument: vi.fn().mockResolvedValue(undefined),
      closeDocument: vi.fn().mockResolvedValue(undefined),
    };

    await ensureOffscreenDocument(host);

    expect(host.createDocument).toHaveBeenCalledTimes(1);
  });

  it('does not create a second document when one already exists', async () => {
    const host: OffscreenHost = {
      hasDocument: vi.fn().mockResolvedValue(true),
      createDocument: vi.fn().mockResolvedValue(undefined),
      closeDocument: vi.fn().mockResolvedValue(undefined),
    };

    await ensureOffscreenDocument(host);

    expect(host.createDocument).not.toHaveBeenCalled();
  });
});
