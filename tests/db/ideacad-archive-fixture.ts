/**
 * The shared fixture for the 0214 archive suite.
 *
 * ONE FIXTURE, TWO TEST FILES, same builder shape as
 * `ideacad-sharing-fixture.ts`: each file owns its own database (that is the
 * harness's isolation boundary), so this creates state rather than sharing it.
 *
 * WHY IT IS NOT `buildSharingFixture` WITH A SECTION BOLTED ON. That fixture
 * posts its item to ONE section, and every interesting thing about a class
 * grant needs TWO -- the cohort whose student made the work, and the cohort
 * being shown it. `_classroom_manages_item` also requires the caller to manage
 * EVERY section the item is posted to, so the second section has to be the same
 * teacher's or the instructor path goes dark for a reason that has nothing to
 * do with the archive. Both of those are structural, not a preference.
 *
 * THE CAST, and why each member exists:
 *
 *   teacher     teacher of record for BOTH posted sections, so
 *               `_classroom_manages_item` holds for them. The instructor path's
 *               positive case, and the only caller who can archive or share.
 *   otherTeacher teacher of record for an UNPOSTED section. The instructor
 *               path's negative case: a teacher is not a teacher of everything.
 *   owner       a student in the OLD section who makes the document and then
 *               leaves. The person decision 29 is about.
 *   classmate   a student in the OLD section with no grant. The in-class
 *               stranger, which is the one a leak is most likely to reach.
 *   nextYear    a student in the NEW section only. The current cohort: refused
 *               until the class grant exists, admitted after it, and the whole
 *               of what Mr. Pina asked for.
 *   stranger    a student in the UNPOSTED section. The out-of-class stranger,
 *               who must stay refused through every state below.
 *
 * NOTHING IS ARCHIVED AND NOTHING IS SHARED HERE. The builder seeds people, the
 * course, three sections, the item, the editor and the owner's document, and
 * stops. Every archive and every grant is made by the test that needs it,
 * through the real RPC, so no file inherits another file's state.
 */
import { readdirSync } from 'node:fs';
import { startTestDb, createUser, type SeededUser, type TestDb } from './harness';

const ALL_MIGRATIONS = readdirSync(new URL('../../supabase/migrations', import.meta.url))
	.filter((file) => file.endsWith('.sql'))
	.sort();
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

export interface ArchiveFixture {
	db: TestDb;
	teacher: SeededUser;
	otherTeacher: SeededUser;
	owner: SeededUser;
	classmate: SeededUser;
	nextYear: SeededUser;
	stranger: SeededUser;
	/** The schema-4 assignment, posted to `oldSection` AND `newSection`. */
	itemId: string;
	/** Last year's class. The owner and the classmate are in it. */
	oldSection: string;
	/** This year's class. `nextYear` is in it, and the item is posted to it. */
	newSection: string;
	/** A section the item is NOT posted to. `stranger` is in it. */
	unpostedSection: string;
	/** The owner's document, opened through the real RPC. */
	documentId: string;
	/** The one concept `ideacad_open_document` seeded in it. */
	conceptId: string;
	/** Call a SQL expression as a signed-in user, the way PostgREST does. */
	call<T>(user: SeededUser, expression: string, params?: unknown[]): Promise<T>;
	/** Call and capture the refusal message instead of throwing. */
	refusal(user: SeededUser, expression: string, params?: unknown[]): Promise<string>;
	/**
	 * Evaluate a DEFINER-ONLY predicate as a given person.
	 *
	 * `call` cannot: it switches to the `authenticated` role the way PostgREST
	 * does, and 0205 deliberately withholds EXECUTE on `_ideacad_document_role`,
	 * `_ideacad_can_write_document` and `_ideacad_part_owner` from that role --
	 * nothing but a SECURITY DEFINER body reaches them, so nothing but a
	 * definer-shaped caller should. `service_role` holds the grant (0205 gives
	 * it, and 0214 keeps giving it) and carries the same JWT subject, so
	 * `current_user_email()` still resolves to the person named here.
	 *
	 * THE ANSWER IS THE PREDICATE'S, NOT THE ROLE'S: every one of these reads
	 * the session's claims rather than the executing role, which is the same
	 * property that lets a nested definer call authorize as the original
	 * caller. Every BEHAVIOURAL claim in this suite is still made through
	 * `call`, as a real client; this is for reading a gate directly.
	 */
	predicate<T>(user: SeededUser, expression: string, params?: unknown[]): Promise<T>;
}

export async function buildArchiveFixture(tag: string): Promise<ArchiveFixture> {
	const db = await startTestDb([FIXTURE_COMPLETION, ...ALL_MIGRATIONS]);

	const call = async <T>(
		user: SeededUser,
		expression: string,
		params: unknown[] = []
	): Promise<T> =>
		db.asUser(user.id, async (q) => {
			const { rows } = await q<{ result: T }>(`select ${expression} as result`, params);
			return rows[0].result;
		});

	const refusal = async (
		user: SeededUser,
		expression: string,
		params: unknown[] = []
	): Promise<string> => {
		try {
			await call(user, expression, params);
			return '';
		} catch (error) {
			return (error as Error).message;
		}
	};

	const predicate = async <T>(
		user: SeededUser,
		expression: string,
		params: unknown[] = []
	): Promise<T> =>
		db.asServiceRole(async (q) => {
			const { rows } = await q<{ result: T }>(`select ${expression} as result`, params);
			return rows[0].result;
		}, user.id);

	const teacher = await createUser(db, `${tag}.teacher@boscotech.edu`, 'Teacher Of Record');
	const otherTeacher = await createUser(db, `${tag}.other@boscotech.edu`, 'Other Teacher');
	const owner = await createUser(db, `${tag}.owner@boscotech.net`, 'Departing Owner');
	const classmate = await createUser(db, `${tag}.classmate@boscotech.net`, 'Classmate');
	const nextYear = await createUser(db, `${tag}.nextyear@boscotech.net`, 'Next Year');
	const stranger = await createUser(db, `${tag}.stranger@boscotech.net`, 'Stranger');

	const course = await call<{ course_id: string }>(
		teacher,
		"public.classroom_upsert_course('IDEACAD', 'IdeaCAD')"
	);
	const old = await call<{ section_id: string }>(
		teacher,
		'public.classroom_upsert_section($1::uuid, $2, null, $3)',
		[course.course_id, 'Period 1', teacher.email]
	);
	const next = await call<{ section_id: string }>(
		teacher,
		'public.classroom_upsert_section($1::uuid, $2, null, $3)',
		[course.course_id, 'Period 3', teacher.email]
	);
	const unposted = await call<{ section_id: string }>(
		otherTeacher,
		'public.classroom_upsert_section($1::uuid, $2, null, $3)',
		[course.course_id, 'Period 2', otherTeacher.email]
	);

	for (const student of [owner, classmate]) {
		await call(teacher, 'public.classroom_set_enrollment($1::uuid, $2, $3, true)', [
			old.section_id,
			student.email,
			student.email
		]);
	}
	await call(teacher, 'public.classroom_set_enrollment($1::uuid, $2, $3, true)', [
		next.section_id,
		nextYear.email,
		nextYear.email
	]);
	await call(otherTeacher, 'public.classroom_set_enrollment($1::uuid, $2, $3, true)', [
		unposted.section_id,
		stranger.email,
		stranger.email
	]);

	// Created against the OLD section and posted to the NEW one afterwards,
	// which is the shape of re-running one canonical assignment for a later
	// cohort -- the workflow narrowing (c) in 0214's header rests on.
	const item = await call<{ item_id: string }>(
		teacher,
		"public.classroom_create_item('assignment', $1::uuid[], 'Blade', 'Build it.', 20, null, null, true, '[]'::jsonb, false)",
		[[old.section_id]]
	);
	// Written directly as the connection owner, the way every other db test
	// adds a posting: `classroom_update_item`'s signature has moved five times
	// across 0085/0104/0108/0109/0110 and this fixture is not a test of it.
	await db.sql('insert into public.classroom_postings (item_id, section_id) values ($1, $2)', [
		item.item_id,
		next.section_id
	]);

	await call(teacher, "public.ideacad_set_editor($1::uuid, 'blade', $2::jsonb)", [
		item.item_id,
		JSON.stringify({ defaultFeatures: { blade: 'seed' } })
	]);

	const opened = await call<{
		document: { id: string };
		concepts: Array<{ id: string }>;
	}>(owner, 'public.ideacad_open_document($1::uuid)', [item.item_id]);

	return {
		db,
		teacher,
		otherTeacher,
		owner,
		classmate,
		nextYear,
		stranger,
		itemId: item.item_id,
		oldSection: old.section_id,
		newSection: next.section_id,
		unpostedSection: unposted.section_id,
		documentId: opened.document.id,
		conceptId: opened.concepts[0].id,
		call,
		refusal,
		predicate
	};
}
