// tests/classroom-security.test.ts
//
// The classroom module's security boundaries, against a real Postgres with the
// real migrations applied (see tests/db/harness.ts). DELIBERATELY NARROW, the
// notebook-security.test.ts convention: this is not a feature suite, it is a
// suite for the guarantees that would regress SILENTLY -- nothing visible
// breaks if a student can quietly read another class's stream, or if a draft
// leaks, until real students are looking at real content.
//
// Since 0085 the content model is CANONICAL: one classroom_items row per piece
// of content, one classroom_postings row per class it appears in. That moved
// where the draft rule lives (the postings policy and classroom_can_read_item)
// without changing what it has to guarantee, so every assertion below is about
// the same property it always was.
//
//   1. RLS scoping: a student reads ONLY the PUBLISHED items posted to a class
//      they are actively enrolled in (with their links and attachments), their
//      own enrollment row, and their own section row -- never another class's
//      anything, and never a classmate's roster row.
//   2. Draft integrity: unpublished content is invisible to students at the
//      policy level (not app code), visible to the section's own teacher, and
//      un-publishing an already-visible item closes the leak EVERYWHERE it is
//      posted at once.
//   3. No direct writes: INSERT/UPDATE/DELETE on every classroom table is
//      rejected for students AND teachers -- the SECURITY DEFINER RPCs are the
//      only door. The one student write path (mark-viewed) is an RPC that
//      cannot name anybody else.
//   4. Teacher-of-record boundary: a teacher cannot write into (or read) a
//      class that is not theirs, including a multi-class publish naming one
//      foreign section (all-or-nothing: nothing partial lands).
//   5. The roster import is idempotent and refuses foreign-section rows per row.
//   6. The admin tier (the pinned owner) genuinely reaches across sections,
//      and -- the keep-the-rest-honest assertion -- plain teachers are NOT
//      admins, so every boundary test above means what it says.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

const MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql'
] as const;

let db: TestDb;

let owner: SeededUser; // pinned admin: apina@boscotech.edu
let teacherA: SeededUser;
let teacherB: SeededUser;
let studentA: SeededUser; // enrolled in section P1 (teacherA's)
let studentB: SeededUser; // enrolled in section P2 (teacherB's)

let courseId: string;
let sectionA: string; // IDEA100 Period 1, teacher of record teacherA
let sectionB: string; // IDEA100 Period 2, teacher of record teacherB

let postAPub: string;
let postADraft: string;
let postBPub: string;
let asgAPub: string;
let asgADraft: string;
let asgBPub: string;

/** Fails loudly if the statement SUCCEEDS; otherwise hands back the error. */
async function captureError(
	run: () => Promise<unknown>
): Promise<{ code?: string; message: string }> {
	try {
		await run();
	} catch (error) {
		const e = error as { code?: string; message?: string };
		return { code: e.code, message: e.message ?? String(error) };
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
}

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

interface ItemOpts {
	title?: string | null;
	body?: string;
	points?: number | null;
	dueAt?: string | null;
	category?: string | null;
	published?: boolean;
	links?: { label: string; url: string }[];
	pinned?: boolean;
}

function createItem(
	userId: string,
	kind: 'post' | 'assignment' | 'material',
	sectionIds: string[],
	opts: ItemOpts = {}
): Promise<{ item_id: string; section_ids: string[]; published: boolean }> {
	return rpc(
		userId,
		'public.classroom_create_item($1, $2::uuid[], $3, $4, $5, $6::timestamptz, $7, $8, $9::jsonb, $10)',
		[
			kind,
			sectionIds,
			opts.title ?? null,
			opts.body ?? '',
			opts.points ?? null,
			opts.dueAt ?? null,
			opts.category ?? null,
			opts.published ?? true,
			JSON.stringify(opts.links ?? []),
			opts.pinned ?? false
		]
	);
}

function updateItem(
	userId: string,
	id: string,
	opts: ItemOpts & { resources?: { label: string; url: string }[] | null } = {}
): Promise<{ item_id: string; published: boolean; edited: boolean }> {
	return rpc(
		userId,
		'public.classroom_update_item($1::uuid, $2, $3, $4, $5::timestamptz, $6, $7, $8::jsonb)',
		[
			id,
			opts.title ?? null,
			opts.body ?? '',
			opts.points ?? null,
			opts.dueAt ?? null,
			opts.category ?? null,
			opts.published ?? null,
			opts.resources === undefined ? null : JSON.stringify(opts.resources)
		]
	);
}

function importRoster(
	userId: string,
	rows: { email: string; name?: string; course_code: string; section_label: string }[]
): Promise<{
	total: number;
	succeeded: number;
	refused: number;
	results: { row: number; email: string; ok: boolean; reason?: string; action?: string }[];
}> {
	return rpc(userId, 'public.classroom_import_roster($1::jsonb)', [JSON.stringify(rows)]);
}

/** Item ids the caller can read, optionally of one kind. */
async function visibleItems(userId: string, kind?: string): Promise<string[]> {
	const { rows } = await db.asUser(userId, (q) =>
		q<{ id: string }>(
			kind
				? 'select id from public.classroom_items where kind = $1 order by created_at'
				: 'select id from public.classroom_items order by created_at',
			kind ? [kind] : []
		)
	);
	return rows.map((r) => r.id);
}

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);

	owner = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	teacherA = await createUser(db, 'tvargas@boscotech.edu', 'T. Vargas');
	teacherB = await createUser(db, 'mreed@boscotech.edu', 'M. Reed');
	studentA = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	studentB = await createUser(db, 'bruno@boscotech.net', 'Bruno Baptiste');

	// teacherA creates the course + their section; teacherB's identical course
	// call converges on the same row (create-or-get) and adds their own section.
	const course = await rpc<{ course_id: string; created: boolean }>(
		teacherA.id,
		'public.classroom_upsert_course($1, $2)',
		['idea100', 'Intro to Engineering Design']
	);
	courseId = course.course_id;
	expect(course.created).toBe(true);

	const again = await rpc<{ course_id: string; created: boolean }>(
		teacherB.id,
		'public.classroom_upsert_course($1, $2)',
		['IDEA100', 'A different title that must NOT overwrite']
	);
	expect(again).toEqual({ course_id: courseId, created: false });

	sectionA = (
		await rpc<{ section_id: string }>(
			teacherA.id,
			'public.classroom_upsert_section($1::uuid, $2, $3)',
			[courseId, 'Period 1', 'Block A']
		)
	).section_id;
	sectionB = (
		await rpc<{ section_id: string }>(
			teacherB.id,
			'public.classroom_upsert_section($1::uuid, $2, $3)',
			[courseId, 'Period 2', 'Block B']
		)
	).section_id;

	await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3)', [
		sectionA,
		studentA.email,
		'Alice Alvarez'
	]);
	await rpc(teacherB.id, 'public.classroom_set_enrollment($1::uuid, $2, $3)', [
		sectionB,
		studentB.email,
		'Bruno Baptiste'
	]);

	postAPub = (
		await createItem(teacherA.id, 'post', [sectionA], {
			title: 'Welcome',
			body: 'Welcome to Period 1!'
		})
	).item_id;
	postADraft = (
		await createItem(teacherA.id, 'post', [sectionA], {
			body: 'Draft: grading day plan',
			published: false
		})
	).item_id;
	postBPub = (
		await createItem(teacherB.id, 'post', [sectionB], { body: 'Welcome to Period 2!' })
	).item_id;

	asgAPub = (
		await createItem(teacherA.id, 'assignment', [sectionA], {
			title: 'Bridge sketch',
			body: 'Sketch the truss bridge.',
			points: 20,
			category: 'Unit Labs',
			dueAt: '2026-09-01T07:00:00Z',
			links: [{ label: 'Truss guide', url: 'https://example.com/truss' }]
		})
	).item_id;
	asgADraft = (
		await createItem(teacherA.id, 'assignment', [sectionA], {
			title: 'Draft: final exam review',
			published: false,
			links: [{ label: 'Secret answer key', url: 'https://example.com/key' }]
		})
	).item_id;
	asgBPub = (
		await createItem(teacherB.id, 'assignment', [sectionB], { title: 'CAD warmup', points: 5 })
	).item_id;
}, 240_000);

afterAll(async () => {
	await db.stop();
});

describe('honesty of the fixture itself', () => {
	test('plain teachers are NOT admins (0067), so the boundary tests below mean something', async () => {
		for (const t of [teacherA, teacherB]) {
			const { rows } = await db.asUser(t.id, (q) =>
				q<{ is_admin: boolean }>('select public.is_admin() as is_admin')
			);
			expect(rows[0].is_admin).toBe(false);
		}
		const { rows } = await db.asUser(owner.id, (q) =>
			q<{ is_admin: boolean }>('select public.is_admin() as is_admin')
		);
		expect(rows[0].is_admin).toBe(true);
	});
});

describe('student read scoping', () => {
	test('a student reads only the PUBLISHED items of their own class, by list AND by id', async () => {
		expect(await visibleItems(studentA.id, 'post')).toEqual([postAPub]);
		expect(await visibleItems(studentA.id, 'assignment')).toEqual([asgAPub]);

		for (const foreign of [postBPub, asgBPub]) {
			const { rows } = await db.asUser(studentA.id, (q) =>
				q('select id from public.classroom_items where id = $1', [foreign])
			);
			expect(rows).toHaveLength(0);
		}
	});

	test('the POSTINGS themselves are scoped the same way -- no back door to what exists', async () => {
		// The postings table is what says "this item is in that class". If it
		// leaked, a student could enumerate a foreign class's whole stream by id
		// without ever reading an item row.
		const { rows } = await db.asUser(studentA.id, (q) =>
			q<{ item_id: string; section_id: string }>(
				'select item_id, section_id from public.classroom_postings'
			)
		);
		expect(rows.every((r) => r.section_id === sectionA)).toBe(true);
		expect(rows.map((r) => r.item_id).sort()).toEqual([postAPub, asgAPub].sort());
	});

	test('drafts are invisible to the student, visible to the section teacher', async () => {
		for (const draft of [postADraft, asgADraft]) {
			const { rows } = await db.asUser(studentA.id, (q) =>
				q('select id from public.classroom_items where id = $1', [draft])
			);
			expect(rows).toHaveLength(0);
		}

		const teacherSees = await visibleItems(teacherA.id);
		expect(teacherSees.sort()).toEqual([postAPub, postADraft, asgAPub, asgADraft].sort());
	});

	test('links follow item visibility: published readable, a draft key hidden', async () => {
		const pub = await db.asUser(studentA.id, (q) =>
			q<{ label: string }>('select label from public.classroom_item_resources where item_id = $1', [
				asgAPub
			])
		);
		expect(pub.rows.map((r) => r.label)).toEqual(['Truss guide']);

		// The draft's "Secret answer key" must not leak even though the resources
		// table has no published column -- visibility delegates to the item.
		const draft = await db.asUser(studentA.id, (q) =>
			q('select label from public.classroom_item_resources where item_id = $1', [asgADraft])
		);
		expect(draft.rows).toHaveLength(0);

		const all = await db.asUser(studentA.id, (q) =>
			q<{ label: string }>('select label from public.classroom_item_resources')
		);
		expect(all.rows.map((r) => r.label)).toEqual(['Truss guide']);
	});

	test('a student sees their own section row and not the other section', async () => {
		const sections = await db.asUser(studentA.id, (q) =>
			q<{ id: string }>('select id from public.classroom_sections')
		);
		expect(sections.rows.map((r) => r.id)).toEqual([sectionA]);
	});

	test('a student reads only their OWN enrollment row, never a classmate roster', async () => {
		const mine = await db.asUser(studentA.id, (q) =>
			q<{ student_email: string }>('select student_email from public.classroom_enrollments')
		);
		expect(mine.rows.map((r) => r.student_email)).toEqual([studentA.email]);

		const others = await db.asUser(studentA.id, (q) =>
			q('select student_email from public.classroom_enrollments where student_email = $1', [
				studentB.email
			])
		);
		expect(others.rows).toHaveLength(0);
	});

	test('un-publishing an already-visible item closes the read, and its links with it', async () => {
		await updateItem(teacherA.id, asgAPub, {
			title: 'Bridge sketch',
			body: 'Sketch the truss bridge.',
			points: 20,
			dueAt: '2026-09-01T07:00:00Z',
			category: 'Unit Labs',
			published: false
		});

		const hidden = await db.asUser(studentA.id, (q) =>
			q('select id from public.classroom_items where id = $1', [asgAPub])
		);
		expect(hidden.rows).toHaveLength(0);
		const hiddenRes = await db.asUser(studentA.id, (q) =>
			q('select id from public.classroom_item_resources where item_id = $1', [asgAPub])
		);
		expect(hiddenRes.rows).toHaveLength(0);
		const hiddenPosting = await db.asUser(studentA.id, (q) =>
			q('select id from public.classroom_postings where item_id = $1', [asgAPub])
		);
		expect(hiddenPosting.rows).toHaveLength(0);

		await updateItem(teacherA.id, asgAPub, {
			title: 'Bridge sketch',
			body: 'Sketch the truss bridge.',
			points: 20,
			dueAt: '2026-09-01T07:00:00Z',
			category: 'Unit Labs',
			published: true
		});
		const restored = await db.asUser(studentA.id, (q) =>
			q('select id from public.classroom_items where id = $1', [asgAPub])
		);
		expect(restored.rows).toHaveLength(1);
	});
});

describe('no direct writes for anyone', () => {
	test('a student cannot INSERT/UPDATE/DELETE any classroom table', async () => {
		const attempts: [string, unknown[]][] = [
			[
				`insert into public.classroom_items (kind, body, author_email) values ('post', 'hack', 'x@y')`,
				[]
			],
			[`update public.classroom_items set published = true where id = $1`, [postADraft]],
			[`delete from public.classroom_items where id = $1`, [postAPub]],
			[
				`insert into public.classroom_postings (item_id, section_id) values ($1, $2)`,
				[postBPub, sectionA]
			],
			[`delete from public.classroom_postings where item_id = $1`, [postAPub]],
			[
				`insert into public.classroom_item_resources (item_id, label, url) values ($1, 'x', 'https://x.example')`,
				[asgAPub]
			],
			[
				`insert into public.classroom_enrollments (section_id, student_email, display_name) values ($1, 'x@boscotech.net', 'X')`,
				[sectionA]
			],
			[`update public.classroom_enrollments set active = false where student_email = $1`, [studentA.email]],
			[`delete from public.classroom_enrollments where student_email = $1`, [studentA.email]],
			[`insert into public.classroom_sections (course_id, label, teacher_email) values ($1, 'X', 'alice@boscotech.net')`, [courseId]],
			[`update public.classroom_sections set teacher_email = $1 where id = $2`, [studentA.email, sectionA]],
			[`insert into public.classroom_courses (code, title) values ('HACK101', 'Hack')`, []],
			[`update public.classroom_courses set title = 'Hacked' where id = $1`, [courseId]],
			[`delete from public.classroom_courses where id = $1`, [courseId]],
			// The one table a student legitimately gains rows in -- through an RPC
			// that resolves them from their own session, never by writing directly.
			[
				`insert into public.classroom_item_views (student_email, item_id) values ($1, $2)`,
				[studentA.email, postAPub]
			],
			[`update public.classroom_item_views set viewed_at = now()`, []],
			[`delete from public.classroom_item_views`, []]
		];
		for (const [text, params] of attempts) {
			const err = await captureError(() => db.asUser(studentA.id, (q) => q(text, params)));
			expect(err.code).toBe('42501');
		}
	});

	test('even the section teacher has no direct write path -- RPCs are the only door', async () => {
		const attempts: [string, unknown[]][] = [
			[
				`insert into public.classroom_items (kind, body, author_email) values ('post', 'direct', $1)`,
				[teacherA.email]
			],
			[`update public.classroom_items set body = 'edited directly' where id = $1`, [postAPub]],
			[`delete from public.classroom_items where id = $1`, [asgADraft]],
			[`insert into public.classroom_postings (item_id, section_id) values ($1, $2)`, [postAPub, sectionB]],
			[
				`insert into public.classroom_enrollments (section_id, student_email, display_name) values ($1, 'y@boscotech.net', 'Y')`,
				[sectionA]
			]
		];
		for (const [text, params] of attempts) {
			const err = await captureError(() => db.asUser(teacherA.id, (q) => q(text, params)));
			expect(err.code).toBe('42501');
		}
	});

	test('a student calling the write RPCs is refused by the check inside', async () => {
		const post = await captureError(() =>
			createItem(studentA.id, 'post', [sectionA], { body: 'student post' })
		);
		expect(post.message).toMatch(/teacher of record/i);

		const asg = await captureError(() =>
			createItem(studentA.id, 'assignment', [sectionA], { title: 'student asg' })
		);
		expect(asg.message).toMatch(/teacher of record/i);

		const edit = await captureError(() =>
			updateItem(studentA.id, postAPub, { body: 'hijacked' })
		);
		expect(edit.message).toMatch(/teacher of record/i);

		const pin = await captureError(() =>
			rpc(studentA.id, 'public.classroom_set_item_pinned($1::uuid, true)', [postAPub])
		);
		expect(pin.message).toMatch(/teacher of record/i);

		const order = await captureError(() =>
			rpc(studentA.id, 'public.classroom_set_item_order($1::uuid[])', [[postAPub]])
		);
		expect(order.message).toMatch(/teacher of record/i);

		const dup = await captureError(() =>
			rpc(studentA.id, 'public.classroom_duplicate_item($1::uuid)', [postAPub])
		);
		expect(dup.message).toMatch(/teacher of record/i);

		const enroll = await captureError(() =>
			rpc(studentA.id, 'public.classroom_set_enrollment($1::uuid, $2)', [sectionA, 'z@boscotech.net'])
		);
		expect(enroll.message).toMatch(/teacher of record|site admin/i);

		const imp = await captureError(() =>
			importRoster(studentA.id, [
				{ email: 'z@boscotech.net', name: 'Z', course_code: 'IDEA100', section_label: 'Period 1' }
			])
		);
		expect(imp.message).toMatch(/only staff/i);

		const course = await captureError(() =>
			rpc(studentA.id, 'public.classroom_upsert_course($1, $2)', ['HACK1', 'Hack'])
		);
		expect(course.message).toMatch(/only staff/i);

		const section = await captureError(() =>
			rpc(studentA.id, 'public.classroom_upsert_section($1::uuid, $2)', [courseId, 'Period 9'])
		);
		expect(section.message).toMatch(/only staff/i);
	});
});

describe('teacher-of-record boundary', () => {
	test('a teacher cannot publish into a class that is not theirs', async () => {
		const err = await captureError(() =>
			createItem(teacherB.id, 'post', [sectionA], { body: 'wrong section' })
		);
		expect(err.message).toMatch(/teacher of record/i);
	});

	test('a multi-class publish naming one foreign section is refused entirely -- nothing partial lands', async () => {
		const before = await db.sql<{ n: string }>(
			'select count(*) as n from public.classroom_postings where section_id = $1',
			[sectionB]
		);
		const err = await captureError(() =>
			createItem(teacherB.id, 'post', [sectionB, sectionA], { body: 'own section plus foreign' })
		);
		expect(err.message).toMatch(/teacher of record/i);
		const after = await db.sql<{ n: string }>(
			'select count(*) as n from public.classroom_postings where section_id = $1',
			[sectionB]
		);
		expect(after.rows[0].n).toBe(before.rows[0].n);
		// And no orphan item was left behind by the refused publish.
		const orphans = await db.sql<{ n: string }>(
			`select count(*) as n from public.classroom_items i
			 where not exists (select 1 from public.classroom_postings p where p.item_id = i.id)`
		);
		expect(orphans.rows[0].n).toBe('0');
	});

	test('a teacher cannot edit, pin, duplicate or delete another teacher item', async () => {
		const upd = await captureError(() => updateItem(teacherB.id, postAPub, { body: 'hijacked' }));
		expect(upd.message).toMatch(/teacher of record/i);

		const del = await captureError(() =>
			rpc(teacherB.id, 'public.classroom_delete_item($1::uuid)', [postAPub])
		);
		expect(del.message).toMatch(/teacher of record/i);

		const pin = await captureError(() =>
			rpc(teacherB.id, 'public.classroom_set_item_pinned($1::uuid, true)', [postAPub])
		);
		expect(pin.message).toMatch(/teacher of record/i);

		const dup = await captureError(() =>
			rpc(teacherB.id, 'public.classroom_duplicate_item($1::uuid)', [postAPub])
		);
		expect(dup.message).toMatch(/teacher of record/i);

		const link = await captureError(() =>
			rpc(teacherB.id, 'public.classroom_add_postings($1::uuid, $2::uuid[])', [postAPub, [sectionB]])
		);
		expect(link.message).toMatch(/teacher of record/i);
	});

	test('a teacher reads neither the content nor the roster of a foreign class', async () => {
		const items = await db.asUser(teacherB.id, (q) =>
			q('select id from public.classroom_items where id = $1', [postAPub])
		);
		expect(items.rows).toHaveLength(0);

		const roster = await db.asUser(teacherB.id, (q) =>
			q('select student_email from public.classroom_enrollments where section_id = $1', [sectionA])
		);
		expect(roster.rows).toHaveLength(0);

		const own = await db.asUser(teacherB.id, (q) =>
			q<{ student_email: string }>(
				'select student_email from public.classroom_enrollments where section_id = $1',
				[sectionB]
			)
		);
		expect(own.rows.map((r) => r.student_email)).toEqual([studentB.email]);
	});

	test('a teacher cannot enroll students into a foreign section', async () => {
		const err = await captureError(() =>
			rpc(teacherB.id, 'public.classroom_set_enrollment($1::uuid, $2)', [
				sectionA,
				'sneak@boscotech.net'
			])
		);
		expect(err.message).toMatch(/teacher of record|site admin/i);
	});

	test('a teacher cannot take over a foreign section', async () => {
		const takeover = await captureError(() =>
			rpc(teacherB.id, 'public.classroom_upsert_section($1::uuid, $2, $3, $4, $5::uuid)', [
				courseId,
				'Period 1 stolen',
				null,
				null,
				sectionA
			])
		);
		expect(takeover.message).toMatch(/teacher of record|site admin/i);
	});
});

describe('admin tier reaches across sections', () => {
	test('the pinned owner reads all classes content and rosters', async () => {
		const postings = await db.asUser(owner.id, (q) =>
			q<{ section_id: string }>('select distinct section_id from public.classroom_postings')
		);
		expect(postings.rows.map((r) => r.section_id).sort()).toEqual([sectionA, sectionB].sort());

		const roster = await db.asUser(owner.id, (q) =>
			q<{ student_email: string }>('select student_email from public.classroom_enrollments')
		);
		expect(roster.rows.map((r) => r.student_email).sort()).toEqual(
			[studentA.email, studentB.email].sort()
		);
	});

	test('the owner can publish into any class (is_admin inside classroom_manages_section)', async () => {
		const created = await createItem(owner.id, 'post', [sectionA, sectionB], {
			body: 'All-hands announcement'
		});
		expect(created.section_ids).toHaveLength(2);
		// Clean up so the per-section counts in other tests stay meaningful.
		await rpc(owner.id, 'public.classroom_delete_item($1::uuid)', [created.item_id]);
	});
});

describe('roster import', () => {
	test('importing the same file twice never duplicates an enrollment', async () => {
		const rows = [
			{
				email: 'Alice@boscotech.net', // mixed case on purpose: must land on the same key
				name: 'Alice A. Alvarez',
				course_code: 'IDEA100',
				section_label: 'Period 1'
			},
			{
				email: 'carla@boscotech.net',
				name: 'Carla Cardenas',
				course_code: 'idea100', // case-insensitive course lookup
				section_label: 'period 1' // case-insensitive label lookup
			}
		];

		const first = await importRoster(teacherA.id, rows);
		expect(first.succeeded).toBe(2);
		expect(first.refused).toBe(0);
		expect(first.results.map((r) => r.action).sort()).toEqual(['created', 'updated']);

		const second = await importRoster(teacherA.id, rows);
		expect(second.succeeded).toBe(2);
		expect(second.results.every((r) => r.action === 'updated')).toBe(true);

		const count = await db.sql<{ n: string }>(
			'select count(*) as n from public.classroom_enrollments where section_id = $1',
			[sectionA]
		);
		expect(count.rows[0].n).toBe('2');

		// The re-import updated the display name in place rather than duplicating.
		const alice = await db.sql<{ display_name: string }>(
			'select display_name from public.classroom_enrollments where section_id = $1 and student_email = $2',
			[sectionA, studentA.email]
		);
		expect(alice.rows[0].display_name).toBe('Alice A. Alvarez');
	});

	test('a row targeting another teacher section is refused per row, and never lands', async () => {
		const summary = await importRoster(teacherA.id, [
			{ email: 'dana@boscotech.net', name: 'Dana', course_code: 'IDEA100', section_label: 'Period 1' },
			{ email: 'eve@boscotech.net', name: 'Eve', course_code: 'IDEA100', section_label: 'Period 2' }
		]);
		expect(summary.succeeded).toBe(1);
		expect(summary.refused).toBe(1);
		expect(summary.results[1].reason).toBe('not_your_section');

		const landed = await db.sql<{ n: string }>(
			'select count(*) as n from public.classroom_enrollments where student_email = $1',
			['eve@boscotech.net']
		);
		expect(landed.rows[0].n).toBe('0');
	});

	test('bad rows are refused with named reasons, good rows still land', async () => {
		const summary = await importRoster(teacherA.id, [
			{ email: 'not-an-email', course_code: 'IDEA100', section_label: 'Period 1' },
			{ email: 'frank@boscotech.net', course_code: 'NOPE999', section_label: 'Period 1' },
			{ email: 'gina@boscotech.net', course_code: 'IDEA100', section_label: 'Period 404' },
			{ email: 'hal@boscotech.net', name: 'Hal', course_code: 'IDEA100', section_label: 'Period 1' }
		]);
		expect(summary.total).toBe(4);
		expect(summary.succeeded).toBe(1);
		expect(summary.results.map((r) => r.reason)).toEqual([
			'bad_email',
			'course_not_found',
			'section_not_found',
			undefined
		]);
	});
});

describe('attachments', () => {
	let attachA: string;
	let attachDraft: string;

	async function attach(
		userId: string,
		itemId: string,
		driveId: string,
		filename = 'handout.pdf'
	): Promise<{ ok: boolean; attachment_id: string; drive_file_id: string }> {
		return rpc(userId, 'public.classroom_add_attachment($1::uuid, $2, $3, $4, $5::bigint)', [
			itemId,
			driveId,
			filename,
			'application/pdf',
			1024
		]);
	}

	test('a teacher attaches to their own item; the row lands on the canonical record', async () => {
		const res = await attach(teacherA.id, asgAPub, 'drive-a-1');
		attachA = res.attachment_id;
		expect(res.ok).toBe(true);

		const draft = await attach(teacherA.id, asgADraft, 'drive-draft-1', 'answer-key.pdf');
		attachDraft = draft.attachment_id;

		const { rows } = await db.sql<{ item_id: string }>(
			'select item_id from public.classroom_attachments where id = $1',
			[attachA]
		);
		expect(rows[0].item_id).toBe(asgAPub);
	});

	test('an attachment is visible exactly where its ITEM is', async () => {
		const student = await db.asUser(studentA.id, (q) =>
			q<{ id: string }>('select id from public.classroom_attachments')
		);
		expect(student.rows.map((r) => r.id)).toEqual([attachA]);

		const foreign = await db.asUser(studentB.id, (q) =>
			q('select id from public.classroom_attachments where id = $1', [attachA])
		);
		expect(foreign.rows).toHaveLength(0);

		const teacher = await db.asUser(teacherA.id, (q) =>
			q<{ id: string }>('select id from public.classroom_attachments')
		);
		expect(teacher.rows.map((r) => r.id).sort()).toEqual([attachA, attachDraft].sort());
	});

	test('un-publishing the item closes its attachments in the same statement', async () => {
		await updateItem(teacherA.id, asgAPub, {
			title: 'Bridge sketch',
			body: 'Sketch the truss bridge.',
			points: 20,
			dueAt: '2026-09-01T07:00:00Z',
			category: 'Unit Labs',
			published: false
		});
		const hidden = await db.asUser(studentA.id, (q) =>
			q('select id from public.classroom_attachments where id = $1', [attachA])
		);
		expect(hidden.rows).toHaveLength(0);

		await updateItem(teacherA.id, asgAPub, {
			title: 'Bridge sketch',
			body: 'Sketch the truss bridge.',
			points: 20,
			dueAt: '2026-09-01T07:00:00Z',
			category: 'Unit Labs',
			published: true
		});
		const back = await db.asUser(studentA.id, (q) =>
			q('select id from public.classroom_attachments where id = $1', [attachA])
		);
		expect(back.rows).toHaveLength(1);
	});

	test('nobody has a direct write path to classroom_attachments', async () => {
		for (const actor of [studentA, teacherA, owner]) {
			const err = await captureError(() =>
				db.asUser(actor.id, (q) =>
					q(
						`insert into public.classroom_attachments (item_id, drive_file_id, filename, mime_type, uploaded_by)
						 values ($1, 'x', 'x.pdf', 'application/pdf', 'x@y')`,
						[asgAPub]
					)
				)
			);
			expect(err.code).toBe('42501');
		}
	});

	test('a student cannot attach, and a teacher cannot attach to a foreign item', async () => {
		const student = await captureError(() => attach(studentA.id, asgAPub, 'nope'));
		expect(student.message).toMatch(/teacher of record/i);

		const foreign = await captureError(() => attach(teacherB.id, asgAPub, 'nope'));
		expect(foreign.message).toMatch(/teacher of record/i);
	});

	test('only a manager can delete an attachment, and the orphan report is honest', async () => {
		const refused = await captureError(() =>
			rpc(teacherB.id, 'public.classroom_delete_attachment($1::uuid)', [attachA])
		);
		expect(refused.message).toMatch(/teacher of record/i);

		// A duplicate carries the SAME Drive file onto a second row, so removing
		// one must NOT report the blob as orphaned.
		const copy = await rpc<{ item_id: string }>(
			teacherA.id,
			'public.classroom_duplicate_item($1::uuid)',
			[asgAPub]
		);
		const copiedAttachment = await db.sql<{ id: string }>(
			'select id from public.classroom_attachments where item_id = $1',
			[copy.item_id]
		);
		expect(copiedAttachment.rows).toHaveLength(1);

		const notOrphan = await rpc<{ orphaned: boolean }>(
			teacherA.id,
			'public.classroom_delete_attachment($1::uuid)',
			[copiedAttachment.rows[0].id]
		);
		expect(notOrphan.orphaned).toBe(false);

		await rpc(teacherA.id, 'public.classroom_delete_item($1::uuid)', [copy.item_id]);
	});

	test('deleting an item reports the Drive files it just orphaned', async () => {
		const made = await createItem(teacherA.id, 'post', [sectionA], { body: 'temporary' });
		await attach(teacherA.id, made.item_id, 'drive-temp-1', 'temp.pdf');
		const res = await rpc<{ orphaned_drive_file_ids: string[] }>(
			teacherA.id,
			'public.classroom_delete_item($1::uuid)',
			[made.item_id]
		);
		expect(res.orphaned_drive_file_ids).toEqual(['drive-temp-1']);
	});
});

describe('section lifecycle', () => {
	test('a section holding anything is REFUSED, with the counts, and survives', async () => {
		const res = await rpc<{ ok: boolean; reason: string; items: number; enrollments: number }>(
			teacherA.id,
			'public.classroom_delete_section($1::uuid, $2)',
			[sectionA, 'Period 1']
		);
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('not_empty');
		expect(res.items).toBeGreaterThan(0);
		expect(res.enrollments).toBeGreaterThan(0);

		const alive = await db.sql('select id from public.classroom_sections where id = $1', [sectionA]);
		expect(alive.rows).toHaveLength(1);
	});

	test('an EMPTY section deletes -- but only with its label typed back', async () => {
		const made = await rpc<{ section_id: string }>(
			teacherA.id,
			'public.classroom_upsert_section($1::uuid, $2)',
			[courseId, 'Period 7']
		);
		const wrong = await captureError(() =>
			rpc(teacherA.id, 'public.classroom_delete_section($1::uuid, $2)', [made.section_id, 'Period 8'])
		);
		expect(wrong.message).toMatch(/type the section label/i);

		const still = await db.sql('select id from public.classroom_sections where id = $1', [
			made.section_id
		]);
		expect(still.rows).toHaveLength(1);

		// Case and surrounding whitespace are forgiven; typing it is the point.
		const done = await rpc<{ ok: boolean }>(
			teacherA.id,
			'public.classroom_delete_section($1::uuid, $2)',
			[made.section_id, '  period 7 ']
		);
		expect(done.ok).toBe(true);
		const gone = await db.sql('select id from public.classroom_sections where id = $1', [
			made.section_id
		]);
		expect(gone.rows).toHaveLength(0);
	});

	test('a student and a foreign teacher can neither archive nor delete a section', async () => {
		for (const actor of [studentA, teacherB]) {
			const archive = await captureError(() =>
				rpc(actor.id, 'public.classroom_set_section_active($1::uuid, false)', [sectionA])
			);
			expect(archive.message).toMatch(/teacher of record|site admin/i);

			const del = await captureError(() =>
				rpc(actor.id, 'public.classroom_delete_section($1::uuid, $2)', [sectionA, 'Period 1'])
			);
			expect(del.message).toMatch(/teacher of record|site admin/i);
		}
	});

	test('archiving is soft: the roster and content are untouched', async () => {
		await rpc(teacherA.id, 'public.classroom_set_section_active($1::uuid, false)', [sectionA]);
		const items = await db.sql<{ n: string }>(
			'select count(*) as n from public.classroom_postings where section_id = $1',
			[sectionA]
		);
		expect(Number(items.rows[0].n)).toBeGreaterThan(0);
		const roster = await db.sql<{ n: string }>(
			'select count(*) as n from public.classroom_enrollments where section_id = $1',
			[sectionA]
		);
		expect(Number(roster.rows[0].n)).toBeGreaterThan(0);
		// A member still reads an archived class -- last term's work is the record.
		const stillVisible = await db.asUser(studentA.id, (q) =>
			q('select id from public.classroom_items where id = $1', [postAPub])
		);
		expect(stillVisible.rows).toHaveLength(1);

		await rpc(teacherA.id, 'public.classroom_set_section_active($1::uuid, true)', [sectionA]);
	});

	test('a teacher may hand their own section over, but still cannot take a foreign one', async () => {
		const made = await rpc<{ section_id: string }>(
			teacherA.id,
			'public.classroom_upsert_section($1::uuid, $2)',
			[courseId, 'Period 6']
		);
		const handed = await rpc<{ teacher_email: string }>(
			teacherA.id,
			'public.classroom_upsert_section($1::uuid, $2, $3, $4, $5::uuid)',
			[courseId, 'Period 6', null, teacherB.email, made.section_id]
		);
		expect(handed.teacher_email).toBe(teacherB.email);

		// Giving it away means genuinely losing it.
		const lost = await captureError(() =>
			rpc(teacherA.id, 'public.classroom_upsert_section($1::uuid, $2, $3, $4, $5::uuid)', [
				courseId,
				'Period 6 back',
				null,
				teacherA.email,
				made.section_id
			])
		);
		expect(lost.message).toMatch(/teacher of record|site admin/i);

		await rpc(teacherB.id, 'public.classroom_delete_section($1::uuid, $2)', [
			made.section_id,
			'Period 6'
		]);
	});
});

describe('enrollment corrections', () => {
	test('a typo is fixed IN PLACE, lowercased, with nothing left behind', async () => {
		await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3)', [
			sectionA,
			'typo@boscotech.net',
			'Typo Student'
		]);
		const res = await rpc<{ ok: boolean; student_email: string }>(
			teacherA.id,
			'public.classroom_update_enrollment($1::uuid, $2, $3, $4)',
			[sectionA, 'typo@boscotech.net', '  Fixed@BoscoTech.net ', 'Fixed Student']
		);
		expect(res.ok).toBe(true);
		expect(res.student_email).toBe('fixed@boscotech.net');

		const left = await db.sql('select 1 from public.classroom_enrollments where student_email = $1', [
			'typo@boscotech.net'
		]);
		expect(left.rows).toHaveLength(0);
	});

	test('correcting onto an email already on the roster is refused, not merged', async () => {
		const res = await rpc<{ ok: boolean; reason: string }>(
			teacherA.id,
			'public.classroom_update_enrollment($1::uuid, $2, $3)',
			[sectionA, 'fixed@boscotech.net', studentA.email]
		);
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('already_enrolled');
	});

	test('a student and a foreign teacher cannot correct a roster row', async () => {
		for (const actor of [studentA, teacherB]) {
			const err = await captureError(() =>
				rpc(actor.id, 'public.classroom_update_enrollment($1::uuid, $2, $3)', [
					sectionA,
					studentA.email,
					'hijack@boscotech.net'
				])
			);
			expect(err.message).toMatch(/teacher of record|site admin/i);
		}
	});
});

describe('view as student -- admin only, read only', () => {
	test('every view_as RPC refuses a student AND a plain teacher', async () => {
		const calls: [string, unknown[]][] = [
			['public.classroom_view_as_students()', []],
			['public.classroom_view_as_sections($1)', [studentA.email]],
			['public.classroom_view_as_section($1, $2::uuid)', [studentA.email, sectionA]],
			['public.classroom_view_as_item($1, $2::uuid, $3::uuid)', [studentA.email, sectionA, postAPub]],
			['public.classroom_view_as_can_read_attachment($1, $2::uuid)', [studentA.email, postAPub]]
		];
		for (const actor of [studentA, teacherA]) {
			for (const [call, params] of calls) {
				const err = await captureError(() => rpc(actor.id, call, params));
				expect(err.message).toMatch(/site admin/i);
			}
		}
	});

	test("the admin sees the STUDENT's classes, not their own reach", async () => {
		const sections = await rpc<{ id: string }[]>(owner.id, 'public.classroom_view_as_sections($1)', [
			studentA.email
		]);
		expect(sections.map((s) => s.id)).toEqual([sectionA]);
	});

	test('drafts are absent from the impersonated view even though the admin can read them', async () => {
		const payload = await rpc<{ items: { id: string }[] }>(
			owner.id,
			'public.classroom_view_as_section($1, $2::uuid)',
			[studentA.email, sectionA]
		);
		const ids = payload.items.map((i) => i.id);
		expect(ids).toContain(postAPub);
		expect(ids).not.toContain(postADraft);
		expect(ids).not.toContain(asgADraft);

		// The admin's OWN read still sees them -- the RPC narrows, it never widens.
		const direct = await db.asUser(owner.id, (q) =>
			q('select id from public.classroom_items where id = $1', [postADraft])
		);
		expect(direct.rows).toHaveLength(1);

		const draftItem = await rpc(
			owner.id,
			'public.classroom_view_as_item($1, $2::uuid, $3::uuid)',
			[studentA.email, sectionA, postADraft]
		);
		expect(draftItem).toBeNull();
	});

	test('a DEACTIVATED enrollment drops the class out of the impersonated view', async () => {
		await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, false)', [
			sectionA,
			studentA.email,
			'Alice A. Alvarez'
		]);
		const sections = await rpc<{ id: string }[]>(owner.id, 'public.classroom_view_as_sections($1)', [
			studentA.email
		]);
		expect(sections).toEqual([]);
		const section = await rpc(owner.id, 'public.classroom_view_as_section($1, $2::uuid)', [
			studentA.email,
			sectionA
		]);
		expect(section).toBeNull();

		await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, true)', [
			sectionA,
			studentA.email,
			'Alice A. Alvarez'
		]);
	});

	test('there is NO view_as write function at all -- read-only is structural', async () => {
		const { rows } = await db.sql<{ name: string; volatility: string }>(
			`select p.proname as name, p.provolatile as volatility
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname like 'classroom_view_as%'
			 order by p.proname`
		);

		/**
		 * THE RULE, NOT THE ROSTER.
		 *
		 * This used to spell out five function names, which made it a list to
		 * edit every time the surface moved rather than a guard on anything: it
		 * would have failed the moment a sixth read-only reader was added, and it
		 * said nothing about a seventh that could write. What it exists to
		 * protect is that NOTHING under this prefix can write, whatever the set
		 * happens to be. 's' = STABLE; a VOLATILE function is the first thing
		 * able to.
		 *
		 * THE COUNT IS ITS POSITIVE CONTROL. Without it, a prefix typo or a
		 * chain that never applied 0083 would return zero rows and every
		 * assertion below would pass by finding nothing.
		 */
		expect(rows.length).toBeGreaterThanOrEqual(5);
		expect(rows.filter((r) => r.volatility !== 's').map((r) => r.name)).toEqual([]);

		// The class and item PREVIEWS were deleted from the app in the same
		// bundle as this generalization, leaving classroom_view_as_section,
		// classroom_view_as_item and classroom_view_as_can_read_attachment
		// applied but unreferenced (see docs/HISTORY.md for the orphan list). An
		// orphaned read-only function is harmless and is dropped by a later
		// migration; nothing here should care either way, and after this change
		// nothing does.
	});
});

describe('anon boundary', () => {
	test('anon has no EXECUTE on any classroom write RPC and no SELECT on any classroom table', async () => {
		const fns = [
			'classroom_create_item(text, uuid[], text, text, integer, timestamptz, text, boolean, jsonb, boolean)',
			'classroom_update_item(uuid, text, text, integer, timestamptz, text, boolean, jsonb)',
			'classroom_delete_item(uuid)',
			'classroom_duplicate_item(uuid, uuid[])',
			'classroom_add_postings(uuid, uuid[])',
			'classroom_remove_posting(uuid, uuid)',
			'classroom_set_item_pinned(uuid, boolean)',
			'classroom_set_item_order(uuid[])',
			'classroom_mark_item_viewed(uuid)',
			'classroom_add_attachment(uuid, text, text, text, bigint)',
			'classroom_delete_attachment(uuid)',
			'classroom_upsert_course(text, text, boolean, uuid)',
			'classroom_upsert_section(uuid, text, text, text, uuid)',
			'classroom_set_section_active(uuid, boolean)',
			'classroom_delete_section(uuid, text)',
			'classroom_set_enrollment(uuid, text, text, boolean)',
			'classroom_update_enrollment(uuid, text, text, text)',
			'classroom_import_roster(jsonb)',
			'classroom_view_as_students()',
			'classroom_view_as_sections(text)',
			'classroom_view_as_section(text, uuid)',
			'classroom_view_as_item(text, uuid, uuid)',
			'app_feedback_set_status(uuid, text)',
			'app_feedback_admin_list(text, integer)'
		];
		for (const fn of fns) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_function_privilege('anon', $1, 'execute') as ok`,
				[`public.${fn}`]
			);
			expect([fn, rows[0].ok]).toEqual([fn, false]);
		}

		const tables = [
			'classroom_courses',
			'classroom_sections',
			'classroom_enrollments',
			'classroom_items',
			'classroom_postings',
			'classroom_item_resources',
			'classroom_item_views',
			'classroom_attachments'
		];
		for (const table of tables) {
			for (const priv of ['select', 'insert', 'update', 'delete']) {
				const { rows } = await db.sql<{ ok: boolean }>(
					`select has_table_privilege('anon', $1, $2) as ok`,
					[`public.${table}`, priv]
				);
				expect([table, priv, rows[0].ok]).toEqual([table, priv, false]);
			}
		}
	});
});
