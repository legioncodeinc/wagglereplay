import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { type PutObjectResult, R2Client, type R2ClientOptions } from './client.js';
import type { R2Config } from './env.js';

/** Content types for exactly the file kinds a share bundle can contain. */
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.mp4': 'video/mp4',
  '.vtt': 'text/vtt; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** Every regular file directly inside `dir` (bundles are flat; no subdirectories to recurse into). */
function listBundleFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

export interface UploadBundleResult {
  readonly baseUrl: string;
  readonly uploaded: readonly PutObjectResult[];
  readonly indexUrl: string;
}

/**
 * Uploads every file in `bundleDir` to R2 under `<prefix>/<filename>`, then
 * reports the public URL layout AC3 requires: "prints the public URL
 * layout" naming the exact page a viewer opens plus every asset beneath
 * it.
 */
export async function uploadBundle(
  bundleDir: string,
  prefix: string,
  config: R2Config,
  options: R2ClientOptions = {},
): Promise<UploadBundleResult> {
  const client = new R2Client(config, options);
  const files = listBundleFiles(bundleDir);

  const uploaded: PutObjectResult[] = [];
  for (const filename of files) {
    const filePath = path.join(bundleDir, filename);
    const body = readFileSync(filePath);
    statSync(filePath); // fails loudly if a listed entry vanished mid-upload
    const result = await client.putObject({
      key: `${prefix}/${filename}`,
      body,
      contentType: contentTypeFor(filePath),
    });
    uploaded.push(result);
  }

  const indexEntry = uploaded.find((entry) => entry.key.endsWith('/index.html'));
  return {
    baseUrl: `${config.publicBaseUrl}/${prefix}`,
    uploaded,
    indexUrl: indexEntry?.publicUrl ?? `${config.publicBaseUrl}/${prefix}/index.html`,
  };
}
