// tests/db/gauntlet-board-0295.test.ts
//
// 0295, ledger 0433 items 12 and 13, on the FULL chain read off disk.
//
// ITEM 12: report 59687b79 said the GAUNTLET board showed no scores "as if runs
// were reset". The cause is measured here first, on the chain SHORT of 0295:
// every signed-in read of `gauntlet_leaderboard` raises "permission denied for
// function _idea_test_user_ids" (0289 called a helper 0288 revoked), and the
// stored submissions are all still there. Then 0295 goes over the top, twice,
// and the same seeded runs come back with the rules unchanged:
//
//   PRESENT  a ranked macro run (with its rank), a held sub-floor run (no rank,
//            pending_verification), a correct drawing-reading answer, and a test
//            account's own run TO ITSELF.
//   ABSENT   a failed run, a manual speedrun entry, a run on an unpublished
//            challenge, and the test account's run to anybody else.
//
// ITEM 13: a host-made team carries a no-account registrant named for the team.
// Its own members could not remove it. Now any signed-in member may remove a
// NO-ACCOUNT row on their own entry; a member still cannot remove another
// member's account, an outsider still cannot remove anything, and adding a
// teammate named exactly the team's name is refused.
//
// The mutation proofs for both live in `MUTATIONS` below and are run by hand
// (see docs/history/0433-gauntlet-tournament-teams.md): each permissive edit
// of a copy of 0295 must redden the named assertion.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

const DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const FILE = '0295_gauntlet_board_and_tournament_registrants.sql';
const ALL = readdirSync(DIR)
	.filter((f) => /^\d{4}_.*\.sql$/.test(f))
	.sort();
const SHORT_OF = ALL.filter((f) => f < FILE);
const FIXTURE = '../../tests/db/full-chain-fixture-completion.sql';

/**
 * A permissive copy of 0295 can be swapped in by setting GAUNTLET_0295_SQL to
 * a path; the default is the real file. This is how the mutation proof runs
 * without touching the file on disk.
 */
const SQL = readFileSync(process.env.GAUNTLET_0295_SQL ?? join(DIR, FILE), 'utf8');

async function refusal(p: Promise<unknown>): Promise<string | null> {
	try {
		await p;
		return null;
	} catch (error) {
		return (error as Error).message;
	}
}

type BoardRow = { user_id: string; rank: number | null; rank_state: string; challenge_id: string };

let db: TestDb;
let admin: SeededUser;
let ranked: SeededUser;
let held: SeededUser;
let failed: SeededUser;
let manual: SeededUser;
let reader: SeededUser;
let tester: SeededUser;
let speedrun: string;
let drawing: string;
let draft: string;
let preError: string | null;

async function challenge(mode: string, title: string, published = true): Promise<string> {
	const r = await db.sql<{ id: string }>(
		`insert into public.challenges (mode, title, difficulty, prompt, answer, status)
		 values ($1, $2, 1, '{}'::jsonb, '{}'::jsonb, $3) returning id`,
		[mode, title, published ? 'published' : 'draft']
	);
	return r.rows[0].id;
}

async function run(
	user: SeededUser,
	challengeId: string,
	mode: string,
	opts: { correct: boolean; source: string; elapsedMs?: number; metric: number }
) {
	await db.sql(
		`insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric, source)
		 values ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
		[
			user.id,
			challengeId,
			mode,
			JSON.stringify(opts.elapsedMs === undefined ? {} : { elapsed_ms: opts.elapsedMs }),
			opts.correct,
			opts.metric,
			opts.source
		]
	);
}

async function board(as: SeededUser): Promise<BoardRow[]> {
	return db.asUser(as.id, async (q) => {
		const r = await q<BoardRow>(
			`select user_id, rank::int as rank, rank_state, challenge_id from public.gauntlet_leaderboard order by challenge_id, rank nulls last`
		);
		return r.rows;
	});
}

beforeAll(async () => {
	db = await startTestDb([FIXTURE, ...SHORT_OF]);
	admin = await createUser(db, 'apina@boscotech.edu', 'Owner');
	ranked = await createUser(db, 'ranked@boscotech.net', 'Ranked Runner');
	held = await createUser(db, 'held@boscotech.net', 'Held Runner');
	failed = await createUser(db, 'failed@boscotech.net', 'Failed Runner');
	manual = await createUser(db, 'manual@boscotech.net', 'Manual Runner');
	reader = await createUser(db, 'reader@boscotech.net', 'Reader');
	tester = await createUser(db, 'probe@test.ideabosco.com', 'Test Account');
	await db.sql(
		`insert into public.test_accounts (email, user_id, label, created_by) values ($1, $2, 'probe', 'apina@boscotech.edu')`,
		[tester.email, tester.id]
	);

	speedrun = await challenge('speedrun', 'Board part');
	drawing = await challenge('drawing_reading', 'Board drawing');
	draft = await challenge('speedrun', 'Draft part', false);

	await run(ranked, speedrun, 'speedrun', { correct: true, source: 'macro', elapsedMs: 61000, metric: 61 });
	await run(held, speedrun, 'speedrun', { correct: true, source: 'macro', elapsedMs: 4000, metric: 4 });
	await run(failed, speedrun, 'speedrun', { correct: false, source: 'macro', elapsedMs: 90000, metric: 90 });
	await run(manual, speedrun, 'speedrun', { correct: true, source: 'manual', elapsedMs: 70000, metric: 70 });
	await run(ranked, draft, 'speedrun', { correct: true, source: 'macro', elapsedMs: 50000, metric: 50 });
	await run(reader, drawing, 'drawing_reading', { correct: true, source: 'manual', metric: 1 });
	await run(tester, speedrun, 'speedrun', { correct: true, source: 'macro', elapsedMs: 40000, metric: 40 });

	// THE CAUSE, measured on the chain production runs today.
	preError = await refusal(board(reader));

	await db.sql(SQL);
	await db.sql(SQL);
}, 900_000);

afterAll(async () => {
	await db?.stop();
});

describe('0295: the GAUNTLET board reads again (item 12)', () => {
	it('before 0295 every signed-in board read was refused, and no run was deleted', async () => {
		expect(preError).toBe('permission denied for function _idea_test_user_ids');
		const r = await db.sql<{ n: number }>(`select count(*)::int as n from public.submissions`);
		expect(r.rows[0].n).toBe(7);
	});

	it('shows the ranked run with its seat and the held run with none', async () => {
		const rows = (await board(reader)).filter((r) => r.challenge_id === speedrun);
		const byUser = new Map(rows.map((r) => [r.user_id, r]));
		expect(byUser.get(ranked.id)).toMatchObject({ rank: 1, rank_state: 'ranked' });
		expect(byUser.get(held.id)).toMatchObject({ rank: null, rank_state: 'pending_verification' });
		expect(rows.length).toBe(2);
	});

	it('leaves off a failed run, a manual speedrun entry and an unpublished part', async () => {
		const rows = await board(reader);
		expect(rows.some((r) => r.user_id === failed.id)).toBe(false);
		expect(rows.some((r) => r.user_id === manual.id)).toBe(false);
		expect(rows.some((r) => r.challenge_id === draft)).toBe(false);
		expect(rows.filter((r) => r.challenge_id === drawing).map((r) => r.user_id)).toEqual([reader.id]);
	});

	it('hides a test account from everyone but itself', async () => {
		expect((await board(reader)).some((r) => r.user_id === tester.id)).toBe(false);
		expect((await board(ranked)).some((r) => r.user_id === tester.id)).toBe(false);
		const own = (await board(tester)).filter((r) => r.user_id === tester.id);
		expect(own).toHaveLength(1);
		expect(own[0]).toMatchObject({ challenge_id: speedrun, rank_state: 'ranked' });
	});

	it('does not let a student list test accounts', async () => {
		const r = await db.asUser(reader.id, (q) =>
			q<{ hidden: boolean }>(`select public.idea_hidden_test_user($1) as hidden`, [tester.id])
		);
		expect(r.rows[0].hidden).toBe(true);
		expect(await refusal(db.asUser(reader.id, (q) => q(`select * from public._idea_test_user_ids()`)))).toBe(
			'permission denied for function _idea_test_user_ids'
		);
		expect(
			await refusal(db.asAnon((q) => q(`select public.idea_hidden_test_user($1)`, [tester.id])))
		).toBe('permission denied for function idea_hidden_test_user');
	});
});

describe('0295: a stray teammate can be removed (item 13)', () => {
	let host: SeededUser;
	let alice: SeededUser;
	let bob: SeededUser;
	let outsider: SeededUser;
	let tournament: string;
	let entry: string;
	let otherEntry: string;

	const memberRows = async (entryId: string) =>
		(
			await db.sql<{ id: string; name: string; user_id: string | null }>(
				`select id, name, user_id from public.tournament_entry_members where entry_id = $1 order by created_at, id`,
				[entryId]
			)
		).rows;

	beforeAll(async () => {
		host = admin;
		alice = await createUser(db, 'alice@boscotech.net', 'Alice A');
		bob = await createUser(db, 'bob@boscotech.net', 'Bob B');
		outsider = await createUser(db, 'outsider@boscotech.net', 'Out Sider');
		tournament = await db.asUser(host.id, async (q) => {
			const r = await q<{ id: string }>(`select public.tournament_create('Blade cup', '', $1::jsonb) as id`, [
				JSON.stringify({ team_size: 4 })
			]);
			return r.rows[0].id;
		});
		await db.asUser(host.id, (q) => q(`select public.tournament_set_status($1, 'registration_open')`, [tournament]));
		// The host-made team, exactly as the report's: an unlinked entry whose
		// first registrant is a no-account row named for the team.
		entry = await db.asUser(host.id, async (q) => {
			const r = await q<{ id: string }>(
				`select public.tournament_host_add_entry($1, 'Team 3', '', null, null) as id`,
				[tournament]
			);
			return r.rows[0].id;
		});
		otherEntry = await db.asUser(host.id, async (q) => {
			const r = await q<{ id: string }>(
				`select public.tournament_host_add_entry($1, 'Team 4', '', null, null) as id`,
				[tournament]
			);
			return r.rows[0].id;
		});
		await db.asUser(alice.id, (q) => q(`select public.tournament_join_entry($1, 'Alice')`, [entry]));
		await db.asUser(bob.id, (q) => q(`select public.tournament_join_entry($1, 'Bob')`, [entry]));
		await db.asUser(outsider.id, (q) => q(`select public.tournament_join_entry($1, 'Out')`, [otherEntry]));
	});

	it('refuses a teammate named the team, in any case, and says how to rename', async () => {
		const msg = await refusal(
			db.asUser(alice.id, (q) => q(`select public.tournament_add_entry_member($1, ' team 3 ', null)`, [entry]))
		);
		expect(msg).toBe("That is the team's name, not a teammate. To change the team name, use Rename team.");
		expect((await memberRows(entry)).map((m) => m.name)).toEqual(['Team 3', 'Alice', 'Bob']);
	});

	it('lets an outsider remove nothing on another team', async () => {
		const stray = (await memberRows(entry)).find((m) => m.user_id === null)!;
		const msg = await refusal(
			db.asUser(outsider.id, (q) => q(`select public.tournament_remove_entry_member($1)`, [stray.id]))
		);
		expect(msg).toMatch(/^Only that registrant/);
		expect(await memberRows(entry)).toHaveLength(3);
	});

	it("does not let a member remove another member's account", async () => {
		const bobRow = (await memberRows(entry)).find((m) => m.user_id === bob.id)!;
		const msg = await refusal(
			db.asUser(alice.id, (q) => q(`select public.tournament_remove_entry_member($1)`, [bobRow.id]))
		);
		expect(msg).toMatch(/^Only that registrant/);
		expect(await memberRows(entry)).toHaveLength(3);
	});

	it('lets a member remove the no-account row on their own team', async () => {
		const stray = (await memberRows(entry)).find((m) => m.user_id === null)!;
		await db.asUser(alice.id, (q) => q(`select public.tournament_remove_entry_member($1)`, [stray.id]));
		const left = await memberRows(entry);
		expect(left.map((m) => m.user_id)).toEqual([alice.id, bob.id]);
	});

	it('lets an admin remove a no-account row', async () => {
		const stray = (await memberRows(otherEntry)).find((m) => m.user_id === null)!;
		await db.asUser(admin.id, (q) => q(`select public.tournament_remove_entry_member($1)`, [stray.id]));
		expect((await memberRows(otherEntry)).map((m) => m.user_id)).toEqual([outsider.id]);
	});
});
