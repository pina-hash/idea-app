// tests/classroom-song-queue-race.test.ts
//
// 0145: A FOURTH PENDING REQUEST MUST NOT LAND, EVEN WHEN TWO SUBMITS OVERLAP.
//
// The cap is the only throttle this feature has. Requesting used to cost three
// coins, and that price -- never described as a rate limit -- was the only thing
// standing between one student and forty requests in a period. Making the
// request free removed it, so the cap has to be a real capacity check.
//
// A COUNT-THEN-INSERT WOULD PASS EVERY SEQUENTIAL TEST AND FAIL THE ONE CASE IT
// EXISTS FOR. Under READ COMMITTED each caller gets its own snapshot: with three
// pending rows and two concurrent submits, both count three... but with TWO
// pending rows and two concurrent submits, both count two, both pass the check,
// and the student ends with four. So the enforcement is `select ... for update`
// on the ENROLLMENT row -- CLAUDE.md's own prescription for a capacity check
// that is not a uniqueness -- with the count taken AFTER the lock.
//
// 0143 could use a partial unique index because its cap is ONE, where the cap
// and the uniqueness are the same statement. A cap of three has nothing to be
// unique on, which is why this file exists separately from 0143's race proof
// and takes a different shape.
//
// THE HARD PART IS PROVING THE CONCURRENCY, NOT THE OUTCOME. Firing two calls
// with Promise.all and finding one refusal proves nothing: a burst that happened
// not to overlap produces the identical result on code with no lock at all, and
// a sleep between them guarantees they do not overlap. So the first test FORCES
// and then OBSERVES the overlap, and neither half is a timer:
//
//   1. The student submits their third inside an EXPLICIT, UNCOMMITTED
//      transaction, which takes the enrollment row lock and holds it.
//   2. The same student calls the same RPC on a second connection. It must
//      BLOCK -- that is what `for update` does to a second `for update`.
//   3. The test WAITS FOR THAT BLOCK TO BE VISIBLE in `pg_stat_activity`
//      (wait_event_type = 'Lock'), rather than sleeping and assuming. If it
//      never blocks, the poll times out and the test fails.
//   4. The second promise is asserted UNSETTLED at that moment, which is the
//      actual proof of overlap.
//   5. The first commits. The second then counts three UNDER THE LOCK -- a
//      fresh snapshot that genuinely sees the winner's committed row -- and is
//      refused.
//
// That sequence cannot pass without the lock: with no lock there is nothing to
// block on, step 3 times out, and this file reddens before it reaches any
// outcome assertion.

import { beforeAll, afterAll, beforeEach, describe, expect, test } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';

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
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0137_anon_execute_sweep.sql',
	'0145_classroom_song_queue.sql'
] as const;

/** The harness pool holds 4 connections, so 4 is the real concurrency ceiling. */
const BURST = 4;

let db: TestDb;
let teacher: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let sectionId: string;

interface RequestResult {
	ok: boolean;
	reason?: string;
	request_id?: string;
	cap?: number;
	pending?: number;
}

async function submit(user: SeededUser, url: string): Promise<RequestResult> {
	return db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: RequestResult }>(
			'select public.classroom_song_request($1::uuid, $2::text, null::text) as result',
			[sectionId, url]
		);
		return rows[0].result;
	});
}

async function pendingCount(email: string): Promise<number> {
	const { rows } = await db.sql<{ n: string }>(
		`select count(*)::text as n from public.classroom_song_requests
		 where section_id = $1 and student_email = $2 and decided_at is null`,
		[sectionId, email]
	);
	return Number(rows[0].n);
}

/**
 * Polls until a session in THIS database is blocked on a lock inside the request
 * RPC. Returns false on timeout, which is a failure of the premise rather than
 * of the outcome -- see the header.
 *
 * `datname = current_database()` matters: the cluster is shared by every test
 * file in the run, so an unscoped read would see a neighbour's lock and report a
 * block that has nothing to do with this test.
 */
async function waitForBlockedSubmitter(timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_stat_activity
			 where datname = current_database()
			   and wait_event_type = 'Lock'
			   and query like '%classroom_song_request%'`
		);
		if (Number(rows[0].n) > 0) return true;
		await new Promise((r) => setImmediate(r));
	}
	return false;
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	teacher = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	ana = await createUser(db, 'ana@boscotech.net', 'Ana Reyes');
	ben = await createUser(db, 'ben@boscotech.net', 'Ben Okonkwo');
	sectionId = await createClassroomSection(db, {
		as: teacher,
		courseCode: 'IDEA100',
		courseTitle: 'Intro to Engineering Design',
		label: 'Period 1',
		teacherEmail: teacher.email
	});
	await enrollStudent(db, { as: teacher, sectionId, email: ana.email, displayName: 'Ana Reyes' });
	await enrollStudent(db, { as: teacher, sectionId, email: ben.email, displayName: 'Ben Okonkwo' });
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

beforeEach(async () => {
	await db.sql('delete from public.classroom_song_requests');
});

describe('the pending cap is the database, not the button', () => {
	/**
	 * THE MECHANISM, PINNED SEPARATELY FROM THE BEHAVIOUR. `for update` inside
	 * the RPC is what the race below actually exercises; if somebody replaced it
	 * with a bare count the race would stop firing rather than fail loudly, so
	 * the lock is asserted in the function's own source too.
	 *
	 * READ OFF `pg_proc`, not off the file on disk: the question is what this
	 * database is running.
	 */
	test('the request RPC locks the enrollment row before it counts', async () => {
		const { rows } = await db.sql<{ src: string }>(
			`select p.prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = 'classroom_song_request'`
		);
		expect(rows).toHaveLength(1);
		const src = rows[0].src;
		expect(src).toContain('classroom_enrollments');
		expect(src).toContain('for update');
		// THE ORDER IS THE RULE. Counting before the lock is the same race with
		// an extra step, and it would still contain both strings.
		expect(src.indexOf('for update')).toBeLessThan(src.indexOf('decided_at is null'));
	});

	test('a concurrent fourth submit BLOCKS on the third and is then refused', async () => {
		// Two already waiting, so the in-flight transaction below is the third and
		// the blocked caller would be the fourth.
		expect((await submit(ana, 'https://example.com/1')).ok).toBe(true);
		expect((await submit(ana, 'https://example.com/2')).ok).toBe(true);
		expect(await pendingCount(ana.email)).toBe(2);

		let signalInserted!: () => void;
		const inserted = new Promise<void>((r) => (signalInserted = r));
		let releaseA!: () => void;
		const commitGate = new Promise<void>((r) => (releaseA = r));

		// A: the third, inside an explicit transaction that HOLDS the enrollment
		// row lock.
		const aPromise = db.asUser(ana.id, async (q) => {
			await q('begin');
			const { rows } = await q<{ result: RequestResult }>(
				'select public.classroom_song_request($1::uuid, $2::text, null::text) as result',
				[sectionId, 'https://example.com/3']
			);
			signalInserted();
			await commitGate;
			await q('commit');
			return rows[0].result;
		});

		await inserted;

		// B: the SAME student, on its own connection. This must block on A's lock.
		let bSettled = false;
		const bPromise = submit(ana, 'https://example.com/4').then((r) => {
			bSettled = true;
			return r;
		});

		const blocked = await waitForBlockedSubmitter(10_000);
		// THE PREMISE. False here means the two calls never contended, and
		// everything below would be measuring a sequence rather than a race.
		expect(blocked).toBe(true);
		// THE PROOF OF OVERLAP: B is inside the RPC while A is still uncommitted.
		expect(bSettled).toBe(false);

		releaseA();
		const [a, b] = await Promise.all([aPromise, bPromise]);

		expect(a.ok).toBe(true);
		expect(b.ok).toBe(false);
		expect(b.reason).toBe('pending_cap');
		// B counted UNDER the lock, on a fresh snapshot that saw A's commit.
		expect(b.pending).toBe(3);
		expect(b.cap).toBe(3);

		// THE ROW COUNT IS THE ASSERTION THAT MATTERS. One refusal reported is
		// not the same claim as three rows existing.
		expect(await pendingCount(ana.email)).toBe(3);
	});

	/**
	 * THE BURST, WHICH IS THE CASE A COUNT-THEN-INSERT ACTUALLY LOSES. Starting
	 * from TWO pending rather than three: without the lock both remaining callers
	 * read two, both pass, and the student ends with four.
	 */
	test('four concurrent submits from one student still leave exactly three', async () => {
		const results = await Promise.all(
			Array.from({ length: BURST }, (_, i) => submit(ana, `https://example.com/b${i}`))
		);
		expect(results.filter((r) => r.ok)).toHaveLength(3);
		const refused = results.filter((r) => !r.ok);
		expect(refused).toHaveLength(1);
		expect(refused[0].reason).toBe('pending_cap');
		expect(await pendingCount(ana.email)).toBe(3);
	});

	/**
	 * THE LOCK IS PER STUDENT, WHICH IS WHAT MAKES IT USABLE IN A CLASS OF
	 * THIRTY. Locking something shared -- the section, or a global -- would
	 * serialize every submit in the room behind every other one and would pass
	 * every test above. Ana holding her enrollment row uncommitted must not stop
	 * Ben submitting at all.
	 */
	test('one student\'s in-flight submit does not block another student', async () => {
		let signalInserted!: () => void;
		const inserted = new Promise<void>((r) => (signalInserted = r));
		let releaseA!: () => void;
		const commitGate = new Promise<void>((r) => (releaseA = r));

		const aPromise = db.asUser(ana.id, async (q) => {
			await q('begin');
			await q('select public.classroom_song_request($1::uuid, $2::text, null::text)', [
				sectionId,
				'https://example.com/ana'
			]);
			signalInserted();
			await commitGate;
			await q('commit');
		});

		await inserted;
		// Ben's submit completes while Ana's transaction is still open. If this
		// hangs, the lock is on the wrong row and the test times out.
		const ben1 = await submit(ben, 'https://example.com/ben');
		expect(ben1.ok).toBe(true);

		releaseA();
		await aPromise;
		expect(await pendingCount(ana.email)).toBe(1);
		expect(await pendingCount(ben.email)).toBe(1);
	});
});
