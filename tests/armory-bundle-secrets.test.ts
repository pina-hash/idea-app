// tests/armory-bundle-secrets.test.ts
//
// ONE MODULE KNOWS EACH ARMORY CREDENTIAL, AND NONE OF THEM IS CLIENT CODE.
//
// The four ARMORY_R2_* variables are read only by
// src/lib/server/armory/storage.ts, ARMORY_RELEASES_TOKEN only by
// src/lib/server/armory/releases.ts, and the Armory use of
// SUPABASE_SERVICE_ROLE_KEY only by src/lib/server/armory/backend.ts. SvelteKit
// refuses to bundle `$lib/server` into the client, which is what makes that a
// boundary. The built-bundle grep (a real `npm run build` with sentinel values,
// then a search of .svelte-kit/output/client) is recorded in the ledger entry;
// this file is the durable half that runs every suite run.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) out.push(...walk(full));
		else if (/\.(ts|js|svelte|mjs)$/.test(name)) out.push(full);
	}
	return out;
}
const FILES = walk(SRC).map((f) => ({ path: relative(ROOT, f).replace(/\\/g, '/'), text: readFileSync(f, 'utf8') }));
const naming = (re: RegExp) => FILES.filter((f) => re.test(f.text)).map((f) => f.path).sort();

describe('the Armory credentials each have one reader, on the server', () => {
	test('ARMORY_R2_* is read only by the storage module', () => {
		expect(naming(/ARMORY_R2_[A-Z_]+/)).toEqual(['src/lib/server/armory/storage.ts']);
	});
	test('ARMORY_RELEASES_TOKEN is read only by the releases module', () => {
		expect(naming(/ARMORY_RELEASES_TOKEN/)).toEqual(['src/lib/server/armory/releases.ts']);
	});
	test('within Armory, only the backend module names the service-role key', () => {
		const armory = naming(/SUPABASE_SERVICE_ROLE_KEY/).filter((p) => /armory/i.test(p));
		expect(armory).toEqual(['src/lib/server/armory/backend.ts']);
	});
	test('no client-reachable Armory file imports $lib/server', () => {
		const client = FILES.filter(
			(f) =>
				/armory/i.test(f.path) &&
				!f.path.startsWith('src/lib/server/') &&
				!/\+(server|page\.server|layout\.server)\.ts$/.test(f.path)
		);
		expect(client.length).toBeGreaterThan(10); // positive control: the pages and components are there
		expect(client.filter((f) => /\$lib\/server|\$env\/dynamic\/private/.test(f.text)).map((f) => f.path)).toEqual([]);
	});
});
