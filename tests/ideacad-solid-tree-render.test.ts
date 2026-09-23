// tests/ideacad-solid-tree-render.test.ts
//
// THE DESIGN TREE, RENDERED, mounting the REAL `FeatureTree` (and through it
// the real `FeatureParams`) rather than a copy of its markup, on the server
// build: every claim here is about the first frame -- what is on the row, what
// is under it, which controls exist -- and none needs an event to have run.
//
// BOTH DIRECTIONS ON EVERY VISIBILITY CLAIM, COUNTED. An ok row has NO message
// element and NO status word, and the same render puts both on the error row
// and the warning row; a read-only api renders NO row menu control, and the
// same fixture with write access renders one, on the selected row. An absence
// is never a page that failed to render.
//
// THE TREE IS SOLIDWORKS-SHAPED SINCE LEDGER 0296: four reference rows (not
// features) above the feature list, each consumed sketch nested under the
// feature made from it, and a row's actions in one menu rather than written
// out under it. The rules below were generalized from the flat tree's, never
// dropped: every feature is still exactly one `li[data-row]`, in the order the
// tree DRAWS them (`nestRows`), and the reference rows are never counted as
// features.
//
// NO GEOMETRY, NO CONTRAST, NO TAP TARGET HERE: there is no layout engine on
// this path. Row height at 375 and 1440 is measured in a real Chromium against
// /dev/ideacad-solid and reported in the bundle's ledger.
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { Component } from 'svelte';
import FeatureTree from '../src/lib/ideacad/solid/FeatureTree.svelte';
import { STATUS_WORDS, nestRows } from '../src/lib/ideacad/solid/tree/rows';
import { REFERENCE_ROWS } from '../src/lib/ideacad/solid/tree/references';
import { ERROR_MESSAGE, WARNING_MESSAGE, fakeApi, fixtureManifest, fixtureRows } from './ideacad-solid-tree-fixture';

const Tree = FeatureTree as unknown as Component<Record<string, unknown>>;
const html = (props: Record<string, unknown>) => render(Tree, { props }).body;
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
/** A row's own press: the row button, never the caret beside it. */
const rowButton = (s: string, id: string) => { const m = li(s, id).match(/<button class="row[\s\S]*?<\/button>/); if (!m) throw Error(`no row button ${id}`); return m[0]; };
const li = (s: string, id: string) => { const m = s.match(new RegExp(`<li[^>]*data-row="${id}"[\\s\\S]*?</li>`)); if (!m) throw Error(`no row ${id}`); return m[0]; };
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('every feature is a row, drawn where SolidWorks draws it', () => {
	const page = html({ api: fakeApi().api });
	const rows = fixtureRows();
	it('renders every feature once, in the order the tree draws them, with its name and summary', () => {
		expect(count(page, /<li[^>]*data-row=/g)).toBe(rows.length);
		const drawn = nestRows(rows, fixtureManifest().features).flatMap((n) => [n.row.id, ...n.children.map((c) => c.id)]);
		const order = [...page.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);
		expect(order).toEqual(drawn);
		/* The sketch is drawn under its extrude, not first. */
		expect(order).toEqual(['x1', 's1', 'f1', 'p1', 'c1', 'pl1']);
		for (const row of rows) {
			const item = li(page, row.id);
			expect(item, row.id).toContain(`class="${row.status}`);
			expect(text(item), row.id).toContain(row.summary);
			expect(text(item), row.id).toContain(row.name);
		}
	});
	it('nests the consumed sketch inside its extrude, collapsed, behind a caret that says so', () => {
		const x1 = page.match(/<li[^>]*data-row="x1"[\s\S]*?<\/ol>/)![0];
		expect(x1).toMatch(/<ol class="children[^"]*"[^>]*id="ideacad-tree-children-x1"[^>]*hidden/);
		expect(x1).toContain('data-row="s1"');
		expect(count(page, /<ol class="children\b/g)).toBe(1);
		expect(count(page, /class="caret\b/g)).toBe(1);
		expect(page).toMatch(/class="caret[^"]*"[^>]*aria-expanded="false"[^>]*aria-controls="ideacad-tree-children-x1"/);
		/* Nothing else is nested: the other five rows are direct children of the feature list. */
		expect(count(page, /aria-label="Expand /g)).toBe(1);
	});
	it('writes a status glyph and word only on a row that is not OK, and no row says OK', () => {
		for (const row of rows) {
			const line = rowButton(page, row.id);
			expect(text(line), row.id).toContain(row.name);
			if (row.status === 'ok') { expect(text(line), row.id).not.toContain(STATUS_WORDS.ok.word); expect(line, row.id).not.toContain(STATUS_WORDS.ok.glyph); }
			else { expect(text(line), row.id).toContain(STATUS_WORDS[row.status].word); expect(line, row.id).toContain(STATUS_WORDS[row.status].glyph); }
		}
		const notOk = rows.filter((r) => r.status !== 'ok').length;
		expect(notOk).toBe(3);
		expect(count(page, /class="status\b/g)).toBe(notOk);
		expect(count(page, new RegExp(STATUS_WORDS.ok.glyph, 'g'))).toBe(0);
	});
	it('puts a message on its own row for the error and the warning, and on no other row', () => {
		expect(count(page, /class="message\b/g)).toBe(2);
		expect(li(page, 'f1')).toContain('role="alert"');
		expect(text(li(page, 'f1'))).toContain(ERROR_MESSAGE);
		expect(li(page, 'p1')).toContain('role="status"');
		expect(text(li(page, 'p1'))).toContain(WARNING_MESSAGE);
		for (const id of ['s1', 'c1', 'pl1']) expect(count(li(page, id), /class="message\b/g), id).toBe(0);
		/* x1's own line carries no message; its li also holds the nested sketch, which carries none either. */
		expect(count(li(page, 'x1'), /class="message\b/g)).toBe(0);
		/* The sentence is on the row, not in a title attribute. */
		expect(page).not.toMatch(/title="Lost reference/);
	});
	it('wears one icon per row, and marks the sketch open for editing with a word', () => {
		for (const row of rows) expect(count(rowButton(page, row.id), /<svg class="icon/g), row.id).toBe(1);
		expect(count(page, /editing-word/g)).toBe(0);
		const editing = html({ api: fakeApi({ editingSketch: 's1' }).api });
		expect(li(editing, 's1')).toMatch(/class="editing-word\b/);
		expect(li(editing, 's1')).toMatch(/<li class="ok[^"]*\bediting\b/);
		expect(count(editing, /<li class="[^"]*\bediting\b/g)).toBe(1);
		/* No row carries an Edit sketch button of its own any more: it is in the row's menu. */
		expect(count(page, /class="edit-sketch\b/g)).toBe(0);
	});
});
describe('the reference rows', () => {
	const page = html({ api: fakeApi().api });
	it('lists Front, Top and Right planes and the Origin above the features, in their own list, each with an eye', () => {
		const refs = page.match(/<ul class="refs[\s\S]*?<\/ul>/)![0];
		expect([...refs.matchAll(/data-ref="([^"]+)"/g)].map((m) => m[1])).toEqual(['XZ', 'XY', 'YZ', 'origin']);
		expect(REFERENCE_ROWS.map((r) => r.name)).toEqual(['Front Plane', 'Top Plane', 'Right Plane', 'Origin']);
		for (const r of REFERENCE_ROWS) expect(text(refs)).toContain(r.name);
		expect(count(refs, /class="eye\b/g)).toBe(4);
		expect(count(refs, /aria-label="(Hide|Show) planes"/g)).toBe(4);
		/* Above the feature list, and not features: none carries data-row, and the feature list still holds exactly six. */
		expect(page.indexOf('class="refs')).toBeLessThan(page.indexOf('aria-label="Features in order"'));
		expect(count(refs, /data-row=/g)).toBe(0);
	});
});
describe('the selected row', () => {
	const selected = [{ bodyId: 'x1#0', kind: 'body' as const, id: 'x1#0' }, { bodyId: '', kind: 'feature' as const, id: 'x1' }];
	it('carries the one menu control, and no other row does, with no action buttons or reasons written out', () => {
		const page = html({ api: fakeApi({ selections: selected }).api });
		expect(count(page, /class="row-more\b/g)).toBe(1);
		expect(li(page, 'x1')).toMatch(/class="row-more\b[^>]*aria-haspopup="menu"/);
		expect(li(page, 'x1')).toMatch(/<li class="ok[^"]*\bselected\b/);
		expect(li(page, 'x1')).toContain('aria-label="Extrude 1 actions"');
		/* The flat tree's six buttons and its two prose sentences are gone from the row. */
		expect(count(page, /class="actions\b/g)).toBe(0);
		expect(count(page, /class="why\b/g)).toBe(0);
		expect(text(page)).not.toContain('Up: Extrude 1 uses Sketch 1');
		/* Positive control: an unselected render has no menu control at all. */
		expect(count(html({ api: fakeApi().api }), /class="row-more\b/g)).toBe(0);
	});
	it('shows the full feature\'s parameters beneath the list, read from the manifest', () => {
		const page = html({ api: fakeApi({ selections: selected }).api });
		expect(count(page, /data-testid="ideacad-feature-params"/g)).toBe(1);
		expect(page.match(/<input[^>]*data-testid="ideacad-param-distance"[^>]*>/)![0]).toContain('value="1"');
		expect(page).toMatch(/<select[^>]*data-testid="ideacad-param-operation"/);
		expect(page).toMatch(/<select[^>]*data-testid="ideacad-param-direction"/);
		expect(text(page)).toContain('sketch Sketch 1 found');
		/* No min, no max, no type=number: nothing clamps what a student types. */
		const distance = page.match(/<input[^>]*data-testid="ideacad-param-distance"[^>]*>/)![0];
		expect(distance).not.toMatch(/\bmin=|\bmax=|type="number"/);
		expect(distance).toContain('inputmode="decimal"');
		/* The broken fillet's form names the reference and its standing. */
		const broken = html({ api: fakeApi({ selections: [{ bodyId: '', kind: 'feature', id: 'f1' }] }).api });
		expect(text(broken)).toContain('not on the model');
		expect(count(broken, /class="ref-status missing\b/g)).toBe(1);
		expect(count(page, /class="ref-status missing\b/g)).toBe(0);
		expect(count(page, /class="ref-status found\b/g)).toBe(1);
	});
	it('renders no menu control, no drag and no enabled field for a read-only document', () => {
		const readOnly = html({ api: fakeApi({ selections: selected, canWrite: false }).api });
		expect(count(readOnly, /class="row-more\b/g)).toBe(0);
		expect(count(html({ api: fakeApi({ selections: selected }).api }), /class="row-more\b/g)).toBe(1);
		expect(count(readOnly, /draggable="true"/g)).toBe(0);
		expect(count(readOnly, /draggable="false"/g)).toBe(6);
		const fields = readOnly.match(/<(input|select)[^>]*data-testid="ideacad-param-[^"]+"[^>]*>/g) ?? [];
		expect(fields.length).toBeGreaterThan(0);
		expect(fields.every((f) => / disabled/.test(f))).toBe(true);
		const writable = html({ api: fakeApi({ selections: selected }).api });
		/* Every top-level row drags; the nested sketch travels with its extrude and does not drag on its own. */
		expect(count(writable, /draggable="true"/g)).toBe(5);
		expect(li(writable, 's1').match(/<button class="row[^>]*>/)![0]).toContain('draggable="false"');
		const live = writable.match(/<(input|select)[^>]*data-testid="ideacad-param-[^"]+"[^>]*>/g) ?? [];
		expect(live.length).toBe(fields.length);
		expect(live.some((f) => / disabled/.test(f))).toBe(false);
		/* Rows and their sentences are still there for a reader. */
		expect(count(readOnly, /<li[^>]*data-row=/g)).toBe(6);
		expect(text(readOnly)).toContain(ERROR_MESSAGE);
	});
});
describe('the rollback bar', () => {
	it('is not drawn when the workspace cannot roll back, and is drawn once when it can', () => {
		expect(count(html({ api: fakeApi().api }), /data-testid="ideacad-rollback-bar"/g)).toBe(0);
		const page = html({ api: fakeApi({ extras: { rollback: () => {} } }).api });
		expect(count(page, /data-testid="ideacad-rollback-bar"/g)).toBe(1);
		/* At the end: inside the last top-level row, after its line, and nothing is grayed. */
		expect(li(page, 'pl1')).toContain('data-testid="ideacad-rollback-bar"');
		expect(count(page, /\brolled-back\b/g)).toBe(0);
		expect(page).toMatch(/aria-valuetext="Everything is built"/);
	});
	it('grays exactly the rows at and after the workspace\'s index, and says where it stands', () => {
		const page = html({ api: fakeApi({ extras: { rollback: () => {}, rollbackIndex: 3 } }).api });
		/* Index 3 is before Push face 1 (build 3): p1, c1 and pl1 are not built. */
		expect([...page.matchAll(/<li class="[^"]*\brolled-back\b[^"]*"[^>]*data-row="([^"]+)"/g)].map((m) => m[1])).toEqual(['p1', 'c1', 'pl1']);
		expect(page).toMatch(/aria-valuetext="Rolled back before Push face 1"/);
		expect(li(page, 'f1')).toContain('data-testid="ideacad-rollback-bar"');
	});
});
