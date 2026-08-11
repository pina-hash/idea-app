// tests/classroom-security.test.ts
//
// Migration 0082's classroom module, against a real Postgres with the real
// migrations applied (see tests/db/harness.ts). DELIBERATELY NARROW, the
// notebook-security.test.ts convention: this is not a feature suite, it is a
// suite for the guarantees that would regress SILENTLY -- nothing visible
// breaks if a student can quietly read another section's stream, or if a
// draft leaks, until real students are looking at real content.
//
//   1. RLS scoping: a student reads ONLY their own section's PUBLISHED
//      content (posts, assignments, resources), their own enrollment row,
//      and their own section row -- never another section's anything, and
//      never a classmate's roster row.
//   2. Draft integrity: unpublished content is invisible to students at the
//      policy level (not app code), visible to the section's own teacher,
//      and un-publishing an already-visible row closes the leak.
//   3. No direct writes: INSERT/UPDATE/DELETE on every classroom table is
//      rejected for students AND teachers -- the SECURITY DEFINER RPCs are
//      the only door.
//   4. Teacher-of-record boundary: a teacher cannot write into (or read the
//      roster of) a section that is not theirs, including a multi-section
//      publish that names one foreign section (all-or-nothing: nothing
//      partial lands).
//   5. The roster import is idempotent (re-running the same file never
//      duplicates an enrollment) and refuses foreign-section rows per row.
//   6. The admin tier (the pinned owner) genuinely reaches across sections,
//      and -- the keep-the-rest-honest assertion -- plain teachers are NOT
//      admins, so every boundary test above means what it says.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';

const MIGRATIONS = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql'
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

function createPost(
	userId: string,
	sectionIds: string[],
	body: string,
	title: string | null = null,
	published = true
): Promise<{ group_id: string; post_ids: string[]; published: boolean }> {
	return rpc(userId, 'public.classroom_create_post($1::uuid[], $2, $3, $4)', [
		sectionIds,
		body,
		title,
		published
	]);
}

function createAssignment(
	userId: string,
	sectionIds: string[],
	title: string,
	opts: {
		description?: string;
		points?: number | null;
		dueAt?: string | null;
		category?: string | null;
		published?: boolean;
		resources?: { label: string; url: string }[];
	} = {}
): Promise<{ group_id: string; assignment_ids: string[]; published: boolean }> {
	return rpc(
		userId,
		'public.classroom_create_assignment($1::uuid[], $2, $3, $4, $5::timestamptz, $6, $7, $8::jsonb)',
		[
			sectionIds,
			title,
			opts.description ?? '',
			opts.points ?? null,
			opts.dueAt ?? null,
			opts.category ?? null,
			opts.published ?? true,
			JSON.stringify(opts.resources ?? [])
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

	postAPub = (await createPost(teacherA.id, [sectionA], 'Welcome to Period 1!', 'Welcome')).post_ids[0];
	postADraft = (await createPost(teacherA.id, [sectionA], 'Draft: grading day plan', null, false))
		.post_ids[0];
	postBPub = (await createPost(teacherB.id, [sectionB], 'Welcome to Period 2!')).post_ids[0];

	asgAPub = (
		await createAssignment(teacherA.id, [sectionA], 'Bridge sketch', {
			description: 'Sketch the truss bridge.',
			points: 20,
			category: 'Unit Labs',
			dueAt: '2026-09-01T07:00:00Z',
			resources: [{ label: 'Truss guide', url: 'https://example.com/truss' }]
		})
	).assignment_ids[0];
	asgADraft = (
		await createAssignment(teacherA.id, [sectionA], 'Draft: final exam review', {
			published: false,
			resources: [{ label: 'Secret answer key', url: 'https://example.com/key' }]
		})
	).assignment_ids[0];
	asgBPub = (
		await createAssignment(teacherB.id, [sectionB], 'CAD warmup', { points: 5 })
	).assignment_ids[0];
}, 180_000);

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
	test('a student reads only their own section published posts, by list AND by id', async () => {
		const list = await db.asUser(studentA.id, (q) =>
			q<{ id: string }>('select id from public.classroom_posts')
		);
		expect(list.rows.map((r) => r.id)).toEqual([postAPub]);

		const foreign = await db.asUser(studentA.id, (q) =>
			q('select id from public.classroom_posts where id = $1', [postBPub])
		);
		expect(foreign.rows).toHaveLength(0);
	});

	test('a student reads only their own section published assignments', async () => {
		const list = await db.asUser(studentA.id, (q) =>
			q<{ id: string }>('select id from public.classroom_assignments')
		);
		expect(list.rows.map((r) => r.id)).toEqual([asgAPub]);

		const foreign = await db.asUser(studentA.id, (q) =>
			q('select id from public.classroom_assignments where id = $1', [asgBPub])
		);
		expect(foreign.rows).toHaveLength(0);
	});

	test('drafts are invisible to the student, visible to the section teacher', async () => {
		const draftPost = await db.asUser(studentA.id, (q) =>
			q('select id from public.classroom_posts where id = $1', [postADraft])
		);
		expect(draftPost.rows).toHaveLength(0);

		const draftAsg = await db.asUser(studentA.id, (q) =>
			q('select id from public.classroom_assignments where id = $1', [asgADraft])
		);
		expect(draftAsg.rows).toHaveLength(0);

		const teacherPosts = await db.asUser(teacherA.id, (q) =>
			q<{ id: string }>('select id from public.classroom_posts where section_id = $1', [sectionA])
		);
		expect(teacherPosts.rows.map((r) => r.id).sort()).toEqual([postAPub, postADraft].sort());

		const teacherAsgs = await db.asUser(teacherA.id, (q) =>
			q<{ id: string }>('select id from public.classroom_assignments where section_id = $1', [
				sectionA
			])
		);
		expect(teacherAsgs.rows.map((r) => r.id).sort()).toEqual([asgAPub, asgADraft].sort());
	});

	test('resources follow assignment visibility: published readable, draft resources hidden', async () => {
		const pub = await db.asUser(studentA.id, (q) =>
			q<{ label: string }>(
				'select label from public.classroom_assignment_resources where assignment_id = $1',
				[asgAPub]
			)
		);
		expect(pub.rows.map((r) => r.label)).toEqual(['Truss guide']);

		// The draft's "Secret answer key" resource must not leak even though the
		// resources table itself has no published column -- visibility delegates
		// to the parent assignment.
		const draft = await db.asUser(studentA.id, (q) =>
			q('select label from public.classroom_assignment_resources where assignment_id = $1', [
				asgADraft
			])
		);
		expect(draft.rows).toHaveLength(0);

		const all = await db.asUser(studentA.id, (q) =>
			q<{ label: string }>('select label from public.classroom_assignment_resources')
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

	test('un-publishing an already-visible assignment closes the read, and its resources with it', async () => {
		await rpc(
			teacherA.id,
			'public.classroom_update_assignment($1::uuid, $2, $3, $4, $5::timestamptz, $6, $7)',
			[asgAPub, 'Bridge sketch', 'Sketch the truss bridge.', 20, '2026-09-01T07:00:00Z', 'Unit Labs', false]
		);

		const hidden = await db.asUser(studentA.id, (q) =>
			q('select id from public.classroom_assignments where id = $1', [asgAPub])
		);
		expect(hidden.rows).toHaveLength(0);
		const hiddenRes = await db.asUser(studentA.id, (q) =>
			q('select id from public.classroom_assignment_resources where assignment_id = $1', [asgAPub])
		);
		expect(hiddenRes.rows).toHaveLength(0);

		await rpc(
			teacherA.id,
			'public.classroom_update_assignment($1::uuid, $2, $3, $4, $5::timestamptz, $6, $7)',
			[asgAPub, 'Bridge sketch', 'Sketch the truss bridge.', 20, '2026-09-01T07:00:00Z', 'Unit Labs', true]
		);
		const restored = await db.asUser(studentA.id, (q) =>
			q('select id from public.classroom_assignments where id = $1', [asgAPub])
		);
		expect(restored.rows).toHaveLength(1);
	});
});

describe('no direct writes for anyone', () => {
	test('a student cannot INSERT/UPDATE/DELETE any classroom table', async () => {
		const attempts: [string, unknown[]][] = [
			[
				`insert into public.classroom_posts (section_id, body, author_email) values ($1, 'hack', 'x@y')`,
				[sectionA]
			],
			[`update public.classroom_posts set published = true where id = $1`, [postADraft]],
			[`delete from public.classroom_posts where id = $1`, [postAPub]],
			[
				`insert into public.classroom_assignments (section_id, title, author_email) values ($1, 'hack', 'x@y')`,
				[sectionA]
			],
			[`update public.classroom_assignments set points = 0 where id = $1`, [asgAPub]],
			[`delete from public.classroom_assignments where id = $1`, [asgAPub]],
			[
				`insert into public.classroom_enrollments (section_id, student_email, display_name) values ($1, 'x@boscotech.net', 'X')`,
				[sectionA]
			],
			[`update public.classroom_enrollments set active = false where student_email = $1`, [studentA.email]],
			[`delete from public.classroom_enrollments where student_email = $1`, [studentA.email]],
			[
				`insert into public.classroom_assignment_resources (assignment_id, label, url) values ($1, 'x', 'https://x.example')`,
				[asgAPub]
			],
			[`insert into public.classroom_sections (course_id, label, teacher_email) values ($1, 'X', 'alice@boscotech.net')`, [courseId]],
			[`update public.classroom_sections set teacher_email = $1 where id = $2`, [studentA.email, sectionA]],
			[`insert into public.classroom_courses (code, title) values ('HACK101', 'Hack')`, []],
			[`update public.classroom_courses set title = 'Hacked' where id = $1`, [courseId]],
			[`delete from public.classroom_courses where id = $1`, [courseId]]
		];
		for (const [text, params] of attempts) {
			const err = await captureError(() => db.asUser(studentA.id, (q) => q(text, params)));
			expect(err.code).toBe('42501');
		}
	});

	test('even the section teacher has no direct write path -- RPCs are the only door', async () => {
		const attempts: [string, unknown[]][] = [
			[
				`insert into public.classroom_posts (section_id, body, author_email) values ($1, 'direct', $2)`,
				[sectionA, teacherA.email]
			],
			[`update public.classroom_posts set body = 'edited directly' where id = $1`, [postAPub]],
			[`delete from public.classroom_assignments where id = $1`, [asgADraft]],
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
		const post = await captureError(() => createPost(studentA.id, [sectionA], 'student post'));
		expect(post.message).toMatch(/teacher of record/i);

		const asg = await captureError(() => createAssignment(studentA.id, [sectionA], 'student asg'));
		expect(asg.message).toMatch(/teacher of record/i);

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
	test('a teacher cannot publish into a section that is not theirs', async () => {
		const err = await captureError(() => createPost(teacherB.id, [sectionA], 'wrong section'));
		expect(err.message).toMatch(/teacher of record/i);
	});

	test('a multi-section publish naming one foreign section is refused entirely -- nothing partial lands', async () => {
		const before = await db.sql<{ n: string }>(
			'select count(*) as n from public.classroom_posts where section_id = $1',
			[sectionB]
		);
		const err = await captureError(() =>
			createPost(teacherB.id, [sectionB, sectionA], 'own section plus foreign')
		);
		expect(err.message).toMatch(/teacher of record/i);
		const after = await db.sql<{ n: string }>(
			'select count(*) as n from public.classroom_posts where section_id = $1',
			[sectionB]
		);
		expect(after.rows[0].n).toBe(before.rows[0].n);
	});

	test('a teacher cannot edit or delete another teacher post/assignment', async () => {
		const upd = await captureError(() =>
			rpc(teacherB.id, 'public.classroom_update_post($1::uuid, $2)', [postAPub, 'hijacked'])
		);
		expect(upd.message).toMatch(/teacher of record|site admin/i);

		const del = await captureError(() =>
			rpc(teacherB.id, 'public.classroom_delete_post($1::uuid)', [postAPub])
		);
		expect(del.message).toMatch(/teacher of record|site admin/i);

		const updA = await captureError(() =>
			rpc(teacherB.id, 'public.classroom_update_assignment($1::uuid, $2)', [asgAPub, 'hijacked'])
		);
		expect(updA.message).toMatch(/teacher of record|site admin/i);

		const delA = await captureError(() =>
			rpc(teacherB.id, 'public.classroom_delete_assignment($1::uuid)', [asgAPub])
		);
		expect(delA.message).toMatch(/teacher of record|site admin/i);
	});

	test('a teacher reads neither the content nor the roster of a foreign section', async () => {
		const posts = await db.asUser(teacherB.id, (q) =>
			q('select id from public.classroom_posts where section_id = $1', [sectionA])
		);
		expect(posts.rows).toHaveLength(0);

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
	test('the pinned owner reads all sections content and rosters', async () => {
		const posts = await db.asUser(owner.id, (q) =>
			q<{ section_id: string }>('select distinct section_id from public.classroom_posts')
		);
		expect(posts.rows.map((r) => r.section_id).sort()).toEqual([sectionA, sectionB].sort());

		const roster = await db.asUser(owner.id, (q) =>
			q<{ student_email: string }>('select student_email from public.classroom_enrollments')
		);
		expect(roster.rows.map((r) => r.student_email).sort()).toEqual(
			[studentA.email, studentB.email].sort()
		);
	});

	test('the owner can publish into any section (is_admin inside classroom_manages_section)', async () => {
		const created = await createPost(owner.id, [sectionA, sectionB], 'All-hands announcement');
		expect(created.post_ids).toHaveLength(2);
		// Clean up so the per-section counts in other tests stay meaningful.
		for (const id of created.post_ids) {
			await rpc(owner.id, 'public.classroom_delete_post($1::uuid)', [id]);
		}
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
		const result = await importRoster(teacherA.id, [
			{
				email: 'dora@boscotech.net',
				name: 'Dora Diaz',
				course_code: 'IDEA100',
				section_label: 'Period 2' // teacherB's
			},
			{
				email: 'emil@boscotech.net',
				name: 'Emil Estrada',
				course_code: 'IDEA100',
				section_label: 'Period 1'
			}
		]);
		expect(result.succeeded).toBe(1);
		expect(result.refused).toBe(1);
		expect(result.results[0]).toMatchObject({ ok: false, reason: 'not_your_section' });
		expect(result.results[1]).toMatchObject({ ok: true, email: 'emil@boscotech.net' });

		const leaked = await db.sql(
			'select 1 from public.classroom_enrollments where section_id = $1 and student_email = $2',
			[sectionB, 'dora@boscotech.net']
		);
		expect(leaked.rows).toHaveLength(0);
	});

	test('bad rows are refused with named reasons, good rows still land', async () => {
		const result = await importRoster(teacherA.id, [
			{ email: 'not-an-email', name: 'X', course_code: 'IDEA100', section_label: 'Period 1' },
			{ email: 'f@boscotech.net', name: 'F', course_code: 'NOPE999', section_label: 'Period 1' },
			{ email: 'g@boscotech.net', name: 'G', course_code: 'IDEA100', section_label: 'Period 99' },
			{ email: 'h@boscotech.net', name: 'H', course_code: 'IDEA100', section_label: 'Period 1' }
		]);
		expect(result.refused).toBe(3);
		expect(result.succeeded).toBe(1);
		expect(result.results.map((r) => r.reason ?? 'ok')).toEqual([
			'bad_email',
			'course_not_found',
			'section_not_found',
			'ok'
		]);
	});
});

// ---------------------------------------------------------------------------
// 0083: attachments, section lifecycle, enrollment corrections, view-as.
// ---------------------------------------------------------------------------

describe('attachments (0083)', () => {
	let pubPost: string;
	let draftPost: string;
	let foreignPost: string;
	let pubAttachment: string;
	let draftAttachment: string;
	let foreignAttachment: string;

	beforeAll(async () => {
		pubPost = (await createPost(teacherA.id, [sectionA], 'Bring goggles.', 'Lab day')).post_ids[0];
		draftPost = (await createPost(teacherA.id, [sectionA], 'Not ready.', 'Draft', false)).post_ids[0];
		foreignPost = (await createPost(teacherB.id, [sectionB], 'P2 only.', 'Notice')).post_ids[0];

		const add = (userId: string, ownerId: string, file: string) =>
			rpc<{ attachments: { id: string }[] }>(
				userId,
				'public.classroom_add_attachment($1, $2::uuid[], $3, $4, $5)',
				['post', [ownerId], file, 'handout.pdf', 'application/pdf']
			);
		pubAttachment = (await add(teacherA.id, pubPost, 'drive-pub')).attachments[0].id;
		draftAttachment = (await add(teacherA.id, draftPost, 'drive-draft')).attachments[0].id;
		foreignAttachment = (await add(teacherB.id, foreignPost, 'drive-foreign')).attachments[0].id;
	});

	test('an attachment is visible exactly where its PARENT is', async () => {
		// The enrolled student sees the published post's file...
		const mine = await db.asUser(studentA.id, (q) =>
			q<{ id: string }>('select id from public.classroom_attachments where id = $1', [
				pubAttachment
			])
		);
		expect(mine.rows).toHaveLength(1);

		// ...and neither the DRAFT's nor another section's, by list or by id.
		for (const id of [draftAttachment, foreignAttachment]) {
			const hidden = await db.asUser(studentA.id, (q) =>
				q('select id from public.classroom_attachments where id = $1', [id])
			);
			expect(hidden.rows, id).toHaveLength(0);
		}
		const all = await db.asUser(studentA.id, (q) =>
			q<{ id: string }>('select id from public.classroom_attachments')
		);
		expect(all.rows.map((r) => r.id)).toEqual([pubAttachment]);
	});

	test('un-publishing the parent closes its attachments in the same statement', async () => {
		await rpc(teacherA.id, 'public.classroom_update_post($1::uuid, $2, $3, $4)', [
			pubPost,
			'Bring goggles.',
			'Lab day',
			false
		]);
		const hidden = await db.asUser(studentA.id, (q) =>
			q('select id from public.classroom_attachments where id = $1', [pubAttachment])
		);
		expect(hidden.rows).toHaveLength(0);

		await rpc(teacherA.id, 'public.classroom_update_post($1::uuid, $2, $3, $4)', [
			pubPost,
			'Bring goggles.',
			'Lab day',
			true
		]);
		const back = await db.asUser(studentA.id, (q) =>
			q('select id from public.classroom_attachments where id = $1', [pubAttachment])
		);
		expect(back.rows).toHaveLength(1);
	});

	test('nobody has a direct write path to classroom_attachments', async () => {
		const attempts: [string, unknown[]][] = [
			[
				`insert into public.classroom_attachments (post_id, drive_file_id, filename, mime_type, uploaded_by)
				 values ($1, 'x', 'x', 'image/png', 'x@y')`,
				[pubPost]
			],
			[`update public.classroom_attachments set filename = 'hacked' where id = $1`, [pubAttachment]],
			[`delete from public.classroom_attachments where id = $1`, [pubAttachment]]
		];
		for (const user of [studentA, teacherA, owner]) {
			for (const [text, params] of attempts) {
				const err = await captureError(() => db.asUser(user.id, (q) => q(text, params)));
				expect(err.code, `${user.email} ${text}`).toBe('42501');
			}
		}
	});

	test('a student cannot attach, and a teacher cannot attach to a foreign section', async () => {
		const byStudent = await captureError(() =>
			rpc(studentA.id, 'public.classroom_add_attachment($1, $2::uuid[], $3, $4, $5)', [
				'post',
				[pubPost],
				'drive-hack',
				'hack.pdf',
				'application/pdf'
			])
		);
		expect(byStudent.message).toMatch(/teacher of record|site admin/i);

		const byForeign = await captureError(() =>
			rpc(teacherB.id, 'public.classroom_add_attachment($1, $2::uuid[], $3, $4, $5)', [
				'post',
				[pubPost],
				'drive-hack',
				'hack.pdf',
				'application/pdf'
			])
		);
		expect(byForeign.message).toMatch(/teacher of record|site admin/i);
	});

	test('a multi-target attach naming one foreign owner lands NOTHING', async () => {
		const before = await db.sql<{ n: string }>(
			'select count(*) as n from public.classroom_attachments'
		);
		const err = await captureError(() =>
			rpc(teacherA.id, 'public.classroom_add_attachment($1, $2::uuid[], $3, $4, $5)', [
				'post',
				[pubPost, foreignPost],
				'drive-partial',
				'partial.pdf',
				'application/pdf'
			])
		);
		expect(err.message).toMatch(/teacher of record|site admin/i);
		const after = await db.sql<{ n: string }>(
			'select count(*) as n from public.classroom_attachments'
		);
		expect(after.rows[0].n).toBe(before.rows[0].n);
	});

	test('only a manager can delete an attachment, and the orphan report is honest', async () => {
		for (const user of [studentA, teacherB]) {
			const err = await captureError(() =>
				rpc(user.id, 'public.classroom_delete_attachment($1::uuid)', [pubAttachment])
			);
			expect(err.message, user.email).toMatch(/teacher of record|site admin/i);
		}

		// Two rows, ONE Drive file (the multi-section publish shape).
		const shared = await rpc<{ attachments: { id: string }[] }>(
			teacherA.id,
			'public.classroom_add_attachment($1, $2::uuid[], $3, $4, $5)',
			['post', [pubPost, draftPost], 'drive-shared', 'shared.pdf', 'application/pdf']
		);
		const first = await rpc<{ orphaned: boolean }>(
			teacherA.id,
			'public.classroom_delete_attachment($1::uuid)',
			[shared.attachments[0].id]
		);
		expect(first.orphaned).toBe(false);
		const second = await rpc<{ orphaned: boolean }>(
			teacherA.id,
			'public.classroom_delete_attachment($1::uuid)',
			[shared.attachments[1].id]
		);
		expect(second.orphaned).toBe(true);
	});

	test('deleting a post reports the Drive files it just orphaned', async () => {
		const post = (await createPost(teacherA.id, [sectionA], 'temp')).post_ids[0];
		await rpc(teacherA.id, 'public.classroom_add_attachment($1, $2::uuid[], $3, $4, $5)', [
			'post',
			[post],
			'drive-sweep-me',
			'sweep.pdf',
			'application/pdf'
		]);
		const res = await rpc<{ orphaned_drive_file_ids: string[] }>(
			teacherA.id,
			'public.classroom_delete_post($1::uuid)',
			[post]
		);
		expect(res.orphaned_drive_file_ids).toEqual(['drive-sweep-me']);
	});
});

describe('section lifecycle (0083)', () => {
	test('a section holding anything is REFUSED, with the counts, and survives', async () => {
		const res = await rpc<{
			ok: boolean;
			reason: string;
			posts: number;
			assignments: number;
			enrollments: number;
		}>(teacherA.id, 'public.classroom_delete_section($1::uuid, $2)', [sectionA, 'Period 1']);

		expect(res.ok).toBe(false);
		expect(res.reason).toBe('not_empty');
		expect(res.posts + res.assignments + res.enrollments).toBeGreaterThan(0);

		const still = await db.sql('select 1 from public.classroom_sections where id = $1', [sectionA]);
		expect(still.rows).toHaveLength(1);
	});

	test('an EMPTY section deletes -- but only with its label typed back', async () => {
		const empty = (
			await rpc<{ section_id: string }>(
				teacherA.id,
				'public.classroom_upsert_section($1::uuid, $2)',
				[courseId, 'Period 7 (mistyped)']
			)
		).section_id;

		const wrong = await captureError(() =>
			rpc(teacherA.id, 'public.classroom_delete_section($1::uuid, $2)', [empty, 'Period 7'])
		);
		expect(wrong.message).toMatch(/type the section label/i);
		const survived = await db.sql('select 1 from public.classroom_sections where id = $1', [empty]);
		expect(survived.rows).toHaveLength(1);

		// Case and surrounding whitespace are forgiven; the words are not.
		const ok = await rpc<{ ok: boolean }>(
			teacherA.id,
			'public.classroom_delete_section($1::uuid, $2)',
			[empty, '  period 7 (MISTYPED) ']
		);
		expect(ok.ok).toBe(true);
		const gone = await db.sql('select 1 from public.classroom_sections where id = $1', [empty]);
		expect(gone.rows).toHaveLength(0);
	});

	test('a student and a foreign teacher can neither archive nor delete a section', async () => {
		for (const user of [studentA, teacherB]) {
			const archive = await captureError(() =>
				rpc(user.id, 'public.classroom_set_section_active($1::uuid, $2)', [sectionA, false])
			);
			expect(archive.message, user.email).toMatch(/teacher of record|site admin/i);

			const del = await captureError(() =>
				rpc(user.id, 'public.classroom_delete_section($1::uuid, $2)', [sectionA, 'Period 1'])
			);
			expect(del.message, user.email).toMatch(/teacher of record|site admin/i);
		}
	});

	test('archiving is soft: the roster and content are untouched', async () => {
		const before = await db.sql<{ n: string }>(
			'select count(*) as n from public.classroom_posts where section_id = $1',
			[sectionA]
		);
		await rpc(teacherA.id, 'public.classroom_set_section_active($1::uuid, $2)', [sectionA, false]);
		const flag = await db.sql<{ active: boolean }>(
			'select active from public.classroom_sections where id = $1',
			[sectionA]
		);
		expect(flag.rows[0].active).toBe(false);
		const after = await db.sql<{ n: string }>(
			'select count(*) as n from public.classroom_posts where section_id = $1',
			[sectionA]
		);
		expect(after.rows[0].n).toBe(before.rows[0].n);

		await rpc(teacherA.id, 'public.classroom_set_section_active($1::uuid, $2)', [sectionA, true]);
	});

	test('a teacher may hand their own section over, but still cannot take a foreign one', async () => {
		const spare = (
			await rpc<{ section_id: string }>(
				teacherA.id,
				'public.classroom_upsert_section($1::uuid, $2)',
				[courseId, 'Period 8']
			)
		).section_id;

		// Giving away access you already hold is not an escalation...
		const handed = await rpc<{ teacher_email: string }>(
			teacherA.id,
			'public.classroom_upsert_section($1::uuid, $2, $3, $4, $5::uuid)',
			[courseId, 'Period 8', null, teacherB.email, spare]
		);
		expect(handed.teacher_email).toBe(teacherB.email);

		// ...and the giver loses it immediately, which is the proof it was real.
		const backAgain = await captureError(() =>
			rpc(teacherA.id, 'public.classroom_upsert_section($1::uuid, $2, $3, $4, $5::uuid)', [
				courseId,
				'Period 8',
				null,
				teacherA.email,
				spare
			])
		);
		expect(backAgain.message).toMatch(/teacher of record|site admin/i);

		// A section can never land on a student or an outside address.
		const toStudent = await captureError(() =>
			rpc(teacherB.id, 'public.classroom_upsert_section($1::uuid, $2, $3, $4, $5::uuid)', [
				courseId,
				'Period 8',
				null,
				studentA.email,
				spare
			])
		);
		expect(toStudent.message).toMatch(/@boscotech\.edu/i);

		await rpc(teacherB.id, 'public.classroom_delete_section($1::uuid, $2)', [spare, 'Period 8']);
	});
});

describe('enrollment corrections (0083)', () => {
	test('a typo is fixed IN PLACE, lowercased, with nothing left behind', async () => {
		await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3)', [
			sectionA,
			'typo@boscotech.net',
			'Ty Po'
		]);

		const res = await rpc<{ ok: boolean; student_email: string }>(
			teacherA.id,
			'public.classroom_update_enrollment($1::uuid, $2, $3, $4)',
			[sectionA, 'typo@boscotech.net', '  Fixed@BoscoTech.net ', 'Fixed Name']
		);
		expect(res).toMatchObject({ ok: true, student_email: 'fixed@boscotech.net' });

		const old = await db.sql('select 1 from public.classroom_enrollments where student_email = $1', [
			'typo@boscotech.net'
		]);
		expect(old.rows).toHaveLength(0);

		const fixed = await db.sql<{ display_name: string }>(
			'select display_name from public.classroom_enrollments where section_id = $1 and student_email = $2',
			[sectionA, 'fixed@boscotech.net']
		);
		expect(fixed.rows[0].display_name).toBe('Fixed Name');
	});

	test('correcting onto an email already on the roster is refused, not merged', async () => {
		const res = await rpc<{ ok: boolean; reason: string }>(
			teacherA.id,
			'public.classroom_update_enrollment($1::uuid, $2, $3, $4)',
			[sectionA, 'fixed@boscotech.net', studentA.email, null]
		);
		expect(res).toMatchObject({ ok: false, reason: 'already_enrolled' });

		const both = await db.sql<{ n: string }>(
			'select count(*) as n from public.classroom_enrollments where section_id = $1 and student_email in ($2, $3)',
			[sectionA, 'fixed@boscotech.net', studentA.email]
		);
		expect(both.rows[0].n).toBe('2');
	});

	test('a student and a foreign teacher cannot correct a roster row', async () => {
		for (const user of [studentA, teacherB]) {
			const err = await captureError(() =>
				rpc(user.id, 'public.classroom_update_enrollment($1::uuid, $2, $3, $4)', [
					sectionA,
					studentA.email,
					'hijack@boscotech.net',
					null
				])
			);
			expect(err.message, user.email).toMatch(/teacher of record|site admin/i);
		}
	});
});

describe('view as student (0083) -- admin only, read only', () => {
	test('every view_as RPC refuses a student AND a plain teacher', async () => {
		const calls: [string, unknown[]][] = [
			['public.classroom_view_as_students()', []],
			['public.classroom_view_as_sections($1)', [studentA.email]],
			['public.classroom_view_as_section($1, $2::uuid)', [studentA.email, sectionA]],
			[
				'public.classroom_view_as_assignment($1, $2::uuid, $3::uuid)',
				[studentA.email, sectionA, asgAPub]
			],
			[
				'public.classroom_view_as_can_read_attachment($1, $2::uuid)',
				[studentA.email, '00000000-0000-0000-0000-000000000000']
			]
		];
		for (const user of [studentA, teacherA, teacherB]) {
			for (const [call, params] of calls) {
				const err = await captureError(() => rpc(user.id, call, params));
				expect(err.message, `${user.email} ${call}`).toMatch(/only a site admin/i);
			}
		}
	});

	test('the admin sees the STUDENT\'s classes, not their own reach', async () => {
		const sections = await rpc<{ id: string }[]>(owner.id, 'public.classroom_view_as_sections($1)', [
			studentA.email
		]);
		expect(sections.map((s) => s.id)).toEqual([sectionA]);

		// The owner can read sectionB directly; as this student they must not.
		const foreign = await rpc(owner.id, 'public.classroom_view_as_section($1, $2::uuid)', [
			studentA.email,
			sectionB
		]);
		expect(foreign).toBeNull();
	});

	test('drafts are absent from the impersonated view even though the admin can read them', async () => {
		const direct = await db.asUser(owner.id, (q) =>
			q('select id from public.classroom_posts where id = $1', [postADraft])
		);
		expect(direct.rows).toHaveLength(1); // the admin genuinely can

		const view = await rpc<{ posts: { id: string }[]; assignments: { id: string }[] }>(
			owner.id,
			'public.classroom_view_as_section($1, $2::uuid)',
			[studentA.email, sectionA]
		);
		expect(view.posts.map((p) => p.id)).not.toContain(postADraft);
		expect(view.assignments.map((a) => a.id)).not.toContain(asgADraft);
		expect(view.assignments.map((a) => a.id)).toContain(asgAPub);

		// The draft assignment is 404-shaped through the assignment view too.
		const draft = await rpc(
			owner.id,
			'public.classroom_view_as_assignment($1, $2::uuid, $3::uuid)',
			[studentA.email, sectionA, asgADraft]
		);
		expect(draft).toBeNull();
	});

	test('a DEACTIVATED enrollment drops the class out of the impersonated view', async () => {
		await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			sectionA,
			studentA.email,
			null,
			false
		]);
		const none = await rpc<{ id: string }[]>(owner.id, 'public.classroom_view_as_sections($1)', [
			studentA.email
		]);
		expect(none).toHaveLength(0);

		await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
			sectionA,
			studentA.email,
			null,
			true
		]);
		const back = await rpc<{ id: string }[]>(owner.id, 'public.classroom_view_as_sections($1)', [
			studentA.email
		]);
		expect(back).toHaveLength(1);
	});

	test('there is NO view_as write function at all -- read-only is structural', async () => {
		const { rows } = await db.sql<{ proname: string }>(
			`select proname from pg_proc
			  where proname like 'classroom_view_as%'
			  order by proname`
		);
		expect(rows.map((r) => r.proname).sort()).toEqual([
			'classroom_view_as_assignment',
			'classroom_view_as_can_read_attachment',
			'classroom_view_as_section',
			'classroom_view_as_sections',
			'classroom_view_as_students'
		]);
		// Every one of them is declared STABLE, so none can write even by mistake.
		const { rows: volatility } = await db.sql<{ proname: string; provolatile: string }>(
			`select proname, provolatile from pg_proc where proname like 'classroom_view_as%'`
		);
		for (const r of volatility) {
			expect(r.provolatile, r.proname).toBe('s');
		}
	});
});

describe('anon boundary', () => {
	test('anon has no EXECUTE on any classroom write RPC and no SELECT on any classroom table', async () => {
		const fns = [
			'public.classroom_upsert_course(text, text, boolean, uuid)',
			'public.classroom_upsert_section(uuid, text, text, text, uuid)',
			'public.classroom_set_enrollment(uuid, text, text, boolean)',
			'public.classroom_import_roster(jsonb)',
			'public.classroom_create_post(uuid[], text, text, boolean)',
			'public.classroom_update_post(uuid, text, text, boolean)',
			'public.classroom_delete_post(uuid)',
			'public.classroom_create_assignment(uuid[], text, text, integer, timestamptz, text, boolean, jsonb)',
			'public.classroom_update_assignment(uuid, text, text, integer, timestamptz, text, boolean, jsonb)',
			'public.classroom_delete_assignment(uuid)',
			// 0083
			'public.classroom_set_section_active(uuid, boolean)',
			'public.classroom_delete_section(uuid, text)',
			'public.classroom_update_enrollment(uuid, text, text, text)',
			'public.classroom_add_attachment(text, uuid[], text, text, text, bigint)',
			'public.classroom_delete_attachment(uuid)',
			'public.classroom_view_as_students()',
			'public.classroom_view_as_sections(text)',
			'public.classroom_view_as_section(text, uuid)',
			'public.classroom_view_as_assignment(text, uuid, uuid)',
			'public.classroom_view_as_can_read_attachment(text, uuid)'
		];
		for (const fn of fns) {
			const { rows } = await db.sql<{ ok: boolean }>(
				`select has_function_privilege('anon', $1, 'execute') as ok`,
				[fn]
			);
			expect(rows[0].ok, fn).toBe(false);
		}

		const tables = [
			'classroom_courses',
			'classroom_sections',
			'classroom_enrollments',
			'classroom_posts',
			'classroom_assignments',
			'classroom_assignment_resources',
			'classroom_attachments'
		];
		for (const t of tables) {
			const { rows } = await db.sql<{ sel: boolean; ins: boolean; upd: boolean; del: boolean }>(
				`select has_table_privilege('anon', $1, 'select') as sel,
					has_table_privilege('authenticated', $1, 'insert') as ins,
					has_table_privilege('authenticated', $1, 'update') as upd,
					has_table_privilege('authenticated', $1, 'delete') as del`,
				[`public.${t}`]
			);
			expect(rows[0], t).toEqual({ sel: false, ins: false, upd: false, del: false });
		}
	});
});
