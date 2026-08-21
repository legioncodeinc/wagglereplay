# @waggle/compose

The compositor interface and its default ffmpeg backend (prd-007).
Governed by ADR-003 (ffmpeg is the default; Remotion is an optional
plugin), ADR-007 (the picture-in-picture slot is reserved, not built), and
ADR-011 (non-native presets are reframed from the IR focus track and
labelled honestly).

## Pipeline

```
Walkthrough IR (@waggle/ir) + words.json (@waggle/narrate) + brand kit + preset
  -> buildTimeline()            intro/body/outro clocks, computed once
  -> buildZoomTrack()           AC5: click-driven zoom + ADR-011 focus track
  -> buildCursorTrack()         AC3: spring-smoothed path + ripple windows
  -> buildAssDocument()         AC2: karaoke k-tags, watermark, card titles
  -> buildFilterGraph()         AC4: every layer, deterministic text
  -> buildEncodeArgs()          AC7: bit-exact H.264 argv
  -> renders/<ir>.<kit>.<preset>.mp4 + .render.json
```

`waggle render` (`packages/cli/src/commands/render.ts`) wires this end to
end. Every stage is also exported individually from `src/index.ts`.

## The compositor contract

This is the interface prd-014 (Remotion backend) implements a second time
and prd-017 (avatars) fills the reserved slot of. It lives in
`src/compositor.ts`.

```ts
export interface Compositor {
  /** Stable backend id, e.g. `ffmpeg`. Recorded in render metadata. */
  readonly name: string;
  readonly capabilities: CompositorCapabilities;
  composite(inputs: CompositorInputs): Promise<CompositeResult>;
}
```

```ts
export interface CompositorInputs {
  readonly source: SourceVideo;
  readonly flow: WalkthroughFlow;
  readonly narration: NarrationInput | null;
  readonly brandKit: BrandKit;
  readonly assetBaseDir: string;
  readonly preset: RenderPreset;
  readonly output: OutputTarget;
  /** ADR-007's reserved slot. `null` until prd-017. */
  readonly pictureInPicture: PictureInPictureInput | null;
  readonly dryRun?: boolean;
}
```

Three rules keep this a contract rather than an accident of the ffmpeg
implementation:

1. **Anything a backend can only do because of what it is goes behind a
   capability flag**, never into the input shape. A caller that needs
   karaoke checks `capabilities.karaokeCaptions`; a backend that cannot do
   something says so instead of silently dropping the layer.
2. **`assertCompositorInputs(inputs, capabilities)` is exported** so a
   second backend reuses the same refusals rather than reimplementing
   them. It is what turns "alpha silently drops" into a named error.
3. **The paint order is part of the contract**, not an implementation
   detail, because two backends producing different stacking would not be
   comparable renders.

Bottom to top:

```
base video -> zoom/reframe crop -> intro/outro plates
  -> click ripples -> synthetic cursor
  -> burned text (captions, text watermark, card titles)
  -> logo, image watermark
  -> picture-in-picture (reserved, topmost)
```

## The prd-009 seam

Phase 1 composites over the **original screen recording** the IR points at
via `flow.waggle.sourceRecording.videoRef`. prd-009 replays the IR against
the live app and produces a fresh capture instead.

**The swap is one function**: `resolveSourceVideo()` in
`src/render/render-project.ts`. It currently ends with

```ts
return probeSourceVideo(videoPath, 'original-recording', env);
```

and prd-009 changes it to return `probeSourceVideo(replayPath, 'replay',
env)`. Nothing downstream reads `kind` for anything except the render
metadata, because everything the graph builder, caption generator, cursor
synthesizer, and encoder need is the probed width, height, duration, and
audio presence, all of which `probeSourceVideo` already supplies. The
`SourceVideo` interface in `src/compositor.ts` documents the same seam from
the type side.

## Determinism (AC4) and idempotency (AC7)

"A render is f(IR version, brand kit, preset): idempotent and cacheable"
is a corpus claim, so it is tested rather than asserted.

**Graph text** is a pure function of its inputs. Three rules hold it:

- **No absolute paths inside a filter.** The only path a filter carries is
  the generated `captions.ass` and its `fontsdir`, both bare relative
  names, because the backend runs ffmpeg with the render's work directory
  as the child process's cwd. That also sidesteps the `subtitles` filter's
  Windows drive-letter escaping (`C\:/path`) entirely.
- **No clock, environment, or filesystem read** while building. Input
  order is fixed by declaration order.
- **Every number goes through `num()`** (`src/expr/piecewise.ts`), so no
  `1e-7`, no `0.30000000000000004`, no `-0` reaches the graph.

**Encoded output** adds three flag groups in `src/ffmpeg/encode-args.ts`:
`-fflags/-flags +bitexact` (keeps encoder version strings out of the
bitstream), `-map_metadata -1` (keeps `creation_time` and `encoder` out of
the container), and a **pinned `-threads`** (libx264 is deterministic for a
given thread count, and its default is derived from the host CPU count, so
an unpinned render is reproducible on one machine and not across two).

`hashRenderedStreams()` is the measurement AC7 is made against:
`ffmpeg -i out.mp4 -map 0 -c copy -f streamhash -hash md5 -`, which hashes
the stored bitstream per stream with no re-decode.

## Brand kits

`brand/<id>.json`, validated by `BrandKitSchema` (`src/brand/schema.ts`).
The schema carries a hard constraint: **nothing in a kit may describe what
happened in the walkthrough or what was said**. A kit only describes how
the same walkthrough is painted, which is what makes AC8 true (a second kit
changes only branded pixels and writes nothing under the IR or narration
directories).

A project with no `brand/` renders with the built-in `default` kit
(`src/brand/defaults.ts`), which is a real opinionated kit so a first
`waggle render` already produces something watchable.

## Notable implementation decisions

**No `zoompan`.** ADR-003 forbids it ("known zoompan jitter is avoided by
using crop+scale expressions on an upscaled canvas"). What replaces it is
`scale=...:eval=frame` emitting variable-size frames into a fixed-size
`crop` whose x/y read the varying `in_w`/`in_h`. Auto-zoom and ADR-011's
smart reframe are the same two filters: reframe is that crop window panning
across a cover image that is larger than the preset on one axis, and zoom
is the same window shrinking. Implementing them separately would have
produced two crop windows fighting over one frame.

**One text renderer.** Captions, the text watermark, and the intro/outro
card titles all go through libass in a single `subtitles` pass rather than
mixing in `drawtext`, because `drawtext` needs an absolute `fontfile=` path
(which would break the determinism claim) and because two text renderers
means two font-fallback behaviours to reason about.

**Intro and outro cards extend the timeline** (`tpad`) rather than covering
the recording's first and last seconds. That is why `src/timeline.ts`
exists: every other layer's times shift by the intro's duration, and body
time is never mixed with timeline time.

**The cursor is an overlay expression, not a pre-rendered track.** An
expression costs one string; a pre-rendered alpha track would cost a second
encode, a temp file, and the corpus's alpha-handling trap. The cost is that
the expression grows with the sample count, which `MAX_CURSOR_SEGMENTS`
bounds by deterministically decimating long walkthroughs.

**Sprites are rasterized in-process** (`src/ffmpeg/png.ts`,
`src/ffmpeg/sprites.ts`). They are brand-kit coloured, so they cannot be
committed as fixtures, and generating them through ffmpeg would mean a
second process launch and drawing an arrow with `geq` expressions.

## Testing

Every media input is synthesized by ffmpeg itself (`testsrc2`, `sine`), so
no binary fixture is committed and the suite is hermetic. Golden files are
text and reviewable in a diff: `test/golden/captions-full.ass`,
`test/golden/karaoke-lines.txt`, `test/golden/filtergraph-full.txt`.
Regenerate them deliberately and read the diff:

```
WAGGLE_UPDATE_GOLDEN=1 pnpm --filter @waggle/compose test
```

`test/render-e2e.test.ts` actually encodes. It is the only assurance that
the graph this package generates is one ffmpeg accepts, which no amount of
golden-file comparison provides: a graph can be perfectly deterministic and
perfectly invalid.

## Requirements

ffmpeg with `libx264`, `libass`, and `libfreetype`, on `PATH` or named by
`WAGGLE_FFMPEG_PATH` / `WAGGLE_FFPROBE_PATH`. Developed and tested against
ffmpeg 9.0.

Note that ffmpeg 9 removed `-filter_complex_script`; this package uses the
current `-/filter_complex <file>` form, which is also what keeps a
multi-kilobyte cursor expression off a command line that Windows caps at
32767 characters.
