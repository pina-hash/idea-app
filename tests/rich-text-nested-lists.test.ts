// tests/rich-text-nested-lists.test.ts
//
// 0122: both rich-text storage gates widened to accept a nested list, against
// REAL embedded Postgres with the REAL migration files applied unmodified.
//
// WHY THIS EARNS A TEST, against this repo's default of verifying by dev
// harness. Every failure mode here is silent, and one of them is catastrophic:
//
//   * A WIDENED GATE THAT REFUSES SOMETHING ALREADY STORED breaks every save
//     in the app, and breaks it LATER -- existing rows keep rendering, so
//     nothing looks wrong until a student edits a note or a teacher edits a
//     body and gets "its content is not a valid note". That is the assertion
//     this file exists for, and it is not asserted with examples: the whole
//     corpus is put to the DEPLOYED gate first, the migration is applied over
//     the top of the same database, and the two answers must agree case for
//     case, refusals included.
//   * A GATE THAT WIDENED TOO FAR is invisible by construction. An unknown
//     node type accepted three levels down inside a list item reaches the
//     renderer, and the renderer is the last of three gates.
//   * A DEPTH CAP THAT DOES NOT FIRE is invisible until something recurses
//     over the stored document. jsonb cannot express a reference cycle -- it
//     is a value tree -- so unbounded self-similar nesting is the only thing a
//     "cycle" can be here, and the depth check is the only thing that answers
//     it. It must answer `false`, not a stack error.
//
// WHERE THE FIXTURES COME FROM. Every ACCEPTED flat document below is produced
// by running the REAL normalizer (`normalizeNoteDoc`, `itemBodyColumns`) over a
// ProseMirror document built through the REAL editor schema in
// rich-text-fixtures.ts. A gate test whose "currently stored shape" was typed
// out by hand is a test of what someone believed the normalizer emits.
//
// The REFUSED documents are hand-written, and that is correct here rather than
// a lapse: this gate exists precisely because both RPC families are granted to
// `authenticated` and reachable straight through PostgREST, so its input is
// arbitrary JSON that no editor and no normalizer ever touched. They are not
// editor coverage and are not read as any.
//
// MUTATION-CHECKED (manually, during this session -- the
// classroom-rich-body.test.ts convention, not left as runnable code). Every
// mutation was confirmed to have REACHED THE DATABASE before any result was
// read from it, by dumping the mutated function's own `prosrc` out of
// `pg_proc` and matching the mutation's marker in it; 0122 was restored
// byte-identically after each (md5 ba789a7a0b48aac72820af8f736e693a) and this
// file re-run fully green. Measured against this exact file, in cases:
//
//   * DEPTH CAP REMOVED (`p_depth > 12` / `> 16` raised to 100000, confirmed
//     as CAP-REMOVED in both list helpers' prosrc): reddened 7 -- both
//     over-cap sweeps, both self-similar refusals, both re-apply checks, and
//     the notebook's flat-vs-nested case, which carries an over-cap assertion
//     of its own. NEITHER PARITY ASSERTION MOVED, which is the finding: a gate
//     that widened too far leaves the flat corpus completely undisturbed, so
//     parity cannot be the only assertion here.
//   * UNKNOWN TYPE ACCEPTED AT DEPTH (`v_type not in ('ul','ol')` dropped from
//     both list helpers, confirmed as NO-TYPECHECK): reddened 2 -- both
//     malformed-nesting sweeps, and again neither parity assertion.
//   * BOTH GATES ACCEPTING EVERYTHING (`return true` at the top of each,
//     confirmed as ALWAYS-TRUE): reddened 14, including both parity
//     assertions.
//   * BOTH GATES REFUSING EVERYTHING (ALWAYS-FALSE): reddened 17, including
//     both parity assertions, both stored-row counts, both still-editable
//     paths and both nested writes through the real RPCs.
//   * THE ONE THAT MATTERS, targeted: 0078's `<>` guard on a list block's
//     `items` changed to `is distinct from` -- the plausible "tidy up the trap
//     while we are in here" edit, and a NARROWING (confirmed as
//     ITEMS-TIGHTENED). Reddened exactly 2: the notebook parity assertion,
//     which named the disagreeing case, and the test that pins the tolerance
//     on purpose. Those two are what stand between this bundle and a gate that
//     refuses content already in the table.
//
// A REAL DEFECT THE PARITY ASSERTION FOUND, in 0078 and not in this
// migration: `_notebook_note_run_len` still checks `jsonb_typeof(p_run ->
// 'text') <> 'string'`, which is NULL rather than true for an ABSENT key, so a
// run with no `text` falls through to `char_length(NULL)` and the gate returns
// SQL NULL -- and every RPC in front of it asks `if not <gate>`, which does
// not fire on NULL. So the notebook STORES such a run today. It is the same
// `is distinct from` trap 0097 hit and 0108 fixed on the classroom side, still
// live on this one. This file records it, pins it at both depths so nesting
// cannot invent a second answer for it, and does NOT fix it: a bundle whose
// job is to accept more must not quietly start refusing, and the fix is a
// migration of its own with its own answer for what to do about rows already
// stored.
//
// NOT COVERED HERE, and stated rather than left silent: nothing renders a
// nested list yet, on either side, because nothing can emit one. This file
// asserts what the DATABASE accepts and what it derives; the renderer and the
// normalizer are the next bundle and are untouched by this one.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	MIGRATIONS as NOTE_CHAIN,
	createClassroomSection,
	createUser,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';
import { normalizeNoteDoc } from '../src/lib/server/notebook-notes';
import { itemBodyColumns } from '../src/lib/server/classroom-doc';
import {
	editorDoc,
	itemSchema,
	noteSchema,
	pmBold,
	pmBullets,
	pmDoc,
	pmHeading,
	pmItalic,
	pmItem,
	pmLink,
	pmNumbers,
	pmPara,
	pmText
} from './rich-text-fixtures';

/** The classroom chain through 0110, so the RPCs driven below are the shipping ones. */
const ITEM_CHAIN = [
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

const MIGRATION_0122 = readFileSync(
	join(
		fileURLToPath(new URL('..', import.meta.url)),
		'supabase',
		'migrations',
		'0122_rich_text_nested_lists.sql'
	),
	'utf8'
);

/** The cap each gate carries, mirroring each normalizer's own `maxDepth`. */
const NOTE_MAX_DEPTH = 12;
const ITEM_MAX_DEPTH = 16;

// --- Builders for the STORED shape ----------------------------------------
// Hand-written on purpose: nothing can emit these yet, which is the whole
// point of shipping the gate first.

type StoredRun = { text: string; bold?: true; italic?: true; href?: string };
type StoredNode = StoredRun | { type: 'ul' | 'ol'; items: unknown[] };

/**
 * A document whose deepest list sits at nesting depth `depth`. A list at the
 * top of the document is depth 1; a list inside one of its items is depth 2.
 */
function nested(depth: number, kind: 'ul' | 'ol' = 'ul'): unknown[] {
	let node: StoredNode = { type: kind, items: [[{ text: `level ${depth}` }]] };
	for (let d = depth - 1; d >= 1; d--) {
		node = { type: kind, items: [[{ text: `level ${d}` }, node]] };
	}
	return [node];
}

/** The same, but with `leaf` spliced into the DEEPEST item. */
function nestedWith(depth: number, leaf: unknown): unknown[] {
	let node: StoredNode = { type: 'ul', items: [[{ text: `level ${depth}` }, leaf]] };
	for (let d = depth - 1; d >= 1; d--) {
		node = { type: 'ul', items: [[{ text: `level ${d}` }, node]] };
	}
	return [node];
}

/** How deep does this document's list nesting actually go? Counted, not assumed. */
function measuredDepth(doc: unknown): number {
	const walkList = (items: unknown, depth: number): number => {
		if (!Array.isArray(items)) return depth;
		let deepest = depth;
		for (const item of items) {
			if (!Array.isArray(item)) continue;
			for (const node of item) {
				if (node && typeof node === 'object' && 'type' in node) {
					deepest = Math.max(
						deepest,
						walkList((node as { items: unknown }).items, depth + 1)
					);
				}
			}
		}
		return deepest;
	};
	if (!Array.isArray(doc)) return 0;
	let deepest = 0;
	for (const block of doc) {
		if (block && typeof block === 'object' && 'items' in block) {
			deepest = Math.max(deepest, walkList((block as { items: unknown }).items, 1));
		}
	}
	return deepest;
}

// --- The flat corpus -------------------------------------------------------

interface Case {
	label: string;
	doc: unknown;
	/**
	 * What the DEPLOYED gate must answer. Left undefined for a document the
	 * two gates legitimately answer DIFFERENTLY, so no count below claims an
	 * answer for it; parity still covers it, which is the point of including
	 * it at all.
	 */
	want?: boolean;
}

/** Editor documents both schemas can hold, so one set feeds both normalizers. */
const SHARED_EDITOR_DOCS: { label: string; json: unknown }[] = [
	{ label: 'one plain paragraph', json: pmDoc(pmPara(pmText('Bench notes for today.'))) },
	{
		label: 'marks and a safe link',
		json: pmDoc(
			pmPara(
				pmText('Plain '),
				pmText('bold', [pmBold]),
				pmText(' and '),
				pmText('italic', [pmItalic]),
				pmText(' and '),
				pmText('a link', [pmLink('https://example.com/a?b=c')])
			)
		)
	},
	{
		label: 'a bulleted list',
		json: pmDoc(
			pmBullets(
				pmItem(pmPara(pmText('250 mL beaker'))),
				pmItem(pmPara(pmText('Digital scale'))),
				pmItem(pmPara(pmText('Graduated cylinder')))
			)
		)
	},
	{
		label: 'a numbered list',
		json: pmDoc(
			pmNumbers(pmItem(pmPara(pmText('Zero the scale'))), pmItem(pmPara(pmText('Mass the beaker'))))
		)
	},
	{
		label: 'a list with a sublist, which the normalizer FLATTENS today',
		json: pmDoc(
			pmBullets(
				pmItem(
					pmPara(pmText('Materials')),
					pmBullets(
						pmItem(pmPara(pmText('250 mL beaker'))),
						pmItem(pmPara(pmText('Digital scale')))
					)
				),
				pmItem(pmPara(pmText('Method')))
			)
		)
	},
	{
		label: 'a list item holding two paragraphs',
		json: pmDoc(
			pmBullets(pmItem(pmPara(pmText('First half')), pmPara(pmText('Second half'))))
		)
	},
	{
		label: 'paragraphs around a list',
		json: pmDoc(
			pmPara(pmText('Before.')),
			pmBullets(pmItem(pmPara(pmText('Middle')))),
			pmPara(pmText('After.'))
		)
	}
];

/** Documents only the item schema can hold. */
const ITEM_ONLY_EDITOR_DOCS: { label: string; json: unknown }[] = [
	{ label: 'an h3', json: pmDoc(pmHeading(3, pmText('Safety'))) },
	{
		label: 'an h4 above a list',
		json: pmDoc(pmHeading(4, pmText('Steps')), pmBullets(pmItem(pmPara(pmText('Measure')))))
	}
];

/**
 * Stored documents that must be REFUSED. Hand-written because this gate's real
 * input is a PostgREST call that skipped the normalizer entirely. Shared by
 * both sides; `h3` is legal in a body and not in a note, so it is not here.
 */
const REFUSED_FLAT: Case[] = [
	{ label: 'not an array', doc: { type: 'p', runs: [] } },
	{ label: 'an unknown block type', doc: [{ type: 'script', runs: [{ text: 'x' }] }] },
	{ label: 'a run where a block belongs', doc: [{ text: 'loose run' }] },
	{ label: 'an unknown key on a block', doc: [{ type: 'p', runs: [{ text: 'x' }], onclick: 'x' }] },
	{ label: 'an unknown key on a run', doc: [{ type: 'p', runs: [{ text: 'x', style: 'x' }] }] },
	{ label: 'a run whose text is a number', doc: [{ type: 'p', runs: [{ text: 7 }] }] },
	{ label: 'bold set to something other than true', doc: [{ type: 'p', runs: [{ text: 'x', bold: 'yes' }] }] },
	{ label: 'a javascript: href', doc: [{ type: 'p', runs: [{ text: 'x', href: 'javascript:alert(1)' }] }] },
	{ label: 'an href with an embedded newline', doc: [{ type: 'p', runs: [{ text: 'x', href: 'java\nscript:alert(1)' }] }] },
	{ label: 'a list item that is not an array', doc: [{ type: 'ul', items: [{ text: 'x' }] }] },
	{ label: 'a list whose items are not an array', doc: [{ type: 'ul', items: 'x' }] },
	{ label: 'a block that is not an object', doc: ['just a string'] },
	{ label: 'a list item element that is not an object', doc: [{ type: 'ul', items: [['x']] }] }
];

/**
 * Flat documents no editor emits, put through the parity check anyway: the
 * corners are where a rewritten gate drifts. `{"type":"ul"}` with no `items`
 * is one the two gates answer DIFFERENTLY -- 0078's guard is `<>`, which is
 * NULL for an absent key and falls through; 0108's is `is distinct from` and
 * does not -- so these carry no `want`.
 */
const ODD_FLAT: Case[] = [
	{ label: 'a list block with no items key', doc: [{ type: 'p', runs: [{ text: 'x' }] }, { type: 'ul' }] },
	{ label: 'a list with an empty items array', doc: [{ type: 'p', runs: [{ text: 'x' }] }, { type: 'ul', items: [] }] },
	{ label: 'a block with an empty run list', doc: [{ type: 'p', runs: [{ text: 'x' }] }, { type: 'p', runs: [] }] },
	{ label: 'a list item with no runs in it', doc: [{ type: 'p', runs: [{ text: 'x' }] }, { type: 'ul', items: [[]] }] },
	{ label: 'a run carrying an explicit empty text', doc: [{ type: 'p', runs: [{ text: 'x' }, { text: '' }] }] },
	// A LIVE `is distinct from` TRAP IN 0078, FOUND BY THE PARITY ASSERTION
	// BELOW and left exactly as it is by this migration. See
	// `_notebook_note_run_len`: `jsonb_typeof(p_run -> 'text') <> 'string'` is
	// NULL, not true, for an ABSENT key, so the guard falls through and
	// `char_length(NULL)` returns NULL -- which propagates through the running
	// total and out of `_notebook_note_content_ok` as NULL, and the RPCs'
	// `if not <gate>` does not fire on NULL. So the notebook ACCEPTS a run
	// with no `text`; 0108's classroom gate, written with `is distinct from`
	// throughout, REFUSES it. Two gates, two answers, and this migration
	// preserves both -- tightening one here would be a bundle whose whole job
	// is to accept more quietly refusing something the deployed gate takes.
	{ label: 'a run with no text key at all', doc: [{ type: 'p', runs: [{ bold: true }] }] }
];

/** Nested documents that must be REFUSED whatever the depth cap says. */
const REFUSED_NESTED: Case[] = [
	{ label: 'a paragraph block where a run belongs', doc: nestedWith(2, { type: 'p', runs: [{ text: 'x' }] }) },
	{ label: 'an unknown type at depth', doc: nestedWith(3, { type: 'script', items: [[{ text: 'x' }]] }) },
	{ label: 'an unknown key on a nested list', doc: nestedWith(3, { type: 'ul', items: [[{ text: 'x' }]], onclick: 'x' }) },
	{ label: 'a nested list with no items key', doc: nestedWith(2, { type: 'ul' }) },
	{ label: 'a nested list whose items are not an array', doc: nestedWith(2, { type: 'ul', items: 'x' }) },
	{ label: 'a nested list item that is not an array', doc: nestedWith(2, { type: 'ul', items: [{ text: 'x' }] }) },
	{ label: 'a javascript: href at depth', doc: nestedWith(4, { text: 'x', href: 'javascript:alert(1)' }) },
	{ label: 'an unknown run key at depth', doc: nestedWith(4, { text: 'x', style: 'x' }) },
	{ label: 'a non-object element at depth', doc: nestedWith(4, 'just a string') }
];

/**
 * The nested twin of the `is distinct from` trap above. Each gate must answer
 * it the SAME WAY IT ANSWERS THE FLAT CASE -- a run the notebook accepts in a
 * paragraph and refuses three levels down would be the drift this whole
 * bundle is trying not to introduce -- so it is pinned per gate rather than
 * swept with the refusals.
 */
const RUN_WITHOUT_TEXT_AT_DEPTH = nestedWith(4, { italic: true });

/**
 * The nearest thing jsonb has to a cycle: self-similar nesting with no end in
 * sight. Built far past either cap, so what refuses it can only be the cap.
 */
const SELF_SIMILAR = nested(500);

// --- Shared plumbing -------------------------------------------------------

/** Every function 0122 replaces or adds, and the arity it must have exactly one of. */
const NOTE_FUNCTIONS = ['_notebook_note_content_ok', '_notebook_note_list_len'] as const;
const ITEM_FUNCTIONS = [
	'_classroom_doc_ok',
	'_classroom_runs_ok',
	'_classroom_run_ok',
	'_classroom_list_ok',
	'_classroom_doc_text',
	'_classroom_item_text',
	'_classroom_list_text'
] as const;

/**
 * Apply 0122 and PROVE it landed before anything reads a result from it: the
 * new helpers must exist at exactly one arity each (the signature trap), and
 * each replaced gate's own source must now name the helper it delegates to. A
 * migration that half-applied, or a `create or replace` that silently left the
 * old body in place, fails here rather than in an assertion that then reads as
 * a gate bug.
 */
async function applyAndProve(
	db: TestDb,
	names: readonly string[],
	delegations: [fn: string, mustName: string][]
): Promise<void> {
	await db.sql(MIGRATION_0122);

	const { rows } = await db.sql<{ proname: string; n: string }>(
		`select proname, count(*)::text as n
		   from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
		  where ns.nspname = 'public' and proname = any($1::text[])
		  group by proname`,
		[names as string[]]
	);
	const found = new Map(rows.map((r) => [r.proname, Number(r.n)]));
	for (const name of names) {
		expect(found.get(name), `${name} must exist at exactly one arity`).toBe(1);
	}

	for (const [fn, mustName] of delegations) {
		const { rows: src } = await db.sql<{ prosrc: string }>(
			`select prosrc from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
			  where ns.nspname = 'public' and proname = $1`,
			[fn]
		);
		expect(src, `${fn} must exist`).toHaveLength(1);
		expect(src[0].prosrc, `${fn} must be 0122's definition`).toContain(mustName);
	}
}

// ===========================================================================
// The notebook gate
// ===========================================================================

describe('0122 over the notebook note gate', () => {
	let db: TestDb;
	let student: SeededUser;
	let teacher: SeededUser;
	let sectionId: string;
	/** Documents the REAL normalizer emitted, seeded as real notes pre-migration. */
	let producible: Case[];
	let corpus: Case[];
	let before: boolean[];
	/** entry id -> the exact content stored for it, pre-migration. */
	let seededNotes: { entryId: string; doc: unknown }[];

	async function gate(doc: unknown): Promise<boolean> {
		const { rows } = await db.sql<{ ok: boolean }>(
			'select public._notebook_note_content_ok($1::jsonb) as ok',
			[doc === undefined ? null : JSON.stringify(doc)]
		);
		return rows[0].ok;
	}

	beforeAll(async () => {
		// SHORT OF 0122: the world as deployed. Everything below is measured
		// here first and only then measured again with the file applied over
		// the top of this same database.
		db = await startTestDb(NOTE_CHAIN);
		student = await createUser(db, 'ramona.pike@boscotech.net', 'Ramona Pike');
		teacher = await createUser(db, 'chair@boscotech.edu', 'Dana Chair');
		sectionId = await createClassroomSection(db, {
			as: teacher,
			courseCode: 'ENG1H',
			courseTitle: 'Engineering I Honors',
			label: 'Period 2',
			teacherEmail: teacher.email
		});

		producible = SHARED_EDITOR_DOCS.map(({ label, json }) => {
			const result = normalizeNoteDoc(editorDoc(noteSchema, json));
			if (!result.ok) throw new Error(`fixture "${label}" refused by the normalizer: ${result.error}`);
			return { label: `producible: ${label}`, doc: result.doc, want: true };
		});

		corpus = [
			...producible,
			...ODD_FLAT.map((c) => ({ ...c, label: `odd: ${c.label}` })),
			...REFUSED_FLAT.map((c) => ({ ...c, label: `refused: ${c.label}`, want: false }))
		];

		// Seed real notes through the REAL pre-migration RPC, so the rows the
		// widened gate is asked about are rows the deployed app actually wrote.
		seededNotes = [];
		for (const { doc } of producible) {
			const entry = await db.asUser(student.id, async (q) => {
				const { rows } = await q<{ result: { entry_id: string } }>(
					'select public.notebook_create_note_entry(p_content => $1::jsonb, p_section_id => $2::uuid) as result',
					[JSON.stringify(doc), sectionId]
				);
				return rows[0].result.entry_id;
			});
			seededNotes.push({ entryId: entry, doc });
		}

		before = [];
		for (const c of corpus) before.push(await gate(c.doc));

		await applyAndProve(db, NOTE_FUNCTIONS, [
			['_notebook_note_content_ok', '_notebook_note_list_len']
		]);
	}, 180_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('answers every flat document exactly as the deployed gate did', async () => {
		const after: boolean[] = [];
		for (const c of corpus) after.push(await gate(c.doc));

		const disagreed = corpus
			.map((c, i) => ({ label: c.label, was: before[i], now: after[i] }))
			.filter((r) => r.was !== r.now);
		expect(disagreed).toEqual([]);

		// A corpus that was all accepts, or all refusals, would agree with
		// anything. The DEPLOYED answers are pinned case by case so it can be
		// neither, and the counts are reported so a sweep over nothing cannot
		// pass either.
		const pinned = corpus
			.map((c, i) => ({ label: c.label, want: c.want, was: before[i] }))
			.filter((c) => c.want !== undefined);
		expect(pinned.filter((c) => c.was !== c.want).map((c) => c.label)).toEqual([]);
		expect(pinned.filter((c) => c.want === true).length).toBe(producible.length);
		expect(pinned.filter((c) => c.want === false).length).toBe(REFUSED_FLAT.length);
		expect(corpus.length).toBe(producible.length + ODD_FLAT.length + REFUSED_FLAT.length);
	});

	it('still accepts every note actually stored before it was applied', async () => {
		const { rows } = await db.sql<{ n: string; ok: string }>(
			`select count(*)::text as n,
			        count(*) filter (where public._notebook_note_content_ok(content))::text as ok
			   from public.notebook_entry_notes`
		);
		expect(Number(rows[0].n)).toBe(seededNotes.length);
		expect(Number(rows[0].ok)).toBe(seededNotes.length);
	});

	it('lets a student still edit a note stored before the migration', async () => {
		// The failure this guards is the one that only shows up on the NEXT
		// save, long after the deploy looked fine.
		const target = seededNotes[0];
		const edited = normalizeNoteDoc(
			editorDoc(noteSchema, pmDoc(pmPara(pmText('Edited after 0122 landed.'))))
		);
		if (!edited.ok) throw new Error('fixture refused');

		const noteId = await db.sql<{ id: string }>(
			'select id from public.notebook_entry_notes where entry_id = $1',
			[target.entryId]
		);
		const result = await db.asUser(student.id, async (q) => {
			const { rows } = await q<{ result: { revision: number } }>(
				'select public.notebook_edit_note(p_note_id => $1::uuid, p_content => $2::jsonb) as result',
				[noteId.rows[0].id, JSON.stringify(edited.doc)]
			);
			return rows[0].result;
		});
		expect(result.revision).toBe(2);
	});

	it('accepts a nested list at every permitted depth and refuses the first one past the cap', async () => {
		for (let depth = 1; depth <= NOTE_MAX_DEPTH; depth++) {
			expect(measuredDepth(nested(depth)), `builder must really nest ${depth} deep`).toBe(depth);
			expect(await gate(nested(depth)), `depth ${depth} must be accepted`).toBe(true);
		}
		expect(await gate(nested(NOTE_MAX_DEPTH + 1))).toBe(false);
		expect(await gate(nested(NOTE_MAX_DEPTH + 2))).toBe(false);

		// Both list kinds nest, and a nested list may sit beside ordinary blocks.
		expect(await gate(nested(4, 'ol'))).toBe(true);
		expect(await gate([{ type: 'p', runs: [{ text: 'Before.' }] }, ...nested(3)])).toBe(true);
	});

	it('counts text inside a sublist toward the note character cap', async () => {
		// The cap is the reason the helper returns a LENGTH rather than a
		// boolean: text that stopped counting at the first sublist would let a
		// note of any size through.
		const big = 'x'.repeat(19_999);
		expect(await gate(nestedWith(3, { text: 'y' }))).toBe(true);
		expect(await gate([{ type: 'ul', items: [[{ text: big }, { type: 'ul', items: [[{ text: 'y' }]] }]] }])).toBe(
			true
		);
		expect(
			await gate([{ type: 'ul', items: [[{ text: big }, { type: 'ul', items: [[{ text: 'yy' }]] }]] }])
		).toBe(false);

		// And a document whose only text is inside a sublist is still a note.
		expect(await gate([{ type: 'ul', items: [[{ type: 'ul', items: [[{ text: 'only here' }]] }]] }])).toBe(true);
		// ...while one with no text anywhere is not, exactly as before.
		expect(await gate([{ type: 'ul', items: [[{ type: 'ul', items: [[{ text: '' }]] }]] }])).toBe(false);
	});

	it('refuses malformed nesting', async () => {
		for (const c of REFUSED_NESTED) {
			expect(await gate(c.doc), `must refuse: ${c.label}`).toBe(false);
		}
		expect(REFUSED_NESTED.length).toBeGreaterThan(0);

		// The positive control for the sweep above: the same builder with a
		// legitimate leaf is accepted, so the refusals are about the leaf.
		expect(await gate(nestedWith(4, { text: 'fine' }))).toBe(true);
		expect(await gate(nestedWith(4, { type: 'ul', items: [[{ text: 'fine' }]] }))).toBe(true);
	});

	it('refuses unbounded self-similar nesting with a false, not a stack error', async () => {
		expect(measuredDepth(SELF_SIMILAR)).toBe(500);
		expect(await gate(SELF_SIMILAR)).toBe(false);

		// And the RPC in front of it refuses in the caller's words.
		await expect(
			db.asUser(student.id, (q) =>
				q('select public.notebook_create_note_entry(p_content => $1::jsonb) as result', [
					JSON.stringify(SELF_SIMILAR)
				])
			)
		).rejects.toThrow(/not a valid note/);
	});

	it('answers a run with no text key the same way nested as it does flat', async () => {
		// 0078's LIVE `is distinct from` trap, documented at ODD_FLAT. The gate
		// returns SQL NULL rather than false, and the RPCs' `if not <gate>`
		// does not fire on NULL, so such a note is stored. That is a finding
		// about 0078 and NOT this migration's to fix; what IS this migration's
		// job is that nesting does not invent a second answer for it.
		const flat = [{ type: 'p', runs: [{ text: 'ok' }, { italic: true }] }];
		const { rows } = await db.sql<{ flat: boolean | null; deep: boolean | null }>(
			`select public._notebook_note_content_ok($1::jsonb) as flat,
			        public._notebook_note_content_ok($2::jsonb) as deep`,
			[JSON.stringify(flat), JSON.stringify(RUN_WITHOUT_TEXT_AT_DEPTH)]
		);
		expect(rows[0].flat).toBeNull();
		expect(rows[0].deep).toBeNull();

		// And the trap cannot swallow the depth cap: a -1 is returned per
		// element, before it can be added to a total NULL has poisoned.
		const deepAndTextless = nestedWith(NOTE_MAX_DEPTH + 1, { italic: true });
		expect(await gate(deepAndTextless)).toBe(false);
	});

	it('keeps 0078’s tolerance for a list block with no items key, and is strict about one nested', async () => {
		// 0078 wrote this guard with `<>`, which is NULL for an ABSENT key, so
		// `{"type":"ul"}` fell through and was accepted as an empty list. That
		// is preserved deliberately: quietly tightening it here would be this
		// migration refusing something the deployed gate accepts.
		expect(await gate([{ type: 'p', runs: [{ text: 'x' }] }, { type: 'ul' }])).toBe(true);
		// Nesting is new, so it has no old answer to preserve and is strict.
		expect(await gate(nestedWith(2, { type: 'ul' }))).toBe(false);
	});

	it('writes and reads back a nested note through the real RPC', async () => {
		const doc = [
			{
				type: 'ul',
				items: [
					[{ text: 'Materials' }, { type: 'ul', items: [[{ text: '250 mL beaker' }], [{ text: 'Digital scale' }]] }],
					[{ text: 'Method' }]
				]
			}
		];
		const entryId = await db.asUser(student.id, async (q) => {
			const { rows } = await q<{ result: { entry_id: string } }>(
				'select public.notebook_create_note_entry(p_content => $1::jsonb, p_section_id => $2::uuid) as result',
				[JSON.stringify(doc), sectionId]
			);
			return rows[0].result.entry_id;
		});
		const { rows } = await db.sql<{ content: unknown }>(
			'select content from public.notebook_entry_notes where entry_id = $1',
			[entryId]
		);
		expect(rows[0].content).toEqual(doc);
	});

	it('re-applies without changing any answer', async () => {
		const first = await Promise.all(corpus.map((c) => gate(c.doc)));
		await db.sql(MIGRATION_0122);
		const second = await Promise.all(corpus.map((c) => gate(c.doc)));
		expect(second).toEqual(first);
		expect(await gate(nested(NOTE_MAX_DEPTH))).toBe(true);
		expect(await gate(nested(NOTE_MAX_DEPTH + 1))).toBe(false);
	});
});

// ===========================================================================
// The classroom item-body gate
// ===========================================================================

describe('0122 over the classroom item-body gate', () => {
	let db: TestDb;
	let teacher: SeededUser;
	let section: string;
	let producible: Case[];
	let corpus: Case[];
	let before: boolean[];
	let seededItems: { itemId: string; doc: unknown; body: string }[];

	async function gate(doc: unknown): Promise<boolean> {
		const { rows } = await db.sql<{ ok: boolean }>(
			'select public._classroom_doc_ok($1::jsonb) as ok',
			[doc === undefined ? null : JSON.stringify(doc)]
		);
		return rows[0].ok;
	}

	async function docText(doc: unknown): Promise<string> {
		const { rows } = await db.sql<{ t: string }>(
			'select public._classroom_doc_text($1::jsonb) as t',
			[doc === undefined ? null : JSON.stringify(doc)]
		);
		return rows[0].t;
	}

	async function createItem(doc: unknown, body: string): Promise<string> {
		return db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ result: { item_id: string } }>(
				`select public.classroom_create_item(
					p_kind => 'post', p_section_ids => $1::uuid[], p_title => $2,
					p_body => $3, p_body_doc => $4::jsonb) as result`,
				[[section], 'Lab brief', body, JSON.stringify(doc)]
			);
			return rows[0].result.item_id;
		});
	}

	beforeAll(async () => {
		db = await startTestDb(ITEM_CHAIN);
		teacher = await createUser(db, 'vargas@boscotech.edu', 'T. Vargas');
		await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');

		const course = await db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ result: { course_id: string } }>(
				"select public.classroom_upsert_course('IDEA209H', 'Engineering') as result"
			);
			return rows[0].result.course_id;
		});
		section = await db.asUser(teacher.id, async (q) => {
			const { rows } = await q<{ result: { section_id: string } }>(
				"select public.classroom_upsert_section($1::uuid, 'Period 2', 'B') as result",
				[course]
			);
			return rows[0].result.section_id;
		});

		producible = [...SHARED_EDITOR_DOCS, ...ITEM_ONLY_EDITOR_DOCS].map(({ label, json }) => {
			const shaped = itemBodyColumns(editorDoc(itemSchema, json));
			if (!shaped.ok) throw new Error(`fixture "${label}" refused by the normalizer: ${shaped.error}`);
			return { label: `producible: ${label}`, doc: shaped.doc, want: true };
		});

		corpus = [
			...producible,
			// A body_doc is legitimately absent on an item authored before 0108.
			{ label: 'accepted: no document at all', doc: null, want: true },
			...ODD_FLAT.map((c) => ({ ...c, label: `odd: ${c.label}` })),
			...REFUSED_FLAT.map((c) => ({ ...c, label: `refused: ${c.label}`, want: false })),
			{
				label: 'refused: a heading with items instead of runs',
				doc: [{ type: 'h3', items: [[{ text: 'x' }]] }],
				want: false
			}
		];

		seededItems = [];
		for (const { label, json } of [...SHARED_EDITOR_DOCS, ...ITEM_ONLY_EDITOR_DOCS]) {
			const shaped = itemBodyColumns(editorDoc(itemSchema, json));
			if (!shaped.ok) throw new Error(`fixture "${label}" refused: ${shaped.error}`);
			const itemId = await createItem(shaped.doc, shaped.body);
			const { rows } = await db.sql<{ body: string; body_doc: unknown }>(
				'select body, body_doc from public.classroom_items where id = $1',
				[itemId]
			);
			seededItems.push({ itemId, doc: rows[0].body_doc, body: rows[0].body });
		}

		before = [];
		for (const c of corpus) before.push(await gate(c.doc));

		await applyAndProve(db, ITEM_FUNCTIONS, [
			['_classroom_doc_ok', '_classroom_list_ok'],
			['_classroom_runs_ok', '_classroom_run_ok'],
			['_classroom_doc_text', '_classroom_list_text']
		]);
	}, 180_000);

	afterAll(async () => {
		await db?.stop();
	});

	it('answers every flat document exactly as the deployed gate did', async () => {
		const after: boolean[] = [];
		for (const c of corpus) after.push(await gate(c.doc));

		const disagreed = corpus
			.map((c, i) => ({ label: c.label, was: before[i], now: after[i] }))
			.filter((r) => r.was !== r.now);
		expect(disagreed).toEqual([]);

		const pinned = corpus
			.map((c, i) => ({ label: c.label, want: c.want, was: before[i] }))
			.filter((c) => c.want !== undefined);
		expect(pinned.filter((c) => c.was !== c.want).map((c) => c.label)).toEqual([]);
		expect(pinned.filter((c) => c.want === true).length).toBe(producible.length + 1);
		expect(pinned.filter((c) => c.want === false).length).toBe(REFUSED_FLAT.length + 1);
		expect(corpus.length).toBe(producible.length + 1 + ODD_FLAT.length + REFUSED_FLAT.length + 1);
	});

	it('projects every stored body to exactly the text it projected before', async () => {
		// `body` is DERIVED from `body_doc` inside the RPC, so a projection
		// that changed would silently rewrite the text column on the next save
		// of every item -- and `body` is what the stream and the export read.
		for (const seeded of seededItems) {
			expect(await docText(seeded.doc), `projection for item ${seeded.itemId}`).toBe(seeded.body);
		}
		expect(seededItems.length).toBe(SHARED_EDITOR_DOCS.length + ITEM_ONLY_EDITOR_DOCS.length);
		expect(seededItems.some((s) => s.body.includes('\n'))).toBe(true);
	});

	it('still accepts every body actually stored before it was applied', async () => {
		const { rows } = await db.sql<{ n: string; ok: string }>(
			`select count(*)::text as n,
			        count(*) filter (where public._classroom_doc_ok(body_doc))::text as ok
			   from public.classroom_items`
		);
		expect(Number(rows[0].n)).toBe(seededItems.length);
		expect(Number(rows[0].ok)).toBe(seededItems.length);
	});

	it('lets a teacher still edit a body stored before the migration', async () => {
		const target = seededItems[0];
		const shaped = itemBodyColumns(editorDoc(itemSchema, pmDoc(pmPara(pmText('Edited after 0122.')))));
		if (!shaped.ok) throw new Error('fixture refused');
		await db.asUser(teacher.id, (q) =>
			q(
				'select public.classroom_update_item(p_id => $1::uuid, p_body => $2, p_body_doc => $3::jsonb) as result',
				[target.itemId, shaped.body, JSON.stringify(shaped.doc)]
			)
		);
		const { rows } = await db.sql<{ body: string }>(
			'select body from public.classroom_items where id = $1',
			[target.itemId]
		);
		expect(rows[0].body).toBe('Edited after 0122.');
	});

	it('accepts a nested list at every permitted depth and refuses the first one past the cap', async () => {
		for (let depth = 1; depth <= ITEM_MAX_DEPTH; depth++) {
			expect(measuredDepth(nested(depth)), `builder must really nest ${depth} deep`).toBe(depth);
			expect(await gate(nested(depth)), `depth ${depth} must be accepted`).toBe(true);
		}
		expect(await gate(nested(ITEM_MAX_DEPTH + 1))).toBe(false);
		expect(await gate(nested(ITEM_MAX_DEPTH + 2))).toBe(false);

		expect(await gate(nested(5, 'ol'))).toBe(true);
		expect(await gate([{ type: 'h3', runs: [{ text: 'Steps' }] }, ...nested(3)])).toBe(true);
	});

	it('refuses malformed nesting, including a heading where a run belongs', async () => {
		for (const c of REFUSED_NESTED) {
			expect(await gate(c.doc), `must refuse: ${c.label}`).toBe(false);
		}
		// h3/h4 are legal BLOCKS in a body and still may not sit inside a list
		// item: only a list may nest.
		expect(await gate(nestedWith(2, { type: 'h3', runs: [{ text: 'x' }] }))).toBe(false);
		expect(await gate(nestedWith(2, { type: 'h4', runs: [{ text: 'x' }] }))).toBe(false);
		expect(REFUSED_NESTED.length).toBeGreaterThan(0);

		expect(await gate(nestedWith(4, { text: 'fine' }))).toBe(true);
		expect(await gate(nestedWith(4, { type: 'ol', items: [[{ text: 'fine' }]] }))).toBe(true);
	});

	it('refuses a run with no text key, flat or nested, unlike the notebook', async () => {
		// The other half of the divergence recorded at ODD_FLAT: 0108 wrote
		// every type check `is distinct from`, so this gate answers a plain
		// false where 0078 answers NULL. Nesting must not change that either.
		expect(await gate([{ type: 'p', runs: [{ italic: true }] }])).toBe(false);
		expect(await gate(RUN_WITHOUT_TEXT_AT_DEPTH)).toBe(false);
	});

	it('refuses unbounded self-similar nesting with a false, not a stack error', async () => {
		expect(measuredDepth(SELF_SIMILAR)).toBe(500);
		expect(await gate(SELF_SIMILAR)).toBe(false);

		await expect(
			db.asUser(teacher.id, (q) =>
				q(
					`select public.classroom_create_item(
						p_kind => 'post', p_section_ids => $1::uuid[], p_body_doc => $2::jsonb) as result`,
					[[section], JSON.stringify(SELF_SIMILAR)]
				)
			)
		).rejects.toThrow(/could not be read/);
	});

	it('projects a nested list one line per item, at every level', async () => {
		const doc = [
			{ type: 'h3', runs: [{ text: 'Lab 3' }] },
			{
				type: 'ul',
				items: [
					[
						{ text: 'Materials' },
						{ type: 'ul', items: [[{ text: '250 mL beaker' }], [{ text: 'Digital scale' }]] }
					],
					[{ text: 'Method' }]
				]
			}
		];
		expect(await docText(doc)).toBe(
			'Lab 3\nMaterials\n250 mL beaker\nDigital scale\nMethod'
		);

		// Three levels, to prove the recursion is not one level of special case.
		expect(await docText(nested(3))).toBe('level 1\nlevel 2\nlevel 3');
	});

	it('derives body from a nested document written through the real RPC', async () => {
		const doc = [
			{
				type: 'ol',
				items: [
					[{ text: 'Zero the scale' }, { type: 'ul', items: [[{ text: 'Tare with the beaker on' }]] }],
					[{ text: 'Mass the sample' }]
				]
			}
		];
		// The caller LIES about the text, the way a PostgREST caller can. The
		// document is the authority and the RPC re-derives.
		const itemId = await createItem(doc, 'nothing like the document');
		const { rows } = await db.sql<{ body: string; body_doc: unknown }>(
			'select body, body_doc from public.classroom_items where id = $1',
			[itemId]
		);
		expect(rows[0].body_doc).toEqual(doc);
		expect(rows[0].body).toBe('Zero the scale\nTare with the beaker on\nMass the sample');
	});

	it('re-applies without changing any answer', async () => {
		const first = await Promise.all(corpus.map((c) => gate(c.doc)));
		const firstText = await Promise.all(seededItems.map((s) => docText(s.doc)));
		await db.sql(MIGRATION_0122);
		expect(await Promise.all(corpus.map((c) => gate(c.doc)))).toEqual(first);
		expect(await Promise.all(seededItems.map((s) => docText(s.doc)))).toEqual(firstText);
		expect(await gate(nested(ITEM_MAX_DEPTH))).toBe(true);
		expect(await gate(nested(ITEM_MAX_DEPTH + 1))).toBe(false);
	});
});
