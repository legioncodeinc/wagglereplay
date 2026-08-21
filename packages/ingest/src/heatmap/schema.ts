import { z } from 'zod';

/**
 * AC3: heatmap data stored alongside the IR (`heatmap.json` at the
 * project root, sibling to `waggle.json`), for the Studio overlay
 * (prd-005) to render directly without recomputing anything from raw
 * events. Not part of the Walkthrough IR itself (packages/ir owns that
 * schema and this package does not modify it) - a new, additively-named
 * project file, the same pattern ADR-015 already uses for `narration/`
 * and `baselines/`. Flagged in this PRD's report for cross-PRD gate
 * review since it is a new top-level project file not enumerated in
 * ADR-015's original list.
 */

export const HEATMAP_SCHEMA_VERSION = 1;

export const HeatmapPointSchema = z.strictObject({
  nx: z.number().min(0).max(1),
  ny: z.number().min(0).max(1),
  stepIndex: z.number().int().nonnegative(),
});

export type HeatmapPoint = z.infer<typeof HeatmapPointSchema>;

export const RouteHeatmapSchema = z.strictObject({
  route: z.string().min(1),
  points: z.array(HeatmapPointSchema),
});

export type RouteHeatmap = z.infer<typeof RouteHeatmapSchema>;

export const HeatmapDocumentSchema = z.strictObject({
  schemaVersion: z.literal(HEATMAP_SCHEMA_VERSION),
  /** The IR version this heatmap was computed from; a stale-cache guard for the Studio overlay. */
  irVersion: z.number().int().positive(),
  routes: z.array(RouteHeatmapSchema),
});

export type HeatmapDocument = z.infer<typeof HeatmapDocumentSchema>;
