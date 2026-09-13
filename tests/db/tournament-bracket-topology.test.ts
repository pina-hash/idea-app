// tests/db/tournament-bracket-topology.test.ts
//
// LEDGER 0207, FINDING 2 OF THE 2026-09-13 DRY RUN: THE LOSERS BRACKET IS
// EXECUTED BY NOTHING.
//
// Before this file, the only real-SQL bracket walked end to end was a TWO-ENTRY
// field (`tournament-entry-members.test.ts:1089`), and
// `tournament_generate_bracket` builds a losers bracket only `if v_r >= 2`
// (`0062:1713`) -- which a 2-entry field never reaches. The one test that
// generated an ODD field asserted `statusOf === 'live'` and read no match row.
// And all eighteen browser specs drive `src/routes/dev/tournaments/sim.ts`, a
// reimplementation that says so in its own header, so a topology defect in the
// SQL leaves the harness drawing a correct bracket. Roughly 130 lines of
// pointer arithmetic -- the losers-bracket construction, the slot reversal on
// even winners rounds, and the losers-final -> grand-final-B wiring -- had
// never been executed by any test on any field large enough to contain them.
//
// WHERE THE EXPECTED VALUES COME FROM, which is the whole question a test like
// this has to answer. They are NOT read off the implementation. They are the
// arithmetic of a double-elimination bracket, derived here and stated as
// `expectedShape()`:
//
//   P = the field rounded up to a power of two, R = log2(P)
//   winners matches = P - 1          (a single-elimination tree over P slots)
//   losers matches  = P - 2          (every entry but the champion and the
//                                     grand finalist loses exactly once there)
//   grand final     = 1
//   TOTAL           = 2P - 2         (the standard double-elimination count)
//   byes            = P - N          (the empty slots in round one)
//
// Checked against the published figures for the sizes below: 4 -> 6 matches,
// 8 -> 14, 16 -> 30. A test whose expectation is `count(*)` from the function
// under test cannot fail; this one can.
//
// THE ODD FIELD IS THE ONE THAT WILL HAPPEN IN THE ROOM. 5 and 6 entries are
// covered because IDEA-Blade will not have a power of two, and the bye is
// asserted three ways: the match ROW (auto-complete, one null side, a winner),
// the EVENT (`{"bye": true}`, which is how a student is told why they did not
// play), and the REAL CLIENT PREDICATES `isByeMatch` / `eventIsBye` /
// `entryRecord` imported from `$lib/tournaments/tournaments.ts` and fed the
// REAL SQL rows -- so "the bye is visible" is proven against the code the
// surfaces actually run, not against a hand-built fixture.

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import {
	entryBracketRecord,
	eventIsBye,
	isByeMatch,
	isPlayedMatch,
	type BracketMatch,
	type MatchEvent
} from '../../src/lib/tournaments/tournaments';

const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0004_gauntlet.sql',
	'0020_profiles_identity.sql',
	'0062_tournaments.sql',
	'0063_tournament_push_rewards.sql'
] as const;

const OVER_THE_TOP = [
	'0064_tournament_entry_styles.sql',
	'0065_tournament_forfeits.sql',
	'0066_tournament_delete.sql',
	'0067_admin_tier.sql',
	'0068_tournament_delete_payout_ack.sql',
	'0137_anon_execute_sweep.sql',
	'0192_tournament_entry_members_and_admin_hosts.sql'
] as const;

/**
 * The double-elimination arithmetic, written out rather than measured. See the
 * header: this is the file's independent expectation.
 */
function expectedShape(n: number) {
	let p = 1;
	while (p < n) p *= 2;
	let r = 0;
	for (let t = p; t > 1; t /= 2) r += 1;
	return {
		p,
		r,
		winners: p - 1,
		losers: r >= 2 ? p - 2 : 0,
		grandFinal: 1,
		total: r >= 2 ? 2 * p - 2 : p, // P=2: one winners match + the grand final
		byes: p - n
	};
}

interface Row {
	id: string;
	bracket: string;
	round: number;
	slot: number;
	status: string;
	entry_a_id: string | null;
	entry_b_id: string | null;
	winner_id: string | null;
	forfeit: boolean;
	winner_to_match_id: string | null;
	winner_to_pos: string | null;
	loser_to_match_id: string | null;
	loser_to_pos: string | null;
}

async function matchesOf(d: TestDb, t: string): Promise<Row[]> {
	const r = await d.sql<Row>(
		`select id, bracket, round, slot, status, entry_a_id, entry_b_id, winner_id,
		        forfeit, winner_to_match_id, winner_to_pos, loser_to_match_id, loser_to_pos
		 from public.tournament_bracket_matches where tournament_id = $1
		 order by bracket, round, slot`,
		[t]
	);
	return r.rows;
}

interface EventRow {
	event_type: string;
	metadata: Record<string, unknown> | null;
	match_id: string | null;
}

async function eventsOf(d: TestDb, t: string): Promise<EventRow[]> {
	const r = await d.sql<EventRow>(
		`select event_type, metadata, match_id
		 from public.tournament_match_events where tournament_id = $1 order by id`,
		[t]
	);
	return r.rows;
}

/** The shape the client components take. The SQL row IS this shape. */
function asBracketMatch(m: Row): BracketMatch {
	return m as unknown as BracketMatch;
}

async function statusOf(d: TestDb, id: string) {
	const r = await d.sql<{ status: string; champion_entry_id: string | null }>(
		`select status, champion_entry_id from public.tournaments where id = $1`,
		[id]
	);
	return r.rows[0];
}

let db: TestDb;
let host: SeededUser;
let players: SeededUser[] = [];

beforeAll(async () => {
	db = await startTestDb([...CHAIN]);
	await db.sql(`create publication supabase_realtime`);
	for (const f of OVER_THE_TOP) {
		await db.sql(readFileSync(`supabase/migrations/${f}`, 'utf8'));
	}
	host = await createUser(db, 'host@boscotech.edu', 'Host');
	for (let i = 0; i < 16; i += 1) {
		players.push(await createUser(db, `p${i}@boscotech.net`, `Player ${i}`));
	}
}, 600_000);

afterAll(async () => {
	await db?.stop();
});

/** Registers `n` entries and generates the bracket. Returns the tournament id. */
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

/**
 * Plays the whole bracket to a champion through the REAL RPCs, always awarding
 * the A side, and returns how many matches were contested. Bounded so a wiring
 * defect that leaves a match unreachable fails as a loop cap rather than
 * hanging the suite.
 */
async function walkToChampion(
	t: string,
	pick: (m: Row) => 'a' | 'b' = () => 'a',
	cap = 300
): Promise<number> {
	let played = 0;
	for (let guard = 0; guard < cap; guard += 1) {
		const ms = await matchesOf(db, t);
		const next = ms.find(
			(m) => m.status === 'pending' && m.entry_a_id !== null && m.entry_b_id !== null
		);
		if (!next) return played;
		await db.asUser(host.id, (q) => q(`select public.tournament_start_match($1)`, [next.id]));
		await db.asUser(host.id, (q) =>
			q(`select public.tournament_submit_match_result($1, $2::jsonb)`, [
				next.id,
				JSON.stringify({ games: [{ winner: pick(next) }] })
			])
		);
		played += 1;
	}
	throw new Error(`walkToChampion exceeded ${cap} matches: the bracket does not terminate`);
}

/** Every completed two-sided pairing, in the order it was played. */
async function rematchesOf(t: string): Promise<string[]> {
	const r = await db.sql<{ bracket: string; round: number; slot: number; a: string; b: string }>(
		`select bracket, round, slot, entry_a_id as a, entry_b_id as b
		 from public.tournament_bracket_matches
		 where tournament_id = $1 and entry_a_id is not null and entry_b_id is not null
		 order by completed_at`,
		[t]
	);
	const seen = new Set<string>();
	const out: string[] = [];
	for (const m of r.rows) {
		const pair = [m.a, m.b].sort().join('|');
		if (seen.has(pair)) out.push(`${m.bracket} r${m.round}s${m.slot}`);
		seen.add(pair);
	}
	return out;
}

// ---------------------------------------------------------------------------
// A. TOPOLOGY, at every field size that actually occurs.
// ---------------------------------------------------------------------------

describe.each([4, 5, 6, 8, 16])('a field of %i, generated by the real RPC', (n) => {
	const want = expectedShape(n);
	let t: string;
	let ms: Row[];

	beforeAll(async () => {
		t = await fieldOf(n, `Field ${n}`);
		ms = await matchesOf(db, t);
	}, 600_000);

	test(`builds ${want.winners} winners, ${want.losers} losers and 1 grand final`, () => {
		const by = (b: string) => ms.filter((m) => m.bracket === b).length;
		expect(by('winners')).toBe(want.winners);
		expect(by('losers')).toBe(want.losers);
		expect(by('grand_final')).toBe(want.grandFinal);
		// No reset exists until the losers finalist takes game one of the final.
		expect(by('grand_final_reset')).toBe(0);
		expect(ms).toHaveLength(want.total);
	});

	test('every winners round has exactly P >> round matches', () => {
		for (let round = 1; round <= want.r; round += 1) {
			expect(
				ms.filter((m) => m.bracket === 'winners' && m.round === round).length,
				`winners round ${round}`
			).toBe(want.p >> round);
		}
	});

	test('the losers bracket has two rounds per winners drop, each P >> (k+1) wide', () => {
		for (let k = 1; k <= want.r - 1; k += 1) {
			for (const round of [2 * k - 1, 2 * k]) {
				expect(
					ms.filter((m) => m.bracket === 'losers' && m.round === round).length,
					`losers round ${round}`
				).toBe(want.p >> (k + 1));
			}
		}
	});

	test('every advancement pointer resolves to a real match in this tournament', () => {
		const ids = new Set(ms.map((m) => m.id));
		for (const m of ms) {
			if (m.winner_to_match_id) {
				expect(ids.has(m.winner_to_match_id), `${m.bracket} r${m.round}s${m.slot} winner_to`).toBe(
					true
				);
				expect(['a', 'b']).toContain(m.winner_to_pos);
			}
			if (m.loser_to_match_id) {
				expect(ids.has(m.loser_to_match_id), `${m.bracket} r${m.round}s${m.slot} loser_to`).toBe(
					true
				);
				expect(['a', 'b']).toContain(m.loser_to_pos);
			}
		}
	});

	test('no two matches feed the same slot of the same match', () => {
		// The defect this catches is the one nothing could see: a slot-reversal
		// or pointer bug that aims two feeders at one side silently overwrites
		// a participant, and the bracket still draws.
		const seen = new Map<string, string>();
		for (const m of ms) {
			for (const [target, pos, kind] of [
				[m.winner_to_match_id, m.winner_to_pos, 'winner'],
				[m.loser_to_match_id, m.loser_to_pos, 'loser']
			] as const) {
				if (!target) continue;
				const key = `${target}:${pos}`;
				expect(
					seen.has(key),
					`${kind} of ${m.bracket} r${m.round}s${m.slot} collides with ${seen.get(key)}`
				).toBe(false);
				seen.set(key, `${m.bracket} r${m.round}s${m.slot}`);
			}
		}
	});

	test('every match but the grand final has somewhere for its winner to go', () => {
		for (const m of ms) {
			if (m.bracket === 'grand_final' || m.bracket === 'grand_final_reset') continue;
			expect(m.winner_to_match_id, `${m.bracket} r${m.round}s${m.slot} has no winner_to`).not.toBe(
				null
			);
		}
	});

	test('the losers final feeds the grand final B side, and only it does', () => {
		if (want.r < 2) return;
		const gf = ms.find((m) => m.bracket === 'grand_final')!;
		const intoB = ms.filter((m) => m.winner_to_match_id === gf.id && m.winner_to_pos === 'b');
		const intoA = ms.filter((m) => m.winner_to_match_id === gf.id && m.winner_to_pos === 'a');
		expect(intoB).toHaveLength(1);
		expect(intoB[0].bracket).toBe('losers');
		// The last losers round: 2(R-1).
		expect(intoB[0].round).toBe(2 * (want.r - 1));
		expect(intoA).toHaveLength(1);
		expect(intoA[0].bracket).toBe('winners');
		expect(intoA[0].round).toBe(want.r);
	});

	test('a losers-bracket loser is eliminated: no loser pointer anywhere in it', () => {
		for (const m of ms.filter((x) => x.bracket === 'losers')) {
			expect(m.loser_to_match_id, `losers r${m.round}s${m.slot} must eliminate`).toBe(null);
		}
	});

	test(`resolves exactly ${want.byes} bye${want.byes === 1 ? '' : 's'} in round one`, async () => {
		// A BYE AND A DEAD MATCH ARE BOTH AUTO-COMPLETED AND ARE NOT THE SAME
		// THING, and conflating them is what this assertion got wrong first.
		// `isByeMatch` is true of any complete match with a null side, which
		// covers both. The discriminator is the WINNER: a bye advances somebody
		// (winner set, one side present), a dead match advances nobody (winner
		// null, BOTH sides null) and exists because a round-one bye sends no
		// loser down. Measured at N=5: three winners byes plus one dead losers
		// match, which is `_tournament_resolve_byes` behaving exactly as its own
		// comment describes.
		const auto = ms.filter((m) => isByeMatch(asBracketMatch(m)));
		const byes = auto.filter((m) => m.winner_id !== null);
		const dead = auto.filter((m) => m.winner_id === null);

		// The bye count is P - N: the empty slots in round one, and nothing else.
		expect(byes).toHaveLength(want.byes);
		for (const b of byes) {
			const present = b.entry_a_id ?? b.entry_b_id;
			expect(present).not.toBe(null);
			expect(b.winner_id).toBe(present);
			expect(b.bracket).toBe('winners');
			expect(b.round).toBe(1);
			expect(b.forfeit).toBe(false);
		}

		// A DEAD MATCH MAY NEVER HOLD A PARTICIPANT. That is the assertion that
		// matters here: a dead-completion over a slot that had somebody in it
		// would silently eliminate a student who never played.
		for (const d of dead) {
			expect(d.entry_a_id, `dead ${d.bracket} r${d.round}s${d.slot} holds an entry`).toBe(null);
			expect(d.entry_b_id, `dead ${d.bracket} r${d.round}s${d.slot} holds an entry`).toBe(null);
			expect(d.bracket).toBe('losers');
		}

		// Every entry is either playing or has been advanced. Nobody vanishes.
		const seeded = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.tournament_entries where tournament_id = $1`,
			[t]
		);
		expect(Number(seeded.rows[0].n)).toBe(n);

		if (want.byes > 0) {
			// The bye is TOLD to the student, not merely implied by a null slot:
			// `eventIsBye` is the real predicate MatchTimeline renders from.
			const evts = await eventsOf(db, t);
			const byeEvents = evts.filter((e) => eventIsBye(e as unknown as MatchEvent));
			expect(byeEvents.filter((e) => byes.some((b) => b.id === e.match_id))).toHaveLength(
				want.byes
			);
		}
	});
});

// ---------------------------------------------------------------------------
// B. THE ODD FIELD, WALKED. This is the room case.
// ---------------------------------------------------------------------------

describe('a 5-entry field is walked from generation to a champion', () => {
	let t: string;

	beforeAll(async () => {
		t = await fieldOf(5, 'Odd field walked');
		await walkToChampion(t);
	}, 600_000);

	test('the tournament completes and names a champion', async () => {
		const s = await statusOf(db, t);
		expect(s.status).toBe('complete');
		expect(s.champion_entry_id).not.toBe(null);
	});

	test('every match is complete, none left pending or in progress', async () => {
		const ms = await matchesOf(db, t);
		expect(ms.filter((m) => m.status !== 'complete')).toHaveLength(0);
	});

	test('the LOSERS bracket was genuinely contested, not resolved away by byes', async () => {
		// The positive control for the whole file: a losers bracket that only
		// ever auto-completed would satisfy every count above and prove nothing
		// about the pointer arithmetic.
		const ms = await matchesOf(db, t);
		const losers = ms.filter((m) => m.bracket === 'losers');
		const contested = losers.filter((m) => isPlayedMatch(asBracketMatch(m)));
		expect(losers.length).toBeGreaterThan(0);
		expect(contested.length).toBeGreaterThan(0);
	});

	test('the entry that sat out round one reads a bye on its own record', async () => {
		const ms = await matchesOf(db, t);
		const bye = ms.find((m) => isByeMatch(asBracketMatch(m)))!;
		const who = bye.entry_a_id ?? bye.entry_b_id!;
		// entryBracketRecord is the REAL helper EntryDetail renders from.
		const rec = entryBracketRecord(who as string, ms.map(asBracketMatch));
		expect(rec.byes).toBeGreaterThanOrEqual(1);
	});
});

// ---------------------------------------------------------------------------
// C. EIGHT AND SIXTEEN, WALKED. The sizes with a deep losers bracket.
// ---------------------------------------------------------------------------

describe.each([8, 16])('a field of %i is walked to a champion', (n) => {
	let t: string;
	let played = 0;

	beforeAll(async () => {
		t = await fieldOf(n, `Walked ${n}`);
		played = await walkToChampion(t);
	}, 600_000);

	test('completes with a champion and no unfinished match', async () => {
		const s = await statusOf(db, t);
		expect(s.status).toBe('complete');
		expect(s.champion_entry_id).not.toBe(null);
		const ms = await matchesOf(db, t);
		expect(ms.filter((m) => m.status !== 'complete')).toHaveLength(0);
	});

	test('a power-of-two field has no byes, so every match was contested', async () => {
		const want = expectedShape(n);
		expect(want.byes).toBe(0);
		// Every match played, plus possibly a reset. A field with no byes has
		// nothing auto-completed, so the walk had to reach all of them.
		expect(played).toBeGreaterThanOrEqual(want.total);
	});

	test('nobody meets the same opponent twice before the grand final', async () => {
		// A double-elimination bracket forces EXACTLY ONE rematch, the grand
		// final, because the winners finalist necessarily beat whoever comes up
		// the losers side. Under this walk every other pairing is fresh.
		expect(await rematchesOf(t)).toEqual(['grand_final r1s1']);
	});

	test('the losers bracket ran every one of its rounds', async () => {
		const ms = await matchesOf(db, t);
		const want = expectedShape(n);
		for (let round = 1; round <= 2 * (want.r - 1); round += 1) {
			const inRound = ms.filter((m) => m.bracket === 'losers' && m.round === round);
			expect(inRound.length, `losers round ${round} exists`).toBeGreaterThan(0);
			expect(
				inRound.every((m) => m.status === 'complete'),
				`losers round ${round} all complete`
			).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// D. THE EVEN-ROUND SLOT REVERSAL. The one property the counts cannot see.
// ---------------------------------------------------------------------------

describe.each([8, 16])(
	'a field of %i where the winners bracket upsets: the slot reversal delays rematches',
	(n) => {
		let t: string;

		beforeAll(async () => {
			t = await fieldOf(n, `Upset ${n}`);
			// THE WALK IS THE INSTRUMENT HERE. Under "the A side always wins" the
			// reversal makes no observable difference -- measured: 0 rematches
			// either way -- because the entry dropping out of winners round 2 has
			// never played anyone in the losers half it lands in. The case the
			// reversal exists for needs an UPSET: the B side taking a winners
			// match from round 2 on sends a loser down who has already beaten the
			// entry waiting there.
			await walkToChampion(t, (m) => (m.bracket === 'winners' && m.round >= 2 ? 'b' : 'a'));
		}, 600_000);

		test('no pairing in the whole bracket repeats', async () => {
			// `0062:1766`: "Slot order reverses on even winners rounds to delay
			// rematches." Deleting that one `case` expression leaves EVERY count,
			// pointer, round-width and completion assertion in this file green --
			// the bracket is still structurally valid, it just starts pairing
			// people who have already played. Measured with the reversal removed:
			// 2 rematches at N=8 and 4 at N=16, all of them in losers round 2.
			expect(await rematchesOf(t)).toEqual([]);
		});

		test('still completes with a champion under an upset walk', async () => {
			const s = await statusOf(db, t);
			expect(s.status).toBe('complete');
			expect(s.champion_entry_id).not.toBe(null);
			const ms = await matchesOf(db, t);
			expect(ms.filter((m) => m.status !== 'complete')).toHaveLength(0);
		});
	}
);
