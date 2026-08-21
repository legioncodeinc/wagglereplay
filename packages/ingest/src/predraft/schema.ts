import { z } from 'zod';

/**
 * AC4: the structured reply every provider is asked to produce, and the
 * shape parsed out of its response text. Shared across adapters so the
 * retry-on-bad-JSON logic (see ./run-model-reply.ts) is one function, not
 * one per provider.
 */
export const ModelReplySchema = z.strictObject({
  description: z.string().min(1, 'description must not be empty'),
  confidence: z.enum(['low', 'medium', 'high']),
});

export type ModelReply = z.infer<typeof ModelReplySchema>;

export const PREDRAFT_SCHEMA_VERSION = 1;

/**
 * AC4: one step's pre-draft entry, persisted to `predraft.json`. Not part
 * of the Walkthrough IR itself: `packages/ir`'s `WaggleStepExtensionSchema`
 * has no `description`/`machineDrafted` field, and this package does not
 * modify that locked schema (see packages/ir/src/schema/waggle-extensions.ts).
 * `predraft.json` is a new, additively-named sibling file at the project
 * root, the same pattern `heatmap.json` (../heatmap/schema.ts) uses.
 * Flagged in this PRD's report for cross-PRD gate review: prd-005
 * (Studio) will need to read this file when it builds the author-editing
 * UI for these descriptions.
 */
export const PreDraftEntrySchema = z.strictObject({
  stepIndex: z.number().int().nonnegative(),
  description: z.string().min(1),
  /**
   * Always `true`: every entry ingest itself ever writes here is a
   * machine draft (PRD-004 AC4, "marked machine-drafted until an author
   * edits"). An author's own edit is prd-005's concern and prd-005's
   * storage, not this file's - this file is regenerated wholesale on
   * every ingest run and is not meant to survive hand-editing.
   */
  machineDrafted: z.literal(true),
  /** `null` for the no-key placeholder path (../placeholder.ts): there is no model confidence to report. */
  confidence: z.enum(['low', 'medium', 'high']).nullable(),
  /** `null` for the no-key placeholder path. */
  provider: z.string().nullable(),
});

export type PreDraftEntry = z.infer<typeof PreDraftEntrySchema>;

export const PreDraftDocumentSchema = z.strictObject({
  schemaVersion: z.literal(PREDRAFT_SCHEMA_VERSION),
  irVersion: z.number().int().positive(),
  steps: z.array(PreDraftEntrySchema),
});

export type PreDraftDocument = z.infer<typeof PreDraftDocumentSchema>;
