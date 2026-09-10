// tests/db/classroom-attachment-layout.test.ts
//
// 0193: where an item's files and links sit, the order its files are listed
// in, and what a file is called -- three writes and one re-created duplicate.
//
// WHAT THIS FILE IS FOR. Every guarantee here is one a wrong answer would not
// show on screen: a rename that quietly breaks a figure a class can see, an
// order write that accepted half a list and left the rest tied, a placement
// write that grew an "Updated" badge, a student who could call any of it, a
// duplicate that dropped the placement it was copying. So it runs against a
// REAL embedded Postgres with the REAL migration files applied unmodified, and
// every write goes through `asUser` -- `SET ROLE authenticated` with the JWT
// claims GUC set, exactly what PostgREST does -- so the grants and the
// `_classroom_manages_item` re-check are the ones production enforces.
//
// THE MIGRATION IS APPLIED OVER SEEDED PRE-MIGRATION DATA, not only over a
// reset chain: the chain stops at 0176, one item is created through the real
// `classroom_create_item`, and only THEN is 0193 read from disk and applied,
// so "an old row reads bottom" is measured on a row that genuinely predates
// the column. It is applied a second time on top of itself, because
// re-pasting a migration is ordinary here and a file that only works once
// fails exactly then.
//
// THE SANITIZER PARITY IS THE PART WITH TWO IMPLEMENTATIONS ON PURPOSE. The
// record route computes a stored filename in TypeScript
// (`recordedAttachmentFilename`) and the rename RPC computes one in SQL
// (`_classroom_attachment_filename`); a renamed file and an uploaded one must
// agree about what a name becomes, so odd names are put through BOTH and the
// answers compared. The expected value comes from the TypeScript function,
// which is the deployed rule, not from the SQL under test.
//
// ENCODING. The embedded cluster is initialised with no locale, so its
// databases may be SQL_ASCII, where Unicode whitespace is a run of bytes and
// no regex class can name it. The migration adds the non-ASCII whitespace
// members only under UTF8 (production always is), so the two cases that need
// them -- a macOS screenshot name with U+202F, and the UTF-16 cap on emoji --
// are asserted only when `server_encoding` says UTF8, and the file prints
// which it found. A skip here is reported, never silent.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type QueryFn,
	type SeededUser,
	type TestDb
} from './harness';
import { recordedAttachmentFilename } from '../../src/lib/classroom/attachments';

/**
 * The classroom chain up to the last author of every object 0193 touches, in
 * production order. 0133/0135 give the two attachment tables their storage
 * columns (0159's duplicate body names `storage_key`); 0137 is the anon sweep,
 * placed where it sits in production -- BEFORE 0159 and 0176 -- so this file
 * also proves those two, and 0193 after them, revoke for themselves under the
 * hosted default privileges the stub carries. 0176 is the last author of
 * `classroom_update_item`, whose gate has to accept the image block the
 * `referenced` case is built with.
 */
const CHAIN = [
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
	'0110_classroom_content_revisions.sql',
	'0122_rich_text_nested_lists.sql',
	'0133_classroom_storage_attachments.sql',
	'0134_classroom_submission_open_race.sql',
	'0135_classroom_instructor_storage_and_public_attachments.sql',
	'0137_anon_execute_sweep.sql',
	'0159_classroom_duplicate_carries_the_spec.sql',
	'0176_classroom_item_images.sql'
] as const;

const MIGRATION_0193 = readFileSync(
	join(
		fileURLToPath(new URL('../..', import.meta.url)),
		'supabase',
		'migrations',
		'0193_classroom_resource_layout.sql'
	),
	'utf8'
);

/** The spec shapes `_classroom_check_spec` accepts, copied from
 *  tests/classroom-reference.test.ts so a mention can be planted in a prompt
 *  and in an instructions block through the REAL setters. */
function assignmentSpec(prompt: string) {
	return {
		schemaVersion: 1,
		meta: { assignmentId: 'a-1', title: 'Bracket', totalPoints: 10 },
		modules: [
			{
				id: 'm1',
				title: 'Model it',
				points: 10,
				blocks: [{ type: 'textField', id: 'why', prompt, minSentences: 2 }],
				rubric: [
					{
						id: 'c1',
						criterion: 'Reasoning',
						levels: [
							{ points: 10, label: 'Complete', descriptor: 'Names the load path.' },
							{ points: 5, label: 'Developing', descriptor: 'Names one of the two.' },
							{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
						]
					}
				]
			}
		]
	};
}

function referenceSpec(content: string) {
	return {
		schemaVersion: 2,
		kind: 'reference',
		meta: { referenceId: 'ref-1', title: 'Course Reference' },
		navigation: 'tabs',
		sections: [{ slug: 'overview', title: 'Overview', blocks: [{ type: 'instructions', content }] }]
	};
}

/** Fails loudly if the statement SUCCEEDS; otherwise hands back the error. */
async function captureError(fn: () => Promise<unknown>): Promise<Error> {
	try {
		await fn();
	} catch (e) {
		return e as Error;
	}
	throw new Error('Expected the statement to be refused, but it succeeded.');
}

describe('0193: resource layout, order and rename', () => {
	let db: TestDb;
	let teacherA: SeededUser;
	let teacherB: SeededUser;
	let student: SeededUser;
	let sectionA: string;
	let sectionB: string;
	/** Created through the real RPC BEFORE 0193 is applied. */
	let oldItem: string;
	let driveSeq = 0;

	async function rpc<T = Record<string, unknown>>(
		user: SeededUser,
		call: string,
		params: unknown[] = []
	): Promise<T> {
		return db.asUser(user.id, async (q) => {
			const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
			return rows[0].result;
		});
	}

	async function createItem(
		as: SeededUser,
		sections: string[],
		kind: 'post' | 'assignment' | 'material',
		title: string
	): Promise<string> {
		const r = await rpc<{ item_id: string }>(
			as,
			`public.classroom_create_item(
				p_kind => $1, p_section_ids => $2::uuid[], p_title => $3, p_body => $4,
				p_points => $5, p_published => true)`,
			[kind, sections, title, `${title} body.`, kind === 'assignment' ? 10 : null]
		);
		return r.item_id;
	}

	async function addFile(as: SeededUser, itemId: string, name: string): Promise<string> {
		driveSeq += 1;
		const r = await rpc<{ attachment_id: string }>(
			as,
			`public.classroom_add_attachment($1::uuid, $2, $3, 'image/png', 10)`,
			[itemId, `drive-${driveSeq}`, name]
		);
		return r.attachment_id;
	}

	async function addInstructorFile(as: SeededUser, itemId: string, name: string): Promise<string> {
		driveSeq += 1;
		const r = await rpc<{ attachment_id: string }>(
			as,
			`public.classroom_add_instructor_attachment($1::uuid, $2, $3, 'application/pdf', 10)`,
			[itemId, `drive-${driveSeq}`, name]
		);
		return r.attachment_id;
	}

	async function orderOf(table: string, itemId: string): Promise<string[]> {
		const { rows } = await db.sql<{ id: string }>(
			`select id from public.${table} where item_id = $1 order by sort_order, id`,
			[itemId]
		);
		return rows.map((r) => r.id);
	}

	async function placementOf(itemId: string): Promise<{ files: string; links: string }> {
		const { rows } = await db.sql<{ files_placement: string; links_placement: string }>(
			'select files_placement, links_placement from public.classroom_items where id = $1',
			[itemId]
		);
		return { files: rows[0].files_placement, links: rows[0].links_placement };
	}

	async function filenameOf(table: string, id: string): Promise<string> {
		const { rows } = await db.sql<{ filename: string }>(
			`select filename from public.${table} where id = $1`,
			[id]
		);
		return rows[0].filename;
	}

	beforeAll(async () => {
		db = await startTestDb(CHAIN);
		teacherA = await createUser(db, 'reyes@boscotech.edu', 'A. Reyes');
		teacherB = await createUser(db, 'ochoa@boscotech.edu', 'B. Ochoa');
		student = await createUser(db, 'ana.perez@boscotech.net', 'Ana Perez');

		sectionA = await createClassroomSection(db, {
			as: teacherA,
			courseCode: 'IDEA209H',
			courseTitle: 'Engineering I Honors',
			label: 'Period 2',
			teacherEmail: teacherA.email
		});
		sectionB = await createClassroomSection(db, {
			as: teacherB,
			courseCode: 'IDEA100',
			courseTitle: 'Engineering Foundations',
			label: 'Period 5',
			teacherEmail: teacherB.email
		});
		await enrollStudent(db, {
			as: teacherA,
			sectionId: sectionA,
			email: student.email,
			displayName: 'Ana Perez'
		});

		// THE PRE-MIGRATION ROW. Created before the column exists, so what it
		// reads afterwards is the default landing on a genuine old row.
		oldItem = await createItem(teacherA, [sectionA], 'post', 'Before 0193');

		await db.sql(MIGRATION_0193);
	}, 120_000);

	afterAll(async () => {
		await db?.stop();
	});

	// -----------------------------------------------------------------------
	// The apply itself.
	// -----------------------------------------------------------------------
	describe('the file', () => {
		it('re-applies over itself without error', async () => {
			await expect(db.sql(MIGRATION_0193)).resolves.toBeDefined();
		});

		it('a row created before the file reads bottom for both placements', async () => {
			expect(await placementOf(oldItem)).toEqual({ files: 'bottom', links: 'bottom' });
		});

		it("the client's narrowest probe -- selecting the new column as a student -- succeeds", async () => {
			// `layoutReady` in the section layout load is exactly this select;
			// the table grant is table-level, so a new column is readable by the
			// same grant. RLS decides the rows, the column is what the probe asks.
			const { rows } = await db.asUser(student.id, (q) =>
				q<{ files_placement: string }>(
					'select files_placement from public.classroom_items limit 1'
				)
			);
			expect(Array.isArray(rows)).toBe(true);
		});
	});

	// -----------------------------------------------------------------------
	// Placement.
	// -----------------------------------------------------------------------
	describe('classroom_set_item_layout', () => {
		it('round-trips both placements and answers what it stored', async () => {
			const item = await createItem(teacherA, [sectionA], 'material', 'Arranged');
			const up = await rpc(teacherA, `public.classroom_set_item_layout($1::uuid, 'top', 'top')`, [
				item
			]);
			expect(up).toEqual({
				ok: true,
				item_id: item,
				files_placement: 'top',
				links_placement: 'top'
			});
			expect(await placementOf(item)).toEqual({ files: 'top', links: 'top' });

			const mixed = await rpc(
				teacherA,
				`public.classroom_set_item_layout($1::uuid, 'bottom', 'top')`,
				[item]
			);
			expect(mixed).toMatchObject({ ok: true, files_placement: 'bottom', links_placement: 'top' });
			expect(await placementOf(item)).toEqual({ files: 'bottom', links: 'top' });
		});

		it('refuses a value that is not top or bottom, and refuses null, leaving the row alone', async () => {
			const item = await createItem(teacherA, [sectionA], 'material', 'Refused');
			await rpc(teacherA, `public.classroom_set_item_layout($1::uuid, 'top', 'bottom')`, [item]);

			const middle = await captureError(() =>
				rpc(teacherA, `public.classroom_set_item_layout($1::uuid, 'middle', 'bottom')`, [item])
			);
			expect(middle.message).toMatch(/not a place/);
			const upper = await captureError(() =>
				rpc(teacherA, `public.classroom_set_item_layout($1::uuid, 'top', 'Top')`, [item])
			);
			expect(upper.message).toMatch(/not a place/);
			const nul = await captureError(() =>
				rpc(teacherA, `public.classroom_set_item_layout($1::uuid, null, 'bottom')`, [item])
			);
			expect(nul.message).toMatch(/not a place/);
			// The refusals wrote nothing.
			expect(await placementOf(item)).toEqual({ files: 'top', links: 'bottom' });
		});

		it('is not an edit: updated_at moves, edited_at and the revision chain do not; a real edit moves both', async () => {
			const item = await createItem(teacherA, [sectionA], 'post', 'Stamped');
			const before = await db.sql<{ edited_at: string | null; updated_at: string; revs: string }>(
				`select edited_at, updated_at,
					(select count(*)::text from public.classroom_content_revisions r where r.item_id = i.id) as revs
				 from public.classroom_items i where i.id = $1`,
				[item]
			);
			expect(before.rows[0].edited_at).toBeNull();

			await rpc(teacherA, `public.classroom_set_item_layout($1::uuid, 'top', 'top')`, [item]);
			const after = await db.sql<{ edited_at: string | null; updated_at: string; revs: string }>(
				`select edited_at, updated_at,
					(select count(*)::text from public.classroom_content_revisions r where r.item_id = i.id) as revs
				 from public.classroom_items i where i.id = $1`,
				[item]
			);
			expect(after.rows[0].edited_at).toBeNull();
			expect(after.rows[0].revs).toBe(before.rows[0].revs);
			// STRICTLY greater: the create and the RPC are two transactions with
			// two `now()` values, and `classroom_items` has no updated_at trigger,
			// so the only writer of this column is the RPC's own `updated_at =
			// now()`. `>=` would pass on an RPC that never stamped it.
			expect(new Date(after.rows[0].updated_at).getTime()).toBeGreaterThan(
				new Date(before.rows[0].updated_at).getTime()
			);

			// POSITIVE CONTROL: a content change through the real edit path on
			// this published item stamps edited_at (0104) and mints a revision
			// (0110), so the absence above is the RPC's doing and not the
			// fixture's.
			await rpc(
				teacherA,
				`public.classroom_update_item(p_id => $1::uuid, p_title => 'Stamped', p_body => 'Changed.',
					p_body_doc => $2::jsonb)`,
				[item, JSON.stringify([{ type: 'p', runs: [{ text: 'Changed.' }] }])]
			);
			const edited = await db.sql<{ edited_at: string | null; revs: string }>(
				`select edited_at,
					(select count(*)::text from public.classroom_content_revisions r where r.item_id = i.id) as revs
				 from public.classroom_items i where i.id = $1`,
				[item]
			);
			expect(edited.rows[0].edited_at).not.toBeNull();
			expect(Number(edited.rows[0].revs)).toBeGreaterThan(Number(before.rows[0].revs));
		});

		it('a duplicate carries the placement of its source, in both directions, and is still a draft', async () => {
			const topLeft = await createItem(teacherA, [sectionA], 'assignment', 'Top files');
			await rpc(teacherA, `public.classroom_set_item_layout($1::uuid, 'top', 'bottom')`, [
				topLeft
			]);
			// 0159's own guarantee, carried forward: the copy has the spec too.
			await rpc(teacherA, `public.classroom_set_assignment_spec($1::uuid, $2::jsonb)`, [
				topLeft,
				JSON.stringify(assignmentSpec('Why that shape?'))
			]);
			await addFile(teacherA, topLeft, 'rig.png');

			const copy = await rpc<{ item_id: string }>(
				teacherA,
				`public.classroom_duplicate_item($1::uuid)`,
				[topLeft]
			);
			expect(await placementOf(copy.item_id)).toEqual({ files: 'top', links: 'bottom' });

			const bottomCopy = await rpc<{ item_id: string }>(
				teacherA,
				`public.classroom_duplicate_item($1::uuid)`,
				[oldItem]
			);
			expect(await placementOf(bottomCopy.item_id)).toEqual({ files: 'bottom', links: 'bottom' });

			const { rows } = await db.sql<{
				published: boolean;
				pinned: boolean;
				sort_order: number;
				title: string;
				specs: string;
				files: string;
			}>(
				`select published, pinned, sort_order, title,
					(select count(*)::text from public.classroom_assignment_specs s where s.item_id = i.id) as specs,
					(select count(*)::text from public.classroom_attachments a where a.item_id = i.id) as files
				 from public.classroom_items i where i.id = $1`,
				[copy.item_id]
			);
			expect(rows[0]).toMatchObject({
				published: false,
				pinned: false,
				sort_order: 0,
				title: 'Top files (copy)',
				specs: '1',
				files: '1'
			});
		});
	});

	// -----------------------------------------------------------------------
	// Order.
	// -----------------------------------------------------------------------
	describe('classroom_set_attachment_order', () => {
		let item: string;
		let a: string;
		let b: string;
		let c: string;
		let foreign: string;

		beforeAll(async () => {
			item = await createItem(teacherA, [sectionA], 'post', 'Ordered');
			a = await addFile(teacherA, item, 'a.png');
			b = await addFile(teacherA, item, 'b.png');
			c = await addFile(teacherA, item, 'c.png');
			const other = await createItem(teacherA, [sectionA], 'post', 'Elsewhere');
			foreign = await addFile(teacherA, other, 'x.png');
		});

		it('rewrites sort_order 1..n in the order given and answers the count', async () => {
			expect(await orderOf('classroom_attachments', item)).toEqual([a, b, c]);
			const r = await rpc(
				teacherA,
				`public.classroom_set_attachment_order($1::uuid, $2::uuid[])`,
				[item, [c, a, b]]
			);
			expect(r).toEqual({ ok: true, ordered: 3 });
			expect(await orderOf('classroom_attachments', item)).toEqual([c, a, b]);
			const { rows } = await db.sql<{ id: string; sort_order: number }>(
				'select id, sort_order from public.classroom_attachments where item_id = $1 order by sort_order',
				[item]
			);
			expect(rows.map((r) => r.sort_order)).toEqual([1, 2, 3]);
		});

		it('refuses a partial list, a foreign id, a repeated id and an empty list, naming the counts, and writes nothing', async () => {
			const partial = await captureError(() =>
				rpc(teacherA, `public.classroom_set_attachment_order($1::uuid, $2::uuid[])`, [
					item,
					[a, b]
				])
			);
			expect(partial.message).toMatch(/has 3 file\(s\), the order named 2 id\(s\), of which 2 belong/);

			const stranger = await captureError(() =>
				rpc(teacherA, `public.classroom_set_attachment_order($1::uuid, $2::uuid[])`, [
					item,
					[a, b, foreign]
				])
			);
			expect(stranger.message).toMatch(/has 3 file\(s\), the order named 3 id\(s\), of which 2 belong/);

			const twice = await captureError(() =>
				rpc(teacherA, `public.classroom_set_attachment_order($1::uuid, $2::uuid[])`, [
					item,
					[a, a, b]
				])
			);
			expect(twice.message).toMatch(/more than once \(3 id\(s\), 2 distinct\)/);

			const empty = await captureError(() =>
				rpc(teacherA, `public.classroom_set_attachment_order($1::uuid, $2::uuid[])`, [item, []])
			);
			expect(empty.message).toMatch(/has 3 file\(s\), the order named 0 id\(s\)/);

			// Nothing moved and the foreign row was not touched.
			expect(await orderOf('classroom_attachments', item)).toEqual([c, a, b]);
			const { rows } = await db.sql<{ sort_order: number }>(
				'select sort_order from public.classroom_attachments where id = $1',
				[foreign]
			);
			expect(rows[0].sort_order).toBe(1);
		});

		it('the instructor twin does the same over its own table', async () => {
			const p = await addInstructorFile(teacherA, item, 'key.pdf');
			const q = await addInstructorFile(teacherA, item, 'notes.pdf');
			expect(await orderOf('classroom_instructor_attachments', item)).toEqual([p, q]);
			const r = await rpc(
				teacherA,
				`public.classroom_set_instructor_attachment_order($1::uuid, $2::uuid[])`,
				[item, [q, p]]
			);
			expect(r).toEqual({ ok: true, ordered: 2 });
			expect(await orderOf('classroom_instructor_attachments', item)).toEqual([q, p]);

			// A student-facing id is foreign to the instructor table.
			const crossed = await captureError(() =>
				rpc(teacherA, `public.classroom_set_instructor_attachment_order($1::uuid, $2::uuid[])`, [
					item,
					[q, a]
				])
			);
			expect(crossed.message).toMatch(/has 2 file\(s\), the order named 2 id\(s\), of which 1 belong/);
			expect(await orderOf('classroom_instructor_attachments', item)).toEqual([q, p]);
		});
	});

	// -----------------------------------------------------------------------
	// Rename.
	// -----------------------------------------------------------------------
	describe('classroom_rename_attachment', () => {
		it('stores the sanitized name, and the SQL sanitizer agrees with the record route on odd names', async () => {
			const { rows: enc } = await db.sql<{ e: string }>(
				'select current_setting(\'server_encoding\') as e'
			);
			const utf8 = enc[0].e === 'UTF8';
			console.log(`[0193] embedded server_encoding = ${enc[0].e}`);

			const item = await createItem(teacherA, [sectionA], 'post', 'Renamed');
			const id = await addFile(teacherA, item, 'start.png');

			// Five odd names, each put through the REAL rpc on the same row (so
			// no sibling collides) and through the TypeScript rule. The
			// expected value is the TypeScript one.
			const odd = [
				'  Bridge lab (final) [v2].png  ',
				'\t\n  \n',
				'((()))[[[]]]',
				'--- a  b ---',
				'  ' + 'y'.repeat(298) + ' (a)'
			];
			const expected = odd.map(recordedAttachmentFilename);
			expect(expected).toEqual([
				'Bridge-lab-final-v2-.png',
				'attachment',
				'attachment',
				'a-b',
				'y'.repeat(298)
			]);

			const stored: string[] = [];
			for (const name of odd) {
				const r = await rpc<{ ok: boolean; filename: string; attachment_id: string }>(
					teacherA,
					`public.classroom_rename_attachment($1::uuid, $2)`,
					[id, name]
				);
				expect(r.ok).toBe(true);
				expect(r.attachment_id).toBe(id);
				expect(await filenameOf('classroom_attachments', id)).toBe(r.filename);
				stored.push(r.filename);
			}
			expect(stored).toEqual(expected);

			// The private helper directly, for the shapes the rpc's text
			// parameter cannot carry (null) and the pure cap case.
			const direct = await db.sql<{ n: string }>(
				`select public._classroom_attachment_filename(x) as n
				 from unnest(array[null, repeat('x', 320) || '.png']) as x`
			);
			expect(direct.rows.map((r) => r.n)).toEqual([
				recordedAttachmentFilename(null as unknown as string),
				recordedAttachmentFilename('x'.repeat(320) + '.png')
			]);
			expect(direct.rows[1].n).toHaveLength(300);

			// UNICODE WHITESPACE AND THE UTF-16 CAP. The rule is JavaScript's:
			// a macOS screenshot name carries U+202F before "AM", and `\s`
			// there turns it into a dash. The SQL side builds that class only
			// under UTF8, so under SQL_ASCII the assertion cannot be made and
			// is reported instead.
			const mac = 'Screenshot 2026-09-09 at 10.12.03\u202fAM.png';
			const emoji = '\u{1F600}'.repeat(151);
			expect(recordedAttachmentFilename(mac)).toBe('Screenshot-2026-09-09-at-10.12.03-AM.png');
			expect(recordedAttachmentFilename(emoji)).toBe('\u{1F600}'.repeat(150));
			if (utf8) {
				const uni = await db.sql<{ n: string }>(
					`select public._classroom_attachment_filename(x) as n from unnest(array[$1, $2]) as x`,
					[mac, emoji]
				);
				expect(uni.rows.map((r) => r.n)).toEqual([
					recordedAttachmentFilename(mac),
					recordedAttachmentFilename(emoji)
				]);
			} else {
				console.log(
					'[0193] this cluster is ' +
						enc[0].e +
						': the U+202F and emoji-cap cases are measured in "the sanitizer under a UTF8 database" below, not here'
				);
			}
		});

		it('answers referenced when the body carries an image naming the file, case-insensitively; a sibling still renames', async () => {
			const item = await createItem(teacherA, [sectionA], 'post', 'Figured');
			const fig = await addFile(teacherA, item, 'diagram.png');
			const sibling = await addFile(teacherA, item, 'notes.pdf');

			// THE REAL PATH: the document goes through classroom_update_item, so
			// 0176's gate is what admits the image block -- an `img` written
			// straight into the column would prove nothing about what a save
			// can produce.
			await rpc(
				teacherA,
				`public.classroom_update_item(p_id => $1::uuid, p_title => 'Figured', p_body => 'See it.',
					p_body_doc => $2::jsonb)`,
				[
					item,
					JSON.stringify([
						{ type: 'p', runs: [{ text: 'See it.' }] },
						{ type: 'img', src: 'attachment:Diagram.PNG', alt: 'The rig' }
					])
				]
			);

			const refused = await rpc(teacherA, `public.classroom_rename_attachment($1::uuid, 'rig.png')`, [
				fig
			]);
			expect(refused).toEqual({ ok: false, reason: 'referenced' });
			expect(await filenameOf('classroom_attachments', fig)).toBe('diagram.png');

			// POSITIVE CONTROL on the same item: the file no figure names renames.
			const ok = await rpc(teacherA, `public.classroom_rename_attachment($1::uuid, 'notes-v2.pdf')`, [
				sibling
			]);
			expect(ok).toMatchObject({ ok: true, filename: 'notes-v2.pdf' });
		});

		it('answers referenced when an assignment spec mentions the alias, and not for a name the mention merely starts with', async () => {
			const item = await createItem(teacherA, [sectionA], 'assignment', 'Spec figure');
			const rig = await addFile(teacherA, item, 'rig.png');
			const longer = await addFile(teacherA, item, 'rig.png2');
			await rpc(teacherA, `public.classroom_set_assignment_spec($1::uuid, $2::jsonb)`, [
				item,
				JSON.stringify(assignmentSpec('Look at ![the rig](attachment:rig.png) first.'))
			]);

			const refused = await rpc(teacherA, `public.classroom_rename_attachment($1::uuid, 'frame.png')`, [
				rig
			]);
			expect(refused).toEqual({ ok: false, reason: 'referenced' });

			// `attachment:rig.png` is not a mention of `rig.png2`: the lookahead
			// is what keeps a prefix from counting.
			const ok = await rpc(teacherA, `public.classroom_rename_attachment($1::uuid, 'frame.png2')`, [
				longer
			]);
			expect(ok).toMatchObject({ ok: true, filename: 'frame.png2' });
		});

		it('answers referenced when a reference document mentions the alias', async () => {
			const item = await createItem(teacherA, [sectionA], 'material', 'Reference figure');
			const cover = await addFile(teacherA, item, 'cover.jpg');
			await rpc(teacherA, `public.classroom_set_reference_spec($1::uuid, $2::jsonb)`, [
				item,
				JSON.stringify(referenceSpec('The cover: ![cover](attachment:Cover.JPG)'))
			]);
			const refused = await rpc(teacherA, `public.classroom_rename_attachment($1::uuid, 'front.jpg')`, [
				cover
			]);
			expect(refused).toEqual({ ok: false, reason: 'referenced' });
		});

		it('answers taken on a sibling collision, case-insensitively, and never for its own name', async () => {
			const item = await createItem(teacherA, [sectionA], 'post', 'Collide');
			const notes = await addFile(teacherA, item, 'notes.pdf');
			await addFile(teacherA, item, 'Plan.pdf');

			const taken = await rpc(teacherA, `public.classroom_rename_attachment($1::uuid, 'plan.PDF')`, [
				notes
			]);
			expect(taken).toEqual({ ok: false, reason: 'taken' });
			expect(await filenameOf('classroom_attachments', notes)).toBe('notes.pdf');

			const self = await rpc(teacherA, `public.classroom_rename_attachment($1::uuid, 'notes.pdf')`, [
				notes
			]);
			expect(self).toMatchObject({ ok: true, filename: 'notes.pdf' });

			const free = await rpc(teacherA, `public.classroom_rename_attachment($1::uuid, 'plan v2.pdf')`, [
				notes
			]);
			expect(free).toMatchObject({ ok: true, filename: 'plan-v2.pdf' });
		});

		it('the instructor twin keeps taken and has no referenced arm', async () => {
			const item = await createItem(teacherA, [sectionA], 'post', 'Instructor files');
			const key = await addInstructorFile(teacherA, item, 'key.pdf');
			await addInstructorFile(teacherA, item, 'Rubric.pdf');
			// The same name on the STUDENT list, named by the body as a figure.
			const studentFile = await addFile(teacherA, item, 'key.pdf');
			await rpc(
				teacherA,
				`public.classroom_update_item(p_id => $1::uuid, p_title => 'Instructor files', p_body => 'See it.',
					p_body_doc => $2::jsonb)`,
				[
					item,
					JSON.stringify([
						{ type: 'p', runs: [{ text: 'See it.' }] },
						{ type: 'img', src: 'attachment:key.pdf', alt: 'The key' }
					])
				]
			);

			const taken = await rpc(
				teacherA,
				`public.classroom_rename_instructor_attachment($1::uuid, 'rubric.PDF')`,
				[key]
			);
			expect(taken).toEqual({ ok: false, reason: 'taken' });

			// BOTH DIRECTIONS on one name: the student-facing row is blocked by
			// the figure, the instructor row with the identical name is not,
			// because no body can name an instructor file.
			const blocked = await rpc(teacherA, `public.classroom_rename_attachment($1::uuid, 'k2.pdf')`, [
				studentFile
			]);
			expect(blocked).toEqual({ ok: false, reason: 'referenced' });
			const renamed = await rpc(
				teacherA,
				`public.classroom_rename_instructor_attachment($1::uuid, 'answer (key).pdf')`,
				[key]
			);
			expect(renamed).toMatchObject({ ok: true, attachment_id: key, filename: 'answer-key-.pdf' });
			expect(await filenameOf('classroom_instructor_attachments', key)).toBe('answer-key-.pdf');
		});
	});

	// -----------------------------------------------------------------------
	// THE SANITIZER UNDER UTF8, which is production's encoding and not this
	// cluster's. The Unicode whitespace members are built from chr() inside a
	// regex assembled at call time, so a mistake there is a raise from the
	// rename RPC in front of a teacher and nothing on an SQL_ASCII database
	// can see it. One UTF8 database is created on the same cluster, the
	// function's text is taken FROM THE MIGRATION FILE (a copy typed here
	// would prove the copy), and the Unicode cases are put through it against
	// the TypeScript answers. Not a second harness: no stub, no chain, one
	// pure function.
	// -----------------------------------------------------------------------
	describe('the sanitizer under a UTF8 database', () => {
		let client: pg.Client | null = null;
		let utf8Db = '';

		beforeAll(async () => {
			const cluster = inject('pgCluster');
			utf8Db = `${db.databaseName}_utf8`;
			await db.sql(
				`create database "${utf8Db}" encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0`
			);
			client = new pg.Client({
				host: cluster.host,
				port: cluster.port,
				user: cluster.user,
				password: cluster.password,
				database: utf8Db
			});
			await client.connect();
			const def = MIGRATION_0193.match(
				/create or replace function public\._classroom_attachment_filename\([\s\S]*?\n\$\$;/
			);
			if (!def) {
				throw new Error('0193 no longer defines _classroom_attachment_filename where this probe looks.');
			}
			await client.query(def[0]);
		});

		afterAll(async () => {
			await client?.end().catch(() => {});
			await db.sql(`drop database if exists "${utf8Db}" with (force)`).catch(() => {});
		});

		it('agrees with the record route on Unicode whitespace, the BOM, a non-ASCII letter and the UTF-16 cap', async () => {
			const enc = await client!.query<{ e: string }>("select current_setting('server_encoding') as e");
			expect(enc.rows[0].e).toBe('UTF8');

			const names = [
				'Screenshot 2026-09-09 at 10.12.03\u202fAM.png',
				'\u00a0Bridge\u00a0lab.png\u00a0',
				'\ufeffname.png',
				'\u3000ideographic\u2003em\u2009thin\u2028line.png',
				'\u00e9 (1).png',
				'\u{1F600}'.repeat(151),
				'  Bridge lab (final) [v2].png  ',
				'\t\n  \n',
				'--- a  b ---',
				'x'.repeat(320) + '.png'
			];
			const expected = names.map(recordedAttachmentFilename);
			// Pinned by hand as well, so a TypeScript regression cannot drag the
			// expectation along with it.
			expect(expected.slice(0, 6)).toEqual([
				'Screenshot-2026-09-09-at-10.12.03-AM.png',
				'Bridge-lab.png',
				'name.png',
				'ideographic-em-thin-line.png',
				'\u00e9-1-.png',
				'\u{1F600}'.repeat(150)
			]);

			const { rows } = await client!.query<{ n: string }>(
				'select public._classroom_attachment_filename(x) as n from unnest($1::text[]) as x',
				[names]
			);
			expect(rows.map((r) => r.n)).toEqual(expected);
			expect(rows).toHaveLength(10);
		});
	});

	// -----------------------------------------------------------------------
	// Who may call. A student and a teacher who manages a DIFFERENT section
	// are refused by every RPC; the managing teacher is the positive control
	// for every one of them. Ten refusals, five successes, counted.
	// -----------------------------------------------------------------------
	describe('authorization', () => {
		it('refuses a student and a non-managing teacher on all five RPCs; the managing teacher succeeds on all five', async () => {
			const item = await createItem(teacherA, [sectionA], 'post', 'Gated');
			const file = await addFile(teacherA, item, 'gated.png');
			const ifile = await addInstructorFile(teacherA, item, 'gated-key.pdf');

			const calls: Array<[string, unknown[]]> = [
				[`public.classroom_set_item_layout($1::uuid, 'top', 'top')`, [item]],
				[`public.classroom_set_attachment_order($1::uuid, $2::uuid[])`, [item, [file]]],
				[`public.classroom_set_instructor_attachment_order($1::uuid, $2::uuid[])`, [item, [ifile]]],
				[`public.classroom_rename_attachment($1::uuid, 'renamed.png')`, [file]],
				[`public.classroom_rename_instructor_attachment($1::uuid, 'renamed-key.pdf')`, [ifile]]
			];

			let refusals = 0;
			for (const who of [student, teacherB]) {
				for (const [call, params] of calls) {
					const err = await captureError(() => rpc(who, call, params));
					expect(err.message).toMatch(/Only the teacher of record/);
					refusals += 1;
				}
			}
			expect(refusals).toBe(10);

			// Nothing landed from the refused calls.
			expect(await placementOf(item)).toEqual({ files: 'bottom', links: 'bottom' });
			expect(await filenameOf('classroom_attachments', file)).toBe('gated.png');
			expect(await filenameOf('classroom_instructor_attachments', ifile)).toBe('gated-key.pdf');

			let successes = 0;
			for (const [call, params] of calls) {
				const r = await rpc<{ ok: boolean }>(teacherA, call, params);
				expect(r.ok).toBe(true);
				successes += 1;
			}
			expect(successes).toBe(5);
			expect(await placementOf(item)).toEqual({ files: 'top', links: 'top' });
			expect(await filenameOf('classroom_attachments', file)).toBe('renamed.png');
			expect(await filenameOf('classroom_instructor_attachments', ifile)).toBe('renamed-key.pdf');
		});

		it('a signed-out caller cannot execute any of them: the ACL, read from the catalog', async () => {
			// ASSERT THE ACL, NOT THE SELF-CHECK'S VERDICT. The migration's own
			// guard passing says the guard ran; `has_function_privilege` says
			// what is actually granted, under the hosted default privileges the
			// stub carries (the ones that hand every new function to anon).
			const publicFns = [
				'public.classroom_set_item_layout(uuid, text, text)',
				'public.classroom_set_attachment_order(uuid, uuid[])',
				'public.classroom_set_instructor_attachment_order(uuid, uuid[])',
				'public.classroom_rename_attachment(uuid, text)',
				'public.classroom_rename_instructor_attachment(uuid, text)'
			];
			const { rows } = await db.sql<{
				fn: string;
				anon: boolean;
				authed: boolean;
				service: boolean;
			}>(
				`select fn,
					has_function_privilege('anon', fn, 'execute') as anon,
					has_function_privilege('authenticated', fn, 'execute') as authed,
					has_function_privilege('service_role', fn, 'execute') as service
				 from unnest($1::text[]) as fn`,
				[publicFns]
			);
			expect(rows).toHaveLength(5);
			for (const r of rows) {
				expect(r.anon, r.fn).toBe(false);
				expect(r.authed, r.fn).toBe(true);
				expect(r.service, r.fn).toBe(false);
			}

			// The re-created duplicate keeps 0159's partition: anon closed,
			// authenticated open. `create or replace` RETAINS an existing
			// function's ACL, so this is not testing a re-grant; it is read back
			// from the catalog so a lost grant statement would redden here.
			const dup = await db.sql<{ anon: boolean; authed: boolean }>(
				`select has_function_privilege('anon', 'public.classroom_duplicate_item(uuid, uuid[])', 'execute') as anon,
				        has_function_privilege('authenticated', 'public.classroom_duplicate_item(uuid, uuid[])', 'execute') as authed`
			);
			expect(dup.rows[0]).toEqual({ anon: false, authed: true });

			// The private helpers are granted to no client role at all.
			const priv = await db.sql<{ fn: string; anon: boolean; authed: boolean }>(
				`select fn,
					has_function_privilege('anon', fn, 'execute') as anon,
					has_function_privilege('authenticated', fn, 'execute') as authed
				 from unnest(array[
					'public._classroom_attachment_filename(text)',
					'public._classroom_attachment_referenced(uuid, text)'
				 ]) as fn`
			);
			expect(priv.rows).toHaveLength(2);
			for (const r of priv.rows) {
				expect(r.anon, r.fn).toBe(false);
				expect(r.authed, r.fn).toBe(false);
			}

			// One arity each: no overload survived to be resolved instead.
			const arities = await db.sql<{ proname: string; n: string }>(
				`select p.proname, count(*)::text as n
				 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
				 where ns.nspname = 'public' and p.proname in (
					'classroom_set_item_layout', 'classroom_set_attachment_order',
					'classroom_set_instructor_attachment_order', 'classroom_rename_attachment',
					'classroom_rename_instructor_attachment', 'classroom_duplicate_item',
					'_classroom_attachment_filename', '_classroom_attachment_referenced')
				 group by p.proname order by p.proname`
			);
			expect(arities.rows).toHaveLength(8);
			expect(arities.rows.every((r) => r.n === '1')).toBe(true);

			// And the anon role really cannot call one: the behavioural twin of
			// the ACL read, so a wrong catalog reading cannot pass alone.
			const err = await captureError(() =>
				db.asAnon((q: QueryFn) =>
					q(`select public.classroom_set_item_layout($1::uuid, 'top', 'top')`, [oldItem])
				)
			);
			expect(err.message).toMatch(/permission denied/i);
		});
	});
});
