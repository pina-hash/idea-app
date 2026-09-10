// tests/db/html-assignment-spec-path-unchanged.test.ts
//
// DOES 0197 CHANGE ANYTHING A SPEC-BACKED ASSIGNMENT SEES? The table behind
// this question is a live gradebook with a term of real student work in it, so
// "the new branch looks additive" is not an answer.
//
// ===========================================================================
// THE SHAPE, AND IT IS CLAUDE.md's OWN RULE FOR A WIDENED GATE
// ===========================================================================
//
// "Put the corpus to the DEPLOYED gate FIRST, apply the migration over the same
// database, and compare case for case; a gate that quietly tightens something
// on the way past is how a bundle that only adds a feature starts refusing
// content that is already in the table."
//
// So: ONE database, ONE seeded class, ONE spec-backed assignment, and a corpus
// of twenty-three calls covering every branch `classroom_save_response` and
// `classroom_add_submission_file` have. The corpus runs against the chain
// through 0195. The mutable state is then reset to exactly what it was, 0197 is
// applied to that same database, and the identical corpus runs again. Every
// answer is compared -- the returned jsonb where the call succeeded, the
// REFUSAL TEXT where it raised.
//
// WHY THE REFUSAL TEXT AND NOT MERELY "it still refused": the two functions
// raise seven different sentences and a student reads them. A widening that
// kept every refusal a refusal while changing which one arrives is exactly the
// silent regression this file exists to catch, and a boolean would pass it.
//
// WHY THE ORDER OF TWO REFUSALS IS ITS OWN CASE: `classroom_save_response`
// raises 'This assignment has no interactive spec.' BEFORE it checks the value
// size, so an item with no spec called with a null value answers about the spec
// and not about the value. 0197 moves the spec lookup behind an engine
// discriminator, which is precisely the edit that could reorder those two, so
// the corpus asks that question directly rather than trusting the reading.
//
// ===========================================================================
// THE POSITIVE CONTROL, WITHOUT WHICH "EVERYTHING MATCHED" MEANS NOTHING
// ===========================================================================
//
// A corpus that matched case for case is also what a migration that FAILED TO
// APPLY produces. So two of the cases are PORTED ones -- a schema-3 item with a
// manifest and no spec -- and they are asserted to DIFFER: refused before,
// accepted after. If the apply silently did nothing, those two match and the
// file goes red.
//
// ===========================================================================
// WHERE THE EXPECTED VALUES COME FROM
// ===========================================================================
//
// Nowhere. There is no table of expected answers in this file and there must
// not be: the expectation is that the SECOND reading equals the FIRST, and the
// first is read off the deployed function. Nothing here can be tuned to make it
// pass.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './harness';

/** The classroom chain a deployment carrying 0195 and NOT 0197 has. */
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
	'0195_classroom_html_assignments.sql'
] as const;

const MIGRATION = 'supabase/migrations/0197_classroom_html_assignment_write_gate.sql';

/**
 * A SPEC EXERCISING EVERY BRANCH THE WRITE GATE HAS: the three types that take
 * a typed response (`textField`, `table`, `checklist`), the one that does not
 * (`imageZone`), an `instructions` block that carries no id at all, a
 * DECLARATION, and an APPROVAL GATE after module 1 so module 2's blocks are
 * gated and module 1's are not.
 */
function specWithEverything() {
	return {
		schemaVersion: 1,
		meta: { assignmentId: 'gate-corpus', title: 'Gate corpus', totalPoints: 4 },
		declarations: { academicIntegrity: true },
		approvalGate: { afterModule: 'mod-1' },
		modules: [
			{
				id: 'mod-1',
				title: 'Ungated',
				points: 2,
				blocks: [
					{ type: 'instructions', content: 'Set the vise before you start.' },
					{ type: 'textField', id: 'sp-text', prompt: 'What did you set?', minSentences: 1 },
					{
						type: 'table',
						id: 'sp-table',
						columns: [
							{ key: 'pass', label: 'Pass' },
							{ key: 'reading', label: 'Reading' }
						]
					},
					{ type: 'checklist', id: 'sp-check', items: ['Vise squared'] },
					{ type: 'imageZone', id: 'sp-image', minImages: 1, captions: true }
				],
				rubric: [
					{
						id: 'mod-1-c',
						criterion: 'Setup recorded',
						points: 2,
						levels: [
							{ points: 2, label: 'Complete', descriptor: 'Recorded with the value behind it.' },
							{ points: 1, label: 'Developing', descriptor: 'Recorded with no value.' },
							{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
						]
					}
				]
			},
			{
				id: 'mod-2',
				title: 'Gated',
				points: 2,
				blocks: [
					{ type: 'textField', id: 'sp-gated', prompt: 'What changed?', minSentences: 1 },
					{ type: 'imageZone', id: 'sp-gated-image', minImages: 1, captions: true }
				],
				rubric: [
					{
						id: 'mod-2-c',
						criterion: 'Change recorded',
						points: 2,
						levels: [
							{ points: 2, label: 'Complete', descriptor: 'Recorded with the value behind it.' },
							{ points: 1, label: 'Developing', descriptor: 'Recorded with no value.' },
							{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
						]
					}
				]
			}
		]
	};
}

/** The same spec with the declaration switched off, on its own item, so the
    'no declaration' refusal is reachable without disturbing the one above. */
function specWithoutDeclaration() {
	const spec = specWithEverything();
	return { ...spec, declarations: {}, approvalGate: null };
}

/** THE PORTED SIDE, present only as the positive control. Two blocks, one of
    each kind the two functions need. */
function portedManifest() {
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Control',
		course: 'IDEA100',
		points: 2,
		modules: [
			{
				id: 'p1',
				title: 'Control module',
				points: 2,
				blocks: [
					{ id: 'hx-text', field: 'f1', type: 'longText' },
					{ id: 'hx-image', field: 'f2', type: 'image' }
				],
				criteria: [
					{
						id: 'p1-c',
						text: 'The control block is recorded',
						points: 2,
						levels: [
							{ points: 2, label: 'Complete', short: 'Recorded', descriptor: 'Recorded with the value behind it.' },
							{ points: 1, label: 'Developing', short: 'Partial', descriptor: 'Recorded with no value.' },
							{ points: 0, label: 'Absent', short: 'None', descriptor: 'Not attempted.' }
						]
					}
				]
			}
		]
	};
}

const PORTED_DOCUMENT = [
	'<!doctype html>',
	'<html><head><title>Control</title></head><body>',
	'  <input data-field="f1">',
	'  <input data-field="f2">',
	`  <script type="application/json" id="idea-manifest">${JSON.stringify(portedManifest())}<\/script>`,
	'</body></html>'
].join('\n');

/** One corpus answer: what came back, or the sentence that was raised. */
type Answer = { ok: unknown } | { raised: string };

/**
 * A UUID MINTED BY THE CALL IS NOT PART OF THE ANSWER, and comparing it would
 * fail every successful attach for the one reason that means nothing: the
 * second pass inserts new rows and `gen_random_uuid()` does not repeat. Every
 * uuid-shaped value is folded to `<uuid>` so what is compared is the SHAPE and
 * the sentences -- which key was returned, whether `ok` was true, which refusal
 * arrived. Nothing else is normalized: a changed message, a changed reason, a
 * changed `ok` and a field that appeared or vanished all still differ.
 */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
function stable(answer: Answer | undefined): string {
	return JSON.stringify(answer ?? null).replace(UUID_RE, '<uuid>');
}

interface Probe {
	name: string;
	/** True where the answer is EXPECTED to differ across the apply. */
	control?: boolean;
	run: () => Promise<Answer>;
}

describe('0197: a spec-backed assignment answers exactly as it did before', () => {
	let db: TestDb;
	let admin: SeededUser;
	let teacher: SeededUser;
	let student: SeededUser;
	let outsider: SeededUser;
	let section: string;
	/** The spec item every spec-path probe uses. */
	let specItem: string;
	/** A second spec item whose declaration is off. */
	let noDeclarationItem: string;
	/** An assignment with neither a spec nor a manifest: the pure v1 refusal. */
	let bareItem: string;
	/** Published false, so `_classroom_engine_student` refuses it. */
	let draftItem: string;
	/** A ported item, manifest only. The positive control. */
	let portedItem: string;
	/** The item the lock probe submits, kept apart so nothing else is locked. */
	let lockItem: string;

	async function rpc<T = unknown>(
		user: SeededUser,
		call: string,
		params: unknown[] = []
	): Promise<T> {
		return db.asUser(user.id, async (q) => {
			const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
			return rows[0].result;
		});
	}

	/** The measurement itself: the value, or the message. Nothing else. */
	async function answer(
		user: SeededUser,
		call: string,
		params: unknown[] = []
	): Promise<Answer> {
		try {
			return { ok: await rpc(user, call, params) };
		} catch (e) {
			return { raised: (e as Error).message };
		}
	}

	const save = (blockId: string, value: unknown, item?: string, as?: SeededUser) => () =>
		answer(as ?? student, 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [
			item ?? specItem,
			blockId,
			JSON.stringify(value)
		]);

	const attach = (blockId: string | null, item?: string) => () =>
		answer(
			student,
			`public.classroom_add_submission_file(
				$1::uuid, $2, $3, $4, $5::bigint, $6, $7, $8)`,
			[item ?? specItem, 'drive-corpus-1', 'shot.jpg', 'image/jpeg', 1024, blockId, 'A caption', null]
		);

	async function createAssignment(title: string, published = true): Promise<string> {
		const r = await rpc<{ item_id: string }>(
			teacher,
			`public.classroom_create_item(
				p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => $2,
				p_body => $3, p_points => 4, p_published => $4)`,
			[[section], title, `${title} body.`, published]
		);
		return r.item_id;
	}

	/**
	 * PUT THE WORLD BACK. Every row the corpus can write, removed as the
	 * connection owner, so the second pass starts from the state the first one
	 * did. Without this the second pass would meet a submitted assignment and a
	 * granted approval and answer differently for reasons that are nothing to do
	 * with the migration.
	 */
	async function resetMutableState() {
		await db.sql('delete from public.classroom_responses');
		await db.sql('delete from public.classroom_submission_files');
		await db.sql('delete from public.classroom_module_approvals');
		await db.sql('delete from public.classroom_submissions');
	}

	/** The corpus, in a fixed order. Order matters: the approval probe follows
	    the gated refusal, and the lock probe submits its own item last. */
	function corpus(): Probe[] {
		return [
			// --- classroom_save_response, the spec arm ------------------------
			{ name: 'save into a textField', run: save('sp-text', { text: 'The vise was square.' }) },
			{
				name: 'save into a table',
				run: save('sp-table', { rows: [{ pass: '1', reading: '2.50' }] })
			},
			{ name: 'save into a checklist', run: save('sp-check', { checked: [true] }) },
			{ name: 'save into an imageZone (refused: not a typed response)', run: save('sp-image', { text: 'x' }) },
			{ name: 'save into an instructions block, which has no id', run: save('(none)', { text: 'x' }) },
			{ name: 'save into a block id no spec carries', run: save('no-such-block', { text: 'x' }) },
			{ name: 'save a value over the size cap', run: save('sp-text', { text: 'x'.repeat(120000) }) },
			{ name: 'save a null value', run: save('sp-text', null) },
			{ name: 'save on an item with no spec at all', run: () => save('sp-text', { text: 'x' }, bareItem)() },
			// THE ORDER-OF-REFUSALS PROBE: no spec AND a null value together. The
			// answer says which of 0086's two earliest checks it reaches first,
			// which is exactly the pair 0197's engine discriminator could reorder.
			{ name: 'save a null value on an item with no spec at all', run: () => save('sp-text', null, bareItem)() },
			{ name: 'save the declaration where the spec declares one', run: save('@declaration', { checked: [true] }) },
			{
				name: 'save the declaration where the spec declares none',
				run: () => save('@declaration', { checked: [true] }, noDeclarationItem)()
			},
			{ name: 'save into a GATED module with no approval', run: save('sp-gated', { text: 'Shimmed it.' }) },
			{ name: 'attach to a GATED imageZone with no approval', run: attach('sp-gated-image') },
			{
				name: 'grant the approval, then save into the gated module',
				run: async () => {
					await rpc(teacher, 'public.classroom_approve_module($1::uuid, $2, $3, $4)', [
						specItem,
						student.email,
						'mod-1',
						true
					]);
					return save('sp-gated', { text: 'Shimmed it.' })();
				}
			},
			{ name: 'save as somebody not enrolled', run: save('sp-text', { text: 'x' }, undefined, outsider) },
			{ name: 'save on an unpublished assignment', run: () => save('sp-text', { text: 'x' }, draftItem)() },

			// --- classroom_add_submission_file, the spec arm -------------------
			{ name: 'attach to an imageZone', run: attach('sp-image') },
			{ name: 'attach to a textField', run: attach('sp-text') },
			{ name: 'attach to a block id no spec carries', run: attach('no-such-block') },
			{ name: 'attach with no block id at all', run: attach(null) },
			{ name: 'attach to an item with no spec', run: attach('sp-image', bareItem) },
			{
				name: 'attach with neither a Drive id nor a storage key',
				run: () =>
					answer(
						student,
						`public.classroom_add_submission_file($1::uuid, $2, $3, $4, $5::bigint, $6, $7, $8)`,
						[specItem, null, 'shot.jpg', 'image/jpeg', 1024, 'sp-image', null, null]
					)
			},
			{
				name: 'attach through 0086 SEVEN-argument wrapper with a blank Drive id',
				run: () =>
					answer(student, `public.classroom_add_submission_file($1::uuid, $2, $3, $4)`, [
						specItem,
						'  ',
						'shot.jpg',
						'image/jpeg'
					])
			},
			{
				name: 'attach through the SEVEN-argument wrapper, valid',
				run: () =>
					answer(student, `public.classroom_add_submission_file($1::uuid, $2, $3, $4)`, [
						specItem,
						'drive-corpus-wrapper',
						'shot.jpg',
						'image/jpeg'
					])
			},

			// --- the lock, last, on its own item -------------------------------
			{
				name: 'save after the assignment is turned in',
				run: async () => {
					await rpc(student, 'public.classroom_submit_assignment($1::uuid)', [lockItem]);
					return save('lk-text', { text: 'Too late.' }, lockItem)();
				}
			},

			// --- THE POSITIVE CONTROLS: these MUST differ ----------------------
			{
				name: 'CONTROL: save into a ported document (manifest, no spec)',
				control: true,
				run: () => save('hx-text', { text: 'A ported answer.' }, portedItem)()
			},
			{
				name: 'CONTROL: attach to a ported image block',
				control: true,
				run: () => attach('hx-image', portedItem)()
			}
		];
	}

	async function runCorpus(): Promise<Map<string, Answer>> {
		const out = new Map<string, Answer>();
		for (const probe of corpus()) {
			out.set(probe.name, await probe.run());
		}
		return out;
	}

	let before: Map<string, Answer>;
	let after: Map<string, Answer>;

	beforeAll(async () => {
		db = await startTestDb(CHAIN);
		admin = await createUser(db, 'apina@boscotech.edu', 'A. Pina');
		teacher = await createUser(db, 'reyes@boscotech.edu', 'A. Reyes');
		student = await createUser(db, 'ana.perez@boscotech.net', 'Ana Perez');
		outsider = await createUser(db, 'luis.gomez@boscotech.net', 'Luis Gomez');
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

		specItem = await createAssignment('Gate corpus');
		noDeclarationItem = await createAssignment('Gate corpus, no declaration');
		bareItem = await createAssignment('Gate corpus, no spec at all');
		draftItem = await createAssignment('Gate corpus, unpublished', false);
		lockItem = await createAssignment('Gate corpus, lock');
		portedItem = await createAssignment('Gate corpus, ported control');

		await rpc(teacher, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
			specItem,
			JSON.stringify(specWithEverything())
		]);
		await rpc(teacher, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
			noDeclarationItem,
			JSON.stringify(specWithoutDeclaration())
		]);
		await rpc(teacher, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
			draftItem,
			JSON.stringify(specWithoutDeclaration())
		]);
		// The lock item's own tiny spec, so the submit and the refused save
		// afterwards touch nothing the rest of the corpus reads.
		await rpc(teacher, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
			lockItem,
			JSON.stringify({
				schemaVersion: 1,
				meta: { assignmentId: 'lock', title: 'Lock', totalPoints: 0 },
				modules: [
					{
						id: 'lk',
						title: 'Lock',
						points: 0,
						blocks: [{ type: 'textField', id: 'lk-text', prompt: 'Anything?' }]
					}
				]
			})
		]);
		await rpc(admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [
			portedItem,
			PORTED_DOCUMENT,
			JSON.stringify(portedManifest()),
			'control.html'
		]);

		before = await runCorpus();
		await resetMutableState();
		await db.sql(readFileSync(MIGRATION, 'utf8'));
		after = await runCorpus();
	}, 180_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('applied 0197 over the same database the first pass ran against', async () => {
		const { rows } = await db.sql<{ n: number }>(
			`select count(*)::int as n from pg_proc
			 where pronamespace = 'public'::regnamespace
				and proname = 'classroom_save_response'
				and prosrc like '%_classroom_html_manifest%'`
		);
		expect(rows[0].n).toBe(1);
	});

	it('answers every spec-path case identically, refusal text included', () => {
		const differences: string[] = [];
		let compared = 0;
		for (const probe of corpus()) {
			if (probe.control) continue;
			compared += 1;
			const a = stable(before.get(probe.name));
			const b = stable(after.get(probe.name));
			console.log(`    [spec path] ${probe.name}\n        ${a}`);
			if (a !== b) differences.push(`${probe.name}\n  before: ${a}\n  after:  ${b}`);
		}
		console.log(`    [spec path] ${compared} spec-path case(s) compared, ${differences.length} difference(s)`);
		// A sweep that generated nothing must not pass: this is the case count.
		expect(compared).toBe(corpus().filter((p) => !p.control).length);
		expect(compared).toBeGreaterThanOrEqual(24);
		expect(differences).toEqual([]);
	});

	it('and the two ported controls DID change, so a silent no-op apply cannot pass', () => {
		const controls = corpus().filter((p) => p.control);
		expect(controls).toHaveLength(2);
		for (const probe of controls) {
			const a = before.get(probe.name);
			const b = after.get(probe.name);
			console.log(`    [control] ${probe.name}\n        before: ${JSON.stringify(a)}\n        after:  ${JSON.stringify(b)}`);
			// Refused before: the deployed gate read the spec table and found none.
			expect(a).toHaveProperty('raised');
			expect((a as { raised: string }).raised).toContain('no interactive spec');
			// Accepted after.
			expect(b).toHaveProperty('ok');
			expect((b as { ok: { ok: boolean } }).ok.ok).toBe(true);
		}
	});
});
