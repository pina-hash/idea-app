// tests/db/tournament-bracket-reward-payout.test.ts
//
// LEDGER 0207, FINDING 6a: THE REWARDS PANEL PROMISED COINS THE ENGINE NEVER
// PAID. Mr. Pina's answer, 2026-09-13: MAKE IT PAY.
//
// Before 0212, `tournament_reward_ledger` reached `coin_transactions` NOWHERE
// (swept repo-wide by the audit: written by `_tournament_award` alone, read
// only by five tournament surfaces). A student read "Payout history: +60" in
// gold while their IDEA Coin balance had not moved and would not until an admin
// logged `competition_winnings` by hand.
//
// This measures the wiring against the REAL RPCs on real Postgres with the
// WHOLE chain applied off disk. FOUR STANDING RULES ARE PROVEN, not assumed --
// each one has its own section and each is the kind of thing that fails
// silently:
//
//   1. A NEGATIVE BALANCE NEVER WITHHOLDS WINNINGS (section C). The debt
//      lockout is `kind = 'purchase'` only. A winner in debt is paid in full
//      and their balance moves by exactly the award.
//   2. ENTERING STILL CANNOT COST COINS (section D). Three independent layers,
//      each asserted, plus the structural one 0212 adds: because
//      `amount >= 1`, the signed value handed to `_coin_insert` is positive by
//      construction, so a reward can only ever be a CREDIT.
//   3. VALIDATE BEFORE YOU WRITE (section E). A retired category writes NO coin
//      row -- and, just as important, does not raise: a coin problem may never
//      strand a bracket.
//   4. NOTHING PAYS TWICE (section F). `coin_transaction_id` is UNIQUE.

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
}

interface Ledger {
	id: number;
	entry_id: string;
	user_id: string | null;
	member_id: string | null;
	amount: number;
	reason: string;
	match_id: string | null;
	coin_transaction_id: string | null;
}

interface Coin {
	id: string;
	student_email: string;
	category_id: string;
	amount: number;
	medium: string;
	note: string | null;
	actor_email: string;
	meta: Record<string, unknown>;
}

let db: TestDb;
let host: SeededUser;

/**
 * A FRESH SET OF STUDENTS PER SECTION, and this is not tidiness.
 * `coin_transactions` is keyed on the EMAIL and accumulates for the life of the
 * database, so a student reused across two tournaments carries the first one's
 * winnings into the second one's balance assertion -- which is exactly how the
 * debt section first read a balance of 60 where it expected -30, and passed its
 * "they were paid" assertion for the wrong reason. Every section that asserts a
 * BALANCE owns its own students.
 */
async function pool(prefix: string, n: number): Promise<SeededUser[]> {
	const out: SeededUser[] = [];
	for (let i = 0; i < n; i += 1) {
		out.push(await createUser(db, `${prefix}${i}@boscotech.net`, `${prefix} ${i}`));
	}
	return out;
}

async function matchesOf(t: string): Promise<Row[]> {
	return (
		await db.sql<Row>(
			`select id, bracket, round, slot, status, entry_a_id, entry_b_id, winner_id
			 from public.tournament_bracket_matches where tournament_id = $1
			 order by bracket, round, slot`,
			[t]
		)
	).rows;
}

async function ledgerOf(t: string): Promise<Ledger[]> {
	return (
		await db.sql<Ledger>(
			`select id, entry_id, user_id, member_id, amount, reason, match_id, coin_transaction_id
			 from public.tournament_reward_ledger where tournament_id = $1 order by id`,
			[t]
		)
	).rows;
}

async function coinsFor(email: string): Promise<Coin[]> {
	return (
		await db.sql<Coin>(
			`select id, student_email, category_id, amount, medium, note, actor_email, meta
			 from public.coin_transactions where student_email = $1 order by created_at, id`,
			[email]
		)
	).rows;
}

async function balanceOf(email: string): Promise<number> {
	const r = await db.sql<{ b: string }>(
		`select coalesce(sum(amount), 0)::text as b from public.coin_transactions where student_email = $1`,
		[email]
	);
	return Number(r.rows[0].b);
}

async function refusal(p: Promise<unknown>): Promise<string | null> {
	try {
		await p;
		return null;
	} catch (e) {
		return (e as Error).message;
	}
}

/** A tournament with a win rule and placement rules, seeded and generated. */
async function fieldOf(
	who: SeededUser[],
	name: string,
	rules: Array<{ trigger_type: string; trigger_value: number | null; amount: number }>,
	teamSize = 1
): Promise<string> {
	const n = who.length;
	const t = await db.asUser(host.id, async (q) => {
		const r = await q<{ id: string }>(`select public.tournament_create($1, $2, $3::jsonb) as id`, [
			name,
			'',
			JSON.stringify({ team_size: teamSize })
		]);
		return r.rows[0].id;
	});
	await db.asUser(host.id, (q) =>
		q(`select public.tournament_set_reward_rules($1, $2::jsonb)`, [t, JSON.stringify(rules)])
	);
	await db.asUser(host.id, (q) =>
		q(`select public.tournament_set_status($1, 'registration_open')`, [t])
	);
	for (let i = 0; i < n; i += 1) {
		await db.asUser(who[i].id, (q) =>
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

async function walk(t: string, cap = 200) {
	for (let g = 0; g < cap; g += 1) {
		const next = (await matchesOf(t)).find(
			(m) => m.status === 'pending' && m.entry_a_id !== null && m.entry_b_id !== null
		);
		if (!next) return;
		await play(next, 'a');
	}
	throw new Error('walk did not terminate');
}

beforeAll(async () => {
	db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);
	host = await createUser(db, 'rhost@boscotech.edu', 'Reward Host');
}, 900_000);

afterAll(async () => {
	await db?.stop();
});

test('the chain applied whole, 0212 included', () => {
	expect(ALL_MIGRATIONS.length).toBeGreaterThanOrEqual(210);
	expect(ALL_MIGRATIONS).toContain('0212_tournament_reset_and_reward_payout.sql');
});

// ---------------------------------------------------------------------------
// A. THE WIRING ITSELF.
// ---------------------------------------------------------------------------

describe('a contested win reaches the winner IDEA Coin balance', () => {
	let t: string;
	let winner: SeededUser;
	let who: SeededUser[];

	beforeAll(async () => {
		who = await pool('basic', 4);
		winner = who[0];
		t = await fieldOf(who, 'Payout basic', [
			{ trigger_type: 'win', trigger_value: null, amount: 10 },
			{ trigger_type: 'placement', trigger_value: 1, amount: 50 }
		]);
		const w1s1 = (await matchesOf(t)).find(
			(m) => m.bracket === 'winners' && m.round === 1 && m.slot === 1
		)!;
		// The A side of winners r1 s1 is the top seed, which is the first
		// registrant. Assert that rather than assume it.
		const e = await db.sql<{ user_id: string }>(
			`select user_id from public.tournament_entries where id = $1`,
			[w1s1.entry_a_id]
		);
		expect(e.rows[0].user_id).toBe(winner.id);
		await play(w1s1, 'a');
	}, 900_000);

	test('a reward row was written and it is LINKED to a coin transaction', async () => {
		const rows = await ledgerOf(t);
		expect(rows).toHaveLength(1);
		expect(rows[0].amount).toBe(10);
		expect(rows[0].reason).toBe('match win');
		expect(rows[0].coin_transaction_id).not.toBe(null);
	});

	test('the coin row is a POSITIVE competition_winnings credit on the digital balance', async () => {
		const coins = await coinsFor(winner.email);
		expect(coins).toHaveLength(1);
		expect(coins[0].category_id).toBe('competition_winnings');
		expect(coins[0].amount).toBe(10);
		// An award can only ever credit. A negative here is the whole feature
		// inverted, and `amount >= 1` on the rule makes it structurally impossible.
		expect(coins[0].amount).toBeGreaterThan(0);
		expect(coins[0].medium).toBe('digital');
	});

	test('the actor is the HOST who awarded it, never the student', async () => {
		const coins = await coinsFor(winner.email);
		expect(coins[0].actor_email).toBe(host.email);
	});

	test('the coin row back-references the reward that minted it', async () => {
		const rows = await ledgerOf(t);
		const coins = await coinsFor(winner.email);
		expect(coins[0].id).toBe(rows[0].coin_transaction_id);
		// `id` is a bigint, which pg hands back as a STRING; inside jsonb it is a
		// NUMBER. Compare the values, not the spellings.
		expect(Number(coins[0].meta.reward_id)).toBe(Number(rows[0].id));
		expect(coins[0].meta.tournament_id).toBe(t);
	});

	test('the balance actually moved', async () => {
		expect(await balanceOf(winner.email)).toBe(10);
	});

	test('the note names the tournament, so a student can tell where it came from', async () => {
		const coins = await coinsFor(winner.email);
		expect(coins[0].note).toContain('Payout basic');
		expect(coins[0].note).toContain('match win');
	});

	test('a bye and a losing side pay nothing', async () => {
		// Only one match has been played; three of the four entries hold nothing.
		for (const p of [who[1], who[2], who[3]]) {
			expect(await coinsFor(p.email)).toHaveLength(0);
		}
	});
});

// ---------------------------------------------------------------------------
// B. PLACEMENTS, and the whole run end to end.
// ---------------------------------------------------------------------------

describe('a whole tournament pays wins and placements', () => {
	let t: string;
	let who: SeededUser[];

	beforeAll(async () => {
		who = await pool('fullrun', 4);
		t = await fieldOf(who, 'Payout full run', [
			{ trigger_type: 'win', trigger_value: null, amount: 10 },
			{ trigger_type: 'placement', trigger_value: 1, amount: 50 },
			{ trigger_type: 'placement', trigger_value: 2, amount: 25 }
		]);
		await walk(t);
	}, 900_000);

	test('every reward row minted a coin row: no silent gaps', async () => {
		const rows = await ledgerOf(t);
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.filter((r) => r.coin_transaction_id === null)).toHaveLength(0);
	});

	test('the placement rows paid too', async () => {
		const rows = await ledgerOf(t);
		const first = rows.filter((r) => r.reason === '1st place');
		const second = rows.filter((r) => r.reason === '2nd place');
		expect(first).toHaveLength(1);
		expect(first[0].amount).toBe(50);
		expect(first[0].coin_transaction_id).not.toBe(null);
		expect(second).toHaveLength(1);
		expect(second[0].amount).toBe(25);
		expect(second[0].coin_transaction_id).not.toBe(null);
	});

	test('each student balance equals the sum of their own reward rows', async () => {
		// The arithmetic check that catches a double-mint or a dropped row.
		const rows = await ledgerOf(t);
		const byUser = new Map<string, number>();
		for (const r of rows) {
			if (!r.user_id) continue;
			byUser.set(r.user_id, (byUser.get(r.user_id) ?? 0) + r.amount);
		}
		expect(byUser.size).toBeGreaterThan(0);
		for (const [userId, total] of byUser) {
			const person = who.find((p) => p.id === userId)!;
			expect(await balanceOf(person.email), `${person.email}`).toBe(total);
		}
	});

	test('one coin row per reward row, tournament-wide', async () => {
		const rows = await ledgerOf(t);
		const linked = new Set(rows.map((r) => r.coin_transaction_id));
		expect(linked.size).toBe(rows.length);
		const n = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.coin_transactions
			 where category_id = 'competition_winnings' and meta ->> 'tournament_id' = $1`,
			[t]
		);
		expect(Number(n.rows[0].n)).toBe(rows.length);
	});
});

// ---------------------------------------------------------------------------
// C. THE DEBT RULE. A winner in debt is still paid. Constraint 1.
// ---------------------------------------------------------------------------

describe('A WINNER IN DEBT STILL RECEIVES THEIR WINNINGS', () => {
	let t: string;
	let debtor: SeededUser;
	let who: SeededUser[];

	beforeAll(async () => {
		who = await pool('debt', 4);
		debtor = who[0];
		// Put them genuinely in debt with a real FINE row, so the balance the
		// lockout would read is negative before anything is won.
		await db.sql(
			`insert into public.coin_transactions
				(student_email, category_id, amount, note, actor_email, medium)
			 values ($1, 'shop_safety_violation', -40, 'Fixture: put this student in debt.', $2, 'digital')`,
			[debtor.email, host.email]
		);
		t = await fieldOf(who, 'Payout in debt', [
			{ trigger_type: 'win', trigger_value: null, amount: 10 }
		]);
		const w1s1 = (await matchesOf(t)).find(
			(m) => m.bracket === 'winners' && m.round === 1 && m.slot === 1
		)!;
		const e = await db.sql<{ user_id: string }>(
			`select user_id from public.tournament_entries where id = $1`,
			[w1s1.entry_a_id]
		);
		expect(e.rows[0].user_id).toBe(debtor.id);
		await play(w1s1, 'a');
	}, 900_000);

	test('the fixture really did start them negative', async () => {
		// The positive control. Without this, "they got paid" proves nothing
		// about the debt rule -- it only proves they were never in debt.
		const coins = await coinsFor(debtor.email);
		const fine = coins.find((c) => c.category_id === 'shop_safety_violation')!;
		expect(fine.amount).toBe(-40);
	});

	test('the award landed anyway: a reward row LINKED to a real coin row', async () => {
		const rows = await ledgerOf(t);
		expect(rows).toHaveLength(1);
		expect(rows[0].coin_transaction_id).not.toBe(null);
	});

	test('the balance moved by exactly the award: -40 becomes -30', async () => {
		expect(await balanceOf(debtor.email)).toBe(-30);
	});

	test('the debt lockout is purchases-only, which is why', async () => {
		// The rule this rests on, read off the price list rather than asserted
		// about it: `competition_winnings` is an AWARD, and 0070's lockout
		// (`kind = 'purchase' and balance < 0`) cannot reach an award.
		const c = await db.sql<{ kind: string; active: boolean }>(
			`select kind, active from public.coin_categories where id = 'competition_winnings'`
		);
		expect(c.rows[0].kind).toBe('award');
		expect(c.rows[0].active).toBe(true);
	});

	test('and a PURCHASE on that same balance is still refused, so the lockout is intact', async () => {
		// The other direction: widening the award path must not have widened the
		// purchase path, and only asking both proves it.
		//
		// THE LOCKOUT IS PER-MEDIUM SINCE 0096 and the medium has to match, or
		// this test passes for the wrong reason. Measured while writing it: the
		// fine and the award are both `digital`, `coin_log_transaction` defaults
		// to `physical`, and asking the PHYSICAL balance about a digital debt
		// correctly found none and allowed the purchase. That is 0096 behaving
		// as designed, not a hole -- but a test that had stopped there would
		// have read "the lockout is gone".
		await db.sql(`insert into public.app_admins (email) values ($1) on conflict do nothing`, [
			host.email
		]);
		const out = await db.asUser(host.id, async (q) => {
			const r = await q<{ out: Record<string, unknown> }>(
				`select public.coin_log_transaction($1, 'song_request', null, null, null, 'digital') as out`,
				[debtor.email]
			);
			return r.rows[0].out;
		});
		expect(out.ok).toBe(false);
		expect(out.reason).toBe('debt');
		expect(out.medium).toBe('digital');
		// Still negative even after the winnings landed, which is the point: the
		// award was paid into a balance that remains in debt.
		expect(out.balance).toBe(-30);
	});

	test('the winnings landed on the DIGITAL balance, which is the one in debt', async () => {
		// The award repays the app-side balance rather than a separate one, so a
		// student in digital debt sees their debt shrink by exactly the prize.
		const coins = await coinsFor(debtor.email);
		const award = coins.find((c) => c.category_id === 'competition_winnings')!;
		expect(award.medium).toBe('digital');
	});
});

// ---------------------------------------------------------------------------
// D. ENTERING CANNOT COST COINS. Constraint 2: confirm all three, weaken none.
// ---------------------------------------------------------------------------

describe('entering a tournament cannot cost a student anything', () => {
	test('LAYER 1: there is no entry trigger to configure', async () => {
		const c = await db.sql<{ def: string }>(
			`select pg_get_constraintdef(oid) as def from pg_constraint
			 where conrelid = 'public.tournament_reward_rules'::regclass
				and pg_get_constraintdef(oid) like '%trigger_type%'`
		);
		const defs = c.rows.map((r) => r.def).join(' ');
		expect(defs).toContain("'win'");
		expect(defs).toContain("'round_reached'");
		expect(defs).toContain("'placement'");
		for (const forbidden of ['entry', 'registration', 'participation']) {
			expect(defs).not.toContain(`'${forbidden}'`);
		}
	});

	test('LAYER 2: the amount cannot be negative at the database, on either table', async () => {
		for (const table of ['tournament_reward_rules', 'tournament_reward_ledger']) {
			const c = await db.sql<{ def: string }>(
				`select pg_get_constraintdef(oid) as def from pg_constraint
				 where conrelid = ('public.' || $1)::regclass and contype = 'c'`,
				[table]
			);
			expect(c.rows.map((r) => r.def).join(' '), table).toContain('amount >= 1');
		}
	});

	test('LAYER 3: the RPC refuses a zero or negative rule', async () => {
		const t = await db.asUser(host.id, async (q) => {
			const r = await q<{ id: string }>(
				`select public.tournament_create($1, '', $2::jsonb) as id`,
				['Negative rule', JSON.stringify({ team_size: 1 })]
			);
			return r.rows[0].id;
		});
		for (const amount of [0, -5]) {
			const msg = await refusal(
				db.asUser(host.id, (q) =>
					q(`select public.tournament_set_reward_rules($1, $2::jsonb)`, [
						t,
						JSON.stringify([{ trigger_type: 'win', trigger_value: null, amount }])
					])
				)
			);
			expect(msg, `amount ${amount}`).toContain('positive whole amount');
		}
	});

	test('and registering writes no coin row at all', async () => {
		const who = await pool('entry', 2);
		const before = await balanceOf(who[0].email);
		expect(before).toBe(0);
		const t = await fieldOf(who, 'Entry costs nothing', [
			{ trigger_type: 'win', trigger_value: null, amount: 10 }
		]);
		expect(t).toBeTruthy();
		// Registered and seeded, nothing played: still zero.
		expect(await balanceOf(who[0].email)).toBe(0);
	});

	test('STRUCTURAL: every competition_winnings row ever written is a credit', async () => {
		// The sweep across everything this file has produced. One negative row
		// would mean the sign was derived somewhere instead of taken from a
		// rule that cannot be below 1.
		const n = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.coin_transactions
			 where category_id = 'competition_winnings' and amount <= 0`
		);
		expect(Number(n.rows[0].n)).toBe(0);
		const total = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.coin_transactions
			 where category_id = 'competition_winnings'`
		);
		// The positive control: the sweep above looked at something.
		expect(Number(total.rows[0].n)).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// E. VALIDATE BEFORE YOU WRITE, and a coin problem never strands a bracket.
// ---------------------------------------------------------------------------

describe('a retired competition_winnings category leaves the reward unpaid and the bracket running', () => {
	let t: string;

	beforeAll(async () => {
		await db.sql(`update public.coin_categories set active = false where id = 'competition_winnings'`);
		t = await fieldOf(await pool('retired', 4), 'Retired category', [
			{ trigger_type: 'win', trigger_value: null, amount: 10 }
		]);
		const w1s1 = (await matchesOf(t)).find(
			(m) => m.bracket === 'winners' && m.round === 1 && m.slot === 1
		)!;
		await play(w1s1, 'a');
	}, 900_000);

	afterAll(async () => {
		await db.sql(`update public.coin_categories set active = true where id = 'competition_winnings'`);
	});

	test('THE MATCH STILL COMPLETED. A coin problem may never strand a bracket', async () => {
		const w1s1 = (await matchesOf(t)).find(
			(m) => m.bracket === 'winners' && m.round === 1 && m.slot === 1
		)!;
		expect(w1s1.status).toBe('complete');
		expect(w1s1.winner_id).not.toBe(null);
	});

	test('the reward row is written and honestly marked unpaid', async () => {
		const rows = await ledgerOf(t);
		expect(rows).toHaveLength(1);
		expect(rows[0].amount).toBe(10);
		expect(rows[0].coin_transaction_id).toBe(null);
	});

	test('and NOTHING was written to the balance: validated before, not after', async () => {
		const n = await db.sql<{ n: string }>(
			`select count(*)::text as n from public.coin_transactions
			 where meta ->> 'tournament_id' = $1`,
			[t]
		);
		expect(Number(n.rows[0].n)).toBe(0);
	});
});

describe('a registrant with no account is unpaid rather than silently skipped', () => {
	let t: string;
	let paid: SeededUser;

	beforeAll(async () => {
		// A team of two whose second member is an UNLINKED walk-up: a name on a
		// roster with no `user_id`, which 0192 supports and which has no email to
		// pay.
		t = await db.asUser(host.id, async (q) => {
			const r = await q<{ id: string }>(
				`select public.tournament_create($1, '', $2::jsonb) as id`,
				['Unlinked walk-up', JSON.stringify({ team_size: 2 })]
			);
			return r.rows[0].id;
		});
		await db.asUser(host.id, (q) =>
			q(`select public.tournament_set_reward_rules($1, $2::jsonb)`, [
				t,
				JSON.stringify([{ trigger_type: 'win', trigger_value: null, amount: 10 }])
			])
		);
		await db.asUser(host.id, (q) =>
			q(`select public.tournament_set_status($1, 'registration_open')`, [t])
		);
		const six = await createUser(db, 'walkup-six@boscotech.net', 'Six');
		const solo = await createUser(db, 'walkup-solo@boscotech.net', 'Solo');
		paid = six;
		await db.asUser(six.id, (q) =>
			q(`select public.tournament_register_entry($1, $2, $3, $4, $5, $6::text[])`, [
				t,
				'Pair',
				'',
				null,
				'Six',
				['Zed']
			])
		);
		await db.asUser(solo.id, (q) =>
			q(`select public.tournament_register_entry($1, $2, $3, $4)`, [t, 'Solo', '', null])
		);
		await db.asUser(host.id, (q) => q(`select public.tournament_set_status($1, 'seeding')`, [t]));
		await db.asUser(host.id, (q) => q(`select public.tournament_generate_bracket($1)`, [t]));
		const wf = (await matchesOf(t)).find((m) => m.bracket === 'winners')!;
		const pair = await db.sql<{ id: string }>(
			`select id from public.tournament_entries
			 where tournament_id = $1 and display_name = 'Pair'`,
			[t]
		);
		await play(wf, wf.entry_a_id === pair.rows[0].id ? 'a' : 'b');
	}, 900_000);

	test('two reward rows, one per registrant, at the full amount each', async () => {
		const rows = await ledgerOf(t);
		expect(rows).toHaveLength(2);
		expect(rows.every((r) => r.amount === 10)).toBe(true);
		expect(rows.every((r) => r.member_id !== null)).toBe(true);
	});

	test('the LINKED member was paid and the unlinked one was not', async () => {
		const rows = await ledgerOf(t);
		const linked = rows.filter((r) => r.user_id !== null);
		const unlinked = rows.filter((r) => r.user_id === null);
		expect(linked).toHaveLength(1);
		expect(unlinked).toHaveLength(1);
		expect(linked[0].coin_transaction_id).not.toBe(null);
		// Not skipped, not invented an address for: written, and visibly unpaid.
		expect(unlinked[0].coin_transaction_id).toBe(null);
		expect(await balanceOf(paid.email)).toBe(10);
	});
});

// ---------------------------------------------------------------------------
// F. NOTHING PAYS TWICE.
// ---------------------------------------------------------------------------

describe('a reward cannot pay twice', () => {
	test('coin_transaction_id is UNIQUE, so a second link is refused by the database', async () => {
		const c = await db.sql<{ def: string }>(
			`select pg_get_constraintdef(oid) as def from pg_constraint
			 where conrelid = 'public.tournament_reward_ledger'::regclass and contype = 'u'`
		);
		expect(c.rows.map((r) => r.def).join(' ')).toContain('coin_transaction_id');
	});

	test('and the constraint BITES: linking one coin row to two rewards is refused', async () => {
		// A pinned constraint definition proves the text; only a write proves
		// the rule.
		const r = await db.sql<{ id: number; coin_transaction_id: string | null }>(
			`select id, coin_transaction_id from public.tournament_reward_ledger
			 where coin_transaction_id is not null order by id limit 2`
		);
		expect(r.rows).toHaveLength(2);
		const msg = await refusal(
			db.sql(`update public.tournament_reward_ledger set coin_transaction_id = $1 where id = $2`, [
				r.rows[0].coin_transaction_id,
				r.rows[1].id
			])
		);
		expect(msg).not.toBe(null);
		expect(msg).toContain('tournament_reward_ledger_coin_txn_unique');
	});

	test('a CORRECTION still mints no new reward and no new coin row (0063 stance, unchanged)', async () => {
		const t = await fieldOf(await pool('corr', 4), 'Correction pays nothing', [
			{ trigger_type: 'win', trigger_value: null, amount: 10 }
		]);
		const w1s1 = (await matchesOf(t)).find(
			(m) => m.bracket === 'winners' && m.round === 1 && m.slot === 1
		)!;
		await play(w1s1, 'a');
		const before = await ledgerOf(t);
		expect(before).toHaveLength(1);

		await db.asUser(host.id, (q) =>
			q(`select public.tournament_correct_match_result($1, $2::jsonb, $3)`, [
				w1s1.id,
				JSON.stringify({ games: [{ winner: 'b' }] }),
				'Scored the wrong way round.'
			])
		);
		const after = await ledgerOf(t);
		// Unchanged: the permanent ledger is never rewritten, so the corrected
		// winner gets no row and the wrong winner keeps theirs. That is 0063's
		// documented decision and 0212 did not touch it.
		expect(after).toHaveLength(1);
		expect(after[0].id).toBe(before[0].id);
		expect(after[0].coin_transaction_id).toBe(before[0].coin_transaction_id);
	});
});
