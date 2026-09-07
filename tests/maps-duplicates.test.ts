// tests/maps-duplicates.test.ts
//
// THE PURE HALF OF THE SURPLUS PANEL (prompt 0098): what makes two containers
// copies, which one is kept, and why a copy may not be offered a Remove
// control. Pinned here because every one of those is a rule whose wrong
// answer is SILENT -- a group that quietly merged two different rooms, a kept
// copy that was not the oldest, a blocked copy offered a control -- and the
// panel that renders them would look perfectly plausible either way.
//
// THE FIXTURE IS THE HARNESS'S OWN (`mapsEditFixtureWithSurplus`), plus rows
// built here for the cases it does not carry: a published copy that is
// younger than a draft (the published one is kept anyway), a group at the
// top level, two drawers that share a name and differ only by slot (NOT
// copies), and thirty rooms -- the number he actually got.

import { describe, expect, it } from 'vitest';
import {
	MAPS_DUPLICATE_GRANT_REFUSAL,
	mapsDuplicateBlockedReason,
	mapsDuplicateGroups,
	mapsDuplicateKey,
	mapsDuplicateTotals,
	mapsOutlineLabel,
	type MapsEditorData,
	type MapsNode
} from '../src/lib/maps/maps';
import { MAPS_ADMIN_CAPS, mapsCaps } from '../src/lib/maps/grants';
import {
	FIX,
	SURPLUS,
	mapsEditFixture,
	mapsEditFixtureWithSurplus
} from '../src/routes/dev/maps-edit/fixture';

const T = Date.parse('2026-09-06T17:00:00Z');
const at = (minutes: number) => new Date(T + minutes * 60_000).toISOString();

function room(id: string, minutes: number, extra: Partial<MapsNode> = {}): MapsNode {
	return {
		id,
		parent_id: FIX.building,
		kind: 'room',
		name: 'IDEA Classroom',
		subtype: null,
		description: null,
		outline: { kind: 'rect', w: 466.25, h: 477.75 },
		position_x_in: null,
		position_y_in: null,
		rotation_deg: null,
		elevation_order: null,
		elevation_h_in: null,
		elevation_w_in: null,
		status: 'draft',
		published_at: null,
		created_at: at(minutes),
		updated_at: at(minutes),
		...extra
	};
}

describe('the harness fixture carries one group with the shape the panel is about', () => {
	const data = mapsEditFixtureWithSurplus();
	const groups = mapsDuplicateGroups(data, MAPS_ADMIN_CAPS);

	it('groups the four rooms, keeps the oldest, and lists the rest oldest first', () => {
		expect(groups).toHaveLength(1);
		const g = groups[0];
		expect(g.name).toBe('IDEA Classroom');
		expect(g.kind).toBe('room');
		expect(g.parentPath).toBe('IDEA Building');
		expect(g.outlineLabel).toBe('466.25 x 477.75 in');
		expect(g.keep.id).toBe(SURPLUS.keep);
		expect(g.surplus.map((c) => c.node.id)).toEqual([...SURPLUS.safe, SURPLUS.blocked]);
	});

	it('offers the two empty copies and blocks the one holding a unit, naming the count', () => {
		const g = groups[0];
		const byId = Object.fromEntries(g.surplus.map((c) => [c.node.id, c.blocked]));
		expect(byId[SURPLUS.safe[0]]).toBeNull();
		expect(byId[SURPLUS.safe[1]]).toBeNull();
		expect(byId[SURPLUS.blocked]).toMatch(/holds 1 container/);
		expect(mapsDuplicateTotals(groups)).toEqual({ groups: 1, surplus: 3, removable: 2, blocked: 1 });
	});

	it('the base fixture has no groups at all (the positive control for "nothing to clean up")', () => {
		expect(mapsDuplicateGroups(mapsEditFixture(), MAPS_ADMIN_CAPS)).toEqual([]);
		expect(mapsDuplicateTotals([])).toEqual({ groups: 0, surplus: 0, removable: 0, blocked: 0 });
	});
});

describe('what makes two containers copies', () => {
	it('the same parent, kind, name and outline', () => {
		const a = room('a', 1);
		expect(mapsDuplicateKey(room('b', 2))).toBe(mapsDuplicateKey(a));
		// Case and whitespace in the name do not make a different room.
		expect(mapsDuplicateKey(room('c', 3, { name: '  idea classroom ' }))).toBe(mapsDuplicateKey(a));
	});

	it('a different parent, kind, name or outline is a different container', () => {
		const a = mapsDuplicateKey(room('a', 1));
		expect(mapsDuplicateKey(room('b', 2, { parent_id: FIX.machineShop }))).not.toBe(a);
		expect(mapsDuplicateKey(room('b', 2, { kind: 'unit' }))).not.toBe(a);
		expect(mapsDuplicateKey(room('b', 2, { name: 'IDEA Classroom 2' }))).not.toBe(a);
		expect(mapsDuplicateKey(room('b', 2, { outline: { kind: 'rect', w: 466.25, h: 400 } }))).not.toBe(a);
		expect(mapsDuplicateKey(room('b', 2, { outline: null }))).not.toBe(a);
	});

	it('two drawers sharing a name in different slots are two drawers, in the same slot they are copies', () => {
		const d1 = room('d1', 1, { kind: 'compartment', parent_id: FIX.toolChest, outline: null, elevation_order: 1 });
		const d2 = room('d2', 2, { kind: 'compartment', parent_id: FIX.toolChest, outline: null, elevation_order: 2 });
		const d3 = room('d3', 3, { kind: 'compartment', parent_id: FIX.toolChest, outline: null, elevation_order: 1 });
		expect(mapsDuplicateKey(d1)).not.toBe(mapsDuplicateKey(d2));
		expect(mapsDuplicateKey(d1)).toBe(mapsDuplicateKey(d3));
	});

	it('a polygon outline is compared corner for corner', () => {
		const p = (points: [number, number][]) => room('p', 1, { outline: { kind: 'polygon', points } });
		expect(mapsDuplicateKey(p([[0, 0], [10, 0], [10, 10]]))).toBe(
			mapsDuplicateKey(p([[0, 0], [10, 0], [10, 10]]))
		);
		expect(mapsDuplicateKey(p([[0, 0], [10, 0], [10, 10]]))).not.toBe(
			mapsDuplicateKey(p([[0, 0], [10, 0], [10, 11]]))
		);
		expect(mapsOutlineLabel({ kind: 'polygon', points: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0.5]] })).toBe(
			'polygon, 5 corners'
		);
		expect(mapsOutlineLabel(null)).toBe('no outline');
	});
});

describe('which copy is kept', () => {
	it('the oldest by created_at, with the id as the tiebreak', () => {
		const data = mapsEditFixture();
		data.nodes.push(room('z-late', 5), room('m-first', 1), room('a-same-minute', 1));
		const [g] = mapsDuplicateGroups(data, MAPS_ADMIN_CAPS);
		expect(g.keep.id).toBe('a-same-minute');
		expect(g.surplus.map((c) => c.node.id)).toEqual(['m-first', 'z-late']);
	});

	it('the published copy, even when a draft is older, and a second published copy is blocked', () => {
		const data = mapsEditFixture();
		data.nodes.push(
			room('older-draft', 1),
			room('public', 3, { status: 'published', published_at: at(3) }),
			room('public-2', 4, { status: 'published', published_at: at(4) })
		);
		const [g] = mapsDuplicateGroups(data, MAPS_ADMIN_CAPS);
		expect(g.keep.id).toBe('public');
		const byId = Object.fromEntries(g.surplus.map((c) => [c.node.id, c.blocked]));
		expect(byId['older-draft']).toBeNull();
		expect(byId['public-2']).toMatch(/on the public map/);
	});
});

describe('why a copy is not offered a Remove control', () => {
	it('holding containers, items or stock, with the real counts', () => {
		const data = mapsEditFixture();
		const holder = room('holder', 2);
		data.nodes.push(room('keep', 1), holder);
		data.nodes.push(room('u1', 3, { kind: 'unit', parent_id: 'holder', name: 'Bench A' }));
		data.nodes.push(room('u2', 3, { kind: 'unit', parent_id: 'holder', name: 'Bench B' }));
		data.items.push({ ...data.items[0], id: 'it-1', node_id: 'holder' });
		data.stock.push({ ...data.stock[0], id: 'st-1', node_id: 'holder' });
		const reason = mapsDuplicateBlockedReason(holder, data, MAPS_ADMIN_CAPS);
		expect(reason).toBe(
			'It holds 2 containers, 1 item, 1 stock row, so it is not offered for removal here. Open it and move or delete what is inside first.'
		);
	});

	it('a copy outside a granted editor\'s scope carries the grant refusal; an admin\'s does not', () => {
		const data = mapsEditFixtureWithSurplus();
		const safe = data.nodes.find((n) => n.id === SURPLUS.safe[0])!;
		// Granted only the tool chest: the surplus rooms sit under the building.
		const granted = mapsCaps(data.nodes, {
			admin: false,
			grants: [{ node_id: FIX.toolChest, granted_at: at(0), note: null }]
		});
		expect(mapsDuplicateBlockedReason(safe, data, granted)).toBe(MAPS_DUPLICATE_GRANT_REFUSAL);
		expect(mapsDuplicateBlockedReason(safe, data, MAPS_ADMIN_CAPS)).toBeNull();
		// The whole group still renders for that editor: listed with the reason, not hidden.
		const groups = mapsDuplicateGroups(data, granted);
		expect(groups).toHaveLength(1);
		expect(mapsDuplicateTotals(groups)).toEqual({ groups: 1, surplus: 3, removable: 0, blocked: 3 });
	});
});

describe('thirty rooms, the number he got', () => {
	it('is one group of one kept and twenty-nine removable copies, and the totals say so', () => {
		const data = mapsEditFixture();
		for (let i = 1; i <= 30; i++) data.nodes.push(room(`dup-${String(i).padStart(2, '0')}`, i));
		const groups = mapsDuplicateGroups(data, MAPS_ADMIN_CAPS);
		expect(groups).toHaveLength(1);
		expect(groups[0].keep.id).toBe('dup-01');
		expect(groups[0].surplus).toHaveLength(29);
		expect(groups[0].surplus.every((c) => c.blocked === null)).toBe(true);
		expect(mapsDuplicateTotals(groups)).toEqual({ groups: 1, surplus: 29, removable: 29, blocked: 0 });
	});
});

describe('groups are ordered largest first, and a lone container is never a group', () => {
	it('two groups of different sizes come out largest first', () => {
		const data: MapsEditorData = mapsEditFixture();
		data.nodes.push(room('a1', 1, { name: 'Alpha' }), room('a2', 2, { name: 'Alpha' }));
		data.nodes.push(room('b1', 1, { name: 'Beta' }), room('b2', 2, { name: 'Beta' }), room('b3', 3, { name: 'Beta' }));
		data.nodes.push(room('solo', 1, { name: 'Solo' }));
		const groups = mapsDuplicateGroups(data, MAPS_ADMIN_CAPS);
		expect(groups.map((g) => g.name)).toEqual(['Beta', 'Alpha']);
	});
});
