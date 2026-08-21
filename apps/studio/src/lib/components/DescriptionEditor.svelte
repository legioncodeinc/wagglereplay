<script lang="ts">
  import type { NarrationSegmentDraft } from '@waggle/narrate';
  import { untrack } from 'svelte';
  import { getProjectState } from '$lib/state/project-state.svelte.js';

  /**
   * AC4: the description editor. Shows `narration/script.json`'s
   * `approvedText` when a human has already edited this step, otherwise
   * the machine `draftText` with a "machine-drafted" badge. Saving is
   * autosaved with a debounce: every keystroke resets a timer, and the PUT
   * only fires once typing pauses, rather than on every character.
   */
  interface Props {
    stepIndex: number;
  }
  const { stepIndex }: Props = $props();

  const store = getProjectState();

  const segment = $derived<NarrationSegmentDraft | null>(
    store.data.narration?.segments.find((candidate) => candidate.stepIndex === stepIndex) ?? null,
  );
  const isMachineDrafted = $derived(segment !== null && !segment.approved);
  const sourceText = $derived(segment?.approvedText ?? segment?.draftText ?? '');

  type SaveState = 'idle' | 'pending' | 'saved' | 'error';

  let draft = $state('');
  let saveState = $state<SaveState>('idle');
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const AUTOSAVE_DEBOUNCE_MS = 600;

  // Resets the editable draft when a DIFFERENT step is selected. Tracks
  // only `stepIndex` (read outside `untrack`) rather than `sourceText`
  // deliberately: `sourceText` also changes the instant `save()` below
  // echoes our own successful write back through `store.data.narration`,
  // and re-syncing `draft`/`saveState` at that moment would stomp the
  // "Saved" indicator `save()` just set back to "idle" before the browser
  // ever paints it. This can't be a `$derived` either way, because the
  // textarea also needs to accept the user's own in-progress keystrokes
  // between resets.
  $effect(() => {
    stepIndex;
    untrack(() => {
      draft = sourceText;
      saveState = 'idle';
    });
  });

  $effect(() => {
    return () => {
      if (saveTimer !== undefined) clearTimeout(saveTimer);
    };
  });

  function onInput(): void {
    saveState = 'pending';
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void save();
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  async function save(): Promise<void> {
    try {
      const response = await fetch(`/api/steps/${String(stepIndex)}/description`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: draft }),
      });
      if (!response.ok) {
        saveState = 'error';
        return;
      }
      const body = (await response.json()) as { segment: NarrationSegmentDraft };
      store.applyNarrationSegment(body.segment);
      saveState = 'saved';
    } catch {
      saveState = 'error';
    }
  }
</script>

<div class="description-editor">
  <div class="header">
    <label for={`description-${String(stepIndex)}`}>Description</label>
    {#if isMachineDrafted}
      <span class="badge">machine-drafted</span>
    {/if}
    <span class="save-state" data-state={saveState}>
      {#if saveState === 'pending'}
        Saving…
      {:else if saveState === 'saved'}
        Saved
      {:else if saveState === 'error'}
        Save failed
      {/if}
    </span>
  </div>
  <textarea
    id={`description-${String(stepIndex)}`}
    bind:value={draft}
    oninput={onInput}
    rows="3"
    placeholder="Describe this step for the narration script..."
  ></textarea>
</div>

<style>
  .description-editor {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
  }

  label {
    font-weight: 600;
    color: #9aa5b1;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-size: 0.75rem;
  }

  .badge {
    background: rgba(245, 179, 1, 0.2);
    color: #f5b301;
    border-radius: 999px;
    padding: 0.05rem 0.5rem;
    font-size: 0.7rem;
    font-weight: 600;
  }

  .save-state {
    margin-left: auto;
    color: #9aa5b1;
    font-size: 0.7rem;
  }

  .save-state[data-state='error'] {
    color: #ff7a7a;
  }

  .save-state[data-state='saved'] {
    color: #0f9d58;
  }

  textarea {
    width: 100%;
    background: #0b0e13;
    color: inherit;
    border: 1px solid #2a3140;
    border-radius: 6px;
    padding: 0.5rem;
    font: inherit;
    resize: vertical;
  }
</style>
