// tests/notebook-run-text-parity.test.ts
//
// 0125: the notebook note gate stops ACCEPTING a run that carries no `text`
// key, and starts answering it the way the classroom gate always has. Against
// REAL embedded Postgres with the REAL migration files applied unmodified.
//
// WHY THIS EARNS A TEST, against this repo's default of verifying by dev
// harness. Every failure mode here is silent, and they run in both directions:
//
//   * THE DEFECT ITSELF IS INVISIBLE. `_notebook_note_run_len` (0078) asks
//     `jsonb_typeof(p_run -> 'text') <> 'string'`, which is SQL NULL rather
//     than true for an ABSENT key, so the guard does not fire, the function
//     returns NULL, the NULL poisons the running character total at every
//     level, `_notebook_note_content_ok` returns NULL instead of false, and
//     every write RPC's `if not <gate> then raise` DOES NOT FIRE ON NULL. The
//     fall-through does not skip a check, it ACCEPTS THE WRITE -- and nothing
//     anywhere says so. That whole chain is asserted below, link by link,
//     because "the gate returns NULL" and "the row is stored" are different
//     claims and only the second one matters.
//   * A NARROWING THAT STRANDS STORED WORK IS ALSO SILENT. Existing rows keep
//     rendering; only the NEXT SAVE fails, mid-edit, for a student. So 0125
//     REFUSES to apply while any stored row would change answer, and that
//     refusal is asserted here against a database seeded through the REAL
//     pre-migration RPC -- not against a hand-written row.
//   * A FIX THAT NARROWED MORE THAN THE ONE CASE would look identical to a
//     correct one from the outside. The whole stored corpus is put to the
//     DEPLOYED gate first, the migration is applied over the top of the SAME
//     database, and the answers are compared case for case.
//
// PARITY IS ASSERTED ACROSS TWO DATABASES, and that is deliberate rather than
// a shortcut: the notebook gate and the classroom gate sit on different
// migration chains, and merging them into one chain to make the comparison
// convenient would be asserting parity on a schema nobody deploys. The same
// input strings go to both, and the answers must match.
//
// NOT COVERED HERE, stated rather than left silent: the live Supabase project.
// The local `.env` is the placeholder (`example-ref`), so THE SURVEY COUNT
// BELOW IS A COUNT OVER SEEDED FIXTURES, not over production. What protects
// production is that 0125 takes the same count itself, at apply time, against
// the real table, and refuses.

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

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const migration = (file: string) =>
	readFileSync(join(REPO_ROOT, 'supabase', 'migrations', file), 'utf8');

const NESTED_LISTS = '0122_rich_text_nested_lists.sql';
const MIGRATION_0125 = migration('0125_notebook_run_text_parity.sql');

/** The classroom chain 0108's gate needs, plus 0122's widening of it. */
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
	'0110_classroom_content_revisions.sql',
	NESTED_LISTS
] as const;

/**
 * The documents the FLATTENING normalizer really emitted, recorded at the
 * commit before nesting shipped. See tests/rich-text-nested-lists.test.ts for
 * why this is read rather than recomputed: this file's parity claim is about
 * rows that could actually have been in the table, and a live call to today's
 * normalizer answers a different question.
 */
const FLAT_STORED = JSON.parse(
	readFileSync(new URL('./fixtures/flat-stored-corpus.json', import.meta.url), 'utf8')
) as { notes: { label: string; doc: unknown }[] };

// --- The shapes under test -------------------------------------------------

/** A run with every other key a run may carry, and no `text`. */
const TEXTLESS_RUN = { bold: true } as const;

/** The same defect wearing a different hat, so the fix is not keyed on `bold`. */
const TEXTLESS_RUN_HREF = { href: 'https://example.com/' } as const;

/** Depth 1: a run with no text, directly in a paragraph. */
const FLAT_TEXTLESS = [{ type: 'p', runs: [{ text: 'real words' }, TEXTLESS_RUN] }];

/** A list nested `depth` deep, with `leaf` spliced into the deepest item. */
function nestedWith(depth: number, leaf: unknown): unknown[] {
	let node: unknown = { type: 'ul', items: [[{ text: `level ${depth}` }, leaf]] };
	for (let d = depth - 1; d >= 1; d--) {
		node = { type: 'ul', items: [[{ text: `level ${d}` }, node]] };
	}
	return [node];
}

/** Depth 5: the same run, five list levels down. */
const DEEP_TEXTLESS = nestedWith(5, TEXTLESS_RUN);
const DEEP_TEXTLESS_HREF = nestedWith(5, TEXTLESS_RUN_HREF);

/** THE POSITIVE CONTROLS: the identical shapes with a `text` key present. */
const FLAT_OK = [{ type: 'p', runs: [{ text: 'real words' }, { text: 'more', bold: true }] }];
const DEEP_OK = nestedWith(5, { text: 'more', bold: true });

/**
 * 0078's OTHER `<>` trap, on a list block with no `items` key. 0122 preserved
 * it on purpose and so does 0125. It is here as the control that this
 * migration narrowed exactly ONE thing: if this flips to false, the fix went
 * further than it was asked to.
 */
const UL_WITHOUT_ITEMS = [{ type: 'p', runs: [{ text: 'x' }] }, { type: 'ul' }];

// ===========================================================================
// The notebook side
// ===========================================================================

describe('0125 over the notebook note gate', () => {
	let db: TestDb;
	let student: SeededUser;
	let sectionId: string;
	/** label -> the answer the DEPLOYED gate gave, before 0125. */
	let before: Map<string, boolean | null>;

	async function gate(doc: unknown): Promise<boolean | null> {
		const { rows } = await db.sql<{ ok: boolean | null }>(
			'select public._notebook_note_content_ok($1::jsonb) as ok',
			[doc === undefined ? null : JSON.stringify(doc)]
		);
		return rows[0].ok;
	}

	/** Writes a note through the REAL RPC, as the student. */
	function write(doc: unknown): Promise<string> {
		return db.asUser(student.id, async (q) => {
			const { rows } = await q<{ result: { entry_id: string } }>(
				'select public.notebook_create_note_entry(p_content => $1::jsonb, p_section_id => $2::uuid) as result',
				[JSON.stringify(doc), sectionId]
			);
			return rows[0].result.entry_id;
		});
	}

	/** Every document the parity comparison is taken over. */
	const CORPUS: { label: string; doc: unknown }[] = [
		...FLAT_STORED.notes.map(({ label, doc }) => ({ label: `producible: ${label}`, doc })),
		{ label: 'flat, ok', doc: FLAT_OK },
		{ label: 'nested 5, ok', doc: DEEP_OK },
		{ label: 'a list block with no items key', doc: UL_WITHOUT_ITEMS },
		{ label: 'an empty document', doc: [] },
		{ label: 'an unknown block type', doc: [{ type: 'script', runs: [{ text: 'x' }] }] },
		{ label: 'a run with an unknown key', doc: [{ type: 'p', runs: [{ text: 'x', style: 'y' }] }] },
		{ label: 'a javascript: href', doc: [{ type: 'p', runs: [{ text: 'x', href: 'javascript:alert(1)' }] }] },
		{ label: 'a run whose text is JSON null', doc: [{ type: 'p', runs: [{ text: null }] }] },
		{ label: 'a note with no text at all', doc: [{ type: 'p', runs: [] }] }
	];

	beforeAll(async () => {
		// SHORT OF 0125: the world as deployed. Everything is measured here
		// first and only then measured again with the file applied over the
		// top of this same database.
		db = await startTestDb(NOTE_CHAIN);
		await db.sql(migration(NESTED_LISTS));

		student = await createUser(db, 'ramona.pike@boscotech.net', 'Ramona Pike');
		const teacher = await createUser(db, 'chair@boscotech.edu', 'Dana Chair');
		sectionId = await createClassroomSection(db, {
			as: teacher,
			courseCode: 'ENG1H',
			courseTitle: 'Engineering I Honors',
			label: 'Period 2',
			teacherEmail: teacher.email
		});

		before = new Map();
		for (const { label, doc } of CORPUS) before.set(label, await gate(doc));
	}, 180_000);

	afterAll(async () => {
		await db?.stop();
	});

	// --- The defect, end to end, BEFORE the fix ----------------------------

	describe('the hole, as deployed', () => {
		it('returns NULL rather than false, flat and five levels down', async () => {
			// `toBeNull`, NOT `toBe(false)`. They are wildly different
			// outcomes and only one of them refuses anything.
			expect(await gate(FLAT_TEXTLESS)).toBeNull();
			expect(await gate(DEEP_TEXTLESS)).toBeNull();
			expect(await gate(DEEP_TEXTLESS_HREF)).toBeNull();

			// THE POSITIVE CONTROL: the same shapes with a text key are a
			// plain true, so the NULLs above are about the missing key and
			// not about the shape being unreadable.
			expect(await gate(FLAT_OK)).toBe(true);
			expect(await gate(DEEP_OK)).toBe(true);
		});

		it('STORES such a note through the real RPC -- the NULL accepts the write', async () => {
			// This is the assertion that makes the rest of the file worth
			// writing. A gate returning NULL would be a curiosity if the RPC
			// in front of it still refused; it does not, because `not NULL`
			// is NULL and `if NULL then raise` never fires.
			const entryId = await write(FLAT_TEXTLESS);
			const { rows } = await db.sql<{ n: string }>(
				`select count(*)::text as n from public.notebook_entry_notes
				  where entry_id = $1 and content @> '[{"type":"p"}]'::jsonb`,
				[entryId]
			);
			expect(Number(rows[0].n)).toBe(1);
		});
	});

	// --- The migration refuses while such a row is stored ------------------

	describe('0125 refuses rather than strands stored work', () => {
		it('raises with the count, and changes nothing, while an affected row exists', async () => {
			// The row seeded above is still there, written by the REAL RPC.
			await expect(db.sql(MIGRATION_0125)).rejects.toThrow(
				/0125 REFUSED: 1 of \d+ stored note revision\(s\) would stop being saveable/
			);

			// AND IT LEFT THE GATE ALONE. A refusal that fires after the
			// `create or replace` has already run is not a refusal.
			expect(await gate(FLAT_TEXTLESS)).toBeNull();
		});
	});

	// --- With the affected row gone, it applies ----------------------------

	describe('after 0125', () => {
		let after: Map<string, boolean | null>;

		beforeAll(async () => {
			// Clear the deliberately-seeded bad row, which is the only thing
			// standing between this database and the migration. Nothing else
			// is touched: the corpus rows written above stay exactly as they
			// were, which is what the parity comparison is about.
			const { rowCount } = await db.sql(
				`delete from public.notebook_entry_notes
				  where public._notebook_note_content_ok(content) is null`
			);
			expect(rowCount).toBe(1);

			await db.sql(MIGRATION_0125);

			// PROVE IT LANDED before a single result is read from it. A
			// `create or replace` that silently left the old body in place
			// would make every assertion below read as a gate bug.
			const { rows } = await db.sql<{ proname: string; n: string; prosrc: string }>(
				`select proname, count(*) over (partition by proname)::text as n, prosrc
				   from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
				  where ns.nspname = 'public'
				    and proname in ('_notebook_note_run_len', '_notebook_note_content_ok')`
			);
			const src = new Map(rows.map((r) => [r.proname, r]));
			// Exactly one arity each: the signature trap.
			expect(src.get('_notebook_note_run_len')?.n).toBe('1');
			expect(src.get('_notebook_note_content_ok')?.n).toBe('1');
			expect(src.get('_notebook_note_run_len')?.prosrc).toContain(
				"jsonb_typeof(p_run -> 'text') is distinct from 'string'"
			);
			expect(src.get('_notebook_note_content_ok')?.prosrc).toContain('v_total is not null');

			after = new Map();
			for (const { label, doc } of CORPUS) after.set(label, await gate(doc));
		}, 120_000);

		it('refuses a text-less run at depth 1 and at depth 5, with a plain false', async () => {
			expect(await gate(FLAT_TEXTLESS)).toBe(false);
			expect(await gate(DEEP_TEXTLESS)).toBe(false);
			expect(await gate(DEEP_TEXTLESS_HREF)).toBe(false);

			// THE POSITIVE CONTROLS, at the same two depths. Without them a
			// gate that had started refusing EVERYTHING would pass above.
			expect(await gate(FLAT_OK)).toBe(true);
			expect(await gate(DEEP_OK)).toBe(true);
		});

		it('rejects the write through the real RPC, at both depths', async () => {
			for (const doc of [FLAT_TEXTLESS, DEEP_TEXTLESS]) {
				await expect(write(doc)).rejects.toThrow(/not a valid note/);
			}
			// THE POSITIVE CONTROL: an ordinary note still saves, so the
			// rejections above are about the content and not a broken RPC.
			await expect(write(DEEP_OK)).resolves.toEqual(expect.any(String));
		});

		it('answers every already-stored document exactly as the deployed gate did', async () => {
			// The one narrowing this file ships is the text-less run, and no
			// document in the corpus contains one. So every case must match,
			// refusals included -- a gate that quietly tightened something
			// else on the way past is what this assertion is for.
			expect(CORPUS.length).toBeGreaterThan(5);
			// AND THE COMPARISON SPANS BOTH ANSWERS. A corpus the deployed
			// gate happened to refuse entirely -- or accept entirely -- would
			// make "nothing moved" a claim about one half of the function.
			const answers = [...before.values()];
			expect(answers.filter((a) => a === true).length).toBeGreaterThan(0);
			expect(answers.filter((a) => a === false).length).toBeGreaterThan(0);

			const moved = CORPUS.map(({ label }) => ({
				label,
				before: before.get(label),
				after: after.get(label)
			})).filter((c) => c.before !== c.after);
			expect(moved).toEqual([]);
		});

		it('keeps 0078’s OTHER tolerance, for a list block with no items key', async () => {
			// The near neighbour, deliberately untouched. If this flips the
			// fix went further than it was asked to, and would be refusing
			// content nobody has counted.
			expect(await gate(UL_WITHOUT_ITEMS)).toBe(true);
		});

		it('leaves every stored row saveable', async () => {
			const { rows } = await db.sql<{ total: string; refused: string }>(
				`select count(*)::text as total,
				        count(*) filter (where public._notebook_note_content_ok(content) is not true)::text as refused
				   from public.notebook_entry_notes`
			);
			expect(Number(rows[0].total)).toBeGreaterThan(0);
			expect(Number(rows[0].refused)).toBe(0);
		});

		it('re-applies cleanly', async () => {
			await db.sql(MIGRATION_0125);
			expect(await gate(FLAT_TEXTLESS)).toBe(false);
			expect(await gate(FLAT_OK)).toBe(true);
		});

		it('DEFENCE IN DEPTH: opening the run guard alone still refuses', async () => {
			// The two layers are opened one at a time, which is the only way
			// to tell defence in depth from a redundant line a test never
			// noticed. Layer 1 is `_notebook_note_run_len`'s `is distinct
			// from`; layer 2 is `_notebook_note_content_ok`'s `v_total is not
			// null`.
			const OPEN_RUN_GUARD = `
				create or replace function public._notebook_note_run_len(p_run jsonb)
				returns integer language plpgsql immutable set search_path = '' as $mut$
				begin
					-- MUTANT: 0078's original <> guard, back again.
					if p_run is null or jsonb_typeof(p_run) <> 'object' then return -1; end if;
					if exists (select 1 from jsonb_object_keys(p_run) k
					            where k not in ('text','bold','italic','href')) then return -1; end if;
					if jsonb_typeof(p_run -> 'text') <> 'string' then return -1; end if;
					return char_length(p_run ->> 'text');
				end;
				$mut$;
			`;
			await db.sql(OPEN_RUN_GUARD);
			// PROVE THE MUTATION REACHED THE DATABASE before reading a result
			// from it. A mutation that did not land makes the assertion below
			// pass for the wrong reason.
			const { rows: mutated } = await db.sql<{ prosrc: string }>(
				`select prosrc from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
				  where ns.nspname = 'public' and proname = '_notebook_note_run_len'`
			);
			expect(mutated[0].prosrc).toContain('MUTANT');
			const { rows: raw } = await db.sql<{ len: number | null }>(
				'select public._notebook_note_run_len($1::jsonb) as len',
				[JSON.stringify(TEXTLESS_RUN)]
			);
			expect(raw[0].len).toBeNull(); // layer 1 is genuinely open

			// LAYER 2 HOLDS ANYWAY. This is the whole claim.
			expect(await gate(FLAT_TEXTLESS)).toBe(false);
			expect(await gate(DEEP_TEXTLESS)).toBe(false);
			expect(await gate(FLAT_OK)).toBe(true);

			// AND NOW OPEN LAYER 2 AS WELL, which is the only way to know it
			// was layer 2 doing the holding rather than something else in the
			// chain. With both open the gate goes back to answering NULL --
			// 0078's behaviour, exactly.
			await db.sql(
				`create or replace function public._notebook_note_content_ok(p_content jsonb)
				 returns boolean language plpgsql immutable set search_path = '' as $mut$
				 declare v_run jsonb; v_len integer; v_total integer := 0;
				 begin
					-- MUTANT: the narrow slice of 0078 this pair guards, with
					-- neither guard in it.
					for v_run in select value from jsonb_array_elements(p_content -> 0 -> 'runs') loop
						v_len := public._notebook_note_run_len(v_run);
						if v_len < 0 then return false; end if;
						v_total := v_total + v_len;
					end loop;
					return v_total > 0 and v_total <= 20000;
				 end;
				 $mut$;`
			);
			const { rows: bothOpen } = await db.sql<{ prosrc: string }>(
				`select prosrc from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
				  where ns.nspname = 'public' and proname = '_notebook_note_content_ok'`
			);
			expect(bothOpen[0].prosrc).toContain('MUTANT');
			expect(await gate(FLAT_TEXTLESS)).toBeNull();

			// Restore by re-applying the real migration, and confirm the
			// restoration landed rather than assuming it.
			await db.sql(MIGRATION_0125);
			const { rows: restored } = await db.sql<{ prosrc: string }>(
				`select prosrc from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
				  where ns.nspname = 'public' and proname = '_notebook_note_run_len'`
			);
			expect(restored[0].prosrc).not.toContain('MUTANT');
			expect(restored[0].prosrc).toContain("is distinct from 'string'");
			const { rows: restoredGate } = await db.sql<{ prosrc: string }>(
				`select prosrc from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
				  where ns.nspname = 'public' and proname = '_notebook_note_content_ok'`
			);
			expect(restoredGate[0].prosrc).not.toContain('MUTANT');
			expect(restoredGate[0].prosrc).toContain('v_total is not null');
			expect(await gate(FLAT_TEXTLESS)).toBe(false);
			expect(await gate(DEEP_OK)).toBe(true);
		});
	});
});

// ===========================================================================
// Parity with the classroom gate
// ===========================================================================

describe('the two gates now answer one shape one way', () => {
	let noteDb: TestDb;
	let itemDb: TestDb;

	/** The cases both gates are asked, and the answer both must give. */
	const SHARED: { label: string; doc: unknown; want: boolean }[] = [
		{ label: 'a text-less run, flat', doc: FLAT_TEXTLESS, want: false },
		{ label: 'a text-less run at depth 5', doc: DEEP_TEXTLESS, want: false },
		{ label: 'a text-less run carrying an href, at depth 5', doc: DEEP_TEXTLESS_HREF, want: false },
		{ label: 'an ordinary paragraph', doc: FLAT_OK, want: true },
		{ label: 'an ordinary nested list at depth 5', doc: DEEP_OK, want: true },
		{ label: 'a run whose text is JSON null', doc: [{ type: 'p', runs: [{ text: null }] }], want: false },
		{ label: 'a javascript: href', doc: [{ type: 'p', runs: [{ text: 'x', href: 'javascript:alert(1)' }] }], want: false }
	];

	beforeAll(async () => {
		noteDb = await startTestDb(NOTE_CHAIN);
		await noteDb.sql(migration(NESTED_LISTS));
		await noteDb.sql(MIGRATION_0125);
		itemDb = await startTestDb(ITEM_CHAIN);
	}, 180_000);

	afterAll(async () => {
		await noteDb?.stop();
		await itemDb?.stop();
	});

	it('agrees case for case, refusals included', async () => {
		expect(SHARED.length).toBeGreaterThan(4);
		const disagreed: string[] = [];
		for (const { label, doc, want } of SHARED) {
			const { rows: n } = await noteDb.sql<{ ok: boolean | null }>(
				'select public._notebook_note_content_ok($1::jsonb) as ok',
				[JSON.stringify(doc)]
			);
			const { rows: i } = await itemDb.sql<{ ok: boolean | null }>(
				'select public._classroom_doc_ok($1::jsonb) as ok',
				[JSON.stringify(doc)]
			);
			if (n[0].ok !== i[0].ok || n[0].ok !== want) {
				disagreed.push(`${label}: notebook=${n[0].ok}, classroom=${i[0].ok}, want=${want}`);
			}
		}
		expect(disagreed).toEqual([]);
	});

	it('POSITIVE CONTROL: the two gates still differ where they are SUPPOSED to', async () => {
		// 0078's list-block-with-no-items tolerance is the one place they are
		// knowingly apart, and 0125 did not close it. Without this, a "parity"
		// that had been achieved by making one gate answer true to everything
		// -- or by both probes reading the same function -- would pass above.
		const { rows: n } = await noteDb.sql<{ ok: boolean | null }>(
			'select public._notebook_note_content_ok($1::jsonb) as ok',
			[JSON.stringify(UL_WITHOUT_ITEMS)]
		);
		const { rows: i } = await itemDb.sql<{ ok: boolean | null }>(
			'select public._classroom_doc_ok($1::jsonb) as ok',
			[JSON.stringify(UL_WITHOUT_ITEMS)]
		);
		expect(n[0].ok).toBe(true);
		expect(i[0].ok).toBe(false);
	});
});
