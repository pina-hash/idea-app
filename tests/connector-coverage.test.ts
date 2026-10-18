// tests/connector-coverage.test.ts
//
// THE REGISTRY COVERS THE SITE, AND ITS GENERATED FILES ARE CURRENT
// (docs/connector/DESIGN.md sections 2 and 5).
//
//   - The inventory, the compiled overlay and the schema are regenerated here,
//     in memory, and must equal the checked-in files: `npm run connector:build`
//     is the fix for a stale one.
//   - Every function the site calls and every server endpoint has an entry: a
//     tool, a call entry, an exclusion with its reason, or (until ledger 0401
//     lands and removes this allowance) `pending: slice 2`.
//   - Every entry names something that exists, and every reverse an undo entry
//     names is itself a live entry.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startTestDb, type TestDb } from './db/harness';
import { WITH_CONNECTOR } from './db/connector-fixture';
import { ENDPOINTS, FACADES, FUNCTIONS, inventory, liveFunction, maxLevel, schemaOf } from '../src/lib/server/connector/registry';
import { handledToolNames } from '../src/lib/server/connector/tools';
import type { Level } from '../src/lib/server/connector/types';

const read = (p: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../src/lib/server/connector/${p}`, import.meta.url)), 'utf8'));
const tool = (name: string) => import(/* @vite-ignore */ new URL(`../tools/connector/${name}`, import.meta.url).href);

/** The one allowance this ledger leaves for 0401 to remove. */
const PENDING_ALLOWED = 'slice 2';

let db: TestDb;

beforeAll(async () => {
	db = await startTestDb(WITH_CONNECTOR);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

describe('the generated files are current', () => {
	it('the inventory matches a fresh scan of src/, and carries the date it was measured', async () => {
		const { buildInventory, inventoryKey } = await tool('inventory.mjs');
		const fresh = buildInventory();
		const stored = read('inventory.generated.json');
		expect(inventoryKey(stored), 'run npm run connector:build').toBe(inventoryKey(fresh));
		expect(stored.measured).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(stored.counts.functions).toBe(stored.functions.length);
		expect(stored.counts.endpoints).toBe(stored.endpoints.length);
		expect(stored.functions.length).toBeGreaterThan(350);
		expect(stored.endpoints.length).toBeGreaterThan(100);
	});

	it('the compiled overlay matches the YAML', async () => {
		const { compileOverlay } = await tool('overlay.mjs');
		const { overlay, problems } = compileOverlay();
		expect(problems).toEqual([]);
		expect(read('overlay.generated.json'), 'run npm run connector:build').toEqual(overlay);
	});

	it('the schema matches pg_proc on the whole migration chain', async () => {
		const { readSchema } = await tool('schema-query.mjs');
		const { schemaNames } = await tool('schema.mjs');
		const stored = read('schema.generated.json');
		const names = schemaNames(read('inventory.generated.json'), read('overlay.generated.json'));
		const fresh = await readSchema((t: string, p?: unknown[]) => db.sql(t, p), names);
		expect(stored.functions, 'run npm run connector:build').toEqual(fresh);
		expect(stored.migrations).toBe(WITH_CONNECTOR.length - 1);
	});
});

describe('every function and endpoint has an answer', () => {
	it('every inventoried function has an entry, and pending names only the allowance 0401 removes', () => {
		const missing = inventory.functions.filter((f) => !FUNCTIONS[f]);
		expect(missing).toEqual([]);
		const badPending = Object.values(FUNCTIONS).filter((e) => e.pending !== undefined && e.pending !== PENDING_ALLOWED);
		expect(badPending.map((e) => e.name)).toEqual([]);
	});

	it('every server endpoint has an entry', () => {
		const missing = inventory.endpoints.map((e) => e.route).filter((r) => !ENDPOINTS[r]);
		expect(missing).toEqual([]);
	});

	it('every entry is exactly one of tool, call, exclude or pending, and an exclusion says why', () => {
		const wrong = Object.values(FUNCTIONS).filter((e) => {
			const kinds = [e.pending !== undefined, e.exclude !== undefined, e.level !== undefined].filter(Boolean).length;
			return kinds !== 1 || (e.exclude !== undefined && String(e.exclude).length < 20);
		});
		expect(wrong.map((e) => e.name)).toEqual([]);
		const wrongEndpoints = Object.values(ENDPOINTS).filter((e) => [e.pending, e.exclude, e.surface].filter((x) => x !== undefined).length !== 1);
		expect(wrongEndpoints.map((e) => e.route)).toEqual([]);
	});

	it('every entry names something that exists', () => {
		const known = new Set(inventory.functions);
		const ghosts = Object.keys(FUNCTIONS).filter((f) => !known.has(f) && schemaOf(f).length === 0);
		expect(ghosts).toEqual([]);
		const routes = new Set(inventory.endpoints.map((e) => e.route));
		expect(Object.keys(ENDPOINTS).filter((r) => !routes.has(r))).toEqual([]);
		// A live entry must be a real database function.
		const liveGhosts = Object.keys(FUNCTIONS).filter((f) => liveFunction(f) && schemaOf(f).length === 0);
		expect(liveGhosts).toEqual([]);
	});

	it('every undo entry names its reverse, and the reverse is a live entry', () => {
		const live = Object.values(FUNCTIONS).filter((e) => liveFunction(e.name));
		expect(live.length).toBeGreaterThanOrEqual(30);
		const noReverse = live.filter((e) => e.level === 'undo' && !(e.undo ?? []).length).map((e) => e.name);
		expect(noReverse).toEqual([]);
		const deadReverse = live.flatMap((e) => (e.undo ?? []).filter((u) => !liveFunction(u.function)).map((u) => `${e.name} -> ${u.function}`));
		expect(deadReverse).toEqual([]);
	});

	it('every facade writes only through live entries, at the highest level of what it writes', () => {
		for (const f of Object.values(FACADES)) {
			for (const fn of f.uses) expect(liveFunction(fn), `${f.name} uses ${fn}`).not.toBeNull();
			if (f.uses.length) {
				const levels = f.uses.map((fn) => FUNCTIONS[fn].level as Level);
				const writes = levels.filter((l) => l !== 'read');
				expect(f.level, f.name).toBe(writes.length ? maxLevel(writes) : 'read');
			}
		}
	});

	it('the dispatcher answers exactly the registry\'s tools', () => {
		const expected = [...Object.keys(FACADES), 'site_call', 'site_find_tool'].sort();
		expect(handledToolNames()).toEqual(expected);
	});
});
