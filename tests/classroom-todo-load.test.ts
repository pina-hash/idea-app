// tests/classroom-todo-load.test.ts
//
// THE TO-DO ROUTE'S OWN READ, DRIVEN FOR REAL (ledger 0297).
//
// `/classroom/todo` lists a student's owed work across every class they take,
// and its read (`loadClassroomWork` in $lib/classroom/student-work) BATCHES
// what the class page reads one class at a time: every class's check-in
// postings in one `.in('section_id', ...)` and every one of the caller's own
// notebook entries in one more. Batching is exactly where a status crosses a
// boundary it must not, and it does it SILENTLY -- a check-in filed in one
// class reading as filed in the other class it is posted to looks exactly like
// a student who filed twice, and a classmate's hand-in read as the caller's
// looks exactly like work done. Neither is visible to anybody looking at the
// screen, which is why this is a test and not a harness drive.
//
// So every assertion below is a PAIR, both directions on one fixture:
//   - one check-in posted to three classes, the student in two of them, filed
//     in ONE: that class's row is done, the other class's row is missing, and
//     the class they are not in has no row at all;
//   - one assignment posted to both of their classes and handed in by a
//     classmate: exactly ONE row (never one per class), and still missing for
//     them, while the same read for the classmate says done.
//
// HOW IT DRIVES IT: the REAL `src/routes/classroom/todo/+page.server.ts`,
// imported from its own file and called the way SvelteKit calls it, through
// the PostgREST shim, against a REAL Postgres carrying the REAL migrations --
// then the shipping `buildTodo` over what it returned, which is what the page
// renders. The load reads the real clock (one read, `readClassroomClock`), so
// the fixture's dates are relative to the real America/Los_Angeles day.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { buildTodo, type TodoRow } from '../src/lib/classroom/todo';
import type { ClassroomWork } from '../src/lib/classroom/student-work';
import { load as todoLoad } from '../src/routes/classroom/todo/+page.server';

/** The chain `tests/classroom-feed-false-counts.test.ts` drives the home load over. */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0069_notebook.sql',
	'0070_coin_economy.sql',
	'0071_notebook_optional_label.sql',
	'0075_notebook_optional_photo.sql',
	'0078_notebook_entry_notes.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0088_notebook_folders.sql',
	'0090_classroom_instructor_materials.sql',
	'0091_notebook_pin_and_activity.sql',
	'0094_notebook_classroom_sections.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0097_notebook_documentation_check.sql',
	'0098_notebook_session_postings.sql',
	'0106_notebook_instructor_student_access.sql',
	'0114_notebook_note_entry_session.sql',
	'0116_notebook_soft_delete.sql',
	'0117_notebook_soft_delete_restore.sql',
	'0118_notebook_draft_state.sql',
	'0120_notebook_session_item_link.sql',
	'0121_notebook_review_acknowledged.sql',
	'0138_classroom_manager_exclusion_and_enrollment_removal.sql'
] as const;

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;

let teacher: SeededUser;
let alice: SeededUser; // Period 1 and Period 4
let bruno: SeededUser; // Period 1 and Period 2

let p1: string;
let p2: string;
let p4: string;

let shared: string; // a check-in posted to P1, P2 and P4, dated two days ago
let coPosted: string; // an assignment posted to P1 and P4, due two days ago

/** A day on the calendar `session_date` is adjudicated in. */
const laDay = (offsetDays: number): string =>
	new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

async function rpc<T = Record<string, unknown>>(userId: string, call: string, params: unknown[]): Promise<T> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

const createEntry = (as: SeededUser, sessionId: string, sectionId: string) =>
	rpc<{ entry_id: string }>(as.id, 'public.notebook_create_entry($1, $2, $3, $4, $5, $6)', [
		as.id,
		`drive-${as.email}-${sessionId}-${sectionId}`,
		sessionId,
		sectionId,
		null,
		'page.jpg'
	]);

/** The REAL to-do load, called the way SvelteKit calls it, then the page's own rows. */
async function todoFor(user: SeededUser): Promise<TodoRow[]> {
	const data = await (todoLoad as unknown as (event: unknown) => Promise<{ todo: ClassroomWork; todoEmail: string; todoIsAdmin: boolean }>)({
		locals: {
			supabase: createPostgrestShim(db, fks, user.id),
			claims: { sub: user.id, email: user.email, role: 'authenticated' }
		},
		parent: async () => ({ isAdmin: false })
	});
	expect(data.todo.ready).toBe(true);
	expect(data.todo.checkInsReady).toBe(true);
	return buildTodo({
		sections: data.todo.sections,
		items: data.todo.items,
		submissions: data.todo.submissions,
		checkIns: data.todo.checkIns,
		myEmail: data.todoEmail,
		isAdmin: data.todoIsAdmin,
		clock: data.todo.clock
	});
}

const rowFor = (rows: TodoRow[], key: string) => rows.find((r) => r.key === key) ?? null;

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	fks = await loadForeignKeys(db);

	teacher = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Okafor');

	const section = (label: string) =>
		createClassroomSection(db, {
			as: teacher,
			courseCode: 'ENG1H',
			courseTitle: 'Engineering I Honors',
			label,
			teacherEmail: teacher.email
		});
	p1 = await section('Period 1');
	p2 = await section('Period 2');
	p4 = await section('Period 4');

	await enrollStudent(db, { as: teacher, sectionId: p1, email: alice.email, displayName: 'Alice Alvarez' });
	await enrollStudent(db, { as: teacher, sectionId: p4, email: alice.email, displayName: 'Alice Alvarez' });
	await enrollStudent(db, { as: teacher, sectionId: p1, email: bruno.email, displayName: 'Bruno Okafor' });
	await enrollStudent(db, { as: teacher, sectionId: p2, email: bruno.email, displayName: 'Bruno Okafor' });

	shared = await rpc<{ session_id: string }>(teacher.id, 'public.notebook_admin_upsert_session($1::uuid[], $2, $3::date, $4)', [
		[p1, p2, p4],
		3,
		laDay(-2),
		'Gearbox teardown'
	]).then((r) => r.session_id);

	coPosted = await rpc<{ item_id: string }>(
		teacher.id,
		`public.classroom_create_item($1, $2::uuid[], $3, 'Body.', $4, $5::timestamptz, null, true, '[]'::jsonb, false)`,
		['assignment', [p1, p4], 'Truss sketch', 10, new Date(Date.now() - 2 * 86_400_000).toISOString()]
	).then((r) => r.item_id);

	// Alice files the shared check-in in Period 1 and nowhere else.
	await createEntry(alice, shared, p1);

	// Bruno hands in the co-posted assignment (through Period 1, the class they share).
	await rpc(bruno.id, 'public.classroom_add_submission_file($1::uuid, $2, $3, $4, $5, $6, $7)', [
		coPosted,
		'drive-bruno-truss',
		'truss.jpg',
		'image/jpeg',
		1234,
		null,
		null
	]);
	await rpc(bruno.id, 'public.classroom_submit_assignment($1::uuid)', [coPosted]);
}, 240_000);

afterAll(async () => {
	await db?.stop();
});

describe('one check-in in three classes: the status stays in the class it was filed in', () => {
	it('filed in Period 1 is done there, and the same check-in in Period 4 is still missing', async () => {
		const rows = await todoFor(alice);
		const inP1 = rowFor(rows, `check-in:${shared}:${p1}`);
		const inP4 = rowFor(rows, `check-in:${shared}:${p4}`);
		expect(inP1?.view).toBe('done');
		expect(inP4?.view).toBe('missing');
		expect(inP4?.state).toBe('Not filed yet');
	});

	it('and the class they are not in has no row at all (two check-in rows, never three)', async () => {
		const rows = await todoFor(alice);
		const checkIns = rows.filter((r) => r.kind === 'check-in');
		expect(checkIns.map((r) => r.key).sort()).toEqual([`check-in:${shared}:${p1}`, `check-in:${shared}:${p4}`].sort());
		expect(rowFor(rows, `check-in:${shared}:${p2}`)).toBeNull();
	});

	it("a classmate's page reads their own status, not hers (Bruno filed nothing)", async () => {
		const rows = await todoFor(bruno);
		expect(rowFor(rows, `check-in:${shared}:${p1}`)?.view).toBe('missing');
		expect(rowFor(rows, `check-in:${shared}:${p2}`)?.view).toBe('missing');
		// Bruno is not in Period 4, so it is his page that has no row there.
		expect(rowFor(rows, `check-in:${shared}:${p4}`)).toBeNull();
	});
});

describe('one assignment in two classes: one row, and only the caller\'s own work counts', () => {
	it('is ONE row for a student who takes both classes, under the first in class order', async () => {
		const rows = (await todoFor(alice)).filter((r) => r.kind === 'assignment');
		expect(rows.map((r) => r.key)).toEqual([`item:${coPosted}`]);
		expect(rows[0].section.id).toBe(p1);
	});

	/*
	 * TWO LAYERS STAND BETWEEN BRUNO'S HAND-IN AND ALICE'S LIST, and this pins
	 * the pair: RLS never returns his submission row to her read at all, and
	 * `buildTodo` keeps only rows under her own address. Opening the second
	 * alone leaves this green (measured), because the first still holds; the
	 * second is pinned on its own, over rows a reader legitimately receives,
	 * in tests/classroom-todo.test.ts.
	 */
	it("a classmate's hand-in is never read as hers: still missing for Alice, done for Bruno", async () => {
		expect(rowFor(await todoFor(alice), `item:${coPosted}`)?.view).toBe('missing');
		expect(rowFor(await todoFor(bruno), `item:${coPosted}`)?.view).toBe('done');
	});
});
