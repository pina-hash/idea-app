// tests/dom/notebook-grid-insert.test.ts
//
// THE INSERTION PATH: A STUDENT PRESSES A BUTTON AND GETS A GRID, AND EVERY
// STEP AFTER THAT IS ONE UNDO STACK.
//
// Ledger 0192 built the ProseMirror node, its NodeView and the gate migration
// and said, in its own outcome note, "THE PRODUCER IS NOT HERE, deliberately".
// This is the producer. What it adds is the toolbar control, the extension
// wiring in `NoteEditor.svelte`, the `NoteBlock` arm, the normalizer's claim and
// the read-only renderer -- and the claim that ties all five together is Mr.
// Pina's bar for decision 08: a grid must work as well inside a note as the
// text does.
//
// THE PROOF THE BAR ASKS FOR IS THE FOURTH TEST DOWN. Type a paragraph, insert a
// grid, edit two cells, press Ctrl+Z four times, and assert the document walks
// back through all four in the order they were made. It is driven through the
// REAL component: the real toolbar button, the real NodeView's cells, and a real
// `keydown` reaching ProseMirror's own keymap -- not `editor.commands.undo()`,
// which would prove the command exists and nothing about whether a student's
// keyboard reaches it.
//
// WHY IT MOUNTS `NoteEditor` WHERE LEDGER 0192 DELIBERATELY DID NOT. That
// bundle's undo test builds a bare editor with NO NodeView, because the claim it
// was making was about the SCHEMA and the transactions, and Svelte-inside-
// ProseMirror-inside-happy-dom would have added two failure modes to it. The
// claim HERE is that the wiring exists in the shipping component, which nothing
// below that component can answer: a test that built its own editor would prove
// that an editor configured with the grid has a grid, which is not in question.
// Measured before it was relied on -- the toolbar renders seven controls, the
// NodeView mounts, twelve cells appear, and a dispatched Ctrl+Z undoes.
//
// WHAT IS ASSERTED HERE AND WHAT IS NOT. Document state, transaction ordering,
// which handler a real event ran, the words on screen, and what the SERVER
// normalizer does with the editor's own output. NOT geometry, NOT contrast and
// NOT a tap target: happy-dom has no layout engine, so those read zero and pass
// vacuously (`tests/dom/README.md`). The grid's 44px cells, its problem list at
// 375px and its contrast are `tools/browser-verify/routes/notebook-grid-insert.mjs`'s
// claim and stay there.
//
// EVERY ABSENCE ASSERTION CARRIES A POSITIVE CONTROL, because "the grid is not
// there" passes both when the control refused and when the whole editor failed
// to load.

import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { Editor } from '@tiptap/core';
import NoteEditor from '$lib/notebook/NoteEditor.svelte';
import NoteContent from '$lib/notebook/NoteContent.svelte';
import {
	GRID_NODE_NAME,
	NOTE_GRID_DEFAULT_COLS,
	NOTE_GRID_DEFAULT_ROWS,
	type NoteGrid
} from '$lib/notebook/grid/grid-doc';
import { GRID_EMPTY_NOTICE } from '$lib/notebook/grid/grid-issues';
import { docIsEmpty, docText, docToTiptap, type NoteDoc, type TiptapNode } from '$lib/notebook-notes';
import { normalizeNoteDoc } from '$lib/server/notebook-notes';

interface DocNode {
	type: string;
	attrs?: { rows?: string[][] };
	content?: DocNode[];
}

const mounted: { component: unknown; target: HTMLElement }[] = [];

afterEach(() => {
	for (const m of mounted.splice(0)) {
		void unmount(m.component as never);
		m.target.remove();
	}
});

/** Let the dynamic import, the editor construction and the NodeView settle. */
async function settle(times = 10) {
	for (let i = 0; i < times; i += 1) {
		await new Promise((r) => setTimeout(r, 20));
		flushSync();
	}
}

/**
 * The REAL editor component, and the REAL Tiptap instance behind it.
 *
 * `element.editor` IS TIPTAP'S OWN, not something this test or the component
 * added: Tiptap stamps the instance onto the editor's DOM element. Reaching it
 * that way is what lets this file drive the shipping component without giving
 * `NoteEditor` a test-only prop -- a production API added for a test is a
 * production API somebody uses.
 */
async function openEditor(initialDoc?: TiptapNode): Promise<{
	root: HTMLElement;
	pm: HTMLElement;
	editor: Editor;
	doc: () => DocNode;
}> {
	const target = document.createElement('div');
	document.body.appendChild(target);
	let last: TiptapNode | null = null;
	const component = mount(NoteEditor, {
		target,
		props: { onchange: (d: TiptapNode) => (last = d), initialDoc: initialDoc ?? null }
	});
	mounted.push({ component, target });
	await settle();
	const pm = target.querySelector('[data-testid="note-editor-input"]') as HTMLElement;
	expect(pm, 'the editor loaded').toBeTruthy();
	const editor = (pm as unknown as { editor: Editor }).editor;
	expect(editor, 'Tiptap exposed its instance on the editor element').toBeTruthy();
	return {
		root: target,
		pm,
		editor,
		// READ FROM THE EDITOR, NOT FROM THE LAST `onchange`. `onchange` fires on
		// UPDATES; an undo that lands after the last assertion, or a transaction
		// that changes no content, would leave `last` describing an older
		// document. `getJSON()` is always the document as it stands.
		doc: () => {
			void last;
			return editor.getJSON() as DocNode;
		}
	};
}

function gridButton(root: HTMLElement): HTMLButtonElement {
	return root.querySelector('[data-testid="nb-insert-grid"]') as HTMLButtonElement;
}

function blockTypes(doc: DocNode): string[] {
	return (doc.content ?? []).map((n) => n.type);
}

function gridRows(doc: DocNode): string[][] | undefined {
	return (doc.content ?? []).find((n) => n.type === GRID_NODE_NAME)?.attrs?.rows;
}

/** Click a cell, type into it, and commit with Enter -- the real cell path. */
async function editCell(root: HTMLElement, ref: string, text: string) {
	const face = root.querySelector(`[data-testid="grid-cell-${ref}"]`) as HTMLButtonElement;
	expect(face, `cell ${ref} is on screen`).toBeTruthy();
	face.click();
	await settle(3);
	const input = root.querySelector(`[data-testid="grid-input-${ref}"]`) as HTMLInputElement;
	expect(input, `cell ${ref} opened for editing`).toBeTruthy();
	input.value = text;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	await settle(2);
	input.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
	);
	await settle(3);
}

/**
 * A REAL Ctrl+Z, dispatched at the ProseMirror element.
 *
 * NOT `editor.commands.undo()`. The command is Tiptap's and would answer
 * whatever the schema allows; what a student presses is a KEY, and the thing
 * between the two is the history plugin's keymap. Driving the command would
 * leave a broken keymap green -- which is precisely the failure this bundle's
 * bar is about.
 */
async function pressUndo(pm: HTMLElement) {
	pm.dispatchEvent(
		new KeyboardEvent('keydown', {
			key: 'z',
			code: 'KeyZ',
			ctrlKey: true,
			bubbles: true,
			cancelable: true
		})
	);
	await settle(3);
}

/**
 * LONGER THAN PROSEMIRROR'S HISTORY GROUPING WINDOW, AND THAT IS A FACT ABOUT
 * THE FEATURE RATHER THAN A SLEEP TO MAKE A TEST PASS.
 *
 * `prosemirror-history` merges ADJACENT steps into one undo group when they
 * arrive within `newGroupDelay` -- 500ms by default, and StarterKit does not
 * change it. That is correct and is what makes typing a sentence one undo
 * rather than fourteen. It also means a test that types a paragraph and presses
 * a toolbar button 60ms later measures ONE step where a student, who reaches for
 * the toolbar after finishing a thought, makes two.
 *
 * MEASURED, NOT ASSUMED: without this pause, undo #3 below removed the grid AND
 * the paragraph together and the fourth press had nothing left to do. So the
 * pause is what puts the fixture on the same side of the window a person is on,
 * and the assertions are then about the ORDERING, which is the claim.
 */
async function pauseBeyondUndoGrouping() {
	await new Promise((r) => setTimeout(r, 650));
}

describe('a student can make a grid, which before this bundle they could not', () => {
	it('puts a Grid control in the note toolbar, as a WORD', async () => {
		const { root } = await openEditor();
		const btn = gridButton(root);
		expect(btn).toBeTruthy();
		// A visible word, never a bare glyph: a `title` is not discoverable and a
		// phone cannot hover. The `title` is the EXPLANATION, not the label.
		expect(btn.textContent?.trim()).toBe('Grid');
		expect(btn.getAttribute('title')).toBeTruthy();
	});

	it('inserts exactly ONE grid, at the default size, on one press', async () => {
		const { root, doc } = await openEditor();
		expect(blockTypes(doc())).not.toContain(GRID_NODE_NAME);

		gridButton(root).click();
		await settle(5);

		const types = blockTypes(doc());
		expect(types.filter((t) => t === GRID_NODE_NAME)).toHaveLength(1);
		const rows = gridRows(doc());
		expect(rows).toHaveLength(NOTE_GRID_DEFAULT_ROWS);
		expect(rows?.[0]).toHaveLength(NOTE_GRID_DEFAULT_COLS);
		// Every cell empty: a fresh grid is a grid, not a fixture.
		expect(rows?.flat().every((cell) => cell === '')).toBe(true);
	});

	it('draws the real NodeView, so the cells a student clicks are actually there', async () => {
		const { root } = await openEditor();
		gridButton(root).click();
		await settle(5);
		expect(root.querySelectorAll('[data-testid^="grid-cell-"]')).toHaveLength(
			NOTE_GRID_DEFAULT_ROWS * NOTE_GRID_DEFAULT_COLS
		);
	});

	it('REFUSES a second grid inside a grid, and says why rather than doing nothing', async () => {
		const { root, editor, doc } = await openEditor();
		gridButton(root).click();
		await settle(5);
		expect(blockTypes(doc()).filter((t) => t === GRID_NODE_NAME)).toHaveLength(1);
		// WITH SOMETHING IN IT, which is what makes this test bite. A node
		// selection on an `atom` is a selection ProseMirror will REPLACE, so
		// without the handler's guard the press does not add a second grid -- it
		// overwrites the student's own one with a fresh empty grid, and a count
		// of grids cannot tell the two apart. Measured: with the guard removed and
		// this cell left empty, every assertion below still passed.
		await editCell(root, 'A1', 'Part');
		expect(gridRows(doc())?.[0]?.[0]).toBe('Part');

		// Put the selection ON the grid, which is the state the refusal is about.
		editor.commands.setNodeSelection(0);
		await settle(3);

		const btn = gridButton(root);
		expect(btn.getAttribute('aria-disabled')).toBe('true');
		// `aria-disabled`, NEVER `disabled`: a genuinely disabled control swallows
		// pointer events and can never explain itself, and this one has a reason
		// to give. Asserted as the CONTRACT rather than by dispatching at it --
		// `dispatchEvent` runs a disabled control's listener anyway, so a
		// synthetic click proves nothing about what a real one would do.
		expect(btn.disabled).toBe(false);
		expect(btn.getAttribute('title')).toContain('already inside a grid');

		btn.click();
		await settle(3);
		expect(blockTypes(doc()).filter((t) => t === GRID_NODE_NAME)).toHaveLength(1);
		// THE ASSERTION THAT MATTERS: the student's own cell is still there.
		expect(gridRows(doc())?.[0]?.[0]).toBe('Part');
	});

	it('offers the control again the moment the selection leaves the grid -- the positive control', async () => {
		const { root, editor, doc } = await openEditor();
		gridButton(root).click();
		await settle(5);
		editor.commands.setNodeSelection(0);
		await settle(3);
		expect(gridButton(root).getAttribute('aria-disabled')).toBe('true');

		editor.commands.focus('end');
		await settle(3);
		expect(gridButton(root).getAttribute('aria-disabled')).toBe('false');

		gridButton(root).click();
		await settle(5);
		expect(blockTypes(doc()).filter((t) => t === GRID_NODE_NAME)).toHaveLength(2);
	});
});

describe("Mr. Pina's bar: undo walks back through cells and prose in the order they were made", () => {
	it('type a paragraph, insert a grid, edit two cells, Ctrl+Z four times', async () => {
		const { root, pm, editor, doc } = await openEditor();

		// 1. THE PARAGRAPH. `insertContent` of the whole string is one history
		//    step, exactly as a burst of typing inside the plugin's grouping
		//    window is; what matters to this test is that it is a STEP.
		editor.commands.insertContent('Bracket stock.');
		await settle(3);
		expect(docJSONText(doc())).toContain('Bracket stock.');
		await pauseBeyondUndoGrouping();

		// 2. THE GRID, through the real toolbar control.
		gridButton(root).click();
		await settle(5);
		expect(blockTypes(doc())).toContain(GRID_NODE_NAME);

		// 3 and 4. TWO CELLS, each through the real cell face, input and Enter.
		await pauseBeyondUndoGrouping();
		await editCell(root, 'A1', 'Part');
		await pauseBeyondUndoGrouping();
		expect(gridRows(doc())?.[0]?.[0]).toBe('Part');
		await editCell(root, 'B1', 'Qty');
		expect(gridRows(doc())?.[0]?.[1]).toBe('Qty');

		// --- FORWARD STATE, asserted whole before a single undo. Without this
		// --- every assertion below passes just as well if nothing ever landed.
		expect(gridRows(doc())?.[0]?.slice(0, 2)).toEqual(['Part', 'Qty']);
		expect(docJSONText(doc())).toContain('Bracket stock.');

		// UNDO 1: the second cell, and ONLY the second cell.
		await pressUndo(pm);
		expect(gridRows(doc())?.[0]?.slice(0, 2)).toEqual(['Part', '']);
		expect(docJSONText(doc())).toContain('Bracket stock.');

		// UNDO 2: the first cell. The grid is still there and still empty.
		await pressUndo(pm);
		expect(gridRows(doc())?.[0]?.slice(0, 2)).toEqual(['', '']);
		expect(blockTypes(doc())).toContain(GRID_NODE_NAME);
		expect(docJSONText(doc())).toContain('Bracket stock.');

		// UNDO 3: the grid itself. The paragraph survives it.
		await pressUndo(pm);
		expect(blockTypes(doc())).not.toContain(GRID_NODE_NAME);
		expect(docJSONText(doc())).toContain('Bracket stock.');

		// UNDO 4: the paragraph. Back to where the student started.
		await pressUndo(pm);
		expect(docJSONText(doc())).not.toContain('Bracket stock.');
		expect(blockTypes(doc())).not.toContain(GRID_NODE_NAME);
	});

	it('has a FINITE stack, which is what says the four above were real', async () => {
		const { root, pm, editor, doc } = await openEditor();
		editor.commands.insertContent('Only this.');
		await settle(3);
		gridButton(root).click();
		await settle(5);

		for (let i = 0; i < 6; i += 1) await pressUndo(pm);
		const emptied = JSON.stringify(doc());

		// One press too many changes nothing. An undo that always "succeeds"
		// would make every assertion above pass for the wrong reason.
		await pressUndo(pm);
		expect(JSON.stringify(doc())).toBe(emptied);
		expect(docJSONText(doc())).not.toContain('Only this.');
	});

	it('redoes a cell edit, so the undo was a step and not a deletion', async () => {
		const { root, pm, doc } = await openEditor();
		gridButton(root).click();
		await settle(5);
		await editCell(root, 'A1', 'Steel');
		expect(gridRows(doc())?.[0]?.[0]).toBe('Steel');

		await pressUndo(pm);
		expect(gridRows(doc())?.[0]?.[0]).toBe('');

		pm.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'y',
				code: 'KeyY',
				ctrlKey: true,
				bubbles: true,
				cancelable: true
			})
		);
		await settle(3);
		expect(gridRows(doc())?.[0]?.[0]).toBe('Steel');
	});
});

describe('an empty grid is told, not silently refused on save', () => {
	it('says so the moment it is inserted, before anything is pressed', async () => {
		const { root } = await openEditor();
		expect(root.querySelector('[data-testid="grid-issues"]')).toBeNull();

		gridButton(root).click();
		await settle(5);

		const issues = root.querySelector('[data-testid="grid-issues"]');
		expect(issues).toBeTruthy();
		expect(issues?.textContent).toContain(GRID_EMPTY_NOTICE);
	});

	it('stops saying so as soon as a cell holds anything -- the positive control', async () => {
		const { root } = await openEditor();
		gridButton(root).click();
		await settle(5);
		expect(root.querySelector('[data-testid="grid-issues"]')?.textContent).toContain(
			GRID_EMPTY_NOTICE
		);

		await editCell(root, 'A1', 'Part');
		expect(root.querySelector('[data-testid="grid-issues"]')?.textContent ?? '').not.toContain(
			GRID_EMPTY_NOTICE
		);
	});

	it('and the SERVER agrees: a note whose only content is an empty grid is refused', () => {
		const onlyEmpty: TiptapNode = {
			type: 'doc',
			content: [{ type: GRID_NODE_NAME, attrs: { rows: [['', ''], ['', '']] } }]
		};
		const refused = normalizeNoteDoc(onlyEmpty);
		expect(refused.ok).toBe(false);
		expect(refused.ok === false && refused.error).toBe('A note needs some text.');

		// TWO empty grids, which is the case a projection that emitted a blank
		// line per grid would have let through -- `docText` would have answered
		// "\n" and the client would have posted a note the gate refuses.
		const twoEmpty: TiptapNode = {
			type: 'doc',
			content: [
				{ type: GRID_NODE_NAME, attrs: { rows: [['']] } },
				{ type: GRID_NODE_NAME, attrs: { rows: [['']] } }
			]
		};
		expect(normalizeNoteDoc(twoEmpty).ok).toBe(false);
		expect(docIsEmpty([{ type: 'grid', rows: [['']] } as NoteGrid])).toBe(true);
	});

	it('accepts a grid with ONE character in it, which is the floor working rather than a ban', () => {
		const typed: TiptapNode = {
			type: 'doc',
			content: [{ type: GRID_NODE_NAME, attrs: { rows: [['x', '']] } }]
		};
		const result = normalizeNoteDoc(typed);
		expect(result.ok).toBe(true);
		expect(result.ok === true && result.doc).toEqual([{ type: 'grid', rows: [['x', '']] }]);
	});

	it('keeps an empty grid that sits beside real writing, rather than deleting it', () => {
		const mixed: TiptapNode = {
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'text', text: 'Filling this in tomorrow.' }] },
				{ type: GRID_NODE_NAME, attrs: { rows: [['', ''], ['', '']] } }
			]
		};
		const result = normalizeNoteDoc(mixed);
		expect(result.ok).toBe(true);
		expect(result.ok === true && result.doc.some((b) => b.type === 'grid')).toBe(true);
	});
});

describe('the normalizer is the producer, and the round trip loses nothing', () => {
	it('carries a grid the EDITOR produced into the stored shape', async () => {
		const { root, editor, doc } = await openEditor();
		editor.commands.insertContent('Cut list.');
		await settle(3);
		gridButton(root).click();
		await settle(5);
		await editCell(root, 'A1', 'Part');
		await editCell(root, 'B1', '=1+1');

		const result = normalizeNoteDoc(doc() as unknown as TiptapNode);
		expect(result.ok).toBe(true);
		if (result.ok !== true) return;
		const grid = result.doc.find((b) => b.type === 'grid') as NoteGrid | undefined;
		expect(grid).toBeTruthy();
		expect(grid?.rows[0]?.slice(0, 2)).toEqual(['Part', '=1+1']);
		// THE SOURCE, NEVER THE VALUE. `=1+1` is what is stored; `2` is worked
		// out at render. A stored value would be a second copy of an answer the
		// engine already gives.
		expect(JSON.stringify(result.doc)).not.toContain('"2"');
	});

	it('seeds the editor back from a stored grid, which is the arm that loses work if it is forgotten', async () => {
		const stored: NoteDoc = [
			{ type: 'p', runs: [{ text: 'Reopened.' }] },
			{ type: 'grid', rows: [['Part', 'Qty'], ['Angle', '4']] } as NoteGrid
		];
		const seeded = docToTiptap(stored);
		expect((seeded.content ?? []).map((n) => n.type)).toEqual(['paragraph', GRID_NODE_NAME]);

		const { doc } = await openEditor(seeded);
		expect(gridRows(doc())).toEqual([
			['Part', 'Qty'],
			['Angle', '4']
		]);

		// AND BACK AGAIN, byte for byte. A student who reopens a note to add a
		// sentence must not save it back without their table.
		const again = normalizeNoteDoc(doc() as unknown as TiptapNode);
		expect(again.ok === true && again.doc).toEqual(stored);
	});

	it('refuses a malformed grid rather than storing half of it', () => {
		const ragged: TiptapNode = {
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'text', text: 'Writing.' }] },
				{ type: GRID_NODE_NAME, attrs: { rows: [['a', 'b'], ['c']] } }
			]
		};
		const result = normalizeNoteDoc(ragged);
		expect(result.ok).toBe(true);
		// The note survives; the grid does not, because a whitelist translator
		// builds its output and a block it cannot validate is not built.
		expect(result.ok === true && result.doc.some((b) => b.type === 'grid')).toBe(false);
		expect(result.ok === true && result.doc).toEqual([
			{ type: 'p', runs: [{ text: 'Writing.' }] }
		]);
	});

	it('emits ONLY type and rows, so an attribute nobody named cannot ride along', () => {
		const extra = {
			type: 'doc',
			content: [
				{
					type: GRID_NODE_NAME,
					attrs: { rows: [['x']], smuggled: 'value' }
				}
			]
		} as unknown as TiptapNode;
		const result = normalizeNoteDoc(extra);
		expect(result.ok).toBe(true);
		expect(result.ok === true && result.doc).toEqual([{ type: 'grid', rows: [['x']] }]);
		expect(JSON.stringify(result).includes('smuggled')).toBe(false);
	});

	it('projects a grid into the note text, so a preview is not blank', () => {
		const doc: NoteDoc = [{ type: 'grid', rows: [['Part', 'Qty'], ['Angle', '4']] } as NoteGrid];
		expect(docIsEmpty(doc)).toBe(false);
		expect(docText(doc)).toContain('Part');
		expect(docText(doc)).toContain('Angle');
	});
});

describe('the four refusals reach a student as sentences, not as codes', () => {
	const REFUSALS: NoteGrid = {
		type: 'grid',
		rows: [
			['Runs', '0'],
			['Mean', '=12/B1'],
			['Loop', '=B4'],
			['Back', '=B3'],
			['Typo', '=SUM(A1:'],
			['Lookup', '=VLOOKUP(A1,A1:B5,2)']
		]
	};

	function renderRefusals(): HTMLElement {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const component = mount(NoteContent, { target, props: { doc: [REFUSALS] as NoteDoc } });
		mounted.push({ component, target });
		flushSync();
		return target;
	}

	it('lists every bad cell with the ENGINE\'S OWN sentence beside its code', () => {
		const root = renderRefusals();
		const issues = root.querySelector('[data-testid="grid-issues"]');
		expect(issues).toBeTruthy();
		const text = issues?.textContent ?? '';

		// A cycle reports its PATH.
		expect(text).toContain('Circular reference');
		expect(text).toMatch(/B3 -> B4 -> B3|B4 -> B3 -> B4/);
		// A malformed formula carries the POSITION of the problem.
		expect(text).toMatch(/position \d|character \d|column \d/i);
		// A function this engine does not have is named.
		expect(text).toContain('VLOOKUP');
	});

	it('divides by zero as a CELL error rather than letting a NaN into a total', () => {
		const root = renderRefusals();
		expect(root.querySelector('[data-testid="grid-cell-B2"]')?.textContent?.trim()).toBe('#DIV/0!');
		expect(root.textContent).not.toContain('NaN');
	});

	it('marks each cell with its CODE as a word, so colour is never the only signal', () => {
		const root = renderRefusals();
		const codes = [...root.querySelectorAll('[data-testid^="grid-cell-"]')]
			.map((el) => el.textContent?.trim() ?? '')
			.filter((t) => t.startsWith('#'));
		expect(codes.length).toBeGreaterThanOrEqual(4);
		expect(new Set(codes).size).toBeGreaterThanOrEqual(3);
	});

	it('pairs every listed problem with a cell on screen, and vice versa', () => {
		const root = renderRefusals();
		const listed = [...root.querySelectorAll('[data-testid^="grid-issue-"]')]
			.map((el) => el.getAttribute('data-testid')?.replace('grid-issue-', '') ?? '')
			.filter((ref) => ref !== 'grid');
		const erroring = [...root.querySelectorAll('[data-testid^="grid-cell-"]')]
			.filter((el) => (el.textContent ?? '').trim().startsWith('#'))
			.map((el) => el.getAttribute('data-testid')?.replace('grid-cell-', '') ?? '');
		expect([...listed].sort()).toEqual([...erroring].sort());
	});

	it('renders a CLEAN grid with no problem list at all -- the positive control', () => {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const component = mount(NoteContent, {
			target,
			props: { doc: [{ type: 'grid', rows: [['Part', '2'], ['Cost', '=B1*3']] }] as NoteDoc }
		});
		mounted.push({ component, target });
		flushSync();
		expect(target.querySelector('[data-testid="grid-issues"]')).toBeNull();
		expect(target.querySelector('[data-testid="grid-cell-B2"]')?.textContent?.trim()).toBe('6');
	});
});

describe("the instructor's view of a grid is read-only, structurally", () => {
	function readerFor(doc: NoteDoc): HTMLElement {
		const target = document.createElement('div');
		document.body.appendChild(target);
		const component = mount(NoteContent, { target, props: { doc } });
		mounted.push({ component, target });
		flushSync();
		return target;
	}

	const DOC: NoteDoc = [
		{ type: 'p', runs: [{ text: 'Cut list.' }] },
		{ type: 'grid', rows: [['Part', 'Qty'], ['Angle', '4']] } as NoteGrid
	];

	it('draws the grid and its computed values', () => {
		const root = readerFor(DOC);
		expect(root.querySelector('[data-testid="notebook-grid"]')).toBeTruthy();
		expect(root.querySelector('[data-testid="grid-cell-A2"]')?.textContent?.trim()).toBe('Angle');
	});

	it('offers NOTHING to write with: 0 inputs, 0 resize controls, 0 enabled cells', () => {
		const root = readerFor(DOC);
		expect(root.querySelectorAll('input')).toHaveLength(0);
		expect(root.querySelector('[data-testid="grid-add-row"]')).toBeNull();
		expect(root.querySelector('[data-testid="grid-add-col"]')).toBeNull();
		const faces = [...root.querySelectorAll('[data-testid^="grid-cell-"]')] as HTMLButtonElement[];
		expect(faces.length).toBe(4);
		expect(faces.filter((b) => !b.disabled)).toHaveLength(0);
	});

	it('and clicking a cell opens nothing -- absence is the mechanism', () => {
		const root = readerFor(DOC);
		(root.querySelector('[data-testid="grid-cell-A1"]') as HTMLButtonElement).click();
		flushSync();
		expect(root.querySelectorAll('input')).toHaveLength(0);
	});

	it('while the EDITOR has every one of those, which is what makes those counts mean something', async () => {
		const { root } = await openEditor();
		gridButton(root).click();
		await settle(5);
		expect(root.querySelector('[data-testid="grid-add-row"]')).toBeTruthy();
		expect(root.querySelector('[data-testid="grid-add-col"]')).toBeTruthy();
		const faces = [...root.querySelectorAll('[data-testid^="grid-cell-"]')] as HTMLButtonElement[];
		expect(faces.filter((b) => !b.disabled).length).toBe(
			NOTE_GRID_DEFAULT_ROWS * NOTE_GRID_DEFAULT_COLS
		);
	});
});

/** Every bit of text in a ProseMirror document, for a contains-check. */
function docJSONText(doc: DocNode): string {
	return JSON.stringify(doc);
}
