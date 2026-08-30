// tests/coin-contracts.test.ts
//
// Migration 0077's contracts system, against a real Postgres with the real
// migrations applied (see tests/db/harness.ts). DELIBERATELY NARROW, the
// notebook-security.test.ts convention: this is not a feature test suite, it
// is a suite for the guarantees that would regress SILENTLY -- nothing in the
// app would visibly break if the capacity lock were removed until two
// students happened to claim the same last slot at the same moment.
//
//   1. The concurrency guarantee itself, against REAL concurrent Postgres
//      connections (not simulated): N students racing a contract with fewer
//      open slots than N never over-claims it.
//   2. RLS: any signed-in user reads coin_contracts / coin_contract_status;
//      coin_contract_claims stays scoped to the caller's own rows unless
//      admin.
//   3. No direct writes on either table, for a student OR an admin -- every
//      write goes through a SECURITY DEFINER RPC.
//   4. The admin-only RPCs (post / complete / cancel / reset) actually
//      refuse a non-admin, and anon has no EXECUTE grant on any of them.
//   5. The even-split arithmetic, including a genuine remainder case,
//      against the real round() Postgres runs -- not a hand-computed value.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, MIGRATIONS, type SeededUser, type TestDb } from './db/harness';

let db: TestDb;

let owner: SeededUser; // pinned admin: apina@boscotech.edu
let studentA: SeededUser;
let studentB: SeededUser;
let studentC: SeededUser;
let studentD: SeededUser;
let studentE: SeededUser;
let studentOutsider: SeededUser; // never assigned to a section

let sectionX: string;

/** Fails loudly if the statement SUCCEEDS; otherwise hands back the error. */
async function captureError(run: () => Promise<unknown>): Promise<{ code?: string; message: string }> {
	try {
		await run();
	} catch (error) {
		const e = error as { code?: string; message?: string };
		return { code: e.code, message: e.message ?? String(error) };
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
}

async function postContract(
	title: string,
	payout: number,
	max: number,
	sectionId: string | null = null
): Promise<string> {
	return db.asUser(owner.id, async (q) => {
		const { rows } = await q<{ coin_admin_post_contract: { id: string } }>(
			`select public.coin_admin_post_contract($1, $2, $3, $4, $5) as coin_admin_post_contract`,
			[title, 'test contract', payout, max, sectionId]
		);
		return rows[0].coin_admin_post_contract.id;
	});
}

async function claim(userId: string, contractId: string): Promise<{ ok: boolean; reason?: string; [k: string]: unknown }> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ coin_contract_self_claim: Record<string, unknown> }>(
			`select public.coin_contract_self_claim($1) as coin_contract_self_claim`,
			[contractId]
		);
		return rows[0].coin_contract_self_claim as { ok: boolean; reason?: string };
	});
}

beforeAll(async () => {
	// coin_contracts.section_id references coin_sections (0073), which
	// nothing in the notebook chain needs -- inserted after 0070 (whose
	// is_admin()/current_user_email() it depends on) and before this
	// migration's own target, 0077.
	// 0137 is filtered out of the spread and re-appended, so the sweep still
	// runs LAST -- over 0073's and 0077's functions too, not before them.
	db = await startTestDb([
		...MIGRATIONS.filter((m) => m !== '0137_anon_execute_sweep.sql'),
		'0073_coin_sections.sql',
		'0077_coin_contracts.sql',
		'0137_anon_execute_sweep.sql'
	]);

	owner = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	studentA = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	studentB = await createUser(db, 'bob@boscotech.net', 'Bob Brandt');
	studentC = await createUser(db, 'casey@boscotech.net', 'Casey Cruz');
	studentD = await createUser(db, 'dana@boscotech.net', 'Dana Diaz');
	studentE = await createUser(db, 'evan@boscotech.net', 'Evan Ellis');
	studentOutsider = await createUser(db, 'outsider@boscotech.net', 'Outsider Otero');

	sectionX = 'section-x';
	await db.asUser(owner.id, (q) =>
		q(`select public.coin_admin_upsert_section($1, null, null, true, null)`, [sectionX])
	);
	await db.asUser(owner.id, (q) =>
		q(`select public.coin_admin_set_student_section($1, $2)`, [studentA.email, sectionX])
	);
}, 180_000);

afterAll(async () => {
	await db.stop();
});

describe('RLS and write boundary', () => {
	test('any signed-in user reads coin_contracts and coin_contract_status', async () => {
		const id = await postContract('Read test contract', 20, 2);
		const rowsAsStudent = await db.asUser(studentB.id, (q) =>
			q<{ id: string }>('select id from public.coin_contracts where id = $1', [id])
		);
		expect(rowsAsStudent.rows).toHaveLength(1);

		const statusAsStudent = await db.asUser(studentB.id, (q) =>
			q<{ status: string; claimed_count: number }>(
				'select status, claimed_count from public.coin_contract_status where id = $1',
				[id]
			)
		);
		expect(statusAsStudent.rows[0]).toEqual({ status: 'open', claimed_count: 0 });
	});

	test('coin_contract_claims is scoped to own rows unless admin', async () => {
		const id = await postContract('Claims RLS contract', 10, 5);
		const a = await claim(studentA.id, id);
		const b = await claim(studentB.id, id);
		expect(a.ok).toBe(true);
		expect(b.ok).toBe(true);

		const asA = await db.asUser(studentA.id, (q) =>
			q<{ student_email: string }>('select student_email from public.coin_contract_claims where contract_id = $1', [id])
		);
		expect(asA.rows.map((r) => r.student_email)).toEqual([studentA.email]);

		const asOwner = await db.asUser(owner.id, (q) =>
			q<{ student_email: string }>(
				'select student_email from public.coin_contract_claims where contract_id = $1 order by student_email',
				[id]
			)
		);
		expect(asOwner.rows.map((r) => r.student_email).sort()).toEqual([studentA.email, studentB.email].sort());
	});

	test('no direct client write on coin_contracts, for a student or an admin', async () => {
		const studentErr = await captureError(() =>
			db.asUser(studentA.id, (q) =>
				q(`insert into public.coin_contracts (title, payout_amount, created_by) values ('x', 5, 'x@boscotech.net')`)
			)
		);
		expect(studentErr.code).toBe('42501');

		const adminErr = await captureError(() =>
			db.asUser(owner.id, (q) =>
				q(`insert into public.coin_contracts (title, payout_amount, created_by) values ('x', 5, 'x@boscotech.net')`)
			)
		);
		expect(adminErr.code).toBe('42501');
	});

	test('no direct client write on coin_contract_claims, for a student or an admin', async () => {
		const id = await postContract('No direct claim write', 10, 3);
		const studentErr = await captureError(() =>
			db.asUser(studentC.id, (q) =>
				q(`insert into public.coin_contract_claims (contract_id, student_email) values ($1, $2)`, [id, studentC.email])
			)
		);
		expect(studentErr.code).toBe('42501');

		const adminErr = await captureError(() =>
			db.asUser(owner.id, (q) =>
				q(`insert into public.coin_contract_claims (contract_id, student_email) values ($1, $2)`, [id, studentC.email])
			)
		);
		expect(adminErr.code).toBe('42501');
	});
});

describe('self-claim refusals', () => {
	test('full: refused once max_contractors is reached, with the exact counts', async () => {
		const id = await postContract('One-slot contract', 10, 1);
		const first = await claim(studentA.id, id);
		expect(first.ok).toBe(true);

		const second = await claim(studentB.id, id);
		expect(second).toMatchObject({ ok: false, reason: 'full', max_contractors: 1, claimed_count: 1 });
	});

	test('already_claimed: a student cannot claim the same contract twice', async () => {
		const id = await postContract('Double claim contract', 10, 3);
		const first = await claim(studentA.id, id);
		expect(first.ok).toBe(true);
		const second = await claim(studentA.id, id);
		expect(second).toEqual({ ok: false, reason: 'already_claimed' });
	});

	test('wrong_section: refused when the contract is section-restricted and the student is not in it', async () => {
		const id = await postContract('Section-restricted contract', 10, 1, sectionX);
		const outsider = await claim(studentOutsider.id, id);
		expect(outsider).toMatchObject({ ok: false, reason: 'wrong_section' });

		const member = await claim(studentA.id, id); // studentA IS assigned to sectionX
		expect(member.ok).toBe(true);
	});

	test('not_open: refused once cancelled', async () => {
		const id = await postContract('Cancel-before-claim contract', 10, 1);
		await db.asUser(owner.id, (q) => q(`select public.coin_admin_cancel_contract($1, 'no longer needed')`, [id]));
		const result = await claim(studentB.id, id);
		expect(result).toEqual({ ok: false, reason: 'not_open' });
	});

	test('unknown contract id raises, not a structured refusal (genuine misuse, not an expected race)', async () => {
		const err = await captureError(() =>
			db.asUser(studentA.id, (q) => q(`select public.coin_contract_self_claim('00000000-0000-0000-0000-000000000000')`))
		);
		expect(err.message).toMatch(/unknown contract/i);
	});
});

describe('concurrency: the capacity lock under REAL concurrent connections', () => {
	test('exactly 3 of 5 simultaneous claims succeed on a 3-slot contract', async () => {
		const id = await postContract('Race contract', 30, 3);

		// Five genuinely separate pool connections, fired together with no
		// awaited ordering between them -- this is what a check-then-insert
		// race without the parent-row lock would double-book. Repeated
		// several times below (a fresh contract each round) because a single
		// pass succeeding is consistent with "got lucky", not with "the lock
		// actually serializes these".
		const results = await Promise.all([
			claim(studentA.id, id),
			claim(studentB.id, id),
			claim(studentC.id, id),
			claim(studentD.id, id),
			claim(studentE.id, id)
		]);

		const succeeded = results.filter((r) => r.ok);
		const full = results.filter((r) => !r.ok && r.reason === 'full');
		expect(succeeded).toHaveLength(3);
		expect(full).toHaveLength(2);

		// The claims table itself agrees -- exactly 3 rows, no duplicates.
		const rows = await db.asUser(owner.id, (q) =>
			q<{ n: string }>('select count(*)::text as n from public.coin_contract_claims where contract_id = $1', [id])
		);
		expect(rows.rows[0].n).toBe('3');
	});

	test('exactly 1 of 5 simultaneous claims succeeds on a 1-slot contract, repeated 5 rounds', async () => {
		// A tighter race (1 slot, 5 contenders) run repeatedly: if the lock
		// were not actually serializing these, SOME round out of 5 would be
		// expected to double-book under real network/scheduling jitter.
		for (let round = 0; round < 5; round++) {
			const id = await postContract(`Tight race contract round ${round}`, 10, 1);
			const results = await Promise.all([
				claim(studentA.id, id),
				claim(studentB.id, id),
				claim(studentC.id, id),
				claim(studentD.id, id),
				claim(studentE.id, id)
			]);
			const succeeded = results.filter((r) => r.ok);
			expect(succeeded, `round ${round}`).toHaveLength(1);
		}
	});

	test('the same student firing two simultaneous claims never produces two rows', async () => {
		const id = await postContract('Same-student double claim race', 10, 5);
		const results = await Promise.all([claim(studentA.id, id), claim(studentA.id, id)]);
		const succeeded = results.filter((r) => r.ok);
		const refused = results.filter((r) => !r.ok);
		expect(succeeded).toHaveLength(1);
		expect(refused).toHaveLength(1);
		expect(refused[0].reason).toBe('already_claimed');
	});
});

/**
 * THE DETERMINISTIC HALF OF THE CAPACITY PROOF, AND WHY THE BURSTS ABOVE ARE
 * NOT THE WHOLE OF IT.
 *
 * The bursts DO bite here -- measured against a scratch copy of 0077 with the
 * `for update` deleted from `coin_contract_self_claim`, the five-round one-slot
 * race reddened 3 of 3 runs and double-booked as far as 4 accepted claims on a
 * 1-slot contract. But it reddens BY CONTENTION, which is luck this suite does
 * not control: across those same three runs the three-slot burst reddened only
 * 1 of 3. A capacity guard whose only proof is a burst is a guard whose proof
 * can go quiet on a loaded machine and certify nothing while still passing --
 * the 0134 lesson, and the one that let the GAUNTLET practice meter keep a
 * deleted advisory lock green 31 times out of 31
 * (docs/history/gauntlet-practice-rate-limit-xm7ye3.md).
 *
 * So the overlap is MANUFACTURED here rather than hoped for. A separate
 * transaction takes the very row lock the RPC needs and HOLDS it; the
 * measurement is how long a claim then waits. With `for update` in the function
 * that is most of a second. Without it the claim reads straight past the held
 * row and returns in milliseconds, which reddens this test every time rather
 * than when the scheduler happens to cooperate.
 */
describe('concurrency: the capacity lock, held from outside and measured', () => {
	const HOLD_MS = 1_200;

	/**
	 * Holds a lock on ONE contract row for HOLD_MS on its own connection.
	 *
	 * `for no key update`, NOT `for update`, AND THE DIFFERENCE IS THE WHOLE
	 * INSTRUMENT. `coin_contract_claims.contract_id` is a foreign key, so the
	 * RPC's INSERT takes `for key share` on this same parent row on its way
	 * past -- and `for key share` conflicts with `for update`. Holding
	 * `for update` here therefore stalls the claim through the FOREIGN KEY
	 * whether or not the function locks anything itself, which makes the
	 * measurement pass on a function with no lock in it. Measured, exactly
	 * that: the first draft of this test was GREEN 3 of 3 against the
	 * lock-deleted mutant.
	 *
	 * `for no key update` conflicts with `for update` and NOT with
	 * `for key share`, so the only thing that can wait on it is the RPC's own
	 * `select ... for update`. The FK check walks straight past.
	 *
	 * Simple protocol (no parameters) so all four statements run as a single
	 * transaction on a single connection; the id is a server-generated uuid.
	 */
	function holdContractRow(contractId: string): Promise<unknown> {
		return db.sql(
			`begin;
			 select 1 from public.coin_contracts where id = '${contractId}' for no key update;
			 select pg_sleep(${HOLD_MS / 1000});
			 commit;`
		);
	}

	test('a claim WAITS for the contract row lock, with an uncontended control', async () => {
		const contended = await postContract('Lock-held contract', 10, 3);
		const free = await postContract('Uncontended contract', 10, 3);

		const holder = holdContractRow(contended);
		// Let the holder actually acquire before the claim goes in.
		await new Promise((r) => setTimeout(r, 250));

		const t0 = Date.now();
		const result = await claim(studentA.id, contended);
		const waitedMs = Date.now() - t0;
		await holder;

		// THE PROOF: it queued behind the row rather than counting past it.
		expect(waitedMs, `the claim did not wait for the row lock (${waitedMs}ms)`).toBeGreaterThan(500);
		// And once it held the row it did the ordinary thing.
		expect(result.ok).toBe(true);

		// POSITIVE CONTROL, same fixture and same clock: an uncontended claim is
		// fast. Without it the wait above could be a slow database rather than a
		// held lock, and a loaded machine would read as a working guard.
		const t1 = Date.now();
		expect((await claim(studentB.id, free)).ok).toBe(true);
		const uncontendedMs = Date.now() - t1;
		expect(uncontendedMs, `uncontended claim was slow (${uncontendedMs}ms)`).toBeLessThan(400);
	}, 30_000);

	test('the lock is per contract, so one contract never serializes another', async () => {
		// Keyed on anything shared -- the table, a global -- one student's in-flight
		// claim would stall every claim in the school behind it, which is a
		// performance defect nothing on screen would ever report. This is the same
		// measurement with the expectation inverted, so it cannot pass by the
		// clock being slow either.
		const held = await postContract('Held contract', 10, 3);
		const other = await postContract('Other contract', 10, 3);

		const holder = holdContractRow(held);
		await new Promise((r) => setTimeout(r, 250));

		const t0 = Date.now();
		expect((await claim(studentC.id, other)).ok).toBe(true);
		const waitedMs = Date.now() - t0;
		await holder;
		expect(waitedMs, `a claim on a different contract waited (${waitedMs}ms)`).toBeLessThan(400);
	}, 30_000);
});

describe('admin lifecycle', () => {
	test('post -> list shows it with computed status and claimants', async () => {
		const id = await postContract('Lifecycle contract', 60, 2);
		await claim(studentA.id, id);

		const listed = await db.asUser(owner.id, (q) =>
			q<{
				id: string;
				status: string;
				claimed_count: number;
				claimants: { student_email: string }[];
			}>('select id, status, claimed_count, claimants from public.coin_admin_list_contracts() where id = $1', [id])
		);
		expect(listed.rows[0].status).toBe('open');
		expect(listed.rows[0].claimed_count).toBe(1);
		expect(listed.rows[0].claimants.map((c) => c.student_email)).toEqual([studentA.email]);
	});

	test('complete splits the payout evenly, including a genuine round-half-up remainder case', async () => {
		// 100 / 3 = 33.333... -> round() = 33 each (99 of 100 actually paid,
		// the documented rounding-down-of-a-non-half remainder).
		const idA = await postContract('Split 100 among 3', 100, 3);
		await claim(studentA.id, idA);
		await claim(studentB.id, idA);
		await claim(studentC.id, idA);

		const before = await Promise.all(
			[studentA, studentB, studentC].map((s) =>
				db.asUser(s.id, (q) => q<{ n: string }>(`select coalesce(sum(amount), 0)::text as n from public.coin_transactions where student_email = $1`, [s.email]))
			)
		);
		expect(before.every((r) => r.rows[0].n === '0')).toBe(true);

		const result = await db.asUser(owner.id, (q) =>
			q<{ coin_admin_complete_contract: { share: number; succeeded: number } }>(
				`select public.coin_admin_complete_contract($1) as coin_admin_complete_contract`,
				[idA]
			)
		);
		expect(result.rows[0].coin_admin_complete_contract.share).toBe(33);
		expect(result.rows[0].coin_admin_complete_contract.succeeded).toBe(3);

		for (const s of [studentA, studentB, studentC]) {
			const bal = await db.asUser(s.id, (q) =>
				q<{ n: string }>(`select coalesce(sum(amount), 0)::text as n from public.coin_transactions where student_email = $1`, [s.email])
			);
			expect(bal.rows[0].n).toBe('33');
		}

		// 15 / 2 = 7.5 -> round-half-up (Postgres round(), away from zero, the
		// same convention 3D Printing / Property Damage already use) = 8
		// each, 16 of 15 actually paid -- the explicit "half" case, not just
		// an ordinary truncation.
		const idB = await postContract('Split 15 among 2 (half-up case)', 15, 2);
		await claim(studentD.id, idB);
		await claim(studentE.id, idB);
		const resultB = await db.asUser(owner.id, (q) =>
			q<{ coin_admin_complete_contract: { share: number } }>(
				`select public.coin_admin_complete_contract($1) as coin_admin_complete_contract`,
				[idB]
			)
		);
		expect(resultB.rows[0].coin_admin_complete_contract.share).toBe(8);

		for (const s of [studentD, studentE]) {
			const bal = await db.asUser(s.id, (q) =>
				q<{ n: string }>(`select coalesce(sum(amount), 0)::text as n from public.coin_transactions where student_email = $1`, [s.email])
			);
			expect(bal.rows[0].n).toBe('8');
		}
	});

	test('complete refuses a contract with zero claimants, and refuses a re-complete', async () => {
		const id = await postContract('No claimants yet', 20, 2);
		const noClaimants = await captureError(() =>
			db.asUser(owner.id, (q) => q(`select public.coin_admin_complete_contract($1)`, [id]))
		);
		expect(noClaimants.message).toMatch(/no one has claimed/i);

		const claimedId = await postContract('Complete then re-complete', 20, 1);
		await claim(studentA.id, claimedId);
		await db.asUser(owner.id, (q) => q(`select public.coin_admin_complete_contract($1)`, [claimedId]));
		const again = await captureError(() =>
			db.asUser(owner.id, (q) => q(`select public.coin_admin_complete_contract($1)`, [claimedId]))
		);
		expect(again.message).toMatch(/already completed/i);
	});

	test('cancel: no payout, claims survive as history, status reads cancelled, cannot complete or re-cancel afterward', async () => {
		const id = await postContract('Cancel with a claim on it', 40, 2);

		// Balance BEFORE, not an absolute zero -- studentB's balance already
		// carries earlier tests' payouts within this shared db, so the real
		// assertion is "cancelling changes nothing", a delta, not a total.
		const before = await db.asUser(owner.id, (q) =>
			q<{ n: string }>(`select coalesce(sum(amount), 0)::text as n from public.coin_transactions where student_email = $1`, [studentB.email])
		);

		await claim(studentB.id, id);

		await db.asUser(owner.id, (q) => q(`select public.coin_admin_cancel_contract($1, 'scope changed')`, [id]));

		const status = await db.asUser(studentB.id, (q) =>
			q<{ status: string }>('select status from public.coin_contract_status where id = $1', [id])
		);
		expect(status.rows[0].status).toBe('cancelled');

		// The claim row is still there -- cancel never deletes history.
		const claims = await db.asUser(owner.id, (q) =>
			q<{ student_email: string }>('select student_email from public.coin_contract_claims where contract_id = $1', [id])
		);
		expect(claims.rows.map((r) => r.student_email)).toEqual([studentB.email]);

		// No payout landed: balance unchanged from before the cancel.
		const after = await db.asUser(owner.id, (q) =>
			q<{ n: string }>(`select coalesce(sum(amount), 0)::text as n from public.coin_transactions where student_email = $1`, [studentB.email])
		);
		expect(after.rows[0].n).toBe(before.rows[0].n);

		const completeAttempt = await captureError(() =>
			db.asUser(owner.id, (q) => q(`select public.coin_admin_complete_contract($1)`, [id]))
		);
		expect(completeAttempt.message).toMatch(/cancelled/i);

		const reCancel = await captureError(() =>
			db.asUser(owner.id, (q) => q(`select public.coin_admin_cancel_contract($1)`, [id]))
		);
		expect(reCancel.message).toMatch(/already cancelled/i);
	});

	test('reset returns a claimed-but-incomplete contract to open, and refuses on a terminal one', async () => {
		const id = await postContract('Reset me', 20, 2);
		await claim(studentA.id, id);
		await claim(studentB.id, id);

		const beforeStatus = await db.asUser(owner.id, (q) =>
			q<{ status: string; claimed_count: number }>('select status, claimed_count from public.coin_contract_status where id = $1', [id])
		);
		expect(beforeStatus.rows[0]).toEqual({ status: 'full', claimed_count: 2 });

		const resetResult = await db.asUser(owner.id, (q) =>
			q<{ coin_admin_reset_contract: { cleared: number } }>(
				`select public.coin_admin_reset_contract($1) as coin_admin_reset_contract`,
				[id]
			)
		);
		expect(resetResult.rows[0].coin_admin_reset_contract.cleared).toBe(2);

		const afterStatus = await db.asUser(owner.id, (q) =>
			q<{ status: string; claimed_count: number }>('select status, claimed_count from public.coin_contract_status where id = $1', [id])
		);
		expect(afterStatus.rows[0]).toEqual({ status: 'open', claimed_count: 0 });

		// The freed slots are real: both students can claim again post-reset.
		const reclaimA = await claim(studentA.id, id);
		const reclaimB = await claim(studentB.id, id);
		expect(reclaimA.ok).toBe(true);
		expect(reclaimB.ok).toBe(true);

		// A completed contract refuses reset.
		const completedId = await postContract('Completed, cannot reset', 10, 1);
		await claim(studentC.id, completedId);
		await db.asUser(owner.id, (q) => q(`select public.coin_admin_complete_contract($1)`, [completedId]));
		const resetCompleted = await captureError(() =>
			db.asUser(owner.id, (q) => q(`select public.coin_admin_reset_contract($1)`, [completedId]))
		);
		expect(resetCompleted.message).toMatch(/already been completed or cancelled/i);

		// A cancelled contract refuses reset too.
		const cancelledId = await postContract('Cancelled, cannot reset', 10, 1);
		await db.asUser(owner.id, (q) => q(`select public.coin_admin_cancel_contract($1)`, [cancelledId]));
		const resetCancelled = await captureError(() =>
			db.asUser(owner.id, (q) => q(`select public.coin_admin_reset_contract($1)`, [cancelledId]))
		);
		expect(resetCancelled.message).toMatch(/already been completed or cancelled/i);
	});
});

describe('permission boundary', () => {
	test('a non-admin student cannot post, complete, cancel, or reset a contract', async () => {
		const id = await postContract('Admin-only boundary contract', 20, 2);
		await claim(studentA.id, id);

		const post = await captureError(() =>
			db.asUser(studentA.id, (q) =>
				q(`select public.coin_admin_post_contract('nope', null, 10, 1, null)`)
			)
		);
		expect(post.message).toMatch(/only site admins/i);

		const complete = await captureError(() =>
			db.asUser(studentA.id, (q) => q(`select public.coin_admin_complete_contract($1)`, [id]))
		);
		expect(complete.message).toMatch(/only site admins/i);

		const cancel = await captureError(() =>
			db.asUser(studentA.id, (q) => q(`select public.coin_admin_cancel_contract($1)`, [id]))
		);
		expect(cancel.message).toMatch(/only site admins/i);

		const reset = await captureError(() =>
			db.asUser(studentA.id, (q) => q(`select public.coin_admin_reset_contract($1)`, [id]))
		);
		expect(reset.message).toMatch(/only site admins/i);

		const list = await db.asUser(studentA.id, (q) =>
			q('select * from public.coin_admin_list_contracts()')
		);
		expect(list.rows).toHaveLength(0); // is_admin()-gated inline, zero rows not an exception -- the coin_admin_list_sections shape
	});

	test('anon has no EXECUTE grant on any contracts RPC', async () => {
		const fns = [
			'coin_contract_self_claim(uuid)',
			'coin_admin_post_contract(text,text,integer,integer,text)',
			'coin_admin_list_contracts()',
			'coin_admin_complete_contract(uuid,text)',
			'coin_admin_cancel_contract(uuid,text)',
			'coin_admin_reset_contract(uuid)'
		];
		for (const fn of fns) {
			const { rows } = await db.sql<{ has_priv: boolean }>(
				`select has_function_privilege('anon', $1, 'EXECUTE') as has_priv`,
				[`public.${fn}`]
			);
			expect(rows[0].has_priv, fn).toBe(false);
		}
	});
});
