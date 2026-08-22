<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { getProjectState } from '$lib/state/project-state.svelte.js';

  /** AC7: the documented keyboard-shortcut help sheet, toggled by `?` (see `+page.svelte`'s keydown handler). */
  const store = getProjectState();

  /** Closes only on a click that lands on the backdrop itself, not one that bubbled up from the sheet. */
  function onBackdropClick(event: MouseEvent): void {
    if (event.currentTarget === event.target) store.toggleHelp();
  }
</script>

{#if store.showHelp}
  <div class="backdrop" role="presentation" onclick={onBackdropClick}>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" tabindex="-1">
      <h2>Keyboard shortcuts</h2>
      <dl>
        <dt><kbd>j</kbd></dt>
        <dd>Select the next step</dd>
        <dt><kbd>k</kbd></dt>
        <dd>Select the previous step</dd>
        <dt><kbd>e</kbd></dt>
        <dd>Focus the description editor for the selected step</dd>
        <dt><kbd>h</kbd></dt>
        <dd>Toggle the click heatmap overlay</dd>
        <dt><kbd>?</kbd></dt>
        <dd>Toggle this help sheet</dd>
        <dt><kbd>Esc</kbd></dt>
        <dd>Close this help sheet</dd>
      </dl>
      <button type="button" onclick={() => store.toggleHelp()}>Close</button>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }

  .sheet {
    background: #1c222c;
    border-radius: 10px;
    padding: 1.5rem;
    max-width: 360px;
    width: 100%;
  }

  h2 {
    margin: 0 0 1rem;
    font-size: 1rem;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.5rem 1rem;
    margin: 0 0 1.25rem;
  }

  dt {
    display: flex;
  }

  kbd {
    background: #0b0e13;
    border: 1px solid #2a3140;
    border-radius: 4px;
    padding: 0.1rem 0.45rem;
    font-family: inherit;
  }

  dd {
    margin: 0;
    color: #d5dae1;
    font-size: 0.875rem;
  }

  button {
    background: #f5b301;
    color: #101820;
    border: none;
    border-radius: 6px;
    padding: 0.5rem 1rem;
    font-weight: 600;
    cursor: pointer;
  }
</style>
