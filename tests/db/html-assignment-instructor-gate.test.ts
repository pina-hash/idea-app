// tests/db/html-assignment-instructor-gate.test.ts
//
// DOES 0199 CHANGE ANYTHING A SPEC-BACKED INSTRUCTOR COPY SEES? The table
// behind this question holds real answer keys, so "the new branch looks
// additive" is not an answer.
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
// covering every branch `classroom_save_instructor_response` has plus the two
// answer-key functions that sit on top of it. The corpus runs against the chain
// through 0197. The mutable state is then reset to exactly what it was, 0199 is
// applied to that same database, and the identical corpus runs again. Every
// answer is compared -- the returned jsonb where the call succeeded, the
// REFUSAL TEXT where it raised.
//
// WHY THE REFUSAL TEXT AND NOT MERELY "it still refused": this function raises
// six different sentences and an instructor reads them. A widening that kept
// every refusal a refusal while changing which one arrives is exactly the
// silent regression this file exists to catch, and a boolean would pass it.
//
// WHY THE ORDER OF TWO REFUSALS IS ITS OWN CASE: 0128 raises 'This assignment
// has no interactive spec.' BEFORE it checks the value size AND before it
// refuses '@declaration'. 0199 moves the spec lookup behind an engine
// discriminator, which is precisely the edit that could reorder those, so the
// corpus asks both questions directly rather than trusting the reading.
//
// ===========================================================================
// THE POSITIVE CONTROLS, WITHOUT WHICH "EVERYTHING MATCHED" MEANS NOTHING
// ===========================================================================
//
// A corpus that matched case for case is also what a migration that FAILED TO
// APPLY produces. So three of the cases are PORTED ones -- a schema-3 item with
// a manifest and no spec -- and they are asserted to DIFFER: refused before,
// accepted after. If the apply silently did nothing, those three match and the
// file goes red.
//
// ===========================================================================
// AND THE TWO GATES ARE PINNED EQUAL
// ===========================================================================
//
// 0197 states the six-type manifest vocabulary inside `classroom_save_response`
// and 0199 states it again inside `classroom_save_instructor_response`. Two
// literals can drift, and a comment cannot stop them. `the two write gates
// accept exactly the same manifest block types` below puts all six types plus a
// name no manifest carries to BOTH functions, on one database, on the same
// document, and fails if either admits or refuses a type the other does not.
// That runs on every suite run, which is the durable half of the pin; the
// migration's own apply-time check is the other.
//
// ===========================================================================
// WHERE THE EXPECTED VALUES COME FROM
// ===========================================================================
//
// For the corpus: nowhere. There is no table of expected answers and there must
// not be -- the expectation is that the SECOND reading equals the FIRST, and the
// first is read off the deployed function. Nothing there can be tuned to make
// it pass. For the two gates' equality: each function's own answer, compared to
// the other's, never to a list written here.
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

/** The classroom chain a deployment carrying 0197 and NOT 0199 has. The order
    is `tests/db/html-assignment-revision.test.ts`'s, in production order. */
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

const MIGRATION = 'supabase/migrations/0199_classroom_html_instructor_write_gate.sql';

/** THE SIX TYPES A MANIFEST MAY DECLARE, which is what both gates admit. Typed
    out here so the equality assertion below has something to iterate that comes
    from neither function -- and one name no manifest carries, as the control
    that "it accepted everything" is not what was measured. */
const MANIFEST_TYPES = ['text', 'longText', 'checkbox', 'radio', 'image', 'table'] as const;

/**
 * A SPEC EXERCISING EVERY BRANCH THE INSTRUCTOR GATE HAS: the three types that
 * take a typed response (`textField`, `table`, `checklist`), the one that does
 * not (`imageZone`), and an `instructions` block that carries no id at all.
 *
 * THE DECLARATION IS DELIBERATELY DECLARED. 0128 refuses `@declaration`
 * unconditionally -- an instructor copy has no declaration whatever the spec
 * says -- so a spec that declares one is the case where that refusal has to
 * fire ANYWAY, which is the one worth pinning.
 *
 * THERE IS NO APPROVAL GATE HERE AND THAT IS NOT AN OMISSION: 0128 reads none,
 * because a working copy has nobody to approve it.
 */
function specWithEverything() {
	return {
		schemaVersion: 1,
		meta: { assignmentId: 'icopy-corpus', title: 'Instructor gate corpus', totalPoints: 2 },
		declarations: { academicIntegrity: true },
		modules: [
			{
				id: 'mod-1',
				title: 'Bench',
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
			}
		]
	};
}

/**
 * THE PORTED SIDE. One block of every one of the six types, plus a HEADER
 * block, because a header id lands in the response table exactly as a module
 * block id does and a lookup that read only `modules` would refuse an
 * instructor on the identity field.
 */
function portedManifest() {
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Bench setup',
		course: 'IDEA100',
		points: 2,
		header: [{ id: 'who', field: 'studentName', type: 'text' }],
		modules: [
			{
				id: 'p1',
				title: 'Bench',
				points: 2,
				blocks: MANIFEST_TYPES.map((type, i) => ({
					id: `hx-${type.toLowerCase()}`,
					field: `f${i + 1}`,
					type
				})),
				criteria: [
					{
						id: 'p1-c',
						text: 'The bench setup is recorded',
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

function portedDocument(): string {
	const fields = MANIFEST_TYPES.map((_, i) => `  <input data-field="f${i + 1}">`).join('\n');
	return [
		'<!doctype html>',
		'<html><head><title>Bench setup</title></head><body>',
		'  <input data-field="studentName">',
		fields,
		`  <script type="application/json" id="idea-manifest">${JSON.stringify(portedManifest())}<\/script>`,
		'</body></html>'
	].join('\n');
}

/** One corpus answer: what came back, or the sentence that was raised. */
type Answer = { ok: unknown } | { raised: string };

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

describe('0199: the instructor write gate widens without moving the spec path', () => {
	let db: TestDb;
	let admin: SeededUser;
	let teacher: SeededUser;
	/** An instructor who manages no section this item is posted to. */
	let outsider: SeededUser;
	let student: SeededUser;
	let section: string;
	/** The spec item every spec-path probe uses. */
	let specItem: string;
	/** An assignment with neither a spec nor a manifest: the pure v1 refusal. */
	let bareItem: string;
	/** A MATERIAL, which is not an assignment at all. */
	let materialItem: string;
	/** A ported item, manifest only. The positive control, and the subject of
	    every assertion that runs only after the apply. */
	let portedItem: string;

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
	async function answer(user: SeededUser, call: string, params: unknown[] = []): Promise<Answer> {
		try {
			return { ok: await rpc(user, call, params) };
		} catch (e) {
			return { raised: (e as Error).message };
		}
	}

	const save = (blockId: string, value: unknown, item?: string, as?: SeededUser) => () =>
		answer(as ?? teacher, 'public.classroom_save_instructor_response($1::uuid, $2, $3::jsonb)', [
			item ?? specItem,
			blockId,
			JSON.stringify(value)
		]);

	// `p_points` IS NULL FOR A MATERIAL, because 0085 refuses one that carries
	// points at all ('Only an assignment can carry points or a due date.') and
	// this helper builds both kinds.
	async function createAssignment(title: string, kind = 'assignment'): Promise<string> {
		const r = await rpc<{ item_id: string }>(
			teacher,
			`public.classroom_create_item(
				p_kind => $5, p_section_ids => $1::uuid[], p_title => $2,
				p_body => $3, p_points => $6::integer, p_published => $4)`,
			[[section], title, `${title} body.`, true, kind, kind === 'assignment' ? 2 : null]
		);
		return r.item_id;
	}

	/**
	 * PUT THE WORLD BACK. Every row the corpus can write, removed as the
	 * connection owner, so the second pass starts from the state the first one
	 * did. Without this the second pass would meet a designated key and a filled
	 * copy and answer differently for reasons that are nothing to do with the
	 * migration.
	 */
	async function resetMutableState() {
		await db.sql('delete from public.classroom_instructor_keys');
		await db.sql('delete from public.classroom_instructor_responses');
	}

	/** The corpus, in a fixed order. Order matters: the empty-copy designation
	    refusal has to run before anything fills the copy in. */
	function corpus(): Probe[] {
		return [
			// --- designating BEFORE anything is written ------------------------
			{
				name: 'designate an empty copy',
				run: () => answer(teacher, 'public.classroom_designate_instructor_key($1::uuid)', [specItem])
			},
			{
				name: 'undesignate when nothing is designated',
				run: () =>
					answer(teacher, 'public.classroom_undesignate_instructor_key($1::uuid)', [specItem])
			},

			// --- the spec arm ---------------------------------------------------
			{ name: 'save into a textField', run: save('sp-text', { text: 'The vise was square.' }) },
			{
				name: 'save into a table',
				run: save('sp-table', { rows: [{ pass: '1', reading: '2.50' }] })
			},
			{ name: 'save into a checklist', run: save('sp-check', { checked: [true] }) },
			{
				name: 'save into an imageZone (refused: not a typed response)',
				run: save('sp-image', { text: 'x' })
			},
			{ name: 'save into an instructions block, which has no id', run: save('(none)', { text: 'x' }) },
			{ name: 'save into a block id no spec carries', run: save('no-such-block', { text: 'x' }) },
			{ name: 'save over the same block twice (the upsert)', run: save('sp-text', { text: 'Squared again.' }) },
			{ name: 'save a value over the size cap', run: save('sp-text', { text: 'x'.repeat(120000) }) },
			{ name: 'save a null value', run: save('sp-text', null) },
			{
				name: 'save the declaration, which an instructor copy never carries',
				run: save('@declaration', { checked: [true] })
			},
			{ name: 'save on an item with no spec at all', run: () => save('sp-text', { text: 'x' }, bareItem)() },
			// THE TWO ORDER-OF-REFUSALS PROBES. 0128 raises about the spec BEFORE
			// it looks at the value and BEFORE it refuses the declaration, and an
			// engine discriminator inserted ahead of the spec lookup is precisely
			// the edit that could reorder either pair.
			{
				name: 'save a null value on an item with no spec at all',
				run: () => save('sp-text', null, bareItem)()
			},
			{
				name: 'save the declaration on an item with no spec at all',
				run: () => save('@declaration', { checked: [true] }, bareItem)()
			},
			// --- the authorization arm, which runs before any of the above -------
			{ name: 'save as a STUDENT', run: save('sp-text', { text: 'x' }, undefined, student) },
			{
				name: 'save as an instructor who manages no section of this item',
				run: save('sp-text', { text: 'x' }, undefined, outsider)
			},
			{ name: 'save against a MATERIAL, which is not an assignment', run: () => save('sp-text', { text: 'x' }, materialItem)() },
			{
				name: 'save against an item id that does not exist',
				run: () => save('sp-text', { text: 'x' }, '00000000-0000-4000-8000-0000000000ff')()
			},

			// --- designating a FILLED copy, and taking it back -------------------
			{
				name: 'designate a filled copy',
				run: () => answer(teacher, 'public.classroom_designate_instructor_key($1::uuid)', [specItem])
			},
			{
				name: 'undesignate a key the caller authored',
				run: () =>
					answer(teacher, 'public.classroom_undesignate_instructor_key($1::uuid)', [specItem])
			},

			// --- THE POSITIVE CONTROLS: these MUST differ ------------------------
			{
				name: 'CONTROL: save into a ported module block (manifest, no spec)',
				control: true,
				run: () => save('hx-longtext', { text: 'A ported instructor answer.' }, portedItem)()
			},
			{
				name: 'CONTROL: save into a ported HEADER block',
				control: true,
				run: () => save('who', { text: 'A. Reyes' }, portedItem)()
			},
			{
				name: 'CONTROL: save into a ported checkbox block',
				control: true,
				run: () => save('hx-checkbox', { checked: [true] }, portedItem)()
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
		outsider = await createUser(db, 'nolan@boscotech.edu', 'T. Nolan');
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

		specItem = await createAssignment('Instructor gate corpus');
		bareItem = await createAssignment('Instructor gate corpus, no spec at all');
		materialItem = await createAssignment('Instructor gate corpus, a material', 'material');
		portedItem = await createAssignment('Instructor gate corpus, ported control');

		await rpc(teacher, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
			specItem,
			JSON.stringify(specWithEverything())
		]);
		await rpc(admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [
			portedItem,
			portedDocument(),
			JSON.stringify(portedManifest()),
			'bench.html'
		]);

		before = await runCorpus();
		await resetMutableState();
		await db.sql(readFileSync(MIGRATION, 'utf8'));
		after = await runCorpus();
	}, 300_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('applied 0199 over the same database the first pass ran against', async () => {
		const { rows } = await db.sql<{ n: number }>(
			`select count(*)::int as n from pg_proc
			 where pronamespace = 'public'::regnamespace
				and proname = 'classroom_save_instructor_response'
				and prosrc like '%_classroom_html_manifest%'`
		);
		expect(rows[0].n).toBe(1);
		// EXACTLY ONE ROW, so the replace at an identical argument list did not
		// leave a second overload behind.
		const { rows: arities } = await db.sql<{ n: number }>(
			`select count(*)::int as n from pg_proc
			 where pronamespace = 'public'::regnamespace
				and proname = 'classroom_save_instructor_response'`
		);
		expect(arities[0].n).toBe(1);
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
		console.log(
			`    [spec path] ${compared} spec-path case(s) compared, ${differences.length} difference(s)`
		);
		// A sweep that generated nothing must not pass: this is the case count.
		expect(compared).toBe(corpus().filter((p) => !p.control).length);
		expect(compared).toBeGreaterThanOrEqual(20);
		expect(differences).toEqual([]);
	});

	it('and the ported controls DID change, so a silent no-op apply cannot pass', () => {
		const controls = corpus().filter((p) => p.control);
		expect(controls).toHaveLength(3);
		for (const probe of controls) {
			const a = before.get(probe.name);
			const b = after.get(probe.name);
			console.log(
				`    [control] ${probe.name}\n        before: ${JSON.stringify(a)}\n        after:  ${JSON.stringify(b)}`
			);
			// Refused before: the deployed gate read the spec table and found none.
			expect(a).toHaveProperty('raised');
			expect((a as { raised: string }).raised).toContain('no interactive spec');
			// Accepted after.
			expect(b).toHaveProperty('ok');
			expect((b as { ok: { ok: boolean } }).ok.ok).toBe(true);
		}
	});

	// -----------------------------------------------------------------------
	// THE TWO GATES, PINNED EQUAL
	// -----------------------------------------------------------------------
	it('the two write gates accept exactly the same manifest block types', async () => {
		const studentAnswers: Record<string, boolean> = {};
		const instructorAnswers: Record<string, boolean> = {};
		for (const type of MANIFEST_TYPES) {
			const blockId = `hx-${type.toLowerCase()}`;
			const asStudent = await answer(
				student,
				'public.classroom_save_response($1::uuid, $2, $3::jsonb)',
				[portedItem, blockId, JSON.stringify({ text: 'a value' })]
			);
			const asTeacher = await save(blockId, { text: 'a value' }, portedItem)();
			studentAnswers[type] = 'ok' in asStudent;
			instructorAnswers[type] = 'ok' in asTeacher;
			console.log(
				`    [vocabulary] ${type}: student ${studentAnswers[type] ? 'accepted' : 'refused'}, instructor ${instructorAnswers[type] ? 'accepted' : 'refused'}`
			);
		}
		// THE POSITIVE CONTROL: a block id no manifest carries must be REFUSED by
		// both, or "they agreed" is only evidence that both accept everything.
		const unknownStudent = await answer(
			student,
			'public.classroom_save_response($1::uuid, $2, $3::jsonb)',
			[portedItem, 'no-such-block', JSON.stringify({ text: 'x' })]
		);
		const unknownTeacher = await save('no-such-block', { text: 'x' }, portedItem)();
		console.log(
			`    [vocabulary] control "no-such-block": student ${'ok' in unknownStudent ? 'accepted' : 'refused'}, instructor ${'ok' in unknownTeacher ? 'accepted' : 'refused'}`
		);
		expect(unknownStudent).toHaveProperty('raised');
		expect(unknownTeacher).toHaveProperty('raised');

		expect(instructorAnswers).toEqual(studentAnswers);
		// And both accepted all six, which is what says the agreement is at the
		// wide end rather than at a pair that refuses everything.
		expect(Object.values(instructorAnswers).filter(Boolean)).toHaveLength(MANIFEST_TYPES.length);
	});

	// -----------------------------------------------------------------------
	// THE ANSWER KEY, ON A PORTED COPY, WITH NO MIGRATION OF ITS OWN
	// -----------------------------------------------------------------------
	it('a ported instructor copy can be designated as the answer key', async () => {
		// The copy is already filled in by the corpus and the vocabulary check
		// above. `classroom_designate_instructor_key` keys on the PRESENCE of a
		// row, never on a block type, which is why 0199 did not have to touch it.
		const { rows: held } = await db.sql<{ n: number }>(
			'select count(*)::int as n from public.classroom_instructor_responses where item_id = $1',
			[portedItem]
		);
		expect(held[0].n).toBeGreaterThan(0);
		console.log(`    [key] the ported copy holds ${held[0].n} row(s)`);

		const designated = await rpc<{ ok: boolean; instructor_email?: string }>(
			teacher,
			'public.classroom_designate_instructor_key($1::uuid)',
			[portedItem]
		);
		console.log(`    [key] designate => ${JSON.stringify(designated)}`);
		expect(designated.ok).toBe(true);
		expect(designated.instructor_email).toBe(teacher.email);

		const keyEmail = await rpc<string | null>(
			teacher,
			'public.classroom_instructor_key_email($1::uuid)',
			[portedItem]
		);
		expect(keyEmail).toBe(teacher.email);

		const withdrawn = await rpc<{ ok: boolean }>(
			teacher,
			'public.classroom_undesignate_instructor_key($1::uuid)',
			[portedItem]
		);
		console.log(`    [key] undesignate => ${JSON.stringify(withdrawn)}`);
		expect(withdrawn.ok).toBe(true);
	});

	// -----------------------------------------------------------------------
	// THE BOUNDARY 0199 MUST NOT HAVE MOVED
	// -----------------------------------------------------------------------
	it('a student still cannot write or read an instructor copy of a ported item', async () => {
		// THE WRITE. `_classroom_instructor_copy_author` runs in the DECLARE
		// section, so it refuses before the engine discriminator is ever reached
		// -- which is the property that keeps the widening from being a widening
		// of who may write.
		const refused = await save('hx-longtext', { text: 'Not mine.' }, portedItem, student)();
		console.log(`    [boundary] a student saving an instructor response => ${JSON.stringify(refused)}`);
		expect(refused).toHaveProperty('raised');
		expect((refused as { raised: string }).raised).toContain('working copy');

		// THE READ, which is RLS and not this function at all. Asserted here
		// because a widened write path is exactly when somebody would think to
		// widen the policy beside it.
		const seen = await db.asUser(student.id, async (q) => {
			const { rows } = await q<{ block_id: string }>(
				'select block_id from public.classroom_instructor_responses where item_id = $1',
				[portedItem]
			);
			return rows;
		});
		console.log(`    [boundary] a student reading the ported instructor copy => ${seen.length} row(s)`);
		expect(seen).toHaveLength(0);

		// THE POSITIVE CONTROL on the same table, same item, same query: the
		// teacher sees the rows the student cannot, so the zero above is the
		// policy answering and not an empty table.
		const teacherSees = await db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ block_id: string }>(
				'select block_id from public.classroom_instructor_responses where item_id = $1',
				[portedItem]
			);
			return rows;
		});
		console.log(`    [boundary] the teacher reading the same rows => ${teacherSees.length} row(s)`);
		expect(teacherSees.length).toBeGreaterThan(0);
	});

	// -----------------------------------------------------------------------
	// THE ACL, READ BACK RATHER THAN TAKEN FROM THE SELF-CHECK'S VERDICT
	// -----------------------------------------------------------------------
	it('leaves the grants where 0128 and 0137 left them', async () => {
		const { rows } = await db.sql<{
			anon_save: boolean;
			authed_save: boolean;
			anon_manifest: boolean;
			authed_manifest: boolean;
			authed_designate: boolean;
		}>(
			`select
				has_function_privilege('anon', 'public.classroom_save_instructor_response(uuid, text, jsonb)', 'execute') as anon_save,
				has_function_privilege('authenticated', 'public.classroom_save_instructor_response(uuid, text, jsonb)', 'execute') as authed_save,
				has_function_privilege('anon', 'public._classroom_html_manifest(uuid)', 'execute') as anon_manifest,
				has_function_privilege('authenticated', 'public._classroom_html_manifest(uuid)', 'execute') as authed_manifest,
				has_function_privilege('authenticated', 'public.classroom_designate_instructor_key(uuid)', 'execute') as authed_designate`
		);
		console.log(`    [acl] ${JSON.stringify(rows[0])}`);
		expect(rows[0].anon_save).toBe(false);
		expect(rows[0].authed_save).toBe(true);
		expect(rows[0].anon_manifest).toBe(false);
		expect(rows[0].authed_manifest).toBe(false);
		expect(rows[0].authed_designate).toBe(true);
	});

	it('left no self-check fixture behind', async () => {
		const { rows } = await db.sql<{ n: number }>(
			`select count(*)::int as n from public.classroom_items
			 where id = '00000000-0000-4000-8000-000000000199'`
		);
		expect(rows[0].n).toBe(0);
	});
});
