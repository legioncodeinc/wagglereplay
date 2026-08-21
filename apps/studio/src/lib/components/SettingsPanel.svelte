<script lang="ts">
  import type { StudioSettings } from '$lib/schemas/studio-settings.js';
  import { getProjectState } from '$lib/state/project-state.svelte.js';

  /**
   * AC6: project settings - brand kit picker, voice picker, render preset
   * checklist, and credential set binding. Every field here is a
   * REFERENCE: `credentialSetId` is a `credentials.json` entry id, never a
   * resolved `username_env`/`secret_env` value (ADR-008) - this panel
   * lists the reference names `$lib/server/credentials-store.ts` read,
   * never anything from `process.env`.
   */
  const store = getProjectState();

  type SaveState = 'idle' | 'pending' | 'saved' | 'error';
  let saveState = $state<SaveState>('idle');

  async function patch(partial: Partial<StudioSettings>): Promise<void> {
    saveState = 'pending';
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(partial),
      });
      if (!response.ok) {
        saveState = 'error';
        return;
      }
      const settings = (await response.json()) as StudioSettings;
      store.applySettings(settings);
      saveState = 'saved';
    } catch {
      saveState = 'error';
    }
  }

  function onBrandKitChange(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    void patch({ brandKitId: value === '' ? null : value });
  }

  function onVoiceChange(event: Event): void {
    const value = (event.currentTarget as HTMLInputElement).value.trim();
    void patch({ voiceId: value === '' ? null : value });
  }

  function onPresetToggle(presetId: string, event: Event): void {
    const checked = (event.currentTarget as HTMLInputElement).checked;
    const current = new Set(store.data.settings.presetIds);
    if (checked) {
      current.add(presetId);
    } else {
      current.delete(presetId);
    }
    void patch({ presetIds: Array.from(current) });
  }

  function onCredentialChange(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    void patch({ credentialSetId: value === '' ? null : value });
  }
</script>

<section class="settings-panel" aria-label="Project settings">
  <div class="save-state" data-state={saveState}>
    {#if saveState === 'pending'}
      Saving…
    {:else if saveState === 'saved'}
      Saved
    {:else if saveState === 'error'}
      Save failed
    {/if}
  </div>

  <div class="field">
    <label for="brand-kit-select">Brand kit</label>
    <select id="brand-kit-select" value={store.data.settings.brandKitId ?? ''} onchange={onBrandKitChange}>
      <option value="">Use built-in default</option>
      {#each store.data.brandKits as kit (kit.id)}
        <option value={kit.id}>{kit.name} ({kit.source})</option>
      {/each}
    </select>
  </div>

  <div class="field">
    <label for="voice-input">Voice id</label>
    <input
      id="voice-input"
      type="text"
      placeholder="Uses the brand kit's own voiceId when left blank"
      value={store.data.settings.voiceId ?? ''}
      onchange={onVoiceChange}
    />
  </div>

  <div class="field">
    <span class="field-label">Render presets</span>
    <ul class="preset-checklist">
      {#each store.data.presetChoices as presetId (presetId)}
        <li>
          <label>
            <input
              type="checkbox"
              checked={store.data.settings.presetIds.includes(presetId)}
              onchange={(event) => onPresetToggle(presetId, event)}
            />
            {presetId}
          </label>
        </li>
      {/each}
    </ul>
  </div>

  <div class="field">
    <label for="credential-select">Credential set</label>
    <select id="credential-select" value={store.data.settings.credentialSetId ?? ''} onchange={onCredentialChange}>
      <option value="">Unbound</option>
      {#each store.data.credentialRefs as ref (ref.id)}
        <option value={ref.id}>{ref.label ?? ref.id}</option>
      {/each}
    </select>
    {#if store.data.settings.credentialSetId !== null}
      {@const bound = store.data.credentialRefs.find((ref) => ref.id === store.data.settings.credentialSetId)}
      {#if bound !== undefined}
        <p class="cred-detail">
          username env: <code>{bound.username_env ?? '(unset)'}</code>, secret env:
          <code>{bound.secret_env ?? '(unset)'}</code>
          {#if bound.totp_seed_env !== undefined}
            , TOTP seed env: <code>{bound.totp_seed_env}</code>
          {/if}
          - values are never shown or read here, only the environment variable names.
        </p>
      {/if}
    {/if}
  </div>
</section>

<style>
  .settings-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    max-width: 360px;
  }

  .save-state {
    align-self: flex-end;
    font-size: 0.75rem;
    color: #9aa5b1;
    min-height: 1em;
  }

  .save-state[data-state='error'] {
    color: #ff7a7a;
  }

  .save-state[data-state='saved'] {
    color: #0f9d58;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  label,
  .field-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #9aa5b1;
  }

  select,
  input[type='text'] {
    background: #0b0e13;
    color: inherit;
    border: 1px solid #2a3140;
    border-radius: 6px;
    padding: 0.4rem;
    font: inherit;
  }

  .preset-checklist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
  }

  .cred-detail {
    font-size: 0.7rem;
    color: #9aa5b1;
  }
</style>
