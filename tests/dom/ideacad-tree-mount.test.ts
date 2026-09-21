// tests/dom/ideacad-tree-mount.test.ts
//
// THE DESIGN TREE, MOUNTED, so real events reach real handlers: what a press
// on a row SELECTS, what Up, Down, Delete, Suppress, Rename, the number fields
// and a drag actually SEND through the api, and what a refused press says.
//
// WHY THIS IS AUTOMATED. Every claim here regresses invisibly: a row that
// selected the feature but not its body renders identically; a number field
// that rounded -3.5 to -4 or refused 1e6 looks like a field; a Delete key that
// let the workspace's own window handler run as well would fire a second,
// broken command with nothing on screen to say so. The expected refusal
// sentences are the REDUCER's, from `commands.ts`, which is the thing the tree
// surfaces and not the thing under test.
//
// THE API IS A RECORDER, NOT A RUNE. `fakeApi` answers each `apply` with the
// reducer and records it, but nothing re-renders afterwards, so each case
// mounts with the selection it needs already made rather than clicking its
// way there. Selection itself is asserted by what `select` was handed.
//
// NO GEOMETRY, NO CONTRAST, NO TAP TARGET HERE: happy-dom has no layout
// engine and every box reads zero. Row height is measured in a real Chromium.
import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import FeatureTree from '$lib/ideacad/solid/FeatureTree.svelte';
import { mountInto, type Mounted } from './mount';
import { fakeApi, type FakeApi } from '../ideacad-solid-tree-fixture';
import type { Selection } from '$lib/ideacad/solid/types';

const Tree = FeatureTree as unknown as Component<Record<string, unknown>>;
const mounted: Mounted[] = [];
afterEach(async () => { for (const m of mounted.splice(0)) await m.stop(); });
function tree(overrides: Parameters<typeof fakeApi>[0] = {}): { m: Mounted; api: FakeApi } {
	const api = fakeApi(overrides);
	const m = mountInto(Tree, { api: api.api });
	mounted.push(m);
	return { m, api };
}
const feature = (id: string, kind: Selection['kind'] = 'feature'): Selection => ({ bodyId: '', kind, id });
const rowButton = (m: Mounted, id: string) => m.one<HTMLButtonElement>(`[data-row="${id}"] button.row`);
const action = (m: Mounted, word: string) => m.all<HTMLButtonElement>('.actions button').find((b) => b.textContent?.trim().endsWith(word))!;
const key = (el: Element, key: string) => { const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e; };
const change = (el: HTMLInputElement | HTMLSelectElement, value: string) => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); };
/** happy-dom's DragEvent leaves dataTransfer undefined; a plain Event with a real DataTransfer defined onto it is the closer article. */
const drag = (type: string) => { const e = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'dataTransfer', { value: new DataTransfer(), configurable: true }); return e; };

describe('selecting', () => {
	it('a row press selects the bodies the feature made, then the feature, appending after the first', async () => {
		const { m, api } = tree();
		rowButton(m, 'x1').click(); await m.settle();
		expect(api.selects).toEqual([{ selection: { bodyId: 'x1#0', kind: 'body', id: 'x1#0' }, append: false }, { selection: { bodyId: '', kind: 'feature', id: 'x1' }, append: true }]);
		rowButton(m, 's1').click(); await m.settle();
		expect(api.selects.slice(2)).toEqual([{ selection: { bodyId: '', kind: 'sketch', id: 's1' }, append: false }]);
		rowButton(m, 'pl1').click(); await m.settle();
		expect(api.selects.slice(3)).toEqual([{ selection: { bodyId: '', kind: 'reference', id: 'pl1' }, append: false }]);
		expect(api.commands).toHaveLength(0);
	});
	it('the arrow keys move the selection, Enter opens the parameters and puts focus in the first field', async () => {
		const { m, api } = tree({ selections: [feature('x1')] });
		rowButton(m, 'x1').focus();
		key(rowButton(m, 'x1'), 'ArrowDown'); await m.settle();
		expect(api.selects).toEqual([{ selection: feature('f1'), append: false }]);
		key(rowButton(m, 'f1'), 'ArrowUp'); await m.settle();
		expect(api.selects.slice(1)).toEqual([{ selection: { bodyId: 'x1#0', kind: 'body', id: 'x1#0' }, append: false }, { selection: feature('x1'), append: true }]);
		key(rowButton(m, 'x1'), 'Enter'); await m.settle();
		expect(document.activeElement).toBe(m.one('[data-testid="ideacad-param-distance"]'));
	});
});
describe('reordering', () => {
	it('a refused Up says the reducer\'s sentence and sends nothing; an allowed Up sends move-feature', async () => {
		const refused = tree({ selections: [feature('x1')] });
		expect(action(refused.m, 'Up').getAttribute('aria-disabled')).toBe('true');
		action(refused.m, 'Up').click(); await refused.m.settle();
		expect(refused.api.errors).toEqual([expect.stringMatching(/Extrude 1 uses Sketch 1, so it cannot move above it/)]);
		expect(refused.api.commands).toHaveLength(0);
		action(refused.m, 'Down').click(); await refused.m.settle();
		expect(refused.api.errors[1]).toMatch(/Fillet 1 uses Extrude 1, so it cannot move below it/);
		expect(refused.api.commands).toHaveLength(0);
		const allowed = tree({ selections: [feature('pl1', 'reference')] });
		expect(action(allowed.m, 'Up').getAttribute('aria-disabled')).toBe('false');
		action(allowed.m, 'Up').click(); await allowed.m.settle();
		expect(allowed.api.commands).toEqual([{ command: { type: 'move-feature', id: 'pl1', to: 4 }, label: 'Move Plane 1' }]);
		expect(allowed.api.errors).toHaveLength(0);
		/* Down at the end of the tree is a boundary, said in words, not a reducer error. */
		action(allowed.m, 'Down').click(); await allowed.m.settle();
		expect(allowed.api.errors).toEqual(['This feature is already last in the tree.']);
		expect(allowed.api.commands).toHaveLength(1);
	});
	it('an HTML5 drop inside the range sends move-feature; one outside it is refused in the reducer\'s words', async () => {
		const ok = tree();
		rowButton(ok.m, 'pl1').dispatchEvent(drag('dragstart'));
		const over = drag('dragover'); rowButton(ok.m, 's1').dispatchEvent(over);
		expect(over.defaultPrevented).toBe(true);
		ok.m.flush();
		expect(ok.m.one('[data-row="s1"]').className).toContain('drop-before');
		expect(ok.m.one('[data-row="s1"]').className).not.toContain('drop-refused');
		rowButton(ok.m, 's1').dispatchEvent(drag('drop')); await ok.m.settle();
		expect(ok.api.commands).toEqual([{ command: { type: 'move-feature', id: 'pl1', to: 0 }, label: 'Move Plane 1' }]);
		const refused = tree();
		rowButton(refused.m, 'x1').dispatchEvent(drag('dragstart'));
		rowButton(refused.m, 'pl1').dispatchEvent(drag('dragover')); refused.m.flush();
		expect(refused.m.one('[data-row="pl1"]').className).toContain('drop-refused');
		rowButton(refused.m, 'pl1').dispatchEvent(drag('drop')); await refused.m.settle();
		expect(refused.api.commands).toHaveLength(0);
		expect(refused.api.errors).toEqual([expect.stringMatching(/uses Extrude 1, so it cannot move below it/)]);
		/* A read-only document drags nothing. */
		const readOnly = tree({ canWrite: false });
		const start = drag('dragstart'); rowButton(readOnly.m, 'pl1').dispatchEvent(start);
		expect(start.defaultPrevented).toBe(true);
	});
});
describe('editing a parameter', () => {
	it('sends the exact typed number as a set-feature patch, nothing clamped, labelled Edit <name>', async () => {
		const { m, api } = tree({ selections: [feature('x1')] });
		const distance = m.one<HTMLInputElement>('[data-testid="ideacad-param-distance"]');
		expect(distance.value).toBe('1');
		change(distance, '-3.5'); await m.settle();
		change(distance, '1e6'); await m.settle();
		expect(api.commands).toEqual([
			{ command: { type: 'set-feature', id: 'x1', patch: { distance: -3.5 } }, label: 'Edit Extrude 1' },
			{ command: { type: 'set-feature', id: 'x1', patch: { distance: 1000000 } }, label: 'Edit Extrude 1' }
		]);
		/* Not a number: refused in words where refusals show, nothing sent, the box put back. */
		change(distance, 'wide'); await m.settle();
		expect(api.errors).toEqual(['Enter a finite number for distance.']);
		expect(api.commands).toHaveLength(2);
		expect(Number.isFinite(Number(distance.value))).toBe(true);
	});
	it('an enum is a select and a boolean is a checkbox, each sending its key', async () => {
		const x1 = tree({ selections: [feature('x1')] });
		change(x1.m.one<HTMLSelectElement>('[data-testid="ideacad-param-operation"]'), 'cut'); await x1.m.settle();
		expect(x1.api.commands).toEqual([{ command: { type: 'set-feature', id: 'x1', patch: { operation: 'cut' } }, label: 'Edit Extrude 1' }]);
		const f1 = tree({ selections: [feature('f1')] });
		const propagate = f1.m.one<HTMLInputElement>('[data-testid="ideacad-param-propagate"]');
		expect(propagate.type).toBe('checkbox'); expect(propagate.checked).toBe(false);
		propagate.click(); await f1.m.settle();
		expect(f1.api.commands).toEqual([{ command: { type: 'set-feature', id: 'f1', patch: { propagate: true } }, label: 'Edit Fillet 1' }]);
		/* A nested number writes its whole definition. */
		const pl1 = tree({ selections: [feature('pl1', 'reference')] });
		change(pl1.m.one<HTMLInputElement>('[data-testid="ideacad-param-definition.offset"]'), '-0.75'); await pl1.m.settle();
		expect(pl1.api.commands).toEqual([{ command: { type: 'set-feature', id: 'pl1', patch: { definition: { kind: 'offset', from: { kind: 'datum', datum: 'XY' }, offset: -0.75 } } }, label: 'Edit Plane 1' }]);
	});
	it('a read-only document has every field disabled and sends nothing', async () => {
		const { m, api } = tree({ selections: [feature('x1')], canWrite: false });
		const fields = m.all<HTMLInputElement>('[data-testid^="ideacad-param-"]');
		expect(fields.length).toBeGreaterThan(0);
		expect(fields.every((f) => f.disabled)).toBe(true);
		expect(m.all('.actions')).toHaveLength(0);
		expect(api.commands).toHaveLength(0);
	});
});
describe('rename, suppress, delete, edit sketch', () => {
	it('Rename opens an inline input and Enter sends rename-feature with the trimmed name', async () => {
		const { m, api } = tree({ selections: [feature('x1')] });
		action(m, 'Rename').click(); await m.settle();
		const input = m.one<HTMLInputElement>('[data-row="x1"] input.rename');
		input.value = '  Boss  '; input.dispatchEvent(new Event('input', { bubbles: true }));
		key(input, 'Enter'); await m.settle();
		expect(api.commands).toEqual([{ command: { type: 'rename-feature', id: 'x1', name: 'Boss' }, label: 'Rename Extrude 1' }]);
		expect(m.all('[data-row="x1"] input.rename')).toHaveLength(0);
		/* Escape sends nothing. */
		action(m, 'Rename').click(); await m.settle();
		const again = m.one<HTMLInputElement>('[data-row="x1"] input.rename');
		again.value = 'Dropped'; again.dispatchEvent(new Event('input', { bubbles: true }));
		key(again, 'Escape'); await m.settle();
		expect(api.commands).toHaveLength(1);
	});
	it('Suppress and Unsuppress send suppress-feature with the opposite of the row', async () => {
		const live = tree({ selections: [feature('x1')] });
		expect(action(live.m, 'Suppress').textContent?.trim()).toBe('Suppress');
		action(live.m, 'Suppress').click(); await live.m.settle();
		expect(live.api.commands).toEqual([{ command: { type: 'suppress-feature', id: 'x1', suppressed: true }, label: 'Suppress Extrude 1' }]);
		const held = tree({ selections: [feature('c1')] });
		expect(action(held.m, 'Unsuppress').textContent?.trim()).toBe('Unsuppress');
		action(held.m, 'Unsuppress').click(); await held.m.settle();
		expect(held.api.commands).toEqual([{ command: { type: 'suppress-feature', id: 'c1', suppressed: false }, label: 'Unsuppress Chamfer 1' }]);
	});
	it('Delete on a feature with dependents surfaces the reducer\'s sentence naming them; on one without, sends remove-feature', async () => {
		const blocked = tree({ selections: [feature('s1', 'sketch')] });
		expect(action(blocked.m, 'Delete').getAttribute('aria-disabled')).toBe('true');
		expect(blocked.m.one('.why').textContent).toContain('Delete: A later feature depends on Sketch 1 (Extrude 1). Delete those first, or suppress this one.');
		action(blocked.m, 'Delete').click(); await blocked.m.settle();
		expect(blocked.api.errors).toEqual(['A later feature depends on Sketch 1 (Extrude 1). Delete those first, or suppress this one.']);
		expect(blocked.api.commands).toHaveLength(0);
		const free = tree({ selections: [feature('pl1', 'reference')] });
		expect(action(free.m, 'Delete').getAttribute('aria-disabled')).toBe('false');
		action(free.m, 'Delete').click(); await free.m.settle();
		expect(free.api.commands).toEqual([{ command: { type: 'remove-feature', id: 'pl1' }, label: 'Delete Plane 1' }]);
	});
	it('the Delete key removes the focused feature and does NOT reach the window, where the workspace would delete the selection', async () => {
		const { m, api } = tree({ selections: [feature('pl1', 'reference')] });
		const reached: string[] = [];
		const listener = (e: KeyboardEvent) => reached.push(e.key);
		window.addEventListener('keydown', listener);
		try {
			rowButton(m, 'pl1').focus();
			key(rowButton(m, 'pl1'), 'Delete'); await m.settle();
			expect(api.commands).toEqual([{ command: { type: 'remove-feature', id: 'pl1' }, label: 'Delete Plane 1' }]);
			expect(reached).toEqual([]);
			/* Positive control: a key the tree does not answer still reaches the window. */
			key(rowButton(m, 'pl1'), 'a');
			expect(reached).toEqual(['a']);
		} finally { window.removeEventListener('keydown', listener); }
	});
	it('Edit sketch opens the sketch through the api, and the open one offers Close', async () => {
		const closed = tree();
		const buttons = closed.m.all<HTMLButtonElement>('.edit-sketch');
		expect(buttons).toHaveLength(1);
		expect(buttons[0].textContent?.trim()).toBe('Edit sketch');
		buttons[0].click(); await closed.m.settle();
		expect(closed.api.edits).toEqual(['s1']);
		const open = tree({ editingSketch: 's1' });
		const close = open.m.one<HTMLButtonElement>('.edit-sketch');
		expect(close.textContent?.trim()).toBe('Close sketch');
		expect(close.getAttribute('aria-pressed')).toBe('true');
		close.click(); await open.m.settle();
		expect(open.api.edits).toEqual([null]);
	});
});
