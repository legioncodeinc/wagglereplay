import { error, json, type RequestHandler } from '@sveltejs/kit';
import { StudioSettingsSchema } from '$lib/schemas/studio-settings.js';
import { getProjectDir } from '$lib/server/project-context.js';
import {
  readStudioSettings,
  StudioSettingsError,
  updateStudioSettings,
} from '$lib/server/settings-store.js';

/** AC6: `GET /api/settings` reads `studio.json` (or its defaults for a project that has none yet). */
export const GET: RequestHandler = () => {
  const projectDir = getProjectDir();
  return json(readStudioSettings(projectDir));
};

const PatchSchema = StudioSettingsSchema.omit({ schemaVersion: true }).partial();

/**
 * AC6: `PUT /api/settings` applies a partial update (brand kit id, voice
 * id, preset checklist, credential set binding) to `studio.json`. Never
 * accepts or reflects a credential VALUE: the schema only has
 * `credentialSetId`, a reference into `credentials.json` (ADR-008).
 */
export const PUT: RequestHandler = async ({ request }) => {
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    error(400, `Invalid settings patch: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }

  const projectDir = getProjectDir();
  try {
    return json(updateStudioSettings(projectDir, parsed.data));
  } catch (err) {
    if (err instanceof StudioSettingsError) {
      error(400, err.message);
    }
    throw err;
  }
};
