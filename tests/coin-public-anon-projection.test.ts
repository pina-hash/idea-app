// tests/coin-public-anon-projection.test.ts
//
// WHAT A STRANGER ON THE INTERNET RECEIVES ABOUT A NAMED STUDENT.
//
// Three of this schema's public reads are granted to `anon`, deliberately, and
// 0137 keeps all three among its eighteen: `coin_public_leaderboard`,
// `coin_public_transactions` and `coin_public_student`. The IDEA Coin Ledger is
// public tier, so a visitor with no account and no session calls every one of
// them on page load.
//
// THAT MAKES THE QUESTION DIFFERENT FROM AN ADMIN GATE, AND NOT SMALLER. For
// `gauntlet_room_board` the question was WHO may call, and the answer was
// wrong for two months. Here WHO is settled and public on purpose. The
// remaining question is WHAT each row carries, field by field, and it has
// never been asked from the caller's own seat: every existing test of these
// three reaches them in raw SQL (`select * from public.coin_public_...`),
// which is the shape node-postgres produces and not the shape a client
// receives, and does it on a chain that stops at 0089 in the one file that
// also carries 0137. The projection these functions have TODAY -- 0103's
// `medium` and `transfer_id`, 0107's `adjustments` -- has never been read
// through a PostgREST-shaped call by anything.
//
// SO EVERYTHING BELOW IS DRIVEN AS `anon`, TWICE OVER:
//
//   1. through the shared PostgREST shim with a NULL caller, which is `set
//      role anon` with no claims -- the role a signed-out request actually
//      arrives as, and the role whose EXECUTE grants 0137 exists to partition;
//   2. through the REAL route handler, `src/routes/api/coin/public/+server.ts`,
//      with that same anon client in `locals.supabase`, because the bytes that
//      reach a stranger are the CSV and JSON that route emits and not the row
//      set underneath it.
//
// THE PINS ARE WHOLE SETS, NEVER SPOT CHECKS. A disclosure arrives as an ADDED
// field, so an assertion that names the fields it dislikes cannot catch one:
// it passes forever while the payload grows around it. Every projection here
// is pinned as the COMPLETE key set of a real returned row, which reddens on
// an addition in the one direction that matters, and the route's CSV header is
// pinned the same way at the surface.
//
// AND EVERY DENIAL HAS A POSITIVE CONTROL AHEAD OF IT. An empty array carries
// no address either; a fixture that seeded nothing would satisfy every
// no-email assertion in this file. The controls run first.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { GET } from '../src/routes/api/coin/public/+server';

/**
 * The coin chain as it stands TODAY, which is the point: the three functions
 * under test were last rewritten by 0103 (`medium`, `transfer_id`) and 0107
 * (`adjustments`), and 0137 goes last because it is a sweep over whatever the
 * chain above it created.
 *
 * `0100_coin_legacy_reimport.sql` is deliberately absent. It is a one-time
 * import of real archived data, and every row this file asserts about is
 * written through a live write RPC below.
 */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0070_coin_economy.sql',
	'0072_coin_my_eating_pass_status.sql',
	'0073_coin_sections.sql',
	'0074_coin_roles.sql',
	'0076_coin_role_quiz_and_expiration.sql',
	'0077_coin_contracts.sql',
	'0079_coin_bulk_payout.sql',
	'0080_coin_category_admin.sql',
	'0081_coin_debt_payment.sql',
	'0084_coin_legacy_import.sql',
	'0087_coin_weekly_wage_tier.sql',
	'0089_coin_public_ledger.sql',
	'0096_coin_medium.sql',
	'0103_coin_public_medium_display.sql',
	'0107_coin_public_adjustment_bucket.sql',
	'0137_anon_execute_sweep.sql'
] as const;

const SECTION = 'eng1h-sophomore';
const SECTION_LABEL = 'Engineering I Honors, Sophomore';

let db: TestDb;
let owner: SeededUser; // the pinned admin, who does every write
let ada: SeededUser; // the busy student: every bucket is non-zero for her
let grace: SeededUser; // the quiet control

/** An anon PostgREST client. `null` is the caller, not a missing one. */
let anon: ReturnType<typeof createPostgrestShim>;

/** Hands back `data`, or throws whatever the shim reported. */
async function ok<T>(call: Promise<{ data: unknown; error: { message: string } | null }>): Promise<T> {
	const res = await call;
	if (res.error) throw new Error(res.error.message);
	return res.data as T;
}

/** Drives the REAL public route as a signed-out visitor. */
async function route(action: string, extra: Record<string, string> = {}): Promise<{
	status: number;
	contentType: string;
	body: string;
}> {
	const url = new URL(`https://ideabosco.com/api/coin/public?action=${action}`);
	for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
	const res = (await GET({
		url,
		locals: { supabase: anon },
		setHeaders: () => {}
		// The handler reads exactly these three. Anything else it grew would be
		// a TypeError here rather than a silently different drive.
	} as unknown as Parameters<typeof GET>[0])) as Response;
	return {
		status: res.status,
		contentType: res.headers.get('content-type') ?? '',
		body: await res.text()
	};
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	ada = await createUser(db, 'ada.lovelace@boscotech.net', 'Ada Lovelace');
	grace = await createUser(db, 'grace.hopper@boscotech.net', 'Grace Hopper');

	await db.asUser(owner.id, async (q) => {
		await q(`select public.coin_admin_upsert_section($1, $2, $3, $4, $5)`, [
			SECTION,
			SECTION_LABEL,
			'#00FF41',
			null,
			true
		]);
		await q(`select public.coin_admin_assign_section_students($1, $2::text[])`, [
			SECTION,
			[ada.email, grace.email]
		]);

		// Ada, built so that every bucket the leaderboard projects is non-zero
		// and no two of them are equal. A payload whose fields are all 0, or all
		// the same number, is one in which a mis-mapped column reads correct.
		//
		// EVERY ROW IS `digital` EXCEPT THE PAYOUT'S PHYSICAL CREDIT, so the two
		// component balances are different non-zero numbers rather than one of
		// them being zero.
		//
		// The amounts come from 0070's own category seed, not from what the
		// function returned: an adjustment (400), a variable-priced award (25),
		// a 3i¢ fine, the 150i¢ eating pass, and a 40i¢ pay raise at tier 1.
		await q(`select public.coin_admin_adjust_balance($1, 400, 'opening balance', 'digital')`, [
			ada.email
		]);
		await q(
			`select public.coin_log_transaction($1, 'contract_completion', 25, null, 'shop signage', 'digital')`,
			[ada.email]
		);
		await q(
			`select public.coin_log_transaction($1, 'disruptive_behavior', null, null, null, 'digital')`,
			[ada.email]
		);
		// The eating pass, so the drawer's `eating_pass_held` is TRUE for
		// somebody -- the flag whose STRIKE COUNT sibling is the documented
		// disclosure boundary this file re-asserts below.
		await q(`select public.coin_log_transaction($1, 'eating_pass', null, null, null, 'digital')`, [
			ada.email
		]);
		// A pay raise: tier 2, so `wage_tier` and `weekly_wage` are not their
		// defaults. A pinned 1 is indistinguishable from never being computed.
		await q(`select public.coin_log_pay_raise($1, 'earned it', 'digital')`, [ada.email]);
		// A withdrawal: two linked rows sharing a transfer id, which is what puts
		// a non-null `transfer_id` in the public feed at all.
		await q(`select public.coin_payout_student($1, 'test withdrawal', 40)`, [ada.email]);

		// Grace: enough to appear, nothing else. The control for every
		// Ada-only figure.
		await q(`select public.coin_admin_adjust_balance($1, 50, 'opening balance', 'digital')`, [
			grace.email
		]);
	});

	const fks = await loadForeignKeys(db);
	anon = createPostgrestShim(db, fks, null);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. THE GRANT, VERIFIED HERE RATHER THAN TAKEN FROM 0137's HEADER
// ---------------------------------------------------------------------------
describe('the three really are reachable by a signed-out caller', () => {
	test('anon holds EXECUTE on all three, and does not hold it on their internals', async () => {
		const { rows } = await db.sql<Record<string, boolean>>(
			`select
			   has_function_privilege('anon', 'public.coin_public_leaderboard()', 'execute') as board,
			   has_function_privilege('anon', 'public.coin_public_transactions(integer)', 'execute') as txns,
			   has_function_privilege('anon', 'public.coin_public_student(text)', 'execute') as student,
			   -- THE NEGATIVE CONTROLS, and they are the half that makes the
			   -- three above a PARTITION rather than a fixture in which anon
			   -- can call everything. _coin_public_roster is the internal read
			   -- all three select from and it is the one that carries the
			   -- student_email column; the admin list is an ordinary neighbour.
			   has_function_privilege('anon', 'public._coin_public_roster()', 'execute') as roster,
			   has_function_privilege('anon', 'public.coin_admin_list_section_students(text)', 'execute') as admin_list,
			   has_function_privilege('anon', 'public.coin_eating_pass_strikes(text)', 'execute') as strikes`
		);
		expect(rows[0].board).toBe(true);
		expect(rows[0].txns).toBe(true);
		expect(rows[0].student).toBe(true);
		expect(rows[0].roster).toBe(false);
		expect(rows[0].admin_list).toBe(false);
		expect(rows[0].strikes).toBe(false);
	});

	test('THE SHIM ITSELF IS ANON: the same client is refused an authenticated read', async () => {
		// Without this, every "a signed-out visitor receives X" assertion below
		// is equally satisfied by a shim quietly running as the table owner,
		// which is exactly the vacuum 0137's whole subject is about. So: the
		// SAME client that answers the three public calls must be REFUSED one
		// that `anon` does not hold, and an admin's client must be given it.
		const refused = await anon.rpc('coin_admin_list_section_students', {
			p_section_id: SECTION
		});
		expect(refused.error).not.toBeNull();
		expect(refused.error?.message ?? '').toMatch(/permission denied/i);

		const fks = await loadForeignKeys(db);
		const asAdmin = createPostgrestShim(db, fks, owner.id);
		const allowed = await asAdmin.rpc('coin_admin_list_section_students', {
			p_section_id: SECTION
		});
		expect(allowed.error).toBeNull();
		expect(allowed.data).toHaveLength(2);
	});

	test('anon cannot read the coin tables directly, so the RPC is the only way in', async () => {
		// The projection is only a boundary while the tables behind it stay
		// shut. Every one of these is the read a widened grant would open.
		for (const table of ['coin_transactions', 'coin_students', 'coin_section_students', 'profiles']) {
			const denied = await db
				.asAnon((q) => q(`select * from public.${table} limit 1`))
				.then(() => null)
				.catch((e: Error) => e.message);
			expect(denied, `anon could read public.${table}`).toMatch(/permission denied/i);
		}
	});
});

// ---------------------------------------------------------------------------
// 2. THE PROJECTIONS, PINNED WHOLE, AS AN ANONYMOUS CALLER
// ---------------------------------------------------------------------------

/**
 * Every column the leaderboard hands a stranger, and the verdict on each.
 *
 *   student_id       an OPAQUE id, md5(secret salt || email). It is the whole
 *                    reason these are RPCs rather than a view: the drawer has
 *                    to address one student and must not do it by address.
 *   name             a leaderboard needs a name. This is the display name
 *                    0084's resolution picks, never the email.
 *   section          a class LABEL, which is what a leaderboard groups by.
 *   awarded/fines/spent/adjustments/paid_out/balance/debt
 *                    the figures the board and its stat bar are FOR.
 *   weekly_wage/wage_tier
 *                    the student's own rate. Public because the board ranks on
 *                    earning and a rate with no tier in it would not reconcile.
 *   physical_balance/digital_balance
 *                    the two components of `balance` (0096/0103).
 *
 * WHAT IS NOT HERE IS THE POINT. There is no email, no `student_email`, no
 * role, no `section_id`, no user id, no strike count, and no timestamp of any
 * kind -- a leaderboard that carried a `last_transaction_at` would place a
 * named student in a room at a moment, which a ranking does not need.
 */
const BOARD_COLUMNS = [
	'adjustments',
	'awarded',
	'balance',
	'debt',
	'digital_balance',
	'fines',
	'name',
	'paid_out',
	'physical_balance',
	'section',
	'spent',
	'student_id',
	'wage_tier',
	'weekly_wage'
] as const;

/**
 * The transaction feed. `occurred_at` IS a timestamp and it is the one field
 * here worth arguing about -- it is precise to the second and it is beside a
 * name, so the feed does say that a named student was fined at 10:42. It is
 * also the ledger's own event time and the thing the page sorts and renders,
 * so it cannot be dropped without the feed ceasing to be a feed. It is named
 * here so the trade is written down rather than discovered.
 *
 * `medium` and `transfer_id` (0103) are the pairing key for a payout's two
 * halves; the id is a uuid minted for the pair and identifies nobody.
 */
const TXN_COLUMNS = [
	'amount',
	'medium',
	'name',
	'occurred_at',
	'reason',
	'transfer_id',
	'type'
] as const;

/**
 * The per-student drawer, addressed by the opaque id.
 *
 * `eating_pass_held` is a BOOLEAN and its strike-count sibling is deliberately
 * absent: 0089's header states that boundary in words ("two strikes from
 * losing it is between the student and an admin"), and this pin is what holds
 * it. `coin_eating_pass_strikes` is anon-revoked above, which is the second,
 * independent half.
 */
const STUDENT_KEYS = [
	'balance',
	'digital_balance',
	'eating_pass_held',
	'history',
	'name',
	'ok',
	'physical_balance',
	'section',
	'student_id',
	'wage_tier',
	'weekly_wage'
] as const;

const HISTORY_KEYS = ['amount', 'medium', 'occurred_at', 'reason', 'transfer_id', 'type'] as const;

interface BoardRow {
	student_id: string;
	name: string;
	section: string | null;
	awarded: number;
	fines: number;
	spent: number;
	adjustments: number;
	paid_out: number;
	balance: number;
	debt: number;
	weekly_wage: number;
	wage_tier: number;
	physical_balance: number;
	digital_balance: number;
}

async function board(): Promise<BoardRow[]> {
	return ok<BoardRow[]>(anon.rpc('coin_public_leaderboard'));
}

describe('the leaderboard, called by a signed-out visitor', () => {
	test('POSITIVE CONTROL: it answers an array of row objects with real figures', async () => {
		const rows = await board();
		// An array, not a composite string and not one row: the shape a client
		// receives. `readCoinPublic` casts it straight to `LeaderboardRow[]`
		// with no validation, so this is the assertion standing in for that.
		expect(Array.isArray(rows)).toBe(true);
		expect(rows).toHaveLength(2);
		const adaRow = rows.find((r) => r.name === 'Ada Lovelace');
		expect(adaRow).toBeDefined();

		// EVERY FIGURE, DERIVED FROM THE FIXTURE RATHER THAN READ OFF THE
		// ANSWER -- which is the difference between pinning what a projection
		// means and recording what it currently says.
		//
		//   awarded      the 25 contract completion, and ONLY that: an
		//                adjustment is not an earning (0107) and a transfer's
		//                physical credit is not either (0103).
		//   fines        the 3 disruptive behaviour.
		//   spent        150 eating pass + 40 pay raise. The payout's 40 debit
		//                is NOT here: it is a transfer, not a purchase.
		//   adjustments  the 400 opening balance, at its stored sign.
		//   paid_out     the withdrawal, which IS counted here.
		//   balance      400 + 25 - 3 - 150 - 40, the payout netting to zero.
		//   debt         zero, because the balance is positive.
		//   wage_tier    2 after one raise; weekly_wage is the 1i¢ base x 2.
		//   physical     the payout's credit alone; digital is the rest.
		expect(adaRow).toMatchObject({
			name: 'Ada Lovelace',
			section: SECTION_LABEL,
			awarded: 25,
			fines: 3,
			spent: 190,
			adjustments: 400,
			paid_out: 40,
			balance: 232,
			debt: 0,
			wage_tier: 2,
			weekly_wage: 2,
			physical_balance: 40,
			digital_balance: 192
		});
		// The page's own identity, which is the reason the buckets are
		// partitioned the way they are.
		expect(adaRow!.awarded - adaRow!.fines - adaRow!.spent + adaRow!.adjustments).toBe(
			adaRow!.balance
		);
		expect(adaRow!.physical_balance + adaRow!.digital_balance).toBe(adaRow!.balance);

		// THE CONTROL: Grace moves none of the buckets Ada moves, so no figure
		// above is one this function returns for everybody.
		const graceRow = rows.find((r) => r.name === 'Grace Hopper')!;
		expect(graceRow).toMatchObject({
			awarded: 0,
			fines: 0,
			spent: 0,
			adjustments: 50,
			paid_out: 0,
			balance: 50,
			wage_tier: 1,
			physical_balance: 0
		});
	});

	test('its columns are EXACTLY these fourteen, and a fifteenth reddens this', async () => {
		const rows = await board();
		for (const row of rows) {
			expect(Object.keys(row).sort()).toEqual([...BOARD_COLUMNS]);
		}
	});

	test('the opaque id is opaque: 32 hex, stable, distinct, and NOT a function of the address', async () => {
		const rows = await board();
		const adaRow = rows.find((r) => r.name === 'Ada Lovelace')!;
		const graceRow = rows.find((r) => r.name === 'Grace Hopper')!;
		expect(adaRow.student_id).toMatch(/^[0-9a-f]{32}$/);

		// STABLE. A drawer is addressed by this id, so an id that moved between
		// two page loads would be a different bug in the same field.
		expect((await board()).find((r) => r.name === 'Ada Lovelace')!.student_id).toBe(
			adaRow.student_id
		);

		// DISTINCT. A collision would be worse than a leak: two students would
		// share one drawer, and each would read the other's history.
		expect(graceRow.student_id).not.toBe(adaRow.student_id);

		// NOT COMPUTABLE FROM WHAT A VISITOR ALREADY HOLDS. The leaderboard hands
		// out the display name; the school's address format is public. So sweep
		// every digest an attacker can build from those alone -- md5(email) is
		// the one that matters, because "it looks like a hash" is otherwise
		// satisfied by a value that is a dictionary attack over one school's
		// address space.
		const publicKnowledge = [
			ada.email,
			ada.email.toLowerCase(),
			ada.email.split('@')[0],
			'Ada Lovelace',
			'ada lovelace'
		];
		const { rows: guesses } = await db.sql<{ candidate: string; d: string }>(
			`select c as candidate, md5(c) as d from unnest($1::text[]) as c`,
			[publicKnowledge]
		);
		expect(guesses).toHaveLength(publicKnowledge.length); // the sweep generated cases
		for (const g of guesses) {
			expect(adaRow.student_id, `id equals md5(${g.candidate})`).not.toBe(g.d);
		}

		// AND THE REASON IT IS NOT: the id is md5(SECRET SALT || email), and the
		// salt is a pair of random uuids minted at apply time into a table with
		// no grant and no RLS policy (tests/coin-public-ledger.test.ts holds that
		// half). This is the assertion that says so rather than implying it:
		// rotate the secret, as the owner, and every id moves while every address
		// stays exactly where it was. An id that survived a salt rotation would
		// be derivable from the address, which is the whole claim of this test.
		//
		// THIS REPLACES TWO ASSERTIONS THAT TESTED A COINCIDENCE INSTEAD:
		//   not.toContain('ada')       -- 'a' and 'd' are hex digits, so a random
		//     32-hex digest contains 'ada' by chance at 30 positions x (1/16)^3,
		//     about 1 run in 137. Measured over 200,000 freshly minted salts
		//     through this exact derivation: 1512 hits, 1 in 132. That is the
		//     failure that made main red, and it never had anything to do with
		//     the property.
		//   not.toContain('lovelace')  -- 'l', 'o' and 'v' are not in [0-9a-f],
		//     so it could not match a hex digest under any circumstances. It was
		//     green from the day it was written and tested nothing. Removed
		//     because it cannot fail, not because it was inconvenient.
		// Substring-freedom was standing in for non-derivability. It is now a
		// consequence of the rotation proof rather than a thing to check.
		const { rows: before } = await db.sql<{ salt: string }>(
			`select salt from public.coin_public_id_secret where id limit 1`
		);
		const originalSalt = before[0].salt;
		expect(typeof originalSalt).toBe('string'); // the secret really is there
		try {
			await db.sql(
				`update public.coin_public_id_secret
				    set salt = gen_random_uuid()::text || gen_random_uuid()::text
				  where id`
			);
			const rotated = await board();
			expect(rotated).toHaveLength(rows.length); // the comparison below has cases
			for (const row of rotated) {
				const was = rows.find((r) => r.name === row.name)!;
				expect(row.student_id, `${row.name}'s id survived a salt rotation`).not.toBe(
					was.student_id
				);
				expect(row.student_id).toMatch(/^[0-9a-f]{32}$/);
			}
		} finally {
			await db.sql(`update public.coin_public_id_secret set salt = $1 where id`, [originalSalt]);
		}
		// Restored, so the ids the rest of this file addresses drawers with are
		// the ones it started with.
		expect((await board()).find((r) => r.name === 'Ada Lovelace')!.student_id).toBe(
			adaRow.student_id
		);
	});

	test('the section is a LABEL, never the section id and never a role', async () => {
		const rows = await board();
		expect(rows.find((r) => r.name === 'Ada Lovelace')!.section).toBe(SECTION_LABEL);
		// The id is the internal key. A payload carrying it would let a visitor
		// join two public surfaces on it.
		for (const row of rows) expect(row.section).not.toBe(SECTION);
	});
});

describe('the transaction feed, called by a signed-out visitor', () => {
	test('POSITIVE CONTROL: it answers rows, including both halves of the payout', async () => {
		const rows = await ok<Record<string, unknown>[]>(
			anon.rpc('coin_public_transactions', { p_limit: 5000 })
		);
		expect(Array.isArray(rows)).toBe(true);
		expect(rows.length).toBeGreaterThan(0);
		const paired = rows.filter((r) => r.transfer_id !== null);
		// Two halves, one id -- so `transfer_id` is genuinely populated here
		// and the pin below is not over a column that is null in every row.
		expect(paired).toHaveLength(2);
		expect(new Set(paired.map((r) => r.transfer_id)).size).toBe(1);
		expect(paired.every((r) => r.type === 'Payout')).toBe(true);
	});

	test('its columns are EXACTLY these seven, and an eighth reddens this', async () => {
		const rows = await ok<Record<string, unknown>[]>(
			anon.rpc('coin_public_transactions', { p_limit: 5000 })
		);
		for (const row of rows) {
			expect(Object.keys(row).sort()).toEqual([...TXN_COLUMNS]);
		}
	});

	test('a timestamptz reaches the caller as an ISO STRING, the way PostgREST sends it', async () => {
		const rows = await ok<{ occurred_at: unknown }[]>(
			anon.rpc('coin_public_transactions', { p_limit: 5000 })
		);
		// `readCoinPublic` passes `occurred_at` to `new Date(value)`. A driver
		// Date would work there by accident; the wire value is a string, and
		// this is the only place in the suite that says so for these RPCs.
		expect(typeof rows[0].occurred_at).toBe('string');
	});
});

describe('the per-student drawer, called by a signed-out visitor', () => {
	async function drawer(id: string) {
		return ok<Record<string, unknown>>(anon.rpc('coin_public_student', { p_student_id: id }));
	}

	async function adaId(): Promise<string> {
		return (await board()).find((r) => r.name === 'Ada Lovelace')!.student_id;
	}

	test('POSITIVE CONTROL: the opaque id resolves and the drawer is populated', async () => {
		const d = await drawer(await adaId());
		expect(d.ok).toBe(true);
		expect(d.name).toBe('Ada Lovelace');
		expect(d.eating_pass_held).toBe(true);
		expect(Array.isArray(d.history)).toBe(true);
		expect((d.history as unknown[]).length).toBeGreaterThan(0);
	});

	test('its keys are EXACTLY these eleven, and a twelfth reddens this', async () => {
		const d = await drawer(await adaId());
		expect(Object.keys(d).sort()).toEqual([...STUDENT_KEYS]);
	});

	test('every history entry carries EXACTLY these six', async () => {
		const d = await drawer(await adaId());
		for (const h of d.history as Record<string, unknown>[]) {
			expect(Object.keys(h).sort()).toEqual([...HISTORY_KEYS]);
		}
	});

	test('the strike count is absent, and it is a real number for this student', async () => {
		// The POSITIVE half first: a strike count exists for Ada, so its
		// absence below is a decision and not an empty column.
		const { rows } = await db.sql<{ n: number }>(
			`select public.coin_eating_pass_strikes($1) as n`,
			[ada.email]
		);
		expect(typeof rows[0].n).toBe('number');

		const d = await drawer(await adaId());
		const text = JSON.stringify(d);
		expect(text).not.toMatch(/strike/i);
	});

	test('an unknown id is refused without saying whether anybody holds it', async () => {
		const d = await drawer('0'.repeat(32));
		expect(d).toEqual({ ok: false, reason: 'unknown_student' });
	});
});

// ---------------------------------------------------------------------------
// 3. THE ONE RULE THAT COVERS EVERY FIELD AT ONCE
// ---------------------------------------------------------------------------
describe('no address leaves any of the three, under any parameter', () => {
	test('POSITIVE CONTROL: the addresses are really in the database behind them', async () => {
		const { rows } = await db.sql<{ n: number }>(
			`select count(*)::int as n from public.coin_transactions where student_email = $1`,
			[ada.email]
		);
		// If this were 0 the sweep below would be sweeping an empty ledger.
		expect(rows[0].n).toBeGreaterThan(0);
	});

	test('every row of every public RPC, serialized, contains no email at all', async () => {
		const ids = (await board()).map((r) => r.student_id);
		const payloads: unknown[] = [
			await board(),
			await ok(anon.rpc('coin_public_transactions', { p_limit: 5000 })),
			await ok(anon.rpc('coin_public_transactions', { p_limit: 1 })),
			await ok(anon.rpc('coin_public_transactions', {})),
			...(await Promise.all(
				ids.map((id) => ok(anon.rpc('coin_public_student', { p_student_id: id })))
			))
		];
		const text = JSON.stringify(payloads);
		expect(text.length).toBeGreaterThan(200); // not an empty sweep
		expect(text).not.toContain('@');
		for (const email of [owner.email, ada.email, grace.email]) {
			expect(text).not.toContain(email);
			expect(text).not.toContain(email.split('@')[0]);
		}
		// And no user id either: `profiles.id` is joined inside the roster and
		// must not come out the other side.
		for (const id of [owner.id, ada.id, grace.id]) expect(text).not.toContain(id);
	});
});

// ---------------------------------------------------------------------------
// 4. THE SURFACE ITSELF: the real route, driven with no session
// ---------------------------------------------------------------------------
describe('/api/coin/public, driven as a signed-out visitor', () => {
	test('POSITIVE CONTROL: summary answers CSV with a row per student', async () => {
		const res = await route('summary');
		expect(res.contentType).toContain('text/csv');
		const lines = res.body.split('\r\n');
		expect(lines).toHaveLength(3); // header + two students
		expect(lines[1] + lines[2]).toContain('Ada Lovelace');
	});

	test('the summary CSV header is EXACTLY these fourteen columns', async () => {
		// The pin at the surface. `readCoinPublic` writes this header list by
		// hand beside the row mapping, so the two can drift from the RPC and
		// from each other; this is the only assertion that reads what a
		// visitor's browser actually parses.
		const header = (await route('summary')).body.split('\r\n')[0];
		expect(header).toBe(
			'Name,Section,Wage,Awarded,Fines,Spent,Adjustments,Coin Balance,Paid Out,' +
				'Physical Balance,Digital Balance,Debt,Wage Tier,Student Id'
		);
	});

	test('the transactions CSV header is EXACTLY these seven columns', async () => {
		const header = (await route('transactions')).body.split('\r\n')[0];
		expect(header).toBe('Date / Time,Name,Amount,Type,Reason,Medium,Transfer Id');
	});

	test('the student JSON carries the drawer keys and nothing more', async () => {
		const id = (await board()).find((r) => r.name === 'Ada Lovelace')!.student_id;
		const res = await route('student', { student: id });
		expect(res.contentType).toContain('application/json');
		const body = JSON.parse(res.body) as Record<string, unknown>;
		expect(Object.keys(body).sort()).toEqual([...STUDENT_KEYS]);
		for (const h of body.history as Record<string, unknown>[]) {
			expect(Object.keys(h).sort()).toEqual([...HISTORY_KEYS]);
		}
	});

	test('no served body carries an address', async () => {
		const id = (await board()).find((r) => r.name === 'Ada Lovelace')!.student_id;
		const bodies = [
			(await route('summary')).body,
			(await route('transactions')).body,
			(await route('student', { student: id })).body
		].join('\n');
		expect(bodies.length).toBeGreaterThan(200);
		expect(bodies).not.toContain('@');
		for (const email of [ada.email, grace.email, owner.email]) {
			expect(bodies).not.toContain(email.split('@')[0]);
		}
	});

	test('an action outside the allowlist is refused before the database is asked', async () => {
		// The allowlist is the route's own second check, independent of the
		// grants asserted in section 1.
		const res = await route('coin_admin_list_section_students');
		expect(res.status).toBe(400);
		expect(JSON.parse(res.body)).toEqual({ error: 'unsupported action' });
	});
});
