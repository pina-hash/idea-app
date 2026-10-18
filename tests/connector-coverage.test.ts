// tests/connector-coverage.test.ts
//
// THE REGISTRY COVERS THE SITE, AND ITS GENERATED FILES ARE CURRENT
// (docs/connector/DESIGN.md sections 2 and 5).
//
//   - The inventory, the compiled overlay and the schema are regenerated here,
//     in memory, and must equal the checked-in files: `npm run connector:build`
//     is the fix for a stale one.
//   - Every function the site calls and every server endpoint has an entry: a
//     tool, a call entry, or an exclusion with its reason. Ledger 0401 removed
//     the `pending: slice 2` allowance for good: a new `.rpc('name')` or a new
//     `+server.ts` reddens this file until the overlay answers for it.
//   - Every entry names something that exists, and every reverse an undo entry
//     names is itself a live entry.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startTestDb, type TestDb } from './db/harness';
import { WITH_CONNECTOR } from './db/connector-fixture';
import { ceilingLevel, endpointEntries, ENDPOINTS, FACADES, FUNCTIONS, inventory, levelsOf, liveFunction, maxLevel, schemaOf } from '../src/lib/server/connector/registry';
import { routedEndpoints } from '../src/lib/server/connector/endpoints';
import { handledToolNames } from '../src/lib/server/connector/tools';
import type { Level } from '../src/lib/server/connector/types';

const read = (p: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../src/lib/server/connector/${p}`, import.meta.url)), 'utf8'));
const tool = (name: string) => import(/* @vite-ignore */ new URL(`../tools/connector/${name}`, import.meta.url).href);

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
	it('every inventoried function has an entry, and nothing is pending any more', () => {
		const missing = inventory.functions.filter((f) => !FUNCTIONS[f]);
		expect(missing).toEqual([]);
		const pending = Object.values(FUNCTIONS).filter((e) => e.pending !== undefined);
		expect(pending.map((e) => e.name)).toEqual([]);
	});

	it('every server endpoint has an entry, and nothing is pending any more', () => {
		const missing = inventory.endpoints.map((e) => e.route).filter((r) => !ENDPOINTS[r]);
		expect(missing).toEqual([]);
		expect(Object.values(ENDPOINTS).filter((e) => e.pending !== undefined).map((e) => e.route)).toEqual([]);
	});

	it('the counts, measured on this tree (2026-10-18), carry their date', () => {
		const live = Object.values(FUNCTIONS).filter((e) => liveFunction(e.name));
		const counts = {
			functions: Object.keys(FUNCTIONS).length,
			live: live.length,
			read: live.filter((e) => ceilingLevel(e) === 'read').length,
			writes: live.filter((e) => ceilingLevel(e) !== 'read').length,
			excluded: Object.values(FUNCTIONS).filter((e) => e.exclude).length,
			endpointCalls: endpointEntries().length,
			endpointsExcluded: Object.values(ENDPOINTS).filter((e) => e.exclude).length
		};
		expect(counts.live + counts.excluded).toBe(counts.functions);
		expect(counts.endpointCalls + counts.endpointsExcluded).toBe(Object.keys(ENDPOINTS).length);
		expect(counts.live).toBeGreaterThan(250);
	});

	it('every entry is exactly one of tool, call or exclude, and an exclusion says why', () => {
		const wrong = Object.values(FUNCTIONS).filter((e) => {
			const kinds = [e.exclude !== undefined, e.level !== undefined || e.level_when !== undefined].filter(Boolean).length;
			return kinds !== 1 || (e.level !== undefined && e.level_when !== undefined) || (e.exclude !== undefined && String(e.exclude).length < 20);
		});
		expect(wrong.map((e) => e.name)).toEqual([]);
		const wrongEndpoints = Object.values(ENDPOINTS).filter((e) => [e.exclude, e.surface].filter((x) => x !== undefined).length !== 1);
		expect(wrongEndpoints.map((e) => e.route)).toEqual([]);
	});

	it('every level_when names levels and ends in an else, so the server always decides', () => {
		const withRules = Object.values(FUNCTIONS).filter((e) => e.level_when?.length);
		expect(withRules.length).toBeGreaterThanOrEqual(1);
		for (const e of withRules) {
			expect(levelsOf(e).length, e.name).toBe(e.level_when!.length);
			expect(e.level_when!.at(-1)?.else, `${e.name} ends in an else`).toBeDefined();
		}
		expect(FUNCTIONS.coin_admin_adjust_balance.level_when, 'Mr. Pina, 2026-10-17').toBeDefined();
		// A rule on what the site holds before the write needs the read that finds it.
		const blind = withRules.filter((e) => e.level_when!.some((r) => (r.if ?? '').includes('$before')) && !e.before).map((e) => e.name);
		expect(blind).toEqual([]);
	});

	it('every endpoint call entry has a tool name, a level, words and a handler the server can run', () => {
		const calls = endpointEntries();
		expect(calls.length).toBeGreaterThanOrEqual(1);
		for (const e of calls) {
			expect(e.tool, e.route).toMatch(/^[a-z][a-z0-9_]*$/);
			expect(['read', 'confirm'], `${e.route} is read or asks first`).toContain(e.level);
			expect((e.describe ?? '').length).toBeGreaterThan(20);
			expect((e.say ?? []).length).toBeGreaterThanOrEqual(3);
			expect(routedEndpoints(), `${e.route} has a handler import`).toContain(e.route);
			expect(FUNCTIONS[e.tool as string], `${e.tool} is not also a function name`).toBeUndefined();
		}
		expect(routedEndpoints().sort()).toEqual(calls.map((e) => e.route).sort());
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
		const noReverse = live.filter((e) => levelsOf(e).includes('undo') && !(e.undo ?? []).length).map((e) => e.name);
		expect(noReverse).toEqual([]);
		const deadReverse = live.flatMap((e) => (e.undo ?? []).filter((u) => !liveFunction(u.function)).map((u) => `${e.name} -> ${u.function}`));
		expect(deadReverse).toEqual([]);
	});

	it('every facade writes only through live entries, at the highest level of what it writes', () => {
		for (const f of Object.values(FACADES)) {
			for (const fn of f.uses) expect(liveFunction(fn), `${f.name} uses ${fn}`).not.toBeNull();
			if (f.uses.length) {
				const levels = f.uses.map((fn) => ceilingLevel(FUNCTIONS[fn]) as Level);
				const writes = levels.filter((l) => l !== 'read');
				expect(f.level, f.name).toBe(writes.length ? maxLevel(writes) : 'read');
			}
		}
	});

	it('the dispatcher answers exactly the registry\'s facades and built-ins', () => {
		const expected = [...Object.keys(FACADES), 'site_call', 'site_find_tool'].sort();
		expect(handledToolNames()).toEqual(expected);
	});
});

describe('the documents generated from the registry and the saved requests are current', () => {
	it('DESIGN.md section 7 is the table the overlay writes (the stamp line aside)', async () => {
		const { renderLevelsTable, tableInDesign } = await tool('levels-table.mjs');
		const design = readFileSync(fileURLToPath(new URL('../docs/connector/DESIGN.md', import.meta.url)), 'utf8');
		const inDoc = tableInDesign(design);
		expect(inDoc, 'DESIGN.md has its levels markers').not.toBeNull();
		expect(inDoc).toBe(renderLevelsTable(read('overlay.generated.json')).join('\n').trim());
	});

	it('EVALS.md is generated, and holds every seeded line as the export writes it', async () => {
		const { renderRow, seedRows, GENERATED_MARK } = await tool('evals/export.mjs');
		const doc = readFileSync(fileURLToPath(new URL('../docs/connector/EVALS.md', import.meta.url)), 'utf8');
		expect(doc).toContain(GENERATED_MARK);
		const seed = JSON.parse(readFileSync(fileURLToPath(new URL('../tools/connector/evals/seed.json', import.meta.url)), 'utf8'));
		const rows = seedRows(seed);
		expect(rows).toHaveLength(52);
		const lines = new Set(doc.split('\n'));
		const missing = rows.map(renderRow).filter((line: string) => !lines.has(line));
		expect(missing).toEqual([]);
	});

	it('the 0272 seed is the seed file, line for line', () => {
		const sql = readFileSync(fileURLToPath(new URL('../supabase/migrations/0272_connector_requests_evals_gaps.sql', import.meta.url)), 'utf8');
		const seed = JSON.parse(readFileSync(fileURLToPath(new URL('../tools/connector/evals/seed.json', import.meta.url)), 'utf8')) as Array<{ said: string }>;
		for (const s of seed) expect(sql, s.said).toContain(s.said.replace(/'/g, "''"));
	});
});
