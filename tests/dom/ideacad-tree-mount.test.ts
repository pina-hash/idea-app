// tests/dom/ideacad-tree-mount.test.ts
//
// THE DESIGN TREE, MOUNTED, so real events reach real handlers: what a press
// on a row SELECTS, what the row menu's Move up, Move down, Delete, Suppress
// and Rename, F2, a slow second press, a double-click, the number fields and a
// drag actually SEND through the api, and what a refused press says. Since
// ledger 0296 a row's actions live in ONE menu (the "⋯" control and a
// right-click open the same entries), a consumed sketch is nested under its
// extrude, and the reference planes sit above the features.
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
import { datumPlanesShown, setDatumPlanesShown } from '$lib/ideacad/solid/viewport/reference-layer';
import { SLOW_RENAME_MS } from '$lib/ideacad/solid/tree/rows';

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
/** A row's own press, never a nested row's: the line directly under its li. */
const rowButton = (m: Mounted, id: string) => m.one<HTMLButtonElement>(`[data-row="${id}"] > .line button.row`);
const key = (el: Element, key: string, init: KeyboardEventInit = {}) => { const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }); el.dispatchEvent(e); return e; };
const change = (el: HTMLInputElement | HTMLSelectElement, value: string) => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); };
/** happy-dom's DragEvent leaves dataTransfer undefined; a plain Event with a real DataTransfer defined onto it is the closer article. */
const drag = (type: string) => { const e = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'dataTransfer', { value: new DataTransfer(), configurable: true }); return e; };
/** Open the selected row's menu through its "⋯" control. */
async function openMenu(m: Mounted) { m.one<HTMLButtonElement>('button.row-more').click(); await m.settle(); return m.one<HTMLElement>('[role="menu"]'); }
const item = (m: Mounted, id: string) => m.one<HTMLButtonElement>(`[role="menu"] [data-item="${id}"]`);
const items = (m: Mounted) => m.all<HTMLButtonElement>('[role="menu"] [role="menuitem"]').map((b) => b.dataset.item);
const reason = (m: Mounted, id: string) => item(m, id).querySelector('.reason')?.textContent ?? null;

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
	it('the arrow keys move the selection over the rows a reader can see, Enter opens the parameters and puts focus in the first field', async () => {
		const { m, api } = tree({ selections: [feature('x1')] });
		rowButton(m, 'x1').focus();
		/* The sketch is nested and collapsed, so Down goes from the extrude straight to the fillet. */
		key(rowButton(m, 'x1'), 'ArrowDown'); await m.settle();
		expect(api.selects).toEqual([{ selection: feature('f1'), append: false }]);
		key(rowButton(m, 'f1'), 'ArrowUp'); await m.settle();
		expect(api.selects.slice(1)).toEqual([{ selection: { bodyId: 'x1#0', kind: 'body', id: 'x1#0' }, append: false }, { selection: feature('x1'), append: true }]);
		key(rowButton(m, 'x1'), 'Enter'); await m.settle();
		expect(document.activeElement).toBe(m.one('[data-testid="ideacad-param-distance"]'));
	});
	it('the caret opens and closes the nested sketch, and Right and Left do the same from the keyboard', async () => {
		const { m, api } = tree({ selections: [feature('x1')] });
		const caret = m.one<HTMLButtonElement>('[data-row="x1"] > .line button.caret');
		const children = m.one<HTMLOListElement>('#ideacad-tree-children-x1');
		expect(caret.getAttribute('aria-expanded')).toBe('false');
		expect(children.hidden).toBe(true);
		caret.click(); m.flush();
		expect(caret.getAttribute('aria-expanded')).toBe('true');
		expect(children.hidden).toBe(false);
		caret.click(); m.flush();
		expect(children.hidden).toBe(true);
		key(rowButton(m, 'x1'), 'ArrowRight'); m.flush();
		expect(children.hidden).toBe(false);
		key(rowButton(m, 'x1'), 'ArrowRight'); await m.settle();
		expect(api.selects.at(-1)).toEqual({ selection: feature('s1', 'sketch'), append: false });
		key(rowButton(m, 's1'), 'ArrowLeft'); await m.settle();
		expect(api.selects.at(-1)).toEqual({ selection: feature('x1'), append: true });
		expect(api.commands).toHaveLength(0);
	});
	it('a face picked in the viewport marks the row that made it; a picked sketch line marks its sketch and opens its parent', async () => {
		const face = tree({ selections: [{ bodyId: 'x1#0', kind: 'face', id: 'x1.end' }] });
		await face.m.settle();
		expect(face.m.all('li.owner').map((l) => (l as HTMLElement).dataset.row)).toEqual(['x1']);
		expect(face.m.all('li.selected')).toHaveLength(0);
		const line = tree({ selections: [{ bodyId: 's1', kind: 'sketch-entity', id: 'l0' }] });
		await line.m.settle();
		expect(line.m.all('li.owner').map((l) => (l as HTMLElement).dataset.row)).toEqual(['s1']);
		expect(line.m.one<HTMLOListElement>('#ideacad-tree-children-x1').hidden).toBe(false);
		/* A selected ROW is a selection, not an owner mark: pressing a row marks it selected and nothing owned. */
		const row = tree({ selections: [{ bodyId: 'x1#0', kind: 'body', id: 'x1#0' }, feature('x1')] });
		expect(row.m.all('li.owner')).toHaveLength(0);
		expect(row.m.all('li.selected').map((l) => (l as HTMLElement).dataset.row)).toEqual(['x1']);
	});
	it('a nested sketch that becomes selected opens its parent', async () => {
		const { m } = tree({ selections: [feature('s1', 'sketch')] });
		await m.settle();
		expect(m.one<HTMLOListElement>('#ideacad-tree-children-x1').hidden).toBe(false);
		/* Positive control: selecting a top-level row leaves the sketch folded away. */
		const other = tree({ selections: [feature('f1')] });
		await other.m.settle();
		expect(other.m.one<HTMLOListElement>('#ideacad-tree-children-x1').hidden).toBe(true);
	});
});
describe('the reference rows', () => {
	it('a plane press selects the datum the viewport draws; the eye shows and hides the planes', async () => {
		const was = datumPlanesShown();
		try {
			setDatumPlanesShown(false);
			const { m, api } = tree();
			m.one<HTMLButtonElement>('[data-ref="XZ"] button.row').click(); await m.settle();
			expect(api.selects).toEqual([{ selection: { bodyId: '', kind: 'reference', id: 'datum:XZ' }, append: false }]);
			const eye = m.one<HTMLButtonElement>('[data-ref="XY"] button.eye');
			expect(eye.getAttribute('aria-label')).toBe('Show planes');
			eye.click(); m.flush();
			expect(datumPlanesShown()).toBe(true);
			expect(m.all<HTMLButtonElement>('button.eye').map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'true', 'true', 'true']);
			expect(eye.getAttribute('aria-label')).toBe('Hide planes');
			eye.click(); m.flush();
			expect(datumPlanesShown()).toBe(false);
			expect(api.commands).toHaveLength(0);
		} finally { setDatumPlanesShown(was); }
	});
	it('a plane\'s menu starts a sketch on it and opens it, and a right-click never reaches the browser', async () => {
		const { m, api } = tree();
		const front = m.one<HTMLButtonElement>('[data-ref="XZ"] button.row');
		const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 60 });
		front.dispatchEvent(e); await m.settle();
		expect(e.defaultPrevented).toBe(true);
		expect(items(m)).toEqual(['sketch', 'planes']);
		item(m, 'sketch').click(); await m.settle();
		expect(api.commands).toHaveLength(1);
		const added = api.commands[0].command as { type: string; feature: { id: string; type: string; plane: unknown; entities: unknown[] } };
		expect(added.type).toBe('add-feature');
		expect(added.feature.type).toBe('sketch');
		expect(added.feature.plane).toEqual({ kind: 'datum', datum: 'XZ' });
		expect(added.feature.entities).toEqual([]);
		expect(api.commands[0].label).toBe('Sketch on Front Plane');
		/* The fixture's projection does not grow a row, so the sketch is not opened: opening one that is not there would be a lie. */
		expect(api.edits).toEqual([]);
		/* The Origin offers only the planes' visibility. */
		m.one<HTMLButtonElement>('[data-ref="origin"] button.row').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); await m.settle();
		expect(items(m)).toEqual(['planes']);
	});
});
describe('the row menu', () => {
	it('the "⋯" control and a right-click open the same entries, and the right-click selects the row first', async () => {
		const a = tree({ selections: [feature('pl1', 'reference')] });
		await openMenu(a.m);
		const fromControl = items(a.m);
		expect(fromControl).toEqual(['params', 'rename', 'suppress', 'up', 'down', 'delete']);
		const b = tree();
		const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 200 });
		rowButton(b.m, 'pl1').dispatchEvent(e); await b.m.settle();
		expect(e.defaultPrevented).toBe(true);
		expect(items(b.m)).toEqual(fromControl);
		expect(b.api.selects).toEqual([{ selection: feature('pl1', 'reference'), append: false }]);
		expect(b.m.one('[role="menu"]').getAttribute('aria-label')).toBe('Plane 1 actions');
	});
	it('a sketch row offers Edit sketch; a nested row offers no Move; a read-only document offers only the parameters', async () => {
		const sketch = tree({ selections: [feature('s1', 'sketch')] });
		await sketch.m.settle();
		await openMenu(sketch.m);
		expect(items(sketch.m)).toEqual(['params', 'edit-sketch', 'rename', 'suppress', 'delete']);
		const readOnly = tree({ canWrite: false });
		rowButton(readOnly.m, 'x1').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); await readOnly.m.settle();
		expect(items(readOnly.m)).toEqual(['params']);
		expect(item(readOnly.m, 'params').textContent?.trim()).toBe('Parameters');
		expect(readOnly.m.all('button.row-more')).toHaveLength(0);
	});
	it('arrow keys walk the menu, Escape closes it and puts focus back on the control', async () => {
		const { m } = tree({ selections: [feature('pl1', 'reference')] });
		const more = m.one<HTMLButtonElement>('button.row-more');
		const menu = await openMenu(m);
		const buttons = m.all<HTMLButtonElement>('[role="menuitem"]');
		expect(document.activeElement).toBe(buttons[0]);
		key(menu, 'ArrowDown'); expect(document.activeElement).toBe(buttons[1]);
		key(menu, 'End'); expect(document.activeElement).toBe(buttons[buttons.length - 1]);
		key(menu, 'ArrowDown'); expect(document.activeElement).toBe(buttons[0]);
		key(menu, 'Escape'); await m.settle();
		expect(m.all('[role="menu"]')).toHaveLength(0);
		expect(document.activeElement).toBe(more);
	});
	it('a press outside closes it and sends nothing', async () => {
		const { m, api } = tree({ selections: [feature('pl1', 'reference')] });
		await openMenu(m);
		window.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); await m.settle();
		expect(m.all('[role="menu"]')).toHaveLength(0);
		expect(api.commands).toHaveLength(0);
	});
	it('hands the entries to the workspace\'s own menu when it has one, and draws none of its own', async () => {
		const requests: { label: string; items: { id: string }[] }[] = [];
		const { m } = tree({ selections: [feature('pl1', 'reference')], extras: { contextMenu: (r) => { requests.push(r); } } });
		m.one<HTMLButtonElement>('button.row-more').click(); await m.settle();
		expect(m.all('[role="menu"]')).toHaveLength(0);
		expect(requests.map((r) => r.label)).toEqual(['Plane 1 actions']);
		expect(requests[0].items.map((i) => i.id)).toEqual(['params', 'rename', 'suppress', 'up', 'down', 'delete']);
	});
});
describe('reordering', () => {
	it('a refused Move shows the reducer\'s sentence on the entry and again when pressed, and sends nothing; an allowed one sends move-feature', async () => {
		const refused = tree({ selections: [feature('x1')] });
		await openMenu(refused.m);
		/* The extrude's node (with its sketch) is first; its Down is the reducer's refusal. */
		expect(item(refused.m, 'up').getAttribute('aria-disabled')).toBe('true');
		expect(reason(refused.m, 'up')).toBe('This feature is already first in the tree.');
		expect(item(refused.m, 'down').getAttribute('aria-disabled')).toBe('true');
		expect(reason(refused.m, 'down')).toMatch(/Fillet 1 uses Extrude 1, so it cannot move below it/);
		item(refused.m, 'down').click(); await refused.m.settle();
		expect(refused.api.errors).toEqual([expect.stringMatching(/Fillet 1 uses Extrude 1, so it cannot move below it/)]);
		expect(refused.api.commands).toHaveLength(0);
		/* A refused entry does not close the menu: the reason stays readable. */
		expect(refused.m.all('[role="menu"]')).toHaveLength(1);
		const allowed = tree({ selections: [feature('pl1', 'reference')] });
		await openMenu(allowed.m);
		expect(item(allowed.m, 'up').getAttribute('aria-disabled')).toBeNull();
		expect(reason(allowed.m, 'up')).toBeNull();
		item(allowed.m, 'up').click(); await allowed.m.settle();
		expect(allowed.api.commands).toEqual([{ command: { type: 'move-feature', id: 'pl1', to: 4 }, label: 'Move Plane 1' }]);
		expect(allowed.api.errors).toHaveLength(0);
		expect(allowed.m.all('[role="menu"]')).toHaveLength(0);
		/* Down at the end of the tree is a boundary, said in words, not a reducer error. */
		await openMenu(allowed.m);
		item(allowed.m, 'down').click(); await allowed.m.settle();
		expect(allowed.api.errors).toEqual(['This feature is already last in the tree.']);
		expect(allowed.api.commands).toHaveLength(1);
	});
	it('an HTML5 drop inside the range sends move-feature; one outside it is refused in the reducer\'s words', async () => {
		const ok = tree();
		rowButton(ok.m, 'pl1').dispatchEvent(drag('dragstart'));
		/* A drop over the NESTED sketch is a drop on its extrude's node: the sketch travels with it. */
		const over = drag('dragover'); rowButton(ok.m, 's1').dispatchEvent(over);
		expect(over.defaultPrevented).toBe(true);
		ok.m.flush();
		expect(ok.m.one('[data-row="x1"]').className).toContain('drop-before');
		expect(ok.m.one('[data-row="x1"]').className).not.toContain('drop-refused');
		rowButton(ok.m, 's1').dispatchEvent(drag('drop')); await ok.m.settle();
		expect(ok.api.commands).toEqual([{ command: { type: 'move-feature', id: 'pl1', to: 0 }, label: 'Move Plane 1' }]);
		const refused = tree();
		rowButton(refused.m, 'x1').dispatchEvent(drag('dragstart'));
		rowButton(refused.m, 'pl1').dispatchEvent(drag('dragover')); refused.m.flush();
		expect(refused.m.one('[data-row="pl1"]').className).toContain('drop-refused');
		rowButton(refused.m, 'pl1').dispatchEvent(drag('drop')); await refused.m.settle();
		expect(refused.api.commands).toHaveLength(0);
		expect(refused.api.errors).toEqual([expect.stringMatching(/uses Extrude 1, so it cannot move below it/)]);
		/* A read-only document drags nothing, and a nested sketch never drags on its own. */
		const readOnly = tree({ canWrite: false });
		const start = drag('dragstart'); rowButton(readOnly.m, 'pl1').dispatchEvent(start);
		expect(start.defaultPrevented).toBe(true);
		const nested = tree();
		const alone = drag('dragstart'); rowButton(nested.m, 's1').dispatchEvent(alone);
		expect(alone.defaultPrevented).toBe(true);
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
	it('the form folds to its heading and stays folded across rows; Edit parameters opens it and puts focus in the first field', async () => {
		const { m } = tree({ selections: [feature('x1')] });
		const fold = () => m.one<HTMLButtonElement>('[data-testid="ideacad-feature-params"] button.fold');
		const body = () => m.one<HTMLElement>('#ideacad-feature-param-fields');
		expect(fold().getAttribute('aria-expanded')).toBe('true');
		expect(body().hidden).toBe(false);
		fold().click(); m.flush();
		expect(fold().getAttribute('aria-expanded')).toBe('false');
		expect(body().hidden).toBe(true);
		rowButton(m, 'pl1').click(); await m.settle();
		/* The fixture api does not re-render on select, so the folded state is read off the same form. */
		expect(body().hidden).toBe(true);
		await openMenu(m);
		item(m, 'params').click(); await m.settle();
		expect(body().hidden).toBe(false);
		expect(document.activeElement).toBe(m.one('[data-testid="ideacad-param-distance"]'));
	});
	it('a read-only document has every field disabled and sends nothing', async () => {
		const { m, api } = tree({ selections: [feature('x1')], canWrite: false });
		const fields = m.all<HTMLInputElement>('[data-testid^="ideacad-param-"]');
		expect(fields.length).toBeGreaterThan(0);
		expect(fields.every((f) => f.disabled)).toBe(true);
		expect(m.all('button.row-more')).toHaveLength(0);
		expect(api.commands).toHaveLength(0);
	});
});
describe('rename in place', () => {
	it('the menu\'s Rename opens an inline input; Enter sends rename-feature with the trimmed name; Escape sends nothing', async () => {
		const { m, api } = tree({ selections: [feature('x1')] });
		await openMenu(m); item(m, 'rename').click(); await m.settle();
		const input = m.one<HTMLInputElement>('[data-row="x1"] > .line input.rename');
		input.value = '  Boss  '; input.dispatchEvent(new Event('input', { bubbles: true }));
		key(input, 'Enter'); await m.settle();
		expect(api.commands).toEqual([{ command: { type: 'rename-feature', id: 'x1', name: 'Boss' }, label: 'Rename Extrude 1' }]);
		expect(m.all('[data-row="x1"] input.rename')).toHaveLength(0);
		await openMenu(m); item(m, 'rename').click(); await m.settle();
		const again = m.one<HTMLInputElement>('[data-row="x1"] > .line input.rename');
		again.value = 'Dropped'; again.dispatchEvent(new Event('input', { bubbles: true }));
		key(again, 'Escape'); await m.settle();
		expect(api.commands).toHaveLength(1);
	});
	it('F2 on a focused row renames it; a blur commits', async () => {
		const { m, api } = tree({ selections: [feature('pl1', 'reference')] });
		key(rowButton(m, 'pl1'), 'F2'); await m.settle();
		const input = m.one<HTMLInputElement>('[data-row="pl1"] > .line input.rename');
		expect(input.value).toBe('Plane 1');
		input.value = 'Datum A'; input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('blur')); await m.settle();
		expect(api.commands).toEqual([{ command: { type: 'rename-feature', id: 'pl1', name: 'Datum A' }, label: 'Rename Plane 1' }]);
		/* A read-only document ignores F2. */
		const readOnly = tree({ selections: [feature('pl1', 'reference')], canWrite: false });
		key(rowButton(readOnly.m, 'pl1'), 'F2'); await readOnly.m.settle();
		expect(readOnly.m.all('input.rename')).toHaveLength(0);
	});
	it('a name the reducer refuses keeps the input open and says the reducer\'s sentence; nothing is cut short while typing', async () => {
		const { m, api } = tree({ selections: [feature('pl1', 'reference')] });
		key(rowButton(m, 'pl1'), 'F2'); await m.settle();
		const input = m.one<HTMLInputElement>('[data-row="pl1"] > .line input.rename');
		expect(input.hasAttribute('maxlength')).toBe(false);
		input.value = 'x'.repeat(61); input.dispatchEvent(new Event('input', { bubbles: true }));
		key(input, 'Enter'); await m.settle();
		expect(api.errors).toEqual(['Name the feature using 1 to 60 characters.']);
		expect(api.commands).toHaveLength(0);
		expect(m.all('[data-row="pl1"] > .line input.rename')).toHaveLength(1);
	});
	it('a second press on the NAME of an already selected row renames it after a pause; a double-click edits instead', async () => {
		const { m, api } = tree({ selections: [feature('pl1', 'reference')] });
		const name = () => rowButton(m, 'pl1').querySelector<HTMLElement>('.name')!;
		name().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		expect(m.all('input.rename')).toHaveLength(0);
		await new Promise((r) => setTimeout(r, SLOW_RENAME_MS + 60)); m.flush();
		expect(m.all('[data-row="pl1"] > .line input.rename')).toHaveLength(1);
		expect(api.commands).toHaveLength(0);
		/* The first press on an UNSELECTED row only selects it. */
		const fresh = tree();
		fresh.m.one<HTMLElement>('[data-row="pl1"] > .line button.row .name').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		await new Promise((r) => setTimeout(r, SLOW_RENAME_MS + 60)); fresh.m.flush();
		expect(fresh.m.all('input.rename')).toHaveLength(0);
		/* A double-click on a selected row cancels the pending rename and edits: a feature focuses its first parameter. */
		const quick = tree({ selections: [feature('x1')] });
		const row = rowButton(quick.m, 'x1');
		row.querySelector('.name')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		row.querySelector('.name')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
		row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await quick.m.settle();
		await new Promise((r) => setTimeout(r, SLOW_RENAME_MS + 60)); quick.m.flush();
		expect(quick.m.all('input.rename')).toHaveLength(0);
		expect(document.activeElement).toBe(quick.m.one('[data-testid="ideacad-param-distance"]'));
	});
});
describe('suppress, delete, edit sketch', () => {
	it('Suppress and Unsuppress send suppress-feature with the opposite of the row', async () => {
		const live = tree({ selections: [feature('x1')] });
		await openMenu(live.m);
		expect(item(live.m, 'suppress').textContent?.trim()).toBe('Suppress');
		item(live.m, 'suppress').click(); await live.m.settle();
		expect(live.api.commands).toEqual([{ command: { type: 'suppress-feature', id: 'x1', suppressed: true }, label: 'Suppress Extrude 1' }]);
		const held = tree({ selections: [feature('c1')] });
		await openMenu(held.m);
		expect(item(held.m, 'suppress').textContent?.trim()).toBe('Unsuppress');
		item(held.m, 'suppress').click(); await held.m.settle();
		expect(held.api.commands).toEqual([{ command: { type: 'suppress-feature', id: 'c1', suppressed: false }, label: 'Unsuppress Chamfer 1' }]);
	});
	it('Delete on a feature with dependents is shown refused with the reducer\'s sentence naming them; on one without, sends remove-feature', async () => {
		const blocked = tree({ selections: [feature('s1', 'sketch')] });
		await blocked.m.settle();
		await openMenu(blocked.m);
		expect(item(blocked.m, 'delete').getAttribute('aria-disabled')).toBe('true');
		expect(reason(blocked.m, 'delete')).toBe('A later feature depends on Sketch 1 (Extrude 1). Delete those first, or suppress this one.');
		item(blocked.m, 'delete').click(); await blocked.m.settle();
		expect(blocked.api.errors).toEqual(['A later feature depends on Sketch 1 (Extrude 1). Delete those first, or suppress this one.']);
		expect(blocked.api.commands).toHaveLength(0);
		const free = tree({ selections: [feature('pl1', 'reference')] });
		await openMenu(free.m);
		expect(item(free.m, 'delete').getAttribute('aria-disabled')).toBeNull();
		item(free.m, 'delete').click(); await free.m.settle();
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
	it('Edit sketch opens the sketch through the api from the menu or a double-click, and the open one offers Close', async () => {
		const closed = tree({ selections: [feature('s1', 'sketch')] });
		await closed.m.settle();
		await openMenu(closed.m);
		expect(item(closed.m, 'edit-sketch').textContent?.trim()).toBe('Edit sketch');
		item(closed.m, 'edit-sketch').click(); await closed.m.settle();
		expect(closed.api.edits).toEqual(['s1']);
		rowButton(closed.m, 's1').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await closed.m.settle();
		expect(closed.api.edits).toEqual(['s1', 's1']);
		const open = tree({ editingSketch: 's1', selections: [feature('s1', 'sketch')] });
		await open.m.settle();
		await openMenu(open.m);
		expect(item(open.m, 'edit-sketch').textContent?.trim()).toBe('Close sketch');
		item(open.m, 'edit-sketch').click(); await open.m.settle();
		expect(open.api.edits).toEqual([null]);
		/* A read-only document opens no sketch on a double-click. */
		const readOnly = tree({ canWrite: false });
		rowButton(readOnly.m, 's1').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await readOnly.m.settle();
		expect(readOnly.api.edits).toEqual([]);
	});
});
describe('hover links, when the workspace offers them', () => {
	it('hovering a row asks the workspace to light what it made, and leaving clears it; with no transport nothing is sent and nothing throws', async () => {
		const hovers: (Selection[] | null)[] = [];
		const { m } = tree({ extras: { hover: (s) => { hovers.push(s); } } });
		rowButton(m, 'x1').dispatchEvent(new Event('pointerenter')); rowButton(m, 'x1').dispatchEvent(new Event('pointerleave'));
		m.one<HTMLButtonElement>('[data-ref="YZ"] button.row').dispatchEvent(new Event('pointerenter'));
		expect(hovers).toEqual([[{ bodyId: 'x1#0', kind: 'body', id: 'x1#0' }, feature('x1')], null, [{ bodyId: '', kind: 'reference', id: 'datum:YZ' }]]);
		const bare = tree();
		expect(() => rowButton(bare.m, 'x1').dispatchEvent(new Event('pointerenter'))).not.toThrow();
	});
	it('geometry under the pointer lights the row that made it; a folded sketch lights its parent; the listener is released on unmount', async () => {
		let listener: ((s: Selection | null) => void) | null = null, released = 0;
		const { m } = tree({ extras: { onHover: (l) => { listener = l; return () => { released++; listener = null; }; } } });
		await m.settle();
		expect(listener).not.toBeNull();
		listener!({ bodyId: 'x1#0', kind: 'edge', id: 'edge:f1.blend.x1.end|x1.side.0|x1.start' }); m.flush();
		expect(m.all('li.linked').map((l) => (l as HTMLElement).dataset.row)).toEqual(['f1']);
		listener!({ bodyId: '', kind: 'sketch', id: 's1' }); m.flush();
		expect(m.all('li.linked').map((l) => (l as HTMLElement).dataset.row)).toEqual(['x1']);
		listener!({ bodyId: '', kind: 'reference', id: 'datum:XY' }); m.flush();
		expect(m.all('li.linked').map((l) => (l as HTMLElement).dataset.ref)).toEqual(['XY']);
		listener!(null); m.flush();
		expect(m.all('li.linked')).toHaveLength(0);
		await m.stop();
		expect(released).toBe(1);
	});
});
describe('the rollback bar, when the workspace can roll back', () => {
	it('is absent without the transport; with it, the keys move it and each move asks the workspace for that build index', async () => {
		const bare = tree();
		expect(bare.m.all('[data-testid="ideacad-rollback-bar"]')).toHaveLength(0);
		const calls: (number | null)[] = [];
		const { m, api } = tree({ extras: { rollback: (i) => { calls.push(i); } } });
		const bar = () => m.one<HTMLElement>('[data-testid="ideacad-rollback-bar"]');
		expect(bar().getAttribute('aria-valuenow')).toBe('5');
		key(bar(), 'ArrowUp'); await m.settle();
		expect(calls).toEqual([5]);
		expect(bar().getAttribute('aria-valuenow')).toBe('4');
		expect(bar().getAttribute('aria-valuetext')).toBe('Rolled back before Plane 1');
		expect(m.all('li.rolled-back').map((l) => (l as HTMLElement).dataset.row)).toEqual(['pl1']);
		key(bar(), 'Home'); await m.settle();
		expect(calls).toEqual([5, 0]);
		expect(m.all('li.rolled-back').map((l) => (l as HTMLElement).dataset.row)).toEqual(['x1', 's1', 'f1', 'p1', 'c1', 'pl1']);
		key(bar(), 'End'); await m.settle();
		expect(calls).toEqual([5, 0, null]);
		expect(m.all('li.rolled-back')).toHaveLength(0);
		/* The bar is workspace state: nothing it did is a command, so nothing reached the history. */
		expect(api.commands).toHaveLength(0);
	});
});

describe('a refused row', () => {
	/* The fixture's own Fillet 1 row, refused with the help the engine carries: the tree offers the Feature panel's one-click way forward under the sentence. */
	const refused = (api: FakeApi) => { Object.assign(api.api.model.features.find((r) => r.id === 'f1')!, { status: 'error', message: 'The round is too big for that edge.', help: { fix: { label: 'Use 0.1 in', commands: [{ type: 'set-feature', id: 'f1', patch: { radius: 0.1 } }] } } }); return api; };
	it('offers its fix under the sentence and applies the fix commands; a row without help, and a read-only tree, offer none', async () => {
		const api = refused(fakeApi()); const m = mountInto(Tree, { api: api.api }); mounted.push(m);
		const fixes = m.all<HTMLButtonElement>('[data-testid="ideacad-tree-fix"]');
		expect(fixes).toHaveLength(1);
		expect(fixes[0].textContent).toBe('Use 0.1 in');
		expect(fixes[0].closest('[data-row]')?.getAttribute('data-row')).toBe('f1');
		fixes[0].click(); await m.settle();
		expect(api.commands).toEqual([{ command: { type: 'set-feature', id: 'f1', patch: { radius: 0.1 } }, label: 'Use 0.1 in' }]);
		const ro = refused(fakeApi({ canWrite: false })); const r = mountInto(Tree, { api: ro.api }); mounted.push(r);
		expect(r.all('[data-testid="ideacad-tree-fix"]')).toHaveLength(0);
		expect(r.all('[data-row="f1"] .message')).toHaveLength(1);
	});
});
