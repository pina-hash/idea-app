// tests/maps-editor-render.test.ts
//
// WHAT THE EDITOR ACTUALLY PUTS ON SCREEN, asserted from `svelte/server`
// render() markup of the REAL MapsEditor over the REAL harness fixture --
// rendered output, never source text (a grep of a component's source proves
// the source contains a string). Every visibility claim carries both
// directions with counts: what must be present AND what must be absent, and
// the absent half has a positive control in a sibling state where the same
// selector matches.
//
// MUTATION-CHECKED (manually, during this session -- the render half of this
// bundle's negative control; details in the history entry): removing the
// pending strip from NodeDetail reddened the pending-state assertions here
// while everything else stayed green, and the file was restored md5-identical
// and re-run green.

import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import MapsEditor from '../src/lib/maps/MapsEditor.svelte';
import { FIX, mapsEditFixture, memoryMapsTransports } from '../src/routes/dev/maps-edit/fixture';
import type { MapsSelection } from '../src/lib/maps/maps';

function renderEditor(initialSelection: MapsSelection | null = null): string {
	const fixture = mapsEditFixture();
	return render(MapsEditor, {
		props: {
			initial: fixture,
			transports: memoryMapsTransports(fixture),
			initialSelection
		}
	}).body;
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

/** The markup between a section's testid and its closing tag. */
function section(html: string, testid: string): string {
	const start = html.indexOf(`data-testid="${testid}"`);
	if (start === -1) return '';
	const end = html.indexOf('</section>', start);
	return html.slice(start, end === -1 ? undefined : end);
}

describe('nothing selected: the tree, with state visible from the list', () => {
	it('renders all 7 fixture nodes with their publish states, and no detail pane', () => {
		const html = renderEditor();
		expect(count(html, 'tree-row')).toBeGreaterThanOrEqual(7);
		// One pending chip (Mill Room), two draft chips (Drawer 2, Prototype
		// Lab), four published -- the whole fixture accounted for, so a chip
		// that stopped rendering moves a number instead of vanishing quietly.
		expect(count(html, 'data-state="pending"')).toBe(1);
		expect(count(html, 'data-state="draft"')).toBe(2);
		expect(count(html, 'data-state="published"')).toBe(4);
		// The absent half: no detail pane, no canvas (drawing is bundle B).
		expect(count(html, 'maps-node-detail')).toBe(0);
		expect(count(html, '<canvas')).toBe(0);
		// The root ladder, before the action: exactly the three legal kinds.
		const addRoot = html.slice(html.indexOf('maps-add-root'));
		expect(addRoot).toContain('Add site');
		expect(addRoot).toContain('Add building');
		expect(addRoot).toContain('Add outdoor zone');
		expect(addRoot).not.toContain('Add room');
		expect(html).toContain('At the top level: a site, a building or a outdoor zone.');
	});
});

describe('a published node with a PENDING edit is visibly distinct', () => {
	it('says the public still sees the old version, seeds the form from the snapshot, and offers publish + discard', () => {
		const html = renderEditor({ kind: 'node', id: FIX.millRoom });
		expect(count(html, 'maps-pending-strip')).toBe(1);
		expect(html).toContain('staged pending edit');
		expect(html).toContain('previously published version');
		expect(count(html, 'data-publish-state="pending"')).toBe(1);
		expect(html).toContain('Publish pending edit');
		expect(html).toContain('Discard pending edit');
		// The form shows the STAGED content, not the live row's.
		expect(html).toContain('Three mills and the new surface grinder.');
		// Control: a published node with NO pending edit renders none of that.
		const clean = renderEditor({ kind: 'node', id: FIX.machineShop });
		expect(count(clean, 'maps-pending-strip')).toBe(0);
		expect(count(clean, 'data-publish-state="published"')).toBeGreaterThanOrEqual(1);
	});

	it('marks a pending item type the same way, staged aliases included', () => {
		const html = renderEditor({ kind: 'type', id: FIX.hexKeyType });
		expect(count(html, 'maps-pending-strip')).toBe(1);
		// 'allen wrenches' exists only in the pending snapshot.
		expect(html).toContain('allen wrenches');
		expect(html).toContain('Publish pending edit');
	});
});

describe('the kind-nesting constraint is surfaced before the action', () => {
	it('offers a compartment no children at all, with the reason in words', () => {
		const html = renderEditor({ kind: 'node', id: FIX.drawer1 });
		expect(count(section(html, 'maps-add-child'), '<button')).toBe(0);
		expect(html).toContain('Nothing can sit inside a compartment.');
		// A compartment carries elevation fields and NO plan geometry.
		expect(count(html, 'maps-elevation-fields')).toBe(1);
		expect(count(html, 'maps-geometry-fields')).toBe(0);
		expect(html).toContain('Compartments carry no plan geometry.');
	});

	it('offers a unit exactly one child kind -- the positive control for those zeros', () => {
		const html = renderEditor({ kind: 'node', id: FIX.toolChest });
		const addChild = section(html, 'maps-add-child');
		expect(count(addChild, '<button')).toBe(1);
		expect(addChild).toContain('Add compartment');
		expect(count(html, 'maps-geometry-fields')).toBe(1);
		expect(count(html, 'maps-elevation-fields')).toBe(0);
	});

	it('does not offer a re-kind that would strand the children, and says why', () => {
		// Tool Chest A holds two compartments, so under its room parent the only
		// kind that could hold them is `unit` -- the picker collapses to a fixed
		// value with the reason beside it, instead of a select whose other
		// options the trigger would refuse.
		const html = renderEditor({ kind: 'node', id: FIX.toolChest });
		expect(html).toContain('Kinds that could not hold what is already inside are not offered.');
		const kindField = html.slice(html.indexOf('-kind'), html.indexOf('-parent'));
		expect(count(kindField, '<select')).toBe(0);
		expect(kindField).toContain('Unit');
	});

	it('lists only legal parents for the thing being moved', () => {
		// The select's own markup, anchored at its id (the label's `for` cannot
		// match `id="` so this is unique).
		const selectFor = (html: string, id: string) => {
			const start = html.indexOf(`id="${id}"`);
			const end = html.indexOf('</select>', start);
			return start === -1 || end === -1 ? '' : html.slice(start, end);
		};
		// A room's legal parents are buildings, and only the one building
		// exists -- so the parent picker holds exactly one option and no
		// top-level entry (a room may not sit at the root).
		const html = renderEditor({ kind: 'node', id: FIX.millRoom });
		const parentField = selectFor(html, `node:${FIX.millRoom}-parent`);
		expect(count(parentField, '<option')).toBe(1);
		expect(parentField).toContain('IDEA Building');
		expect(parentField).not.toContain('Top level');
		// Control: a building MAY sit at the root, so its picker has the
		// top-level entry.
		const building = renderEditor({ kind: 'node', id: FIX.building });
		expect(selectFor(building, `node:${FIX.building}-parent`)).toContain('Top level');
	});
});

describe('creation completeness: what can be created can be deleted, and a blocked delete says why', () => {
	it('replaces the delete control with the real counts while things live inside', () => {
		const html = renderEditor({ kind: 'node', id: FIX.toolChest });
		const danger = section(html, 'maps-node-delete');
		expect(danger).toContain('cannot be deleted while things live in it');
		expect(danger).toMatch(/2 child\s+containers/);
		expect(danger).toMatch(/1\s+item/);
		expect(count(danger, '<button')).toBe(0);
		// Control: an empty draft node offers the real two-step control.
		const empty = renderEditor({ kind: 'node', id: FIX.protoLab });
		const emptyDanger = section(empty, 'maps-node-delete');
		expect(count(emptyDanger, '<button')).toBe(1);
		expect(emptyDanger).toContain('Delete container');
	});

	it('gives every object the full authoring surface at creation', () => {
		const html = renderEditor({ kind: 'new-node', parentId: null, presetKind: 'building' });
		expect(html).toContain('New container');
		expect(html).toContain('Create draft');
		expect(html).toContain('Create &amp; publish');
		// The geometry is part of the create form, not a come-back-later panel.
		expect(count(html, 'maps-geometry-fields')).toBe(1);
	});
});
