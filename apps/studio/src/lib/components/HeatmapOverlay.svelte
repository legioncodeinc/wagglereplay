<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { getProjectState } from '$lib/state/project-state.svelte.js';
  import { bestThumbnail, frameUrl } from '$lib/frames.js';

  /**
   * AC5: the per-route click heatmap overlay, toggled on and off. Points
   * come straight from `heatmap.json` (`@waggle/ingest`'s
   * `aggregateHeatmap`, already normalized 0..1 - see
   * `packages/ingest/src/heatmap/schema.ts`), so this component does no
   * coordinate math of its own: it only positions each point as a
   * percentage inside the frame it is drawn over, which is exactly what a
   * normalized coordinate is for.
   */
  const store = getProjectState();

  const routeHeatmap = $derived(store.selectedRouteHeatmap);
  const step = $derived(store.selectedStep);
  const stepIndex = $derived(store.selectedStepIndex);
  const irVersion = $derived(store.data.irVersion);
  const thumbnail = $derived(
    step !== null && irVersion !== null ? bestThumbnail(step.waggle.assets) : null,
  );
</script>

<section class="heatmap-panel" aria-label="Route heatmap">
  <div class="toggle-row">
    <label>
      <input type="checkbox" checked={store.showHeatmap} onchange={() => store.toggleHeatmap()} />
      Show click heatmap for this route
    </label>
    {#if routeHeatmap !== null}
      <span class="route-label">{routeHeatmap.route} - {routeHeatmap.points.length} clicks</span>
    {/if}
  </div>

  {#if store.showHeatmap}
    {#if routeHeatmap === null}
      <p class="empty">No heatmap data for this step's route yet.</p>
    {:else if thumbnail === null || stepIndex === null || irVersion === null}
      <p class="empty">No frame available to overlay the heatmap on.</p>
    {:else}
      <div class="overlay-frame">
        <img src={frameUrl(irVersion, stepIndex, thumbnail)} alt="Route frame with click heatmap overlay" />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {#each routeHeatmap.points as point, index (index)}
            <circle cx={point.nx * 100} cy={point.ny * 100} r="1.6" />
          {/each}
        </svg>
      </div>
    {/if}
  {/if}
</section>

<style>
  .heatmap-panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.8rem;
  }

  .route-label {
    color: #9aa5b1;
  }

  .empty {
    color: #9aa5b1;
    font-size: 0.8rem;
  }

  .overlay-frame {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 10;
    background: #0b0e13;
    border-radius: 6px;
    overflow: hidden;
  }

  .overlay-frame img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .overlay-frame svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .overlay-frame circle {
    fill: rgba(255, 90, 60, 0.55);
    stroke: rgba(255, 90, 60, 0.9);
    stroke-width: 0.3;
  }
</style>
