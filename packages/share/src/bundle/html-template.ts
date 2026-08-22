// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The share page itself (prd-008 AC2): one self-contained HTML file with
 * inline CSS and a small inline script, no external stylesheet, font,
 * script, or network call of any kind. Every asset it references (the
 * MP4s, the poster, the captions track, the transcript) is a sibling file
 * in the same bundle directory, linked by a bare relative path, which is
 * what makes the bundle work from a `file://` URL, any static host, or a
 * GitHub Pages branch with zero configuration (ADR-009).
 */

export interface ShareRenderVariant {
  readonly filename: string;
  readonly presetId: string;
  readonly width: number;
  readonly height: number;
  readonly reframe: 'native' | 'reframed';
  readonly durationMs: number;
  readonly checksumSha256: string;
}

export interface ShareBundleContent {
  readonly walkthroughTitle: string;
  readonly projectName: string;
  readonly irVersion: number;
  readonly brandKitId: string;
  /** The variant embedded in the `<video>` element; also the first entry under Downloads. */
  readonly primary: ShareRenderVariant;
  /** Every other rendered preset for this IR version, offered as additional downloads. */
  readonly alternates: readonly ShareRenderVariant[];
  readonly posterFilename: string | null;
  readonly captionsFilename: string | null;
  readonly transcriptFilename: string | null;
  /** Inline transcript text, shown on the page itself (not only as a download) for readers and screen readers who skip video entirely. */
  readonly transcriptText: string | null;
}

/** Escapes text for safe interpolation into HTML content (not attributes with quotes disabled). */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Escapes text for safe interpolation into a double-quoted HTML attribute value. */
function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function shortChecksum(checksum: string): string {
  return checksum.slice(0, 12);
}

function renderVariantDownloadItem(variant: ShareRenderVariant, isPrimary: boolean): string {
  const label = `${escapeHtml(variant.presetId)}: ${variant.width}×${variant.height}, ${escapeHtml(variant.reframe)}${isPrimary ? ' (shown above)' : ''}`;
  return `        <li><a href="${escapeAttr(variant.filename)}" download>${label}</a></li>`;
}

export function buildShareHtml(content: ShareBundleContent): string {
  const {
    walkthroughTitle,
    projectName,
    irVersion,
    brandKitId,
    primary,
    alternates,
    posterFilename,
    captionsFilename,
    transcriptFilename,
    transcriptText,
  } = content;

  const pageTitle = `${escapeHtml(walkthroughTitle)}: ${escapeHtml(projectName)}`;
  const posterAttr = posterFilename === null ? '' : ` poster="${escapeAttr(posterFilename)}"`;
  const trackTag =
    captionsFilename === null
      ? ''
      : `\n        <track kind="captions" src="${escapeAttr(captionsFilename)}" srclang="en" label="English" default>`;

  const downloadItems = [
    renderVariantDownloadItem(primary, true),
    ...alternates.map((variant) => renderVariantDownloadItem(variant, false)),
  ];
  if (captionsFilename !== null) {
    downloadItems.push(
      `        <li><a href="${escapeAttr(captionsFilename)}" download>Captions (WebVTT)</a></li>`,
    );
  }
  if (transcriptFilename !== null) {
    downloadItems.push(
      `        <li><a href="${escapeAttr(transcriptFilename)}" download>Transcript (plain text)</a></li>`,
    );
  }

  const transcriptSection =
    transcriptText === null
      ? ''
      : `
      <section aria-labelledby="transcript-heading">
        <h2 id="transcript-heading">Transcript</h2>
        <p class="transcript">${escapeHtml(transcriptText).replaceAll('\n', '<br>')}</p>
      </section>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${pageTitle}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f7f8;
      --surface: #ffffff;
      --text: #16181d;
      --muted: #55595f;
      --border: #d9dce1;
      --accent: #1a56db;
      --focus: #1a56db;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 2rem 1rem 4rem;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
    }
    main {
      max-width: 860px;
      margin: 0 auto;
    }
    h1 {
      font-size: 1.75rem;
      margin: 0 0 0.25rem;
    }
    .meta {
      color: var(--muted);
      font-size: 0.9rem;
      margin: 0 0 1.5rem;
    }
    video {
      width: 100%;
      max-height: 70vh;
      display: block;
      background: #000;
      border-radius: 8px;
      border: 1px solid var(--border);
    }
    section {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem 1.5rem;
      margin-top: 1.5rem;
    }
    h2 {
      font-size: 1.1rem;
      margin: 0 0 0.75rem;
    }
    ul {
      margin: 0;
      padding-left: 1.25rem;
    }
    li {
      margin: 0.35rem 0;
    }
    a {
      color: var(--accent);
    }
    a:focus-visible,
    video:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 2px;
    }
    .transcript {
      white-space: normal;
      color: var(--text);
    }
    footer {
      margin-top: 2rem;
      color: var(--muted);
      font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(walkthroughTitle)}</h1>
    <p class="meta">${escapeHtml(projectName)} &middot; IR v${irVersion} &middot; brand kit "${escapeHtml(brandKitId)}" &middot; ${formatDuration(primary.durationMs)}</p>

    <video controls preload="metadata"${posterAttr} aria-label="Recording: ${escapeAttr(walkthroughTitle)}">
      <source src="${escapeAttr(primary.filename)}" type="video/mp4">${trackTag}
      Your browser does not support the video tag. Use the download link below instead.
    </video>

    <section aria-labelledby="downloads-heading">
      <h2 id="downloads-heading">Downloads</h2>
      <ul>
${downloadItems.join('\n')}
      </ul>
    </section>
${transcriptSection}
    <footer>
      Rendered from Walkthrough IR v${irVersion}, preset ${escapeHtml(primary.presetId)} (${escapeHtml(primary.reframe)}), sha256 ${shortChecksum(primary.checksumSha256)}&hellip;. Generated by <code>waggle export</code>.
    </footer>
  </main>
</body>
</html>
`;
}
