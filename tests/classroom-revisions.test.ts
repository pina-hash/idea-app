// tests/classroom-revisions.test.ts
//
// 0110: content revisions, and the non-destructive attach they exist to make
// possible.
//
// WHAT EARNS A TEST HERE, since the suite in this repo is deliberately narrow:
// every guarantee below fails SILENTLY. A spec that overwrites its predecessor
// with no copy looks exactly like one that kept it -- right up until someone
// asks for the old one back, months later, and it is simply gone. A revision
// written on a no-op save looks like a revision. A restore that rewound the
// chain instead of extending it would leave a history that is missing the very
// event a reader is looking for. And an RLS policy that let a student read
// their teacher's earlier drafts would show nothing at all on any screen.
//
// The fixture is a REAL Postgres with the REAL migration files applied
// unmodified, and every read runs as `authenticated` with the caller's own JWT
// claims, which is what PostgREST does per request.

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
	'0095_classroom_leveled_rubrics.sql',
	'0101_classroom_decks.sql',
	'0102_classroom_deck_uploads.sql',
	'0104_classroom_edit_visibility.sql',
	'0108_classroom_rich_body.sql',
	'0109_classroom_scheduled_posting.sql',
	'0110_classroom_content_revisions.sql'
] as const;

const MIGRATION_0110 = readFileSync(
	join(
		fileURLToPath(new URL('..', import.meta.url)),
		'supabase',
		'migrations',
		'0110_classroom_content_revisions.sql'
	),
	'utf8'
);

let db: TestDb;
let owner: SeededUser;
let teacher: SeededUser;
let otherTeacher: SeededUser;
let student: SeededUser;
let section: string;
let sharedSection: string;

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

/** A minimal but genuinely valid assignment spec, parameterized by title. */
function spec(title: string, points = 20) {
	return {
		schemaVersion: 1,
		meta: { assignmentId: 'bridge', title, totalPoints: points },
		modules: [
			{
				id: 'm1',
				title: 'Measure',
				points,
				blocks: [{ type: 'instructions', content: 'Measure the span.' }],
				rubric: [
					{
						id: 'accuracy',
						criterion: 'Accuracy',
						levels: [
							{ label: 'Full', points, descriptor: 'Within tolerance.' },
							{ label: 'Partial', points: Math.floor(points / 2), descriptor: 'Close.' },
							{ label: 'None', points: 0, descriptor: 'Not attempted.' }
						]
					}
				]
			}
		]
	};
}

function referenceSpec(title: string) {
	return {
		schemaVersion: 2,
		kind: 'reference',
		meta: { referenceId: 'syllabus', title },
		sections: [
			{
				slug: 'grading',
				title: 'Grading',
				blocks: [{ type: 'instructions', content: 'Graded against the rubric.' }]
			}
		]
	};
}

const RUBRIC = [
	{
		id: 'accuracy',
		criterion: 'Accuracy',
		levels: [
			{ label: 'Full', points: 20, descriptor: 'Within tolerance.' },
			{ label: 'Partial', points: 12, descriptor: 'Close.' },
			{ label: 'None', points: 0, descriptor: 'Not attempted.' }
		]
	}
];

async function createItem(
	kind: string,
	title: string,
	sections: string[] = [section],
	published = true,
	// An item posted ACROSS both teachers' sections can only be created by
	// someone who manages both, which is the admin -- classroom_create_item
	// refuses a target the caller does not manage, exactly as it should.
	actor?: SeededUser
): Promise<string> {
	const res = await rpc<{ item_id: string }>(
		(actor ?? teacher).id,
		"public.classroom_create_item($1, $2::uuid[], $3, 'Body text.', null, null, null, $4::boolean, '[]'::jsonb, false, null, null)",
		[kind, sections, title, published]
	);
	return res.item_id;
}

async function setSpec(userId: string, itemId: string, value: unknown) {
	return rpc(userId, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
		itemId,
		value === null ? null : JSON.stringify(value)
	]);
}

async function setReference(userId: string, itemId: string, value: unknown) {
	return rpc(userId, 'public.classroom_set_reference_spec($1::uuid, $2::jsonb)', [
		itemId,
		value === null ? null : JSON.stringify(value)
	]);
}

async function setRubric(userId: string, itemId: string, value: unknown) {
	return rpc(userId, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [
		itemId,
		value === null ? null : JSON.stringify(value)
	]);
}

interface RevRow {
	id: string;
	target: string;
	revision: number;
	payload: Record<string, unknown> | unknown[];
	author_email: string | null;
	author_name: string | null;
	supersedes_id: string | null;
	restored_from_id: string | null;
}

/** Raw, as the connection owner: what is actually stored, RLS out of the way. */
async function rawRevisions(itemId: string, target?: string): Promise<RevRow[]> {
	const { rows } = await db.sql<RevRow>(
		`select id, target, revision, payload, author_email, author_name, supersedes_id, restored_from_id
		 from public.classroom_content_revisions
		 where item_id = $1 ${target ? 'and target = $2' : ''}
		 order by target, revision`,
		target ? [itemId, target] : [itemId]
	);
	return rows;
}

async function storedSpec(itemId: string): Promise<Record<string, unknown> | null> {
	const { rows } = await db.sql<{ spec: Record<string, unknown> }>(
		'select spec from public.classroom_assignment_specs where item_id = $1',
		[itemId]
	);
	return rows[0]?.spec ?? null;
}

beforeAll(async () => {
	db = await startTestDb(MIGRATIONS);
	owner = await createUser(db, 'apina@boscotech.edu', 'A. Pina');
	teacher = await createUser(db, 'vargas@boscotech.edu', 'T. Vargas');
	otherTeacher = await createUser(db, 'other@boscotech.edu', 'O. Teacher');
	student = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');

	const course = await rpc<{ course_id: string }>(
		teacher.id,
		"public.classroom_upsert_course('IDEA209H', 'Engineering')"
	);
	const sec = await rpc<{ section_id: string }>(
		teacher.id,
		"public.classroom_upsert_section($1::uuid, 'Period 2', 'B')",
		[course.course_id]
	);
	section = sec.section_id;
	// A SECOND section belonging to the OTHER teacher, so "manages every posted
	// class" and "manages one of them" are genuinely different questions.
	const sec2 = await rpc<{ section_id: string }>(
		otherTeacher.id,
		"public.classroom_upsert_section($1::uuid, 'Period 6', 'A')",
		[course.course_id]
	);
	sharedSection = sec2.section_id;
	await rpc(
		teacher.id,
		"public.classroom_set_enrollment($1::uuid, 'alice@boscotech.net', 'Alice', true)",
		[section]
	);
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

describe('attaching a spec stops being destructive', () => {
	it('keeps the displaced spec, and puts the new one live', async () => {
		const item = await createItem('assignment', 'Bridge stackup');

		// The FIRST attach displaces nothing, so it records nothing: an empty
		// head is the absence of content, not a version of it.
		await setSpec(teacher.id, item, spec('v1'));
		expect(await rawRevisions(item)).toHaveLength(0);

		await setSpec(teacher.id, item, spec('v2'));
		const rows = await rawRevisions(item, 'assignment_spec');
		expect(rows).toHaveLength(1);
		expect((rows[0].payload as Record<string, Record<string, string>>).meta.title).toBe('v1');
		// ...and the head really did move.
		expect(((await storedSpec(item)) as Record<string, Record<string, string>>).meta.title).toBe('v2');

		await setSpec(teacher.id, item, spec('v3'));
		const three = await rawRevisions(item, 'assignment_spec');
		expect(three.map((r) => r.revision)).toEqual([1, 2]);
		expect(three.map((r) => (r.payload as Record<string, Record<string, string>>).meta.title)).toEqual([
			'v1',
			'v2'
		]);
	});

	it('links the chain, and never lets it fork', async () => {
		const item = await createItem('assignment', 'Chain');
		await setSpec(teacher.id, item, spec('a'));
		await setSpec(teacher.id, item, spec('b'));
		await setSpec(teacher.id, item, spec('c'));

		const rows = await rawRevisions(item, 'assignment_spec');
		expect(rows[0].supersedes_id).toBeNull();
		expect(rows[1].supersedes_id).toBe(rows[0].id);

		// supersedes_id is UNIQUE, so a second revision cannot claim the same
		// predecessor -- which is what makes "one head per chain" structural.
		await expect(
			db.sql(
				`insert into public.classroom_content_revisions (item_id, target, revision, payload, supersedes_id)
				 values ($1, 'assignment_spec', 99, '{}'::jsonb, $2)`,
				[item, rows[0].id]
			)
		).rejects.toThrow(/unique|duplicate/i);
	});

	it('refuses a revision 1 that claims a predecessor, and a later one with none', async () => {
		const item = await createItem('assignment', 'Checks');
		await expect(
			db.sql(
				`insert into public.classroom_content_revisions (item_id, target, revision, payload, supersedes_id)
				 values ($1, 'item', 2, '{}'::jsonb, null)`,
				[item]
			)
		).rejects.toThrow(/classroom_content_revisions_chain/);
	});

	it('refuses a target it does not know', async () => {
		const item = await createItem('assignment', 'Bad target');
		await expect(
			db.sql(
				`insert into public.classroom_content_revisions (item_id, target, revision, payload)
				 values ($1, 'deck', 1, '{}'::jsonb)`,
				[item]
			)
		).rejects.toThrow(/target/);
	});

	it('records who displaced it, not who wrote it', async () => {
		// Both teachers manage this one, so the second write is genuinely by
		// someone other than the author of what it replaces.
		// Vargas writes it; the admin replaces it. Two different people, which is
		// what makes the attribution question answerable at all.
		const item = await createItem('assignment', 'Two authors');
		await setSpec(teacher.id, item, spec('first'));
		await setSpec(owner.id, item, spec('second'));

		const rows = await rawRevisions(item, 'assignment_spec');
		expect(rows).toHaveLength(1);
		expect((rows[0].payload as Record<string, Record<string, string>>).meta.title).toBe('first');
		// The row holds Vargas's content and Pina's name: this is the write that
		// displaced it. The panel says "Replaced by" for exactly this reason.
		expect(rows[0].author_email).toBe('apina@boscotech.edu');
	});
});

describe('a no-op save writes no revision', () => {
	it('for a spec re-sent unchanged', async () => {
		const item = await createItem('assignment', 'No-op spec');
		await setSpec(teacher.id, item, spec('same'));
		await setSpec(teacher.id, item, spec('same'));
		await setSpec(teacher.id, item, spec('same'));
		expect(await rawRevisions(item, 'assignment_spec')).toHaveLength(0);
	});

	it('for a reference document re-sent unchanged', async () => {
		const item = await createItem('material', 'No-op doc');
		await setReference(teacher.id, item, referenceSpec('same'));
		await setReference(teacher.id, item, referenceSpec('same'));
		expect(await rawRevisions(item, 'reference_spec')).toHaveLength(0);
		await setReference(teacher.id, item, referenceSpec('moved'));
		expect(await rawRevisions(item, 'reference_spec')).toHaveLength(1);
	});

	/**
	 * The rubric's guard compares the NORMALIZED criteria, never the raw
	 * parameter -- _classroom_normalize_rubric re-derives each criterion's
	 * points from its top level and stamps `incomplete` itself, so a caller
	 * sending a stale `points` field is sending the same rubric.
	 */
	it('for a rubric whose only difference is a field the server re-derives', async () => {
		const item = await createItem('assignment', 'No-op rubric');
		await setRubric(teacher.id, item, RUBRIC);
		expect(await rawRevisions(item, 'rubric')).toHaveLength(0);

		const stale = [{ ...RUBRIC[0], points: 999 }];
		await setRubric(teacher.id, item, stale);
		expect(await rawRevisions(item, 'rubric')).toHaveLength(0);
	});

	/**
	 * The item's guard is 0104's existing v_changed, REUSED. Binding the history
	 * to the same predicate the student-facing Updated badge uses is what stops
	 * the two ever disagreeing about whether content moved.
	 */
	it('for publishing, unpublishing and rescheduling', async () => {
		const item = await createItem('post', 'Publish me', [section], false);
		await rpc(teacher.id, 'public.classroom_set_published($1::uuid, true)', [item]);
		await rpc(teacher.id, 'public.classroom_set_published($1::uuid, false)', [item]);
		expect(await rawRevisions(item, 'item')).toHaveLength(0);

		// Rescheduling: a change to the row, but not to content.
		await rpc(
			teacher.id,
			`public.classroom_update_item($1::uuid, 'Publish me', 'Body text.', null, null, null,
				null, null, null, (now() + interval '3 days'))`,
			[item]
		);
		expect(await rawRevisions(item, 'item')).toHaveLength(0);
	});

	it('but a real edit to the item does write one', async () => {
		const item = await createItem('post', 'Before');
		await rpc(
			teacher.id,
			"public.classroom_update_item($1::uuid, 'After', 'Body text.', null, null, null, null, null, null, null)",
			[item]
		);
		const rows = await rawRevisions(item, 'item');
		expect(rows).toHaveLength(1);
		const payload = rows[0].payload as Record<string, unknown>;
		expect(payload.title).toBe('Before');
		expect(payload.body).toBe('Body text.');
		// The payload is CONTENT, not the whole row: nothing here restores an
		// author, a creation stamp, a pin or the export bookkeeping.
		expect(Object.keys(payload).sort()).toEqual([
			'body',
			'body_doc',
			'category',
			'due_at',
			'points',
			'publish_at',
			'title'
		]);
	});
});

describe('removing content keeps it', () => {
	it('snapshots a spec that is cleared, so Remove is recoverable', async () => {
		const item = await createItem('assignment', 'Removable');
		await setSpec(teacher.id, item, spec('doomed'));
		await setSpec(teacher.id, item, null);

		expect(await storedSpec(item)).toBeNull();
		const rows = await rawRevisions(item, 'assignment_spec');
		expect(rows).toHaveLength(1);
		expect((rows[0].payload as Record<string, Record<string, string>>).meta.title).toBe('doomed');
	});

	it('records nothing when there was nothing to remove', async () => {
		const item = await createItem('assignment', 'Nothing to remove');
		await setSpec(teacher.id, item, null);
		expect(await rawRevisions(item)).toHaveLength(0);
	});
});

describe('restore never rewinds', () => {
	it('writes the old payload as a NEW head plus a new revision', async () => {
		const item = await createItem('assignment', 'Restorable');
		await setSpec(teacher.id, item, spec('good'));
		await setSpec(teacher.id, item, spec('bad'));

		const before = await rawRevisions(item, 'assignment_spec');
		expect(before).toHaveLength(1);
		const good = before[0];

		const res = await rpc<{ ok: boolean; changed: boolean; restored: number }>(
			teacher.id,
			'public.classroom_restore_revision($1::uuid)',
			[good.id]
		);
		expect(res.ok).toBe(true);
		expect(res.changed).toBe(true);
		expect(res.restored).toBe(1);

		// The head is the restored content...
		expect(((await storedSpec(item)) as Record<string, Record<string, string>>).meta.title).toBe('good');
		// ...and the chain GREW: nothing was rewound or deleted.
		const after = await rawRevisions(item, 'assignment_spec');
		expect(after).toHaveLength(2);
		expect(after[0].id).toBe(good.id);
		expect((after[1].payload as Record<string, Record<string, string>>).meta.title).toBe('bad');
		// The restore is legible rather than inferrable.
		expect(after[1].restored_from_id).toBe(good.id);
		expect(after[1].supersedes_id).toBe(good.id);
	});

	it('can be undone by restoring what it displaced', async () => {
		const item = await createItem('assignment', 'Round trip');
		await setSpec(teacher.id, item, spec('one'));
		await setSpec(teacher.id, item, spec('two'));
		const r1 = (await rawRevisions(item, 'assignment_spec'))[0];

		await rpc(teacher.id, 'public.classroom_restore_revision($1::uuid)', [r1.id]);
		const r2 = (await rawRevisions(item, 'assignment_spec'))[1];
		await rpc(teacher.id, 'public.classroom_restore_revision($1::uuid)', [r2.id]);

		expect(((await storedSpec(item)) as Record<string, Record<string, string>>).meta.title).toBe('two');
		expect(await rawRevisions(item, 'assignment_spec')).toHaveLength(3);
	});

	it('restoring what is already live changes nothing and records nothing', async () => {
		const item = await createItem('assignment', 'Already live');
		await setSpec(teacher.id, item, spec('x'));
		await setSpec(teacher.id, item, spec('y'));
		const r1 = (await rawRevisions(item, 'assignment_spec'))[0];
		await rpc(teacher.id, 'public.classroom_restore_revision($1::uuid)', [r1.id]);

		const count = (await rawRevisions(item, 'assignment_spec')).length;
		const again = await rpc<{ changed: boolean }>(
			teacher.id,
			'public.classroom_restore_revision($1::uuid)',
			[r1.id]
		);
		expect(again.changed).toBe(false);
		expect(await rawRevisions(item, 'assignment_spec')).toHaveLength(count);
	});

	it('restores an item body, and leaves its links alone', async () => {
		const item = await createItem('post', 'Original title');
		await rpc(
			teacher.id,
			`public.classroom_update_item($1::uuid, 'Original title', 'Body text.', null, null, null,
				null, $2::jsonb, null, null)`,
			[item, JSON.stringify([{ url: 'https://example.com/a', label: 'A' }])]
		);
		await rpc(
			teacher.id,
			"public.classroom_update_item($1::uuid, 'Changed title', 'Different body.', null, null, null, null, null, null, null)",
			[item]
		);

		const rows = await rawRevisions(item, 'item');
		const original = rows.find(
			(r) => (r.payload as Record<string, unknown>).title === 'Original title'
		)!;
		await rpc(teacher.id, 'public.classroom_restore_revision($1::uuid)', [original.id]);

		const { rows: head } = await db.sql<{ title: string; body: string }>(
			'select title, body from public.classroom_items where id = $1',
			[item]
		);
		expect(head[0].title).toBe('Original title');

		// The links survive: an item revision does not carry them, and reverting
		// a teacher's link list as a side effect of restoring a body is not
		// something a reader would predict.
		const { rows: links } = await db.sql<{ url: string }>(
			'select url from public.classroom_item_resources where item_id = $1',
			[item]
		);
		expect(links.map((l) => l.url)).toEqual(['https://example.com/a']);
	});

	/**
	 * Restoring runs the ORDINARY setter, so every validator runs again. A
	 * payload a later migration would now refuse fails with THAT validator's
	 * message rather than landing content the schema no longer accepts.
	 */
	it('re-validates on the way in', async () => {
		const item = await createItem('assignment', 'Re-validated');
		await setSpec(teacher.id, item, spec('ok'));
		await setSpec(teacher.id, item, spec('ok2'));
		const first = (await rawRevisions(item, 'assignment_spec'))[0];

		// Corrupt the stored payload the way a schema change effectively would.
		await db.sql(
			`update public.classroom_content_revisions
			 set payload = jsonb_set(payload, '{meta,totalPoints}', '999'::jsonb)
			 where id = $1`,
			[first.id]
		);
		await expect(
			rpc(teacher.id, 'public.classroom_restore_revision($1::uuid)', [first.id])
		).rejects.toThrow();
		// ...and the head is untouched.
		expect(((await storedSpec(item)) as Record<string, Record<string, string>>).meta.title).toBe('ok2');
	});
});

describe('who may read, and who may restore', () => {
	let shared: string;
	let ownRevision: string;

	beforeAll(async () => {
		shared = await createItem('assignment', 'Shared item', [section, sharedSection], true, owner);
		await setSpec(owner.id, shared, spec('one'));
		await setSpec(owner.id, shared, spec('two'));
		ownRevision = (await rawRevisions(shared, 'assignment_spec'))[0].id;
	});

	it('a teacher of ONE posted class can read the history', async () => {
		// The READ bar is classroom_can_read_instructor_material: an earlier
		// draft is teacher-facing material, and this teacher can already see the
		// item's current content and its answer keys.
		const res = await rpc<{ revisions: unknown[] }>(
			otherTeacher.id,
			'public.classroom_item_revisions($1::uuid)',
			[shared]
		);
		expect(res.revisions).toHaveLength(1);
	});

	it('a student cannot -- by RPC or by reading the table', async () => {
		await expect(
			rpc(student.id, 'public.classroom_item_revisions($1::uuid)', [shared])
		).rejects.toThrow();

		const rows = await db.asUser(student.id, async (q) => {
			const r = await q('select id from public.classroom_content_revisions where item_id = $1', [
				shared
			]);
			return r.rows;
		});
		expect(rows).toHaveLength(0);
	});

	it('a teacher who teaches none of its classes cannot', async () => {
		const mine = await createItem('assignment', 'Vargas only');
		await setSpec(teacher.id, mine, spec('a'));
		await setSpec(teacher.id, mine, spec('b'));

		await expect(
			rpc(otherTeacher.id, 'public.classroom_item_revisions($1::uuid)', [mine])
		).rejects.toThrow();
		const rows = await db.asUser(otherTeacher.id, async (q) => {
			const r = await q('select id from public.classroom_content_revisions where item_id = $1', [
				mine
			]);
			return r.rows;
		});
		expect(rows).toHaveLength(0);
	});

	it('RESTORING needs the stricter bar: every posted class', async () => {
		// otherTeacher may READ this history (above) and still may not put old
		// content back in front of a class they do not teach.
		//
		// MATCHED ON "can restore it", which is the RESTORE RPC's OWN message and
		// nothing else's. The obvious wording -- "teacher of record for every
		// class" -- is shared with the setter this function calls, so a test
		// matching that would pass whether the restore checked anything at all
		// (the nested setter would refuse it a moment later). Found by mutation:
		// swapping this guard for the weaker read bar reddened nothing until the
		// assertion named the right message.
		await expect(
			rpc(otherTeacher.id, 'public.classroom_restore_revision($1::uuid)', [ownRevision])
		).rejects.toThrow(/can restore it/);
		await expect(
			rpc(student.id, 'public.classroom_restore_revision($1::uuid)', [ownRevision])
		).rejects.toThrow();
	});

	it('reports head_revision so a row can say r1 of 2', async () => {
		const res = await rpc<{ head_revisions: Record<string, number> }>(
			owner.id,
			'public.classroom_item_revisions($1::uuid)',
			[shared]
		);
		expect(res.head_revisions.assignment_spec).toBe(2);
	});

	it('has NO client write path at all, for student, teacher or admin', async () => {
		for (const who of [student, teacher, owner]) {
			await expect(
				db.asUser(who.id, (q) =>
					q(
						`insert into public.classroom_content_revisions (item_id, target, revision, payload)
						 values ($1, 'item', 1, '{}'::jsonb)`,
						[shared]
					)
				)
			).rejects.toThrow(/permission denied/);
			await expect(
				db.asUser(who.id, (q) =>
					q('update public.classroom_content_revisions set payload = $1', ['{}'])
				)
			).rejects.toThrow(/permission denied/);
			await expect(
				db.asUser(who.id, (q) => q('delete from public.classroom_content_revisions'))
			).rejects.toThrow(/permission denied/);
		}
	});

	it('grants anon nothing', async () => {
		const { rows } = await db.sql<{ ok: boolean }>(
			`select
				has_table_privilege('anon', 'public.classroom_content_revisions', 'SELECT')
				or has_function_privilege('anon', 'public.classroom_item_revisions(uuid)', 'EXECUTE')
				or has_function_privilege('anon', 'public.classroom_restore_revision(uuid)', 'EXECUTE')
				or has_function_privilege('anon', 'public.classroom_record_export(uuid, text, text, text)', 'EXECUTE')
				as ok`
		);
		expect(rows[0].ok).toBe(false);
	});
});

describe('export bookkeeping', () => {
	it('assigns a slug once and never moves it', async () => {
		const item = await createItem('assignment', 'Exported');
		await rpc(teacher.id, "public.classroom_record_export($1::uuid, 'bridge-stackup', 'sha1', null)", [
			item
		]);
		// A later export computed a different slug (the title changed); the
		// stored one wins, so the repo folder does not move.
		const res = await rpc<{ slug: string }>(
			teacher.id,
			"public.classroom_record_export($1::uuid, 'bridge-stackup-revised', 'sha2', null)",
			[item]
		);
		expect(res.slug).toBe('bridge-stackup');

		const { rows } = await db.sql<{ export_slug: string; last_export_sha: string }>(
			'select export_slug, last_export_sha from public.classroom_items where id = $1',
			[item]
		);
		expect(rows[0].export_slug).toBe('bridge-stackup');
		expect(rows[0].last_export_sha).toBe('sha2');
	});

	it('keeps the last good sha through a failure, and clears the error on success', async () => {
		const item = await createItem('assignment', 'Flaky export');
		await rpc(teacher.id, "public.classroom_record_export($1::uuid, 'flaky', 'good-sha', null)", [item]);
		await rpc(
			teacher.id,
			"public.classroom_record_export($1::uuid, 'flaky', null, 'GitHub 403: refused')",
			[item]
		);

		let { rows } = await db.sql<{
			last_export_sha: string;
			last_export_error: string | null;
			last_export_at: string | null;
		}>(
			'select last_export_sha, last_export_error, last_export_at from public.classroom_items where id = $1',
			[item]
		);
		// "It exported cleanly at 14:02, and the attempt at 14:40 failed" is two
		// facts, and the chip needs both.
		expect(rows[0].last_export_sha).toBe('good-sha');
		expect(rows[0].last_export_error).toContain('403');
		const succeededAt = rows[0].last_export_at;

		await rpc(teacher.id, "public.classroom_record_export($1::uuid, 'flaky', 'newer-sha', null)", [item]);
		({ rows } = await db.sql(
			'select last_export_sha, last_export_error, last_export_at from public.classroom_items where id = $1',
			[item]
		));
		expect(rows[0].last_export_error).toBeNull();
		expect(rows[0].last_export_sha).toBe('newer-sha');
		expect(rows[0].last_export_at).not.toBe(succeededAt);
	});

	it('refuses a caller who does not manage the item', async () => {
		const mine = await createItem('assignment', 'Not yours');
		await expect(
			rpc(otherTeacher.id, "public.classroom_record_export($1::uuid, 's', null, null)", [mine])
		).rejects.toThrow(/teacher of record/);
		await expect(
			rpc(student.id, "public.classroom_record_export($1::uuid, 's', null, null)", [mine])
		).rejects.toThrow();
	});

	it('has no client write path to the export columns', async () => {
		const item = await createItem('assignment', 'Locked columns');
		await expect(
			db.asUser(teacher.id, (q) =>
				q('update public.classroom_items set last_export_error = $1 where id = $2', ['x', item])
			)
		).rejects.toThrow(/permission denied/);
	});
});

describe('the file re-applies', () => {
	/**
	 * 0088 shipped a drop-then-add on a constraint another constraint depended
	 * on and died with 2BP01 on its second run in the live SQL editor. These
	 * migrations are pasted in BY HAND, so a re-run is ordinary -- someone
	 * re-pastes, or a first attempt failed partway and gets retried.
	 */
	it('runs a second and third time over its own objects, with the guarantees intact', async () => {
		const item = await createItem('assignment', 'Idempotent');
		await setSpec(teacher.id, item, spec('one'));
		await setSpec(teacher.id, item, spec('two'));
		const before = await rawRevisions(item, 'assignment_spec');

		await db.sql(MIGRATION_0110);
		await db.sql(MIGRATION_0110);

		expect(await rawRevisions(item, 'assignment_spec')).toEqual(before);

		// Still exactly one signature each -- no re-signed function left a
		// second overload behind (the 0058/0068/0096 trap).
		const { rows } = await db.sql<{ name: string; n: number }>(
			`select p.proname as name, count(*)::int as n
			 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public'
				 and p.proname in ('classroom_update_item', 'classroom_set_assignment_spec',
					 'classroom_set_reference_spec', 'classroom_set_rubric',
					 'classroom_restore_revision', 'classroom_item_revisions', 'classroom_record_export')
			 group by p.proname order by p.proname`
		);
		for (const row of rows) expect(row.n).toBe(1);
		expect(rows).toHaveLength(7);

		// And a write still works afterwards, snapshotting through the recreated
		// function. ('one' displaced nothing, so the chain reads one, two.)
		await setSpec(teacher.id, item, spec('three'));
		const after = await rawRevisions(item, 'assignment_spec');
		expect(
			after.map((r) => (r.payload as Record<string, Record<string, string>>).meta.title)
		).toEqual(['one', 'two']);
	});
});
