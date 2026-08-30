// tests/dom/maps-elevation-mount.test.ts
//
// THE ELEVATION EDITOR'S TWO CLAIMS, both of which are about what a PRESS
// does and neither of which a server render can reach:
//
//  1. REORDERING DOES NOT RETYPE A HEIGHT. Move down carries the slot's own
//     typed inches with it and the write renumbers rather than re-measures.
//  2. BATCHING THE PRESS DOES NOT BATCH THE RULE. One Save writes every
//     changed compartment, and each one goes where its OWN publish state sends
//     it: a draft row is updated in place, a PUBLISHED one has its edit staged
//     as a pending revision and the public keeps seeing the old stack. That
//     distinction is the whole of spec 4.3 and it is invisible on screen --
//     both rows just look saved -- so it is asserted against what the
//     transports actually received.
//
// The in-memory transports are the harness's own (`memoryMapsTransports`),
// which mirror 0161's refusals, so what is driven here is the mechanism the
// real database enforces rather than a happy path written for the test.
//
// NO GEOMETRY, NO CONTRAST: happy-dom has no layout engine (see
// `tests/dom/README.md`). That the stack DRAWS in proportion to the typed
// heights is `npm run verify:browser`'s claim and is measured there.
//
// MUTATION-CHECKED (this session, details in the history entry).

import { describe, expect, it } from 'vitest';
import { mountInto } from './mount';
import NodeDetail from '../../src/lib/maps/NodeDetail.svelte';
import { FIX, mapsEditFixture, memoryMapsTransports } from '../../src/routes/dev/maps-edit/fixture';
import type { MapsEditorData, MapsNode } from '../../src/lib/maps/maps';

function openUnit() {
	const data: MapsEditorData = mapsEditFixture();
	const node = data.nodes.find((n) => n.id === FIX.toolChest) as MapsNode;
	const m = mountInto(NodeDetail as never, {
		node,
		data,
		transports: memoryMapsTransports(data),
		onchanged: async () => {},
		onselectnode: () => {},
		onaddchild: () => {},
		ondeleted: () => {},
		registerForm: () => {}
	});
	return { m, data };
}

/** The slot rows, as [name, height, width] read off the live inputs. */
function slots(m: { all: (s: string) => Element[] }): string[][] {
	return m.all('[data-testid="maps-elevation-rows"] > li').map((li) => {
		const inputs = Array.from(li.querySelectorAll('input')) as HTMLInputElement[];
		return inputs.map((i) => i.value);
	});
}

const press = (el: Element) => el.dispatchEvent(new Event('click', { bubbles: true }));
const nodeIn = (data: MapsEditorData, id: string) =>
	data.nodes.find((n) => n.id === id) as MapsNode;

describe('the front elevation of a unit', () => {
	it('reads the unit\'s compartments as a stack, top first, with their typed inches', async () => {
		const { m } = openUnit();
		expect(m.all('[data-testid="maps-unit-elevation"]')).toHaveLength(1);
		expect(slots(m)).toEqual([
			['Drawer 1', '3', '28'],
			['Drawer 2', '5', '28']
		]);
		// One drawn box per compartment: the stack is a drawing, not a list.
		expect(m.all('[data-testid="maps-elevation-stack"] .slot-draw')).toHaveLength(2);
		await m.stop();
	});

	it('MOVES A SLOT WITHOUT RETYPING ITS HEIGHT', async () => {
		const { m } = openUnit();
		// Move down on slot 1.
		press(m.all('[data-testid="maps-elevation-rows"] > li')[0].querySelectorAll('button')[1]);
		m.flush();
		expect(slots(m)).toEqual([
			// Drawer 2 is the top slot now and it still measures 5 inches: the
			// height came with the compartment, which is the feature.
			['Drawer 2', '5', '28'],
			['Drawer 1', '3', '28']
		]);
		expect(m.one('[data-testid="maps-elevation-move-notice"]').textContent).toContain(
			'Its typed height came with it'
		);
		await m.stop();
	});

	it('will not move the top slot up, and says so on the control rather than by doing nothing', async () => {
		const { m } = openUnit();
		const up = m.all('[data-testid="maps-elevation-rows"] > li')[0].querySelectorAll('button')[0];
		expect(up.getAttribute('aria-disabled')).toBe('true');
		// aria-disabled, not disabled, so the control can still explain itself
		// -- and the handler refuses on its own rather than relying on the
		// attribute, which a synthetic dispatch would walk straight past.
		press(up);
		m.flush();
		expect(slots(m).map((s) => s[0])).toEqual(['Drawer 1', 'Drawer 2']);
		// The positive control: the same button on the SECOND row is live.
		const secondUp = m
			.all('[data-testid="maps-elevation-rows"] > li')[1]
			.querySelectorAll('button')[0];
		expect(secondUp.getAttribute('aria-disabled')).toBe('false');
		await m.stop();
	});

	it('saves each compartment where its OWN publish state sends it', async () => {
		const { m, data } = openUnit();
		press(m.all('[data-testid="maps-elevation-rows"] > li')[0].querySelectorAll('button')[1]);
		m.flush();
		press(
			m
				.all('[data-testid="maps-unit-elevation"] .actions button')
				.find((b) => (b.textContent ?? '').includes('Save elevation')) as Element
		);
		await m.settle();

		// Drawer 2 is a DRAFT: its live row moved to slot 1, height untouched.
		const drawer2 = nodeIn(data, FIX.drawer2);
		expect(drawer2.elevation_order).toBe(1);
		expect(drawer2.elevation_h_in).toBe(5);

		// Drawer 1 is PUBLISHED: its live row has NOT moved -- the public map
		// still shows the old stack -- and the new slot sits in a pending
		// revision waiting to be published.
		const drawer1 = nodeIn(data, FIX.drawer1);
		expect(drawer1.elevation_order).toBe(1);
		const staged = data.pending.find((p) => p.node_id === FIX.drawer1);
		expect(staged).toBeDefined();
		expect(staged?.snapshot.elevation_order).toBe(2);
		expect(staged?.snapshot.elevation_h_in).toBe(3);
		// And the snapshot is WHOLE: maps_publish promotes it as the entire
		// proposed row, so a missing subtype would publish a compartment
		// without one.
		expect(staged?.snapshot.subtype).toBe('drawer');

		expect(m.one('[data-testid="maps-elevation-report"]').textContent).toContain(
			'Saved 2 of 2'
		);
		await m.stop();
	});

	it('writes ONE row for a rename, and the report says so', async () => {
		const { m, data } = openUnit();
		const nameInput = m
			.all('[data-testid="maps-elevation-rows"] > li')[1]
			.querySelector('input') as HTMLInputElement;
		nameInput.value = 'Deep drawer';
		nameInput.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		press(
			m
				.all('[data-testid="maps-unit-elevation"] .actions button')
				.find((b) => (b.textContent ?? '').includes('Save elevation')) as Element
		);
		await m.settle();
		expect(m.one('[data-testid="maps-elevation-report"]').textContent).toContain('Saved 1 of 1');
		expect(nodeIn(data, FIX.drawer2).name).toBe('Deep drawer');
		// The untouched published sibling gained no pending revision at all.
		expect(data.pending.find((p) => p.node_id === FIX.drawer1)).toBeUndefined();
		await m.stop();
	});

	it('says out loud that a published stack has not moved for the public yet', async () => {
		const { m } = openUnit();
		// Whitespace collapsed on the way in: the sentence is wrapped across
		// lines in the source and an editor reflowing it must not redden a
		// claim about what it SAYS.
		const note = (m.one('[data-testid="maps-elevation-publish-note"]').textContent ?? '')
			.replace(/\s+/g, ' ')
			.trim();
		expect(note).toContain('One of these compartments is already public');
		expect(note).toContain('keeps the old elevation until you publish');
		await m.stop();
	});

	it('is absent where there is no unit, with the same selector matching on one', async () => {
		const data: MapsEditorData = mapsEditFixture();
		const room = data.nodes.find((n) => n.id === FIX.machineShop) as MapsNode;
		const m = mountInto(NodeDetail as never, {
			node: room,
			data,
			transports: memoryMapsTransports(data),
			onchanged: async () => {},
			onselectnode: () => {},
			onaddchild: () => {},
			ondeleted: () => {},
			registerForm: () => {}
		});
		// A room has no front elevation: the elevation belongs to the unit
		// whose compartments it stacks.
		expect(m.all('[data-testid="maps-unit-elevation"]')).toHaveLength(0);
		// The positive control is the unit mount above, where it is 1.
		await m.stop();
	});
});
