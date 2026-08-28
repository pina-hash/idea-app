// tests/classroom-hall-pass.test.ts
//
// 0143: THE DIGITAL BATHROOM PASS -- what a student may learn, and who may
// close a pass.
//
// EVERY ASSERTION HERE IS ABOUT A GUARANTEE WHOSE REGRESSION WOULD BE SILENT,
// which is the bar this suite is deliberately narrow to. Nothing about the
// pass's ordinary behaviour is tested here -- that fails visibly the first time
// somebody looks at the class page. What is tested is the shape a wrong answer
// takes without anything on screen changing:
//
//   * a student learning WHO is out (the payload still renders; it just carries
//     a name it should not),
//   * a student closing somebody else's pass (the pass closes, which is what a
//     working close looks like),
//   * the raw table becoming readable (nothing in the app reads it, so nothing
//     in the app would report it).
//
// EVERY EXCLUSION IS PAIRED WITH A POSITIVE CONTROL. "A student cannot see the
// name" is worthless unless the same fixture demonstrably HAS a name to see,
// through a caller who is allowed to see it -- otherwise a projection that
// returned an empty object for everybody would pass every absence assertion in
// this file.
//
// The capacity check is proven in tests/classroom-hall-pass-race.test.ts, which
// needs concurrent connections and a different shape.

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';

/**
 * 0143's own dependency chain, not the notebook default.
 *
 * 0137 goes before it rather than last, which is the production ordering and is
 * correct here for the reason CLAUDE.md gives: the sweep is a one-time repair of
 * what already existed, and a function created AFTER it is not covered by it and
 * must revoke for itself. 0143's three functions do exactly that, and the grant
 * assertions below are what hold them to it -- if 0143 ever stopped naming the
 * roles, `anon` would hold EXECUTE and this file would redden.
 */
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

let db: TestDb;
let teacher: SeededUser;
let otherTeacher: SeededUser;
let ana: SeededUser;
let ben: SeededUser;
let cass: SeededUser;
let sectionId: string;
let otherSectionId: string;

const ANA_NAME = 'Ana Reyes';
const BEN_NAME = 'Ben Okonkwo';

async function rpc<T>(user: SeededUser, call: string, params: unknown[] = []): Promise<T> {
	return db.asUser(user.id, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

const state = (user: SeededUser, section = sectionId) =>
	rpc<Record<string, unknown> | null>(user, 'public.classroom_hall_pass_state($1::uuid)', [section]);

const open = (user: SeededUser, section = sectionId) =>
	rpc<{ ok: boolean; reason?: string; pass_id?: string }>(
		user,
		'public.classroom_hall_pass_open($1::uuid)',
		[section]
	);

const close = (user: SeededUser, section = sectionId) =>
	rpc<Record<string, unknown>>(user, 'public.classroom_hall_pass_close($1::uuid)', [section]);

/** Clears every pass so each test starts from a known, derived-empty state. */
async function resetPasses(): Promise<void> {
	await db.sql('delete from public.classroom_hall_passes');
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	teacher = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	otherTeacher = await createUser(db, 'mlopez@boscotech.edu', 'M. Lopez');
	ana = await createUser(db, 'ana@boscotech.net', ANA_NAME);
	ben = await createUser(db, 'ben@boscotech.net', BEN_NAME);
	cass = await createUser(db, 'cass@boscotech.net', 'Cass Ito');

	sectionId = await createClassroomSection(db, {
		as: teacher,
		courseCode: 'IDEA100',
		courseTitle: 'Intro to Engineering Design',
		label: 'Period 1',
		teacherEmail: teacher.email
	});
	otherSectionId = await createClassroomSection(db, {
		as: otherTeacher,
		courseCode: 'IDEA209H',
		courseTitle: 'Engineering I Honors',
		label: 'Period 4',
		teacherEmail: otherTeacher.email
	});

	await enrollStudent(db, { as: teacher, sectionId, email: ana.email, displayName: ANA_NAME });
	await enrollStudent(db, { as: teacher, sectionId, email: ben.email, displayName: BEN_NAME });
	// Cass is a student of a DIFFERENT section. Every "another student" assertion
	// below uses her, so the thing being refused is genuinely somebody else's.
	await enrollStudent(db, {
		as: otherTeacher,
		sectionId: otherSectionId,
		email: cass.email,
		displayName: 'Cass Ito'
	});
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// The table itself. Every path is a definer RPC, so this is the floor the two
// projections stand on rather than a second-guess of them.
// ---------------------------------------------------------------------------

describe('the pass table is shut', () => {
	test('RLS is on, with no policy and no client grant', async () => {
		const { rows: rls } = await db.sql<{ relrowsecurity: boolean }>(
			`select relrowsecurity from pg_class where oid = 'public.classroom_hall_passes'::regclass`
		);
		expect(rls[0].relrowsecurity).toBe(true);

		const { rows: policies } = await db.sql<{ n: string }>(
			`select count(*)::text as n from pg_policies
			 where schemaname = 'public' and tablename = 'classroom_hall_passes'`
		);
		expect(policies[0].n).toBe('0');

		const { rows: grants } = await db.sql<{ grantee: string; privilege_type: string }>(
			`select grantee, privilege_type from information_schema.role_table_grants
			 where table_schema = 'public' and table_name = 'classroom_hall_passes'
			 and grantee in ('anon', 'authenticated', 'public')`
		);
		expect(grants).toEqual([]);
	});

	/**
	 * THE RAW-TABLE PATH, ASSERTED AS A REFUSAL RATHER THAN AS AN EMPTY RESULT.
	 * A select that came back with zero rows would also satisfy "cannot see
	 * another student's name", and would do so for the wrong reason -- it would
	 * mean a policy was filtering, which is a thing that can later be widened.
	 * The missing GRANT is what makes this a permission error, and a permission
	 * error is the answer that cannot be widened by a policy edit.
	 */
	test('a student selecting the raw table is refused outright, not filtered', async () => {
		await open(ana);
		const attempt = await db
			.asUser(ben.id, (q) => q('select student_email from public.classroom_hall_passes'))
			.then(() => ({ refused: false, code: '' }))
			.catch((e: unknown) => ({ refused: true, code: (e as { code?: string }).code ?? '' }));
		expect(attempt.refused).toBe(true);
		// 42501 -- insufficient_privilege. Not "no rows".
		expect(attempt.code).toBe('42501');

		// POSITIVE CONTROL: the row is genuinely there to be read, by a caller
		// that bypasses RLS and grants entirely.
		const { rows } = await db.sql<{ n: string }>(
			'select count(*)::text as n from public.classroom_hall_passes'
		);
		expect(rows[0].n).toBe('1');
		await resetPasses();
	});

	test('the three functions are granted to authenticated and never to anon', async () => {
		const { rows } = await db.sql<{ sig: string; anon_x: boolean; auth_x: boolean }>(
			`select p.oid::regprocedure::text as sig,
			        has_function_privilege('anon', p.oid, 'execute') as anon_x,
			        has_function_privilege('authenticated', p.oid, 'execute') as auth_x
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname like 'classroom_hall_pass%'
			 order by 1`
		);
		// Asserting the COUNT so a function added later cannot slip past this
		// sweep by simply not being in a list somebody wrote out.
		expect(rows.length).toBe(3);
		for (const r of rows) {
			expect({ sig: r.sig, anon: r.anon_x, authed: r.auth_x }).toEqual({
				sig: r.sig,
				anon: false,
				authed: true
			});
		}
	});
});

// ---------------------------------------------------------------------------
// DISCLOSURE. The whole reason this file exists.
// ---------------------------------------------------------------------------

describe('what an enrolled student may learn', () => {
	test('a peer sees TAKEN and nothing that identifies who', async () => {
		await resetPasses();
		const opened = await open(ana);
		expect(opened.ok).toBe(true);

		const peer = await state(ben);
		expect(peer).not.toBeNull();
		expect(peer?.taken).toBe(true);
		expect(peer?.mine).toBe(false);

		/**
		 * ASSERTED AS THE EXACT KEY SET, not as a handful of `toBeUndefined`
		 * checks. A field added to this projection later -- a name, an email, a
		 * pass id, a duration, a history array -- reddens here whether or not
		 * anybody thought to write an assertion for it, which is the only shape
		 * of this test that survives the change it exists to catch.
		 */
		expect(Object.keys(peer ?? {}).sort()).toEqual([
			'mine',
			'opened_at',
			'scope',
			'section_id',
			'taken'
		]);
		expect(peer?.scope).toBe('student');
		// Somebody ELSE is out, so even the timestamp is withheld: `opened_at` is
		// present as a key and null as a value.
		expect(peer?.opened_at).toBeNull();

		// AND THE NAME IS NOWHERE IN THE SERIALIZED PAYLOAD, checked as a string
		// sweep rather than key by key -- a name nested inside some future
		// sub-object would pass a key-set check on the top level alone.
		const blob = JSON.stringify(peer);
		expect(blob).not.toContain(ANA_NAME);
		expect(blob).not.toContain(ana.email);
		expect(blob).not.toContain('Reyes');

		/**
		 * THE POSITIVE CONTROL, AND IT IS THE HALF THAT MAKES THE THREE
		 * ASSERTIONS ABOVE MEAN ANYTHING. The very same open pass, read by the
		 * section's instructor, DOES carry the name and the email -- so the
		 * fixture demonstrably has something to disclose and the student
		 * projection is withholding it, rather than there being nothing there.
		 */
		const staff = await state(teacher);
		const staffBlob = JSON.stringify(staff);
		expect(staffBlob).toContain(ANA_NAME);
		expect(staffBlob).toContain(ana.email);
		expect((staff?.open as Record<string, unknown>)?.student_name).toBe(ANA_NAME);
	});

	test('the holder sees their own pass and their own timestamp', async () => {
		await resetPasses();
		await open(ana);
		const mine = await state(ana);
		expect(mine?.taken).toBe(true);
		expect(mine?.mine).toBe(true);
		expect(mine?.opened_at).toBeTruthy();
		// Their own state still carries no name, no email and no pass id -- there
		// is nothing on this surface that needs one.
		expect(Object.keys(mine ?? {}).sort()).toEqual([
			'mine',
			'opened_at',
			'scope',
			'section_id',
			'taken'
		]);
	});

	test('a student is never handed a history, however many passes exist', async () => {
		await resetPasses();
		for (const s of [ana, ben, ana]) {
			await open(s);
			await close(s);
		}
		const seen = await state(ben);
		expect(seen?.history).toBeUndefined();
		expect(seen?.taken).toBe(false);
		expect(JSON.stringify(seen)).not.toContain(ANA_NAME);

		// POSITIVE CONTROL: three closed passes are genuinely on file, and the
		// instructor's read returns all three with names on them.
		const staff = await state(teacher);
		const history = staff?.history as Record<string, unknown>[];
		expect(history.length).toBe(3);
		expect(history.map((h) => h.student_name).sort()).toEqual([ANA_NAME, ANA_NAME, BEN_NAME]);
	});

	/**
	 * A section the caller is neither in nor over is NULL -- the same answer a
	 * section id that does not exist gives, so an id cannot be probed. Asserted
	 * against a REAL section with a REAL open pass in it, which is the only
	 * version of this test worth having: a null for a section that is empty
	 * proves nothing.
	 */
	test('a student of another section gets null, exactly as a nonexistent id does', async () => {
		await resetPasses();
		await open(ana);

		expect(await state(cass, sectionId)).toBeNull();
		expect(await state(cass, '00000000-0000-0000-0000-000000000000')).toBeNull();

		// POSITIVE CONTROL: Cass is not simply unable to read anything -- her own
		// section answers her normally.
		const hers = await state(cass, otherSectionId);
		expect(hers?.scope).toBe('student');
		expect(hers?.taken).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// The gates on the two writes.
// ---------------------------------------------------------------------------

describe('who may close a pass', () => {
	test('a student of another section cannot close it, and it stays open', async () => {
		await resetPasses();
		await open(ana);

		// Cass cannot even see the section, so she is stopped before the gate --
		// which is the correct refusal and is asserted as a raise, not a result.
		const outsider = await close(cass).then(
			(r) => ({ raised: false, r }),
			(e: unknown) => ({ raised: true, r: (e as Error).message })
		);
		expect(outsider.raised).toBe(true);

		// And a student who IS in the section but does not hold the pass is
		// refused by the gate itself, structurally rather than by an exception.
		const peer = await close(ben);
		expect(peer.ok).toBe(false);
		expect(peer.reason).toBe('not_yours');
		// The refusal names nobody.
		expect(JSON.stringify(peer)).not.toContain(ANA_NAME);
		expect(JSON.stringify(peer)).not.toContain(ana.email);

		// POSITIVE CONTROL: after both refusals the pass is STILL OPEN. Without
		// this, a close gate that threw on everything -- including the holder --
		// would pass both assertions above.
		const still = await state(teacher);
		expect(still?.taken).toBe(true);
		expect((still?.open as Record<string, unknown>)?.student_email).toBe(ana.email);
	});

	test('the holder closes their own, and the instructor closes anyone in the section', async () => {
		await resetPasses();
		await open(ana);
		const own = await close(ana);
		expect(own.ok).toBe(true);
		// A student closing their own pass is told about their own pass only.
		expect(own.student_name).toBeNull();
		expect(own.closed_by_manager).toBe(false);

		await open(ben);
		const staff = await close(teacher);
		expect(staff.ok).toBe(true);
		expect(staff.closed_by_manager).toBe(true);
		expect(staff.student_name).toBe(BEN_NAME);

		// An instructor of a DIFFERENT section is not an instructor here.
		await open(ana);
		const foreign = await close(otherTeacher).then(
			() => ({ raised: false }),
			() => ({ raised: true })
		);
		expect(foreign.raised).toBe(true);
		expect((await state(teacher))?.taken).toBe(true);
	});

	test('closing when nothing is open is a refusal, not an error', async () => {
		await resetPasses();
		const res = await close(ana);
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('not_open');
	});
});

describe('who may open a pass', () => {
	test('an instructor of the section is refused even holding an enrollment row', async () => {
		await resetPasses();
		// Instructors DO enroll themselves to see a class the way a student does,
		// and roster imports sweep them in (0138). The composite key would happily
		// accept the row; the manage check is what refuses.
		await enrollStudent(db, {
			as: teacher,
			sectionId,
			email: teacher.email,
			displayName: 'T. Vargas'
		});
		const res = await open(teacher);
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('not_a_student');

		// POSITIVE CONTROL: the same enrollment lets a real student through.
		expect((await open(ana)).ok).toBe(true);
		await resetPasses();
		await db.sql('delete from public.classroom_enrollments where student_email = $1', [
			teacher.email
		]);
	});

	test('a student of another section is refused', async () => {
		await resetPasses();
		const res = await open(cass, sectionId).then(
			() => ({ raised: false }),
			() => ({ raised: true })
		);
		expect(res.raised).toBe(true);
		const { rows } = await db.sql<{ n: string }>(
			'select count(*)::text as n from public.classroom_hall_passes'
		);
		expect(rows[0].n).toBe('0');
	});

	/**
	 * A DEACTIVATED ENROLLMENT IS NOT AN ENROLLMENT. `classroom_is_enrolled`
	 * requires `active`, and the composite key cannot express that -- so this is
	 * the one rule the FK does not already make unrepresentable, which is why it
	 * is worth an assertion.
	 */
	test('a deactivated student is refused', async () => {
		await resetPasses();
		await enrollStudent(db, {
			as: teacher,
			sectionId,
			email: ben.email,
			displayName: BEN_NAME,
			active: false
		});
		const res = await open(ben).then(
			() => ({ raised: false }),
			() => ({ raised: true })
		);
		expect(res.raised).toBe(true);
		await enrollStudent(db, { as: teacher, sectionId, email: ben.email, displayName: BEN_NAME });
		expect((await open(ben)).ok).toBe(true);
		await resetPasses();
	});
});

// ---------------------------------------------------------------------------
// The state model itself: derived, with nothing stored.
// ---------------------------------------------------------------------------

describe('state is derived from the rows', () => {
	test('there is no status, boolean or duration column on the table', async () => {
		const { rows } = await db.sql<{ column_name: string }>(
			`select column_name from information_schema.columns
			 where table_schema = 'public' and table_name = 'classroom_hall_passes'
			 order by column_name`
		);
		expect(rows.map((r) => r.column_name)).toEqual([
			'closed_at',
			'closed_by',
			'id',
			'opened_at',
			'section_id',
			'student_email'
		]);
	});

	test('a pass for somebody off the roster is unrepresentable, not merely refused', async () => {
		await resetPasses();
		// As the connection OWNER, with RLS and every grant out of the way, so the
		// only thing that can refuse this is the composite key itself.
		const res = await db
			.sql('insert into public.classroom_hall_passes (section_id, student_email) values ($1, $2)', [
				sectionId,
				cass.email
			])
			.then(() => ({ refused: false, code: '' }))
			.catch((e: unknown) => ({ refused: true, code: (e as { code?: string }).code ?? '' }));
		expect(res.refused).toBe(true);
		// 23503 -- foreign_key_violation.
		expect(res.code).toBe('23503');

		// POSITIVE CONTROL: the identical insert for somebody who IS on the
		// roster lands, so the refusal above is the key and not the statement.
		await db.sql(
			'insert into public.classroom_hall_passes (section_id, student_email) values ($1, $2)',
			[sectionId, ana.email]
		);
		await resetPasses();
	});

	test('removing an enrollment cascades its passes rather than stranding them', async () => {
		await resetPasses();
		await open(ana);
		await close(ana);
		await db.sql('delete from public.classroom_enrollments where section_id = $1 and student_email = $2', [
			sectionId,
			ana.email
		]);
		const { rows } = await db.sql<{ n: string }>(
			'select count(*)::text as n from public.classroom_hall_passes'
		);
		expect(rows[0].n).toBe('0');
		await enrollStudent(db, { as: teacher, sectionId, email: ana.email, displayName: ANA_NAME });
	});
});
