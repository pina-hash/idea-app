// tests/classroom-hall-pass-race.test.ts
//
// 0143: TWO STUDENTS TAPPING AT ONCE MUST RESOLVE TO ONE PASS AND ONE REFUSAL.
//
// "One student out at a time" is the whole feature. A count-then-insert would
// satisfy it in every test written as a sequence and fail in the one case it
// exists for: under READ COMMITTED two callers get their own snapshots, both
// count zero, and both go out. So the enforcement is a PARTIAL UNIQUE INDEX on
// `(section_id) where closed_at is null`, and the open RPC turns the resulting
// violation into a refusal that names no database object.
//
// THE HARD PART OF TESTING THIS IS PROVING THE CONCURRENCY, NOT THE OUTCOME.
// Firing N calls with Promise.all and finding one winner proves nothing at all
// here: because the pass STAYS OPEN, a burst that happened not to overlap
// produces exactly the same one-winner-and-N-1-refusals result on code with no
// capacity check of any kind in it. A sleep between the calls is worse -- it
// guarantees they do not overlap.
//
// SO THE FIRST TEST FORCES AND THEN OBSERVES THE OVERLAP, and neither half is a
// timer:
//
//   1. Student A opens the pass inside an EXPLICIT, UNCOMMITTED transaction, so
//      the row exists in A's snapshot and the index entry is held but not
//      visible to anybody else.
//   2. Student B calls the same RPC on a second connection. It must BLOCK --
//      that is what a unique index does to a conflicting insert against an
//      in-flight transaction.
//   3. The test WAITS FOR THAT BLOCK TO BE VISIBLE IN `pg_stat_activity`
//      (wait_event_type = 'Lock'), rather than sleeping and assuming. If B
//      never blocks, the poll times out and the test fails.
//   4. B's promise is asserted UNSETTLED at that moment, which is the actual
//      proof: B is provably inside the RPC while A's transaction is still open.
//   5. A commits. B's insert then fails the unique check and comes back as a
//      structured refusal, and exactly one open row exists.
//
// That sequence cannot pass on an implementation without the index: with no
// index there is nothing for B to block on, step 3 times out, and the file
// reddens before it ever reaches the outcome assertions.

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
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
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0137_anon_execute_sweep.sql',
	'0143_classroom_hall_pass.sql'
] as const;

/** The harness pool holds 4 connections, so 4 is the real concurrency ceiling. */
const BURST = 4;

let db: TestDb;
let teacher: SeededUser;
let students: SeededUser[];
let sectionId: string;

interface OpenResult {
	ok: boolean;
	reason?: string;
	pass_id?: string;
}

async function openPass(user: SeededUser): Promise<OpenResult> {
	return db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: OpenResult }>(
			'select public.classroom_hall_pass_open($1::uuid) as result',
			[sectionId]
		);
		return rows[0].result;
	});
}

async function openCount(): Promise<number> {
	const { rows } = await db.sql<{ n: string }>(
		'select count(*)::text as n from public.classroom_hall_passes where closed_at is null'
	);
	return Number(rows[0].n);
}

/**
 * Polls until a session in THIS database is blocked on a lock inside the open
 * RPC. Returns false on timeout, which is a failure of the premise rather than
 * of the outcome -- see the header.
 *
 * `datname = current_database()` matters: the cluster is shared by every test
 * file in the run, so an unscoped read would see a neighbour's lock and report
 * a block that has nothing to do with this test.
 */
async function waitForBlockedOpener(timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_stat_activity
			 where datname = current_database()
			   and wait_event_type = 'Lock'
			   and query like '%classroom_hall_pass_open%'`
		);
		if (Number(rows[0].n) > 0) return true;
		await new Promise((r) => setImmediate(r));
	}
	return false;
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	teacher = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	sectionId = await createClassroomSection(db, {
		as: teacher,
		courseCode: 'IDEA100',
		courseTitle: 'Intro to Engineering Design',
		label: 'Period 1',
		teacherEmail: teacher.email
	});
	students = [];
	for (let i = 0; i < BURST; i += 1) {
		const s = await createUser(db, `s${i}@boscotech.net`, `Student ${i}`);
		await enrollStudent(db, {
			as: teacher,
			sectionId,
			email: s.email,
			displayName: `Student ${i}`
		});
		students.push(s);
	}
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

describe('the capacity check is the database, not the button', () => {
	/**
	 * THE INDEX ITSELF, ASSERTED FROM THE CATALOG. The race test below cannot
	 * fire if somebody replaces the index with an RPC-side count, but neither
	 * would it necessarily fail in an obvious way -- so the mechanism is pinned
	 * separately from the behaviour. Unique AND partial are both asserted: a
	 * unique index without the `where closed_at is null` predicate would allow
	 * exactly one pass per section FOREVER, which is a very different bug.
	 */
	test('one open pass per section is a partial unique index', async () => {
		const { rows } = await db.sql<{ indexdef: string }>(
			`select indexdef from pg_indexes
			 where schemaname = 'public'
			   and tablename = 'classroom_hall_passes'
			   and indexname = 'classroom_hall_passes_one_open_per_section'`
		);
		expect(rows.length).toBe(1);
		expect(rows[0].indexdef).toContain('CREATE UNIQUE INDEX');
		expect(rows[0].indexdef).toContain('(section_id)');
		expect(rows[0].indexdef).toContain('WHERE (closed_at IS NULL)');
	});

	test('a second opener BLOCKS on the first and is then refused', async () => {
		await db.sql('delete from public.classroom_hall_passes');

		let signalInserted!: () => void;
		const inserted = new Promise<void>((r) => (signalInserted = r));
		let releaseA!: () => void;
		const commitGate = new Promise<void>((r) => (releaseA = r));

		// A: opens inside an explicit transaction and HOLDS it.
		const aPromise = db.asUser(students[0].id, async (q) => {
			await q('begin');
			const { rows } = await q<{ result: OpenResult }>(
				'select public.classroom_hall_pass_open($1::uuid) as result',
				[sectionId]
			);
			signalInserted();
			await commitGate;
			await q('commit');
			return rows[0].result;
		});

		await inserted;

		// B: the same call on its own connection. This must block.
		let bSettled = false;
		const bPromise = openPass(students[1]).then((r) => {
			bSettled = true;
			return r;
		});

		const blocked = await waitForBlockedOpener(10_000);
		// THE PREMISE. If this is false the two calls never contended and
		// everything below would be measuring a sequence, not a race.
		expect(blocked).toBe(true);
		// THE PROOF OF OVERLAP: B is inside the RPC while A is still uncommitted.
		expect(bSettled).toBe(false);

		releaseA();
		const [a, b] = await Promise.all([aPromise, bPromise]);

		// ONE PASS AND ONE CLEAR REFUSAL.
		expect(a.ok).toBe(true);
		expect(b.ok).toBe(false);
		expect(b.reason).toBe('taken');
		expect(await openCount()).toBe(1);

		/**
		 * THE REFUSAL NAMES NO DATABASE OBJECT. A raw unique violation would put
		 * the constraint name, the table name and the column list in front of a
		 * student; `reason` is the whole of what a surface renders.
		 */
		const blob = JSON.stringify(b);
		expect(blob).not.toContain('classroom_hall_passes');
		expect(blob).not.toContain('one_open_per_section');
		expect(blob).not.toContain('duplicate key');
		expect(blob).not.toContain('constraint');
	});

	test('a burst of four resolves to one pass and three refusals', async () => {
		await db.sql('delete from public.classroom_hall_passes');

		const results = await Promise.all(students.map((s) => openPass(s)));
		const winners = results.filter((r) => r.ok);
		const refused = results.filter((r) => !r.ok);

		expect(winners.length).toBe(1);
		expect(refused.length).toBe(BURST - 1);
		expect(refused.every((r) => r.reason === 'taken')).toBe(true);
		// The row count is the assertion that matters: one winner reported is not
		// the same claim as one row existing.
		expect(await openCount()).toBe(1);

		// The winner's own id is the row that is actually open.
		const { rows } = await db.sql<{ id: string }>(
			'select id from public.classroom_hall_passes where closed_at is null'
		);
		expect(rows.map((r) => r.id)).toEqual([winners[0].pass_id]);
	});

	test('the same student tapping twice is told they are already out', async () => {
		await db.sql('delete from public.classroom_hall_passes');
		expect((await openPass(students[0])).ok).toBe(true);
		const again = await openPass(students[0]);
		expect(again.ok).toBe(false);
		// NOT `taken`: the honest answer to "why can I not go" is different when
		// the person holding the pass is you.
		expect(again.reason).toBe('already_out');
		expect(await openCount()).toBe(1);
	});

	/**
	 * THE CAPACITY IS PER SECTION, WHICH IS THE DECISION -- not per student and
	 * not global. A pass open in one class must not stop a different class.
	 */
	test('the capacity is per section', async () => {
		await db.sql('delete from public.classroom_hall_passes');
		const otherSection = await createClassroomSection(db, {
			as: teacher,
			courseCode: 'IDEA100',
			label: 'Period 2',
			teacherEmail: teacher.email
		});
		await enrollStudent(db, {
			as: teacher,
			sectionId: otherSection,
			email: students[1].email,
			displayName: 'Student 1'
		});

		expect((await openPass(students[0])).ok).toBe(true);
		const elsewhere = await db.asUser(students[1].id, async (q) => {
			const { rows } = await q<{ result: OpenResult }>(
				'select public.classroom_hall_pass_open($1::uuid) as result',
				[otherSection]
			);
			return rows[0].result;
		});
		expect(elsewhere.ok).toBe(true);
		expect(await openCount()).toBe(2);
		await db.sql('delete from public.classroom_hall_passes');
	});
});
