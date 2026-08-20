// tests/notebook-session-item-link.test.ts
//
// 0120: a notebook check-in can hang off the classroom item it belongs to, so
// a day's material and the notebook requirement that goes with it are ONE row
// in the class instead of two.
//
// WHAT IS WORTH A TEST HERE, per this repo's rule that automated tests are for
// guarantees whose regression is SILENT. A block appearing on the wrong page is
// visible the moment anyone looks; none of the following is.
//
//   1. THE COMPOSITE KEY. `(item_id, section_id) -> classroom_postings` is what
//      makes "the item is posted to the class the check-in runs in"
//      unrepresentable rather than re-checked. If it ever weakened to a plain
//      `item_id -> classroom_items`, every RPC here would still pass its own
//      checks and a period 2 check-in could point at a period 5 material -- with
//      nothing to see until a student opened an item that does not exist for
//      them. Asserted with RLS OUT OF THE WAY ENTIRELY (as the connection
//      owner), so nothing but the key itself can be what refuses.
//
//   2. ON DELETE SET NULL, NOT CASCADE. Unposting the item must not delete the
//      check-in's POSTING: that row is the check-in's presence in the class, and
//      the (session_id, section_id) key 0098 built means deleting it would take
//      the students' filed entries with it. A cascade here would look like
//      tidying up and read as data loss weeks later.
//
//   3. AUTHORIZATION. Attaching a check-in to somebody else's class writes a row
//      that looks identical to a legitimate one.
//
//   4. GRADING IS UNTOUCHED. A notebook unit is graded exactly once, as a
//      Documentation Check assignment through notebook_unit_items ->
//      classroom_submissions (0097). This migration puts a second link between
//      the notebook and Classroom, and the failure it must not have is quietly
//      becoming a second scoring path. So the whole grading surface -- the unit
//      link, the grid, the graded submission and the FACTS CSV -- is captured
//      before a check-in is attached and compared byte for byte afterwards.
//
//   5. RE-APPLYING. Migrations here are pasted in by hand, so a re-run is
//      ordinary (0088's lesson), and this file adds a constraint, which is the
//      exact shape that raises 2BP01 on a second run if it is not guarded.
//
//   6. THE SIGNATURE TRAP. Three new functions; a surviving old arity would be a
//      second overload PostgREST cannot resolve.
//
// Deliberately NOT covered here: where the block renders, what it reads, how the
// composer stages one. tests/classroom-notebook-checkins.test.ts drives the real
// page load for the first, and the dev harnesses answer the rest.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { summarize, type SectionGrid } from '$lib/notebook-review';
import { DOC_CHECK_CRITERIA, DOC_CHECK_TOTAL } from '$lib/notebook-documentation-check';
import {
	criterionMax,
	gradesCsv,
	normalizeSubmissionRow,
	studentWorkRows,
	type GradingData
} from '$lib/classroom/assignment-spec';

/**
 * The chain the live project carries through 0120. It is the class page's own
 * chain (tests/classroom-notebook-checkins.test.ts) -- Classroom's canonical
 * items and assignment engine, the notebook, the Documentation Check link, and
 * the three soft-delete/draft migrations -- with this file's own on top.
 */
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
	'0120_notebook_session_item_link.sql'
];

const MIGRATION_0120 = readFileSync(
	join(process.cwd(), 'supabase', 'migrations', '0120_notebook_session_item_link.sql'),
	'utf8'
);

let db: TestDb;

let owner: SeededUser; // the pinned 0067 admin
let teacherA: SeededUser; // P1 and P2
let teacherB: SeededUser; // P3 only
let alice: SeededUser; // student in P1
let bruno: SeededUser; // student in P1

let p1: string;
let p2: string;
let p3: string;

/** A material posted to P1 AND P2: the multi-class case the fan-out has to get right. */
let sharedMaterial: string;
/** A material posted to P1 only. */
let soloMaterial: string;
/** An item posted to P3 only -- the "not posted to this class" refusal. */
let foreignItem: string;
/** The unit-1 Documentation Check assignment in P1 (0097). */
let docItem: string;

async function rpc<T = Record<string, unknown>>(
	userId: string,
	call: string,
	params: unknown[]
): Promise<T> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

async function captureError(run: () => Promise<unknown>): Promise<{ message: string }> {
	try {
		await run();
	} catch (error) {
		return { message: (error as { message?: string }).message ?? String(error) };
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
}

const createItem = async (
	userId: string,
	kind: 'assignment' | 'material',
	sectionIds: string[],
	title: string,
	points: number | null = null
): Promise<string> =>
	(
		await rpc<{ item_id: string }>(
			userId,
			'public.classroom_create_item($1, $2::uuid[], $3, $4, $5::integer, null, null, true)',
			[kind, sectionIds, title, '', points]
		)
	).item_id;

const createSession = async (
	userId: string,
	sectionIds: string[],
	unit: number,
	date: string,
	label: string
): Promise<string> =>
	(
		await rpc<{ session_id: string }>(
			userId,
			'public.notebook_admin_upsert_session($1::uuid[], $2::integer, $3::date, $4, null)',
			[sectionIds, unit, date, label]
		)
	).session_id;

const link = (userId: string, sessionId: string, sectionId: string, itemId: string) =>
	rpc(userId, 'public.notebook_link_session_item($1::uuid, $2::uuid, $3::uuid)', [
		sessionId,
		sectionId,
		itemId
	]);

const unlink = (userId: string, sessionId: string, sectionId: string) =>
	rpc<{ cleared: number }>(userId, 'public.notebook_unlink_session_item($1::uuid, $2::uuid)', [
		sessionId,
		sectionId
	]);

const createForItem = (
	userId: string,
	itemId: string,
	unit: number,
	date: string,
	label: string
) =>
	rpc<{ session_id: string; item_id: string; sections: number }>(
		userId,
		'public.notebook_create_item_check_in($1::uuid, $2::integer, $3::date, $4)',
		[itemId, unit, date, label]
	);

/** Every posting of a check-in, as the database holds it. Owner read: no RLS. */
const postingsOf = async (sessionId: string) =>
	(
		await db.sql<{ section_id: string; item_id: string | null }>(
			`select section_id, item_id from public.notebook_session_postings
			 where session_id = $1 order by section_id`,
			[sessionId]
		)
	).rows;

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	teacherA = await createUser(db, 'teacher.a@boscotech.edu', 'Teacher A');
	teacherB = await createUser(db, 'teacher.b@boscotech.edu', 'Teacher B');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	bruno = await createUser(db, 'bruno@boscotech.net', 'Bruno Barros');

	const course = await rpc<{ course_id: string }>(
		owner.id,
		'public.classroom_upsert_course($1, $2)',
		['IDEA209H', 'IDEA 209H']
	);
	const section = async (label: string, block: string, teacherEmail: string) =>
		(
			await rpc<{ section_id: string }>(
				owner.id,
				'public.classroom_upsert_section($1::uuid, $2, $3, $4)',
				[course.course_id, label, block, teacherEmail]
			)
		).section_id;
	p1 = await section('Period 1', 'A', teacherA.email);
	p2 = await section('Period 2', 'B', teacherA.email);
	p3 = await section('Period 3', 'C', teacherB.email);

	for (const [sectionId, student, name] of [
		[p1, alice, 'Alvarez, Alice'],
		[p1, bruno, 'Barros, Bruno']
	] as const) {
		await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			sectionId,
			student.email,
			name,
			true
		]);
	}

	sharedMaterial = await createItem(teacherA.id, 'material', [p1, p2], 'Shop floor rules');
	soloMaterial = await createItem(teacherA.id, 'material', [p1], 'Bearing teardown notes');
	foreignItem = await createItem(teacherB.id, 'material', [p3], 'Period 3 handout');
	docItem = await createItem(teacherA.id, 'assignment', [p1], 'Unit 1 Documentation Check', 100);
});

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. The column and the key.
// ---------------------------------------------------------------------------

describe('the column and the composite key', () => {
	it('the column exists, is nullable, and nothing was backfilled', async () => {
		const { rows } = await db.sql<{ is_nullable: string; data_type: string }>(
			`select is_nullable, data_type from information_schema.columns
			 where table_schema = 'public' and table_name = 'notebook_session_postings'
			   and column_name = 'item_id'`
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].is_nullable).toBe('YES');
		expect(rows[0].data_type).toBe('uuid');

		// Every check-in that existed before this migration keeps its own stream
		// row, which is what "nothing to backfill" means as a number.
		const { rows: linked } = await db.sql<{ n: string }>(
			`select count(*) as n from public.notebook_session_postings where item_id is not null`
		);
		expect(Number(linked[0].n)).toBe(0);
	});

	it('points at classroom_postings (item_id, section_id), and SET NULLs only item_id', async () => {
		const { rows } = await db.sql<{
			confdeltype: string;
			referenced: string;
			ref_cols: string;
			local_cols: string;
			set_null_cols: string | null;
		}>(
			`select c.confdeltype,
			        c.confrelid::regclass::text as referenced,
			        (select string_agg(a.attname, ',' order by k.ord)
			           from unnest(c.confkey) with ordinality k(att, ord)
			           join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.att) as ref_cols,
			        (select string_agg(a.attname, ',' order by k.ord)
			           from unnest(c.conkey) with ordinality k(att, ord)
			           join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.att) as local_cols,
			        (select string_agg(a.attname, ',' order by k.ord)
			           from unnest(c.confdelsetcols) with ordinality k(att, ord)
			           join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.att) as set_null_cols
			   from pg_constraint c
			  where c.conname = 'notebook_session_postings_item_fkey'`
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].referenced).toBe('classroom_postings');
		expect(rows[0].local_cols).toBe('item_id,section_id');
		expect(rows[0].ref_cols).toBe('item_id,section_id');
		// 'n' = SET NULL, and only over item_id: section_id is NOT NULL and
		// nulling it too would make unposting an item raise instead.
		expect(rows[0].confdeltype).toBe('n');
		expect(rows[0].set_null_cols).toBe('item_id');
	});

	/**
	 * THE KEY ITSELF, with RLS and the RPCs entirely out of the way: this runs as
	 * the connection owner, which bypasses both, so the only thing that can
	 * refuse the write is the constraint.
	 */
	it('a raw write cannot point a check-in at an item posted to a DIFFERENT class', async () => {
		const session = await createSession(teacherA.id, [p1], 2, '2026-09-14', 'Raw key probe');

		const refused = await captureError(() =>
			db.sql(
				`update public.notebook_session_postings set item_id = $1
				 where session_id = $2 and section_id = $3`,
				[foreignItem, session, p1]
			)
		);
		expect(refused.message).toMatch(/foreign key|notebook_session_postings_item_fkey/i);

		// POSITIVE CONTROL, same statement, same connection: an item that IS
		// posted to this class goes in, so the refusal above is the pair being
		// wrong rather than the write being impossible.
		await db.sql(
			`update public.notebook_session_postings set item_id = $1
			 where session_id = $2 and section_id = $3`,
			[soloMaterial, session, p1]
		);
		expect((await postingsOf(session))[0].item_id).toBe(soloMaterial);

		await db.sql(`delete from public.notebook_sessions where id = $1`, [session]);
	});
});

// ---------------------------------------------------------------------------
// 2. Re-applying, and the signature trap.
// ---------------------------------------------------------------------------

describe('the migration file itself', () => {
	it('re-applies without error and leaves exactly one of everything', async () => {
		await db.sql(MIGRATION_0120);
		await db.sql(MIGRATION_0120);

		const { rows: keys } = await db.sql<{ n: string }>(
			`select count(*) as n from pg_constraint
			  where conname = 'notebook_session_postings_item_fkey'`
		);
		expect(Number(keys[0].n)).toBe(1);

		const { rows: idx } = await db.sql<{ n: string }>(
			`select count(*) as n from pg_indexes
			  where schemaname = 'public' and indexname = 'notebook_session_postings_item_idx'`
		);
		expect(Number(idx[0].n)).toBe(1);
	});

	it('each new function has exactly ONE overload', async () => {
		for (const name of [
			'notebook_link_session_item',
			'notebook_unlink_session_item',
			'notebook_create_item_check_in'
		]) {
			const { rows } = await db.sql<{ n: string }>(
				`select count(*) as n from pg_proc p
				   join pg_namespace n on n.oid = p.pronamespace
				  where n.nspname = 'public' and p.proname = $1`,
				[name]
			);
			expect(Number(rows[0].n), `${name} overloads`).toBe(1);
		}
	});

	it('every one of them is a SECURITY DEFINER with a pinned search_path', async () => {
		const { rows } = await db.sql<{ proname: string; prosecdef: boolean; config: string[] }>(
			`select p.proname, p.prosecdef, p.proconfig as config
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public'
			    and p.proname in ('notebook_link_session_item', 'notebook_unlink_session_item',
			                      'notebook_create_item_check_in')`
		);
		expect(rows).toHaveLength(3);
		for (const row of rows) {
			expect(row.prosecdef, `${row.proname} is security definer`).toBe(true);
			expect(
				(row.config ?? []).some((c) => c.startsWith('search_path=')),
				`${row.proname} pins search_path`
			).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// 3. Linking and unlinking.
// ---------------------------------------------------------------------------

describe('attaching a check-in to an item', () => {
	let session: string;

	beforeAll(async () => {
		// Runs in BOTH classes the shared material is posted to, so per-section
		// linking is a real question rather than a degenerate one.
		session = await createSession(teacherA.id, [p1, p2], 3, '2026-09-16', 'Shop floor pages');
	});

	it('links one posting at a time, leaving the other class alone', async () => {
		await link(teacherA.id, session, p1, sharedMaterial);
		const after = await postingsOf(session);
		expect(after.find((r) => r.section_id === p1)?.item_id).toBe(sharedMaterial);
		expect(after.find((r) => r.section_id === p2)?.item_id).toBeNull();

		await link(teacherA.id, session, p2, sharedMaterial);
		expect((await postingsOf(session)).every((r) => r.item_id === sharedMaterial)).toBe(true);
	});

	it('refuses an item that is not posted to that class', async () => {
		const refused = await captureError(() => link(teacherA.id, session, p1, foreignItem));
		expect(refused.message).toContain('not posted to this class');
	});

	it('refuses a check-in that does not run in that class', async () => {
		const refused = await captureError(() => link(teacherB.id, session, p3, foreignItem));
		expect(refused.message).toContain('does not run in this class');
	});

	it('refuses an item that does not exist', async () => {
		const refused = await captureError(() =>
			link(teacherA.id, session, p1, '00000000-0000-0000-0000-000000000000')
		);
		expect(refused.message).toContain('does not exist');
	});

	/**
	 * THE AUTHORIZATION PAIR. A teacher of another class and a student in this
	 * one both write a row that would look completely ordinary.
	 */
	it('refuses everyone who does not manage the class, and allows the admin', async () => {
		const byOtherTeacher = await captureError(() => link(teacherB.id, session, p1, sharedMaterial));
		expect(byOtherTeacher.message).toContain('Only the class instructor');

		const byStudent = await captureError(() => link(alice.id, session, p1, sharedMaterial));
		expect(byStudent.message).toContain('Only the class instructor');

		// The pinned owner manages every section (0067), so this is the positive
		// control that the refusals above are about WHO and not about the call.
		await unlink(teacherA.id, session, p1);
		await link(owner.id, session, p1, sharedMaterial);
		expect((await postingsOf(session)).find((r) => r.section_id === p1)?.item_id).toBe(
			sharedMaterial
		);
	});

	it('detaching clears the pointer and nothing else, and is idempotent', async () => {
		const entry = await db.asUser(alice.id, async (q) => {
			const { rows } = await q<{ result: { entry_id: string } }>(
				'select public.notebook_create_entry($1, $2, $3, $4, null, $5) as result',
				[alice.id, 'drive-detach-probe', session, p1, 'page.jpg']
			);
			return rows[0].result.entry_id;
		});

		const first = await unlink(teacherA.id, session, p1);
		expect(first.cleared).toBe(1);
		expect((await postingsOf(session)).find((r) => r.section_id === p1)?.item_id).toBeNull();

		// A second call is not an error and reports that it changed nothing.
		expect((await unlink(teacherA.id, session, p1)).cleared).toBe(0);

		// The check-in, its posting and the student's entry are all still there:
		// detaching moves where it renders, and that is all it does.
		expect(await postingsOf(session)).toHaveLength(2);
		const { rows: entries } = await db.sql<{ id: string; session_id: string; section_id: string }>(
			`select id, session_id, section_id from public.notebook_entries where id = $1`,
			[entry]
		);
		expect(entries).toEqual([{ id: entry, session_id: session, section_id: p1 }]);
	});

	it('refuses a detach from someone who does not manage the class', async () => {
		const refused = await captureError(() => unlink(teacherB.id, session, p2));
		expect(refused.message).toContain('Only the class instructor');
	});
});

// ---------------------------------------------------------------------------
// 4. Creating one against an item, in one round trip.
// ---------------------------------------------------------------------------

describe('creating a check-in that belongs to an item', () => {
	it('creates it in every class the item is posted to, all linked', async () => {
		const res = await createForItem(
			teacherA.id,
			sharedMaterial,
			4,
			'2026-09-21',
			'Shop floor writeup'
		);
		expect(res.sections).toBe(2);

		const postings = await postingsOf(res.session_id);
		expect(postings.map((r) => r.section_id).sort()).toEqual([p1, p2].sort());
		expect(postings.every((r) => r.item_id === sharedMaterial)).toBe(true);

		// The canonical record carries what was authored, once.
		const { rows } = await db.sql<{ unit_number: number; session_date: string; session_label: string }>(
			`select unit_number, to_char(session_date, 'YYYY-MM-DD') as session_date, session_label
			   from public.notebook_sessions where id = $1`,
			[res.session_id]
		);
		expect(rows[0]).toEqual({
			unit_number: 4,
			session_date: '2026-09-21',
			session_label: 'Shop floor writeup'
		});
	});

	it('refuses an item posted to a class the caller does not manage, and writes NOTHING', async () => {
		const before = Number(
			(await db.sql<{ n: string }>('select count(*) as n from public.notebook_sessions')).rows[0].n
		);
		// teacherB manages P3 but not P1 or P2; the item is in P1 and P2.
		const refused = await captureError(() =>
			createForItem(teacherB.id, sharedMaterial, 5, '2026-09-23', 'Not yours')
		);
		expect(refused.message).toContain('not the teacher of record');
		const after = Number(
			(await db.sql<{ n: string }>('select count(*) as n from public.notebook_sessions')).rows[0].n
		);
		expect(after).toBe(before);
	});

	/**
	 * `classroom_remove_posting` REFUSES to remove an item's last posting
	 * (`{ok:false, reason:'last_posting'}`), so an item posted nowhere is not a
	 * state the RPCs can produce -- it takes surgery in the SQL editor, which is
	 * exactly the caller this guard is written for. Reached here the only way it
	 * can be: as the connection owner, with RLS and the RPC both out of the way.
	 */
	it('refuses an item that is posted nowhere', async () => {
		const orphan = await createItem(teacherA.id, 'material', [p1], 'Briefly posted');
		const structured = await rpc<{ ok: boolean; reason?: string }>(
			teacherA.id,
			'public.classroom_remove_posting($1::uuid, $2::uuid)',
			[orphan, p1]
		);
		expect(structured).toEqual({ ok: false, reason: 'last_posting' });

		await db.sql('delete from public.classroom_postings where item_id = $1', [orphan]);
		const refused = await captureError(() =>
			createForItem(teacherA.id, orphan, 5, '2026-09-24', 'Nowhere to run')
		);
		expect(refused.message).toContain('not posted to any class');
	});

	/**
	 * The field rules are `notebook_admin_upsert_session`'s own, reached through
	 * the nested call rather than restated -- so this asserts the REUSE, not a
	 * second copy of the validation.
	 */
	it('inherits the check-in field rules from the RPC it calls', async () => {
		expect(
			(await captureError(() => createForItem(teacherA.id, soloMaterial, 1001, '2026-09-24', 'x')))
				.message
		).toContain('Unit number must be between 0 and 1000');
		expect(
			(await captureError(() => createForItem(teacherA.id, soloMaterial, 5, '2026-09-24', '   ')))
				.message
		).toContain('session label is required');
	});

	it('refuses a student outright', async () => {
		const refused = await captureError(() =>
			createForItem(alice.id, soloMaterial, 5, '2026-09-25', 'Student attempt')
		);
		expect(refused.message).toContain('not the teacher of record');
	});
});

// ---------------------------------------------------------------------------
// 5. Unposting the item.
// ---------------------------------------------------------------------------

describe('when the item stops being posted to the class', () => {
	it('the check-in goes back to its own row, keeping its posting and its entries', async () => {
		// Posted to BOTH classes, because `classroom_remove_posting` refuses to
		// remove an item's last one -- so this is the real shape of the event:
		// "that handout is not in period 1 any more", with period 2 untouched.
		const item = await createItem(teacherA.id, 'material', [p1, p2], 'Temporary handout');
		const res = await createForItem(teacherA.id, item, 6, '2026-09-28', 'Handout pages');
		expect((await postingsOf(res.session_id)).every((r) => r.item_id === item)).toBe(true);

		const entryId = await db.asUser(bruno.id, async (q) => {
			const { rows } = await q<{ result: { entry_id: string } }>(
				'select public.notebook_create_entry($1, $2, $3, $4, null, $5) as result',
				[bruno.id, 'drive-unpost-probe', res.session_id, p1, 'page.jpg']
			);
			return rows[0].result.entry_id;
		});

		await rpc(teacherA.id, 'public.classroom_remove_posting($1::uuid, $2::uuid)', [item, p1]);

		const after = await postingsOf(res.session_id);
		// THE POSTING SURVIVES. A cascade here would have deleted it, and with it
		// the (session_id, section_id) key the entry below hangs on.
		expect(after).toHaveLength(2);
		const inP1 = after.find((r) => r.section_id === p1)!;
		expect(inP1.item_id).toBeNull();
		// ...and ONLY that one: the other class still reads the check-in on the
		// item, which is what makes this a per-posting pointer rather than a
		// property of the check-in.
		expect(after.find((r) => r.section_id === p2)?.item_id).toBe(item);

		const { rows: entries } = await db.sql<{ id: string; session_id: string }>(
			`select id, session_id from public.notebook_entries where id = $1`,
			[entryId]
		);
		expect(entries).toEqual([{ id: entryId, session_id: res.session_id }]);
	});
});

// ---------------------------------------------------------------------------
// 6. Grading is untouched.
// ---------------------------------------------------------------------------

describe('the Documentation Check grading path is untouched', () => {
	/** The real `loadGrading` read, as the teacher's own session (0097's shape). */
	const loadGrading = async (itemId: string): Promise<GradingData> =>
		db.asUser(teacherA.id, async (q) => {
			const roster = await q(
				`select section_id, student_email, display_name, active, updated_at
				   from public.classroom_enrollments where section_id = $1 order by display_name`,
				[p1]
			);
			const submissions = await q(
				`select id, item_id, student_email, state, submitted_at, returned_at,
				        rubric_scores, criterion_comments, score, teacher_comment,
				        graded_by, graded_at, updated_at
				   from public.classroom_submissions where item_id = $1`,
				[itemId]
			);
			return {
				roster: roster.rows as GradingData['roster'],
				submissions: (submissions.rows as Record<string, unknown>[]).map(normalizeSubmissionRow),
				responses: [],
				files: [],
				approvals: []
			};
		});

	const csvFor = async (itemId: string, outOf: number) =>
		gradesCsv(
			studentWorkRows(await loadGrading(itemId)).map((s) => ({
				displayName: s.displayName,
				email: s.email,
				score: s.submission?.state === 'returned' ? (s.submission.score ?? null) : null,
				outOf
			}))
		);

	/**
	 * The grid, less its own `generated_at` -- the one field that legitimately
	 * differs between two reads of an unchanged class, and comparing it would
	 * make this assertion fail for the clock rather than for the schema.
	 */
	const readGrid = async (unit: number | null) => {
		const grid = await rpc<SectionGrid & { generated_at?: string }>(
			teacherA.id,
			'public.notebook_get_section_grid($1::uuid, $2::integer)',
			[p1, unit]
		);
		const { generated_at: _stamp, ...rest } = grid;
		return rest as SectionGrid;
	};

	const unitLinks = async () =>
		(
			await db.sql<{ section_id: string; unit_number: number; item_id: string }>(
				`select section_id, unit_number, item_id from public.notebook_unit_items
				  order by section_id, unit_number`
			)
		).rows;

	it('linking a check-in to the graded item changes nothing about the grade', async () => {
		// Unit 1 is graded on docItem, the 0097 way, with two check-ins in it.
		await rpc(teacherA.id, 'public.notebook_link_unit_item($1::uuid, $2::integer, $3::uuid)', [
			p1,
			1,
			docItem
		]);
		const s1 = await createSession(teacherA.id, [p1], 1, '2026-10-01', 'Unit 1 bench test');
		const s2 = await createSession(teacherA.id, [p1], 1, '2026-10-02', 'Unit 1 teardown');
		await db.asUser(alice.id, (q) =>
			q('select public.notebook_create_entry($1, $2, $3, $4, null, $5)', [
				alice.id,
				'drive-alice-u1',
				s1,
				p1,
				'page.jpg'
			])
		);
		// The standard Documentation Check rubric, through the ordinary RPC, and
		// an ON-LEVEL score for every criterion (an off-level one would need an
		// evidence comment -- 0095's rule, and not this file's subject).
		await rpc(teacherA.id, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [
			docItem,
			JSON.stringify(DOC_CHECK_CRITERIA)
		]);
		const scores = Object.fromEntries(
			DOC_CHECK_CRITERIA.map((c) => [c.id, criterionMax(c)])
		);
		const graded = await rpc<{ ok: boolean; score?: number }>(
			teacherA.id,
			'public.classroom_grade_submission($1::uuid, $2, $3::jsonb, $4, $5, $6::jsonb)',
			[docItem, alice.email, JSON.stringify(scores), null, true, null]
		);
		expect(graded.ok).toBe(true);
		expect(graded.score).toBe(DOC_CHECK_TOTAL);

		const before = {
			links: await unitLinks(),
			grid: await readGrid(1),
			csv: await csvFor(docItem, DOC_CHECK_TOTAL),
			submissions: (
				await db.sql(
					`select item_id, student_email, state, score from public.classroom_submissions
					  order by student_email`
				)
			).rows
		};
		const beforeSummary = summarize(before.grid);

		// THE CHANGE UNDER TEST: the day's material and one of unit 1's check-ins
		// become one row, on an item that is NOT the graded one...
		await link(teacherA.id, s1, p1, soloMaterial);
		// ...and then on one that IS, which is the case worth being sure about:
		// a check-in hanging off the very assignment the unit is graded through
		// must still not create a second score anywhere.
		await link(teacherA.id, s2, p1, docItem);

		const after = {
			links: await unitLinks(),
			grid: await readGrid(1),
			csv: await csvFor(docItem, DOC_CHECK_TOTAL),
			submissions: (
				await db.sql(
					`select item_id, student_email, state, score from public.classroom_submissions
					  order by student_email`
				)
			).rows
		};

		expect(after.links).toEqual(before.links);
		expect(after.grid).toEqual(before.grid);
		expect(after.csv).toEqual(before.csv);
		expect(after.submissions).toEqual(before.submissions);
		expect(summarize(after.grid)).toEqual(beforeSummary);

		// And the positive control, so the four comparisons above are not four
		// readings of nothing: the grade is real, and the CSV carries it.
		expect(before.submissions).toHaveLength(1);
		expect(before.csv).toContain(String(DOC_CHECK_TOTAL));
		expect(beforeSummary.length).toBe(2);
	});

	it('creates no submission, no response and no rubric of its own', async () => {
		const res = await createForItem(teacherA.id, soloMaterial, 8, '2026-10-08', 'Bearing pages');
		await db.asUser(alice.id, (q) =>
			q('select public.notebook_create_entry($1, $2, $3, $4, null, $5)', [
				alice.id,
				'drive-alice-linked',
				res.session_id,
				p1,
				'page.jpg'
			])
		);

		// A check-in filed against a MATERIAL is still not a submission of
		// anything: nothing in the assignment engine has heard of it.
		const counts = await db.sql<{ submissions: string; responses: string; rubrics: string }>(
			`select (select count(*) from public.classroom_submissions where item_id = $1) as submissions,
			        (select count(*) from public.classroom_responses where item_id = $1) as responses,
			        (select count(*) from public.classroom_rubrics where item_id = $1) as rubrics`,
			[soloMaterial]
		);
		expect(counts.rows[0]).toEqual({ submissions: '0', responses: '0', rubrics: '0' });
	});
});
