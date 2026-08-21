import type { RouteHeatmap } from '@waggle/ingest';
import type { WalkthroughStep } from '@waggle/ir';
import type { NarrationSegmentDraft } from '@waggle/narrate';
import { getContext, setContext } from 'svelte';
import type { StudioProjectState } from '$lib/types.js';

/**
 * The page's live project state, plus the ephemeral UI state (selection,
 * overlay toggles) that never comes from `load`. A class with `$state`
 * fields, instantiated once per page-tree via Svelte's context API rather
 * than a bare module-level export - `guides/05-universal-reactivity-svelte-ts.md`'s
 * documented pattern for SSR-safe shared reactive state (SvelteKit
 * modules are evaluated once per server process, not once per request;
 * a module-level `$state` singleton would leak between requests).
 *
 * `data` is replaced wholesale (not deep-mutated) every time
 * `+page.server.ts`'s `load` reruns, which is exactly what "IR load into
 * runes state" (PRD-005's task 3) means in practice: the file watcher
 * (`$lib/server/watcher.ts`) triggers `invalidate('waggle:project')`,
 * SvelteKit reruns `load`, and `+page.svelte` assigns the fresh value into
 * this field.
 */
export class ProjectState {
  data = $state<StudioProjectState>() as StudioProjectState;
  selectedStepIndex = $state<number | null>(null);
  showHeatmap = $state(false);
  showHelp = $state(false);

  constructor(initial: StudioProjectState) {
    this.data = initial;
    if (initial.flow !== null && initial.flow.steps.length > 0) {
      this.selectedStepIndex = 0;
    }
  }

  steps = $derived.by((): readonly WalkthroughStep[] => this.data.flow?.steps ?? []);

  selectedStep = $derived.by((): WalkthroughStep | null => {
    if (this.selectedStepIndex === null) return null;
    return this.steps[this.selectedStepIndex] ?? null;
  });

  selectedNarration = $derived.by((): NarrationSegmentDraft | null => {
    if (this.selectedStepIndex === null) return null;
    return (
      this.data.narration?.segments.find(
        (segment) => segment.stepIndex === this.selectedStepIndex,
      ) ?? null
    );
  });

  selectedRouteHeatmap = $derived.by((): RouteHeatmap | null => {
    const step = this.selectedStep;
    if (step === null || this.data.heatmap === null) return null;
    const route = step.waggle.routeAfter ?? step.waggle.routeBefore;
    if (route === undefined) return null;
    return this.data.heatmap.routes.find((entry) => entry.route === route) ?? null;
  });

  /** Replaces the loaded project state (a fresh `load` result) without disturbing UI-only state. */
  sync(next: StudioProjectState): void {
    this.data = next;
    if (this.selectedStepIndex !== null && this.selectedStepIndex >= this.steps.length) {
      this.selectedStepIndex = this.steps.length > 0 ? this.steps.length - 1 : null;
    }
  }

  selectStep(index: number): void {
    if (index < 0 || index >= this.steps.length) return;
    this.selectedStepIndex = index;
  }

  /** AC7: `k`, previous step. Clamps rather than wraps, so repeated presses at the top are inert. */
  selectPrevious(): void {
    if (this.selectedStepIndex === null) {
      this.selectStep(0);
      return;
    }
    this.selectStep(Math.max(0, this.selectedStepIndex - 1));
  }

  /** AC7: `j`, next step. */
  selectNext(): void {
    if (this.selectedStepIndex === null) {
      this.selectStep(0);
      return;
    }
    this.selectStep(Math.min(this.steps.length - 1, this.selectedStepIndex + 1));
  }

  /** AC4: reflects a saved narration segment edit into shared state immediately, without waiting for the file-watcher round trip. */
  applyNarrationSegment(segment: NarrationSegmentDraft): void {
    if (this.data.narration === null) return;
    const segments = this.data.narration.segments.map((existing) =>
      existing.stepIndex === segment.stepIndex ? segment : existing,
    );
    this.data = { ...this.data, narration: { ...this.data.narration, segments } };
  }

  /** AC6: reflects a saved `studio.json` settings update into shared state immediately. */
  applySettings(settings: StudioProjectState['settings']): void {
    this.data = { ...this.data, settings };
  }

  toggleHeatmap(): void {
    this.showHeatmap = !this.showHeatmap;
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }
}

const PROJECT_STATE_KEY = Symbol('waggle-project-state');

export function setProjectState(initial: StudioProjectState): ProjectState {
  const store = new ProjectState(initial);
  setContext(PROJECT_STATE_KEY, store);
  return store;
}

export function getProjectState(): ProjectState {
  const store = getContext<ProjectState | undefined>(PROJECT_STATE_KEY);
  if (store === undefined) {
    throw new Error(
      'getProjectState() called outside a component tree that called setProjectState().',
    );
  }
  return store;
}
