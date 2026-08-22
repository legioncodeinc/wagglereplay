// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The replay preset matrix (prd-009 AC4).
 *
 * A REPLAY preset is a capture context, not just output geometry: it
 * carries the DPR and mobile flags the browser context needs, plus the
 * COMPOSE preset its capture targets. This is deliberately a separate
 * registry from @waggle/compose's BUILT_IN_PRESETS: compose presets are
 * output geometry only (that package's own docs say the two axes must
 * stay disjoint), while replay presets answer "at what viewport, DPR,
 * and device class do we re-execute the IR".
 *
 * ADR-011 governs the two-step presets: when the app does not reflow at
 * a preset's viewport, the reflow probe (./reflow-probe.ts) marks the
 * preset reframed and the capture runs at the 16:9 master viewport
 * instead, letting the compositor's focus-following crop produce the
 * honest, labelled reframed output.
 */

export interface ReplayPreset {
  readonly id: string;
  /** Replay viewport, CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** Device pixel ratio of the emulated device. */
  readonly deviceScaleFactor: number;
  /** Mobile emulation: touch + mobile viewport meta behavior. */
  readonly isMobile: boolean;
  readonly hasTouch: boolean;
  /** The @waggle/compose preset this capture composites into. */
  readonly composePresetId: string;
  readonly description: string;
}

export const REPLAY_PRESETS: Readonly<Record<string, ReplayPreset>> = Object.freeze({
  '16x9': {
    id: '16x9',
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    composePresetId: '16x9',
    description: 'Landscape master viewport',
  },
  '9x16': {
    id: '9x16',
    width: 1080,
    height: 1920,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    composePresetId: '9x16',
    description: 'Portrait social viewport',
  },
  '1x1': {
    id: '1x1',
    width: 1080,
    height: 1080,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    composePresetId: '1x1',
    description: 'Square social viewport',
  },
  desktop: {
    id: 'desktop',
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
    composePresetId: '16x9',
    description: 'Retina laptop emulation (1440x900 at DPR 2)',
  },
  mobile: {
    id: 'mobile',
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    composePresetId: '9x16',
    description: 'Phone emulation (390x844 at DPR 3, touch)',
  },
});

export const DEFAULT_REPLAY_PRESET_ID = '16x9';

export class ReplayPresetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplayPresetError';
  }
}

export function resolveReplayPreset(id: string): ReplayPreset {
  const preset = REPLAY_PRESETS[id];
  if (preset === undefined) {
    throw new ReplayPresetError(
      `Unknown replay preset "${id}". Known replay presets: ${Object.keys(REPLAY_PRESETS)
        .sort()
        .join(', ')}.`,
    );
  }
  return preset;
}

/** The preset the capture falls back to when the reflow probe says reframed (ADR-011). */
export function masterPreset(): ReplayPreset {
  return REPLAY_PRESETS['16x9'] as ReplayPreset;
}
