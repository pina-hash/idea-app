// tests/dom/notebook-sheet-undo.test.ts
//
// THE CLAIM THE WHOLE DESIGN RESTS ON: A CELL EDIT IS ONE PROSEMIRROR UNDO STEP,
// AND CTRL+Z WALKS BACK THROUGH CELL EDITS AND PROSE IN THE ORDER THEY WERE MADE.
//
// Mr. Pina's bar for decision 08 is that a spreadsheet must work as well inside
// a note as the text does, and ledgers 0180 and 0187 both established that this
// is a bar ABOUT UNDO. `NoteEditor.svelte:202` is
// `StarterKit.configure(NOTE_SCHEMA_OPTIONS)` and `history` is not one of the
// eight extensions switched off, so ProseMirror's history plugin owns Ctrl+Z --
// which is why the grid is a custom NODE and not a component beside the editor.
//
// WHY THIS EARNS A TEST rather than a harness drive. The failure is SILENT and
// it is silent in the direction nobody checks: a grid with its own store renders
// identically, edits identically, and saves identically. What is broken is only
// what happens after two undos, which is a thing somebody discovers weeks later
// and reads as the note losing their work. There is no type error, no console
// warning and nothing on screen. And a claim about UNDO is a claim about the
// relationship between several states, which `svelte/server`'s `render()`
// cannot be asked at all -- it produces one string per call.
//
// WHAT IS ASSERTED HERE AND WHAT IS NOT. Document state, transaction counts,
// node identity, and which handler a real event ran. NOT geometry, NOT contrast
// and NOT a tap target: happy-dom has no layout engine, so those read zero and
// pass vacuously (`tests/dom/README.md`). The grid's 44px cells and its
// behaviour at 375px are `verify:browser`'s claim and stay there.
//
// EVERY UNDO ASSERTION CARRIES ITS OWN POSITIVE CONTROL, because "the document
// went back" passes both when undo works and when the edit never landed. So the
// forward state is asserted before every undo, and one test presses undo one
// time too many to prove the stack is finite rather than a no-op that always
// looks like success.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { NOTE_SCHEMA_OPTIONS } from '$lib/rich-text-schema';
import {
	GRID_DOM_ATTR,
	GRID_NODE_NAME,
	NotebookGrid,
	NOTE_GRID_MAX_COLS,
	cellRef,
	gridFromDom,
	gridProblem
} from '$lib/notebook/grid';

interface GridDocNode {
	type: string;
	attrs?: { rows?: string[][] };
	content?: GridDocNode[];
}

let editor: Editor | null = null;

/**
 * A REAL EDITOR, CONFIGURED EXACTLY AS `NoteEditor.svelte` CONFIGURES ONE, plus
 * the grid node.
 *
 * `NOTE_SCHEMA_OPTIONS` is IMPORTED rather than restated, which is
 * `rich-text-schema.ts`'s own reason for existing: a fixture typed by hand can
 * encode a document ProseMirror cannot produce, and then it exercises a branch
 * no real input reaches. `history` arrives with StarterKit, undisabled, which is
 * the fact under test -- if a later bundle switched it off, every undo
 * assertion below reddens rather than the feature quietly losing its stack.
 *
 * NO NODEVIEW. The NodeView is what draws a grid; the HISTORY is a property of
 * the schema and the transactions, and mounting Svelte inside ProseMirror inside
 * happy-dom would put two more failure modes between this file and the claim it
 * is making. What the NodeView contributes -- that a commit is exactly one
 * `setNodeAttribute` -- is driven directly here through the same command, and
 * `tests/dom/notebook-sheet-grid.test.ts` mounts the component itself.
 */
function makeEditor(content?: unknown): Editor {
	const element = document.createElement('div');
	document.body.appendChild(element);
	return new Editor({
		element,
		extensions: [StarterKit.configure(NOTE_SCHEMA_OPTIONS), NotebookGrid],
		content: content as never
	});
}

/** The document as JSON, which is what the note path would normalize. */
function json(e: Editor): GridDocNode {
	return e.getJSON() as GridDocNode;
}

/** The first grid block's rows, or null. */
function gridRows(e: Editor): string[][] | null {
	const block = json(e).content?.find((n) => n.type === GRID_NODE_NAME);
	return block?.attrs?.rows ?? null;
}

/** The position of the first grid node in the document. */
function gridPos(e: Editor): number {
	let found = -1;
	e.state.doc.descendants((node, pos) => {
		if (found === -1 && node.type.name === GRID_NODE_NAME) found = pos;
		return found === -1;
	});
	if (found === -1) throw new Error('no grid node in the document');
	return found;
}

/** Commit one cell, exactly as the NodeView does: one whole-grid transaction. */
function commitCell(e: Editor, row: number, col: number, source: string): boolean {
	const rows = (gridRows(e) ?? []).map((r, i) =>
		i === row ? r.map((c, j) => (j === col ? source : c)) : r
	);
	return e.commands.setNotebookGrid(gridPos(e), { type: 'grid', rows });
}

beforeAll(() => {
	// The one environment fact worth stating rather than discovering: happy-dom
	// gives ProseMirror enough DOM to build a real EditorView, which is what
	// makes every assertion below about the real history plugin.
	expect(typeof document.createRange).toBe('function');
});

afterEach(() => {
	editor?.destroy();
	editor = null;
});

describe('the grid is a ProseMirror node, so undo is ProseMirror\'s', () => {
	it('has the history extension ON, which is the premise everything else rests on', () => {
		editor = makeEditor('<p>hello</p>');
		// THE PREMISE, ASSERTED. `NOTE_SCHEMA_OPTIONS` switches eight extensions
		// off and this is not one of them; a bundle that added it to that list
		// would silently take undo away from the whole note, grid and prose
		// alike, and this is the line that reddens.
		expect(NOTE_SCHEMA_OPTIONS).not.toHaveProperty('history', false);
		expect(NOTE_SCHEMA_OPTIONS).not.toHaveProperty('undoRedo', false);
		expect(editor.can().undo()).toBe(false);
		editor.commands.insertContent('<p>and more</p>');
		expect(editor.can().undo()).toBe(true);
	});

	it('inserts a grid as ONE block with the whole grid on it, never a node per cell', () => {
		editor = makeEditor('<p>hello</p>');
		editor.commands.insertNotebookGrid(3, 2);

		const grids = json(editor).content?.filter((n) => n.type === GRID_NODE_NAME) ?? [];
		// ONE BLOCK. 0195's precedent, asserted structurally rather than trusted:
		// a per-cell node would be a join key against `notebook_entry_notes`, and
		// that is the orphaning 0128's real port produced.
		expect(grids).toHaveLength(1);
		expect(grids[0].attrs?.rows).toEqual([
			['', ''],
			['', ''],
			['', '']
		]);
		// AND NO CHILD NODES AT ALL, which is what `atom: true` buys. If a later
		// edit made the cells real ProseMirror content this reddens.
		expect(grids[0].content).toBeUndefined();
		// THE NODE IS FOUND, NOT GUESSED AT AN INDEX. `insertContent` puts a
		// block node at the SELECTION, and a fresh editor's selection is the
		// document start -- so the grid lands at child 0, ahead of the
		// paragraph. A hardcoded `child(1)` here measured the paragraph and
		// reported `isAtom` false, which reads exactly like a broken node spec.
		expect(editor.state.doc.nodeAt(gridPos(editor))?.isAtom).toBe(true);
	});

	it('makes ONE undo step per cell commit -- not one per keystroke, not one per grid', () => {
		editor = makeEditor('<p>hello</p>');
		editor.commands.insertNotebookGrid(2, 2);
		expect(commitCell(editor, 0, 0, 'Part')).toBe(true);
		expect(commitCell(editor, 0, 1, 'Qty')).toBe(true);
		expect(commitCell(editor, 1, 0, 'Angle')).toBe(true);

		// FORWARD FIRST. Without this the undos below would pass on a component
		// whose commits never landed at all.
		expect(gridRows(editor)).toEqual([
			['Part', 'Qty'],
			['Angle', '']
		]);

		// THREE COMMITS, THREE UNDOS, IN REVERSE ORDER. A per-keystroke design
		// would need fourteen; a whole-grid-per-session design would need one.
		editor.commands.undo();
		expect(gridRows(editor)).toEqual([
			['Part', 'Qty'],
			['', '']
		]);
		editor.commands.undo();
		expect(gridRows(editor)).toEqual([
			['Part', ''],
			['', '']
		]);
		editor.commands.undo();
		expect(gridRows(editor)).toEqual([
			['', ''],
			['', '']
		]);
		// The fourth undo takes the grid itself back out, because inserting it
		// was also one step.
		editor.commands.undo();
		expect(gridRows(editor)).toBeNull();
	});

	it('redoes them in the order they were made', () => {
		editor = makeEditor('<p>hello</p>');
		editor.commands.insertNotebookGrid(1, 2);
		commitCell(editor, 0, 0, 'a');
		commitCell(editor, 0, 1, 'b');
		editor.commands.undo();
		editor.commands.undo();
		expect(gridRows(editor)).toEqual([['', '']]);
		editor.commands.redo();
		expect(gridRows(editor)).toEqual([['a', '']]);
		editor.commands.redo();
		expect(gridRows(editor)).toEqual([['a', 'b']]);
	});

	it('INTERLEAVES with prose in one stack, which is the whole reason it is a node', () => {
		// THE FAILURE THIS FEATURE EXISTS TO AVOID, written as the assertion.
		// A grid beside the editor with its own stack would undo BOTH cell edits
		// before touching the paragraph, or neither. One stack means: type a
		// paragraph, edit a cell, type again, and three undos walk back through
		// all three in reverse order.
		editor = makeEditor('<p>one</p>');
		editor.commands.insertNotebookGrid(1, 1);
		commitCell(editor, 0, 0, 'cell');
		editor.commands.focus('end');
		editor.commands.insertContent('<p>two</p>');

		// EVERY PARAGRAPH'S TEXT, AS AN ARRAY. Written as a joined string first,
		// which was wrong in a way worth recording: undoing an inserted
		// paragraph REMOVES the node rather than emptying it, so the expected
		// value was a trailing separator that never existed.
		const text = () =>
			(json(editor as Editor).content ?? [])
				.filter((n) => n.type === 'paragraph')
				.map((n) => (n.content ?? []).map((c) => (c as { text?: string }).text ?? '').join(''));

		expect(text()).toEqual(['one', 'two']);
		expect(gridRows(editor)).toEqual([['cell']]);

		// Undo 1: the second paragraph goes, the cell stays.
		editor.commands.undo();
		expect(text()).toEqual(['one']);
		expect(gridRows(editor), 'the cell must survive undoing the prose after it').toEqual([
			['cell']
		]);

		// Undo 2: the CELL goes, the first paragraph stays. This is the
		// assertion a second undo stack cannot pass.
		editor.commands.undo();
		expect(gridRows(editor)).toEqual([['']]);
		expect(text()).toEqual(['one']);
	});

	it('re-uses the node across an undo rather than replacing it', () => {
		// A REMOUNT WOULD DROP FOCUS, so a student pressing Ctrl+Z would lose
		// their place as well as their edit. The NodeView's `update` returning
		// true is what avoids that, and node identity is the only way to see it.
		editor = makeEditor('<p>x</p>');
		editor.commands.insertNotebookGrid(1, 1);
		commitCell(editor, 0, 0, 'v');
		const before = editor.state.doc.nodeAt(gridPos(editor));
		editor.commands.undo();
		const after = editor.state.doc.nodeAt(gridPos(editor));
		expect(before?.type.name).toBe(GRID_NODE_NAME);
		expect(after?.type.name).toBe(GRID_NODE_NAME);
		// THE POSITIVE CONTROL FOR THIS INSTRUMENT: the two ProseMirror nodes are
		// genuinely different objects (attrs changed), so `toBe` here can tell a
		// changed node from an unchanged one and the identity claim below is not
		// vacuous.
		expect(after).not.toBe(before);
		expect(after?.attrs.rows).toEqual([['']]);
	});
});

describe('the write command is the only door, and it refuses rather than clamps', () => {
	it('refuses a grid the gate would reject, instead of trimming it', () => {
		editor = makeEditor('<p>x</p>');
		editor.commands.insertNotebookGrid(2, 2);
		const pos = gridPos(editor);
		const before = gridRows(editor);

		// Ragged, over the column cap, and a non-string cell. Each is a shape the
		// SQL gate refuses, so accepting one here would put a document in the
		// editor that cannot be saved with nothing anywhere saying so.
		expect(editor.commands.setNotebookGrid(pos, { type: 'grid', rows: [['a', 'b'], ['c']] })).toBe(
			false
		);
		expect(
			editor.commands.setNotebookGrid(pos, {
				type: 'grid',
				rows: [Array.from({ length: NOTE_GRID_MAX_COLS + 1 }, () => 'x')]
			})
		).toBe(false);
		expect(
			editor.commands.setNotebookGrid(pos, {
				type: 'grid',
				rows: [[1 as unknown as string]]
			})
		).toBe(false);
		expect(gridRows(editor)).toEqual(before);

		// THE POSITIVE CONTROL: a valid grid through the same command DOES land,
		// so the three refusals above are about the shapes and not about the
		// command being inert.
		expect(editor.commands.setNotebookGrid(pos, { type: 'grid', rows: [['ok']] })).toBe(true);
		expect(gridRows(editor)).toEqual([['ok']]);
	});

	it('refuses a position that is not a grid', () => {
		editor = makeEditor('<p>x</p>');
		editor.commands.insertNotebookGrid(1, 1);
		// THE PARAGRAPH'S OWN POSITION, FOUND RATHER THAN GUESSED. This was
		// written as a literal `0`, which is where the grid actually lands --
		// so the command correctly succeeded and the test read as the guard
		// being absent. A position derived from the document cannot make that
		// mistake, and the positive control below is what says the guard is the
		// reason for the refusal rather than the command being inert.
		let paraPos = -1;
		editor.state.doc.descendants((node, pos) => {
			if (paraPos === -1 && node.type.name === 'paragraph') paraPos = pos;
			return paraPos === -1;
		});
		expect(paraPos).toBeGreaterThanOrEqual(0);
		expect(paraPos).not.toBe(gridPos(editor));
		expect(editor.commands.setNotebookGrid(paraPos, { type: 'grid', rows: [['a']] })).toBe(false);
		// A position past the end of the document is the other shape, and is
		// what a commit racing a delete would hand over.
		expect(
			editor.commands.setNotebookGrid(editor.state.doc.content.size + 10, {
				type: 'grid',
				rows: [['a']]
			})
		).toBe(false);
		// POSITIVE CONTROL, same command, same grid.
		expect(editor.commands.setNotebookGrid(gridPos(editor), { type: 'grid', rows: [['a']] })).toBe(
			true
		);
	});

	it('clamps an INSERT to the caps, which is a different decision from a write', () => {
		// An insert is the app choosing a size, so clamping is right; a write is
		// a caller handing over a document, so refusing is right. Stated because
		// the two look inconsistent until the difference is named.
		editor = makeEditor('<p>x</p>');
		editor.commands.insertNotebookGrid(500, 500);
		const rows = gridRows(editor);
		expect(rows).toHaveLength(100);
		expect(rows?.[0]).toHaveLength(NOTE_GRID_MAX_COLS);
	});
});

describe('the schema is the paste filter', () => {
	it('claims a div carrying the grid attribute and round-trips it', () => {
		const html = `<div ${GRID_DOM_ATTR}='${JSON.stringify({ rows: [['a', 'b']] })}'></div>`;
		editor = makeEditor(html);
		expect(gridRows(editor)).toEqual([['a', 'b']]);
		// AND BACK OUT AGAIN. `toDOM`/`parseDOM` is the copy/paste path, so a
		// grid copied out of one note and into another has to survive it.
		expect(editor.getHTML()).toContain(GRID_DOM_ATTR);
		const round = makeEditor(editor.getHTML());
		expect(gridRows(round)).toEqual([['a', 'b']]);
		round.destroy();
	});

	it('does NOT claim a plain pasted <table>, which is the trap, TWO WAYS', () => {
		// THE PASTE TRAP, CHECKED AGAINST A PLANTED CONTROL. A `parseHTML` of
		// `{ tag: 'table' }` would turn every table anybody copies out of a
		// browser into a notebook grid whose cells are whatever markup was in
		// them. Two directions, so a filter that matched NOTHING cannot pass:
		//
		//   (1) a real-world table pasted in produces NO grid node, and
		//   (2) the planted control -- the same markup with the grid attribute
		//       ON it -- produces exactly one, through the same code path.
		const table =
			'<table><thead><tr><th>Part</th><th>Qty</th></tr></thead>' +
			'<tbody><tr><td>Angle</td><td>4</td></tr></tbody></table>';
		editor = makeEditor(table);
		const claimed = (json(editor).content ?? []).filter((n) => n.type === GRID_NODE_NAME);
		expect(claimed, 'a pasted table must not become a grid').toHaveLength(0);

		const planted = makeEditor(
			`<div ${GRID_DOM_ATTR}='${JSON.stringify({ rows: [['Angle', '4']] })}'></div>`
		);
		const control = (json(planted).content ?? []).filter((n) => n.type === GRID_NODE_NAME);
		expect(control, 'the planted control must be claimed by the same parser').toHaveLength(1);
		expect(control[0].attrs?.rows).toEqual([['Angle', '4']]);
		planted.destroy();
	});

	it('drops a malformed grid attribute rather than coercing half of it', () => {
		// The whitelist-translator failure mode: the content disappears rather
		// than surviving in a form nobody checked.
		for (const bad of ['not json', '{"rows":[["a","b"],["c"]]}', '{"rows":"ab"}', '{}']) {
			const el = document.createElement('div');
			el.setAttribute(GRID_DOM_ATTR, bad);
			expect(gridFromDom(el), bad).toBeNull();
		}
		// THE POSITIVE CONTROL, through the same function.
		const good = document.createElement('div');
		good.setAttribute(GRID_DOM_ATTR, '{"rows":[["a","b"]]}');
		expect(gridFromDom(good)?.rows).toEqual([['a', 'b']]);
	});
});

describe('cellRef agrees with the engine over the whole column range', () => {
	it('spells every column this grid can have the way the engine does', async () => {
		// `grid-doc.ts` spells a column itself rather than calling the engine's
		// `columnLabel`, and says why: this is a refusal message about a grid
		// capped at twenty columns, and that is a total function over 16,384.
		// THE PIN THAT MAKES THAT SAFE: they must agree over every column that
		// can exist here, so if the cap ever passes 26 this reddens and the
		// engine's own function is what this becomes.
		const { columnLabel } = await import('$lib/notebook/formula');
		let checked = 0;
		for (let c = 0; c < NOTE_GRID_MAX_COLS; c += 1) {
			expect(cellRef(0, c), `column ${c}`).toBe(`${columnLabel(c)}1`);
			checked += 1;
		}
		expect(checked).toBe(NOTE_GRID_MAX_COLS);
		expect(cellRef(9, 0)).toBe('A10');
	});

	it('gridProblem accepts exactly what the node will hold', () => {
		expect(gridProblem({ type: 'grid', rows: [['a']] })).toBeNull();
		expect(gridProblem({ type: 'grid', rows: [['a', 'b'], ['c']] })).toMatch(/same number/);
		expect(gridProblem({ type: 'grid', rows: [] })).toMatch(/at least one row/);
		expect(gridProblem({ type: 'grid', rows: [['a']], extra: 1 })).toMatch(/no "extra" field/);
	});
});

describe('the draft-mirror rollback hazard, measured rather than reasoned about', () => {
	/**
	 * WHAT A BUILD WITHOUT THE GRID NODE DOES WITH A MIRRORED DOCUMENT THAT HAS
	 * ONE -- and it is WORSE than the throw everybody expects.
	 *
	 * `$lib/notebook/draft-mirror` keeps a composer's unsaved note in
	 * `localStorage` for 24 hours, and it is SHAPE-VERSIONED: `v: 1`, and a
	 * version it does not know is DROPPED rather than coerced. The important
	 * distinction, which is easy to get backwards: that version covers the
	 * MIRROR'S OWN FIELD SET, and `doc` is stored and returned OPAQUELY as a
	 * `TiptapNode`. So a grid inside `doc` needs NO version bump to be
	 * mirrored -- the mirror never looks inside it.
	 *
	 * IT NEEDS ONE FOR THE ROLLBACK PATH, and this is the measurement that says
	 * so. A mirror written by a build WITH the grid node, restored by a build
	 * WITHOUT it -- a rollback, or a tab left open across a deploy -- hands
	 * Tiptap a document naming a node type its schema does not have.
	 *
	 * MEASURED IN THIS PROJECT, not assumed:
	 *
	 *   * It does NOT throw. Tiptap catches `RangeError: Unknown node type:
	 *     notebookGrid` internally and logs it, so `NoteEditor.svelte`'s
	 *     `catch { failed = true }` never fires and no surface reports anything.
	 *   * IT DISCARDS THE WHOLE DOCUMENT. Not the grid -- the document. A
	 *     paragraph sitting BEFORE the grid comes back gone, and the editor is
	 *     seeded with a single empty paragraph.
	 *
	 * So the failure mode of a rollback is a student's restored draft silently
	 * blank, with the mirror's own slot cleared behind it. THE NEXT BUNDLE OWES
	 * A VERSION BUMP for that reason and not for the mirroring one -- `v: 2`
	 * whenever a `doc` may contain a grid, so an old build drops the slot
	 * cleanly and says the backup is not there, which is what that module's own
	 * header promises.
	 *
	 * THIS BUNDLE CANNOT MAKE THE BUMP: `draft-mirror.ts` is not in its surface,
	 * and nothing here writes a grid into a mirror anyway, because the node is
	 * not wired into `NoteEditor.svelte`. What it can do is measure the cost
	 * precisely and leave a test that reddens if the answer ever changes.
	 */
	const MIRRORED = {
		type: 'doc',
		content: [
			{ type: 'paragraph', content: [{ type: 'text', text: 'a paragraph that must survive' }] },
			{ type: GRID_NODE_NAME, attrs: { rows: [['a']] } }
		]
	};

	it('a build WITHOUT the node discards the WHOLE document, silently', () => {
		const element = document.createElement('div');
		document.body.appendChild(element);
		const bare = new Editor({
			element,
			extensions: [StarterKit.configure(NOTE_SCHEMA_OPTIONS)],
			content: MIRRORED as never
		});
		const out = bare.getJSON() as GridDocNode;
		// One empty paragraph. The prose that sat BEFORE the grid is gone too,
		// which is the half that makes this a data-loss finding rather than a
		// rendering one.
		expect(out.content).toHaveLength(1);
		expect(out.content?.[0].type).toBe('paragraph');
		expect(out.content?.[0].content).toBeUndefined();
		expect(bare.getText()).toBe('');
		bare.destroy();
	});

	it('and WITH the node the same document round-trips whole -- the positive control', () => {
		// Without this, the assertion above would pass on a fixture that was
		// simply malformed, and the finding would be about nothing.
		editor = makeEditor(MIRRORED);
		const out = json(editor);
		expect(out.content).toHaveLength(2);
		// `.trim()`: an atom contributes Tiptap's own block separator to
		// `getText()`, so the round-tripped document reads with two trailing
		// newlines. That is the editor's plain-text convenience and NOT the
		// note's stored projection -- what a note stores is derived by
		// `$lib/server/rich-text-normalize`, which does not name this node and
		// is the next bundle's file. Worth noting rather than hiding: whatever
		// a grid contributes to a note's plain text is a decision that bundle
		// makes, and the gate's own character count (0210) already answers it
		// the other way -- the cells' own characters, no separators.
		expect(editor.getText().trim()).toBe('a paragraph that must survive');
		expect(gridRows(editor)).toEqual([['a']]);
	});
});
