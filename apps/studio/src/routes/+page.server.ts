import { getProjectDir } from '$lib/server/project-context.js';
import { loadStudioProjectState } from '$lib/server/project-state.js';
import type { PageServerLoad } from './$types.js';

/**
 * The one server load for Studio's single page. `depends('waggle:project')`
 * lets `+page.svelte`'s SSE subscription (`/api/watch`) call
 * `invalidate('waggle:project')` whenever the project watcher fires
 * (task 3: "Project file watcher + IR load into runes state"), which
 * reruns this function and hands the page fresh data without a full
 * reload.
 */
export const load: PageServerLoad = ({ depends }) => {
  depends('waggle:project');
  const projectDir = getProjectDir();
  return loadStudioProjectState(projectDir);
};
