// tests/db/tournament-bracket-seeded-0317.test.ts
//
// LEDGER 0455, MIGRATION 0317: a SEEDED tournament generates its bracket, the
// format stays editable until the first result, and a host or an admin reads
// the setup in one call.
//
// WHY THE BRACKET BROKE, AND WHY NO TEST SAW IT. The hosted project loads
// pg-safeupdate for API requests, which refuses an UPDATE or DELETE with no
// top-level WHERE ("UPDATE requires a WHERE clause"). `_tournament_qual_seed_order`
// (0062) filled its temporary standings with two such updates, so every
// tournament with qualifying pools failed at Generate bracket (IDEA-Blade
// Rotation 2, Oct 27). This fixture does not load the extension, so the check
// below is the extension's own rule applied to the function bodies: no UPDATE
// or DELETE whose top level has no WHERE, in any function a tournament host
// reaches. The POSITIVE CONTROL is the chain short of 0317, where the same scan
// must find the two statements; a scan that finds nothing there proves nothing.
//
// The chain is every migration short of 0317, read off disk; the tournament is
// built through the REAL RPCs (registration, pools, every qualifying result),
// then 0317 is applied over it, as production will hold it.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

type Json = Record<string, unknown>;
const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const ALL = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const FILES = ALL.filter((f) => f.endsWith('_tournament_bracket_seeding_and_format.sql'));
if (FILES.length !== 1) throw new Error(`expected one tournament bracket migration, found ${FILES.length}`);
const FILE = FILES[0];
const PRE = ['../../tests/db/full-chain-fixture-completion.sql', ...ALL.filter((f) => f < FILE)];
const SQL = readFileSync(join(MIGRATIONS_DIR, FILE), 'utf8');

let db: TestDb;
let host: SeededUser;
let admin: SeededUser;
let stranger: SeededUser;
let players: SeededUser[];
let seeded: string;
let plain: string;

const call = <T = Json>(u: SeededUser, sql: string, params: unknown[] = []) =>
	db.asUser(u.id, async (q) => (await q<{ r: T }>(`select ${sql} as r`, params)).rows[0].r);
async function refusal(p: Promise<unknown>): Promise<string | null> {
	try {
		await p;
		return null;
	} catch (e) {
		return (e as Error).message;
	}
}

/**
 * pg-safeupdate's rule, over a function body: every UPDATE or DELETE statement
 * must carry a WHERE at its own top level (a WHERE inside a subquery does not
 * count, which is exactly what fooled a reading of the 0062 body). Comments and
 * string literals are stripped first.
 */
function unqualifiedWrites(body: string): string[] {
	let s = '';
	for (let i = 0; i < body.length; ) {
		if (body.startsWith('--', i)) {
			const j = body.indexOf('\n', i);
			i = j < 0 ? body.length : j;
		} else if (body[i] === "'") {
			let j = i + 1;
			while (j < body.length) {
				if (body[j] === "'" && body[j + 1] === "'") j += 2;
				else if (body[j] === "'") break;
				else j += 1;
			}
			s += "''";
			i = j + 1;
		} else {
			s += body[i];
			i += 1;
		}
	}
	const out: string[] = [];
	const re = /\b(update\s+(only\s+)?([a-z_]+\.)?[a-z_]+(\s+(as\s+)?[a-z_]+)?\s+set\b|delete\s+from\s+(only\s+)?([a-z_]+\.)?[a-z_]+)/gi;
	for (let m = re.exec(s); m; m = re.exec(s)) {
		const end = s.indexOf(';', m.index);
		const stmt = s.slice(m.index, end < 0 ? undefined : end);
		let depth = 0;
		let top = '';
		for (const ch of stmt) {
			if (ch === '(') depth += 1;
			else if (ch === ')') depth -= 1;
			else if (depth === 0) top += ch;
		}
		if (!/\bwhere\b/i.test(top)) out.push(stmt.replace(/\s+/g, ' ').slice(0, 80));
	}
	return out;
}

async function tournamentWritesWithoutWhere(d: TestDb): Promise<string[]> {
	const { rows } = await d.sql<{ name: string; def: string }>(
		`select p.proname as name, pg_get_functiondef(p.oid) as def
		 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		 where n.nspname = 'public' and p.proname ~ '^_?tournament' and p.prokind = 'f'`
	);
	return rows.flatMap((r) => unqualifiedWrites(r.def).map((w) => `${r.name}: ${w}`));
}

async function bracketOf(t: string) {
	return (
		await db.sql<{ id: string; bracket: string; round: number; status: string; best_of: number; entry_a_id: string | null; entry_b_id: string | null }>(
			`select id, bracket, round, status, best_of, entry_a_id, entry_b_id from public.tournament_bracket_matches
			 where tournament_id = $1 order by bracket, round, slot`,
			[t]
		)
	).rows;
}

let before: string[];

beforeAll(async () => {
	db = await startTestDb(PRE);
	host = await createUser(db, 'hana.host@boscotech.edu', 'Hana Host');
	admin = await createUser(db, 'ada.admin@boscotech.edu', 'Ada Admin');
	stranger = await createUser(db, 'sam.stranger@boscotech.net', 'Sam Stranger');
	await db.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [admin.email]);
	players = [];
	for (let i = 0; i < 8; i += 1) players.push(await createUser(db, `blade${i}@boscotech.net`, `Blade Player ${i}`));

	// THE IDEA-BLADE SHAPE: 8 teams, two qualifying pools of four, every
	// qualifying match decided, best of 3 with a best of 5 final.
	seeded = await call<string>(host, `public.tournament_create($1, '', $2::jsonb)`, [
		'Blade Rotation',
		JSON.stringify({ quals_enabled: true, score_entry: false, best_of_default: 3, best_of: { grand_final: 5 }, team_size: 2 })
	]);
	await call(host, `public.tournament_set_status($1, 'registration_open')`, [seeded]);
	for (let i = 0; i < 8; i += 1) {
		await call(players[i], `public.tournament_register_entry($1, $2, '', null)`, [seeded, `Team ${i}`]);
	}
	await call(host, `public.tournament_set_status($1, 'seeding')`, [seeded]);
	await call(host, `public.tournament_generate_qual_pools($1, 2)`, [seeded]);
	const quals = (await db.sql<{ id: string; entry_a_id: string }>(
		`select id, entry_a_id from public.tournament_qual_matches where tournament_id = $1 order by pool_id, sequence`,
		[seeded]
	)).rows;
	for (const m of quals) {
		await call(host, `public.tournament_submit_qual_result($1, null, null, $2)`, [m.id, m.entry_a_id]);
	}

	// An unseeded tournament beside it, the case that always worked.
	plain = await call<string>(host, `public.tournament_create($1, '', $2::jsonb)`, [
		'Hook Cup',
		JSON.stringify({ quals_enabled: false, score_entry: false, best_of_default: 1, team_size: 1 })
	]);
	await call(host, `public.tournament_set_status($1, 'registration_open')`, [plain]);
	for (let i = 0; i < 5; i += 1) {
		await call(host, `public.tournament_host_add_entry($1, $2, '', null, null)`, [plain, `Hook ${i}`]);
	}
	await call(host, `public.tournament_set_status($1, 'seeding')`, [plain]);

	before = await tournamentWritesWithoutWhere(db);
	await db.sql(SQL);
}, 600_000);

afterAll(async () => db?.stop());

describe('0317: the write pg-safeupdate refuses', () => {
	test('POSITIVE CONTROL: before 0317 the scan finds the two seeding updates', () => {
		expect(before.filter((w) => w.startsWith('_tournament_qual_seed_order:'))).toHaveLength(2);
	});

	test('after 0317 no tournament function writes without a WHERE', async () => {
		expect(await tournamentWritesWithoutWhere(db)).toEqual([]);
	});

	test('the file re-applies over itself', async () => {
		await db.sql(SQL);
		expect(await tournamentWritesWithoutWhere(db)).toEqual([]);
	});
});

describe('0317: a seeded tournament generates its bracket', () => {
	test('the bracket is drawn from the pool standings', async () => {
		await call(host, `public.tournament_generate_bracket($1)`, [seeded]);
		const ms = await bracketOf(seeded);
		// 8 entries: P = 8, double elimination is 2P - 2 = 14 matches.
		expect(ms).toHaveLength(14);
		expect((await db.sql(`select status from public.tournaments where id = $1`, [seeded])).rows[0].status).toBe('live');
		// Every pool winner (3-0, entry_a won every match it was entry_a of)
		// holds a top-two seed, read from the standings, not from the bracket.
		const seeds = (await db.sql<{ display_name: string; seed: number }>(
			`select display_name, seed from public.tournament_entries where tournament_id = $1 order by seed`,
			[seeded]
		)).rows;
		expect(seeds.map((s) => s.seed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
		// Lengths come from the format: best of 3, a best of 5 final.
		expect(ms.filter((m) => m.bracket === 'winners').every((m) => m.best_of === 3)).toBe(true);
		expect(ms.find((m) => m.bracket === 'grand_final')?.best_of).toBe(5);
	});

	test('an unseeded tournament still generates (the control that always worked)', async () => {
		await call(host, `public.tournament_generate_bracket($1)`, [plain]);
		// 5 entries: P = 8, 14 matches, 3 byes resolved at generation.
		const ms = await bracketOf(plain);
		expect(ms).toHaveLength(14);
		const byes = ms.filter((m) => m.status === 'complete' && (m.entry_a_id === null || m.entry_b_id === null));
		expect(byes.length).toBeGreaterThanOrEqual(3);
	});
});

describe('0317: the format stays editable until the first result', () => {
	test('a host changes best of 3 to best of 5 and the final to 7 while nothing is played', async () => {
		await call(host, `public.tournament_update($1, null, null, $2::jsonb)`, [
			seeded,
			JSON.stringify({ quals_enabled: true, score_entry: false, best_of_default: 5, best_of: { grand_final: 7 }, team_size: 2 })
		]);
		const ms = await bracketOf(seeded);
		expect(ms.filter((m) => m.bracket !== 'grand_final' && m.status === 'pending').every((m) => m.best_of === 5)).toBe(true);
		expect(ms.find((m) => m.bracket === 'grand_final')?.best_of).toBe(7);
		const ev = (await db.sql<{ metadata: Json }>(
			`select metadata from public.tournament_match_events where tournament_id = $1 and event_type = 'corrected' order by id desc limit 1`,
			[seeded]
		)).rows[0];
		expect(ev.metadata).toMatchObject({ change: 'format_before_first_result' });
	});

	test('qualifying, scoring and team size stay locked once live, and nothing moves', async () => {
		const stored = (await db.sql<{ config: Json }>(`select config from public.tournaments where id = $1`, [seeded])).rows[0].config;
		const msg = await refusal(
			call(host, `public.tournament_update($1, null, null, $2::jsonb)`, [
				seeded,
				JSON.stringify({ quals_enabled: true, score_entry: true, best_of_default: 5, best_of: { grand_final: 7 }, team_size: 2 })
			])
		);
		expect(msg).toMatch(/only the match lengths can change/);
		expect((await db.sql<{ config: Json }>(`select config from public.tournaments where id = $1`, [seeded])).rows[0].config).toEqual(stored);
	});

	test('after the first result the format locks in its old words', async () => {
		const m = (await bracketOf(seeded)).find((x) => x.status === 'pending' && x.entry_a_id && x.entry_b_id)!;
		await call(host, `public.tournament_start_match($1)`, [m.id]);
		const msg = await refusal(
			call(host, `public.tournament_update($1, null, null, $2::jsonb)`, [
				seeded,
				JSON.stringify({ quals_enabled: true, score_entry: false, best_of_default: 3, best_of: {}, team_size: 2 })
			])
		);
		expect(msg).toMatch(/locked once the bracket is generated/);
		// A rename still saves (the name lock is entries', not the event's).
		await call(host, `public.tournament_update($1, 'Blade Rotation Finals', null, null)`, [seeded]);
	});
});

describe('0317: setup reads and the directory, both directions', () => {
	test('a host and an admin read the setup; a stranger is refused', async () => {
		const s = await call<Json>(host, `public.tournament_setup_state($1)`, [seeded]);
		expect(s).toMatchObject({ status: 'live', has_result: true, format_editable: false });
		expect((s.entries as unknown[]).length).toBe(8);
		expect((s.pools as unknown[]).length).toBe(2);
		const a = await call<Json>(admin, `public.tournament_setup_state($1)`, [plain]);
		expect(a).toMatchObject({ status: 'live', has_result: false, format_editable: true });
		expect(await refusal(call(stranger, `public.tournament_setup_state($1)`, [seeded]))).toMatch(/host or a site admin/);
	});

	test('the admin list holds every tournament; a stranger hosts none', async () => {
		expect((await call<Json[]>(admin, `public.tournament_list_admin()`)).length).toBe(2);
		expect(await call<Json[]>(stranger, `public.tournament_list_admin()`)).toEqual([]);
	});

	test('the directory finds by name and address, school accounts only, never for a stranger', async () => {
		const hits = await call<Json[]>(host, `public.tournament_people_search($1, 'blade player 3', 12)`, [seeded]);
		expect(hits.map((h) => h.email)).toEqual(['blade3@boscotech.net']);
		expect(hits[0]).toMatchObject({ in_tournament: true });
		const byAddress = await call<Json[]>(host, `public.tournament_people_search($1, 'sam.str', 12)`, [seeded]);
		expect(byAddress).toEqual([expect.objectContaining({ email: 'sam.stranger@boscotech.net', in_tournament: false })]);
		expect(await call<Json[]>(host, `public.tournament_people_search($1, 'b', 12)`, [seeded])).toEqual([]);
		expect(await refusal(call(stranger, `public.tournament_people_search($1, 'blade', 12)`, [seeded]))).toMatch(/host or a site admin/);
		const anon = await db.sql<{ x: boolean }>(
			`select has_function_privilege('anon', 'public.tournament_people_search(uuid, text, integer)', 'execute') as x`
		);
		expect(anon.rows[0].x).toBe(false);
	});
});
