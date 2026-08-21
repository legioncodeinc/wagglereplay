import { error, json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { applyHumanEdit, DescriptionNotFoundError } from '$lib/server/narration-store.js';
import { getProjectDir } from '$lib/server/project-context.js';

const BodySchema = z.strictObject({ text: z.string() });

/**
 * AC4: `PUT /api/steps/:stepIndex/description`. The description editor's
 * autosave target (`$lib/components/DescriptionEditor.svelte`'s debounced
 * `$effect`). Writes the edited text as `narration/script.json`'s
 * `approvedText` for this step and sets `approved: true` in the same
 * write - see `$lib/server/narration-store.ts`'s `applyHumanEdit` for why
 * that IS "the machine-drafted flag clears on human edit."
 */
export const PUT: RequestHandler = async ({ params, request }) => {
  const stepIndexRaw = params.stepIndex ?? '';
  if (!/^\d+$/.test(stepIndexRaw)) {
    error(400, `Invalid step index "${stepIndexRaw}".`);
  }
  const stepIndex = Number.parseInt(stepIndexRaw, 10);

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    error(400, 'Body must be {"text": string}.');
  }

  const projectDir = getProjectDir();
  try {
    const segment = applyHumanEdit(projectDir, stepIndex, parsed.data.text);
    return json({ ok: true, segment });
  } catch (err) {
    if (err instanceof DescriptionNotFoundError) {
      error(404, err.message);
    }
    throw err;
  }
};
