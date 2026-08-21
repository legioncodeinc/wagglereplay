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

/** The init-script snippet that installs the animation-kill stylesheet. */
export const ANIMATION_KILL_INIT_SCRIPT = `(function(){var existing=document.getElementById('${ANIMATION_KILL_STYLE_ID}');if(existing)return;var style=document.createElement('style');style.id='${ANIMATION_KILL_STYLE_ID}';style.textContent=${JSON.stringify(ANIMATION_KILL_CSS)};(document.head||document.documentElement).appendChild(style);})();`;

/**
 * Builds the init script a deterministic context installs on every new
 * document, before the quiescence probe (owned by ../steps/settle.ts and
 * appended by the context factory). Pure string assembly: same inputs,
 * same bytes.
 */
export function buildDeterminismInitScript(options: {
  readonly killAnimations: boolean;
  readonly networkExclusions: readonly string[];
}): string {
  const exclusions = JSON.stringify(options.networkExclusions);
  const parts = [
    `window.__waggleSettleExclusions = ${exclusions};`,
    ...(options.killAnimations ? [ANIMATION_KILL_INIT_SCRIPT] : []),
  ];
  return parts.join('\n');
}
