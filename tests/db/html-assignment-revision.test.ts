// tests/db/html-assignment-revision.test.ts
//
// RE-UPLOADING A PORTED HTML ASSIGNMENT, AND WHAT IT DOES TO THE ANSWERS
// ALREADY STORED. Against a REAL embedded Postgres with the REAL migration
// files applied unmodified, through the REAL RPCs, as the REAL roles (`asUser`
// -- SET ROLE authenticated with the JWT claims GUC, what PostgREST does).
//
// ===========================================================================
// WHY THIS FILE EXISTS
// ===========================================================================
//
// A BLOCK ID IS THE JOIN KEY FOR EVERY STORED ANSWER. A `classroom_responses`
// row names an item and a `block_id` and nothing else about the document, so a
// re-upload whose manifest RENAMES an id does not move the answers under it and
// does not delete them: the rows stay exactly where they were and stop being
// reachable, because no block in the new document carries that id.
//
// NOTHING ANYWHERE REPORTS THAT. No error, no empty row, no warning -- the
// worksheet renders perfectly and a term of work is gone from the screen. It is
// the exact shape this repository writes rules about, and the only defence is a
// diff taken BEFORE the write with a count that came from the table.
//
// ===========================================================================
// WHERE THE EXPECTED VALUES COME FROM
// ===========================================================================
//
// THE COUNTS ARE NOT DERIVED FROM THE THING UNDER TEST. Each student's answers
// are written one at a time through `classroom_save_response` and the number
// expected is the number of `it`-level writes this file made -- typed out, not
// computed by the code being measured. The counter under test then reads
// `classroom_responses` itself, and the two are compared. `assessHtmlReupload`
// is given that real counter, so the sentence asserted at the end is the
// sentence a teacher would actually read, with the database's own figure in it.
//
// THE ORPHANING IS MEASURED RATHER THAN ARGUED: the rows are read back off the
// table after the re-upload and PRINTED, so "still stored, no longer reachable"
// is a reading and not a claim.
//
// THREE SHAPES, WHICH IS THE WHOLE POINT OF THE FILE:
//   1. a CLEAN re-upload, every id kept -> nothing orphans, one press
//   2. a RENAMED id -> the true count, and the post is HELD
//   3. an ADDED block -> nothing lost, one press
//
// A POSITIVE CONTROL SITS BESIDE THE EXCLUSIONS. Shape 2's assertion that the
// count is 3 would pass vacuously against a counter that always answered 3, so
// shape 1 and shape 3 assert 0 against the same counter on the same database,
// and shape 2 asserts that the rows are still physically there.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './harness';
import {
	assessHtmlReupload,
	htmlManifestDiff,
	type CountHtmlOrphans
} from '../../src/lib/classroom/html-assignment/store';
import type { HtmlAssignmentManifest } from '../../src/lib/classroom/html-assignment/manifest';

/** The classroom chain through 0197, in production order. 0128 is in it because
    `classroom_set_html_assignment` runs over a schema this file seeds through
    the real classroom RPCs, and the chain is kept whole rather than pruned to
    what one assertion happens to touch. The INSTRUCTOR-COPY gate that used to
    be probed at the foot of this file has moved to
    `tests/db/html-assignment-instructor-gate.test.ts`, which measures it
    against 0199 rather than recording that it was shut. */
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
	'0104_classroom_edit_visibility.sql',
	'0108_classroom_rich_body.sql',
	'0109_classroom_scheduled_posting.sql',
	'0110_classroom_content_revisions.sql',
	'0122_rich_text_nested_lists.sql',
	'0128_classroom_instructor_copy.sql',
	'0133_classroom_storage_attachments.sql',
	'0134_classroom_submission_open_race.sql',
	'0135_classroom_instructor_storage_and_public_attachments.sql',
	'0137_anon_execute_sweep.sql',
	'0176_classroom_item_images.sql',
	'0195_classroom_html_assignments.sql',
	'0197_classroom_html_assignment_write_gate.sql'
] as const;

// ---------------------------------------------------------------------------
// A manifest built from a list of block ids, so a re-upload is one argument
// different from the document it replaces and the DIFF is the only variable.
// ---------------------------------------------------------------------------
function manifest(ids: string[], title = 'Bench setup'): HtmlAssignmentManifest {
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title,
		course: 'IDEA100',
		points: ids.length * 2,
		header: [{ id: 'who', field: 'studentName', type: 'text' }],
		modules: ids.map((id, i) => ({
			id: `m${i + 1}`,
			title: `Step ${i + 1}`,
			points: 2,
			audience: 'individual' as const,
			blocks: [{ id, field: `f${i + 1}`, type: 'longText' as const, minSentences: 1 }],
			criteria: [
				{
					id: `m${i + 1}-c`,
					text: `Step ${i + 1} is recorded with the measurement behind it`,
					points: 2,
					levels: [
						{ points: 2, label: 'Complete', short: 'Recorded', descriptor: 'States what was done and the value behind it.' },
						{ points: 1, label: 'Developing', short: 'Partly', descriptor: 'States what was done with no value behind it.' },
						{ points: 0, label: 'Absent', short: 'Not done', descriptor: 'Not attempted.' }
					]
				}
			]
		}))
	} as HtmlAssignmentManifest;
}

/** The document carrying that manifest, with a `[data-field]` for every field
    it declares -- which is what the importer requires of a real one. */
function documentFor(m: HtmlAssignmentManifest): string {
	const fields = [
		...(m.header ?? []).map((b) => b.field),
		...m.modules.flatMap((mod) => mod.blocks.map((b) => b.field))
	];
	return [
		'<!doctype html>',
		`<html><head><title>${m.title}</title></head><body>`,
		`  <h1>${m.title}</h1>`,
		'  <form>',
		...fields.map((f) => `    <input data-field="${f}">`),
		'  </form>',
		`  <script type="application/json" id="idea-manifest">${JSON.stringify(m)}<\/script>`,
		'</body></html>'
	].join('\n');
}

const say = (line: string) => console.log(`    [revision] ${line}`);

describe('0154: re-uploading a ported HTML assignment over stored answers', () => {
	let db: TestDb;
	let admin: SeededUser;
	let teacher: SeededUser;
	const students: SeededUser[] = [];
	let section: string;

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

	async function createAssignment(title: string): Promise<string> {
		const r = await rpc<{ item_id: string }>(
			teacher,
			`public.classroom_create_item(
				p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => $2,
				p_body => 'Bench body.', p_points => 100, p_published => true)`,
			[[section], title]
		);
		return r.item_id;
	}

	async function upload(itemId: string, m: HtmlAssignmentManifest, filename: string) {
		return rpc<{ ok: boolean; document_id: string; revision: number | null }>(
			admin,
			'public.classroom_set_html_assignment($1::uuid,$2,$3::jsonb,$4)',
			[itemId, documentFor(m), JSON.stringify(m), filename]
		);
	}

	/** Every `block_id` actually stored against the item, read straight off the
	    table as the connection owner -- the physical truth, with RLS out of the
	    way entirely, so nothing but the rows themselves can be what answers. */
	async function storedBlocks(itemId: string): Promise<string[]> {
		const { rows } = await db.sql<{ block_id: string }>(
			'select block_id from public.classroom_responses where item_id = $1 order by block_id, student_email',
			[itemId]
		);
		return rows.map((r) => r.block_id);
	}

	/**
	 * THE REAL COUNTER, the same two reads the item route's transport makes, run
	 * as a MANAGER because that is who is about to re-upload. A count taken as
	 * the connection owner would bypass RLS and could report rows the person
	 * pressing the button cannot see.
	 */
	const counter: CountHtmlOrphans = async (itemId, blockIds) => {
		if (!blockIds.length) return { ok: true, responses: 0, files: 0 };
		return db.asUser(teacher.id, async (q) => {
			const responses = await q<{ n: string }>(
				'select count(*)::text as n from public.classroom_responses where item_id = $1 and block_id = any($2::text[])',
				[itemId, blockIds]
			);
			const files = await q<{ n: string }>(
				`select count(*)::text as n from public.classroom_submission_files f
				 join public.classroom_submissions s on s.id = f.submission_id
				 where s.item_id = $1 and f.block_id = any($2::text[])`,
				[itemId, blockIds]
			);
			return {
				ok: true as const,
				responses: Number(responses.rows[0].n),
				files: Number(files.rows[0].n)
			};
		});
	};

	beforeAll(async () => {
		db = await startTestDb(CHAIN);
		admin = await createUser(db, 'apina@boscotech.edu', 'A. Pina');
		teacher = await createUser(db, 'reyes@boscotech.edu', 'A. Reyes');
		await db.sql(
			'insert into public.app_admins (email, granted_by) values ($1, $1) on conflict do nothing',
			[admin.email]
		);
		section = await createClassroomSection(db, {
			as: admin,
			courseCode: 'IDEA100',
			courseTitle: 'Introduction to Engineering',
			label: 'Period 3',
			teacherEmail: teacher.email
		});
		// THREE students, so shape 2's count is a number no single student could
		// produce on their own and "3 answers" cannot be confused with "3 blocks".
		for (const [email, name] of [
			['ana.perez@boscotech.net', 'Ana Perez'],
			['luis.ortiz@boscotech.net', 'Luis Ortiz'],
			['mia.chen@boscotech.net', 'Mia Chen']
		]) {
			const s = await createUser(db, email, name);
			await enrollStudent(db, { as: teacher, sectionId: section, email, displayName: name });
			students.push(s);
		}
	}, 300000);

	afterAll(async () => {
		await db?.stop();
	});

	// -----------------------------------------------------------------------
	// SHAPE 1: a clean re-upload. Every id kept, every answer kept.
	// -----------------------------------------------------------------------
	describe('shape 1: a corrected document that keeps every block id', () => {
		let item: string;
		let firstDocumentId: string;

		beforeAll(async () => {
			item = await createAssignment('Bench setup (clean re-upload)');
			const first = await upload(item, manifest(['b-setup', 'b-reading']), 'bench-v1.html');
			expect(first.ok).toBe(true);
			firstDocumentId = first.document_id;
			// Six answers: three students x two blocks. TYPED OUT, not computed.
			for (const s of students) {
				for (const b of ['b-setup', 'b-reading']) {
					const res = await rpc<{ ok: boolean }>(
						s,
						'public.classroom_save_response($1::uuid,$2,$3::jsonb)',
						[item, b, JSON.stringify({ text: 'The vise was square to the table.' })]
					);
					expect(res.ok).toBe(true);
				}
			}
			say(`shape 1 seeded: ${(await storedBlocks(item)).length} answers across 2 blocks`);
		}, 300000);

		it('is accepted, keeps the same document id, and mints a revision', async () => {
			const again = await upload(
				item,
				manifest(['b-setup', 'b-reading'], 'Bench setup, corrected'),
				'bench-v2.html'
			);
			say(`re-upload: ok=${again.ok} revision=${again.revision} sameDocumentId=${again.document_id === firstDocumentId}`);
			expect(again.ok).toBe(true);
			// THE SAME DOCUMENT ID, which is what keeps the frame src from moving
			// out from under a reader mid-worksheet.
			expect(again.document_id).toBe(firstDocumentId);
			expect(again.revision).toBe(1);
		});

		it('keeps every stored answer, and the diff says so before the write', async () => {
			const blocks = await storedBlocks(item);
			say(`after re-upload: ${blocks.length} answers, blocks ${[...new Set(blocks)].join(', ')}`);
			expect(blocks).toHaveLength(6);

			const diff = htmlManifestDiff(manifest(['b-setup', 'b-reading']), manifest(['b-setup', 'b-reading']));
			expect(diff).not.toBeNull();
			// THE HEADER IS IN THE DIFF. `who` is a block id like any other and a
			// diff that skipped it would report a renamed identity field as nothing.
			expect(diff!.kept.sort()).toEqual(['b-reading', 'b-setup', 'who']);
			expect(diff!.removed).toEqual([]);
			expect(diff!.added).toEqual([]);

			const risk = await assessHtmlReupload(item, manifest(['b-setup', 'b-reading']), manifest(['b-setup', 'b-reading']), counter);
			say(`shape 1 verdict: needsConfirmation=${risk.needsConfirmation} counts=${JSON.stringify(risk.counts)}`);
			say(`shape 1 says: ${risk.lines.join(' | ')}`);
			// ONE PRESS. A re-upload that orphans nothing must not ask, or the
			// question becomes one people click through on the day it matters.
			expect(risk.needsConfirmation).toBe(false);
			expect(risk.confirmLabel).toBeNull();
			expect(risk.counts).toEqual({ responses: 0, files: 0 });
		});
	});

	// -----------------------------------------------------------------------
	// SHAPE 2: a renamed id. The true count, and the post is held.
	// -----------------------------------------------------------------------
	describe('shape 2: a document that renames an answer block id', () => {
		let item: string;

		beforeAll(async () => {
			item = await createAssignment('Bench setup (renamed block)');
			await upload(item, manifest(['b-setup', 'b-reading']), 'bench-v1.html');
			// SIX answers again, THREE of them under the block about to be renamed.
			// Three is the number this file wrote; it is not computed from anything
			// under test.
			for (const s of students) {
				for (const b of ['b-setup', 'b-reading']) {
					await rpc(s, 'public.classroom_save_response($1::uuid,$2,$3::jsonb)', [
						item,
						b,
						JSON.stringify({ text: 'The first pass read 2.50 mm.' })
					]);
				}
			}
		}, 300000);

		it('reports the TRUE count of answers that would stop rendering', async () => {
			const risk = await assessHtmlReupload(
				item,
				manifest(['b-setup', 'b-reading']),
				manifest(['b-setup', 'b-passes']),
				counter
			);
			say(`shape 2 verdict: needsConfirmation=${risk.needsConfirmation} counts=${JSON.stringify(risk.counts)}`);
			say(`shape 2 says: ${risk.lines.join(' | ')}`);
			say(`shape 2 confirm reads: "${risk.confirmLabel}"`);
			expect(risk.diff!.removed).toEqual(['b-reading']);
			expect(risk.diff!.added).toEqual(['b-passes']);
			// THREE. One per student, under the one renamed block -- counted from
			// `classroom_responses` by the counter, compared against the number of
			// writes this file made.
			expect(risk.counts).toEqual({ responses: 3, files: 0 });
			expect(risk.needsConfirmation).toBe(true);
			// THE CONFIRMATION NAMES THE COUNT. "Are you sure?" is the sentence
			// this repository refuses to ship.
			expect(risk.confirmLabel).toBe('Replace the document and orphan 3 answers');
			expect(risk.lines.join(' ')).toContain('b-reading');
		});

		it('orphans them silently when it goes through, which is why the count exists', async () => {
			const before = await storedBlocks(item);
			const again = await upload(item, manifest(['b-setup', 'b-passes']), 'bench-v2.html');
			expect(again.ok).toBe(true);
			const after = await storedBlocks(item);
			say(`before: ${before.join(', ')}`);
			say(`after:  ${after.join(', ')}`);
			// THE ROWS ARE STILL THERE. Nothing deleted them, nothing moved them,
			// and nothing raised -- they are simply no longer reachable from any
			// block the new document declares. This is the measurement the whole
			// confirmation exists for, and it is read off the table.
			expect(after).toEqual(before);
			expect(after.filter((b) => b === 'b-reading')).toHaveLength(3);
			// And the new document's own block has nothing under it.
			expect(after.filter((b) => b === 'b-passes')).toHaveLength(0);
			say('3 answers are still stored under "b-reading" and no block in the new document carries that id');
		});

		it('a count that cannot be taken is NOT a zero', async () => {
			// FAIL CLOSED. "Cannot tell" must never render as "nothing at risk",
			// which is the same rule `htmlAssignmentMount` follows about which
			// engine an item is. Asserted against the SAME database and the SAME
			// manifests that produced a real count above, so this cannot pass
			// because the fixture happens to be empty.
			const broken: CountHtmlOrphans = async () => ({ ok: false, message: 'the read was refused' });
			const risk = await assessHtmlReupload(
				item,
				manifest(['b-setup', 'b-reading']),
				manifest(['b-setup', 'b-passes']),
				broken
			);
			say(`shape 2 with a failing counter: needsConfirmation=${risk.needsConfirmation} counts=${JSON.stringify(risk.counts)}`);
			expect(risk.needsConfirmation).toBe(true);
			expect(risk.counts).toBeNull();
			expect(risk.lines.join(' ')).toContain('could not be');
			// And with NO counter at all, which is the absent-transport case.
			const none = await assessHtmlReupload(
				item,
				manifest(['b-setup', 'b-reading']),
				manifest(['b-setup', 'b-passes']),
				null
			);
			expect(none.needsConfirmation).toBe(true);
			expect(none.counts).toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// SHAPE 3: an added block. Nothing at risk.
	// -----------------------------------------------------------------------
	describe('shape 3: a document that adds an answer block', () => {
		let item: string;

		beforeAll(async () => {
			item = await createAssignment('Bench setup (added block)');
			await upload(item, manifest(['b-setup', 'b-reading']), 'bench-v1.html');
			for (const s of students) {
				for (const b of ['b-setup', 'b-reading']) {
					await rpc(s, 'public.classroom_save_response($1::uuid,$2,$3::jsonb)', [
						item,
						b,
						JSON.stringify({ text: 'I shimmed the fixture.' })
					]);
				}
			}
		}, 300000);

		it('lands with nothing lost and asks for no second press', async () => {
			const risk = await assessHtmlReupload(
				item,
				manifest(['b-setup', 'b-reading']),
				manifest(['b-setup', 'b-reading', 'b-fix']),
				counter
			);
			say(`shape 3 verdict: needsConfirmation=${risk.needsConfirmation} counts=${JSON.stringify(risk.counts)}`);
			say(`shape 3 says: ${risk.lines.join(' | ')}`);
			expect(risk.diff!.added).toEqual(['b-fix']);
			expect(risk.diff!.removed).toEqual([]);
			expect(risk.needsConfirmation).toBe(false);
			expect(risk.confirmLabel).toBeNull();

			const before = await storedBlocks(item);
			const again = await upload(item, manifest(['b-setup', 'b-reading', 'b-fix']), 'bench-v2.html');
			expect(again.ok).toBe(true);
			const after = await storedBlocks(item);
			say(`shape 3 answers: ${before.length} before, ${after.length} after`);
			expect(after).toEqual(before);
			expect(after).toHaveLength(6);

			// AND THE NEW BLOCK ACCEPTS A WRITE, which is what makes "nothing at
			// risk" a statement about a working document rather than about an
			// unreachable one.
			const res = await rpc<{ ok: boolean }>(
				students[0],
				'public.classroom_save_response($1::uuid,$2,$3::jsonb)',
				[item, 'b-fix', JSON.stringify({ text: 'The next part came in at 2.50 mm.' })]
			);
			expect(res.ok).toBe(true);
			expect(await storedBlocks(item)).toHaveLength(7);
			say('the added block took an answer: 7 rows');
		});
	});

	// -----------------------------------------------------------------------
	// A STORED MANIFEST THAT CANNOT BE WALKED
	// -----------------------------------------------------------------------
	it('answers null for a stored manifest it cannot read, and never an empty diff', () => {
		// NULL IS NOT `{kept:[],removed:[],added:[]}`. An empty diff would read as
		// "nothing is at risk" on exactly the input where nothing is known.
		expect(htmlManifestDiff(null, manifest(['b-one']))).toBeNull();
		expect(htmlManifestDiff('not a manifest', manifest(['b-one']))).toBeNull();
		expect(htmlManifestDiff({ modules: 'not an array' }, manifest(['b-one']))).toBeNull();
		expect(htmlManifestDiff({ modules: [{ blocks: [{ id: 7 }] }] }, manifest(['b-one']))).toBeNull();
		// The positive control: a manifest it CAN walk answers a diff, so the
		// four nulls above are not this function answering null for everything.
		expect(htmlManifestDiff(manifest(['b-one']), manifest(['b-one']))).not.toBeNull();
	});
});
