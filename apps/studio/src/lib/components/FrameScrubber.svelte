<script lang="ts">
  import type { StepAssets } from '@waggle/ir';
  import { assetFileName, frameUrl } from '$lib/frames.js';
  import { formatMs } from '$lib/format.js';
  import type { FrameSample } from '$lib/types.js';

  /**
   * AC3: scrubs across the frames `@waggle/ingest` extracted in the +/-5s
   * window around the step's action (`packages/ingest/src/frames/extraction-plan.ts`).
   * `sampleIndex` is local, user-draggable `$state`; it resets to the
   * frame closest to the action (offset 0) whenever the selected step (and
   * therefore `samples`) changes. This is NOT a `$derived` in disguise:
   * a pure derivation can't also accept the user's own slider drags in
   * between resets, which is exactly the "sync external state, then allow
   * local override" case the runes guide calls out as one of the few
   * legitimate `$effect` uses.
   */
  interface Props {
    irVersion: number;
    stepIndex: number;
    samples: readonly FrameSample[];
    assets?: StepAssets;
  }
  const { irVersion, stepIndex, samples, assets }: Props = $props();

  let sampleIndex = $state(0);

  $effect(() => {
    const zeroIndex = samples.findIndex((sample) => sample.offsetMs === 0);
    sampleIndex = zeroIndex >= 0 ? zeroIndex : 0;
  });

  const currentSample = $derived(samples[sampleIndex] ?? null);
</script>

<div class="scrubber">
  {#if samples.length === 0}
    <p class="empty">No sampled frames for this step yet.</p>
  {:else}
    <div class="frame">
      {#if currentSample !== null}
        <img
          src={frameUrl(irVersion, stepIndex, currentSample.fileName)}
          alt={`Frame at ${formatMs(currentSample.offsetMs)}`}
        />
      {/if}
    </div>
    <input
      type="range"
      min="0"
      max={samples.length - 1}
      bind:value={sampleIndex}
      aria-label="Scrub through extracted frames"
    />
    <div class="scrub-label">
      {currentSample !== null ? formatMs(currentSample.offsetMs) : ''} relative to the action
    </div>
  {/if}

  {#if assets !== undefined}
    <div class="quick-jump">
      {#each [['before', assets.before], ['click', assets.click], ['settled', assets.settled]] as [role, file] (role)}
        {#if file !== undefined}
          <a class="quick-frame" href={frameUrl(irVersion, stepIndex, assetFileName(file))} target="_blank" rel="noreferrer">
            {role}
          </a>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .scrubber {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .empty {
    color: #9aa5b1;
    font-size: 0.875rem;
  }

  .frame {
    width: 100%;
    aspect-ratio: 16 / 10;
    background: #0b0e13;
    border-radius: 6px;
    overflow: hidden;
  }

  .frame img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .scrub-label {
    font-size: 0.75rem;
    color: #9aa5b1;
  }

  .quick-jump {
    display: flex;
    gap: 0.5rem;
    font-size: 0.75rem;
  }

  .quick-frame {
    color: #f5b301;
    text-decoration: none;
  }

  .quick-frame:hover {
    text-decoration: underline;
  }
</style>
