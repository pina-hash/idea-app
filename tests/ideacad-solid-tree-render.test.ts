// tests/ideacad-solid-tree-render.test.ts
//
// THE DESIGN TREE, RENDERED, mounting the REAL `FeatureTree` (and through it
// the real `FeatureParams`) rather than a copy of its markup, on the server
// build: every claim here is about the first frame -- what is on the row, what
// is under it, which controls exist -- and none needs an event to have run.
//
// BOTH DIRECTIONS ON EVERY VISIBILITY CLAIM, COUNTED. An ok row has NO message
// element, and the same render puts one on each of the error row and the
// warning row; a read-only api renders NO action controls, and the same fixture
// with write access renders them. An absence is never a page that failed to
// render.
//
// NO GEOMETRY, NO CONTRAST, NO TAP TARGET HERE: there is no layout engine on
// this path. Row height at 375 and 1440 is measured in a real Chromium against
// /dev/ideacad-solid and reported in the bundle's ledger.
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { Component } from 'svelte';
import FeatureTree from '../src/lib/ideacad/solid/FeatureTree.svelte';
import { STATUS_WORDS } from '../src/lib/ideacad/solid/tree/rows';
import { ERROR_MESSAGE, WARNING_MESSAGE, fakeApi, fixtureRows } from './ideacad-solid-tree-fixture';

const Tree = FeatureTree as unknown as Component<Record<string, unknown>>;
const html = (props: Record<string, unknown>) => render(Tree, { props }).body;
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const li = (s: string, id: string) => { const m = s.match(new RegExp(`<li[^>]*data-row="${id}"[\\s\\S]*?</li>`)); if (!m) throw Error(`no row ${id}`); return m[0]; };
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('every feature is a row', () => {
	const page = html({ api: fakeApi().api });
	it('renders every feature in tree order with its status glyph AND word, and its summary', () => {
		const rows = fixtureRows();
		expect(count(page, /<li[^>]*data-row=/g)).toBe(rows.length);
		const order = [...page.matchAll(/data-row="([^"]+)"/g)].map((m) => m[1]);
		expect(order).toEqual(rows.map((r) => r.id));
		for (const row of rows) {
			const item = li(page, row.id);
			expect(item, row.id).toContain(`class="${row.status}`);
			expect(text(item), row.id).toContain(STATUS_WORDS[row.status].word);
			expect(item, row.id).toContain(STATUS_WORDS[row.status].glyph);
			expect(text(item), row.id).toContain(row.summary);
			expect(text(item), row.id).toContain(row.name);
		}
	});
	it('puts a message on its own row for the error and the warning, and on no other row', () => {
		expect(count(page, /class="message\b/g)).toBe(2);
		expect(li(page, 'f1')).toContain('role="alert"');
		expect(text(li(page, 'f1'))).toContain(ERROR_MESSAGE);
		expect(li(page, 'p1')).toContain('role="status"');
		expect(text(li(page, 'p1'))).toContain(WARNING_MESSAGE);
		for (const id of ['s1', 'x1', 'c1', 'pl1']) expect(count(li(page, id), /class="message\b/g), id).toBe(0);
		/* The sentence is on the row, not in a title attribute. */
		expect(page).not.toMatch(/title="Lost reference/);
	});
	it('offers Edit sketch on the sketch row only, and marks the sketch open for editing', () => {
		expect(count(page, />Edit sketch</g)).toBe(1);
		expect(li(page, 's1')).toContain('>Edit sketch<');
		expect(count(page, /Close sketch/g)).toBe(0);
		expect(count(page, /editing-word/g)).toBe(0);
		const editing = html({ api: fakeApi({ editingSketch: 's1' }).api });
		expect(count(editing, /Close sketch/g)).toBe(1);
		expect(li(editing, 's1')).toMatch(/class="editing-word\b/);
		expect(li(editing, 's1')).toMatch(/<li class="ok[^"]*\bediting\b/);
		expect(count(editing, /<li class="[^"]*\bediting\b/g)).toBe(1);
	});
});
describe('the selected row', () => {
	const selected = [{ bodyId: 'x1#0', kind: 'body' as const, id: 'x1#0' }, { bodyId: '', kind: 'feature' as const, id: 'x1' }];
	it('carries the action controls and the reducer\'s reasons, and no other row does', () => {
		const page = html({ api: fakeApi({ selections: selected }).api });
		expect(count(page, /class="actions\b/g)).toBe(1);
		expect(li(page, 'x1')).toMatch(/class="actions\b/);
		expect(li(page, 'x1')).toMatch(/<li class="ok[^"]*\bselected\b/);
		const actions = li(page, 'x1');
		for (const word of ['Up', 'Down', 'Suppress', 'Delete', 'Rename', 'Parameters']) expect(text(actions), word).toContain(word);
		/* Up, Down and Delete are all refused for the extrude, and each says why in the reducer's words. */
		expect(count(actions, /aria-disabled="true"/g)).toBe(3);
		expect(text(actions)).toContain('Up: Extrude 1 uses Sketch 1, so it cannot move above it.');
		expect(text(actions)).toContain('Down: Fillet 1 uses Extrude 1, so it cannot move below it.');
		expect(text(actions)).toContain('Delete: 3 later features depend on Extrude 1 (Fillet 1, Push face 1, Chamfer 1).');
		/* And the plane, which nothing depends on: Up and Delete allowed, Down refused only because it is last, which the row's position already says, so no reasons are written. */
		const free = html({ api: fakeApi({ selections: [{ bodyId: '', kind: 'reference', id: 'pl1' }] }).api });
		const plane = li(free, 'pl1');
		expect(plane).toMatch(/aria-disabled="false"[^>]*>▲ Up</);
		expect(plane).toMatch(/aria-disabled="true"[^>]*>▼ Down</);
		expect(plane).toMatch(/aria-disabled="false"[^>]*>Delete</);
		expect(count(free, /class="why\b/g)).toBe(0);
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
	it('renders no action controls and no enabled field for a read-only document', () => {
		const readOnly = html({ api: fakeApi({ selections: selected, canWrite: false }).api });
		expect(count(readOnly, /class="actions\b/g)).toBe(0);
		expect(count(readOnly, /class="why\b/g)).toBe(0);
		expect(count(readOnly, /draggable="true"/g)).toBe(0);
		expect(count(readOnly, /draggable="false"/g)).toBe(6);
		const fields = readOnly.match(/<(input|select)[^>]*data-testid="ideacad-param-[^"]+"[^>]*>/g) ?? [];
		expect(fields.length).toBeGreaterThan(0);
		expect(fields.every((f) => / disabled/.test(f))).toBe(true);
		const writable = html({ api: fakeApi({ selections: selected }).api });
		expect(count(writable, /draggable="true"/g)).toBe(6);
		const live = writable.match(/<(input|select)[^>]*data-testid="ideacad-param-[^"]+"[^>]*>/g) ?? [];
		expect(live.length).toBe(fields.length);
		expect(live.some((f) => / disabled/.test(f))).toBe(false);
		/* Rows and their sentences are still there for a reader. */
		expect(count(readOnly, /<li[^>]*data-row=/g)).toBe(6);
		expect(text(readOnly)).toContain(ERROR_MESSAGE);
	});
});
