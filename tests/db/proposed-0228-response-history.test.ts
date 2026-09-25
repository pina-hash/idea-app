// tests/db/proposed-0228-response-history.test.ts
//
// THE PROPOSED 0228 (decision 37: an answer's edit history), APPLIED FROM ITS
// PROPOSED PATH OVER THE REAL CHAIN BELOW 0228 -- on 2026-09-25 that is 0001
// through 0224, which is exactly what production holds. Nothing here applies it
// anywhere else: the file under test lives in
// docs/feedback/2026-09-25/overnight/proposed/ and is read from there. When a
// session promotes it into supabase/migrations/, the ONE line to change is
// PROPOSAL below. The chain filter takes every file numbered BELOW 0228 rather
// than pinning 0224, so the first pass measures what production will hold just
// before 0228 applies: if 0225 to 0227 land first and one of them touches
// `classroom_save_response`, this file goes red (the diff guard refuses) instead
// of staying green over a chain production will no longer have.
//
// ===========================================================================
// WHAT THIS FILE PROVES, AND HOW EACH EXPECTED VALUE IS SOURCED
// ===========================================================================
//
//   1. THE GATE ANSWERS EXACTLY AS IT DID. CLAUDE.md's rule for a widened
//      write gate: put a corpus to the DEPLOYED function first, apply over the
//      SAME database, and compare case for case, refusal text included. The
//      corpus covers every branch of both arms (a spec assignment and a ported
//      worksheet), both locks (a student's own hand-in and an instructor's
//      close), grading, approval and every success. The expected value of each
//      case is the deployed function's own answer -- there is no table of
//      expected answers in this file to tune.
//   2. THE POSITIVE CONTROL. A corpus that matched is also what a migration
//      that silently did nothing produces, so the second pass must have written
//      history, and written it for exactly the keys the corpus says were
//      accepted and for none of the keys whose every save was refused. Both
//      counts are reported.
//   3. THE HISTORY RULE: a baseline for an answer stored before history, one
//      revision per block per 10-minute burst (measured from the start of the
//      burst), frozen at each grade, nothing for a write that changes nothing,
//      nothing for a refused write. The expected revisions are typed out from
//      decision 37's wording, never computed from the helper.
//   4. WHO READS IT. The teacher of record and an admin read it; the student,
//      a classmate and a teacher of another class read nothing; anon is
//      refused at the grant; no client role may write it. Both directions,
//      with the positive side non-empty so the absences are not vacuous.
//   5. WHY THE LOCK IS SPLIT OUT. Measured, not argued: 0198's close leaves a
//      student's own hand-in byte-identical, so no predicate over that row can
//      tell "turned in" from "turned in, then closed".
//   6. THE DIFF GUARD REFUSES a deployed save function that is not 0197's, and
//      the refusal leaves nothing behind. Then the file RE-APPLIES cleanly.
//
// The seed goes through the REAL pre-migration RPCs as the real roles
// (`asUser` is SET ROLE authenticated with the JWT claims GUC). Two things are
// done as the connection owner, each for a stated reason: shifting a
// revision's `started_at` back to stand in for ten minutes of wall clock, and
// stamping an item schema 3 with no document, which is a broken state no RPC
// produces and whose refusal the corpus still has to cover.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './harness';

/** THE ONE LINE TO CHANGE ON PROMOTION. */
const PROPOSAL = fileURLToPath(
	new URL(
		'../../docs/feedback/2026-09-25/overnight/proposed/0228_classroom_response_revisions.sql',
		import.meta.url
	)
);

/** Production's chain as it will stand just before this file: every migration
    numbered below 0228, in order (0001 to 0224 on 2026-09-25). If the file is
    promoted under a different number, this bound moves with it. */
const DEPLOYED = readdirSync(new URL('../../supabase/migrations', import.meta.url))
	.filter((f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) < 228)
	.sort();
const FIXTURE_COMPLETION = '../../tests/db/full-chain-fixture-completion.sql';

const LEVELS = (max: number) => [
	{ points: max, label: 'Complete', descriptor: 'All of it.' },
	{ points: max / 2, label: 'Developing', descriptor: 'Some of it.' },
	{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
];
const RUBRIC = [{ id: 'c1', criterion: 'Recorded', points: 2, levels: LEVELS(2) }];

/** Every branch the spec arm has: the three typed types, an imageZone, an id-less
    instructions block, a declaration, and an approval gate after module 1. */
function specWithEverything() {
	const rubric = (id: string) => [
		{
			id,
			criterion: 'Recorded',
			points: 2,
			levels: [
				{ points: 2, label: 'Complete', descriptor: 'Recorded with the value behind it.' },
				{ points: 1, label: 'Developing', descriptor: 'Recorded with no value.' },
				{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
			]
		}
	];
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
				rubric: rubric('mod-1-c')
			},
			{
				id: 'mod-2',
				title: 'Gated',
				points: 2,
				blocks: [
					{ type: 'textField', id: 'sp-gated', prompt: 'What changed?', minSentences: 1 },
					{ type: 'imageZone', id: 'sp-gated-image', minImages: 1, captions: true }
				],
				rubric: rubric('mod-2-c')
			}
		]
	};
}

function specWithoutDeclaration() {
	return { ...specWithEverything(), declarations: {}, approvalGate: null };
}

/** A one-block spec, for the items whose state a probe changes. */
function tinySpec(blockId: string) {
	return {
		schemaVersion: 1,
		meta: { assignmentId: blockId, title: blockId, totalPoints: 0 },
		modules: [
			{
				id: 'only',
				title: 'Only',
				points: 0,
				blocks: [
					{ type: 'textField', id: blockId, prompt: 'Anything?' },
					{ type: 'checklist', id: `${blockId}-check`, items: ['Done'] }
				]
			}
		]
	};
}

/** A ported worksheet declaring a header block and every one of the six types. */
function portedManifest() {
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Ported corpus',
		course: 'IDEA100',
		points: 2,
		header: [{ id: 'who', field: 'studentName', type: 'text' }],
		modules: [
			{
				id: 'p1',
				title: 'Every type',
				points: 2,
				blocks: [
					{ id: 'hx-text', field: 'f0', type: 'text' },
					{ id: 'hx-long', field: 'f1', type: 'longText', minSentences: 1 },
					{ id: 'hx-check', field: 'f2', type: 'checkbox' },
					{ id: 'hx-radio', field: 'f3', type: 'radio' },
					{ id: 'hx-table', field: 'f4', type: 'table' },
					{ id: 'hx-image', field: 'f5', type: 'image' }
				],
				criteria: [
					{
						id: 'p1-c',
						text: 'The blocks are recorded',
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
	'<html><head><title>Ported corpus</title></head><body>',
	...['studentName', 'f0', 'f1', 'f2', 'f3', 'f4', 'f5'].map((f) => `  <input data-field="${f}">`),
	`  <script type="application/json" id="idea-manifest">${JSON.stringify(portedManifest())}<\/script>`,
	'</body></html>'
].join('\n');

type Answer = { ok: unknown } | { raised: string };

/** A uuid minted by a call is not part of its answer; everything else is. */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
function stable(answer: Answer | undefined): string {
	return JSON.stringify(answer ?? null).replace(UUID_RE, '<uuid>');
}

function accepted(answer: Answer | undefined): boolean {
	return (
		!!answer &&
		'ok' in answer &&
		typeof answer.ok === 'object' &&
		answer.ok !== null &&
		(answer.ok as { ok?: unknown }).ok === true
	);
}

interface Probe {
	name: string;
	/** For a SAVE probe: the answer key it writes, so the positive control can
	    check history landed for accepted keys and nowhere else. */
	key?: () => { item: string; block: string };
	run: () => Promise<Answer>;
}

interface RevisionRow {
	revision: number;
	value: unknown;
	origin: string;
	started_at: Date;
	saved_at: Date;
	writes: number | null;
	after_grade_at: Date | null;
}

describe('proposed 0228: an answer keeps its edit history, and the save gate answers exactly as before', () => {
	let db: TestDb;
	let admin: SeededUser;
	let teacher: SeededUser;
	let otherTeacher: SeededUser;
	let ana: SeededUser; // the corpus student
	let ben: SeededUser; // the history student
	let cruz: SeededUser; // another teacher's student
	let outsider: SeededUser; // enrolled nowhere
	let section: string;
	let otherSection: string;

	// Corpus items.
	let specItem: string;
	let noDeclarationItem: string;
	let bareItem: string;
	let draftItem: string;
	let lockItem: string;
	let closedSpecItem: string;
	let gradeItem: string;
	let portedItem: string;
	let closedPortedItem: string;
	let brokenPortedItem: string;
	// History items.
	let hSpec: string;
	let hPorted: string;
	let splitItem: string;
	let otherItem: string;

	let before: Map<string, Answer>;
	let after: Map<string, Answer>;
	let guardRefusal: string | null = null;
	let tableAfterRefusal: string | null = 'not read';
	let tableBeforeApply: string | null = 'not read';
	let closeOverHandIn: {
		before: unknown;
		after: unknown;
		result: Record<string, unknown>;
	};

	async function rpc<T = unknown>(user: SeededUser, call: string, params: unknown[] = []): Promise<T> {
		return db.asUser(user.id, async (q) => {
			const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
			return rows[0].result;
		});
	}

	async function answer(user: SeededUser, call: string, params: unknown[] = []): Promise<Answer> {
		try {
			return { ok: await rpc(user, call, params) };
		} catch (e) {
			return { raised: (e as Error).message };
		}
	}

	const saveAs = (user: SeededUser, item: string, block: string, value: unknown) =>
		answer(user, 'public.classroom_save_response($1::uuid, $2, $3::jsonb)', [
			item,
			block,
			value === null ? null : JSON.stringify(value)
		]);

	const attachAs = (user: SeededUser, item: string, block: string | null) =>
		answer(
			user,
			`public.classroom_add_submission_file($1::uuid, $2, $3, $4, $5::bigint, $6, $7, $8)`,
			[item, 'drive-corpus-1', 'shot.jpg', 'image/jpeg', 1024, block, 'A caption', null]
		);

	const grade = (item: string, email: string, ret: boolean) =>
		rpc<{ ok: boolean }>(
			teacher,
			'public.classroom_grade_submission($1::uuid, $2, $3::jsonb, $4, $5, $6::jsonb)',
			[item, email, JSON.stringify({ c1: 2 }), null, ret, null]
		);

	async function createAssignment(title: string, as: SeededUser, into: string, published = true) {
		const r = await rpc<{ item_id: string }>(
			as,
			`public.classroom_create_item(
				p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => $2,
				p_body => $3, p_points => 4, p_published => $4)`,
			[[into], title, `${title} body.`, published]
		);
		return r.item_id;
	}

	async function setSpec(item: string, spec: unknown, as: SeededUser = teacher) {
		await rpc(as, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [item, JSON.stringify(spec)]);
	}
	async function setRubric(item: string, as: SeededUser = teacher) {
		await rpc(as, 'public.classroom_set_rubric($1::uuid, $2::jsonb)', [item, JSON.stringify(RUBRIC)]);
	}
	async function setPorted(item: string) {
		await rpc(admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [
			item,
			PORTED_DOCUMENT,
			JSON.stringify(portedManifest()),
			'corpus.html'
		]);
	}

	async function revisions(item: string, email: string, block: string): Promise<RevisionRow[]> {
		const { rows } = await db.sql<RevisionRow>(
			`select revision, value, origin, started_at, saved_at, writes, after_grade_at
			   from public.classroom_response_revisions
			  where item_id = $1 and student_email = $2 and block_id = $3
			  order by revision`,
			[item, email, block]
		);
		return rows;
	}

	async function gradedAt(item: string, email: string): Promise<Date | null> {
		const { rows } = await db.sql<{ graded_at: Date | null }>(
			'select graded_at from public.classroom_submissions where item_id = $1 and student_email = $2',
			[item, email]
		);
		return rows[0]?.graded_at ?? null;
	}

	async function tableExists(): Promise<string | null> {
		const { rows } = await db.sql<{ t: string | null }>(
			`select to_regclass('public.classroom_response_revisions')::text as t`
		);
		return rows[0].t;
	}

	/** The corpus. Every probe runs as `ana`, so the reset between the passes
	    touches her rows and nobody else's. */
	function corpus(): Probe[] {
		const k = (item: () => string, block: string) => () => ({ item: item(), block });
		const s = (name: string, item: () => string, block: string, value: unknown): Probe => ({
			name,
			key: k(item, block),
			run: () => saveAs(ana, item(), block, value)
		});
		return [
			// ---- classroom_save_response, the spec arm -----------------------
			s('spec: save into a textField', () => specItem, 'sp-text', { text: 'The vise was square.' }),
			s('spec: save into a table', () => specItem, 'sp-table', { rows: [{ pass: '1', reading: '2.50' }] }),
			s('spec: save into a checklist', () => specItem, 'sp-check', { checked: [true] }),
			s('spec: save into an imageZone (not a typed response)', () => specItem, 'sp-image', { text: 'x' }),
			s('spec: save into a block id no spec carries', () => specItem, 'no-such-block', { text: 'x' }),
			s('spec: save a value over the size cap', () => specItem, 'sp-text', { text: 'x'.repeat(120000) }),
			s('spec: save a null value', () => specItem, 'sp-text', null),
			s('spec: save on an item with no spec at all', () => bareItem, 'sp-text', { text: 'x' }),
			s('spec: save a null value on an item with no spec (refusal ORDER)', () => bareItem, 'sp-text', null),
			s('spec: the declaration where the spec declares one', () => specItem, '@declaration', { checked: [true] }),
			s('spec: the declaration where the spec declares none', () => noDeclarationItem, '@declaration', {
				checked: [true]
			}),
			s('spec: save into a GATED module with no approval', () => specItem, 'sp-gated', { text: 'Shimmed it.' }),
			{
				name: 'spec: grant the approval, then save into the gated module',
				key: k(() => specItem, 'sp-gated'),
				run: async () => {
					await rpc(teacher, 'public.classroom_approve_module($1::uuid, $2, $3, $4)', [
						specItem,
						ana.email,
						'mod-1',
						true
					]);
					return saveAs(ana, specItem, 'sp-gated', { text: 'Shimmed it.' });
				}
			},
			{
				name: 'spec: save as somebody not enrolled',
				run: () => saveAs(outsider, specItem, 'sp-text', { text: 'x' })
			},
			s('spec: save on an unpublished assignment', () => draftItem, 'sp-text', { text: 'x' }),
			s('spec: save the SAME value twice (second call)', () => specItem, 'sp-check', { checked: [true] }),
			{
				name: 'spec: grade and return, then save again',
				key: k(() => gradeItem, 'g-text'),
				run: async () => {
					await saveAs(ana, gradeItem, 'g-text', { text: 'Before the grade.' });
					await grade(gradeItem, ana.email, true);
					return saveAs(ana, gradeItem, 'g-text', { text: 'After the grade.' });
				}
			},

			// ---- classroom_add_submission_file, both arms --------------------
			{ name: 'attach: to a spec imageZone', run: () => attachAs(ana, specItem, 'sp-image') },
			{ name: 'attach: to a spec textField', run: () => attachAs(ana, specItem, 'sp-text') },
			{ name: 'attach: with no block id at all', run: () => attachAs(ana, specItem, null) },
			{ name: 'attach: to a ported image block', run: () => attachAs(ana, portedItem, 'hx-image') },
			{ name: 'attach: to a ported text block', run: () => attachAs(ana, portedItem, 'hx-long') },

			// ---- classroom_save_response, the manifest arm --------------------
			s('ported: save the HEADER text block', () => portedItem, 'who', 'Ana Perez'),
			s('ported: save a text block', () => portedItem, 'hx-text', 'Short answer'),
			s('ported: save a longText block', () => portedItem, 'hx-long', 'The vise was square to the table.'),
			s('ported: save a checkbox block', () => portedItem, 'hx-check', true),
			s('ported: save a radio block', () => portedItem, 'hx-radio', 'option-b'),
			s('ported: save a table block', () => portedItem, 'hx-table', JSON.stringify([{ a: '1' }])),
			s('ported: save a typed value into the image block', () => portedItem, 'hx-image', 'caption'),
			s('ported: save into a block id no manifest carries', () => portedItem, 'no-such-block', 'x'),
			s('ported: save the declaration (a manifest declares none)', () => portedItem, '@declaration', {
				checked: [true]
			}),
			s('ported: save a null value', () => portedItem, 'hx-long', null),
			s('ported: save a value over the size cap', () => portedItem, 'hx-long', 'x'.repeat(120000)),
			s('ported: save into a stamped item with no document', () => brokenPortedItem, 'hx-long', 'x'),
			{
				name: 'ported: grade (not returned), then save again',
				key: k(() => portedItem, 'hx-long'),
				run: async () => {
					await grade(portedItem, ana.email, false);
					return saveAs(ana, portedItem, 'hx-long', 'Edited after the grade.');
				}
			},

			// ---- the two locks, each on its own item, last ---------------------
			{
				name: 'lock: save after the student turned the work in',
				key: k(() => lockItem, 'lk-text'),
				run: async () => {
					await rpc(ana, 'public.classroom_submit_assignment($1::uuid)', [lockItem]);
					return saveAs(ana, lockItem, 'lk-text', { text: 'Too late.' });
				}
			},
			{
				name: 'lock: save after the instructor closed a spec assignment',
				key: k(() => closedSpecItem, 'cs-text'),
				run: async () => {
					await rpc(teacher, 'public.classroom_close_assignment($1::uuid, $2)', [closedSpecItem, ana.email]);
					return saveAs(ana, closedSpecItem, 'cs-text', { text: 'Closed.' });
				}
			},
			{
				name: 'lock: save after the instructor closed a ported worksheet',
				key: k(() => closedPortedItem, 'hx-long'),
				run: async () => {
					await rpc(teacher, 'public.classroom_close_assignment($1::uuid, $2)', [closedPortedItem, ana.email]);
					return saveAs(ana, closedPortedItem, 'hx-long', 'Closed.');
				}
			},
			{
				name: 'lock: attach after the instructor closed a ported worksheet',
				run: () => attachAs(ana, closedPortedItem, 'hx-image')
			}
		];
	}

	async function runCorpus(): Promise<Map<string, Answer>> {
		const out = new Map<string, Answer>();
		for (const probe of corpus()) out.set(probe.name, await probe.run());
		return out;
	}

	/** Ana's rows only, so the history student's pre-migration work survives. */
	async function resetAna() {
		await db.sql('delete from public.classroom_responses where student_email = $1', [ana.email]);
		await db.sql(
			`delete from public.classroom_submission_files where submission_id in
			   (select id from public.classroom_submissions where student_email = $1)`,
			[ana.email]
		);
		await db.sql('delete from public.classroom_module_approvals where student_email = $1', [ana.email]);
		await db.sql('delete from public.classroom_submissions where student_email = $1', [ana.email]);
	}

	beforeAll(async () => {
		db = await startTestDb([FIXTURE_COMPLETION, ...DEPLOYED]);
		admin = await createUser(db, 'apina@boscotech.edu', 'A. Pina');
		teacher = await createUser(db, 'reyes@boscotech.edu', 'A. Reyes');
		otherTeacher = await createUser(db, 'oyelaran@boscotech.edu', 'T. Oyelaran');
		ana = await createUser(db, 'ana.perez@boscotech.net', 'Ana Perez');
		ben = await createUser(db, 'ben.ortiz@boscotech.net', 'Ben Ortiz');
		cruz = await createUser(db, 'cruz.diaz@boscotech.net', 'Cruz Diaz');
		outsider = await createUser(db, 'luis.gomez@boscotech.net', 'Luis Gomez');
		await db.sql('insert into public.app_admins (email, granted_by) values ($1, $1) on conflict do nothing', [
			admin.email
		]);
		section = await createClassroomSection(db, {
			as: admin,
			courseCode: 'IDEA100',
			courseTitle: 'Introduction to Engineering',
			label: 'Period 3',
			teacherEmail: teacher.email
		});
		otherSection = await createClassroomSection(db, {
			as: admin,
			courseCode: 'IDEA209H',
			courseTitle: 'Engineering I Honors',
			label: 'Period 5',
			teacherEmail: otherTeacher.email
		});
		for (const s of [ana, ben]) {
			await enrollStudent(db, { as: teacher, sectionId: section, email: s.email, displayName: s.email });
		}
		await enrollStudent(db, { as: otherTeacher, sectionId: otherSection, email: cruz.email, displayName: cruz.email });

		specItem = await createAssignment('Gate corpus', teacher, section);
		noDeclarationItem = await createAssignment('No declaration', teacher, section);
		bareItem = await createAssignment('No spec at all', teacher, section);
		draftItem = await createAssignment('Unpublished', teacher, section, false);
		lockItem = await createAssignment('Turned in', teacher, section);
		closedSpecItem = await createAssignment('Closed spec', teacher, section);
		gradeItem = await createAssignment('Graded', teacher, section);
		portedItem = await createAssignment('Ported corpus', teacher, section);
		closedPortedItem = await createAssignment('Closed ported', teacher, section);
		brokenPortedItem = await createAssignment('Broken ported', teacher, section);
		hSpec = await createAssignment('History spec', teacher, section);
		hPorted = await createAssignment('History ported', teacher, section);
		splitItem = await createAssignment('Why the lock is split', teacher, section);
		otherItem = await createAssignment('Another class', otherTeacher, otherSection);

		await setSpec(specItem, specWithEverything());
		await setSpec(noDeclarationItem, specWithoutDeclaration());
		await setSpec(draftItem, specWithoutDeclaration());
		await setSpec(lockItem, tinySpec('lk-text'));
		await setSpec(closedSpecItem, tinySpec('cs-text'));
		await setSpec(gradeItem, tinySpec('g-text'));
		await setRubric(gradeItem);
		await setSpec(hSpec, tinySpec('h-text'));
		await setRubric(hSpec);
		await setSpec(splitItem, tinySpec('sp-split'));
		await setSpec(otherItem, tinySpec('o-text'), otherTeacher);
		for (const id of [portedItem, closedPortedItem, hPorted]) await setPorted(id);
		await setRubric(portedItem);
		await setRubric(hPorted);
		// A stamped item with no document: a broken state no RPC produces, whose
		// refusal is still part of the gate a student can meet.
		await db.sql('update public.classroom_items set assignment_schema_version = 3 where id = $1', [
			brokenPortedItem
		]);

		// ---- pass one: the DEPLOYED gate ----------------------------------------
		tableBeforeApply = await tableExists();
		before = await runCorpus();
		await resetAna();

		// ---- the history student's work, written BEFORE the migration ----------
		expect(accepted(await saveAs(ben, hSpec, 'h-text', { text: 'First draft.' }))).toBe(true);
		expect((await grade(hSpec, ben.email, false)).ok).toBe(true);
		expect(accepted(await saveAs(ben, hPorted, 'hx-long', 'Pre-migration answer.'))).toBe(true);

		// ---- why the lock is split: a close over a hand-in, measured -----------
		expect(accepted(await saveAs(ben, splitItem, 'sp-split', { text: 'Done.' }))).toBe(true);
		await rpc(ben, 'public.classroom_submit_assignment($1::uuid)', [splitItem]);
		const rowOf = async () =>
			(
				await db.sql<{ r: unknown }>(
					'select to_jsonb(s) as r from public.classroom_submissions s where item_id = $1 and student_email = $2',
					[splitItem, ben.email]
				)
			).rows[0].r;
		const rowBefore = await rowOf();
		const closeResult = await rpc<Record<string, unknown>>(
			teacher,
			'public.classroom_close_assignment($1::uuid, $2)',
			[splitItem, ben.email]
		);
		closeOverHandIn = { before: rowBefore, after: await rowOf(), result: closeResult };

		// ---- the diff guard: a save function that is not 0197's is refused -----
		const { rows: src } = await db.sql<{ src: string }>(
			`select prosrc as src from pg_proc where oid = 'public.classroom_save_response(uuid, text, jsonb)'::regprocedure`
		);
		const original = src[0].src;
		const recreate = (body: string) =>
			db.sql(
				`create or replace function public.classroom_save_response(p_item_id uuid, p_block_id text, p_value jsonb)
				 returns jsonb language plpgsql security definer set search_path = '' as $body$${body}$body$`
			);
		await recreate(original.replace('begin\n', 'begin\n\t-- a hotfix nobody folded into 0228\n'));
		try {
			await db.sql(readFileSync(PROPOSAL, 'utf8'));
		} catch (e) {
			guardRefusal = (e as Error).message;
		}
		tableAfterRefusal = await tableExists();
		await recreate(original);
		const { rows: restored } = await db.sql<{ same: boolean }>(
			`select prosrc = $1 as same from pg_proc where oid = 'public.classroom_save_response(uuid, text, jsonb)'::regprocedure`,
			[original]
		);
		expect(restored[0].same).toBe(true);

		// ---- apply the proposal, from its proposed path, over the same database -
		await db.sql(readFileSync(PROPOSAL, 'utf8'));

		// ---- pass two: the same corpus -----------------------------------------
		after = await runCorpus();
	}, 300_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('refused to replace a save function that is not 0197s, and left nothing behind', () => {
		console.log(`    [diff guard] ${guardRefusal}`);
		expect(guardRefusal).toContain('0228: the deployed classroom_save_response is not 0197');
		expect(tableAfterRefusal).toBeNull();
		expect(tableBeforeApply).toBeNull();
	});

	it('applied from its proposed path: one table, one policy, one overload, no defaults', async () => {
		expect(await tableExists()).toBe('classroom_response_revisions');
		const { rows } = await db.sql<{ n: number; defaults: number; records: number; policies: number }>(
			`select
			   (select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace
			      and proname = 'classroom_save_response') as n,
			   (select pronargdefaults::int from pg_proc
			      where oid = 'public.classroom_save_response(uuid, text, jsonb)'::regprocedure) as defaults,
			   (select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace
			      and proname = 'classroom_save_response' and prosrc like '%_classroom_response_revision%') as records,
			   (select count(*)::int from pg_policy
			      where polrelid = 'public.classroom_response_revisions'::regclass) as policies`
		);
		expect(rows[0]).toEqual({ n: 1, defaults: 0, records: 1, policies: 1 });
	});

	it('answers every spec-path and manifest-path case identically, refusal text included', () => {
		const differences: string[] = [];
		let compared = 0;
		let refusals = 0;
		for (const probe of corpus()) {
			compared += 1;
			const a = stable(before.get(probe.name));
			const b = stable(after.get(probe.name));
			if (!accepted(before.get(probe.name))) refusals += 1;
			console.log(`    [corpus] ${probe.name}\n        ${a}`);
			if (a !== b) differences.push(`${probe.name}\n  before: ${a}\n  after:  ${b}`);
		}
		console.log(`    [corpus] ${compared} case(s) compared, ${refusals} of them refusals, ${differences.length} difference(s)`);
		expect(compared).toBe(corpus().length);
		expect(compared).toBeGreaterThanOrEqual(38);
		// Both kinds are present, so "identical" covers refusals AND successes.
		expect(refusals).toBeGreaterThanOrEqual(15);
		expect(compared - refusals).toBeGreaterThanOrEqual(15);
		expect(differences).toEqual([]);
	});

	it('and the second pass wrote history for every accepted key and for no refused one', async () => {
		const keys = new Map<string, { item: string; block: string; anyAccepted: boolean }>();
		for (const probe of corpus()) {
			if (!probe.key) continue;
			const { item, block } = probe.key();
			const id = `${item}/${block}`;
			const entry = keys.get(id) ?? { item, block, anyAccepted: false };
			// A save probe's own answer decides; the grade probe's answer is its
			// final save, so an accepted key there has at least one revision.
			if (accepted(after.get(probe.name))) entry.anyAccepted = true;
			keys.set(id, entry);
		}
		let withHistory = 0;
		let withoutHistory = 0;
		const wrong: string[] = [];
		for (const [id, k] of keys) {
			const n = (await revisions(k.item, ana.email, k.block)).length;
			if (k.anyAccepted) {
				withHistory += 1;
				if (n < 1) wrong.push(`${id}: accepted, but ${n} revision(s)`);
			} else {
				withoutHistory += 1;
				if (n !== 0) wrong.push(`${id}: every save refused, yet ${n} revision(s)`);
			}
		}
		console.log(
			`    [control] ${withHistory} accepted key(s) carry history; ${withoutHistory} refused key(s) carry none`
		);
		expect(withHistory).toBeGreaterThanOrEqual(10);
		expect(withoutHistory).toBeGreaterThanOrEqual(8);
		expect(wrong).toEqual([]);
	});

	it('a save that changes nothing records nothing: the same checklist value twice is ONE write', async () => {
		const rows = await revisions(specItem, ana.email, 'sp-check');
		expect(rows).toHaveLength(1);
		expect(rows[0].writes).toBe(1);
	});

	it('a grade inside the corpus froze the graded value (spec, returned; ported, not returned)', async () => {
		for (const [item, block, beforeValue, afterValue] of [
			[gradeItem, 'g-text', { text: 'Before the grade.' }, { text: 'After the grade.' }],
			[portedItem, 'hx-long', 'The vise was square to the table.', 'Edited after the grade.']
		] as const) {
			const rows = await revisions(item, ana.email, block);
			const graded = await gradedAt(item, ana.email);
			expect(graded).not.toBeNull();
			expect(rows.map((r) => [r.revision, r.value, r.after_grade_at?.getTime() ?? null])).toEqual([
				[1, beforeValue, null],
				[2, afterValue, graded!.getTime()]
			]);
		}
	});

	it('WHY THE LOCK IS SPLIT: 0198 leaves a student hand-in byte-identical when it closes it', () => {
		console.log(`    [split] close result: ${JSON.stringify(closeOverHandIn.result)}`);
		const results = closeOverHandIn.result.results as Array<Record<string, unknown>>;
		expect(results).toHaveLength(1);
		expect(results[0].changed).toBe(false);
		expect(closeOverHandIn.after).toEqual(closeOverHandIn.before);
		expect((closeOverHandIn.after as { state: string }).state).toBe('submitted');
		expect((closeOverHandIn.after as { submitted_at: string | null }).submitted_at).not.toBeNull();
	});

	it('and the lock is UNCHANGED by 0228: that closed hand-in still refuses a save', async () => {
		const a = await saveAs(ben, splitItem, 'sp-split', { text: 'After the close.' });
		expect(a).toEqual({ ok: { ok: false, reason: 'locked' } });
		expect(await revisions(splitItem, ben.email, 'sp-split')).toHaveLength(0);
	});

	it('the first overwrite of a pre-migration graded answer keeps it as a baseline, then starts after the grade', async () => {
		const graded = await gradedAt(hSpec, ben.email);
		expect(graded).not.toBeNull();
		expect(accepted(await saveAs(ben, hSpec, 'h-text', { text: 'Edited after the grade.' }))).toBe(true);
		const rows = await revisions(hSpec, ben.email, 'h-text');
		expect(
			rows.map((r) => [r.revision, r.origin, r.value, r.writes, r.after_grade_at?.getTime() ?? null])
		).toEqual([
			// Written BEFORE the grade, so it carries no grade.
			[1, 'baseline', { text: 'First draft.' }, null, null],
			[2, 'save', { text: 'Edited after the grade.' }, 1, graded!.getTime()]
		]);
		// Compared in SQL, at the column's microsecond precision: a JS Date keeps
		// milliseconds, and the save and the grade above land about 3 to 5 ms
		// apart here, which is too close to trust a truncated comparison with.
		const { rows: order } = await db.sql<{ before: boolean }>(
			`select v.started_at < s.graded_at as before
			   from public.classroom_response_revisions v
			   join public.classroom_submissions s
			     on s.item_id = v.item_id and s.student_email = v.student_email
			  where v.item_id = $1 and v.student_email = $2 and v.block_id = 'h-text' and v.revision = 1`,
			[hSpec, ben.email]
		);
		expect(order).toEqual([{ before: true }]);
	});

	it('coalesces a burst: a second edit inside the window replaces the head, and started_at does not move', async () => {
		const [, head] = await revisions(hSpec, ben.email, 'h-text');
		expect(accepted(await saveAs(ben, hSpec, 'h-text', { text: 'Edited twice.' }))).toBe(true);
		const rows = await revisions(hSpec, ben.email, 'h-text');
		expect(rows).toHaveLength(2);
		expect(rows[1].value).toEqual({ text: 'Edited twice.' });
		expect(rows[1].writes).toBe(2);
		expect(rows[1].started_at.getTime()).toBe(head.started_at.getTime());
		expect(rows[1].saved_at.getTime()).toBeGreaterThanOrEqual(head.saved_at.getTime());
	});

	it('the window is 10 minutes from the START of the burst: 9 minutes absorbs, 11 starts a new revision', async () => {
		// Standing in for wall-clock time: the burst is moved back, not the clock.
		const shift = (minutes: number) =>
			db.sql(
				`update public.classroom_response_revisions
				    set started_at = now() - make_interval(mins => $4), saved_at = now() - make_interval(mins => $4)
				  where item_id = $1 and student_email = $2 and block_id = $3 and revision = 2`,
				[hSpec, ben.email, 'h-text', minutes]
			);
		await shift(9);
		expect(accepted(await saveAs(ben, hSpec, 'h-text', { text: 'Nine minutes in.' }))).toBe(true);
		let rows = await revisions(hSpec, ben.email, 'h-text');
		expect(rows.map((r) => [r.revision, r.value, r.writes])).toEqual([
			[1, { text: 'First draft.' }, null],
			[2, { text: 'Nine minutes in.' }, 3]
		]);
		await shift(11);
		expect(accepted(await saveAs(ben, hSpec, 'h-text', { text: 'Eleven minutes in.' }))).toBe(true);
		rows = await revisions(hSpec, ben.email, 'h-text');
		expect(rows.map((r) => [r.revision, r.value, r.writes])).toEqual([
			[1, { text: 'First draft.' }, null],
			[2, { text: 'Nine minutes in.' }, 3],
			[3, { text: 'Eleven minutes in.' }, 1]
		]);
	});

	it('a REGRADE is a boundary too: the head standing at it is frozen and the next edit carries the new grade', async () => {
		const first = await gradedAt(hSpec, ben.email);
		expect((await grade(hSpec, ben.email, true)).ok).toBe(true);
		const second = await gradedAt(hSpec, ben.email);
		expect(second!.getTime()).toBeGreaterThan(first!.getTime());
		expect(accepted(await saveAs(ben, hSpec, 'h-text', { text: 'After the regrade.' }))).toBe(true);
		const rows = await revisions(hSpec, ben.email, 'h-text');
		expect(rows.map((r) => [r.revision, r.value, r.after_grade_at?.getTime() ?? null])).toEqual([
			[1, { text: 'First draft.' }, null],
			[2, { text: 'Nine minutes in.' }, first!.getTime()],
			[3, { text: 'Eleven minutes in.' }, first!.getTime()],
			[4, { text: 'After the regrade.' }, second!.getTime()]
		]);
	});

	it('a refused save writes no revision', async () => {
		const count = async () =>
			Number((await db.sql<{ n: string }>('select count(*) as n from public.classroom_response_revisions')).rows[0].n);
		const start = await count();
		const refused = [
			await saveAs(ben, hSpec, 'no-such-block', { text: 'x' }),
			await saveAs(ben, hSpec, 'h-text', { text: 'x'.repeat(120000) }),
			await saveAs(ben, hSpec, 'h-text', null),
			await saveAs(ben, hPorted, '@declaration', { checked: [true] }),
			await saveAs(ben, splitItem, 'sp-split', { text: 'Locked.' }),
			await saveAs(outsider, hSpec, 'h-text', { text: 'Not enrolled.' })
		];
		expect(refused.filter(accepted)).toHaveLength(0);
		expect(await count()).toBe(start);
	});

	it('ported path: a pre-migration answer gets a baseline; a block never answered starts at revision 1', async () => {
		expect(accepted(await saveAs(ben, hPorted, 'hx-long', 'Post-migration answer.'))).toBe(true);
		expect(accepted(await saveAs(ben, hPorted, 'who', 'Ben Ortiz'))).toBe(true);
		expect((await revisions(hPorted, ben.email, 'hx-long')).map((r) => [r.revision, r.origin, r.value])).toEqual([
			[1, 'baseline', 'Pre-migration answer.'],
			[2, 'save', 'Post-migration answer.']
		]);
		expect((await revisions(hPorted, ben.email, 'who')).map((r) => [r.revision, r.origin, r.value])).toEqual([
			[1, 'save', 'Ben Ortiz']
		]);
	});

	it('a teacher working copy (0199) writes no revision', async () => {
		const count = async () =>
			Number((await db.sql<{ n: string }>('select count(*) as n from public.classroom_response_revisions')).rows[0].n);
		const start = await count();
		const r = await rpc<{ ok: boolean }>(teacher, 'public.classroom_save_instructor_response($1::uuid, $2, $3::jsonb)', [
			hPorted,
			'hx-long',
			JSON.stringify('The teacher key.')
		]);
		expect(r.ok).toBe(true);
		expect(await count()).toBe(start);
	});

	it('READS: the teacher of record and an admin read it; the student, a classmate and another class teacher read nothing', async () => {
		// Another class's history, so the other teacher's zero is not vacuous.
		expect(accepted(await saveAs(cruz, otherItem, 'o-text', { text: 'Another class.' }))).toBe(true);

		const owner = async (where: string, params: unknown[]) =>
			Number(
				(await db.sql<{ n: string }>(`select count(*) as n from public.classroom_response_revisions where ${where}`, params))
					.rows[0].n
			);
		const seen = (user: SeededUser, where = 'true', params: unknown[] = []) =>
			db.asUser(user.id, async (q) =>
				Number(
					(await q<{ n: string }>(`select count(*) as n from public.classroom_response_revisions where ${where}`, params))
						.rows[0].n
				)
			);

		const benRows = await owner('student_email = $1', [ben.email]);
		const cruzRows = await owner('student_email = $1', [cruz.email]);
		const sectionRows = await owner('student_email = any ($1)', [[ana.email, ben.email]]);
		const all = await owner('true', []);

		const readings = {
			teacherOfBen: await seen(teacher, 'student_email = $1', [ben.email]),
			teacherAll: await seen(teacher),
			teacherOfCruz: await seen(teacher, 'student_email = $1', [cruz.email]),
			adminAll: await seen(admin),
			otherTeacherAll: await seen(otherTeacher),
			otherTeacherOfBen: await seen(otherTeacher, 'student_email = $1', [ben.email]),
			benOwn: await seen(ben),
			anaAll: await seen(ana),
			cruzOwn: await seen(cruz)
		};
		console.log(
			`    [reads] rows stored: ben ${benRows}, cruz ${cruzRows}, section ${sectionRows}, all ${all}; seen: ${JSON.stringify(readings)}`
		);
		expect(benRows).toBeGreaterThanOrEqual(6);
		expect(cruzRows).toBeGreaterThanOrEqual(1);
		// PRESENT
		expect(readings.teacherOfBen).toBe(benRows);
		expect(readings.teacherAll).toBe(sectionRows);
		expect(readings.adminAll).toBe(all);
		expect(readings.otherTeacherAll).toBe(cruzRows);
		// ABSENT
		expect(readings.teacherOfCruz).toBe(0);
		expect(readings.otherTeacherOfBen).toBe(0);
		expect(readings.benOwn).toBe(0);
		expect(readings.anaAll).toBe(0);
		expect(readings.cruzOwn).toBe(0);

		let anonError: string | null = null;
		try {
			await db.asAnon((q) => q('select count(*) from public.classroom_response_revisions'));
		} catch (e) {
			anonError = (e as Error).message;
		}
		expect(anonError).toMatch(/permission denied/);
	});

	it('WRITES: no client role may insert, update or delete a revision', async () => {
		const attempts: Record<string, string | null> = {};
		for (const [who, user] of [
			['teacher', teacher],
			['student', ben]
		] as const) {
			for (const [verb, statement, params] of [
				[
					'insert',
					`insert into public.classroom_response_revisions
					   (item_id, student_email, block_id, revision, value, origin, started_at, saved_at, writes)
					 values ($1, $2, 'forged', 1, '"x"', 'save', now(), now(), 1)`,
					[hSpec, ben.email]
				],
				['update', `update public.classroom_response_revisions set value = '"forged"'`, []],
				['delete', 'delete from public.classroom_response_revisions', []]
			] as const) {
				try {
					await db.asUser(user.id, (q) => q(statement, [...params]));
					attempts[`${who} ${verb}`] = null;
				} catch (e) {
					attempts[`${who} ${verb}`] = (e as Error).message;
				}
			}
		}
		console.log(`    [writes] ${JSON.stringify(attempts)}`);
		expect(Object.keys(attempts)).toHaveLength(6);
		for (const message of Object.values(attempts)) expect(message).toMatch(/permission denied/);
	});

	it('EXECUTE: anon cannot save; no client role can reach the history writer', async () => {
		let anonSave: string | null = null;
		try {
			await db.asAnon((q) =>
				q(`select public.classroom_save_response($1::uuid, 'h-text', '{"text":"x"}'::jsonb)`, [hSpec])
			);
		} catch (e) {
			anonSave = (e as Error).message;
		}
		expect(anonSave).toMatch(/permission denied for function classroom_save_response/);

		const helper = `select public._classroom_response_revision($1::uuid, $2, 'h-text', '"forged"'::jsonb)`;
		let studentHelper: string | null = null;
		try {
			await db.asUser(ben.id, (q) => q(helper, [hSpec, ben.email]));
		} catch (e) {
			studentHelper = (e as Error).message;
		}
		expect(studentHelper).toMatch(/permission denied for function _classroom_response_revision/);

		const { rows } = await db.sql<Record<string, boolean>>(
			`select
			   has_function_privilege('anon', 'public.classroom_save_response(uuid, text, jsonb)', 'execute') as anon_save,
			   has_function_privilege('authenticated', 'public.classroom_save_response(uuid, text, jsonb)', 'execute') as auth_save,
			   has_function_privilege('anon', 'public._classroom_response_revision(uuid, text, text, jsonb)', 'execute') as anon_helper,
			   has_function_privilege('authenticated', 'public._classroom_response_revision(uuid, text, text, jsonb)', 'execute') as auth_helper`
		);
		expect(rows[0]).toEqual({ anon_save: false, auth_save: true, anon_helper: false, auth_helper: false });
	});

	it('RE-APPLIES cleanly over itself: nothing duplicated, nothing lost, and saves still coalesce', async () => {
		const snapshot = async () =>
			(
				await db.sql<{ n: string; digest: string }>(
					`select count(*) as n, md5(coalesce(string_agg(to_jsonb(v)::text, '|' order by id), '')) as digest
					   from public.classroom_response_revisions v`
				)
			).rows[0];
		const beforeReapply = await snapshot();
		await db.sql(readFileSync(PROPOSAL, 'utf8'));
		const afterReapply = await snapshot();
		expect(afterReapply).toEqual(beforeReapply);

		const { rows } = await db.sql<{ n: number; policies: number }>(
			`select
			   (select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace
			      and proname in ('classroom_save_response', '_classroom_response_revision')) as n,
			   (select count(*)::int from pg_policy
			      where polrelid = 'public.classroom_response_revisions'::regclass) as policies`
		);
		expect(rows[0]).toEqual({ n: 2, policies: 1 });

		const head = (await revisions(hSpec, ben.email, 'h-text')).at(-1)!;
		expect(accepted(await saveAs(ben, hSpec, 'h-text', { text: 'After the re-apply.' }))).toBe(true);
		const next = (await revisions(hSpec, ben.email, 'h-text')).at(-1)!;
		expect([next.revision, next.value, next.writes]).toEqual([
			head.revision,
			{ text: 'After the re-apply.' },
			(head.writes ?? 0) + 1
		]);
	});
});
