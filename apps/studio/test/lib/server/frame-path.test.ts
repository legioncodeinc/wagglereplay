import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { InvalidFramePathError, resolveFramePath } from '../../../src/lib/server/frame-path.js';

describe('resolveFramePath', () => {
  const projectDir = path.join('C:', 'projects', 'demo');

  it('resolves a well-formed frame path', () => {
    const resolved = resolveFramePath(projectDir, '1', 'step-000', 'settled.png');
    expect(resolved).toBe(path.join(projectDir, 'steps', 'v1', 'step-000', 'settled.png'));
  });

  it('resolves a sample frame path', () => {
    const resolved = resolveFramePath(projectDir, '2', 'step-011', 'frame_t-5000.png');
    expect(resolved).toBe(path.join(projectDir, 'steps', 'v2', 'step-011', 'frame_t-5000.png'));
  });

  it('rejects a non-numeric version', () => {
    expect(() => resolveFramePath(projectDir, 'v1', 'step-000', 'settled.png')).toThrow(
      InvalidFramePathError,
    );
  });

  it('rejects a path-traversal step directory', () => {
    expect(() => resolveFramePath(projectDir, '1', '../../etc', 'settled.png')).toThrow(
      InvalidFramePathError,
    );
  });

  it('rejects a path-traversal file name', () => {
    expect(() => resolveFramePath(projectDir, '1', 'step-000', '../../../etc/passwd')).toThrow(
      InvalidFramePathError,
    );
  });

  it('rejects a file name outside the known frame naming convention', () => {
    expect(() => resolveFramePath(projectDir, '1', 'step-000', 'evil.exe')).toThrow(
      InvalidFramePathError,
    );
  });
});
