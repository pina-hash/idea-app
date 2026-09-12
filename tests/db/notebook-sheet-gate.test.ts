// tests/db/notebook-sheet-gate.test.ts
//
// 0210: the notebook note gate starts ACCEPTING a `grid` block, and a grid's
// own cell text counts toward the note's character floor. Against REAL embedded
// Postgres with the REAL migration files applied unmodified.
//
// WHY THIS EARNS A TEST, against this repo's default of verifying by dev
// harness. Three of the four failure modes here are SILENT:
//
//   * A GATE CHANGE IS A NARROWING SOMEWHERE UNLESS PROVEN OTHERWISE, and the
//     narrowing is invisible: every stored row keeps rendering, and only the
//     NEXT SAVE fails, mid-edit, in front of the student who wrote it. 0210 is
//     a widening by construction, but "by construction" is a claim about a
//     diff. The obligation that outranks it is behavioural -- it must answer
//     every already-stored note EXACTLY as the deployed gate does -- and the
//     only way to know is to put a corpus to the deployed function first, apply
//     the file over the SAME database, and compare case for case.
//   * A THREE-VALUED ANSWER IS WORSE THAN A WRONG ONE. Every caller of this
//     gate asks `if not <gate> then raise`, and `not NULL` is NULL, so a gate
//     that returns NULL ACCEPTS the write -- the exact hole 0125 closed. A new
//     branch reintroducing it would look like a refusal in every reading and be
//     an acceptance in every run, so the corpus asserts `toBe(false)` and never
//     `toBeFalsy`, and the absent-key shapes are in it deliberately.
//   * THE ANON GRANT. A hosted Supabase project's default privileges write a
//     DIRECT `anon` grant into every new function's ACL at creation time, so
//     `revoke ... from public` does not close one. 0201 got this wrong for ten
//     functions and nothing anywhere reported it; 0202 is the repair. The ACL
//     is read back off the catalog here rather than inferred from the file
//     having a revoke in it.
//   * AND THE CAPS ARE STATED IN TWO LANGUAGES. `grid-doc.ts` carries the same
//     three numbers because a surface must refuse a too-large grid with a
//     SENTENCE, which a CHECK predicate cannot give. An unpinned mirror is the
//     shape this repository has been bitten by, so the numbers are read out of
//     the migration's own text and compared.
//
// NOT COVERED HERE, stated rather than left silent: the live Supabase project.
// The local `.env` is the placeholder (`example-ref`), so every count below is
// over SEEDED FIXTURES. What protects production is that 0210 takes the same
// comparison itself, at apply time, against the real table, and refuses.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUser, startTestDb, type SeededUser, type TestDb } from './harness';
import {
	NOTE_GRID_MAX_CELL_CHARS,
	NOTE_GRID_MAX_COLS,
	NOTE_GRID_MAX_ROWS,
	gridProblem,
	gridTextLength,
	type NoteGrid
} from '../../src/lib/notebook/grid/grid-doc';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const migration = (file: string) =>
	readFileSync(join(REPO_ROOT, 'supabase', 'migrations', file), 'utf8');

/**
 * THE WORLD AS DEPLOYED, short of 0210. The note chain through 0129, which is
 * the last file to touch the write RPCs, plus 0122's nested lists and 0125's
 * run-text parity -- 0125 is the file that defines the gate this one replaces,
 * and nothing after it redefines the body (0137 touches only grants).
 */
const PRE_CHAIN = [
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
	'0088_notebook_folders.sql',
	'0091_notebook_pin_and_activity.sql',
	'0094_notebook_classroom_sections.sql',
	'0098_notebook_session_postings.sql',
	'0099_notebook_view_as.sql',
	'0106_notebook_instructor_student_access.sql',
	'0114_notebook_note_entry_session.sql',
	'0116_notebook_soft_delete.sql',
	'0117_notebook_soft_delete_restore.sql',
	'0118_notebook_draft_state.sql',
	'0119_notebook_note_delete.sql',
	'0122_rich_text_nested_lists.sql',
	'0125_notebook_run_text_parity.sql',
	'0129_notebook_note_coalesce.sql',
	// LAST, because it is a sweep over whatever the chain above created. This is
	// the harness's own rule and it is what makes the ACL assertions below
	// measure the deployed end state rather than the bootstrap defaults.
	'0137_anon_execute_sweep.sql'
] as const;

const MIGRATION_0210_FILE = '0210_notebook_note_grid.sql';
const MIGRATION_0210 = migration(MIGRATION_0210_FILE);

const grid = (rows: string[][]): NoteGrid => ({ type: 'grid', rows });

/**
 * THE CORPUS. Every document that could be in the table today, plus every
 * document the widening is about.
 *
 * THE `before` HALF IS WHAT MAKES IT A PARITY TEST rather than a feature test:
 * the same list is answered by the DEPLOYED gate before the file is applied and
 * by the widened one after, and only the rows the widening is about may move.
 * Written as one array so a case cannot be in one half and not the other.
 */
const CORPUS: { label: string; doc: unknown; movesTo?: boolean }[] = [
	// --- Documents that already exist. NONE of these may move. -------------
	{ label: 'a paragraph', doc: [{ type: 'p', runs: [{ text: 'hello' }] }] },
	{ label: 'a bold run', doc: [{ type: 'p', runs: [{ text: 'x', bold: true }] }] },
	{ label: 'a link', doc: [{ type: 'p', runs: [{ text: 'x', href: 'https://example.com' }] }] },
	{ label: 'a javascript: href', doc: [{ type: 'p', runs: [{ text: 'x', href: 'javascript:alert(1)' }] }] },
	{ label: 'a bulleted list', doc: [{ type: 'ul', items: [[{ text: 'a' }]] }] },
	{ label: 'a numbered list', doc: [{ type: 'ol', items: [[{ text: 'a' }]] }] },
	{ label: 'a nested list', doc: [{ type: 'ul', items: [[{ text: 'a' }, { type: 'ul', items: [[{ text: 'b' }]] }]] }] },
	{
		label: 'a list block with NO items key (0078 <> trap, preserved)',
		doc: [{ type: 'p', runs: [{ text: 'x' }] }, { type: 'ul' }]
	},
	{ label: 'a run with no text key (0125 closed this)', doc: [{ type: 'p', runs: [{ bold: true }] }] },
	{ label: 'a run with an unknown key', doc: [{ type: 'p', runs: [{ text: 'x', style: 'y' }] }] },
	{ label: 'a note with no text at all', doc: [{ type: 'p', runs: [] }] },
	{ label: 'an empty document', doc: [] },
	{ label: 'not an array', doc: { type: 'p' } },
	{ label: 'a paragraph with an unknown key', doc: [{ type: 'p', runs: [], sheet: 1 }] },
	{ label: 'an unknown block type: sheet', doc: [{ type: 'sheet', rows: [['a']] }] },
	{ label: 'an unknown block type: table', doc: [{ type: 'table', rows: [['a']] }] },
	{ label: 'a block with no type at all', doc: [{ runs: [{ text: 'x' }] }] },

	// --- THE WIDENING. These are the only rows allowed to move. ------------
	{ label: 'GRID: alongside a paragraph', doc: [{ type: 'p', runs: [{ text: 'x' }] }, grid([['a', 'b']])], movesTo: true },
	{ label: 'GRID: alone, with words in it', doc: [grid([['Part', 'Qty'], ['Angle', '4']])], movesTo: true },
	{ label: 'GRID: alone, pure numbers', doc: [grid([['1', '2'], ['3', '4']])], movesTo: true },
	{ label: 'GRID: alone, holding a formula', doc: [grid([['1'], ['=SUM(A1:A1)']])], movesTo: true },
	{ label: 'GRID: one cell, one character', doc: [grid([['x']])], movesTo: true },
	{ label: 'GRID: at the row cap', doc: [grid(Array.from({ length: NOTE_GRID_MAX_ROWS }, () => ['x']))], movesTo: true },
	{ label: 'GRID: at the column cap', doc: [grid([Array.from({ length: NOTE_GRID_MAX_COLS }, () => 'x')])], movesTo: true },
	{ label: 'GRID: a cell at the character cap', doc: [grid([['x'.repeat(NOTE_GRID_MAX_CELL_CHARS)]])], movesTo: true },

	// --- Grids that stay refused. These do NOT move: false before, false after.
	{ label: 'GRID: every cell empty (the text floor)', doc: [grid([['', ''], ['', '']])] },
	{ label: 'GRID: ragged rows', doc: [grid([['a', 'b'], ['c']])] },
	{ label: 'GRID: no rows', doc: [grid([])] },
	{ label: 'GRID: a row that is not an array', doc: [{ type: 'grid', rows: ['ab'] }] },
	{ label: 'GRID: a numeric cell', doc: [{ type: 'grid', rows: [[1]] }] },
	{ label: 'GRID: a null cell', doc: [{ type: 'grid', rows: [[null]] }] },
	{ label: 'GRID: an extra key', doc: [{ type: 'grid', rows: [['a']], cols: 1 }] },
	{ label: 'GRID: NO rows key at all', doc: [{ type: 'grid' }] },
	{ label: 'GRID: rows is an object', doc: [{ type: 'grid', rows: { 0: ['a'] } }] },
	{ label: 'GRID: rows is JSON null', doc: [{ type: 'grid', rows: null }] },
	{ label: 'GRID: one row over the row cap', doc: [grid(Array.from({ length: NOTE_GRID_MAX_ROWS + 1 }, () => ['x']))] },
	{ label: 'GRID: one column over the column cap', doc: [grid([Array.from({ length: NOTE_GRID_MAX_COLS + 1 }, () => 'x')])] },
	{ label: 'GRID: a cell one character over the cap', doc: [grid([['x'.repeat(NOTE_GRID_MAX_CELL_CHARS + 1)]])] },
	{ label: 'GRID: smuggled onto a paragraph', doc: [{ type: 'p', runs: [], grid: { rows: [['a']] } }] },
	{ label: 'GRID: smuggled into a run', doc: [{ type: 'p', runs: [{ text: 'x', grid: [['a']] }] }] },
	{ label: 'GRID: over the note character ceiling', doc: [grid([[ 'x'.repeat(400) ], ...Array.from({ length: 60 }, () => ['x'.repeat(400)])])] }
];

/**
 * THE TWO CASES WHERE `gridProblem` AND THE GATE LEGITIMATELY DISAGREE, and
 * they disagree in one direction only: a WELL-FORMED grid inside a note the
 * gate refuses for a reason that is not about the grid.
 *
 * `gridProblem` answers "is this a grid"; `_notebook_note_content_ok` answers
 * "is this a saveable note". The note's text floor and its 20,000-character
 * ceiling are the note's questions, and a predicate handed one block cannot
 * answer them -- so THE SURFACE MUST ASK BOTH before it lets a student press
 * save, and a client that asked only `gridProblem` would offer a save the
 * database then refuses.
 */
const NOTE_LEVEL_ONLY = [
	'GRID: every cell empty (the text floor)',
	'GRID: over the note character ceiling'
];

describe('0210 over the notebook note gate', () => {
	let db: TestDb;
	let student: SeededUser;
	/** label -> the answer the DEPLOYED gate gave, before 0210. */
	let before: Map<string, boolean | null>;

	const gate = async (doc: unknown): Promise<boolean | null> => {
		const { rows } = await db.sql<{ ok: boolean | null }>(
			'select public._notebook_note_content_ok($1::jsonb) as ok',
			[JSON.stringify(doc)]
		);
		return rows[0].ok;
	};

	beforeAll(async () => {
		db = await startTestDb(PRE_CHAIN);
		student = await createUser(db, 'ramona.pike@boscotech.net', 'Ramona Pike');
		before = new Map();
		for (const { label, doc } of CORPUS) before.set(label, await gate(doc));
	}, 180_000);

	afterAll(async () => {
		await db?.stop();
	});

	// --- The world as deployed --------------------------------------------

	describe('the deployed gate, before anything is applied', () => {
		it('refuses every grid shape, with FALSE and never NULL, against two positive controls', async () => {
			// THE CONTROLS FIRST. Without them a probe whose helper returned
			// undefined would have "refused" everything and read as a clean
			// result -- which is exactly the shape ledger 0180's own probe
			// guarded against.
			expect(before.get('a paragraph')).toBe(true);
			expect(before.get('a bulleted list')).toBe(true);

			// `toBe(false)`, NOT `toBeFalsy`. NULL out of this gate means the
			// write is ACCEPTED, so the two outcomes are opposite and only one
			// of them refuses anything.
			for (const { label } of CORPUS.filter((c) => c.label.startsWith('GRID'))) {
				expect(before.get(label), label).toBe(false);
			}
		});

		it('REFUSES a grid through the real write RPC, so the widening is the only door', async () => {
			await db.asUser(student.id, async (q) => {
				await expect(
					q('select public.notebook_create_note_entry($1::jsonb)', [
						JSON.stringify([grid([['Part', 'Qty']])])
					])
				).rejects.toThrow();
			});
		});
	});

	// --- The migration, applied over the SAME database ---------------------

	describe('applied over the same database', () => {
		it('applies without raising, and its own survey counts 0 rows that change answer', async () => {
			// The file's section 3 raises if any stored revision moves. Reaching
			// here at all is that survey passing against real seeded rows.
			await expect(db.sql(MIGRATION_0210)).resolves.toBeTruthy();
		});

		it('RE-APPLIES cleanly, because re-pasting a migration is ordinary', async () => {
			await expect(db.sql(MIGRATION_0210)).resolves.toBeTruthy();
		});

		it('answers every already-possible document EXACTLY as the deployed gate did', async () => {
			// THE CENTRAL OBLIGATION. Case for case, with the count reported so a
			// corpus that somehow generated nothing cannot pass.
			const unchanged = CORPUS.filter((c) => c.movesTo === undefined);
			expect(unchanged.length).toBe(CORPUS.length - 8);
			let compared = 0;
			for (const { label, doc } of unchanged) {
				expect(await gate(doc), label).toBe(before.get(label));
				compared += 1;
			}
			expect(compared).toBe(unchanged.length);
		});

		it('moves exactly the eight grid documents the widening is about, and no others', async () => {
			const moved: string[] = [];
			for (const { label, doc } of CORPUS) {
				if ((await gate(doc)) !== before.get(label)) moved.push(label);
			}
			expect(moved.sort()).toEqual(
				CORPUS.filter((c) => c.movesTo !== undefined)
					.map((c) => c.label)
					.sort()
			);
			expect(moved).toHaveLength(8);
		});
	});

	// --- The text floor decision -------------------------------------------

	describe('the text floor: a grid contributes its own cell text', () => {
		it('accepts a note whose ONLY content is a spreadsheet, words or numbers', async () => {
			// THE DECISION, as a measurement. Without it this whole feature ships
			// a spreadsheet that cannot be saved on its own.
			expect(await gate([grid([['Part', 'Qty'], ['Angle', '4']])])).toBe(true);
			expect(await gate([grid([['1', '2'], ['3', '4']])])).toBe(true);
		});

		it('still refuses a grid whose every cell is empty -- the intent 0125 stated holds', async () => {
			expect(await gate([grid([['', ''], ['', '']])])).toBe(false);
			// AND THE ONE-CHARACTER POSITIVE CONTROL BESIDE IT, so the refusal
			// above is about emptiness and not about grids.
			expect(await gate([grid([['', ''], ['', 'x']])])).toBe(true);
		});

		it('counts grid text toward the 20,000 ceiling, not only toward the floor', async () => {
			const under = 'x'.repeat(NOTE_GRID_MAX_CELL_CHARS);
			// 40 x 500 = 20,000 exactly: at the ceiling, accepted.
			expect(await gate([grid(Array.from({ length: 40 }, () => [under]))])).toBe(true);
			// 41 x 500 = 20,500: over it, refused.
			expect(await gate([grid(Array.from({ length: 41 }, () => [under]))])).toBe(false);
		});

		it('adds grid text to prose rather than replacing it', async () => {
			// A paragraph of 19,999 plus a one-character grid is 20,000 (accepted);
			// a two-character grid is 20,001 (refused). That is the only way to
			// see the two totals are ONE total.
			const prose = { type: 'p', runs: [{ text: 'x'.repeat(19_999) }] };
			expect(await gate([prose, grid([['a']])])).toBe(true);
			expect(await gate([prose, grid([['ab']])])).toBe(false);
		});
	});

	// --- The write path, end to end ----------------------------------------

	describe('the real write RPC, after the widening', () => {
		it('STORES a note whose only content is a grid', async () => {
			const entryId = await db.asUser(student.id, async (q) => {
				const { rows } = await q<{ r: { entry_id: string } }>(
					'select public.notebook_create_note_entry($1::jsonb) as r',
					[JSON.stringify([grid([['Part', 'Qty'], ['Angle', '4']])])]
				);
				return rows[0].r.entry_id;
			});
			const { rows } = await db.sql<{ n: string }>(
				`select count(*)::text as n from public.notebook_entry_notes
				  where entry_id = $1 and content @> '[{"type":"grid"}]'::jsonb`,
				[entryId]
			);
			expect(Number(rows[0].n)).toBe(1);
		});

		it('still REFUSES a malformed grid through the same RPC', async () => {
			// The RPC is the boundary, not the client. A ragged grid handed
			// straight to PostgREST has to be refused by the database.
			await db.asUser(student.id, async (q) => {
				await expect(
					q('select public.notebook_create_note_entry($1::jsonb)', [
						JSON.stringify([grid([['a', 'b'], ['c']])])
					])
				).rejects.toThrow();
			});
		});
	});

	// --- The TypeScript mirror ---------------------------------------------

	describe('grid-doc.ts and the SQL agree', () => {
		it('states the same three caps as the migration', () => {
			// READ OUT OF THE FILE'S OWN TEXT. A constant only makes the right
			// number available; this is what makes the two sides unable to move
			// apart. The SQL spells them as literals inside the helper, which is
			// what these patterns match.
			expect(MIGRATION_0210).toMatch(
				new RegExp(`v_rows < 1 or v_rows > ${NOTE_GRID_MAX_ROWS}`)
			);
			expect(MIGRATION_0210).toMatch(
				new RegExp(`v_width < 1 or v_width > ${NOTE_GRID_MAX_COLS}`)
			);
			expect(MIGRATION_0210).toMatch(new RegExp(`v_len > ${NOTE_GRID_MAX_CELL_CHARS}`));
		});

		it('answers every grid in the corpus the same way the gate does', async () => {
			// `gridProblem` is the client's SENTENCE and the gate is the
			// BOUNDARY, so they are two implementations of one rule and this is
			// the pin that stops them drifting. The count is asserted so a filter
			// that matched nothing cannot pass.
			const grids = CORPUS.filter((c) => c.label.startsWith('GRID:'));
			expect(grids.length).toBeGreaterThan(15);
			let checked = 0;
			let noteLevel = 0;
			for (const { label, doc } of grids) {
				// THE GRID BLOCK, FOUND RATHER THAN ASSUMED AT INDEX 0. One case
				// puts a grid AFTER a paragraph, which is the ordinary arrangement
				// and would otherwise have this loop compare `gridProblem`'s answer
				// about a paragraph against the gate's answer about the document.
				const blocks = doc as { type?: string }[];
				const block = blocks.find((b) => b?.type === 'grid') ?? blocks[0];
				// The two "smuggled" cases are about a PARAGRAPH's key whitelist,
				// not about a grid, so they are outside this predicate's remit and
				// are excluded by name rather than by the loop quietly skipping.
				if (label.includes('smuggled')) continue;
				const clientOk = gridProblem(block) === null;
				const dbOk = await gate(doc);
				if (NOTE_LEVEL_ONLY.includes(label)) {
					// THE TWO LEGITIMATE DISAGREEMENTS, NAMED. Both are the gate
					// answering a question about the NOTE that `gridProblem` does
					// not ask and must not start asking: the grid is well formed
					// in each case, and what refuses the document is the note's
					// own text floor (an all-empty grid) or its own 20,000
					// character ceiling. A predicate about a grid cannot know
					// what else is in the note.
					expect(clientOk, label).toBe(true);
					expect(dbOk, label).toBe(false);
					noteLevel += 1;
				} else {
					expect(clientOk, label).toBe(dbOk);
				}
				checked += 1;
			}
			expect(checked).toBe(grids.length - 2);
			// PINNED, so a THIRD divergence cannot appear silently -- which is
			// exactly how a client-side refusal and a database refusal drift into
			// disagreeing about whether a student may press save.
			expect(noteLevel).toBe(NOTE_LEVEL_ONLY.length);
		});

		it('measures a grid the same length the gate counts', async () => {
			// `gridTextLength` is the twin of `_notebook_note_grid_len`. Asked
			// through the ceiling, which is the only way the count is observable
			// from outside a boolean: a grid of exactly 20,000 is accepted and one
			// character more is not, so the TS number IS the SQL number.
			const g = grid([['abc', 'de'], ['f', '']]);
			expect(gridTextLength(g)).toBe(6);
			const pad = { type: 'p', runs: [{ text: 'x'.repeat(20_000 - gridTextLength(g)) }] };
			expect(await gate([pad, g])).toBe(true);
			const padPlus = { type: 'p', runs: [{ text: 'x'.repeat(20_001 - gridTextLength(g)) }] };
			expect(await gate([padPlus, g])).toBe(false);
		});
	});

	// --- The catalog --------------------------------------------------------

	describe('the catalog, read back rather than inferred', () => {
		it('leaves exactly one row per function and no temporary one', async () => {
			const { rows } = await db.sql<{ proname: string; n: string }>(
				`select p.proname, count(*)::text as n
				   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				  where n.nspname = 'public'
				    and p.proname in ('_notebook_note_content_ok', '_notebook_note_grid_len',
				                      '_notebook_note_content_ok_0210')
				  group by p.proname order by p.proname`
			);
			expect(Object.fromEntries(rows.map((r) => [r.proname, Number(r.n)]))).toEqual({
				_notebook_note_content_ok: 1,
				_notebook_note_grid_len: 1
			});
		});

		it('grants EXECUTE to service_role alone, with anon and authenticated both closed', async () => {
			// 0166's shape, asserted off the ACL. This is the assertion 0201
			// did not have.
			const { rows } = await db.sql<Record<string, boolean>>(
				`select
				   has_function_privilege('anon', 'public._notebook_note_grid_len(jsonb)', 'execute') as anon_helper,
				   has_function_privilege('authenticated', 'public._notebook_note_grid_len(jsonb)', 'execute') as auth_helper,
				   has_function_privilege('service_role', 'public._notebook_note_grid_len(jsonb)', 'execute') as svc_helper,
				   has_function_privilege('anon', 'public._notebook_note_content_ok(jsonb)', 'execute') as anon_gate,
				   has_function_privilege('authenticated', 'public._notebook_note_content_ok(jsonb)', 'execute') as auth_gate,
				   has_function_privilege('service_role', 'public._notebook_note_content_ok(jsonb)', 'execute') as svc_gate`
			);
			expect(rows[0]).toEqual({
				anon_helper: false,
				auth_helper: false,
				svc_helper: true,
				anon_gate: false,
				auth_gate: false,
				svc_gate: true
			});
		});

		it('a signed-out caller cannot reach either helper through PostgREST', async () => {
			// THE ACL EXPRESSED AS BEHAVIOUR, which is the half that matters:
			// a `has_function_privilege` false is a claim, a refused call is the
			// thing a caller experiences.
			await db.asAnon(async (q) => {
				await expect(
					q(`select public._notebook_note_grid_len('{}'::jsonb)`)
				).rejects.toThrow(/permission denied/i);
				await expect(
					q(`select public._notebook_note_content_ok('[]'::jsonb)`)
				).rejects.toThrow(/permission denied/i);
			});
		});
	});
});
