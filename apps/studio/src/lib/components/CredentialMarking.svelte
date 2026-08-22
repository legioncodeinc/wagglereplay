<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import type { CredentialAppliesTo } from '@waggle/ir';
  import { getProjectState } from '$lib/state/project-state.svelte.js';

  interface Props {
    selectors: readonly (string | string[])[];
  }

  const { selectors }: Props = $props();
  const store = getProjectState();
  const boundCredential = $derived(
    store.data.credentialRefs.find(
      (entry) => entry.id === store.data.settings.credentialSetId,
    ) ?? null,
  );
  const markableSelectors = $derived(
    Array.from(new Set(selectors.filter((selector): selector is string => typeof selector === 'string'))),
  );

  type MarkingKind = keyof CredentialAppliesTo;
  type SaveState = 'idle' | 'pending' | 'saved' | 'error';
  let saveState = $state<SaveState>('idle');

  function currentKind(selector: string): MarkingKind | null {
    const appliesTo = boundCredential?.applies_to;
    if (appliesTo === undefined) return null;
    if (appliesTo.username.includes(selector)) return 'username';
    if (appliesTo.secret.includes(selector)) return 'secret';
    if (appliesTo.totp.includes(selector)) return 'totp';
    return null;
  }

  async function mark(selector: string, kind: MarkingKind | null): Promise<void> {
    saveState = 'pending';
    try {
      const response = await fetch('/api/credential-markings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ selector, kind }),
      });
      if (!response.ok) {
        saveState = 'error';
        return;
      }
      const result = (await response.json()) as {
        credentialSetId: string;
        appliesTo: CredentialAppliesTo;
      };
      store.applyCredentialMarkings(result.credentialSetId, result.appliesTo);
      saveState = 'saved';
    } catch {
      saveState = 'error';
    }
  }
</script>

<div class="credential-marking">
  <div class="title-row">
    <h3>Credential field</h3>
    <span class="save-state" data-state={saveState}>
      {saveState === 'pending' ? 'Saving...' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : ''}
    </span>
  </div>

  {#if store.data.settings.credentialSetId === null}
    <p>Bind a credential set in Project settings before marking this input.</p>
  {:else if boundCredential === null}
    <p>The bound credential set is missing from credentials.json.</p>
  {:else if markableSelectors.length === 0}
    <p>This input has no single-string selector that can be marked.</p>
  {:else}
    <p>
      Mark the selector used by the bound set <strong>{boundCredential.label}</strong>. Future
      recordings use this explicit marking before field-name heuristics.
    </p>
    <ul>
      {#each markableSelectors as selector (selector)}
        <li>
          <code>{selector}</code>
          <div class="buttons" aria-label={`Mark ${selector}`}>
            {#each ['username', 'secret', 'totp'] as kind (kind)}
              <button
                type="button"
                class:active={currentKind(selector) === kind}
                onclick={() => void mark(selector, kind as MarkingKind)}
              >
                {kind === 'totp' ? 'TOTP' : kind}
              </button>
            {/each}
            <button
              type="button"
              class:active={currentKind(selector) === null}
              onclick={() => void mark(selector, null)}
            >
              unmarked
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .credential-marking {
    background: #1c222c;
    border-radius: 6px;
    padding: 0.75rem;
  }

  .title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h3 {
    margin: 0;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #9aa5b1;
  }

  p {
    margin: 0.5rem 0;
    color: #9aa5b1;
    font-size: 0.75rem;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  li {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.5rem 0;
    border-top: 1px solid #2a3140;
  }

  code {
    overflow-wrap: anywhere;
    font-size: 0.75rem;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  button {
    border: 1px solid #485267;
    border-radius: 4px;
    background: #101820;
    color: #c8d1dc;
    padding: 0.25rem 0.45rem;
    cursor: pointer;
    text-transform: capitalize;
  }

  button.active {
    border-color: #f5b301;
    color: #f5b301;
  }

  .save-state {
    min-height: 1em;
    color: #9aa5b1;
    font-size: 0.7rem;
  }

  .save-state[data-state='error'] {
    color: #ff7a7a;
  }

  .save-state[data-state='saved'] {
    color: #0f9d58;
  }
</style>
