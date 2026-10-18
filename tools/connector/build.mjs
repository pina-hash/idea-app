#!/usr/bin/env node
// tools/connector/build.mjs -- `npm run connector:build`.
//
// Regenerates the three generated registry files in order: the inventory (a
// file scan), the compiled overlay (the YAML), then the schema (an embedded
// Postgres with every migration applied, reading pg_proc for every name the
// first two mention). tests/connector-coverage.test.ts fails on a stale one.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

for (const step of ['inventory.mjs', 'overlay.mjs', 'schema.mjs']) {
	execFileSync(process.execPath, [fileURLToPath(new URL(`./${step}`, import.meta.url))], { stdio: 'inherit' });
}
