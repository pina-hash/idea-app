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
//   - THE GENERATED LAYER (ledger 0416). Every admin action -- a function whose
//     body reaches a staff gate, a route whose handler asks for admin -- has a
//     tool (hand-written or generated) or a hand-written exclusion with its
//     reason. tools/connector/auto.mjs writes a tool for every one the overlay
//     does not name, so this fails only on a stale generated file, which
//     .github/workflows/connector.yml regenerates on every push to main.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startTestDb, type TestDb } from './db/harness';
import { WITH_CONNECTOR } from './db/connector-fixture';
import { callArgs, ceilingLevel, endpointEntries, ENDPOINTS, FACADES, fitOverload, FUNCTIONS, inventory, levelsOf, liveFunction, maxLevel, schemaOf } from '../src/lib/server/connector/registry';
import { routedEndpoints } from '../src/lib/server/connector/endpoints';
import overlayJson from '../src/lib/server/connector/overlay.generated.json';
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

describe('the generated tools (ledger 0416)', () => {
	it('auto.generated.json and endpoints.generated.ts are what the build writes from the other three layers', async () => {
		const { buildAuto, renderRoutes } = await tool('auto.mjs');
		const fresh = buildAuto(read('inventory.generated.json'), read('overlay.generated.json'), read('schema.generated.json'));
		expect(read('auto.generated.json'), 'run npm run connector:build').toEqual(JSON.parse(JSON.stringify(fresh)));
		const routes = readFileSync(fileURLToPath(new URL('../src/lib/server/connector/endpoints.generated.ts', import.meta.url)), 'utf8');
		expect(routes, 'run npm run connector:build').toBe(renderRoutes(fresh));
	});

	it('every admin action has a tool or a hand-written exclusion with its reason', async () => {
		const { routeIsAdmin } = await tool('auto.mjs');
		const handExcluded = (name: string) => {
			const e = (overlayJson as { functions: Record<string, { exclude?: string }> }).functions[name];
			return !!e?.exclude && e.exclude.length >= 20;
		};
		const adminFunctions = inventory.functions.filter((f) => schemaOf(f).some((o) => ((o as { gates?: string[] }).gates ?? []).length > 0));
		// Measured 2026-10-19 on this tree: well over a hundred, so a gate reader that found none would say so here.
		expect(adminFunctions.length).toBeGreaterThan(250);
		const unanswered = adminFunctions.filter((f) => !liveFunction(f) && !handExcluded(f));
		expect(unanswered, 'an admin action with no tool: run npm run connector:build').toEqual([]);
		// A generated exclusion is only ever for something that is NOT an admin action.
		const wronglyExcluded = adminFunctions.filter((f) => FUNCTIONS[f]?.auto && FUNCTIONS[f]?.exclude);
		expect(wronglyExcluded).toEqual([]);

		const adminRoutes = inventory.endpoints.filter((e) => routeIsAdmin(readFileSync(fileURLToPath(new URL(`../${e.file}`, import.meta.url)), 'utf8')));
		expect(adminRoutes.length).toBeGreaterThan(5);
		const handRouteExcluded = (route: string) => {
			const e = (overlayJson as { endpoints: Record<string, { exclude?: string }> }).endpoints[route];
			return !!e?.exclude && e.exclude.length >= 20;
		};
		const callRoutes = new Set(endpointEntries().map((e) => e.route));
		const unansweredRoutes = adminRoutes
			.map((e) => e.route)
			.filter((r) => !callRoutes.has(r) && !handRouteExcluded(r) && !(ENDPOINTS[r]?.auto && ENDPOINTS[r]?.exclude && /parameter|no GET or POST/.test(ENDPOINTS[r].exclude!)));
		expect(unansweredRoutes).toEqual([]);
	});

	it('a generated tool keeps the contract: a read writes nothing, anything else asks first, and none claims an undo', () => {
		const generated = Object.values(FUNCTIONS).filter((e) => e.auto && liveFunction(e.name));
		expect(generated.length).toBeGreaterThan(50);
		for (const e of generated) {
			const writes = schemaOf(e.name).some((o) => (o as { writes?: boolean }).writes);
			expect(e.level, e.name).toBe(writes ? 'confirm' : 'read');
			expect(e.undo, e.name).toBeUndefined();
			expect(e.level_when, e.name).toBeUndefined();
			expect(e.proof, e.name).toBe('generic');
			// The Armory's repeat key is filled by the server, never asked of him.
			for (const a of callArgs(e)) if (a.param === 'p_operation' && a.type === 'uuid') expect(a.fill, `${e.name}.p_operation`).toBe('uuid');
		}
		// A hand entry may lean on the generic proof only where there is no reverse to prove.
		const leaning = Object.values(FUNCTIONS).filter((e) => !e.auto && e.proof === 'generic' && levelsOf(e).includes('undo'));
		expect(leaning.map((e) => e.name)).toEqual([]);
	});

	it('every staff gate the generator reads is a real function, and the gate reader sees one through a private helper', async () => {
		const { STAFF_GATES, reachedGates, bodyWrites } = await tool('gates.mjs');
		const { rows } = await db.sql<{ proname: string }>(
			`select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any($1::text[])`,
			[STAFF_GATES]
		);
		expect(rows.map((r) => r.proname).sort()).toEqual([...STAFF_GATES].sort());
		const bodies = new Map<string, string[]>([
			['outer', ['begin perform public._guard(); return 1; end']],
			['_guard', ['begin if not public.is_admin() then raise exception \'no\'; end if; end']],
			['student', ['begin if not public.classroom_can_read_item(x) then return; end if; end']],
			['classroom_can_read_item', ['select public.classroom_manages_section(s)']]
		]);
		const reached = reachedGates(bodies);
		expect(reached.get('outer')).toEqual(['is_admin']);
		expect(reached.get('student'), 'a public read check is not followed').toEqual([]);
		expect(bodyWrites('update public.coin_stocks s set active = true')).toBe(true);
		expect(bodyWrites('select count(*) from public.coin_stocks')).toBe(false);
	});

	it('the market, its banner, stocks, transfers, hall pass time, Armory teams and the feedback list are reachable (gaps 499d58e1, 75287d20, 8d500e31, ae4a495d)', () => {
		for (const fn of [
			'coin_banner_save', 'coin_banner_remove', 'coin_banner_admin', 'coin_market_moderation', 'coin_market_listing_staff',
			'coin_market_resolve', 'coin_market_official_save', 'coin_market_review_remove', 'coin_transfer_moderation',
			'coin_transfer_remove_message', 'coin_stock_admin_list', 'coin_stock_admin_set', 'coin_settings_set',
			'armory_add_member', 'armory_remove_member', 'app_feedback_file', 'app_feedback_set_status', 'app_feedback_admin_list'
		]) {
			expect(liveFunction(fn), fn).not.toBeNull();
			expect(FUNCTIONS[fn].auto, `${fn} has hand-written words`).toBeUndefined();
		}
		expect(FUNCTIONS.coin_banner_save.tool).toBe('post_market_banner');
		expect(FUNCTIONS.app_feedback_file.tool).toBe('file_site_feedback');
		expect(FACADES.list_site_feedback).toBeDefined();
		expect(FACADES.feedback_screenshot).toBeDefined();
	});

	it('one form of every function takes any one optional argument he gives (gap 3157f5d8)', () => {
		const stuck: string[] = [];
		for (const e of Object.values(FUNCTIONS).filter((x) => liveFunction(x.name))) {
			if (schemaOf(e.name).length < 2) continue;
			const args = callArgs(e);
			const base: Record<string, unknown> = {};
			for (const a of args) if (a.required || a.hasDefault || a.fill) base[a.param] = null;
			for (const a of args.filter((x) => !(x.param in base))) {
				const fit = fitOverload(e.name, { ...base, [a.param]: null });
				if (!fit.ok) stuck.push(`${e.name}.${a.name}`);
			}
			if (!fitOverload(e.name, base).ok) stuck.push(`${e.name} as given`);
		}
		expect(stuck).toEqual([]);
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
