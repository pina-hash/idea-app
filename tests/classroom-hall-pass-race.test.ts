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
	'0143_classroom_hall_pass.sql',
	'0144_classroom_hall_pass_close_by_id.sql'
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

// ---------------------------------------------------------------------------
// 0144: THE MANAGER'S CLOSE MUST NOT LAND ON A PASS THAT REPLACED THE ONE THEY
// MEANT.
//
// THE DEFECT. `classroom_hall_pass_close(p_section_id)` closes "whatever is
// open in this section" at the instant the request lands. So an instructor
// clearing a pass in the same moment one student returns and another leaves
// closes the SECOND student's pass: that student is marked back in the room
// while standing in a corridor, and the pass is free for a third. Every row is
// well formed, the capacity index is satisfied, and nothing anywhere reports it
// -- which is exactly the shape of regression this suite exists for.
//
// A `for update` LOCK DOES NOT FIX IT AND 0143 ALREADY HAD ONE. A lock makes
// two callers agree about one ROW. It cannot make an instructor's INTENT
// survive the row underneath it being replaced, because the target is
// re-resolved server-side AFTER the replacement has committed. The lock is
// taken on the wrong pass.
//
// SO THE PROOF HAS TO BE THE THREE-WAY INTERLEAVING, NOT A BURST. A
// `Promise.all` of three calls does not discriminate here for the same reason
// it does not discriminate for the capacity rule one describe block up: the
// wrong close and the right one both leave a well-formed table, and a burst
// that happened not to overlap produces the correct outcome on defective code.
// A sleep is worse still -- it guarantees the interleaving never happens.
//
// WHAT THIS DOES INSTEAD IS FORCE THE ORDER WITH A GENUINELY BLOCKED
// TRANSACTION, and every step is observed rather than assumed:
//
//   1. Ana holds the pass. Her pass id is what the instructor's screen is
//      showing, and it is captured HERE -- before anything moves -- which is
//      the whole point: it is a value read at one instant and used at a later
//      one.
//   2. Ana signs herself back in inside an EXPLICIT, UNCOMMITTED transaction.
//      Her row is stamped and locked, and the index entry's deletion is
//      pending.
//   3. Ben signs out on a second connection. His insert MUST BLOCK on the
//      partial unique index, which still sees Ana's entry as live.
//   4. The test polls `pg_stat_activity` until that block is real
//      (wait_event_type = 'Lock'), and asserts Ben's promise is UNSETTLED at
//      that moment. If he never blocks, the poll times out and this reddens
//      before reaching any outcome assertion.
//   5. Ana commits. Ben's insert then succeeds and he genuinely holds the pass.
//      The test AWAITS that, so the instructor's press below is not racing
//      anything -- the interleaving has already happened and the table is
//      settled.
//   6. The instructor presses clear with ANA's pass id, the one from step 1.
//
// Step 6 is the whole test. Naming the pass, it finds Ana's already closed and
// refuses; resolving the section, it closes BEN.
// ---------------------------------------------------------------------------

interface CloseResult {
	ok: boolean;
	reason?: string;
	pass_id?: string;
	student_email?: string | null;
}

/** The manager's close: names the pass. */
async function closeById(user: SeededUser, passId: string): Promise<CloseResult> {
	return db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: CloseResult }>(
			'select public.classroom_hall_pass_close_by_id($1::uuid) as result',
			[passId]
		);
		return rows[0].result;
	});
}

/** The id and holder of whatever is open, read past RLS by the harness. */
async function openRow(): Promise<{ id: string; student_email: string } | null> {
	const { rows } = await db.sql<{ id: string; student_email: string }>(
		'select id, student_email from public.classroom_hall_passes where closed_at is null'
	);
	return rows[0] ?? null;
}

describe('a manager clearing a pass cannot close the one that replaced it', () => {
	test('student A returns, student B leaves, the manager clears, and B stays out', async () => {
		await db.sql('delete from public.classroom_hall_passes');

		// 1. ANA IS OUT, and this is the id the instructor's card is showing.
		const ana = students[0];
		const ben = students[1];
		expect((await openPass(ana)).ok).toBe(true);
		const anasPass = (await openRow())!.id;

		let signalClosed!: () => void;
		const closed = new Promise<void>((r) => (signalClosed = r));
		let releaseAna!: () => void;
		const commitGate = new Promise<void>((r) => (releaseAna = r));

		// 2. ANA SIGNS HERSELF BACK IN, uncommitted, holding the row.
		const anaPromise = db.asUser(ana.id, async (q) => {
			await q('begin');
			const { rows } = await q<{ result: CloseResult }>(
				'select public.classroom_hall_pass_close_mine($1::uuid) as result',
				[sectionId]
			);
			signalClosed();
			await commitGate;
			await q('commit');
			return rows[0].result;
		});
		await closed;

		// 3. BEN SIGNS OUT. His insert blocks on Ana's pending index entry.
		let benSettled = false;
		const benPromise = openPass(ben).then((r) => {
			benSettled = true;
			return r;
		});

		// 4. THE BLOCK IS OBSERVED, NOT ASSUMED.
		const blocked = await waitForBlockedOpener(10_000);
		expect(blocked).toBe(true);
		// THE PROOF OF OVERLAP: Ben is provably inside the open RPC while Ana's
		// close is still uncommitted. This is the instant the defect needs.
		expect(benSettled).toBe(false);

		// 5. ANA COMMITS; BEN'S PASS IS REAL AND SETTLED BEFORE THE MANAGER ACTS.
		releaseAna();
		const [anaClose, benOpen] = await Promise.all([anaPromise, benPromise]);
		expect(anaClose.ok).toBe(true);
		expect(benOpen.ok).toBe(true);

		const bensRow = (await openRow())!;
		expect(bensRow.student_email).toBe(ben.email);
		expect(bensRow.id).not.toBe(anasPass);

		// 6. THE MANAGER PRESSES CLEAR, with the id from step 1.
		const cleared = await closeById(teacher, anasPass);

		// THE REFUSAL, AND IT IS THE HONEST ONE: the pass they meant had already
		// been signed back in by the student. Not a reported close of a pass this
		// call never touched.
		expect(cleared.ok).toBe(false);
		expect(cleared.reason).toBe('already_closed');

		// AND THE ASSERTION THE WHOLE BUNDLE EXISTS FOR: BEN IS STILL OUT.
		const after = await openRow();
		expect(after).not.toBeNull();
		expect(after!.id).toBe(bensRow.id);
		expect(after!.student_email).toBe(ben.email);
		expect(await openCount()).toBe(1);

		// Ben's row was not merely left open -- it was not written to at all.
		const { rows: untouched } = await db.sql<{ closed_by: string | null }>(
			'select closed_by from public.classroom_hall_passes where id = $1',
			[bensRow.id]
		);
		expect(untouched[0].closed_by).toBeNull();

		// Ana's own row records ANA as the closer, not the instructor whose press
		// arrived afterwards. `closed_by` is the only record of who acted.
		const { rows: anaRow } = await db.sql<{ closed_by: string }>(
			'select closed_by from public.classroom_hall_passes where id = $1',
			[anasPass]
		);
		expect(anaRow[0].closed_by).toBe(ana.email);

		/**
		 * THE POSITIVE CONTROL, and it is what stops every assertion above from
		 * passing on a close that simply never works. The same instructor, on the
		 * same connection, naming the pass that IS open closes it.
		 */
		const good = await closeById(teacher, bensRow.id);
		expect(good.ok).toBe(true);
		expect(good.student_email).toBe(ben.email);
		expect(await openCount()).toBe(0);
	});

	/**
	 * THE STUDENT PATH CANNOT HAVE THIS RACE AT ALL, and the reason is
	 * structural rather than careful: it requires the open pass's holder to BE
	 * the caller. Ana pressing "back" a moment too late finds BEN's row, not her
	 * own, and the worst outcome available to her is a refusal.
	 *
	 * This is why the section is a safe handle for a student and not for an
	 * instructor -- the asymmetry that makes the split possible at all, and it
	 * is asserted rather than argued.
	 */
	test('a student pressing back too late is refused, never given somebody else', async () => {
		await db.sql('delete from public.classroom_hall_passes');
		const ana = students[0];
		const ben = students[1];

		expect((await openPass(ana)).ok).toBe(true);
		await db.asUser(ana.id, (q) =>
			q('select public.classroom_hall_pass_close_mine($1::uuid)', [sectionId])
		);
		expect((await openPass(ben)).ok).toBe(true);
		const bensRow = (await openRow())!;

		// Ana taps again -- her card had not caught up. She names no pass, so the
		// only thing this can resolve to is Ben's open row, and it refuses.
		const late = await db.asUser(ana.id, async (q) => {
			const { rows } = await q<{ result: CloseResult }>(
				'select public.classroom_hall_pass_close_mine($1::uuid) as result',
				[sectionId]
			);
			return rows[0].result;
		});
		expect(late.ok).toBe(false);
		expect(late.reason).toBe('not_yours');
		// It names nobody: the refusal is one word and carries no email.
		expect(JSON.stringify(late)).not.toContain(ben.email);

		// BEN IS STILL OUT.
		expect((await openRow())!.id).toBe(bensRow.id);
		expect(await openCount()).toBe(1);

		// POSITIVE CONTROL: Ben's own press on the same path closes it.
		const his = await db.asUser(ben.id, async (q) => {
			const { rows } = await q<{ result: CloseResult }>(
				'select public.classroom_hall_pass_close_mine($1::uuid) as result',
				[sectionId]
			);
			return rows[0].result;
		});
		expect(his.ok).toBe(true);
		expect(await openCount()).toBe(0);
	});
});
