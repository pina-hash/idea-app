// tests/db/html-assignment-round-trip.test.ts
//
// CAN A STUDENT FILL IN A PORTED HTML ASSIGNMENT, ADD A PHOTOGRAPH, RELOAD, AND
// GET EVERY ANSWER BACK? Against a REAL embedded Postgres with the REAL
// migration files applied unmodified, through the REAL RPCs, as the REAL
// student role (`asUser` -- SET ROLE authenticated with the JWT claims GUC, what
// PostgREST does).
//
// PROVING ONLY THE WRITE IS HALF A TEST. A save that lands and a reload that
// returns nothing is exactly the failure a ported document has: it looks
// perfect all afternoon and opens empty the next morning. So every value is
// written, read back through the read path, put through the parent's own
// restore functions, and PRINTED -- the whole `idea:state` message a document
// would receive, not a count of rows.
//
// ===========================================================================
// WHAT THIS FILE MEASURED, AND IT IS THE FINDING OF THE BUNDLE
// ===========================================================================
//
// **`classroom_save_response` CANNOT WRITE AN ANSWER FOR A PORTED DOCUMENT AS
// THE SCHEMA STANDS.** Its first statement reads `classroom_assignment_specs`
// for the item and raises `This assignment has no interactive spec.` when there
// is none, and then resolves `p_block_id` against THAT SPEC's modules. A ported
// assignment carries a MANIFEST in `classroom_html_assignments` (0195) and no
// spec, so every save raises -- and `classroom_add_submission_file` carries the
// identical gate on its `p_block_id` path, so a block-bound photograph raises
// too. 0195's own header says an answer is an ordinary `classroom_responses`
// row and that nothing about one moves; that is true of the READ side and of
// grading, and it is not true of the WRITE gate, which nothing widened.
//
// `describe('as a ported assignment actually is')` BELOW IS THAT MEASUREMENT,
// asserted rather than merely reported, so the day somebody widens the gate
// this file goes red and says so.
//
// `describe('with a companion spec')` IS THE SAME SIX MODULES AND THE SAME
// PHOTOGRAPH ON AN ITEM THAT ALSO CARRIES A SPEC. That is a legal database
// state -- nothing forbids an item holding both -- and it exists here for ONE
// reason: to show that everything downstream of the gate already works, so the
// repair is one branch in one function and not a feature. It is a CONTRIVANCE
// and is labelled as one; it is not how a ported assignment is posted.
//
// ===========================================================================
// WHERE THE EXPECTED VALUES COME FROM
// ===========================================================================
//
// The six answers are strings this file types out. What is read back is read
// from the database with plain selects under RLS, as the student, and compared
// against those strings -- never against anything the controller derived. The
// restore functions are then given the REAL rows, so the printed state message
// is the one a real document would receive.

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
	hxImagesFromFiles,
	hxIncompleteBlocks,
	hxStoredValue,
	hxSubmitRefusal,
	hxValuesFromResponses
} from '../../src/lib/classroom/html-assignment/answers';
import { isScheduled } from '../../src/lib/classroom/classroom';
import type { SubmissionFileRow } from '../../src/lib/classroom/assignment-spec';
import type { HtmlAssignmentManifest } from '../../src/lib/classroom/html-assignment/manifest';

/**
 * The classroom chain through 0195, in production order. 0137 (the anon execute
 * sweep) sits where it sits in production; 0195 follows it and revokes for
 * itself, which is the state a real deployment is in.
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
	'0104_classroom_edit_visibility.sql',
	'0108_classroom_rich_body.sql',
	'0109_classroom_scheduled_posting.sql',
	'0110_classroom_content_revisions.sql',
	'0122_rich_text_nested_lists.sql',
	'0133_classroom_storage_attachments.sql',
	'0135_classroom_instructor_storage_and_public_attachments.sql',
	'0137_anon_execute_sweep.sql',
	'0176_classroom_item_images.sql',
	'0195_classroom_html_assignments.sql'
] as const;

// ---------------------------------------------------------------------------
// SIX MODULES, as a real ported worksheet has. Built by hand from the contract
// and from IDEA_RUBRIC_STANDARDS: each module carries one criterion worth its
// own points with three descending levels, a top level at the maximum and a
// bottom level at zero.
// ---------------------------------------------------------------------------

interface Answer {
	blockId: string;
	field: string;
	/** What the student types. Six strings and one checkbox. */
	value: string | boolean;
}

const ANSWERS: Answer[] = [
	{ blockId: 'm1-setup', field: 'setup', value: 'The vise was square to the table. I checked it with a machinist square.' },
	// COUNTED BY HAND, AND THE FIRST DRAFT OF THIS LINE WAS WRONG, which is the
	// counter doing its job: "It read 2.50 mm on the first pass and 2.51 mm on
	// the second." is ONE sentence, because `countSentences` protects a decimal
	// point. A second counter written for this feature would have scored it four.
	{ blockId: 'm2-reading', field: 'reading', value: 'The first pass read 2.50 mm. The second read 2.51 mm.' },
	{ blockId: 'm3-tool', field: 'toolChoice', value: 'I used the 6 mm end mill. The 3 mm one would have deflected.' },
	{ blockId: 'm4-error', field: 'errorSource', value: 'Most of the error came from the fixture. The stock itself was flat.' },
	{ blockId: 'm5-fix', field: 'fix', value: 'I shimmed the fixture. The next part came in at 2.50 mm.' },
	{ blockId: 'm6-done', field: 'checkedOff', value: true }
];

const IMAGE_BLOCK = 'm6-shot';
const IMAGE_FIELD = 'benchPhoto';

function manifest(): HtmlAssignmentManifest {
	const modules = [
		{ id: 'm1', title: 'Set the vise', blockId: 'm1-setup', field: 'setup' },
		{ id: 'm2', title: 'Take the reading', blockId: 'm2-reading', field: 'reading' },
		{ id: 'm3', title: 'Choose the tool', blockId: 'm3-tool', field: 'toolChoice' },
		{ id: 'm4', title: 'Find the error', blockId: 'm4-error', field: 'errorSource' },
		{ id: 'm5', title: 'Fix it', blockId: 'm5-fix', field: 'fix' },
		{ id: 'm6', title: 'Show the bench', blockId: 'm6-done', field: 'checkedOff' }
	].map((m, i) => ({
		id: m.id,
		title: m.title,
		points: 2,
		audience: 'individual' as const,
		blocks:
			i === 5
				? [
						{ id: m.blockId, field: m.field, type: 'checkbox' as const },
						{ id: IMAGE_BLOCK, field: IMAGE_FIELD, type: 'image' as const }
					]
				: [{ id: m.blockId, field: m.field, type: 'longText' as const, minSentences: 2 }],
		criteria: [
			{
				id: `${m.id}-c`,
				text: `${m.title} is recorded with the measurement behind it`,
				points: 2,
				levels: [
					{ points: 2, label: 'Complete', short: 'Recorded and backed', descriptor: 'States what was done and the value behind it.' },
					{ points: 1, label: 'Developing', short: 'Recorded only', descriptor: 'States what was done with no value behind it.' },
					{ points: 0, label: 'Absent', short: 'Not recorded', descriptor: 'Not attempted.' }
				]
			}
		]
	}));
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Bench setup',
		course: 'IDEA100',
		points: 12,
		header: [{ id: 'who', field: 'studentName', type: 'text' }],
		modules
	};
}

/** The document carrying that manifest, with a `[data-field]` for every field
    the manifest declares -- which is what the importer requires of a real one. */
function documentFor(m: HtmlAssignmentManifest): string {
	const fields = [
		...(m.header ?? []).map((b) => b.field),
		...m.modules.flatMap((mod) => mod.blocks.map((b) => b.field))
	];
	const inputs = fields.map((f) => `    <input data-field="${f}">`).join('\n');
	return [
		'<!doctype html>',
		'<html><head><title>Bench setup</title></head><body>',
		'  <h1>Bench setup</h1>',
		'  <form>',
		inputs,
		'  </form>',
		`  <script type="application/json" id="idea-manifest">${JSON.stringify(m)}<\/script>`,
		'</body></html>'
	].join('\n');
}

/**
 * THE COMPANION SPEC. The SAME block ids as the manifest, so a save through
 * `classroom_save_response` resolves. See the header: a contrivance, present
 * only so the read half can be measured on the far side of the write gate.
 */
function companionSpec() {
	return {
		schemaVersion: 1,
		meta: { assignmentId: 'bench-1', title: 'Bench setup', totalPoints: 12 },
		modules: manifest().modules.map((mod) => ({
			id: mod.id,
			title: mod.title,
			points: 2,
			blocks: mod.blocks.map((b) =>
				b.type === 'image'
					? { type: 'imageZone', id: b.id, minImages: 1, captions: true }
					: b.type === 'checkbox'
						// A CHECKLIST OF ONE. `classroom_save_response` takes a typed
						// response only for textField, table and checklist, and a
						// textField carrying a sentence floor can never be satisfied by
						// a tick -- which the first draft of this fixture proved by
						// refusing the submit.
						? { type: 'checklist', id: b.id, items: ['Bench photographed'] }
						: { type: 'textField', id: b.id, prompt: mod.title, minSentences: 1 }
			),
			rubric: [
				{
					id: `${mod.id}-c`,
					criterion: mod.title,
					levels: [
						{ points: 2, label: 'Complete', descriptor: 'States what was done and the value behind it.' },
						{ points: 1, label: 'Developing', descriptor: 'States what was done with no value.' },
						{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
					]
				}
			]
		}))
	};
}

const say = (line: string) => console.log(`    [round-trip] ${line}`);

describe('0195: a ported HTML assignment, written and read back', () => {
	let db: TestDb;
	let admin: SeededUser;
	let teacher: SeededUser;
	let student: SeededUser;
	let section: string;
	/** The item posted the way a ported assignment actually is: manifest only. */
	let portedItem: string;
	/** The same document on an item that ALSO carries a spec. A contrivance. */
	let bothItem: string;
	let portedDocumentId: string;
	const html = documentFor(manifest());

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

	/** The refusal an RPC raised, or null. The MESSAGE is the measurement. */
	async function refusal(
		user: SeededUser,
		call: string,
		params: unknown[] = []
	): Promise<string | null> {
		try {
			await rpc(user, call, params);
			return null;
		} catch (e) {
			return (e as Error).message;
		}
	}

	async function createAssignment(title: string): Promise<string> {
		const r = await rpc<{ item_id: string }>(
			teacher,
			`public.classroom_create_item(
				p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => $2,
				p_body => $3, p_points => 12, p_published => true)`,
			[[section], title, `${title} body.`]
		);
		return r.item_id;
	}

	/** The student's own read path: RLS-scoped selects with NO identity filter,
	    the same columns `loadStudentEngineData` asks for. The policy IS the
	    filter, so a second copy written here as a `where` would be the thing
	    that stops matching. */
	async function readBack(itemId: string) {
		return db.asUser(student.id, async (q) => {
			const responses = await q<{ block_id: string; value: Record<string, unknown> }>(
				'select block_id, value from public.classroom_responses where item_id = $1 order by block_id',
				[itemId]
			);
			const files = await q<SubmissionFileRow>(
				`select f.id, f.submission_id, f.block_id, f.caption, f.filename, f.mime_type,
				        f.size_bytes, f.sort_order, f.storage_key
				 from public.classroom_submission_files f
				 join public.classroom_submissions s on s.id = f.submission_id
				 where s.item_id = $1
				 order by f.sort_order`,
				[itemId]
			);
			return { responses: responses.rows, files: files.rows };
		});
	}

	beforeAll(async () => {
		db = await startTestDb(CHAIN);
		admin = await createUser(db, 'apina@boscotech.edu', 'A. Pina');
		teacher = await createUser(db, 'reyes@boscotech.edu', 'A. Reyes');
		student = await createUser(db, 'ana.perez@boscotech.net', 'Ana Perez');
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
		await enrollStudent(db, {
			as: teacher,
			sectionId: section,
			email: student.email,
			displayName: 'Ana Perez'
		});

		portedItem = await createAssignment('Bench setup (ported)');
		bothItem = await createAssignment('Bench setup (ported, with a companion spec)');

		const stored = await rpc<{ ok: boolean; document_id: string }>(
			admin,
			'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)',
			[portedItem, html, JSON.stringify(manifest()), 'bench-setup.html']
		);
		expect(stored.ok).toBe(true);
		portedDocumentId = stored.document_id;

		await rpc(admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [
			bothItem,
			html,
			JSON.stringify(manifest()),
			'bench-setup.html'
		]);
		await rpc(teacher, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
			bothItem,
			JSON.stringify(companionSpec())
		]);
	});

	afterAll(async () => {
		await db?.stop();
	});

	// -----------------------------------------------------------------------
	// The serving side: what `/hx/<document id>` resolves and what it refuses.
	// -----------------------------------------------------------------------

	describe('the serving handle', () => {
		it('serves the stored bytes VERBATIM, and the handle is not the item id', async () => {
			const { rows } = await db.sql<{ document: string; item_id: string }>(
				'select document, item_id from public.classroom_html_assignments where document_id = $1',
				[portedDocumentId]
			);
			expect(rows).toHaveLength(1);
			// Nothing rewrites a stored byte: what a reviewer reads is what
			// executes, and the manifest was read out of exactly these bytes.
			expect(rows[0].document).toBe(html);
			expect(portedDocumentId).not.toBe(portedItem);
			say(`document_id ${portedDocumentId} resolves ${rows[0].document.length} bytes, byte-identical to the upload`);
		});

		it('gates on the item being live, which is what the route re-checks', async () => {
			// The sandbox origin holds no session, so the route reads with the
			// service role and re-checks this itself. The predicate is the shared
			// one -- `published && !isScheduled` is `_classroom_item_live` -- and
			// it is driven here on rows read from the real database.
			const live = async (itemId: string) => {
				const { rows } = await db.sql<{ published: boolean; publish_at: string | null }>(
					'select published, publish_at from public.classroom_items where id = $1',
					[itemId]
				);
				return rows[0].published && !isScheduled(rows[0]);
			};
			expect(await live(portedItem)).toBe(true);

			// UNPUBLISHED: refused. This is the cost the route's own header
			// states -- a teacher cannot preview an unpublished document.
			await db.sql('update public.classroom_items set published = false where id = $1', [portedItem]);
			expect(await live(portedItem)).toBe(false);

			// SCHEDULED FOR LATER: refused too, and separately.
			await db.sql(
				"update public.classroom_items set published = true, publish_at = now() + interval '1 day' where id = $1",
				[portedItem]
			);
			expect(await live(portedItem)).toBe(false);

			await db.sql('update public.classroom_items set publish_at = null where id = $1', [portedItem]);
			expect(await live(portedItem)).toBe(true);
			say('live gate: published+unscheduled true, unpublished false, scheduled-ahead false');
		});

		it('is readable by a signed-in student through RLS, and by nobody signed out', async () => {
			const mine = await db.asUser(student.id, async (q) =>
				q('select item_id from public.classroom_html_assignments where item_id = $1', [portedItem])
			);
			expect(mine.rows).toHaveLength(1);
			// The positive control above is what makes this absence mean
			// something: the row exists and `anon` still cannot reach it.
			const signedOut = await db.asAnon(async (q) => {
				try {
					const r = await q('select item_id from public.classroom_html_assignments');
					return r.rows.length;
				} catch {
					return -1;
				}
			});
			expect(signedOut).toBeLessThanOrEqual(0);
			say(`stored row: 1 for the enrolled student, ${signedOut < 0 ? 'refused' : signedOut} for anon`);
		});
	});

	// -----------------------------------------------------------------------
	// THE MEASUREMENT. A ported assignment as it is actually posted.
	// -----------------------------------------------------------------------

	describe('as a ported assignment actually is (manifest, no spec)', () => {
		it('REFUSES every answer, because the write gate reads the spec and not the manifest', async () => {
			const said: string[] = [];
			for (const answer of ANSWERS) {
				const message = await refusal(
					student,
					'public.classroom_save_response($1::uuid, $2, $3::jsonb)',
					[portedItem, answer.blockId, JSON.stringify(hxStoredValue(answer.value))]
				);
				said.push(`${answer.blockId}: ${message ?? '(saved)'}`);
			}
			for (const line of said) say(line);
			// ASSERTED, not merely printed: the day somebody widens the gate this
			// goes red and says the finding is fixed.
			expect(said.every((s) => s.includes('This assignment has no interactive spec.'))).toBe(true);

			// AND NOTHING LANDED. The positive control for this absence is the
			// companion-spec block below, which writes 6 rows on the same schema.
			const after = await readBack(portedItem);
			expect(after.responses).toHaveLength(0);
			say(`rows in classroom_responses after six saves: ${after.responses.length}`);
		});

		it('REFUSES a block-bound photograph for the same reason', async () => {
			const message = await refusal(
				student,
				'public.classroom_add_submission_file($1::uuid, $2, $3, $4, $5::bigint, $6, $7, $8)',
				[portedItem, null, 'bench.jpg', 'application/octet-stream', 5, IMAGE_BLOCK, null, `${'0'.repeat(8)}-0000-0000-0000-000000000000/x.jpg`]
			);
			say(`image on ${IMAGE_BLOCK}: ${message}`);
			expect(message).toContain('This assignment has no interactive spec.');
		});
	});

	// -----------------------------------------------------------------------
	// THE ROUND TRIP, on the far side of that gate.
	// -----------------------------------------------------------------------

	describe('with a companion spec (a contrivance: see the header)', () => {
		it('starts empty, which is what makes the reload assertion mean something', async () => {
			const before = await readBack(bothItem);
			expect(before.responses).toHaveLength(0);
			expect(before.files).toHaveLength(0);
		});

		it('fills six modules, adds a photograph, and gives every value back on reload', async () => {
			// WRITE: one call per block, through the REAL RPC, as the student.
			for (const answer of ANSWERS) {
				const res = await rpc<{ ok: boolean }>(
					student,
					'public.classroom_save_response($1::uuid, $2, $3::jsonb)',
					[bothItem, answer.blockId, JSON.stringify(hxStoredValue(answer.value))]
				);
				expect(res.ok).toBe(true);
			}

			// THE SUBMISSION IS OPENED BY ITS OWN RPC, and a save does not open
			// one -- measured: after six saves `classroom_submissions` is still
			// empty. This is exactly what `/api/classroom/submission-file/sign`
			// does before it can mint a key, because the key has to NAME the
			// submission.
			const opened = await rpc<{ ok: boolean; submission_id: string }>(
				student,
				'public.classroom_open_submission($1::uuid)',
				[bothItem]
			);
			expect(opened.ok).toBe(true);
			const submissionId = opened.submission_id;

			const file = await rpc<{ ok: boolean; file_id: string }>(
				student,
				'public.classroom_add_submission_file($1::uuid, $2, $3, $4, $5::bigint, $6, $7, $8)',
				[
					bothItem,
					null,
					'bench.jpg',
					'application/octet-stream',
					5,
					IMAGE_BLOCK,
					'The vise, squared',
					`${submissionId}/00000000-0000-4000-8000-000000000001.jpg`
				]
			);
			expect(file.ok).toBe(true);

			// RELOAD: the read path, then the parent's own restore functions.
			const after = await readBack(bothItem);
			const values = hxValuesFromResponses(manifest(), after.responses);
			const images = hxImagesFromFiles(manifest(), after.files);

			say(`--- idea:state after reload (${after.responses.length} rows, ${after.files.length} file) ---`);
			for (const [field, value] of Object.entries(values)) {
				say(`  ${field} = ${JSON.stringify(value)}`);
			}
			for (const [field, image] of Object.entries(images)) {
				say(`  ${field} = ${JSON.stringify(image)}`);
			}

			// EVERY value, by field, against the strings typed at the top of this
			// file -- never against anything the controller derived.
			expect(values).toEqual({
				setup: ANSWERS[0].value,
				reading: ANSWERS[1].value,
				toolChoice: ANSWERS[2].value,
				errorSource: ANSWERS[3].value,
				fix: ANSWERS[4].value,
				checkedOff: true
			});
			// A URL, never bytes. Bytes go frame-to-parent only.
			expect(images[IMAGE_FIELD]).toEqual({
				url: `/api/classroom/submission-file/${file.file_id}`,
				name: 'bench.jpg',
				caption: 'The vise, squared'
			});
			expect(images[IMAGE_FIELD].url.startsWith('data:')).toBe(false);
		});

		it('says the assignment may be turned in, from the values that came back', async () => {
			const after = await readBack(bothItem);
			const values = hxValuesFromResponses(manifest(), after.responses);
			// Every longText block asks for 2 sentences and every answer above
			// carries 2, counted by hand.
			const short = hxIncompleteBlocks(manifest(), values);
			say(`completeness: ${short.length} block(s) short -> ${hxSubmitRefusal(short) ?? 'may submit'}`);
			expect(short).toEqual([]);
			expect(hxSubmitRefusal(short)).toBeNull();

			// THE NEGATIVE CONTROL on the same real values: drop one answer and
			// the gate closes, so "may submit" is not something this returns for
			// anything at all.
			const missingOne = { ...values };
			delete missingOne.fix;
			expect(hxIncompleteBlocks(manifest(), missingOne)).toHaveLength(1);
		});

		it('locks every further answer once the work is turned in', async () => {
			const submitted = await rpc<{ ok: boolean }>(
				student,
				'public.classroom_submit_assignment($1::uuid)',
				[bothItem]
			);
			say(`submit: ${JSON.stringify(submitted)}`);
			const res = await rpc<{ ok: boolean; reason?: string }>(
				student,
				'public.classroom_save_response($1::uuid, $2, $3::jsonb)',
				[bothItem, ANSWERS[0].blockId, JSON.stringify(hxStoredValue('A late edit.'))]
			);
			// A CONSIDERED REFUSAL, answered by a call that SUCCEEDED. This is
			// the shape `hxSaveOutcome` must never retry, and the one the
			// document is handed a sentence for.
			expect(res.ok).toBe(false);
			expect(res.reason).toBe('locked');
			const after = await readBack(bothItem);
			const values = hxValuesFromResponses(manifest(), after.responses);
			expect(values.setup).toBe(ANSWERS[0].value);
			say(`after a locked save the stored answer is unchanged: ${JSON.stringify(values.setup)}`);
		});
	});
});
