/**
 * The shared fixture for the 0205 sharing suite.
 *
 * ONE FIXTURE, FOUR TEST FILES. Each file owns its own database (that is the
 * harness's isolation boundary), so this is a builder rather than shared state:
 * every file calls `buildSharingFixture` and gets its own cluster database with
 * the same cast on it.
 *
 * THE CAST, and why each member exists:
 *
 *   teacher       teacher of record for section A, which the item is posted to.
 *                 The instructor path's positive case.
 *   otherTeacher  teacher of record for section B, which the item is NOT posted
 *                 to. The instructor path's negative case, and the shape ledger
 *                 0152 proved for presence: a teacher is not a teacher of
 *                 everything.
 *   owner         a student in section A. Makes the document.
 *   viewer        a student in section A, granted 'viewer'.
 *   editor        a student in section A, granted 'editor'.
 *   classmate     a student in section A with NO grant. The in-class stranger,
 *                 which is the one a leak is most likely to reach.
 *   stranger      a student enrolled in section B only. The out-of-class
 *                 stranger.
 *
 * NOTHING IS GRANTED HERE. The builder seeds people, the course, two sections,
 * the item and the editor, and opens the owner's document. Every grant is made
 * by the test that needs it, through the real RPC, so no file inherits another
 * file's sharing state.
 */
import { readdirSync } from 'node:fs';
import { startTestDb, createUser, type SeededUser, type TestDb } from './harness';

const ALL_MIGRATIONS = readdirSync(new URL('../../supabase/migrations', import.meta.url))
	.filter((file) => file.endsWith('.sql'))
	.sort();
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

export interface SharingFixture {
	db: TestDb;
	teacher: SeededUser;
	otherTeacher: SeededUser;
	owner: SeededUser;
	viewer: SeededUser;
	editor: SeededUser;
	classmate: SeededUser;
	stranger: SeededUser;
	/** The schema-4 assignment, posted to section A only. */
	itemId: string;
	sectionA: string;
	sectionB: string;
	/** The owner's document, opened through the real RPC. */
	documentId: string;
	/** The one concept `ideacad_open_document` seeded in it. */
	conceptId: string;
	/** Call a SQL expression as a signed-in user, the way PostgREST does. */
	call<T>(user: SeededUser, expression: string, params?: unknown[]): Promise<T>;
	/** Call and capture the refusal message instead of throwing. */
	refusal(user: SeededUser, expression: string, params?: unknown[]): Promise<string>;
}

export async function buildSharingFixture(tag: string): Promise<SharingFixture> {
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

	const teacher = await createUser(db, `${tag}.teacher@boscotech.edu`, 'Teacher Of Record');
	const otherTeacher = await createUser(db, `${tag}.other@boscotech.edu`, 'Other Teacher');
	const owner = await createUser(db, `${tag}.owner@boscotech.net`, 'Owner');
	const viewer = await createUser(db, `${tag}.viewer@boscotech.net`, 'Viewer');
	const editor = await createUser(db, `${tag}.editor@boscotech.net`, 'Editor');
	const classmate = await createUser(db, `${tag}.classmate@boscotech.net`, 'Classmate');
	const stranger = await createUser(db, `${tag}.stranger@boscotech.net`, 'Stranger');

	const course = await call<{ course_id: string }>(
		teacher,
		"public.classroom_upsert_course('IDEACAD', 'IdeaCAD')"
	);
	const a = await call<{ section_id: string }>(
		teacher,
		'public.classroom_upsert_section($1::uuid, $2, null, $3)',
		[course.course_id, 'Period 1', teacher.email]
	);
	const b = await call<{ section_id: string }>(
		otherTeacher,
		'public.classroom_upsert_section($1::uuid, $2, null, $3)',
		[course.course_id, 'Period 2', otherTeacher.email]
	);

	for (const student of [owner, viewer, editor, classmate]) {
		await call(teacher, 'public.classroom_set_enrollment($1::uuid, $2, $3, true)', [
			a.section_id,
			student.email,
			student.email
		]);
	}
	await call(otherTeacher, 'public.classroom_set_enrollment($1::uuid, $2, $3, true)', [
		b.section_id,
		stranger.email,
		stranger.email
	]);

	const item = await call<{ item_id: string }>(
		teacher,
		"public.classroom_create_item('assignment', $1::uuid[], 'Blade', 'Build it.', 20, null, null, true, '[]'::jsonb, false)",
		[[a.section_id]]
	);
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
		viewer,
		editor,
		classmate,
		stranger,
		itemId: item.item_id,
		sectionA: a.section_id,
		sectionB: b.section_id,
		documentId: opened.document.id,
		conceptId: opened.concepts[0].id,
		call,
		refusal
	};
}

/**
 * Every write expression in the feature, as labelled (expression, params)
 * triples. A file asserting "X cannot write" iterates this rather than listing
 * six of the seven, which is how the seventh gets forgotten.
 *
 * THE MARKER IS WHAT MAKES "WROTE NOTHING" ASSERTABLE. Each caller passes its
 * own string, so after a sweep the table can be asked whether that caller's
 * bytes are anywhere in it -- which is a far stronger claim than "the RPC
 * returned an error", and unlike a revision number it survives a later
 * soft-delete of the row.
 *
 * `delete_concept` IS DELIBERATELY LAST. It soft-deletes the concept every
 * other attempt names, so run earlier it makes `set_active` and
 * `set_prediction` refuse for the honest reason that the concept is gone -- and
 * a control asserting "all seven succeed" then fails on two of them and reads
 * as a broken write gate. Found exactly that way: the editor control reported
 * `ideacad_set_active: Choose one of your live concepts.` before the order was
 * fixed. The refusal direction does not care about the order; the control does.
 */
export function writeAttempts(
	documentId: string,
	conceptId: string,
	marker: string
): Array<{ label: string; expression: string; params: unknown[] }> {
	return [
		{
			label: 'ideacad_new_concept',
			expression: 'public.ideacad_new_concept($1::uuid, $2, $3::jsonb)',
			params: [documentId, `concept ${marker}`, JSON.stringify({ blade: marker })]
		},
		{
			label: 'ideacad_save_concept',
			expression: 'public.ideacad_save_concept($1::uuid, $2::jsonb, 99)',
			params: [conceptId, JSON.stringify({ blade: marker })]
		},
		{
			label: 'ideacad_update_concept_meta',
			expression: 'public.ideacad_update_concept_meta($1::uuid, $2, 9)',
			params: [conceptId, `renamed ${marker}`]
		},
		{
			label: 'ideacad_set_active',
			expression: 'public.ideacad_set_active($1::uuid, $2::uuid)',
			params: [documentId, conceptId]
		},
		{
			label: 'ideacad_set_prediction',
			expression: 'public.ideacad_set_prediction($1::uuid, $2::uuid, $3)',
			params: [documentId, conceptId, marker]
		},
		{
			label: 'ideacad_commit_concept',
			expression: 'public.ideacad_commit_concept($1::uuid)',
			params: [conceptId]
		},
		{
			label: 'ideacad_delete_concept',
			expression: 'public.ideacad_delete_concept($1::uuid)',
			params: [conceptId]
		}
	];
}

/**
 * Every place one of those markers could have landed: a feature tree, a concept
 * name, or a prediction rationale. Read as the CONNECTION OWNER, so RLS cannot
 * hide a write that did happen, and including soft-deleted rows, so a write
 * followed by a delete still counts as a write.
 */
export async function markerHits(f: SharingFixture, marker: string): Promise<number> {
	const { rows } = await f.db.sql<{ n: string }>(
		`select (
			(select count(*) from public.ideacad_concepts where features::text like $1)
			+ (select count(*) from public.ideacad_concepts where name like $1)
			+ (select count(*) from public.ideacad_predictions where rationale like $1)
		) as n`,
		[`%${marker}%`]
	);
	return Number(rows[0].n);
}
