// SPDX-License-Identifier: AGPL-3.0-or-later
import { installRoutePatch } from './route-main-world.js';

/**
 * The actual MAIN-world injection entry point (bundled by build/build.mjs
 * as `route-main-world.js`). Kept as a separate one-line file from
 * ./route-main-world.ts so the pure `installRoutePatch` function has no
 * import-time side effect and can be unit tested directly.
 */
installRoutePatch(window);
