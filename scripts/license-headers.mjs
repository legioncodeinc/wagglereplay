#!/usr/bin/env node
/**
 * License header tooling (HANDOFF-4 section 6 item 8).
 *
 * Adds or verifies the SPDX license header on every TS/Svelte source file
 * in the workspace, and verifies the license field in every package.json.
 * AGPL-3.0-or-later is the repo-wide license (root package.json, LICENSE).
 *
 * Modes:
 *   node scripts/license-headers.mjs add    prepend missing headers (idempotent)
 *   node scripts/license-headers.mjs check  exit 1 listing any file missing one
 *
 * Excluded: node_modules, build output, dist, test fixtures' generated
 * content is NOT excluded (fixtures are authored source), but .svelte
 * files inside apps/ are included. JSON files are not headered; their
 * contract is the package.json license field check.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const MODE = process.argv[2] ?? 'check';
const ROOT = path.resolve(import.meta.dirname, '..');
const TS_HEADER = '// SPDX-License-Identifier: AGPL-3.0-or-later\n';
const SVELTE_HEADER = '<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->\n';
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.svelte-kit',
  '.git',
  'coverage',
  'tmp-debug-frame',
]);

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (entry.endsWith('.ts') || entry.endsWith('.svelte') || entry.endsWith('.mts')) {
      out.push(full);
    }
  }
  return out;
}

const files = [];
for (const top of ['packages', 'apps', 'fixtures', 'plugins', 'scripts']) {
  const dir = path.join(ROOT, top);
  try {
    statSync(dir);
  } catch {
    continue;
  }
  walk(dir, files);
}

let missing = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const isSvelte = file.endsWith('.svelte');
  const header = isSvelte ? SVELTE_HEADER : TS_HEADER;
  const marker = 'SPDX-License-Identifier: AGPL-3.0-or-later';
  if (text.includes(marker)) continue;
  if (MODE === 'add') {
    writeFileSync(file, header + text);
    console.log(`headered: ${path.relative(ROOT, file)}`);
  } else {
    missing += 1;
    console.error(`missing header: ${path.relative(ROOT, file)}`);
  }
}

// package.json license fields across the workspace.
const pkgFiles = [path.join(ROOT, 'package.json')];
for (const top of ['packages', 'apps', 'fixtures', 'plugins']) {
  const dir = path.join(ROOT, top);
  try {
    statSync(dir);
  } catch {
    continue;
  }
  for (const entry of readdirSync(dir)) {
    const pkg = path.join(dir, entry, 'package.json');
    try {
      statSync(pkg);
    } catch {
      continue;
    }
    pkgFiles.push(pkg);
  }
}
let pkgMissing = 0;
for (const pkg of pkgFiles) {
  const json = JSON.parse(readFileSync(pkg, 'utf8'));
  if (json.license === 'AGPL-3.0-or-later') continue;
  if (MODE === 'add') {
    json.license = 'AGPL-3.0-or-later';
    if (json.name !== undefined) {
      writeFileSync(pkg, `${JSON.stringify(json, null, 2)}\n`);
    }
    console.log(`license field added: ${path.relative(ROOT, pkg)}`);
  } else {
    pkgMissing += 1;
    console.error(`missing license field: ${path.relative(ROOT, pkg)}`);
  }
}

if (MODE === 'check' && (missing > 0 || pkgMissing > 0)) {
  console.error(
    `${String(missing)} file(s) missing headers, ${String(pkgMissing)} package.json without license field.`,
  );
  process.exit(1);
}
console.log(
  `license-headers ${MODE}: done (${String(files.length)} source files, ${String(pkgFiles.length)} package.json).`,
);
