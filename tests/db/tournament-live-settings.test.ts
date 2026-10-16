// tests/db/tournament-live-settings.test.ts
//
// AN ADMIN CHANGES A LIVE TOURNAMENT'S SETTINGS (ledger 0392, migration 0266,
// report d1d40a60). The chain is booted SHORT of 0266, a tournament is taken
// live through the REAL RPCs with one match played and one started, and 0266
// is applied over the top, so every assertion is about an event already
// running.
//
// Silent-regression guarantees, each with a control:
//   - only an admin reaches the door: a host (who can run the event) and anon
//     are refused, and the host's own tournament_update is as locked as it was;
//   - nothing already played changes: a decided match keeps its winner and its
//     length, a started match keeps its length, only unstarted matches are
//     re-stamped;
//   - every refusal writes nothing (qualifying, a team size under a roster,
//     a stale preview);
//   - scoring switched on mid-event governs only results entered afterwards.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

type Json = Record<string, unknown>;
const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const ALL = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const FILE = '0266_tournament_live_settings.sql';
const PRE = ['../../tests/db/full-chain-fixture-completion.sql', ...ALL.filter((f) => f < '0266')];

let db: TestDb;
let host: SeededUser;
let admin: SeededUser;
let players: SeededUser[];
let tid: string;

type Match = { id: string; status: string; best_of: number; winner_id: string | null; bracket: string; round: number; entry_a_id: string | null; entry_b_id: string | null };
async function matches(): Promise<Match[]> {
	const { rows } = await db.sql<Match>(
		`select id, status, best_of, winner_id, bracket, round, entry_a_id, entry_b_id
		 from public.tournament_bracket_matches where tournament_id = $1 order by bracket, round, slot`,
		[tid]
	);
	return rows;
}
async function config(): Promise<Json> {
	const { rows } = await db.sql<{ c: Json }>(`select config c from public.tournaments where id = $1`, [tid]);
	return rows[0].c;
}
const call = <T = Json>(u: SeededUser, sql: string, params: unknown[]) =>
	db.asUser(u.id, async (q) => (await q<{ r: T }>(`select ${sql} as r`, params)).rows[0].r);
async function refusal(p: Promise<unknown>): Promise<string | null> {
	try {
		await p;
		return null;
	} catch (e) {
		return (e as Error).message;
	}
}

let played: Match;
let started: Match;

beforeAll(async () => {
	db = await startTestDb(PRE);
	host = await createUser(db, 'hana.host@boscotech.edu', 'Hana Host');
	admin = await createUser(db, 'ada.admin@boscotech.edu', 'Ada Admin');
	await db.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [admin.email]);
	players = [];
	for (let i = 0; i < 8; i += 1) players.push(await createUser(db, `p${i}@boscotech.net`, `Player ${i}`));

	tid = await call<string>(host, `public.tournament_create($1, '', $2::jsonb)`, [
		'Blade Cup',
		JSON.stringify({ score_entry: false, best_of_default: 1, team_size: 2 })
	]);
	await call(host, `public.tournament_set_status($1, 'registration_open')`, [tid]);
	for (let i = 0; i < 8; i += 1) {
		await call(players[i], `public.tournament_register_entry($1, $2, '', null)`, [tid, `Team ${i}`]);
	}
	await call(host, `public.tournament_set_status($1, 'seeding')`, [tid]);
	await call(host, `public.tournament_generate_bracket($1)`, [tid]);

	// One match decided, win/loss only, the way the event was set up.
	const ready = (await matches()).filter((m) => m.status === 'pending' && m.entry_a_id && m.entry_b_id);
	played = ready[0];
	await call(host, `public.tournament_start_match($1)`, [played.id]);
	await call(host, `public.tournament_submit_match_result($1, $2::jsonb)`, [played.id, JSON.stringify({ games: [{ winner: 'a' }] })]);
	// One match started and not finished.
	started = ready[1];
	await call(host, `public.tournament_start_match($1)`, [started.id]);

	await db.sql(readFileSync(join(MIGRATIONS_DIR, FILE), 'utf8'));
}, 600_000);

afterAll(async () => db?.stop());

const SCORED = { score_entry: true, best_of_default: 3, best_of: {}, team_size: 2, quals_enabled: false };

describe('0266 over a live event', () => {
	test('re-applies cleanly, and the fixture is live with one match played and one started', async () => {
		await db.sql(readFileSync(join(MIGRATIONS_DIR, FILE), 'utf8'));
		const { rows } = await db.sql<{ status: string }>(`select status from public.tournaments where id = $1`, [tid]);
		expect(rows[0].status).toBe('live');
		const ms = await matches();
		expect(ms.find((m) => m.id === played.id)?.status).toBe('complete');
		expect(ms.find((m) => m.id === started.id)?.status).toBe('in_progress');
	});

	test('the host is refused; anon cannot call; the host\'s own edit is as locked as it was', async () => {
		expect(await call(host, `public.tournament_live_config_preview($1, $2::jsonb)`, [tid, JSON.stringify(SCORED)])).toMatchObject({ ok: false, reason: 'not_admin' });
		expect(await call(host, `public.tournament_live_config_apply($1, $2::jsonb, $3::jsonb)`, [tid, JSON.stringify(SCORED), JSON.stringify(await config())])).toMatchObject({ ok: false, reason: 'not_admin' });
		expect(await refusal(db.asAnon((q) => q(`select public.tournament_live_config_preview($1, '{}'::jsonb)`, [tid])))).toMatch(/permission denied/);
		expect(await refusal(call(host, `public.tournament_update($1, null, null, $2::jsonb)`, [tid, JSON.stringify(SCORED)]))).toMatch(/locked once the bracket/);
		expect((await config()).score_entry).toBe(false);
	});

	test('the preview names every change and what it does to the matches, and writes nothing', async () => {
		const before = await matches();
		const p = await call<Json>(admin, `public.tournament_live_config_preview($1, $2::jsonb)`, [tid, JSON.stringify(SCORED)]);
		expect(p.ok).toBe(true);
		const keys = (p.changes as { key: string }[]).map((c) => c.key).sort();
		expect(keys).toEqual(['best_of_default', 'score_entry']);
		const unstarted = before.filter((m) => m.status === 'pending').length;
		expect(p.matches_restamped).toBe(unstarted);
		expect(p.matches_kept_length).toBe(2); // the played one and the started one
		expect(p.matches_played).toBe(1);
		expect(await matches()).toEqual(before);
		expect((await config()).best_of_default).toBe(1);
	});

	test('refusals write nothing: qualifying, a team size under a roster, a stale preview, no change', async () => {
		const stored = await config();
		expect(await call(admin, `public.tournament_live_config_apply($1, $2::jsonb, $3::jsonb)`, [tid, JSON.stringify({ ...SCORED, quals_enabled: true }), JSON.stringify(stored)])).toMatchObject({ ok: false, reason: 'quals_locked' });
		// A second member on one entry makes the largest roster 2.
		const entry = (await db.sql<{ id: string }>(`select id from public.tournament_entries where tournament_id = $1 limit 1`, [tid])).rows[0].id;
		await db.sql(`insert into public.tournament_entry_members (tournament_id, entry_id, name) values ($1, $2, 'Second')`, [tid, entry]);
		expect(await call(admin, `public.tournament_live_config_apply($1, $2::jsonb, $3::jsonb)`, [tid, JSON.stringify({ ...SCORED, team_size: 1 }), JSON.stringify(stored)])).toMatchObject({ ok: false, reason: 'team_size_below_largest', largest: 2 });
		expect(await call(admin, `public.tournament_live_config_apply($1, $2::jsonb, $3::jsonb)`, [tid, JSON.stringify(SCORED), JSON.stringify({ ...stored, best_of_default: 5 })])).toMatchObject({ ok: false, reason: 'stale' });
		expect(await call(admin, `public.tournament_live_config_apply($1, $2::jsonb, $3::jsonb)`, [tid, JSON.stringify(stored), JSON.stringify(stored)])).toMatchObject({ ok: false, reason: 'no_change' });
		expect(await config()).toEqual(stored);
		expect((await matches()).every((m) => m.best_of === 1)).toBe(true);
	});

	test('the apply: config written, only unstarted matches re-stamped, nothing played re-decided, one log row', async () => {
		const stored = await config();
		const r = await call<Json>(admin, `public.tournament_live_config_apply($1, $2::jsonb, $3::jsonb)`, [tid, JSON.stringify(SCORED), JSON.stringify(stored)]);
		expect(r.ok).toBe(true);
		const c = await config();
		expect(c.score_entry).toBe(true);
		expect(c.best_of_default).toBe(3);
		const ms = await matches();
		const p = ms.find((m) => m.id === played.id)!;
		const s = ms.find((m) => m.id === started.id)!;
		expect(p).toMatchObject({ status: 'complete', best_of: 1, winner_id: played.entry_a_id });
		expect(s).toMatchObject({ status: 'in_progress', best_of: 1 });
		const pending = ms.filter((m) => m.status === 'pending');
		expect(pending.length).toBeGreaterThan(0);
		expect(pending.every((m) => m.best_of === 3)).toBe(true);
		expect(r.matches_restamped).toBe(pending.length);
		const log = await db.sql<{ n: string }>(
			`select count(*)::text n from public.tournament_match_events where tournament_id = $1 and metadata ->> 'change' = 'live_settings'`,
			[tid]
		);
		expect(log.rows[0].n).toBe('1');
	});

	test('scoring now governs results entered afterwards', async () => {
		const next = (await matches()).find((m) => m.status === 'pending' && m.entry_a_id && m.entry_b_id)!;
		await call(host, `public.tournament_start_match($1)`, [next.id]);
		const noScores = await refusal(
			call(host, `public.tournament_submit_match_result($1, $2::jsonb)`, [next.id, JSON.stringify({ games: [{ winner: 'a' }, { winner: 'a' }] })])
		);
		expect(noScores).not.toBeNull();
		await call(host, `public.tournament_submit_match_result($1, $2::jsonb)`, [
			next.id,
			JSON.stringify({ games: [{ score_a: 3, score_b: 1 }, { score_a: 2, score_b: 0 }] })
		]);
		const after = (await matches()).find((m) => m.id === next.id)!;
		expect(after.status).toBe('complete');
	});
});
