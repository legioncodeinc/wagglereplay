import { toNormalized, type ViewportSize } from '@waggle/ir';
import type { StepTiming } from '../segment/types.js';
import { HEATMAP_SCHEMA_VERSION, type HeatmapDocument, HeatmapDocumentSchema } from './schema.js';

/**
 * AC3: normalizes every step's click point (`@waggle/ir`'s `toNormalized`,
 * the same projection the compositor uses for cursor re-rendering, so a
 * heatmap point and a rendered cursor position agree by construction) and
 * groups them per route.
 *
 * Deterministic and pure: routes are sorted lexicographically and each
 * route's points keep step order, so two runs over the same
 * `stepTimings` produce byte-identical JSON once serialized (AC5).
 */
export function aggregateHeatmap(
  stepTimings: readonly StepTiming[],
  recordedViewport: ViewportSize,
  irVersion: number,
): HeatmapDocument {
  const byRoute = new Map<string, { nx: number; ny: number; stepIndex: number }[]>();

  for (const timing of stepTimings) {
    if (timing.clickPoint === null) continue;
    const normalized = toNormalized(timing.clickPoint, recordedViewport);
    const existing = byRoute.get(timing.route);
    const point = { ...normalized, stepIndex: timing.stepIndex };
    if (existing) {
      existing.push(point);
    } else {
      byRoute.set(timing.route, [point]);
    }
  }

  const routes = [...byRoute.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([route, points]) => ({ route, points }));

  const document: HeatmapDocument = {
    schemaVersion: HEATMAP_SCHEMA_VERSION,
    irVersion,
    routes,
  };

  return HeatmapDocumentSchema.parse(document);
}
