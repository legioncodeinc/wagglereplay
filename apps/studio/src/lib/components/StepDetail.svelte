<script lang="ts">
  import { getProjectState } from '$lib/state/project-state.svelte.js';
  import FrameScrubber from './FrameScrubber.svelte';
  import DescriptionEditor from './DescriptionEditor.svelte';

  /**
   * AC3: step detail panel for the currently selected step - the frame
   * scrubber, the acted-on element's identity card (selectors, role, name,
   * rect), and the DOM delta summary for `state-change` steps.
   */
  const store = getProjectState();

  const step = $derived(store.selectedStep);
  const stepIndex = $derived(store.selectedStepIndex);
  const irVersion = $derived(store.data.irVersion);
  const samples = $derived(
    stepIndex !== null ? (store.data.frameSamples[stepIndex] ?? []) : [],
  );

  /** `selectors` only exists on step types built on Puppeteer Replay's `StepWithSelectors` (click, change, hover, ...); `navigate`/`setViewport`/etc. do not carry it. */
  const selectors = $derived(
    step !== null && 'selectors' in step ? step.selectors : null,
  );

  function formatSelector(value: string | string[]): string {
    return Array.isArray(value) ? value.join(' >> ') : value;
  }
</script>

<section class="step-detail" aria-label="Step detail">
  {#if step === null || stepIndex === null || irVersion === null}
    <p class="empty">Select a step from the film strip to see its detail.</p>
  {:else}
    <header>
      <h2>Step {stepIndex + 1}: {step.type}</h2>
    </header>

    <FrameScrubber {irVersion} {stepIndex} {samples} assets={step.waggle.assets} />

    <DescriptionEditor {stepIndex} />

    {#if step.waggle.element !== undefined}
      <div class="card">
        <h3>Element</h3>
        <dl>
          <dt>Role</dt>
          <dd>{step.waggle.element.role}</dd>
          <dt>Name</dt>
          <dd>{step.waggle.element.name || '(none)'}</dd>
          {#if step.waggle.element.text !== undefined}
            <dt>Text</dt>
            <dd>{step.waggle.element.text}</dd>
          {/if}
          <dt>Rect</dt>
          <dd>
            x={Math.round(step.waggle.element.rect.x)}, y={Math.round(step.waggle.element.rect.y)},
            w={Math.round(step.waggle.element.rect.w)}, h={Math.round(step.waggle.element.rect.h)}
          </dd>
        </dl>
      </div>
    {/if}

    {#if selectors !== null}
      <div class="card">
        <h3>Selectors</h3>
        <ol>
          {#each selectors as alternative, altIndex (altIndex)}
            <li><code>{formatSelector(alternative)}</code></li>
          {/each}
        </ol>
      </div>
    {/if}

    {#if step.waggle.classification === 'state-change' && step.waggle.domDelta !== undefined}
      <div class="card">
        <h3>DOM delta</h3>
        <p>{step.waggle.domDelta.summary}</p>
        {#if step.waggle.domDelta.ariaChanges.length > 0}
          <ul>
            {#each step.waggle.domDelta.ariaChanges as change, changeIndex (changeIndex)}
              <li>{change.change}: {change.role} {change.name ? `"${change.name}"` : ''}</li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  {/if}
</section>

<style>
  .step-detail {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
  }

  .empty {
    color: #9aa5b1;
    font-size: 0.875rem;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
  }

  .card {
    background: #1c222c;
    border-radius: 6px;
    padding: 0.75rem;
  }

  .card h3 {
    margin: 0 0 0.5rem;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #9aa5b1;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.25rem 0.75rem;
    margin: 0;
    font-size: 0.85rem;
  }

  dt {
    color: #9aa5b1;
  }

  dd {
    margin: 0;
  }

  ol,
  ul {
    margin: 0;
    padding-left: 1.25rem;
    font-size: 0.8rem;
  }
</style>
