/**
 * The determinism kit's injected assets (prd-009 AC2).
 *
 * Kept as data, separate from the context factory, so tests can assert
 * exactly what gets injected without booting a browser.
 */

/**
 * Kills CSS animations, transitions, and caret blinking at the style
 * level. The corpus (replay-and-render.md) notes Playwright's
 * `animations: 'disabled'` option applies to SCREENSHOTS only, so a
 * capture that runs to completion needs the CSS injection; the toggle in
 * the context factory exists because an author may want to record the
 * app's real animation behavior (a walkthrough ABOUT an animation), in
 * which case the injection is off and determinism rests on the other kit
 * members.
 */
export const ANIMATION_KILL_CSS =
  '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';

/** The id the injected style element carries, so re-injection is a no-op. */
export const ANIMATION_KILL_STYLE_ID = '__waggle-animation-kill';

export interface DeterminismInitPayload {
  readonly killAnimations: boolean;
  readonly networkExclusions: readonly string[];
  readonly animationCss: string;
  readonly animationStyleId: string;
}

/**
 * Builds the serializable data passed to Playwright's init function.
 * Keeping dynamic values in the argument channel avoids constructing
 * executable JavaScript from configuration data.
 */
export function buildDeterminismInitPayload(options: {
  readonly killAnimations: boolean;
  readonly networkExclusions: readonly string[];
}): DeterminismInitPayload {
  return {
    killAnimations: options.killAnimations,
    networkExclusions: [...options.networkExclusions],
    animationCss: ANIMATION_KILL_CSS,
    animationStyleId: ANIMATION_KILL_STYLE_ID,
  };
}

/**
 * Runs in the page before application code. Playwright serializes this
 * function separately from `payload`, so configuration remains data rather
 * than being interpolated into source code.
 */
export function installDeterminismAssets(payload: DeterminismInitPayload): void {
  const runtime = window as unknown as { __waggleSettleExclusions?: readonly string[] };
  runtime.__waggleSettleExclusions = [...payload.networkExclusions];

  if (!payload.killAnimations || document.getElementById(payload.animationStyleId)) {
    return;
  }

  const style = document.createElement('style');
  style.id = payload.animationStyleId;
  style.textContent = payload.animationCss;
  (document.head ?? document.documentElement).appendChild(style);
}
