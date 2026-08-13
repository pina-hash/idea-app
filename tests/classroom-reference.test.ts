// tests/classroom-reference.test.ts
//
// The PUBLIC read path for reference documents (0092), against a real Postgres
// with the real migrations applied (see tests/db/harness.ts).
//
// WHY THIS FILE EXISTS AT ALL, given this repo tests sparingly. The printed
// IDEA209H syllabus carries a QR code that a PARENT scans, so a material can be
// made readable with no session -- and every failure mode of that is SILENT.
// A too-permissive policy leaks a roster to the open internet and nothing on
// screen looks wrong; a too-permissive function hands out a student's email and
// the page renders exactly as it did before. So the assertions here are almost
// all NEGATIVE, and they are attempted rather than reasoned about: anon calls
// the real functions and reads the real tables, and the test fails if anything
// comes back.
//
//   1. Public reads: a published public material's document loads for `anon`,
//      and NOTHING else does -- not a private material's, not an unpublished
//      one's, not an assignment's spec, not an item with no document, not an
//      unknown id. All five give the SAME answer (null), because a
//      distinguishable refusal confirms a real id to a stranger.
//   2. The payload's own shape: no email, no roster, no section, no author, no
//      body, no postings -- asserted over the SERIALIZED result, so a field
//      added carelessly later fails this rather than shipping.
//   3. Anon's grants: EXECUTE on exactly the two public functions and nothing
//      else, and SELECT on none of the classroom tables.
//   4. Attachments: the public attachment function answers only for an
//      attachment on that specific public material.
//   5. Writes: no client INSERT/UPDATE/DELETE on the new table for a student,
//      a teacher or an admin; students refused by both write RPCs; the public
//      flag settable only by the teacher of record or an admin; and a public
//      ASSIGNMENT unrepresentable rather than merely refused.
//   6. Schema v2 compatibility: a v1 assignment spec (no `kind`) still passes
//      _classroom_check_spec unchanged, and a reference document pasted into
//      the assignment RPC is refused by name.

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
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0090_classroom_instructor_materials.sql',
	'0092_classroom_reference_specs.sql',
	'0095_classroom_leveled_rubrics.sql'
] as const;

let db: TestDb;

let owner: SeededUser; // pinned admin
let teacherA: SeededUser;
let teacherB: SeededUser;
let studentA: SeededUser;

let sectionA: string;
let sectionB: string;

let publicMaterial: string; // published, public, has a document
let privateMaterial: string; // published, NOT public, has a document
let draftPublicMaterial: string; // public flag set but unpublished
let noDocMaterial: string; // public, published, no document
let otherSectionMaterial: string; // teacherB's, public, has a document
let assignmentId: string; // carries an ASSIGNMENT spec

let publicAttachment: string;
let privateAttachment: string;
let instructorAttachment: string;

const REFERENCE_SPEC = {
	schemaVersion: 2,
	kind: 'reference',
	meta: { referenceId: 'ref-1', title: 'Course Reference' },
	navigation: 'tabs',
	sections: [
		{
			slug: 'overview',
			title: 'Overview',
			blocks: [{ type: 'instructions', content: 'Read this.' }]
		},
		{
			slug: 'ai-policy',
			title: 'AI policy',
			blocks: [
				{
					type: 'calc',
					tool: 'aiLevelLookup',
					config: {
						entries: [
							{ workType: 'Notebook', level: 0, permitted: 'Nothing.', notPermitted: 'Any AI.' }
						]
					}
				}
			]
		}
	]
};

const ASSIGNMENT_SPEC_V1 = {
	schemaVersion: 1,
	meta: { assignmentId: 'a-1', title: 'Bracket', totalPoints: 10 },
	modules: [
		{
			id: 'm1',
			title: 'Model it',
			points: 10,
			blocks: [{ type: 'textField', id: 'why', prompt: 'Why that shape?', minSentences: 2 }],
			rubric: [
				{
					id: 'c1',
					criterion: 'Reasoning',
					levels: [
						{ points: 10, label: 'Complete', descriptor: 'Names the load path and the shape that carries it.' },
						{ points: 5, label: 'Developing', descriptor: 'Names one of the two.' },
						{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
					]
				}
			]
		}
	]
};

/** Fails loudly if the statement SUCCEEDS; otherwise hands back the error. */
async function captureError(fn: () => Promise<unknown>): Promise<Error> {
	try {
		await fn();
	} catch (e) {
		return e as Error;
	}
	throw new Error('Expected the statement to be refused, but it succeeded.');
}

async function rpc<T = Record<string, unknown>>(
	userId: string,
	call: string,
	params: unknown[] = []
): Promise<T> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

/** One anon call returning the function's jsonb result (or null). */
async function anonJson<T>(call: string, params: unknown[] = []): Promise<T | null> {
	return db.asAnon(async (q) => {
		const { rows } = await q<{ result: T | null }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

beforeAll(async () => {
	db = await startTestDb([...MIGRATIONS]);

	owner = await createUser(db, 'apina@boscotech.edu', 'Site Owner');
	teacherA = await createUser(db, 'teacher.a@boscotech.edu', 'T. A');
	teacherB = await createUser(db, 'teacher.b@boscotech.edu', 'T. B');
	studentA = await createUser(db, 'student.a@boscotech.net', 'Student A');

	const course = await rpc<{ course_id: string }>(
		teacherA.id,
		'public.classroom_upsert_course($1, $2)',
		['idea000', 'Sample Course']
	);
	sectionA = (
		await rpc<{ section_id: string }>(
			teacherA.id,
			'public.classroom_upsert_section($1::uuid, $2)',
			[course.course_id, 'Period 1']
		)
	).section_id;
	sectionB = (
		await rpc<{ section_id: string }>(
			teacherB.id,
			'public.classroom_upsert_section($1::uuid, $2)',
			[course.course_id, 'Period 2']
		)
	).section_id;

	await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3)', [
		sectionA,
		studentA.email,
		'Student A'
	]);

	const createItem = async (
		user: SeededUser,
		section: string,
		kind: string,
		title: string,
		published = true
	) => {
		const res = await rpc<{ item_id: string }>(
			user.id,
			'public.classroom_create_item($1, $2::uuid[], $3, $4, $5, $6::timestamptz, $7, $8, $9::jsonb, $10)',
			[kind, [section], title, '', null, null, null, published, JSON.stringify([]), false]
		);
		return res.item_id;
	};

	publicMaterial = await createItem(teacherA, sectionA, 'material', 'Syllabus');
	privateMaterial = await createItem(teacherA, sectionA, 'material', 'Private notes');
	draftPublicMaterial = await createItem(teacherA, sectionA, 'material', 'Draft', false);
	noDocMaterial = await createItem(teacherA, sectionA, 'material', 'No document');
	otherSectionMaterial = await createItem(teacherB, sectionB, 'material', 'Their syllabus');
	assignmentId = await createItem(teacherA, sectionA, 'assignment', 'Bracket');

	// Documents.
	for (const id of [publicMaterial, privateMaterial, draftPublicMaterial, otherSectionMaterial]) {
		const user = id === otherSectionMaterial ? teacherB : teacherA;
		await db.asUser(user.id, (q) =>
			q(`select public.classroom_set_reference_spec($1::uuid, $2::jsonb)`, [
				id,
				JSON.stringify(REFERENCE_SPEC)
			])
		);
	}
	await db.asUser(teacherA.id, (q) =>
		q(`select public.classroom_set_assignment_spec($1::uuid, $2::jsonb)`, [
			assignmentId,
			JSON.stringify(ASSIGNMENT_SPEC_V1)
		])
	);

	// Public flags.
	for (const id of [publicMaterial, draftPublicMaterial, noDocMaterial]) {
		await db.asUser(teacherA.id, (q) =>
			q(`select public.classroom_set_item_public($1::uuid, true)`, [id])
		);
	}
	await db.asUser(teacherB.id, (q) =>
		q(`select public.classroom_set_item_public($1::uuid, true)`, [otherSectionMaterial])
	);

	// Attachments (the routes upload the bytes; the rows are what matters here).
	const addAttachment = async (user: SeededUser, itemId: string, driveId: string) =>
		(
			await rpc<{ attachment_id: string }>(
				user.id,
				'public.classroom_add_attachment($1::uuid, $2, $3, $4, $5::bigint)',
				[itemId, driveId, 'handout.pdf', 'application/pdf', 1024]
			)
		).attachment_id;
	publicAttachment = await addAttachment(teacherA, publicMaterial, 'drive-public');
	privateAttachment = await addAttachment(teacherA, privateMaterial, 'drive-private');
	instructorAttachment = (
		await rpc<{ attachment_id: string }>(
			teacherA.id,
			'public.classroom_add_instructor_attachment($1::uuid, $2, $3, $4, $5::bigint)',
			[publicMaterial, 'drive-key', 'answers.pdf', 'application/pdf', 512]
		)
	).attachment_id;
}, 120_000);

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 1 + 2. What anon can read, and the exact shape of it.
// ---------------------------------------------------------------------------

describe('the public reference read', () => {
	test('a published public material with a document loads for anon', async () => {
		const payload = await db.asAnon(async (q) => {
			const { rows } = await q<{ r: Record<string, unknown> | null }>(
				`select public.classroom_public_reference($1::uuid) as r`,
				[publicMaterial]
			);
			return rows[0].r;
		});
		expect(payload).not.toBeNull();
		expect(payload!.title).toBe('Syllabus');
		expect((payload!.spec as Record<string, unknown>).kind).toBe('reference');
	});

	test.each([
		['a private material', () => privateMaterial],
		['an unpublished public material', () => draftPublicMaterial],
		['a public material with no document', () => noDocMaterial],
		['an assignment (its spec lives in another table entirely)', () => assignmentId]
	])('answers null for %s', async (_label, id) => {
		const payload = await db.asAnon(async (q) => {
			const { rows } = await q<{ r: unknown }>(
				`select public.classroom_public_reference($1::uuid) as r`,
				[id()]
			);
			return rows[0].r;
		});
		expect(payload).toBeNull();
	});

	test('an unknown id answers exactly as a private one does', async () => {
		const [unknown, priv] = await db.asAnon(async (q) => {
			const { rows } = await q<{ a: unknown; b: unknown }>(
				`select public.classroom_public_reference('00000000-0000-0000-0000-000000000000'::uuid) as a,
				        public.classroom_public_reference($1::uuid) as b`,
				[privateMaterial]
			);
			return [rows[0].a, rows[0].b];
		});
		expect(unknown).toBeNull();
		expect(priv).toBeNull();
	});

	test('the payload carries no email, roster, section or author anywhere in it', async () => {
		// Serialized, not spot-checked: a field added carelessly later fails HERE.
		const text = await db.asAnon(async (q) => {
			const { rows } = await q<{ t: string }>(
				`select public.classroom_public_reference($1::uuid)::text as t`,
				[publicMaterial]
			);
			return rows[0].t;
		});
		// No address in any form, anywhere -- the spec included, since a document
		// is authored content and could in principle be made to carry one.
		expect(text).not.toContain('@');
		expect(text.toLowerCase()).not.toContain('boscotech');

		// The roster-shaped words are checked against the payload MINUS the
		// document itself: a reference spec legitimately has its own `sections`,
		// and conflating that with a class section would make this assertion
		// noise instead of a boundary.
		const envelope = await db.asAnon(async (q) => {
			const { rows } = await q<{ t: string }>(
				`select (public.classroom_public_reference($1::uuid) - 'spec')::text as t`,
				[publicMaterial]
			);
			return rows[0].t;
		});
		for (const forbidden of ['student', 'teacher', 'enroll', 'section', 'author', 'roster', 'body']) {
			expect(envelope.toLowerCase()).not.toContain(forbidden);
		}
		// Keeps both assertions honest: it really did return a document.
		expect(text).toContain('ai-policy');
		expect(envelope).toContain('handout.pdf');
	});

	test('the payload exposes exactly five keys', async () => {
		const keys = await db.asAnon(async (q) => {
			const { rows } = await q<{ k: string[] }>(
				`select array(select jsonb_object_keys(public.classroom_public_reference($1::uuid)) order by 1) as k`,
				[publicMaterial]
			);
			return rows[0].k;
		});
		expect(keys).toEqual(['attachments', 'item_id', 'spec', 'title', 'updated_at']);
	});
});

// ---------------------------------------------------------------------------
// 3. Anon's grants: two functions, no tables.
// ---------------------------------------------------------------------------

describe('the anon boundary', () => {
	test('anon may execute exactly the two public classroom functions', async () => {
		const rows = await db.sql<{ name: string }>(
			`select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as name
			 from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public'
				 and p.proname like 'classroom%'
				 and has_function_privilege('anon', p.oid, 'execute')
			 order by 1`
		);
		expect(rows.rows.map((r) => r.name)).toEqual([
			'classroom_public_attachment(p_attachment_id uuid)',
			'classroom_public_reference(p_item_id uuid)'
		]);
	});

	test('anon holds no SELECT on any classroom table', async () => {
		const rows = await db.sql<{ table_name: string }>(
			`select c.relname as table_name
			 from pg_class c
			 join pg_namespace n on n.oid = c.relnamespace
			 where n.nspname = 'public' and c.relkind = 'r'
				 and c.relname like 'classroom%'
				 and has_table_privilege('anon', c.oid, 'select')
			 order by 1`
		);
		expect(rows.rows).toEqual([]);
	});

	test('anon cannot call the reference or public-flag WRITE rpcs', async () => {
		for (const call of [
			`select public.classroom_set_reference_spec('${publicMaterial}'::uuid, '{}'::jsonb)`,
			`select public.classroom_set_item_public('${publicMaterial}'::uuid, false)`
		]) {
			const err = await captureError(() => db.asAnon((q) => q(call)));
			expect(err.message).toMatch(/permission denied/i);
		}
	});
});

// ---------------------------------------------------------------------------
// 4. Attachments.
// ---------------------------------------------------------------------------

describe('public attachments', () => {
	test('anon resolves an attachment on the public material', async () => {
		const row = await db.asAnon(async (q) => {
			const { rows } = await q<{ r: Record<string, unknown> | null }>(
				`select public.classroom_public_attachment($1::uuid) as r`,
				[publicAttachment]
			);
			return rows[0].r;
		});
		expect(row).not.toBeNull();
		expect(row!.filename).toBe('handout.pdf');
	});

	test.each([
		['a private material’s attachment', () => privateAttachment],
		['an instructor-only attachment (a different table)', () => instructorAttachment],
		['an unknown id', () => '00000000-0000-0000-0000-000000000000']
	])('answers null for %s', async (_label, id) => {
		const row = await db.asAnon(async (q) => {
			const { rows } = await q<{ r: unknown }>(
				`select public.classroom_public_attachment($1::uuid) as r`,
				[id()]
			);
			return rows[0].r;
		});
		expect(row).toBeNull();
	});

	test('the attachments listed on the public payload are only that item’s', async () => {
		const ids = await db.asAnon(async (q) => {
			const { rows } = await q<{ ids: string[] }>(
				`select array(
					select jsonb_array_elements(public.classroom_public_reference($1::uuid)->'attachments')->>'id'
				) as ids`,
				[publicMaterial]
			);
			return rows[0].ids;
		});
		expect(ids).toEqual([publicAttachment]);
		// The instructor-only file lives on the SAME item and must not be there.
		expect(ids).not.toContain(instructorAttachment);
	});
});

// ---------------------------------------------------------------------------
// 5. Writes.
// ---------------------------------------------------------------------------

describe('write boundaries', () => {
	test('no direct writes on classroom_reference_specs for student, teacher or admin', async () => {
		for (const user of [studentA, teacherA, owner]) {
			for (const stmt of [
				`insert into public.classroom_reference_specs (item_id, spec, imported_by) values ('${publicMaterial}'::uuid, '{}'::jsonb, 'x')`,
				`update public.classroom_reference_specs set spec = '{}'::jsonb`,
				`delete from public.classroom_reference_specs`
			]) {
				const err = await captureError(() => db.asUser(user.id, (q) => q(stmt)));
				expect(err.message).toMatch(/permission denied/i);
			}
		}
	});

	test('a student cannot attach a document or flip the public flag', async () => {
		const a = await captureError(() =>
			db.asUser(studentA.id, (q) =>
				q(`select public.classroom_set_reference_spec($1::uuid, $2::jsonb)`, [
					publicMaterial,
					JSON.stringify(REFERENCE_SPEC)
				])
			)
		);
		expect(a.message).toMatch(/teacher of record/i);
		const b = await captureError(() =>
			db.asUser(studentA.id, (q) =>
				q(`select public.classroom_set_item_public($1::uuid, true)`, [publicMaterial])
			)
		);
		expect(b.message).toMatch(/teacher of record/i);
	});

	test('another section’s teacher cannot make our material public', async () => {
		const err = await captureError(() =>
			db.asUser(teacherB.id, (q) =>
				q(`select public.classroom_set_item_public($1::uuid, true)`, [privateMaterial])
			)
		);
		expect(err.message).toMatch(/teacher of record/i);
		// And it really did stay private, checked through the public read.
		const payload = await db.asAnon(async (q) => {
			const { rows } = await q<{ r: unknown }>(
				`select public.classroom_public_reference($1::uuid) as r`,
				[privateMaterial]
			);
			return rows[0].r;
		});
		expect(payload).toBeNull();
	});

	test('turning public off closes the public read again', async () => {
		await db.asUser(teacherA.id, (q) =>
			q(`select public.classroom_set_item_public($1::uuid, false)`, [publicMaterial])
		);
		const closed = await db.asAnon(async (q) => {
			const { rows } = await q<{ r: unknown }>(
				`select public.classroom_public_reference($1::uuid) as r`,
				[publicMaterial]
			);
			return rows[0].r;
		});
		expect(closed).toBeNull();
		// ...and its attachment with it.
		const att = await db.asAnon(async (q) => {
			const { rows } = await q<{ r: unknown }>(
				`select public.classroom_public_attachment($1::uuid) as r`,
				[publicAttachment]
			);
			return rows[0].r;
		});
		expect(att).toBeNull();
		await db.asUser(teacherA.id, (q) =>
			q(`select public.classroom_set_item_public($1::uuid, true)`, [publicMaterial])
		);
	});

	test('a public ASSIGNMENT is unrepresentable, not merely refused', async () => {
		// The RPC refuses it...
		const err = await captureError(() =>
			db.asUser(teacherA.id, (q) =>
				q(`select public.classroom_set_item_public($1::uuid, true)`, [assignmentId])
			)
		);
		expect(err.message).toMatch(/only a material/i);
		// ...and so does the CHECK, with RLS out of the way entirely (running as
		// the connection owner), so nothing but the constraint can refuse it.
		const direct = await captureError(() =>
			db.sql(`update public.classroom_items set is_public = true where id = $1`, [assignmentId])
		);
		expect(direct.message).toMatch(/classroom_items_public_is_material/i);
	});

	test('a student may still read the document of a class they are in', async () => {
		const count = await db.asUser(studentA.id, async (q) => {
			const { rows } = await q<{ n: string }>(
				`select count(*)::text as n from public.classroom_reference_specs where item_id = $1`,
				[privateMaterial]
			);
			return Number(rows[0].n);
		});
		expect(count).toBe(1);
	});

	test('another class’s student reads nothing of it', async () => {
		const outsider = await createUser(db, 'student.z@boscotech.net', 'Zed');
		const rows = await db.asUser(outsider.id, async (q) => {
			const { rows } = await q(`select item_id from public.classroom_reference_specs`);
			return rows;
		});
		expect(rows).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// 6. Schema v2 compatibility.
// ---------------------------------------------------------------------------

describe('the kind discriminator', () => {
	test('a v1 assignment spec with no kind still validates', async () => {
		await expect(
			db.sql(`select public._classroom_check_spec($1::jsonb)`, [
				JSON.stringify(ASSIGNMENT_SPEC_V1)
			])
		).resolves.toBeTruthy();
	});

	test('an explicit kind:"assignment" is accepted too', async () => {
		await expect(
			db.asUser(teacherA.id, (q) =>
				q(`select public.classroom_set_assignment_spec($1::uuid, $2::jsonb)`, [
					assignmentId,
					JSON.stringify({ ...ASSIGNMENT_SPEC_V1, kind: 'assignment' })
				])
			)
		).resolves.toBeTruthy();
	});

	test('a reference document pasted into the assignment rpc is refused by name', async () => {
		const err = await captureError(() =>
			db.asUser(teacherA.id, (q) =>
				q(`select public.classroom_set_assignment_spec($1::uuid, $2::jsonb)`, [
					assignmentId,
					JSON.stringify(REFERENCE_SPEC)
				])
			)
		);
		expect(err.message).toMatch(/reference document/i);
	});

	test('a reference spec is rejected for a forbidden key anywhere in it', async () => {
		const err = await captureError(() =>
			db.asUser(teacherA.id, (q) =>
				q(`select public.classroom_set_reference_spec($1::uuid, $2::jsonb)`, [
					privateMaterial,
					JSON.stringify({
						...REFERENCE_SPEC,
						sections: [
							{
								slug: 'x',
								title: 'X',
								blocks: [{ type: 'instructions', content: 'hi', points: 5 }]
							}
						]
					})
				])
			)
		);
		expect(err.message).toMatch(/may not carry "points"/i);
	});

	test.each([
		['a duplicate slug', { sections: [ref('a'), ref('a')] }],
		['a slug that is not url-safe', { sections: [ref('Not A Slug')] }],
		['an unknown block type', { sections: [{ slug: 'a', title: 'A', blocks: [{ type: 'textField', id: 'x', prompt: 'p' }] }] }],
		[
			'a linkCard with no fallbackLabel',
			{
				sections: [
					{
						slug: 'a',
						title: 'A',
						blocks: [{ type: 'linkCard', links: [{ url: 'https://example.com' }] }]
					}
				]
			}
		],
		[
			'an unknown calc tool',
			{
				sections: [
					{ slug: 'a', title: 'A', blocks: [{ type: 'calc', tool: 'wat', config: {} }] }
				]
			}
		]
	])('rejects %s', async (_label, patch) => {
		const err = await captureError(() =>
			db.asUser(teacherA.id, (q) =>
				q(`select public.classroom_set_reference_spec($1::uuid, $2::jsonb)`, [
					privateMaterial,
					JSON.stringify({ ...REFERENCE_SPEC, ...patch })
				])
			)
		);
		expect(err.message.length).toBeGreaterThan(0);
	});

	test('only a material can carry a reference document', async () => {
		const err = await captureError(() =>
			db.asUser(teacherA.id, (q) =>
				q(`select public.classroom_set_reference_spec($1::uuid, $2::jsonb)`, [
					assignmentId,
					JSON.stringify(REFERENCE_SPEC)
				])
			)
		);
		expect(err.message).toMatch(/only a material/i);
	});
});

function ref(slug: string) {
	return { slug, title: 'A', blocks: [{ type: 'instructions', content: 'hi' }] };
}
