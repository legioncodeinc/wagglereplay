<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { toNormalized, viewportSize } from '@waggle/ir';
  import { getProjectState } from '$lib/state/project-state.svelte.js';
  import { bestThumbnail, frameUrl } from '$lib/frames.js';
  import { classificationColor, classificationLabel } from '$lib/format.js';

  /**
   * AC2: the film strip. One card per Walkthrough IR step: the settled
   * frame (falling back to the click, then before frame), a ripple marker
   * over the acted-on element (projected from `waggle.element.rect` via
   * `@waggle/ir`'s coordinate projection so it lines up on the full-frame
   * screenshot regardless of the recorded viewport size), a classification
   * badge, and a route-delta line when the step changed the URL.
   */
  const store = getProjectState();

  const viewport = $derived(store.data.flow?.waggle.recordedViewport ?? null);
  const irVersion = $derived(store.data.irVersion);
</script>

<ul class="film-strip" aria-label="Walkthrough steps">
  {#if store.steps.length === 0}
    <p class="empty">No steps recorded yet. Start a capture from the extension to see the film strip fill in here.</p>
  {/if}
  {#each store.steps as step, index (index)}
    {@const thumbnail = irVersion !== null ? bestThumbnail(step.waggle.assets) : null}
    {@const marker =
      viewport !== null && step.waggle.element !== undefined
        ? toNormalized(
            {
              x: step.waggle.element.rect.x + step.waggle.element.rect.w / 2,
              y: step.waggle.element.rect.y + step.waggle.element.rect.h / 2,
            },
            viewportSize(viewport),
          )
        : null}
    <li>
      <button
        type="button"
        class="step-card"
        class:selected={store.selectedStepIndex === index}
        onclick={() => store.selectStep(index)}
      >
        <div class="thumb">
          {#if thumbnail !== null && irVersion !== null}
            <img src={frameUrl(irVersion, index, thumbnail)} alt={`Step ${index + 1} frame`} loading="lazy" />
          {:else}
            <div class="thumb-placeholder">No frame</div>
          {/if}
          {#if marker !== null}
            <span class="ripple-marker" style={`left: ${marker.nx * 100}%; top: ${marker.ny * 100}%;`}></span>
          {/if}
        </div>
        <div class="meta">
          <span class="badge" style={`--badge-color: ${classificationColor(step.waggle.classification)}`}>
            {classificationLabel(step.waggle.classification)}
          </span>
          <span class="index">#{index + 1}</span>
        </div>
        {#if step.waggle.routeBefore !== undefined && step.waggle.routeAfter !== undefined && step.waggle.routeBefore !== step.waggle.routeAfter}
          <div class="route-delta" title={`${step.waggle.routeBefore} -> ${step.waggle.routeAfter}`}>
            {step.waggle.routeBefore} &rarr; {step.waggle.routeAfter}
          </div>
        {/if}
      </button>
    </li>
  {/each}
</ul>

<style>
  .film-strip {
    display: flex;
    gap: 0.75rem;
    overflow-x: auto;
    padding: 0.75rem;
    background: #14181f;
    list-style: none;
    margin: 0;
  }

  .empty {
    color: #9aa5b1;
    font-size: 0.875rem;
  }

  .film-strip > li {
    flex: 0 0 auto;
  }

  .step-card {
    width: 160px;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    background: #1c222c;
    border: 2px solid transparent;
    border-radius: 8px;
    padding: 0.4rem;
    cursor: pointer;
    color: inherit;
    font: inherit;
    text-align: left;
  }

  .step-card.selected {
    border-color: #f5b301;
  }

  .thumb {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 10;
    background: #0b0e13;
    border-radius: 4px;
    overflow: hidden;
  }

  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .thumb-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #556070;
    font-size: 0.75rem;
  }

  .ripple-marker {
    position: absolute;
    width: 12px;
    height: 12px;
    margin-left: -6px;
    margin-top: -6px;
    border-radius: 50%;
    background: rgba(245, 179, 1, 0.85);
    box-shadow: 0 0 0 3px rgba(245, 179, 1, 0.3);
    pointer-events: none;
  }

  .meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.75rem;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--badge-color) 25%, transparent);
    color: var(--badge-color);
    font-weight: 600;
  }

  .index {
    color: #9aa5b1;
  }

  .route-delta {
    font-size: 0.7rem;
    color: #9aa5b1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
