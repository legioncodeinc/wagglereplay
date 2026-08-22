// SPDX-License-Identifier: AGPL-3.0-or-later
import type { StepClassification } from '@waggle/ir';

/** Short label + color token per step classification (AC2's badge). */
const CLASSIFICATION_META: Record<StepClassification, { label: string; color: string }> = {
  navigate: { label: 'Navigate', color: '#2f6fed' },
  'state-change': { label: 'State change', color: '#c2410c' },
  input: { label: 'Input', color: '#0f9d58' },
  scroll: { label: 'Scroll', color: '#7c3aed' },
};

export function classificationLabel(classification: StepClassification): string {
  return CLASSIFICATION_META[classification].label;
}

export function classificationColor(classification: StepClassification): string {
  return CLASSIFICATION_META[classification].color;
}

export function formatMs(ms: number): string {
  if (Math.abs(ms) < 1000) return `${String(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
