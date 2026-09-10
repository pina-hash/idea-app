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
// WHAT THIS FILE MEASURED, AND WHAT 0197 CHANGED ABOUT IT
// ===========================================================================
//
// THE FIRST TIME THIS FILE RAN, EVERY ANSWER WAS REFUSED. `classroom_save_response`
// opened by reading `classroom_assignment_specs` for the item and raising 'This
// assignment has no interactive spec.' when there was none, and then resolved
// `p_block_id` against THAT SPEC's modules; a ported assignment carries a
// MANIFEST in `classroom_html_assignments` (0195) and no spec, so every save
// raised. `classroom_add_submission_file` carried the identical gate on its
// `p_block_id` path, so a block-bound photograph raised too. 0195's own header
// says an answer is an ordinary `classroom_responses` row and that nothing about
// one moves; that was true of the READ side and of grading, and it was not true
// of the WRITE gate, which nothing had widened.
//
// **0197 IS THAT WIDENING, AND THIS FILE NOW MEASURES THE WHOLE ROUND TRIP.**
// `describe('as a ported assignment actually is')` below is the ported item as
// it is really posted -- a manifest and no spec at all -- writing ALL SIX block
// types the manifest format admits, adding a photograph, and reading every one
// of them back. The two `it`s that used to assert the refusals are gone, not
// inverted: `tests/db/html-assignment-write-gate.test.ts` was the probe written
// to be DELETED once the gate moved, and it has been.
//
// `describe('with a companion spec')` was a CONTRIVANCE that existed only to
// show the read half worked on the far side of the write gate. It has a
// different job now, and it is a real one: an item carrying BOTH a manifest and
// a spec is a legal database state, and 0197 makes the MANIFEST decide -- the
// same order `htmlAssignmentMount` takes on every rendering surface. That is
// the one behaviour 0197 changes rather than widens, so it is asserted here
// rather than left to be discovered.
//
// ===========================================================================
// WHERE THE EXPECTED VALUES COME FROM
// ===========================================================================
//
// The eight answers are strings this file types out. What is read back is read
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
	'0134_classroom_submission_open_race.sql',
	'0135_classroom_instructor_storage_and_public_attachments.sql',
	'0137_anon_execute_sweep.sql',
	'0176_classroom_item_images.sql',
	'0195_classroom_html_assignments.sql',
	'0197_classroom_html_assignment_write_gate.sql'
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
	{ blockId: 'm6-done', field: 'checkedOff', value: true },
	// THE LAST TWO EXIST TO COVER THE VOCABULARY RATHER THAN THE WORKSHEET, and
	// they are the point of this fixture growing. `classroom_save_response`'s v1
	// type gate accepted `textField`, `table` and `checklist`; a manifest declares
	// `text`, `longText`, `checkbox`, `radio`, `image` and `table`. The two
	// vocabularies overlap on ONE word, so five of the six had never been put to
	// the write path at all. All six are now written below.
	//
	// A RADIO'S STORED VALUE IS A STRING and a TABLE's is a string too -- the
	// document serialises the whole table to JSON text whenever a cell changes,
	// which `manifest.ts` states about `type: 'table'` -- so both go through
	// `hxStoredValue`'s text branch exactly as a longText does. What differs is
	// only which block id the row lands under.
	{ blockId: 'm7-pick', field: 'finish', value: 'anodized' },
	{
		blockId: 'm7-table',
		field: 'passes',
		value: JSON.stringify([
			{ pass: '1', reading: '2.50' },
			{ pass: '2', reading: '2.51' }
		])
	}
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
		{ id: 'm6', title: 'Show the bench', blockId: 'm6-done', field: 'checkedOff' },
		{ id: 'm7', title: 'Record the passes', blockId: 'm7-pick', field: 'finish' }
	].map((m, i) => ({
		id: m.id,
		title: m.title,
		points: 2,
		audience: 'individual' as const,
		// THREE ARRANGEMENTS, so the SIX manifest block types are all present in
		// one stored document: five longText modules, one carrying a checkbox
		// beside an image, and one carrying a radio beside a table. The header
		// below adds `text`. Nothing here is decoration -- each is a type the
		// write gate has to resolve and accept.
		blocks:
			i === 5
				? [
						{ id: m.blockId, field: m.field, type: 'checkbox' as const },
						{ id: IMAGE_BLOCK, field: IMAGE_FIELD, type: 'image' as const }
					]
				: i === 6
					? [
							{ id: m.blockId, field: m.field, type: 'radio' as const },
							{ id: 'm7-table', field: 'passes', type: 'table' as const }
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
		// Seven modules at 2 points each. 0195 refuses a manifest whose modules
		// do not sum to this number, which is why it moved with the module.
		points: 14,
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
		meta: { assignmentId: 'bench-1', title: 'Bench setup', totalPoints: 14 },
		modules: manifest().modules.map((mod) => ({
			id: mod.id,
			title: mod.title,
			points: 2,
			blocks: [
				...mod.blocks.map((b) =>
					b.type === 'image'
						? { type: 'imageZone', id: b.id, minImages: 1, captions: true }
						: b.type === 'checkbox'
							// A CHECKLIST OF ONE. 0086's `classroom_save_response` takes a
							// typed response only for textField, table and checklist, and a
							// textField carrying a sentence floor can never be satisfied by
							// a tick -- which the first draft of this fixture proved by
							// refusing the submit.
							? { type: 'checklist', id: b.id, items: ['Bench photographed'] }
							: b.type === 'table'
								? {
										type: 'table',
										id: b.id,
										columns: [
											{ key: 'pass', label: 'Pass' },
											{ key: 'reading', label: 'Reading' }
										]
									}
								: { type: 'textField', id: b.id, prompt: mod.title, minSentences: 1 }
				),
				// A BLOCK THE MANIFEST DOES NOT CARRY, on the first module only.
				// It is what makes "the manifest decides" falsifiable: on an item
				// holding both, saving into this id has to be refused as an unknown
				// block, because the manifest has never heard of it. Without it,
				// every id resolves under either engine and the assertion could not
				// tell which one answered.
				...(mod.id === 'm1' ? [{ type: 'textField', id: 'spec-only', prompt: 'Spec only' }] : [])
			],
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
	/** The same document on an item that ALSO carries a spec. A legal state,
	    and the one whose write behaviour 0197 changes. */
	let bothItem: string;
	/** The companion spec on its OWN, with no manifest: the positive control for
	    "the manifest decided", so an id refused above can be shown to be legal. */
	let specOnlyItem: string;
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
				p_body => $3, p_points => 14, p_published => true)`,
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
		specOnlyItem = await createAssignment('Bench setup (the companion spec alone)');

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
		await rpc(teacher, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
			specOnlyItem,
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
		it('starts empty, which is what makes the reload assertion mean something', async () => {
			const before = await readBack(portedItem);
			expect(before.responses).toHaveLength(0);
			expect(before.files).toHaveLength(0);
		});

		it('writes ALL SIX manifest block types through the one write path', async () => {
			// ONE CALL PER BLOCK, through the REAL `classroom_save_response`, as
			// the REAL student role. There is no second write function and this
			// file would notice one: it names 0086's, which 0197 widened.
			for (const answer of ANSWERS) {
				const res = await rpc<{ ok: boolean }>(
					student,
					'public.classroom_save_response($1::uuid, $2, $3::jsonb)',
					[portedItem, answer.blockId, JSON.stringify(hxStoredValue(answer.value))]
				);
				say(`save ${answer.blockId}: ${JSON.stringify(res)}`);
				expect(res.ok).toBe(true);
			}

			// A HEADER BLOCK IS A BLOCK. 0195 holds header ids and module block
			// ids in ONE uniqueness array precisely because a student's name is an
			// answer and lands in classroom_responses.block_id like any other; a
			// resolver that walked only `modules` would refuse every identity
			// field with 'Unknown block', which reads as a document problem.
			const header = await rpc<{ ok: boolean }>(
				student,
				'public.classroom_save_response($1::uuid, $2, $3::jsonb)',
				[portedItem, 'who', JSON.stringify(hxStoredValue('Ana Perez'))]
			);
			say(`save who (header block): ${JSON.stringify(header)}`);
			expect(header.ok).toBe(true);

			// EVERY TYPE THE MANIFEST DECLARES IS ACCOUNTED FOR. Read off the
			// fixture rather than typed out again, so a block added above cannot
			// quietly stop being covered.
			const m = manifest();
			const declared = new Set([
				...(m.header ?? []).map((b) => b.type),
				...m.modules.flatMap((mod) => mod.blocks.map((b) => b.type))
			]);
			say(`block types in the stored manifest: ${[...declared].sort().join(', ')}`);
			expect([...declared].sort()).toEqual([
				'checkbox',
				'image',
				'longText',
				'radio',
				'table',
				'text'
			]);
			// The image type is written by the file path below, not by a response
			// row; every other type has just been saved.
			const savedIds = new Set([...ANSWERS.map((a) => a.blockId), 'who']);
			const typesSaved = new Set(
				[...(m.header ?? []), ...m.modules.flatMap((mod) => mod.blocks)]
					.filter((b) => savedIds.has(b.id))
					.map((b) => b.type)
			);
			expect([...typesSaved].sort()).toEqual(['checkbox', 'longText', 'radio', 'table', 'text']);

			// THE NEGATIVE CONTROL, on the same item and the same function: an id
			// the manifest does not carry is still refused. Without it, "every
			// save succeeded" is also what a gate that stopped checking anything
			// would produce.
			const unknown = await refusal(
				student,
				'public.classroom_save_response($1::uuid, $2, $3::jsonb)',
				[portedItem, 'no-such-block', JSON.stringify(hxStoredValue('x'))]
			);
			say(`save an id the manifest does not carry: ${unknown}`);
			expect(unknown).toContain('Unknown block "no-such-block"');
		});

		it('refuses a block type outside the six, on a row that reached the table another way', async () => {
			// `classroom_set_html_assignment` CANNOT store this manifest:
			// `_classroom_check_html_manifest` refuses an unknown type at the
			// door, which is why this row is written as the connection owner
			// instead. That is the state the type gate in the write path exists
			// for -- defence in depth against a manifest that arrived by some
			// other route -- and it is the half a test of the setter alone can
			// never reach. Verified by opening the gate: this assertion is the
			// one that reddens.
			const itemId = await createAssignment('Bench setup (a manifest with a bad type)');
			const bad = {
				...manifest(),
				modules: [
					{
						...manifest().modules[0],
						blocks: [{ id: 'bad-type', field: 'badField', type: 'calc' }]
					}
				],
				points: 2
			};
			await db.sql(
				`insert into public.classroom_html_assignments
					(item_id, document, manifest, filename, imported_by)
				 values ($1, $2, $3::jsonb, $4, $5)`,
				[itemId, '<!doctype html>', JSON.stringify(bad), 'bad.html', teacher.email]
			);
			await db.sql('update public.classroom_items set assignment_schema_version = 3 where id = $1', [
				itemId
			]);

			const message = await refusal(
				student,
				'public.classroom_save_response($1::uuid, $2, $3::jsonb)',
				[itemId, 'bad-type', JSON.stringify(hxStoredValue('x'))]
			);
			say(`a manifest block of type "calc": ${message}`);
			expect(message).toContain('does not take a typed response');

			// THE POSITIVE CONTROL on the same hand-written row: an id it DOES
			// carry with a legal type still saves, so the refusal above is about
			// the type and not about the row being unreachable.
			const okItem = await createAssignment('Bench setup (a hand-written but legal manifest)');
			await db.sql(
				`insert into public.classroom_html_assignments
					(item_id, document, manifest, filename, imported_by)
				 values ($1, $2, $3::jsonb, $4, $5)`,
				[
					okItem,
					'<!doctype html>',
					JSON.stringify({
						...bad,
						modules: [
							{
								...bad.modules[0],
								blocks: [{ id: 'bad-type', field: 'badField', type: 'longText' }]
							}
						]
					}),
					'ok.html',
					teacher.email
				]
			);
			await db.sql('update public.classroom_items set assignment_schema_version = 3 where id = $1', [
				okItem
			]);
			const res = await rpc<{ ok: boolean }>(
				student,
				'public.classroom_save_response($1::uuid, $2, $3::jsonb)',
				[okItem, 'bad-type', JSON.stringify(hxStoredValue('x'))]
			);
			say(`the same id at type "longText": ${JSON.stringify(res)}`);
			expect(res.ok).toBe(true);
		});

		it('takes a block-bound photograph, which used to raise for the same reason', async () => {
			// The submission is opened by its OWN RPC and a save does not open
			// one, which is what `/api/classroom/submission-file/sign` does before
			// it can mint a key -- the key has to NAME the submission.
			const opened = await rpc<{ ok: boolean; submission_id: string }>(
				student,
				'public.classroom_open_submission($1::uuid)',
				[portedItem]
			);
			expect(opened.ok).toBe(true);

			const file = await rpc<{ ok: boolean; file_id: string }>(
				student,
				'public.classroom_add_submission_file($1::uuid, $2, $3, $4, $5::bigint, $6, $7, $8)',
				[
					portedItem,
					null,
					'bench.jpg',
					'application/octet-stream',
					5,
					IMAGE_BLOCK,
					'The vise, squared',
					`${opened.submission_id}/00000000-0000-4000-8000-000000000001.jpg`
				]
			);
			say(`image on ${IMAGE_BLOCK}: ${JSON.stringify(file)}`);
			expect(file.ok).toBe(true);

			// AND THE REFUSAL THAT SURVIVED THE WIDENING: a block that is not of
			// type `image` is still not an image zone. `m7-table` is a real block
			// on this manifest, so this cannot pass by the id being unknown.
			const wrong = await refusal(
				student,
				'public.classroom_add_submission_file($1::uuid, $2, $3, $4, $5::bigint, $6, $7, $8)',
				[
					portedItem,
					null,
					'bench.jpg',
					'application/octet-stream',
					5,
					'm7-table',
					null,
					`${opened.submission_id}/00000000-0000-4000-8000-000000000002.jpg`
				]
			);
			say(`image on a table block: ${wrong}`);
			expect(wrong).toContain('is not an image zone');
		});

		it('gives every value back on reload, as the state message a document receives', async () => {
			const after = await readBack(portedItem);
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
				studentName: 'Ana Perez',
				setup: ANSWERS[0].value,
				reading: ANSWERS[1].value,
				toolChoice: ANSWERS[2].value,
				errorSource: ANSWERS[3].value,
				fix: ANSWERS[4].value,
				checkedOff: true,
				finish: ANSWERS[6].value,
				passes: ANSWERS[7].value
			});
			// A URL, never bytes. Bytes go frame-to-parent only.
			expect(images[IMAGE_FIELD]).toEqual({
				url: `/api/classroom/submission-file/${after.files[0].id}`,
				name: 'bench.jpg',
				caption: 'The vise, squared'
			});
			expect(images[IMAGE_FIELD].url.startsWith('data:')).toBe(false);
		});

		it('says the assignment may be turned in, from the values that came back', async () => {
			const after = await readBack(portedItem);
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
				[portedItem]
			);
			say(`submit: ${JSON.stringify(submitted)}`);
			const res = await rpc<{ ok: boolean; reason?: string }>(
				student,
				'public.classroom_save_response($1::uuid, $2, $3::jsonb)',
				[portedItem, ANSWERS[0].blockId, JSON.stringify(hxStoredValue('A late edit.'))]
			);
			// A CONSIDERED REFUSAL, answered by a call that SUCCEEDED. This is
			// the shape `hxSaveOutcome` must never retry, and the one the
			// document is handed a sentence for.
			expect(res.ok).toBe(false);
			expect(res.reason).toBe('locked');
			const after = await readBack(portedItem);
			const values = hxValuesFromResponses(manifest(), after.responses);
			expect(values.setup).toBe(ANSWERS[0].value);
			say(`after a locked save the stored answer is unchanged: ${JSON.stringify(values.setup)}`);
		});
	});

	// -----------------------------------------------------------------------
	// AN ITEM CARRYING BOTH. The one behaviour 0197 changes rather than widens.
	// -----------------------------------------------------------------------

	describe('with a companion spec: the manifest decides, as it does on every surface', () => {
		it('resolves a block the MANIFEST carries and refuses one only the SPEC carries', async () => {
			// `spec-only` is a real textField in the companion spec and appears
			// nowhere in the manifest. Under 0086 it saved; under 0197 the engine
			// discriminator is the item's own `assignment_schema_version`, which
			// classroom_set_html_assignment stamped 3, so the manifest arm answers
			// and this id is unknown. That is the SAME order htmlAssignmentMount
			// takes -- the frame arm ahead of every spec arm -- and the reason the
			// two must agree is 0134's Surface A finding: an item answering from a
			// superseded spec renders one document and records against another.
			const res = await rpc<{ ok: boolean }>(
				student,
				'public.classroom_save_response($1::uuid, $2, $3::jsonb)',
				[bothItem, ANSWERS[0].blockId, JSON.stringify(hxStoredValue(ANSWERS[0].value))]
			);
			say(`a block both carry: ${JSON.stringify(res)}`);
			expect(res.ok).toBe(true);

			const specOnly = await refusal(
				student,
				'public.classroom_save_response($1::uuid, $2, $3::jsonb)',
				[bothItem, 'spec-only', JSON.stringify(hxStoredValue('From the spec alone.'))]
			);
			say(`a block only the spec carries: ${specOnly}`);
			expect(specOnly).toContain('Unknown block "spec-only"');

			// THE POSITIVE CONTROL FOR THAT REFUSAL, and it is what stops the
			// assertion above passing for the wrong reason: `spec-only` IS a legal
			// block under the v1 engine, so on an item with the same spec and NO
			// manifest the identical call succeeds. The id is fine; the engine is
			// what changed.
			const onSpecOnlyItem = await rpc<{ ok: boolean }>(
				student,
				'public.classroom_save_response($1::uuid, $2, $3::jsonb)',
				[specOnlyItem, 'spec-only', JSON.stringify(hxStoredValue('From the spec alone.'))]
			);
			say(`the same id on an item with only the spec: ${JSON.stringify(onSpecOnlyItem)}`);
			expect(onSpecOnlyItem.ok).toBe(true);
		});

		it('and the stored row is an ordinary response row either way', async () => {
			const after = await readBack(bothItem);
			const ids = after.responses.map((r) => r.block_id).sort();
			say(`rows on the item carrying both: ${ids.join(', ')}`);
			expect(ids).toEqual([ANSWERS[0].blockId]);
			// Same table, same key, same shape as every v1 answer -- which is what
			// keeps grading, the Grades tab, extra credit and the FACTS export
			// free of any HTML branch at all.
			const { rows } = await db.sql<{ n: number }>(
				`select count(*)::int as n from public.classroom_responses
				 where item_id = $1 and block_id = $2 and value ? 'text'`,
				[bothItem, ANSWERS[0].blockId]
			);
			expect(rows[0].n).toBe(1);
		});
	});
});
