// tests/notebook-session-guidance.test.ts
//
// 0123: a notebook check-in carries an instructor-authored GUIDANCE PROMPT.
//
// WHAT IS WORTH A TEST HERE, per this repo's rule that automated tests are for
// guarantees whose regression is SILENT. A prompt rendering in the wrong place
// fails visibly the first time anyone looks; none of the following does.
//
//   1. THE WRITE IS THE BOUNDARY. `notebook_set_session_guidance` is granted to
//      `authenticated` and reachable straight through PostgREST, so the manager
//      check inside its body is the only thing standing between a student and
//      an instruction every class reads. A row written by the wrong person
//      looks identical to a legitimate one.
//
//   2. THE GATE IS SHARED, NOT CLONED. `_classroom_doc_ok` is what refuses a
//      document outside the closed shape. A regression here stores markup, an
//      unknown node or a `javascript:` href in a column three classes render,
//      and nothing raises. The refusal cases include the `is distinct from`
//      trap (a run carrying no `text` key at all), because that one has bitten
//      this repo three times and its failure mode is ACCEPTANCE, not a skipped
//      check.
//
//   3. THE WRITE IS NARROW. The whole argument for a second RPC rather than a
//      parameter on `notebook_admin_upsert_session` is that the upsert is a
//      whole-row replace which also reconciles the section list. So this file
//      asserts the upsert did NOT gain a guidance parameter, and that a
//      guidance write moves nothing but `guidance_doc` -- not the label, not
//      the date, not the postings, and not another check-in's row.
//
//   4. NULL CLEARS, THROUGH THE NARROW WRITE ONLY. A clear that silently did
//      not clear leaves a stale instruction on screen, which reads as correct.
//
//   5. AUTHORED ONCE. One check-in posted to three classes is one prompt. If
//      the storage ever moved to the posting, every surface would still render
//      and the three copies would drift apart over a term.
//
//   6. RE-APPLYING. Migrations here are pasted in by hand, so a re-run is
//      ordinary (0088's lesson), and a re-run must not clobber a prompt already
//      authored.
//
// Deliberately NOT covered: where the prompt renders, what composes it, how an
// instructor edits it. This bundle ships no client code at all -- that is the
// deploy ordering, not an omission.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, startTestDb, type SeededUser, type TestDb } from './db/harness';
import { normalizeItemDoc } from '$lib/server/classroom-doc';
import {
	editorDoc,
	itemSchema,
	pmBold,
	pmBullets,
	pmDoc,
	pmHeading,
	pmItem,
	pmLink,
	pmPara,
	pmText
} from './rich-text-fixtures';

/**
 * The chain the live project carries through 0123: the notebook's own chain
 * (check-ins, postings, the Documentation Check link, soft delete and drafts)
 * UNIONED with the classroom rich-text chain, because `_classroom_doc_ok` and
 * `_classroom_doc_text` are the gate and the projection this migration reuses
 * rather than clones. 0122 is in it on purpose: the nested-list widening has to
 * reach the notebook through the shared function, and a chain stopping at 0108
 * could not tell a shared gate from a copied one.
 */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0069_notebook.sql',
	'0070_coin_economy.sql',
	'0071_notebook_optional_label.sql',
	'0075_notebook_optional_photo.sql',
	'0078_notebook_entry_notes.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0088_notebook_folders.sql',
	'0090_classroom_instructor_materials.sql',
	'0091_notebook_pin_and_activity.sql',
	'0092_classroom_reference_specs.sql',
	'0094_notebook_classroom_sections.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0097_notebook_documentation_check.sql',
	'0098_notebook_session_postings.sql',
	'0101_classroom_decks.sql',
	'0102_classroom_deck_uploads.sql',
	'0104_classroom_edit_visibility.sql',
	'0106_notebook_instructor_student_access.sql',
	'0108_classroom_rich_body.sql',
	'0109_classroom_scheduled_posting.sql',
	'0110_classroom_content_revisions.sql',
	'0114_notebook_note_entry_session.sql',
	'0116_notebook_soft_delete.sql',
	'0117_notebook_soft_delete_restore.sql',
	'0118_notebook_draft_state.sql',
	'0120_notebook_session_item_link.sql',
	'0122_rich_text_nested_lists.sql',
	'0123_notebook_session_guidance.sql',
	'0137_anon_execute_sweep.sql'
];

const MIGRATION_0123 = readFileSync(
	join(process.cwd(), 'supabase', 'migrations', '0123_notebook_session_guidance.sql'),
	'utf8'
);

let db: TestDb;

let owner: SeededUser; // the pinned 0067 admin
let teacherA: SeededUser; // P1 and P2
let teacherB: SeededUser; // P3 only
let alice: SeededUser; // student in P1

let p1: string;
let p2: string;
let p3: string;

/** A check-in in P1 only: teacherA manages it outright. */
let soloSession: string;
/** A check-in in P1 + P3: teacherA manages ONE of its two classes, teacherB the other. */
let splitSession: string;
/** A second P1 check-in, only ever read: the neighbour a write must not touch. */
let neighbourSession: string;

async function rpc<T = Record<string, unknown>>(
	userId: string,
	call: string,
	params: unknown[]
): Promise<T> {
	return db.asUser(userId, async (q) => {
		const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
		return rows[0].result;
	});
}

async function captureError(run: () => Promise<unknown>): Promise<{ message: string }> {
	try {
		await run();
	} catch (error) {
		return { message: (error as { message?: string }).message ?? String(error) };
	}
	throw new Error('Expected this statement to be rejected, but it succeeded.');
}

const createSession = async (
	userId: string,
	sectionIds: string[],
	unit: number,
	date: string,
	label: string
): Promise<string> =>
	(
		await rpc<{ session_id: string }>(
			userId,
			'public.notebook_admin_upsert_session($1::uuid[], $2::integer, $3::date, $4, null)',
			[sectionIds, unit, date, label]
		)
	).session_id;

type GuidanceResult = {
	session_id: string;
	cleared: boolean;
	length: number;
	updated: number;
};

const setGuidance = (userId: string, sessionId: string, doc: unknown) =>
	rpc<GuidanceResult>(
		userId,
		'public.notebook_set_session_guidance($1::uuid, $2::jsonb)',
		[sessionId, doc === undefined ? null : doc === null ? null : JSON.stringify(doc)]
	);

/** Raw jsonb text straight in, for the shapes no producer can emit. */
const setGuidanceRaw = (userId: string, sessionId: string, json: string) =>
	rpc<GuidanceResult>(userId, 'public.notebook_set_session_guidance($1::uuid, $2::jsonb)', [
		sessionId,
		json
	]);

/** The stored column, read as the connection owner: no RLS in the way. */
const guidanceOf = async (sessionId: string): Promise<unknown> =>
	(
		await db.sql<{ guidance_doc: unknown }>(
			'select guidance_doc from public.notebook_sessions where id = $1',
			[sessionId]
		)
	).rows[0].guidance_doc;

/** Every check-in row, whole, ordered: the before/after snapshot. */
const allSessions = async () =>
	(
		await db.sql(
			`select id, unit_number, session_date, session_label, created_by, created_at, guidance_doc
			   from public.notebook_sessions order by id`
		)
	).rows;

/** Every posting, whole: a guidance write must not reconcile a section list. */
const allPostings = async () =>
	(
		await db.sql(
			`select session_id, section_id, item_id from public.notebook_session_postings
			  order by session_id, section_id`
		)
	).rows;

// ---------------------------------------------------------------------------
// The valid fixture, built by the REAL producer.
// ---------------------------------------------------------------------------
//
// The stored shape is not typed out here. It is built by putting a document
// the EDITOR SCHEMA says the editor could hold through `normalizeItemDoc`, the
// server-side normalizer that produces every stored classroom document -- so
// the fixture is by construction something the real producer can emit, and a
// schema or normalizer change breaks it loudly instead of leaving this file
// asserting a shape nothing makes any more.
const GUIDANCE_PM = pmDoc(
	pmHeading(3, pmText('What to photograph')),
	pmPara(
		pmText('Photograph the '),
		pmText('assembled', [pmBold]),
		pmText(' fixture before you take it apart. See '),
		pmText('the rubric', [pmLink('https://ideabosco.com/classroom')]),
		pmText('.')
	),
	pmBullets(
		pmItem(pmPara(pmText('One wide shot, whole bench in frame'))),
		pmItem(pmPara(pmText('One close shot of the seam')))
	)
);

function storedGuidance(): unknown[] {
	const pm = editorDoc(itemSchema, GUIDANCE_PM);
	const res = normalizeItemDoc(pm);
	if (!res.ok) throw new Error(`The guidance fixture did not normalize: ${res.error}`);
	return res.doc as unknown[];
}

let GUIDANCE: unknown[];

/**
 * A NESTED list, in the stored shape, HAND-WRITTEN -- and it has to be.
 * 0122 widened `_classroom_doc_ok` to accept nesting and deliberately shipped
 * that gate AHEAD of the editor and normalizer that will emit it, so at this
 * commit nothing can produce this document. Read it as coverage of the SQL
 * predicate only, never as editor coverage.
 *
 * It earns its place here because it is the one shape that can tell a SHARED
 * gate from a CLONED one: a copy of `_classroom_doc_ok` frozen at 0108 would
 * still refuse this, and every other assertion in this file would pass.
 */
const NESTED_GUIDANCE = [
	{
		type: 'ul',
		items: [
			[
				{ text: 'One wide shot' },
				{ type: 'ul', items: [[{ text: 'Whole bench in frame' }]] }
			],
			[{ text: 'One close shot of the seam' }]
		]
	}
];

beforeAll(async () => {
	db = await startTestDb(CHAIN);

	owner = await createUser(db, 'apina@boscotech.edu', 'A Pina');
	teacherA = await createUser(db, 'teacher.a@boscotech.edu', 'Teacher A');
	teacherB = await createUser(db, 'teacher.b@boscotech.edu', 'Teacher B');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');

	const course = await rpc<{ course_id: string }>(
		owner.id,
		'public.classroom_upsert_course($1, $2)',
		['IDEA209H', 'IDEA 209H']
	);
	const section = async (label: string, block: string, teacherEmail: string) =>
		(
			await rpc<{ section_id: string }>(
				owner.id,
				'public.classroom_upsert_section($1::uuid, $2, $3, $4)',
				[course.course_id, label, block, teacherEmail]
			)
		).section_id;
	p1 = await section('Period 1', 'A', teacherA.email);
	p2 = await section('Period 2', 'B', teacherA.email);
	p3 = await section('Period 3', 'C', teacherB.email);

	await rpc(teacherA.id, 'public.classroom_set_enrollment($1::uuid, $2, $3, $4)', [
		p1,
		alice.email,
		'Alvarez, Alice',
		true
	]);

	soloSession = await createSession(teacherA.id, [p1], 1, '2026-09-08', 'Bench setup');
	splitSession = await createSession(owner.id, [p1, p3], 1, '2026-09-09', 'Shared teardown');
	neighbourSession = await createSession(teacherA.id, [p1], 2, '2026-09-15', 'Bearing notes');

	GUIDANCE = storedGuidance();
});

afterAll(async () => {
	await db?.stop();
});

// ---------------------------------------------------------------------------
// 0. The fixture is not vacuous.
// ---------------------------------------------------------------------------

describe('the fixture', () => {
	it('is what the real normalizer emits, and it exercises the gate', () => {
		// A fixture of three plain paragraphs would pass every assertion below
		// without touching the parts of the predicate worth testing, so name what
		// it actually carries: a heading, a list, a bold run and an href.
		const types = GUIDANCE.map((b) => (b as { type: string }).type);
		expect(types).toEqual(['h3', 'p', 'ul']);

		const runs = (GUIDANCE[1] as { runs: Record<string, unknown>[] }).runs;
		expect(runs.some((r) => r.bold === true)).toBe(true);
		expect(runs.some((r) => typeof r.href === 'string')).toBe(true);

		const list = GUIDANCE[2] as { items: unknown[][] };
		expect(list.items).toHaveLength(2);
	});

	it('the nested fixture really is nested', () => {
		// If this were flat, "the shared gate accepts a nested list" would pass
		// against a gate frozen at 0108 and prove nothing.
		const firstItem = (NESTED_GUIDANCE[0] as { items: unknown[][] }).items[0];
		expect(firstItem.some((node) => (node as { type?: string }).type === 'ul')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 1. The column.
// ---------------------------------------------------------------------------

describe('the column', () => {
	it('is jsonb, nullable, on the CANONICAL check-in, and nothing was backfilled', async () => {
		const { rows } = await db.sql<{ is_nullable: string; data_type: string }>(
			`select is_nullable, data_type from information_schema.columns
			  where table_schema = 'public' and table_name = 'notebook_sessions'
			    and column_name = 'guidance_doc'`
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].data_type).toBe('jsonb');
		expect(rows[0].is_nullable).toBe('YES');

		// Every check-in that existed before this migration has no prompt, which
		// is what "nothing to backfill" means as a number.
		const { rows: filled } = await db.sql<{ n: string }>(
			`select count(*) as n from public.notebook_sessions where guidance_doc is not null`
		);
		expect(Number(filled[0].n)).toBe(0);
	});

	it('is NOT on the posting: one check-in, one prompt', async () => {
		const { rows } = await db.sql(
			`select column_name from information_schema.columns
			  where table_schema = 'public' and table_name = 'notebook_session_postings'
			    and column_name like '%guidance%'`
		);
		expect(rows).toHaveLength(0);
	});

	it('keeps 0069 write grants: the table is still SELECT-only for clients', async () => {
		const { rows } = await db.sql<{ grantee: string; privilege_type: string }>(
			`select grantee, privilege_type from information_schema.role_table_grants
			  where table_schema = 'public' and table_name = 'notebook_sessions'
			    and grantee in ('anon', 'authenticated')
			  order by grantee, privilege_type`
		);
		expect(rows).toEqual([{ grantee: 'authenticated', privilege_type: 'SELECT' }]);
	});
});

// ---------------------------------------------------------------------------
// 2. The function's own shape.
// ---------------------------------------------------------------------------

describe('notebook_set_session_guidance', () => {
	it('is exactly ONE overload, security definer, with an empty search_path', async () => {
		const { rows } = await db.sql<{
			nargs: number;
			argnames: string[];
			prosecdef: boolean;
			proconfig: string[] | null;
		}>(
			`select pronargs as nargs, proargnames as argnames, prosecdef, proconfig
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'notebook_set_session_guidance'`
		);
		// The signature trap: a second surviving arity is one PostgREST cannot
		// resolve at all.
		expect(rows).toHaveLength(1);
		expect(rows[0].nargs).toBe(2);
		expect(rows[0].argnames).toEqual(['p_session_id', 'p_guidance_doc']);
		expect(rows[0].prosecdef).toBe(true);
		expect(rows[0].proconfig).toEqual(['search_path=""']);
	});

	it('is revoked from public and anon, granted to authenticated', async () => {
		const { rows } = await db.sql<{
			pub: boolean;
			anon: boolean;
			authed: boolean;
		}>(
			`select has_function_privilege('public', p.oid, 'execute') as pub,
			        has_function_privilege('anon', p.oid, 'execute') as anon,
			        has_function_privilege('authenticated', p.oid, 'execute') as authed
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'notebook_set_session_guidance'`
		);
		expect(rows[0].pub).toBe(false);
		expect(rows[0].anon).toBe(false);
		expect(rows[0].authed).toBe(true);
	});

	it('did NOT arrive as a parameter on notebook_admin_upsert_session', async () => {
		// The whole argument for a narrow write. The upsert is a whole-row
		// replace that also reconciles the section list, so a null guidance
		// argument there would have to travel beside a null section list.
		const { rows } = await db.sql<{ nargs: number; argnames: string[] }>(
			`select pronargs as nargs, proargnames as argnames
			   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'notebook_admin_upsert_session'`
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].nargs).toBe(5);
		expect(rows[0].argnames).toEqual([
			'p_section_ids',
			'p_unit_number',
			'p_session_date',
			'p_session_label',
			'p_id'
		]);
	});
});

// ---------------------------------------------------------------------------
// 3. A manager writes, and everyone in the class reads it back.
// ---------------------------------------------------------------------------

describe('the write', () => {
	it('a manager writes a prompt and it round-trips byte for byte', async () => {
		const result = await setGuidance(teacherA.id, soloSession, GUIDANCE);
		expect(result.updated).toBe(1);
		expect(result.cleared).toBe(false);
		expect(result.length).toBeGreaterThan(0);

		expect(await guidanceOf(soloSession)).toEqual(GUIDANCE);
	});

	it('a student in the class reads the prompt through RLS', async () => {
		// notebook_sessions is readable by any signed-in user (0069), which is
		// how the prompt reaches the person it was written for.
		const read = await db.asUser(alice.id, async (q) => {
			const { rows } = await q<{ guidance_doc: unknown }>(
				'select guidance_doc from public.notebook_sessions where id = $1',
				[soloSession]
			);
			return rows[0]?.guidance_doc ?? null;
		});
		expect(read).toEqual(GUIDANCE);
	});

	it('one check-in in three classes carries ONE prompt, in all of them', async () => {
		const shared = await createSession(
			owner.id,
			[p1, p2, p3],
			3,
			'2026-10-06',
			'Cross-class check-in'
		);
		await setGuidance(owner.id, shared, GUIDANCE);

		const { rows } = await db.sql<{ section_id: string; guidance_doc: unknown }>(
			`select pg.section_id, ss.guidance_doc
			   from public.notebook_session_postings pg
			   join public.notebook_sessions ss on ss.id = pg.session_id
			  where pg.session_id = $1 order by pg.section_id`,
			[shared]
		);
		expect(rows).toHaveLength(3);
		for (const row of rows) expect(row.guidance_doc).toEqual(GUIDANCE);

		// And it is one ROW, not three: there is nothing here to drift.
		const { rows: stored } = await db.sql<{ n: string }>(
			`select count(*) as n from public.notebook_sessions
			  where id = $1 and guidance_doc is not null`,
			[shared]
		);
		expect(Number(stored[0].n)).toBe(1);
	});

	it('an edit through the upsert leaves the prompt where it was', async () => {
		// The upsert is the whole-row replace. It must not take the prompt with
		// it, because a teacher correcting a date is not withdrawing an
		// instruction.
		const before = await guidanceOf(soloSession);
		await rpc(
			teacherA.id,
			'public.notebook_admin_upsert_session($1::uuid[], $2::integer, $3::date, $4, $5::uuid)',
			[[p1], 1, '2026-09-10', 'Bench setup, moved', soloSession]
		);
		const { rows } = await db.sql<{ session_label: string; guidance_doc: unknown }>(
			'select session_label, guidance_doc from public.notebook_sessions where id = $1',
			[soloSession]
		);
		expect(rows[0].session_label).toBe('Bench setup, moved');
		expect(rows[0].guidance_doc).toEqual(before);
	});
});

// ---------------------------------------------------------------------------
// 4. Authorization.
// ---------------------------------------------------------------------------

describe('who may write it', () => {
	it('a student is refused, and nothing moves', async () => {
		const before = await guidanceOf(soloSession);
		const refused = await captureError(() => setGuidance(alice.id, soloSession, []));
		expect(refused.message).toMatch(/teacher of record/i);
		expect(await guidanceOf(soloSession)).toEqual(before);
	});

	it('a teacher who manages no part of the check-in is refused', async () => {
		const before = await guidanceOf(soloSession);
		const refused = await captureError(() => setGuidance(teacherB.id, soloSession, GUIDANCE));
		expect(refused.message).toMatch(/teacher of record/i);
		expect(await guidanceOf(soloSession)).toEqual(before);
	});

	it('managing SOME of the classes a check-in runs in is not enough', async () => {
		// splitSession runs in P1 (teacherA) and P3 (teacherB). The prompt is one
		// sentence all of them read, so writing it takes all of them.
		for (const teacher of [teacherA, teacherB]) {
			const refused = await captureError(() => setGuidance(teacher.id, splitSession, GUIDANCE));
			expect(refused.message).toMatch(/teacher of record/i);
		}
		expect(await guidanceOf(splitSession)).toBeNull();

		// POSITIVE CONTROL: the admin manages every section, so the same call
		// lands. Without this the three refusals above could be an unrelated
		// error on every path.
		const ok = await setGuidance(owner.id, splitSession, GUIDANCE);
		expect(ok.updated).toBe(1);
		expect(await guidanceOf(splitSession)).toEqual(GUIDANCE);
	});

	it('a signed-out caller cannot execute it at all', async () => {
		const refused = await captureError(() =>
			db.asAnon((q) =>
				q('select public.notebook_set_session_guidance($1::uuid, null)', [soloSession])
			)
		);
		expect(refused.message).toMatch(/permission denied/i);
	});

	it('a check-in that does not exist answers the same as one that is not yours', async () => {
		const refused = await captureError(() =>
			setGuidance(teacherA.id, '00000000-0000-0000-0000-000000000000', GUIDANCE)
		);
		expect(refused.message).toMatch(/does not exist/i);
	});
});

// ---------------------------------------------------------------------------
// 5. The gate.
// ---------------------------------------------------------------------------

// Hand-written, and they have to be: nothing can EMIT these. That is the point
// of the gate -- this RPC is granted to `authenticated` and reachable straight
// through PostgREST, so the normalizer upstream of it is not on the path a
// hostile caller takes. Read this as coverage of the SQL predicate, never as
// editor coverage.
const MALFORMED: ReadonlyArray<readonly [string, string]> = [
	['a bare string', '"just some words"'],
	['a number', '42'],
	['an object rather than an array', '{"type":"p","runs":[{"text":"hi"}]}'],
	['an unknown block type', '[{"type":"script","runs":[{"text":"hi"}]}]'],
	['an unknown key on a block', '[{"type":"p","runs":[{"text":"hi"}],"html":"<b>x</b>"}]'],
	['a block with no runs key', '[{"type":"p"}]'],
	// THE `is distinct from` TRAP. `jsonb_typeof(x)` is SQL NULL for an ABSENT
	// key, so a `<>` guard falls through -- and in a boolean gate the NULL
	// propagates out and the caller's `if not <gate>` does not fire, which
	// ACCEPTS the write rather than skipping a check.
	['a run carrying no text key at all', '[{"type":"p","runs":[{"bold":true}]}]'],
	['a run whose text is not a string', '[{"type":"p","runs":[{"text":42}]}]'],
	['an unknown key on a run', '[{"type":"p","runs":[{"text":"hi","onclick":"steal()"}]}]'],
	['a bold flag that is not true', '[{"type":"p","runs":[{"text":"hi","bold":false}]}]'],
	[
		'a javascript: href',
		'[{"type":"p","runs":[{"text":"click","href":"javascript:alert(1)"}]}]'
	],
	[
		'an href with an embedded control character',
		'[{"type":"p","runs":[{"text":"click","href":"java\\u000bscript:alert(1)"}]}]'
	],
	['a list whose items are not arrays', '[{"type":"ul","items":[{"text":"hi"}]}]'],
	['a nested list with an unknown type', '[{"type":"ul","items":[[{"type":"dl","items":[]}]]}]']
];

describe('the shared gate', () => {
	it('refuses every malformed document, and the stored prompt does not move', async () => {
		// The sweep's own size, so a sweep that generated nothing cannot pass.
		expect(MALFORMED).toHaveLength(14);

		const before = await guidanceOf(soloSession);
		expect(before).toEqual(GUIDANCE); // the positive control this sweep runs against

		const outcomes: string[] = [];
		for (const [name, json] of MALFORMED) {
			const refused = await captureError(() => setGuidanceRaw(teacherA.id, soloSession, json));
			expect(refused.message, name).toMatch(/could not be read/i);
			outcomes.push(name);
			expect(await guidanceOf(soloSession), name).toEqual(before);
		}
		expect(outcomes).toHaveLength(MALFORMED.length);
	});

	it('accepts what the real normalizer emits', async () => {
		const target = await createSession(teacherA.id, [p2], 4, '2026-11-03', 'Gate positive');
		const ok = await setGuidance(teacherA.id, target, GUIDANCE);
		expect(ok.cleared).toBe(false);
		expect(await guidanceOf(target)).toEqual(GUIDANCE);
	});

	it('accepts a NESTED list, which only 0122 made legal', async () => {
		// The evidence that the notebook calls `_classroom_doc_ok` rather than a
		// copy of it frozen at 0108. See NESTED_GUIDANCE for why this fixture is
		// hand-written and what that does and does not prove.
		const target = await createSession(teacherA.id, [p2], 6, '2026-11-17', 'Nested list');
		const ok = await setGuidanceRaw(teacherA.id, target, JSON.stringify(NESTED_GUIDANCE));
		expect(ok.cleared).toBe(false);
		expect(await guidanceOf(target)).toEqual(NESTED_GUIDANCE);
		// The plain-text projection walked into the sublist too, rather than
		// dropping it: `_classroom_doc_text` was widened in the same file.
		expect(ok.length).toBe(
			'One wide shot\nWhole bench in frame\nOne close shot of the seam'.length
		);
	});

	it('the predicate it calls is the classroom one, not a notebook copy', async () => {
		const { rows } = await db.sql<{ n: string }>(
			`select count(*) as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname like '%doc_ok%'`
		);
		// _classroom_doc_ok, and nothing else. A second one would be the clone
		// this migration exists to avoid.
		expect(Number(rows[0].n)).toBe(1);

		const { rows: src } = await db.sql<{ body: string }>(
			`select prosrc as body from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'notebook_set_session_guidance'`
		);
		// COMMENTS STRIPPED FIRST, and that is not fussiness: the function's own
		// header names the predicate in prose, so a raw `toContain` stays green
		// after the CALL is deleted. Found by opening the gate and watching this
		// assertion pass while the sweep below reddened.
		const code = src[0].body
			.split('\n')
			.filter((line) => !line.trim().startsWith('--'))
			.join('\n');
		expect(code).toContain('public._classroom_doc_ok(v_doc)');
		expect(code).toContain('public._classroom_doc_text(v_doc)');
		expect(code).toContain('public._notebook_manages_session(p_session_id)');
	});

	it('refuses a prompt over the 20,000 character cap', async () => {
		const long = [{ type: 'p', runs: [{ text: 'x'.repeat(20_001) }] }];
		const refused = await captureError(() =>
			setGuidanceRaw(teacherA.id, soloSession, JSON.stringify(long))
		);
		expect(refused.message).toMatch(/limited to 20000 characters/i);

		// The boundary itself lands, so the cap is the cap and not an off-by-one.
		const atCap = [{ type: 'p', runs: [{ text: 'x'.repeat(20_000) }] }];
		const target = await createSession(teacherA.id, [p2], 5, '2026-11-10', 'Cap boundary');
		const ok = await setGuidanceRaw(teacherA.id, target, JSON.stringify(atCap));
		expect(ok.length).toBe(20_000);
	});
});

// ---------------------------------------------------------------------------
// 6. Null clears, through the narrow write only.
// ---------------------------------------------------------------------------

describe('clearing', () => {
	it('SQL null, JSON null and an empty document all clear it', async () => {
		const cases: ReadonlyArray<readonly [string, () => Promise<GuidanceResult>]> = [
			['SQL null', () => setGuidance(teacherA.id, soloSession, null)],
			['JSON null', () => setGuidanceRaw(teacherA.id, soloSession, 'null')],
			['an empty document', () => setGuidanceRaw(teacherA.id, soloSession, '[]')]
		];
		expect(cases).toHaveLength(3);

		for (const [name, clear] of cases) {
			// Re-arm each time, so each clear is measured against a real prompt
			// rather than against the last clear.
			await setGuidance(teacherA.id, soloSession, GUIDANCE);
			expect(await guidanceOf(soloSession), name).toEqual(GUIDANCE);

			const result = await clear();
			expect(result.cleared, name).toBe(true);
			expect(result.length, name).toBe(0);
			expect(result.updated, name).toBe(1);
			expect(await guidanceOf(soloSession), name).toBeNull();
		}
	});

	it('a student cannot clear somebody else s prompt', async () => {
		await setGuidance(teacherA.id, soloSession, GUIDANCE);
		const refused = await captureError(() => setGuidance(alice.id, soloSession, null));
		expect(refused.message).toMatch(/teacher of record/i);
		expect(await guidanceOf(soloSession)).toEqual(GUIDANCE);
	});
});

// ---------------------------------------------------------------------------
// 7. The write is NARROW, and the neighbours are untouched.
// ---------------------------------------------------------------------------

describe('what a guidance write moves', () => {
	it('moves guidance_doc on ONE row, and nothing else anywhere', async () => {
		const sessionsBefore = await allSessions();
		const postingsBefore = await allPostings();

		await setGuidance(teacherA.id, neighbourSession, GUIDANCE);

		const sessionsAfter = await allSessions();
		const postingsAfter = await allPostings();

		// The section list is the thing a fourth parameter on the upsert would
		// have put at risk. It is byte-identical.
		expect(postingsAfter).toEqual(postingsBefore);

		expect(sessionsAfter).toHaveLength(sessionsBefore.length);
		let changed = 0;
		for (let i = 0; i < sessionsAfter.length; i += 1) {
			const before = sessionsBefore[i] as Record<string, unknown>;
			const after = sessionsAfter[i] as Record<string, unknown>;
			expect(after.id).toEqual(before.id);
			// Every column BUT guidance_doc, on every row including the target.
			for (const key of ['unit_number', 'session_date', 'session_label', 'created_by', 'created_at']) {
				expect(after[key], `${String(after.id)}.${key}`).toEqual(before[key]);
			}
			if (JSON.stringify(after.guidance_doc) !== JSON.stringify(before.guidance_doc)) {
				changed += 1;
				expect(after.id).toEqual(neighbourSession);
			}
		}
		expect(changed).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// 8. Re-applying the file.
// ---------------------------------------------------------------------------

describe('re-applying 0123', () => {
	it('is ordinary, and does not clobber a prompt already authored', async () => {
		const before = await guidanceOf(neighbourSession);
		expect(before).toEqual(GUIDANCE);

		await db.sql(MIGRATION_0123);

		expect(await guidanceOf(neighbourSession)).toEqual(GUIDANCE);

		// And still exactly one overload after a second `create or replace`.
		const { rows } = await db.sql<{ n: string }>(
			`select count(*) as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.proname = 'notebook_set_session_guidance'`
		);
		expect(Number(rows[0].n)).toBe(1);
	});
});
