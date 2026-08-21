<script lang="ts">
  import { invalidate } from '$app/navigation';
  import { untrack } from 'svelte';
  import FilmStrip from '$lib/components/FilmStrip.svelte';
  import HeatmapOverlay from '$lib/components/HeatmapOverlay.svelte';
  import KeyboardHelp from '$lib/components/KeyboardHelp.svelte';
  import SettingsPanel from '$lib/components/SettingsPanel.svelte';
  import StepDetail from '$lib/components/StepDetail.svelte';
  import { setProjectState } from '$lib/state/project-state.svelte.js';
  import type { PageProps } from './$types.js';

  /**
   * Studio's single page. Wires the AC2-AC7 surfaces together:
   *  - `setProjectState(data)` (task 3) seeds the runes state class from
   *    `+page.server.ts`'s load result, then keeps it synced whenever
   *    `data` changes (SvelteKit reruns `load` after `invalidate`).
   *  - An SSE subscription to `/api/watch` (`$lib/server/watcher.ts`) calls
   *    `invalidate('waggle:project')` on every change notice, so an
   *    ingest run finished by the upload endpoints, or an edit from
   *    another Studio tab, shows up here without a manual refresh.
   *  - AC7's keyboard-first review flow: `j`/`k` step navigation, `e` to
   *    jump into the description editor, `h` to toggle the heatmap, `?`
   *    for the help sheet - all disabled while focus is inside a form
   *    control, so typing "j" in the description editor types a letter,
   *    not a navigation command.
   */
  const { data }: PageProps = $props();

  // Only the initial `data` seeds the store's constructor; every later
  // load rerun is picked up by the `$effect` below via `store.sync`, so
  // this read is deliberately a one-time snapshot, not a tracked read.
  const store = setProjectState(untrack(() => data));

  $effect(() => {
    store.sync(data);
  });

  $effect(() => {
    const source = new EventSource('/api/watch');
    source.addEventListener('changed', () => {
      void invalidate('waggle:project');
    });
    return () => source.close();
  });

  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    );
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && store.showHelp) {
      store.toggleHelp();
      return;
    }
    if (isEditableTarget(event.target)) return;

    switch (event.key) {
      case 'j':
        event.preventDefault();
        store.selectNext();
        break;
      case 'k':
        event.preventDefault();
        store.selectPrevious();
        break;
      case 'h':
        event.preventDefault();
        store.toggleHeatmap();
        break;
      case '?':
        event.preventDefault();
        store.toggleHelp();
        break;
      case 'e':
        event.preventDefault();
        if (store.selectedStepIndex !== null) {
          document.getElementById(`description-${String(store.selectedStepIndex)}`)?.focus();
        }
        break;
      default:
        break;
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<svelte:head>
  <title>Waggle Studio - {store.data.projectName}</title>
</svelte:head>

<div class="app-shell">
  <header class="topbar">
    <h1>Waggle Studio</h1>
    <span class="project-name">{store.data.projectName}</span>
    {#if store.data.irVersion !== null}
      <span class="ir-version">IR v{store.data.irVersion}</span>
    {/if}
    <button type="button" class="help-button" onclick={() => store.toggleHelp()}>
      Keyboard shortcuts (?)
    </button>
  </header>

  {#if store.data.flow === null}
    <p class="empty">
      No walkthrough recorded yet. Start a capture from the Waggle extension - Studio is listening
      for its uploads.
    </p>
  {:else}
    <FilmStrip />
    <div class="workspace">
      <StepDetail />
      <aside class="side-panel">
        <HeatmapOverlay />
        <SettingsPanel />
      </aside>
    </div>
  {/if}
</div>

<KeyboardHelp />

<style>
  :global(body) {
    margin: 0;
    background: #101820;
    color: #ffffff;
    font-family:
      system-ui,
      -apple-system,
      'Segoe UI',
      sans-serif;
  }

  .app-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .topbar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #2a3140;
  }

  h1 {
    font-size: 1rem;
    margin: 0;
  }

  .project-name {
    color: #f5b301;
  }

  .ir-version {
    color: #9aa5b1;
    font-size: 0.8rem;
  }

  .help-button {
    margin-left: auto;
    background: transparent;
    color: #9aa5b1;
    border: 1px solid #2a3140;
    border-radius: 6px;
    padding: 0.35rem 0.75rem;
    cursor: pointer;
    font: inherit;
    font-size: 0.75rem;
  }

  .empty {
    padding: 2rem;
    color: #9aa5b1;
  }

  .workspace {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .workspace > :global(section.step-detail) {
    flex: 1;
  }

  .side-panel {
    width: 380px;
    border-left: 1px solid #2a3140;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
  }
</style>
