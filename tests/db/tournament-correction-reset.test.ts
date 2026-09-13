// tests/db/tournament-correction-reset.test.ts
//
// LEDGER 0207, FINDING 3a: A RESULT CORRECTION BECAME IMPOSSIBLE THE MOMENT A
// DOWNSTREAM MATCH STARTED, AND THE REFUSAL NAMED A REMEDY THAT DID NOT EXIST.
//
// `_tournament_check_unwindable` (0062:1909) admits only a downstream match
// that is `pending` or an auto-completed bye, and refuses everything else with
// "... Correct or reset that match first." There was no reset:
// `tournament_correct_match_result` takes only a `complete` match, so the
// downstream one could not be corrected while running, and the audit's
// enumeration of all twenty-six `tournament_*` functions found no reset,
// reopen or un-complete path anywhere. Once the next match was started, the
// previous round's result was permanent.
//
// AND ZERO TESTS CALLED THE CORRECTION PATH AT ALL. Grepped `tests/` for
// `tournament_correct_match_result` before this file: no hits. The unwind, the
// bracket-reset deletion, the `champion_entry_id = null` rollback and the
// `pending` restoration were all unexercised.
//
// This file measures both halves against the REAL RPCs on real Postgres with
// the WHOLE migration chain applied off disk, 0212 included:
//
//   A. The refusal is REAL: a correction is still blocked while a downstream
//      match is in progress. 0212 does not weaken the safety rule.
//   B. The remedy is now REACHABLE: reset the downstream match, then correct
//      the upstream one. This is the sequence a host performs in a room.
//   C. The losers bracket RE-DERIVES: the corrected loser drops down the other
//      side and the bracket walks to a champion again.
//   D. The grand final rolls back: the bracket-reset row is deleted, the
//      tournament returns to `live` and the champion is cleared.
//   E. Every reset refusal, by sentence.

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { readdirSync } from 'node:fs';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';

const MIGRATION_DIR = new URL('../../supabase/migrations', import.meta.url);
const ALL_MIGRATIONS = readdirSync(MIGRATION_DIR)
	.filter((f) => f.endsWith('.sql'))
	.sort();
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

interface Row {
	id: string;
	bracket: string;
	round: number;
	slot: number;
	status: string;
	entry_a_id: string | null;
	entry_b_id: string | null;
	winner_id: string | null;
	started_at: string | null;
	completed_at: string | null;
	forfeit: boolean;
}

let db: TestDb;
let host: SeededUser;
const players: SeededUser[] = [];

async function matchesOf(t: string): Promise<Row[]> {
	return (
		await db.sql<Row>(
			`select id, bracket, round, slot, status, entry_a_id, entry_b_id, winner_id,
			        started_at, completed_at, forfeit
			 from public.tournament_bracket_matches where tournament_id = $1
			 order by bracket, round, slot`,
			[t]
		)
	).rows;
}

async function tournamentOf(t: string) {
	return (
		await db.sql<{ status: string; champion_entry_id: string | null }>(
			`select status, champion_entry_id from public.tournaments where id = $1`,
			[t]
		)
	).rows[0];
}

async function refusal(p: Promise<unknown>): Promise<string | null> {
	try {
		await p;
		return null;
	} catch (e) {
		return (e as Error).message;
	}
}

async function fieldOf(n: number, name: string): Promise<string> {
	const t = await db.asUser(host.id, async (q) => {
		const r = await q<{ id: string }>(`select public.tournament_create($1, $2, $3::jsonb) as id`, [
			name,
			'',
			JSON.stringify({ team_size: 1 })
		]);
		return r.rows[0].id;
	});
	await db.asUser(host.id, (q) =>
		q(`select public.tournament_set_status($1, 'registration_open')`, [t])
	);
	for (let i = 0; i < n; i += 1) {
		await db.asUser(players[i].id, (q) =>
			q(`select public.tournament_register_entry($1, $2, $3, $4)`, [t, `E${i}`, '', null])
		);
	}
	await db.asUser(host.id, (q) => q(`select public.tournament_set_status($1, 'seeding')`, [t]));
	await db.asUser(host.id, (q) => q(`select public.tournament_generate_bracket($1)`, [t]));
	return t;
}

async function play(m: Row, side: 'a' | 'b') {
	await db.asUser(host.id, (q) => q(`select public.tournament_start_match($1)`, [m.id]));
	await db.asUser(host.id, (q) =>
		q(`select public.tournament_submit_match_result($1, $2::jsonb)`, [
			m.id,
			JSON.stringify({ games: [{ winner: side }] })
		])
	);
}

async function correct(matchId: string, side: 'a' | 'b', reason: string) {
	return db.asUser(host.id, async (q) => {
		const r = await q<{ out: Record<string, unknown> }>(
			`select public.tournament_correct_match_result($1, $2::jsonb, $3) as out`,
			[matchId, JSON.stringify({ games: [{ winner: side }] }), reason]
		);
		return r.rows[0].out;
	});
}

async function reset(matchId: string, reason: string) {
	return db.asUser(host.id, async (q) => {
		const r = await q<{ out: Record<string, unknown> }>(
			`select public.tournament_reset_match($1, $2) as out`,
			[matchId, reason]
		);
		return r.rows[0].out;
	});
}

async function walk(t: string, pick: (m: Row) => 'a' | 'b' = () => 'a', cap = 300) {
	for (let g = 0; g < cap; g += 1) {
		const ms = await matchesOf(t);
		const next = ms.find(
			(m) => m.status === 'pending' && m.entry_a_id !== null && m.entry_b_id !== null
		);
		if (!next) return;
		await play(next, pick(next));
	}
	throw new Error('walk did not terminate');
}

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
	host = await createUser(db, 'host@boscotech.edu', 'Host');
	for (let i = 0; i < 8; i += 1) {
		players.push(await createUser(db, `c${i}@boscotech.net`, `Player ${i}`));
	}
}, 900_000);

afterAll(async () => {
	await db?.stop();
});

test('the chain applied whole, 0212 included', () => {
	// A chain that stopped early is a green run over a schema that never
	// existed. 210 files on 2026-09-13; the floor, not the number.
	expect(ALL_MIGRATIONS.length).toBeGreaterThanOrEqual(210);
	expect(ALL_MIGRATIONS).toContain('0212_tournament_reset_and_reward_payout.sql');
});

// ---------------------------------------------------------------------------
// A + B. THE ROOM CASE: a wrong score, found after the next match has started.
// ---------------------------------------------------------------------------

describe('a wrong result is corrected mid-bracket with a downstream match already started', () => {
	let t: string;
	let w1s1: Row;
	let w2s1: Row;
	let blocked: string | null;

	beforeAll(async () => {
		t = await fieldOf(8, 'Correction mid-bracket');
		let ms = await matchesOf(t);

		// Round one, all four matches, A side winning. w1s1 is the one entered
		// WRONG -- the A side is recorded as winner when B actually won.
		for (const m of ms.filter((x) => x.bracket === 'winners' && x.round === 1)) {
			await play(m, 'a');
		}
		ms = await matchesOf(t);
		w1s1 = ms.find((m) => m.bracket === 'winners' && m.round === 1 && m.slot === 1)!;

		// The host starts the next round. THIS is the moment that used to make
		// the mistake permanent.
		w2s1 = ms.find((m) => m.bracket === 'winners' && m.round === 2 && m.slot === 1)!;
		await db.asUser(host.id, (q) => q(`select public.tournament_start_match($1)`, [w2s1.id]));

		blocked = await refusal(correct(w1s1.id, 'b', 'Scoresheet read the wrong way round.'));
	}, 900_000);

	test('the correction is REFUSED while the downstream match is in progress', () => {
		expect(blocked).not.toBe(null);
		expect(blocked).toContain('Cannot correct this result');
		expect(blocked).toContain('is already in progress');
		// The refusal names the remedy, and as of 0212 the remedy exists.
		expect(blocked).toContain('Correct or reset that match first');
	});

	test('the reset withdraws the downstream result and returns it to pending', async () => {
		const out = await reset(w2s1.id, 'Withdrawn so the round-one score can be fixed.');
		expect(out.ok).toBe(true);
		expect(out.previous_status).toBe('in_progress');
		expect(out.status).toBe('pending');

		const after = (await matchesOf(t)).find((m) => m.id === w2s1.id)!;
		expect(after.status).toBe('pending');
		expect(after.winner_id).toBe(null);
		expect(after.completed_at).toBe(null);
		// `pending` must mean pending: a stale start time is a state no other
		// path in this schema produces.
		expect(after.started_at).toBe(null);
		// Its participants are the legitimate output of the matches ABOVE it and
		// are NOT cleared by the reset itself.
		expect(after.entry_a_id).not.toBe(null);
		expect(after.entry_b_id).not.toBe(null);
	});

	test('and now the upstream correction goes through', async () => {
		const before = (await matchesOf(t)).find((m) => m.id === w1s1.id)!;
		const oldWinner = before.winner_id;
		const out = await correct(w1s1.id, 'b', 'Scoresheet read the wrong way round.');
		expect(out.previous_winner_id).toBe(oldWinner);
		expect(out.winner_id).not.toBe(oldWinner);
		expect(out.winner_id).toBe(before.entry_b_id);
	});

	test('the downstream match now holds the corrected winner, not the wrong one', async () => {
		const ms = await matchesOf(t);
		const w1 = ms.find((m) => m.id === w1s1.id)!;
		const w2 = ms.find((m) => m.id === w2s1.id)!;
		// w1s1 feeds w2s1 slot a (odd slot).
		expect(w2.entry_a_id).toBe(w1.winner_id);
		expect(w2.status).toBe('pending');
	});

	test('THE LOSERS BRACKET RE-DERIVED: the newly-losing entry dropped down', async () => {
		const ms = await matchesOf(t);
		const w1 = ms.find((m) => m.id === w1s1.id)!;
		const newLoser = w1.winner_id === w1.entry_a_id ? w1.entry_b_id : w1.entry_a_id;
		const l1s1 = ms.find((m) => m.bracket === 'losers' && m.round === 1 && m.slot === 1)!;
		// Winners r1 s1's loser goes to losers r1 s1 position a.
		expect(l1s1.entry_a_id).toBe(newLoser);
		// And the entry that was wrongly eliminated is no longer sitting there.
		const wrongLoser = w1.entry_a_id === newLoser ? w1.entry_b_id : w1.entry_a_id;
		expect(l1s1.entry_a_id).not.toBe(wrongLoser);
	});

	test('the correction is on the record with the previous winner named', async () => {
		const evts = await db.sql<{ event_type: string; metadata: Record<string, unknown> }>(
			`select event_type, metadata from public.tournament_match_events
			 where tournament_id = $1 and match_id = $2 order by id`,
			[t, w1s1.id]
		);
		const corrected = evts.rows.filter((e) => e.event_type === 'corrected');
		expect(corrected.length).toBeGreaterThanOrEqual(1);
		expect(corrected.at(-1)!.metadata.previous_winner_id).not.toBe(undefined);
		expect(corrected.at(-1)!.metadata.reason).toBe('Scoresheet read the wrong way round.');
	});

	test('the reset is on the record too, flagged as a withdrawal', async () => {
		const evts = await db.sql<{ event_type: string; metadata: Record<string, unknown> }>(
			`select event_type, metadata from public.tournament_match_events
			 where tournament_id = $1 and match_id = $2 order by id`,
			[t, w2s1.id]
		);
		const resets = evts.rows.filter((e) => e.metadata?.reset === true);
		expect(resets).toHaveLength(1);
		expect(resets[0].event_type).toBe('corrected');
		expect(resets[0].metadata.previous_status).toBe('in_progress');
	});

	test('the bracket still walks to a champion after all of that', async () => {
		await walk(t);
		const tt = await tournamentOf(t);
		expect(tt.status).toBe('complete');
		expect(tt.champion_entry_id).not.toBe(null);
		expect((await matchesOf(t)).filter((m) => m.status !== 'complete')).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// C. RESETTING A COMPLETED MATCH, and the recursive downstream rule.
// ---------------------------------------------------------------------------

describe('resetting a completed match unwinds what depended on it', () => {
	let t: string;

	beforeAll(async () => {
		t = await fieldOf(4, 'Reset completed');
		for (const m of (await matchesOf(t)).filter(
			(x) => x.bracket === 'winners' && x.round === 1
		)) {
			await play(m, 'a');
		}
	}, 900_000);

	test('a completed match with a pending downstream resets cleanly', async () => {
		const w1s1 = (await matchesOf(t)).find(
			(m) => m.bracket === 'winners' && m.round === 1 && m.slot === 1
		)!;
		const out = await reset(w1s1.id, 'Wrong match called.');
		expect(out.ok).toBe(true);
		expect(out.previous_status).toBe('complete');

		const ms = await matchesOf(t);
		const after = ms.find((m) => m.id === w1s1.id)!;
		expect(after.status).toBe('pending');
		expect(after.winner_id).toBe(null);

		// The slot it fed is emptied, both in the winners and the losers bracket.
		const w2 = ms.find((m) => m.bracket === 'winners' && m.round === 2 && m.slot === 1)!;
		expect(w2.entry_a_id).toBe(null);
		const l1 = ms.find((m) => m.bracket === 'losers' && m.round === 1 && m.slot === 1)!;
		expect(l1.entry_a_id).toBe(null);
	});

	test('its games rows are gone: the result is withdrawn, not merely hidden', async () => {
		const w1s1 = (await matchesOf(t)).find(
			(m) => m.bracket === 'winners' && m.round === 1 && m.slot === 1
		)!;
		const g = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.tournament_match_games where bracket_match_id = $1`,
			[w1s1.id]
		);
		expect(Number(g.rows[0].n)).toBe(0);
	});

	test('the match can simply be replayed, and the bracket completes', async () => {
		await walk(t);
		const tt = await tournamentOf(t);
		expect(tt.status).toBe('complete');
		expect(tt.champion_entry_id).not.toBe(null);
	});
});

// ---------------------------------------------------------------------------
// D. THE GRAND FINAL rolls back: reset row deleted, champion cleared.
// ---------------------------------------------------------------------------

describe('resetting a settled grand final returns the tournament to live', () => {
	let t: string;
	let gf: Row;

	beforeAll(async () => {
		t = await fieldOf(4, 'Grand final reset');
		// A-always-wins settles the champion at the grand final with no bracket
		// reset (the winners finalist takes it).
		await walk(t);
		gf = (await matchesOf(t)).find((m) => m.bracket === 'grand_final')!;
	}, 900_000);

	test('the fixture really did settle a champion first', async () => {
		const tt = await tournamentOf(t);
		expect(tt.status).toBe('complete');
		expect(tt.champion_entry_id).not.toBe(null);
	});

	test('the reset clears the champion and puts the tournament back to live', async () => {
		const out = await reset(gf.id, 'Final called on the wrong sheet.');
		expect(out.ok).toBe(true);
		expect(out.tournament_status).toBe('live');
		expect(out.champion_entry_id).toBe(null);
		const tt = await tournamentOf(t);
		expect(tt.status).toBe('live');
		expect(tt.champion_entry_id).toBe(null);
	});

	test('no bracket-reset row is left behind', async () => {
		const ms = await matchesOf(t);
		expect(ms.filter((m) => m.bracket === 'grand_final_reset')).toHaveLength(0);
	});

	test('replaying the final settles a champion again', async () => {
		await walk(t);
		const tt = await tournamentOf(t);
		expect(tt.status).toBe('complete');
		expect(tt.champion_entry_id).not.toBe(null);
	});
});

// ---------------------------------------------------------------------------
// E. EVERY REFUSAL, BY SENTENCE.
// ---------------------------------------------------------------------------

describe('the reset refuses what it should, and says why', () => {
	let t: string;
	let ms: Row[];

	beforeAll(async () => {
		t = await fieldOf(5, 'Reset refusals');
		ms = await matchesOf(t);
	}, 900_000);

	test('a pending match: there is nothing to withdraw', async () => {
		const pending = ms.find((m) => m.status === 'pending')!;
		const msg = await refusal(reset(pending.id, 'why'));
		expect(msg).toContain('has not been started');
	});

	test('a bye: derived from the bracket, so it re-resolves itself', async () => {
		const bye = ms.find(
			(m) => m.status === 'complete' && (m.entry_a_id === null || m.entry_b_id === null)
		)!;
		const msg = await refusal(reset(bye.id, 'why'));
		expect(msg).toContain('A bye cannot be reset');
	});

	test('no reason: refused, because the reset is logged', async () => {
		const live = ms.find((m) => m.bracket === 'winners' && m.round === 1 && m.status === 'pending')!;
		await play(live, 'a');
		for (const bad of ['', '   ', null]) {
			const msg = await refusal(reset(live.id, bad as unknown as string));
			expect(msg, `reason ${JSON.stringify(bad)}`).toContain('Give a reason for the reset');
		}
	});

	test('a reason over 200 characters is refused', async () => {
		const live = (await matchesOf(t)).find((m) => m.status === 'complete' && m.winner_id)!;
		const msg = await refusal(reset(live.id, 'x'.repeat(201)));
		expect(msg).toContain('200 characters');
	});

	test('a match that does not exist', async () => {
		const msg = await refusal(reset('00000000-0000-0000-0000-000000000000', 'why'));
		expect(msg).toContain('Match not found.');
	});

	test('a NON-HOST cannot reset, and that is the database refusing', async () => {
		const played = (await matchesOf(t)).find((m) => m.status === 'complete' && m.winner_id)!;
		const msg = await refusal(
			db.asUser(players[3].id, (q) =>
				q(`select public.tournament_reset_match($1, $2)`, [played.id, 'let me undo this'])
			)
		);
		expect(msg).not.toBe(null);
	});

	test('the downstream rule is NOT weakened: a reset refuses what a correction refuses', async () => {
		// Play a round-one match and start the round-two match it feeds, then
		// try to reset the round-one one. Same recursive check, same refusal.
		const fresh = await fieldOf(4, 'Reset downstream guard');
		for (const m of (await matchesOf(fresh)).filter(
			(x) => x.bracket === 'winners' && x.round === 1
		)) {
			await play(m, 'a');
		}
		const w2 = (await matchesOf(fresh)).find(
			(m) => m.bracket === 'winners' && m.round === 2 && m.slot === 1
		)!;
		await db.asUser(host.id, (q) => q(`select public.tournament_start_match($1)`, [w2.id]));
		const w1 = (await matchesOf(fresh)).find(
			(m) => m.bracket === 'winners' && m.round === 1 && m.slot === 1
		)!;
		const msg = await refusal(reset(w1.id, 'undo'));
		expect(msg).toContain('Cannot correct this result');
		expect(msg).toContain('is already in progress');
	});
});
