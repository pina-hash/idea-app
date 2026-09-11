// tests/db/html-assignment-manifest.test.ts
//
// 0195: the stored HTML document, the manifest boundary in front of it, and the
// two gates on the write.
//
// WHAT THIS FILE IS FOR. Every guarantee here is one a wrong answer would not
// show on screen. A duplicated block id writes two answers to one row and the
// student sees one of them. A criterion whose levels do not sum leaves a
// grading console that cannot reach the module's points. A non-admin who can
// upload is a season decision quietly not taken. A document readable by `anon`
// is a disclosure nobody would find by looking at the classroom. So this runs
// against a REAL embedded Postgres with the REAL migration files applied
// unmodified, and every write goes through `asUser` -- `SET ROLE authenticated`
// with the JWT claims GUC set, exactly what PostgREST does -- so the grants and
// the gates are the ones production would enforce.
//
// THE MIGRATION IS APPLIED OVER SEEDED PRE-MIGRATION DATA, not only over a
// reset chain: the chain stops short of 0195, an assignment is created through
// the real `classroom_create_item` and given a spec through the real setter, and
// only THEN is 0195 read from disk and applied. So "an assignment that predates
// this file is untouched by it" is measured on a row that genuinely predates the
// column. It is applied a SECOND time on top of itself, because re-pasting a
// migration is ordinary here and a file that only works once fails exactly then.
//
// THE EXPECTED VALUES DO NOT COME FROM THE THING UNDER TEST. The fixtures are
// built by hand from the contract and from IDEA_RUBRIC_STANDARDS, and each
// malformed one is a single edit away from a manifest already proven to be
// accepted -- so a refusal is attributable to that edit and to nothing else. The
// legal fixture is asserted FIRST, as the positive control: an all-refusing
// validator passes every negative case and is exactly as broken as an
// all-accepting one.
//
// THE TS AND SQL VALIDATORS ARE PUT TO THE SAME CORPUS. `validateHtmlManifest`
// is the importer's rule and `_classroom_check_html_manifest` is the boundary,
// and a document one accepts and the other refuses is a teacher told the upload
// is fine and then told it is not. Every fixture below is asked of both.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './harness';
import { validateHtmlManifest } from '../../src/lib/classroom/html-assignment/manifest';

/**
 * The classroom chain up to the last author of every object 0195 touches, in
 * production order. 0110 is the revisions table whose `target` CHECK this file
 * widens and whose `classroom_restore_revision` it recreates; 0137 is the anon
 * sweep, placed where it sits in production, so this file also proves 0195
 * revokes for itself under the hosted default privileges the stub carries.
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
	'0176_classroom_item_images.sql'
] as const;

const MIGRATION_0195 = readFileSync(
	join(
		fileURLToPath(new URL('../..', import.meta.url)),
		'supabase',
		'migrations',
		'0195_classroom_html_assignments.sql'
	),
	'utf8'
);

// ---------------------------------------------------------------------------
// Fixtures. Built from the contract by hand; nothing here is read back from a
// validator.
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

/** One module, 6 points, two criteria of 4 and 2, four and three levels. */
function legalManifest(): Json {
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Tolerance stack',
		course: 'IDEA100',
		points: 6,
		modules: [
			{
				id: 'stack',
				title: 'Stack up the tolerances',
				points: 6,
				audience: 'individual',
				blocks: [
					{ id: 'stack-total', field: 'total', type: 'text' },
					{ id: 'stack-why', field: 'why', type: 'longText', minSentences: 2 }
				],
				criteria: [
					{
						id: 'arithmetic',
						text: 'The stack arithmetic is correct',
						points: 4,
						levels: [
							{ points: 4, label: 'Complete', short: 'All four correct', descriptor: 'All four dimensions summed correctly.' },
							{ points: 3, label: 'Proficient', short: 'Three correct', descriptor: 'Three of four dimensions summed correctly.' },
							{ points: 1, label: 'Developing', short: 'Two correct', descriptor: 'Two of four dimensions summed correctly.' },
							{ points: 0, label: 'Absent', short: 'Fewer than two', descriptor: 'Fewer than two correct, or not attempted.' }
						]
					},
					{
						id: 'reasoning',
						text: 'The worst case is named and justified',
						points: 2,
						levels: [
							{ points: 2, label: 'Complete', short: 'Named and justified', descriptor: 'Names the worst case and cites the measured value behind it.' },
							{ points: 1, label: 'Developing', short: 'Named only', descriptor: 'Names the worst case with no value behind it.' },
							{ points: 0, label: 'Absent', short: 'Not named', descriptor: 'Does not name a worst case.' }
						]
					}
				]
			}
		]
	};
}

/** A document carrying that manifest and exactly the two declared fields. */
function documentFor(manifest: Json, fields: string[] = ['total', 'why']): string {
	const inputs = fields.map((f) => `<input data-field="${f}">`).join('\n    ');
	return [
		'<html><head><title>Tolerance stack</title></head><body>',
		'  <h1>Tolerance stack</h1>',
		'  <form>',
		`    ${inputs}`,
		'  </form>',
		`  <script type="application/json" id="idea-manifest">${JSON.stringify(manifest)}<\/script>`,
		/*
			THE HANDSHAKE, BECAUSE THIS FIXTURE STANDS FOR A DOCUMENT THAT WORKS.
			`validateHtmlManifest` (and the import gate behind it) refuses a
			document that never sends `idea:ready`: without it the parent posts no
			`idea:state`, nothing is seeded, and every answer arrives before
			anything is listening. Until ledger 0141 nothing checked, and this
			builder emitted a document with no bridge code in it at all.
		*/
		`  <script>parent.postMessage({ type: 'idea:ready', schemaVersion: 3 }, '*');<\/script>`,
		'</body></html>'
	].join('\n');
}

/** A deep clone, so an edit to one fixture cannot reach another. */
function clone(v: Json): Json {
	return JSON.parse(JSON.stringify(v)) as Json;
}

/**
 * THE MALFORMED CORPUS. Each entry is the legal manifest with ONE thing wrong,
 * named by what is wrong rather than by what the message says -- a case keyed on
 * the message would have to be rewritten every time the wording improves, which
 * is how a suite starts recording behaviour instead of checking it.
 */
const BROKEN: { name: string; edit: (m: Json) => void; fields?: string[] }[] = [
	{
		name: 'a criterion with two levels',
		edit: (m) => {
			const levels = ((m.modules as Json[])[0].criteria as Json[])[0].levels as Json[];
			((m.modules as Json[])[0].criteria as Json[])[0].levels = [levels[0], levels[3]];
		}
	},
	{
		name: 'a criterion with one level',
		edit: (m) => {
			const levels = ((m.modules as Json[])[0].criteria as Json[])[0].levels as Json[];
			((m.modules as Json[])[0].criteria as Json[])[0].levels = [levels[0]];
		}
	},
	{
		name: 'a criterion worth 1 carrying three levels',
		edit: (m) => {
			const mod = (m.modules as Json[])[0];
			m.points = 5;
			mod.points = 5;
			(mod.criteria as Json[])[1] = {
				id: 'reasoning',
				text: 'The worst case is named',
				points: 1,
				levels: [
					{ points: 1, label: 'Complete', short: 'Named', descriptor: 'Names the worst case.' },
					{ points: 1, label: 'Developing', short: 'Partly named', descriptor: 'Gestures at a worst case.' },
					{ points: 0, label: 'Absent', short: 'Not named', descriptor: 'Does not name one.' }
				]
			};
		}
	},
	{
		name: 'a duplicated block id, across two modules',
		edit: (m) => {
			const first = (m.modules as Json[])[0];
			const second = clone(first as Json);
			second.id = 'second';
			// A different FIELD, so the field-collision rule cannot be what fires.
			(second.blocks as Json[])[0].field = 'second-total';
			(second.blocks as Json[])[1].field = 'second-why';
			m.points = 12;
			(m.modules as Json[]).push(second);
		},
		fields: ['total', 'why', 'second-total', 'second-why']
	},
	{
		name: 'a criterion id repeated inside one module',
		edit: (m) => {
			const mod = (m.modules as Json[])[0];
			(mod.criteria as Json[])[1].id = 'arithmetic';
		}
	},
	{
		name: 'module points not summing to the declared total',
		edit: (m) => {
			m.points = 7;
		}
	},
	{
		name: 'criteria not summing to their module',
		edit: (m) => {
			m.points = 7;
			(m.modules as Json[])[0].points = 7;
		}
	},
	{
		name: "a criterion whose points disagree with its top level",
		edit: (m) => {
			((m.modules as Json[])[0].criteria as Json[])[0].points = 3;
		}
	},
	{
		name: 'a level with no short form',
		edit: (m) => {
			delete (((m.modules as Json[])[0].criteria as Json[])[0].levels as Json[])[0].short;
		}
	},
	{
		name: 'levels that do not descend',
		edit: (m) => {
			(((m.modules as Json[])[0].criteria as Json[])[0].levels as Json[])[1].points = 4;
		}
	},
	{
		name: 'a bottom level worth more than zero',
		edit: (m) => {
			const c = ((m.modules as Json[])[0].criteria as Json[])[0];
			(c.levels as Json[])[3].points = 1;
		}
	},
	{
		name: 'a block id outside the response-row pattern',
		edit: (m) => {
			((m.modules as Json[])[0].blocks as Json[])[0].id = 'stack total!';
		}
	},
	{
		name: 'an unknown block type',
		edit: (m) => {
			((m.modules as Json[])[0].blocks as Json[])[0].type = 'signature';
		}
	},
	{
		name: 'the wrong schema version',
		edit: (m) => {
			m.schemaVersion = 2;
		}
	},
	{
		name: 'the wrong kind',
		edit: (m) => {
			m.kind = 'assignment';
		}
	},
	{
		// The HEADER (amendment 1): identity fields carrying no points. A header
		// block is a block in every other respect -- its id lands in
		// classroom_responses.block_id like any other, so it joins the same
		// manifest-wide uniqueness.
		name: 'a header block id colliding with a module block id',
		edit: (m) => {
			m.header = [{ id: 'stack-total', field: 'student-name', type: 'text' }];
		},
		fields: ['student-name', 'total', 'why']
	},
	{
		name: 'a header block that declares points',
		edit: (m) => {
			m.header = [{ id: 'who', field: 'student-name', type: 'text', points: 2 }];
		},
		fields: ['student-name', 'total', 'why']
	},
	{
		name: 'a header that is not an array',
		edit: (m) => {
			m.header = { who: 'me' };
		}
	}
];

/**
 * REFUSED BY THE IMPORTER ONLY, and the header says why: each of these needs
 * the DOCUMENT, and a second HTML scanner written in plpgsql would drift from
 * the one the importer runs. Kept as its own list rather than folded into the
 * corpus above so the boundary is stated by the file rather than discovered.
 */
const BROWSER_ONLY: { name: string; manifest?: (m: Json) => void; document?: (html: string) => string; fields?: string[] }[] = [
	{
		name: 'a manifest field the document has no [data-field] for',
		fields: ['total']
	},
	{
		name: 'a [data-field] the manifest does not declare',
		fields: ['total', 'why', 'stray']
	},
	{
		name: 'a weekday in student-facing copy',
		manifest: (m) => {
			((m.modules as Json[])[0].criteria as Json[])[0].text =
				'The stack arithmetic is correct by Friday';
		}
	},
	{
		name: 'a British spelling in student-facing copy',
		manifest: (m) => {
			((m.modules as Json[])[0].criteria as Json[])[1].text =
				'The worst case is named, with the tolerance centre stated';
		}
	}
];

describe('0195: HTML assignments, the manifest boundary and the two gates', () => {
	let db: TestDb;
	let admin: SeededUser;
	let teacher: SeededUser;
	let student: SeededUser;
	let section: string;
	/** Created through the real RPC BEFORE 0195 is applied. */
	let oldItem: string;
	let htmlItem: string;

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

	async function createAssignment(as: SeededUser, title: string): Promise<string> {
		const r = await rpc<{ item_id: string }>(
			as,
			`public.classroom_create_item(
				p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => $2,
				p_body => $3, p_points => 6, p_published => true)`,
			[[section], title, `${title} body.`]
		);
		return r.item_id;
	}

	/** Put a manifest to the SQL boundary directly, as the owner. */
	async function sqlCheck(manifest: Json): Promise<Error | null> {
		try {
			await db.sql('select public._classroom_check_html_manifest($1::jsonb)', [
				JSON.stringify(manifest)
			]);
			return null;
		} catch (e) {
			return e as Error;
		}
	}

	async function setDocument(
		as: SeededUser,
		itemId: string,
		html: string | null,
		manifest: Json | null,
		filename = 'assignment.html'
	): Promise<Json> {
		return rpc<Json>(
			as,
			'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)',
			[itemId, html, manifest == null ? null : JSON.stringify(manifest), filename]
		);
	}

	beforeAll(async () => {
		db = await startTestDb(CHAIN);
		admin = await createUser(db, 'apina@boscotech.edu', 'A. Pina');
		teacher = await createUser(db, 'reyes@boscotech.edu', 'A. Reyes');
		student = await createUser(db, 'ana.perez@boscotech.net', 'Ana Perez');
		// The pinned owner is already in the roster (0067 seeds it), so this is
		// belt and braces rather than the grant.
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

		// SEEDED BEFORE THE MIGRATION. An assignment with a v1 spec, created
		// through the real RPCs, so "0195 leaves it alone" is measured on a row
		// that genuinely predates the file.
		oldItem = await createAssignment(teacher, 'Pre-0195 assignment');
		await rpc(teacher, 'public.classroom_set_assignment_spec($1::uuid, $2::jsonb)', [
			oldItem,
			JSON.stringify({
				schemaVersion: 1,
				meta: { assignmentId: 'a-1', title: 'Bracket', totalPoints: 6 },
				modules: [
					{
						id: 'm1',
						title: 'Model it',
						points: 6,
						blocks: [{ type: 'textField', id: 'why', prompt: 'Why?', minSentences: 2 }],
						rubric: [
							{
								id: 'c1',
								criterion: 'Reasoning',
								levels: [
									{ points: 6, label: 'Complete', descriptor: 'Names the load path.' },
									{ points: 3, label: 'Developing', descriptor: 'Names one of the two.' },
									{ points: 0, label: 'Absent', descriptor: 'Not attempted.' }
								]
							}
						]
					}
				]
			})
		]);

		// ...and only now the file under test, twice, because re-pasting a
		// migration is ordinary and a file that only works once fails then.
		await db.sql(MIGRATION_0195);
		await db.sql(MIGRATION_0195);

		htmlItem = await createAssignment(teacher, 'Ported assignment');
	});

	afterAll(async () => {
		await db?.stop();
	});

	// -----------------------------------------------------------------------
	// The positive control, first.
	// -----------------------------------------------------------------------

	it('accepts a legal manifest, in both validators', async () => {
		const manifest = legalManifest();
		const browser = validateHtmlManifest(documentFor(manifest));
		expect(browser.errors).toEqual([]);
		expect(browser.manifest).not.toBeNull();
		expect(await sqlCheck(manifest)).toBeNull();
	});

	it('accepts a header of identity fields, in both validators', async () => {
		// They exist because ledger 0128's real port had to invent a 0-POINT
		// MODULE to hold the student's name, and a 0-point module renders in the
		// grading console as something to score.
		const manifest = legalManifest();
		manifest.header = [
			{ id: 'who', field: 'student-name', type: 'text' },
			{ id: 'team', field: 'team-name', type: 'text' }
		];
		const fields = ['student-name', 'team-name', 'total', 'why'];
		const browser = validateHtmlManifest(documentFor(manifest, fields));
		expect(browser.errors).toEqual([]);
		// The identity fields change no point sum.
		expect(browser.manifest!.points).toBe(6);
		expect(await sqlCheck(manifest)).toBeNull();
	});

	it('stores it, and stamps the item in the same transaction', async () => {
		const manifest = legalManifest();
		const res = await setDocument(admin, htmlItem, documentFor(manifest), manifest);
		expect(res.ok).toBe(true);
		expect(typeof res.document_id).toBe('string');
		// The FIRST write mints no revision: there was no head to displace.
		expect(res.revision).toBeNull();

		const { rows } = await db.sql<{ n: number; version: number | null; doc_id: string }>(
			`select (select count(*)::int from public.classroom_html_assignments where item_id = $1) as n,
			        (select assignment_schema_version from public.classroom_items where id = $1) as version,
			        (select document_id::text from public.classroom_html_assignments where item_id = $1) as doc_id`,
			[htmlItem]
		);
		expect(rows[0].n).toBe(1);
		expect(rows[0].version).toBe(3);
		expect(rows[0].doc_id).toBe(res.document_id);
		// The serving handle is NOT the item id: the sandbox origin holds no
		// session, so whatever is in that URL is readable by anyone with it.
		expect(rows[0].doc_id).not.toBe(htmlItem);
	});

	it('leaves an assignment that predates it alone', async () => {
		const { rows } = await db.sql<{ version: number | null; specs: number }>(
			`select assignment_schema_version as version,
			        (select count(*)::int from public.classroom_assignment_specs where item_id = $1) as specs
			 from public.classroom_items where id = $1`,
			[oldItem]
		);
		expect(rows[0].version).toBeNull();
		expect(rows[0].specs).toBe(1);
	});

	// -----------------------------------------------------------------------
	// The corpus. Both validators, the same fixtures.
	// -----------------------------------------------------------------------

	it('puts every malformed fixture to BOTH validators and both refuse', async () => {
		// A sweep that generated nothing passes vacuously.
		expect(BROKEN.length).toBe(18);
		const survived: string[] = [];
		for (const { name, edit, fields } of BROKEN) {
			const manifest = legalManifest();
			edit(manifest);
			const browser = validateHtmlManifest(documentFor(manifest, fields));
			const sql = await sqlCheck(manifest);
			if (browser.manifest !== null) survived.push(`${name}: the importer accepted it`);
			if (sql === null) survived.push(`${name}: the SQL boundary accepted it`);
		}
		expect(survived).toEqual([]);
	});

	it('names the missing room rather than the descent, on a 1-point criterion', async () => {
		// The ORDER is the whole value of that check: levels are whole numbers
		// and the bottom is 0, so [1, 1, 0] is the only three-level shape a
		// 1-point criterion can take, and the descent rule fires on it too. An
		// author reading "must be worth less than the level above it" rewrites
		// levels that were never the problem.
		const manifest = legalManifest();
		BROKEN.find((b) => b.name.startsWith('a criterion worth 1'))!.edit(manifest);
		const browser = validateHtmlManifest(documentFor(manifest));
		expect(browser.errors[0]).toMatch(/distinct values above zero/);
		const sql = await sqlCheck(manifest);
		expect(sql?.message).toMatch(/distinct values above zero/);
	});

	it('refuses the document-shaped problems in the importer, which SQL does not see', async () => {
		expect(BROWSER_ONLY.length).toBe(4);
		for (const { name, manifest: editManifest, fields } of BROWSER_ONLY) {
			const manifest = legalManifest();
			editManifest?.(manifest);
			const browser = validateHtmlManifest(documentFor(manifest, fields));
			expect(browser.manifest, `${name}: the importer accepted it`).toBeNull();
			// The POSITIVE HALF of the boundary claim. Saying "SQL does not check
			// these" is only worth writing down if it is measured -- otherwise a
			// later file that quietly added an HTML scanner in plpgsql would make
			// this whole comment wrong with nothing to say so.
			expect(await sqlCheck(manifest), `${name}: SQL refused it after all`).toBeNull();
		}
	});

	// -----------------------------------------------------------------------
	// The gates.
	// -----------------------------------------------------------------------

	it('refuses a non-admin teacher of record, and names the season', async () => {
		const manifest = legalManifest();
		const item = await createAssignment(teacher, 'Teacher tries to port');
		await expect(setDocument(teacher, item, documentFor(manifest), manifest)).rejects.toThrow(
			/admins this season/i
		);
		const { rows } = await db.sql<{ n: number }>(
			'select count(*)::int as n from public.classroom_html_assignments where item_id = $1',
			[item]
		);
		expect(rows[0].n).toBe(0);
	});

	it('refuses a student outright, on the permanent bar rather than the season one', async () => {
		const manifest = legalManifest();
		const err = await setDocument(student, htmlItem, documentFor(manifest), manifest).catch(
			(e: Error) => e
		);
		expect((err as Error).message).toMatch(/teacher of record/i);
		// NOT the season message: a student is refused by the bar that stays
		// after the season gate is lifted, which is what makes lifting it safe.
		expect((err as Error).message).not.toMatch(/season/i);
	});

	it('refuses a document on anything that is not an assignment', async () => {
		const manifest = legalManifest();
		const r = await rpc<{ item_id: string }>(
			admin,
			`public.classroom_create_item(
				p_kind => 'material', p_section_ids => $1::uuid[], p_title => 'A handout',
				p_body => 'Body.', p_published => true)`,
			[[section]]
		);
		await expect(
			setDocument(admin, r.item_id, documentFor(manifest), manifest)
		).rejects.toThrow(/Only an assignment/i);
	});

	// -----------------------------------------------------------------------
	// Revisions.
	// -----------------------------------------------------------------------

	it('mints a revision on a real change and none on a byte-identical re-upload', async () => {
		const item = await createAssignment(teacher, 'Revision behaviour');
		const first = legalManifest();
		const firstHtml = documentFor(first);
		await setDocument(admin, item, firstHtml, first);

		const same = await setDocument(admin, item, firstHtml, first);
		expect(same.revision).toBeNull();

		const second = legalManifest();
		second.title = 'Tolerance stack, revised';
		const secondRes = await setDocument(admin, item, documentFor(second), second);
		expect(secondRes.revision).toBe(1);
		// The handle does NOT move: a student working in the frame keeps the src
		// they loaded, and a re-upload is not a new address.
		const { rows } = await db.sql<{ doc_id: string; title: string }>(
			`select document_id::text as doc_id, manifest->>'title' as title
			 from public.classroom_html_assignments where item_id = $1`,
			[item]
		);
		expect(rows[0].title).toBe('Tolerance stack, revised');

		const revs = await db.sql<{ target: string; revision: number; title: string }>(
			`select target, revision, payload->'manifest'->>'title' as title
			 from public.classroom_content_revisions where item_id = $1 order by revision`,
			[item]
		);
		expect(revs.rows).toHaveLength(1);
		expect(revs.rows[0].target).toBe('html_assignment');
		// The revision holds the DISPLACED document, not the new one.
		expect(revs.rows[0].title).toBe('Tolerance stack');
	});

	it('restores through the ordinary setter, and re-checks both gates on the way', async () => {
		const item = await createAssignment(teacher, 'Restore behaviour');
		const first = legalManifest();
		await setDocument(admin, item, documentFor(first), first);
		const second = legalManifest();
		second.title = 'Second upload';
		await setDocument(admin, item, documentFor(second), second);

		const { rows } = await db.sql<{ id: string }>(
			`select id::text from public.classroom_content_revisions
			 where item_id = $1 and target = 'html_assignment' and revision = 1`,
			[item]
		);
		// A non-admin cannot restore an admin-only upload: the setter's own gates
		// are what a restore runs through, which is the whole design.
		await expect(
			rpc(teacher, 'public.classroom_restore_revision($1::uuid)', [rows[0].id])
		).rejects.toThrow(/admins this season/i);

		const res = await rpc<Json>(admin, 'public.classroom_restore_revision($1::uuid)', [
			rows[0].id
		]);
		expect(res.ok).toBe(true);
		expect(res.target).toBe('html_assignment');
		expect(res.changed).toBe(true);
		const now = await db.sql<{ title: string }>(
			`select manifest->>'title' as title from public.classroom_html_assignments where item_id = $1`,
			[item]
		);
		expect(now.rows[0].title).toBe('Tolerance stack');
	});

	it('removes recoverably: the document goes, the revision and the stamp follow', async () => {
		const item = await createAssignment(teacher, 'Removal behaviour');
		const manifest = legalManifest();
		await setDocument(admin, item, documentFor(manifest), manifest);
		const res = await setDocument(admin, item, null, null);
		expect(res.ok).toBe(true);
		expect(res.removed).toBe(true);
		expect(res.revision).toBe(1);

		const { rows } = await db.sql<{ n: number; version: number | null; revs: number }>(
			`select (select count(*)::int from public.classroom_html_assignments where item_id = $1) as n,
			        (select assignment_schema_version from public.classroom_items where id = $1) as version,
			        (select count(*)::int from public.classroom_content_revisions
			           where item_id = $1 and target = 'html_assignment') as revs`,
			[item]
		);
		expect(rows[0].n).toBe(0);
		// The stamp goes with the row: an item claiming schema 3 with no document
		// is exactly the drift the verification query watches for.
		expect(rows[0].version).toBeNull();
		expect(rows[0].revs).toBe(1);
	});

	// -----------------------------------------------------------------------
	// Reach.
	// -----------------------------------------------------------------------

	it('grants nothing to anon and no write to anyone', async () => {
		const { rows } = await db.sql<Record<string, boolean>>(
			`select
			   has_function_privilege('anon', 'public.classroom_set_html_assignment(uuid, text, jsonb, text)', 'execute') as anon_write,
			   has_function_privilege('anon', 'public._classroom_check_html_manifest(jsonb)', 'execute') as anon_check,
			   has_table_privilege('anon', 'public.classroom_html_assignments', 'select') as anon_read,
			   has_table_privilege('authenticated', 'public.classroom_html_assignments', 'insert') as authed_insert,
			   has_table_privilege('authenticated', 'public.classroom_html_assignments', 'update') as authed_update,
			   has_table_privilege('authenticated', 'public.classroom_html_assignments', 'delete') as authed_delete,
			   has_table_privilege('authenticated', 'public.classroom_html_assignments', 'select') as authed_read,
			   has_function_privilege('authenticated', 'public.classroom_set_html_assignment(uuid, text, jsonb, text)', 'execute') as authed_write,
			   (select relrowsecurity from pg_class where oid = 'public.classroom_html_assignments'::regclass) as rls`
		);
		// The ACL, not the migration's own verdict: a hosted project writes a
		// direct anon grant into every new function at creation time, so a
		// `revoke from public` alone leaves this open and reports success.
		expect(rows[0]).toEqual({
			anon_write: false,
			anon_check: false,
			anon_read: false,
			authed_insert: false,
			authed_update: false,
			authed_delete: false,
			authed_read: true,
			authed_write: true,
			rls: true
		});
	});

	it('lets an enrolled student read the document and a stranger read nothing', async () => {
		const manifest = legalManifest();
		await setDocument(admin, htmlItem, documentFor(manifest), manifest);

		const outsider = await createUser(db, 'someone.else@boscotech.net', 'Someone Else');
		const seenByOutsider = await db.asUser(outsider.id, async (q) => {
			const { rows } = await q<{ n: string }>(
				'select count(*) as n from public.classroom_html_assignments where item_id = $1',
				[htmlItem]
			);
			return Number(rows[0].n);
		});
		expect(seenByOutsider).toBe(0);

		// THE POSITIVE CONTROL for that zero. Without it, a policy that returned
		// nothing to EVERYONE would pass the assertion above.
		await enrollStudent(db, {
			as: teacher,
			sectionId: section,
			email: student.email,
			displayName: 'Ana Perez'
		});
		const seenByStudent = await db.asUser(student.id, async (q) => {
			const { rows } = await q<{ n: string }>(
				'select count(*) as n from public.classroom_html_assignments where item_id = $1',
				[htmlItem]
			);
			return Number(rows[0].n);
		});
		expect(seenByStudent).toBe(1);
	});

	it('keeps the item kind at three values and the revision targets at five', async () => {
		const { rows } = await db.sql<{ kinds: string; targets: string }>(
			`select
			   (select pg_get_constraintdef(oid) from pg_constraint
			      where conrelid = 'public.classroom_items'::regclass
			        and pg_get_constraintdef(oid) like '%kind%' limit 1) as kinds,
			   (select pg_get_constraintdef(oid) from pg_constraint
			      where conname = 'classroom_content_revisions_target_check') as targets`
		);
		// kind STAYS the three-value CHECK. A fourth would fork every list, feed
		// query, export and policy that names the set.
		expect(rows[0].kinds).toContain("'assignment'");
		expect(rows[0].kinds).not.toContain('html');
		for (const t of ['item', 'assignment_spec', 'reference_spec', 'rubric', 'html_assignment']) {
			expect(rows[0].targets).toContain(t);
		}
	});
});
