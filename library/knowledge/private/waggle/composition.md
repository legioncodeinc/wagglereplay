# Composition

Feeds prd-007, prd-014, prd-017. Governed by ADR-003 (ffmpeg default) and ADR-007 (PiP slot reserved).

## ffmpeg default backend

- Captions: subtitles filter with libass; word-level karaoke via ASS k/kf tags (centisecond durations) generated from words.json; fontsdir ships brand fonts (https://ffmpeg.org/ffmpeg-filters.html , https://aegisub.org/docs/latest/ass_tags/).
- Overlays: overlay filter chains with t-based enable windows and expressions: watermark, logo, click ripples (pre-rendered transparent sprite, one chain entry per click), intro/outro cards.
- Zoom and reframe: avoid zoompan (documented jitter at slow rates: https://ffmpeg.org/pipermail/ffmpeg-devel/2020-February/256883.md is the discussion thread reference; use the crop+scale expression approach on an upscaled canvas instead). The smart-reframe crop window (ADR-011) eases between IR focus points.
- Synthetic cursor: rendered as a positioned overlay driven by the spring-smoothed cursor trail, style and speed from brand config.
- Alpha inputs (future PiP): MP4 has no alpha; VP9 WebM does; force -c:v libvpx-vp9 on input or alpha silently drops; overlay alpha=straight vs premultiplied mismatches fringe.

## Brand kits

brand/ config files: palette, logo, watermark position/opacity, caption style (font, size, karaoke colors), cursor style, intro/outro, voice id. A render is f(IR version, brand kit, preset): idempotent and cacheable. Re-render with a different kit touches only the compositor.

## Remotion plugin (prd-014, optional)

For users accepting Remotion terms: React compositions, createTikTokStyleCaptions per-word tokens, inputProps as brand kits, calculateMetadata per preset (https://www.remotion.dev/docs/captions/create-tiktok-style-captions , https://www.remotion.dev/docs/parameterized-rendering). License cliff: free up to 3 people including contractors, then $100/mo minimum plus $0.01/render (https://www.remotion.dev/docs/license/faq). Codec patents (H.264) are outside both licenses (https://ffmpeg.org/legal.html).

## Avatar layer (prd-017, deferred)

When phase 4 arrives: HeyGen audio-driven with alpha WebM output (matting-trained avatars only, Avatar III $1/min: https://developers.heygen.com/transparent-background-videos , https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained) or Tavus (transparent_background fast mode, watermark_image_url: https://docs.tavus.io/api-reference/video-request/create-video). Cache per script+voice+avatar combo; composite into the reserved PiP slot.
