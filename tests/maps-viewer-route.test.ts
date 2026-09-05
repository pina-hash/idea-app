/**
 * THE PUBLIC VIEWER'S ROUTE RESOLUTION AND CONTAINMENT CHAIN.
 *
 * WHY THESE AND NOT THE REST OF THE SURFACE. Automated tests here are the
 * exception, for guarantees whose regression would be SILENT (CLAUDE.md).
 * A viewer that renders the wrong room fails visibly the first time anybody
 * looks at it, and that is the browser pass's job. What is silent is the
 * arithmetic underneath: a breadcrumb that quietly drops a level still renders
 * a breadcrumb, a staged route that skips a stage still shows a trail, and a
 * URL whose parameters stopped round-tripping still opens a page. Every one of
 * those looks like a working map to whoever is standing in front of it.
 *
 * NOTHING HERE ASSERTS THE PUBLISHED-ONLY BOUNDARY, deliberately. That is
 * enforced by RLS and is proved against a real Postgres with the real policies
 * in `tests/db/maps-viewer-anonymous.test.ts`. A published-only claim asserted
 * over a hand-built fixture would prove only that the fixture is what it says.
 */

import { describe, expect, it } from 'vitest';
import {
	formatMapsTarget,
	mapsChain,
	mapsContents,
	mapsHasPlan,
	mapsHref,
	mapsKindWord,
	mapsPhotosFor,
	mapsPlanView,
	mapsPositionFrom,
	mapsPublicItemLabel,
	mapsStageHref,
	mapsStageIndex,
	mapsStagedRoute,
	mapsViewerElevation,
	parseMapsTarget,
	type MapsTarget
} from '$lib/maps/viewer/viewer';
import { mapsViewerFixture, VFIX } from '../src/routes/dev/maps-viewer/fixture';

const data = mapsViewerFixture();

describe('the address: a position round-trips through the query string', () => {
	it('reads every parameter the viewer uses, and nothing else', () => {
		const p = mapsPositionFrom(
			new URLSearchParams(`at=${VFIX.drawer1}&item=${VFIX.shopCaliper}&to=item:${VFIX.shopCaliper}&q=caliper&junk=x`)
		);
		expect(p.at).toBe(VFIX.drawer1);
		expect(p.item).toBe(VFIX.shopCaliper);
		expect(p.to).toEqual({ kind: 'item', id: VFIX.shopCaliper });
		expect(p.q).toBe('caliper');
	});

	it('answers a renderable position for an address a person mangled', () => {
		// A public URL is something people retype, truncate and paste into chat
		// clients that eat characters. None of these may throw and none may
		// produce a target the staged route would then half-walk.
		for (const raw of ['', 'to=item', 'to=:abc', 'to=widget:abc', 'to=item:', 'at=&item=']) {
			const p = mapsPositionFrom(new URLSearchParams(raw));
			expect(p.to, raw).toBeNull();
			expect(mapsStagedRoute(data, p.to), raw).toEqual([]);
		}
		// POSITIVE CONTROL: the same parser on a well-formed target.
		expect(parseMapsTarget(`item:${VFIX.shopCaliper}`)).toEqual({
			kind: 'item',
			id: VFIX.shopCaliper
		});
	});

	it('round-trips a target through its string form', () => {
		const target: MapsTarget = { kind: 'stock', id: VFIX.hexStock };
		expect(parseMapsTarget(formatMapsTarget(target))).toEqual(target);
	});

	it('omits every empty parameter rather than writing it blank', () => {
		expect(mapsHref({})).toBe('/maps');
		expect(mapsHref({ at: VFIX.millRoom })).toBe(`/maps?at=${VFIX.millRoom}`);
		// The query is carried through every descent, which is what makes the
		// search bar persistent rather than something a click throws away.
		expect(mapsHref({ at: VFIX.millRoom, q: 'mill' })).toContain('q=mill');
	});
});

describe('the containment chain', () => {
	it('runs root to leaf and includes both ends', () => {
		const chain = mapsChain(data.nodes, VFIX.drawer1);
		expect(chain.map((n) => n.name)).toEqual([
			'IDEA Building',
			'Machine Shop',
			'Tool Chest A',
			'Drawer 1'
		]);
	});

	it('is empty for no position and single for a root', () => {
		expect(mapsChain(data.nodes, null)).toEqual([]);
		expect(mapsChain(data.nodes, VFIX.building).map((n) => n.id)).toEqual([VFIX.building]);
	});

	it('stops at the deepest node it can actually see', () => {
		// An anonymous caller can legitimately hold a published node whose parent
		// is not published: 0161 ties no node's visibility to its parent's. The
		// honest answer is the part of the chain that IS public, never a throw
		// and never a fabricated ancestor.
		const orphaned = data.nodes.map((n) =>
			n.id === VFIX.machineShop ? { ...n, parent_id: 'missing-parent' } : n
		);
		expect(mapsChain(orphaned, VFIX.drawer1).map((n) => n.name)).toEqual([
			'Machine Shop',
			'Tool Chest A',
			'Drawer 1'
		]);
	});

	it('terminates on a cycle the schema would refuse rather than hanging', () => {
		const cyclic = data.nodes.map((n) =>
			n.id === VFIX.building ? { ...n, parent_id: VFIX.machineShop } : n
		);
		const chain = mapsChain(cyclic, VFIX.machineShop);
		expect(chain.length).toBeLessThanOrEqual(cyclic.length);
		expect(new Set(chain.map((n) => n.id)).size).toBe(chain.length);
	});
});

describe('the staged route', () => {
	const target: MapsTarget = { kind: 'item', id: VFIX.shopCaliper };
	const stages = mapsStagedRoute(data, target);

	it('walks one stage per containment link, plus the card', () => {
		// The caliper is in Drawer 1, in Tool Chest A, in the Machine Shop, in
		// the IDEA Building. Spec 6's route: building plan with the room marked,
		// room plan with the unit marked, elevation with the compartment marked,
		// then the item card -- with a directory stage above them all, because
		// somebody arriving from a search has not yet seen that the building
		// exists.
		expect(stages.map((s) => [s.at, s.mark])).toEqual([
			[null, VFIX.building],
			[VFIX.building, VFIX.machineShop],
			[VFIX.machineShop, VFIX.toolChest],
			[VFIX.toolChest, VFIX.drawer1],
			[VFIX.drawer1, VFIX.shopCaliper]
		]);
	});

	it('opens the card on the last stage and on no other', () => {
		expect(stages.filter((s) => s.item !== null)).toHaveLength(1);
		expect(stages[stages.length - 1].item).toBe(VFIX.shopCaliper);
	});

	it('marks nothing on the last stage of a NODE target, because you are in it', () => {
		const nodeStages = mapsStagedRoute(data, { kind: 'node', id: VFIX.millRoom });
		expect(nodeStages.map((s) => [s.at, s.mark])).toEqual([
			[null, VFIX.building],
			[VFIX.building, VFIX.millRoom],
			[VFIX.millRoom, null]
		]);
		expect(nodeStages.every((s) => s.item === null)).toBe(true);
	});

	it('stages a stocked type to its container, with no card', () => {
		const stockStages = mapsStagedRoute(data, { kind: 'stock', id: VFIX.hexStock });
		expect(stockStages[stockStages.length - 1]).toMatchObject({
			at: VFIX.drawer1,
			mark: VFIX.hexStock,
			item: null
		});
	});

	it('returns an EMPTY route for anything it cannot resolve, never a partial one', () => {
		// A half-walk that stops mid-building is indistinguishable from a route
		// that worked, and the caller cannot tell afterwards.
		expect(mapsStagedRoute(data, { kind: 'item', id: 'no-such-item' })).toEqual([]);
		expect(mapsStagedRoute(data, { kind: 'node', id: 'no-such-node' })).toEqual([]);
		expect(mapsStagedRoute(data, null)).toEqual([]);
	});

	it('finds the position on the route, and knows when somebody stepped off it', () => {
		const at = (raw: string) => mapsPositionFrom(new URLSearchParams(raw));
		expect(mapsStageIndex(stages, at(''))).toBe(0);
		expect(mapsStageIndex(stages, at(`at=${VFIX.machineShop}`))).toBe(2);
		expect(mapsStageIndex(stages, at(`at=${VFIX.drawer1}&item=${VFIX.shopCaliper}`))).toBe(4);
		// The Mill Room is nowhere on this route: somebody wandered off it.
		expect(mapsStageIndex(stages, at(`at=${VFIX.millRoom}`))).toBe(-1);
		// And standing in the drawer with the card CLOSED is a different place
		// from standing in it with the card open -- the last stage is the card.
		expect(mapsStageIndex(stages, at(`at=${VFIX.drawer1}`))).toBe(-1);
	});

	it('carries the target and the query into every stage href', () => {
		for (const stage of stages) {
			const href = mapsStageHref(stage, target, 'caliper');
			expect(href).toContain(`to=item%3A${VFIX.shopCaliper}`);
			expect(href).toContain('q=caliper');
		}
		// The last href is the skip-to-the-end address, and it opens the card.
		expect(mapsStageHref(stages[stages.length - 1], target, 'caliper')).toContain(
			`item=${VFIX.shopCaliper}`
		);
	});
});

describe('what a level shows', () => {
	it('lists a container\'s children, items and stock, each in a stable order', () => {
		const shop = mapsContents(data, VFIX.machineShop);
		expect(shop.children.map((n) => n.name)).toEqual(['Bench Cabinet', 'Tool Chest A']);
		expect(shop.stock.map((s) => s.id)).toEqual([VFIX.sawStock]);
		const drawer = mapsContents(data, VFIX.drawer1);
		expect(drawer.items.map((i) => i.id)).toEqual([VFIX.shopCaliper]);
		expect(drawer.stock.map((s) => s.id)).toEqual([VFIX.hexStock]);
	});

	it('names an item by its own name, then by its type', () => {
		const caliper = data.items.find((i) => i.id === VFIX.shopCaliper)!;
		const mill = data.items.find((i) => i.id === VFIX.mill)!;
		expect(mapsPublicItemLabel(caliper, data.itemTypes)).toBe('Dial Caliper');
		expect(mapsPublicItemLabel(mill, data.itemTypes)).toBe('Bridgeport Series I Mill');
		// AND NEVER BLANK. An item whose TYPE is still a draft is public with a
		// type the caller cannot read -- the one case the editor never meets,
		// and the one that would otherwise render a nameless card.
		expect(mapsPublicItemLabel(caliper, [])).toBe('Unnamed');
	});

	it('draws every placed child and LISTS every unplaced one', () => {
		// A map that silently omits a room somebody has not drawn yet is a map
		// that lies by omission, which is the one failure a map cannot have.
		const view = mapsPlanView(data, VFIX.machineShop);
		expect(mapsHasPlan(view)).toBe(true);
		expect(view.shapes.map((s) => s.node.name)).toEqual(['Tool Chest A']);
		expect(view.unplaced.map((n) => n.name)).toEqual(['Bench Cabinet']);
		// Every child is accounted for in exactly one of the two.
		expect(view.shapes.length + view.unplaced.length).toBe(
			mapsContents(data, VFIX.machineShop).children.length
		);
	});

	it('draws a rotated polygon from its real corners, not from its bounding box', () => {
		// Deriving the path from the box would square off every rotated shape
		// and every polygon -- a plan that disagrees with the dimension it is
		// drawn to, which renders perfectly and is wrong.
		const view = mapsPlanView(data, VFIX.building);
		const weldBay = view.shapes.find((s) => s.node.id === VFIX.undrawnRoom);
		expect(weldBay, 'the weld bay is not on the building plan').toBeDefined();
		expect(weldBay!.points).toHaveLength(5);
		const xs = new Set(weldBay!.points.map(([x]) => Math.round(x * 100)));
		const ys = new Set(weldBay!.points.map(([, y]) => Math.round(y * 100)));
		// A rectangle from a box has two distinct x values and two distinct y
		// values. A rotated pentagon has five of each.
		expect(xs.size).toBe(5);
		expect(ys.size).toBe(5);
	});

	it('reports no plan for a container with nothing drawn in it', () => {
		expect(mapsHasPlan(mapsPlanView(data, VFIX.drawer1))).toBe(false);
	});

	it('stacks a unit\'s compartments top first and keeps an unsized one', () => {
		const slots = mapsViewerElevation(data, VFIX.toolChest);
		expect(slots.map((s) => s.name)).toEqual(['Drawer 1', 'Drawer 2', 'Bottom bay']);
		expect(slots.map((s) => s.heightIn)).toEqual([3, 9, null]);
	});

	it('groups photos by owner and orders them as authored', () => {
		const photos = [
			{ id: 'p2', node_id: null, item_type_id: null, item_id: VFIX.shopCaliper, storage_key: 'b.jpg', caption: null, sort_order: 2, created_at: 'T', updated_at: 'T' },
			{ id: 'p1', node_id: null, item_type_id: null, item_id: VFIX.shopCaliper, storage_key: 'a.jpg', caption: null, sort_order: 1, created_at: 'T', updated_at: 'T' },
			{ id: 'p3', node_id: VFIX.millRoom, item_type_id: null, item_id: null, storage_key: 'c.jpg', caption: null, sort_order: 1, created_at: 'T', updated_at: 'T' }
		];
		expect(mapsPhotosFor(photos, 'item', VFIX.shopCaliper).map((p) => p.id)).toEqual(['p1', 'p2']);
		expect(mapsPhotosFor(photos, 'node', VFIX.millRoom).map((p) => p.id)).toEqual(['p3']);
		expect(mapsPhotosFor(photos, 'item_type', VFIX.caliperType)).toEqual([]);
	});

	it('says a compartment\'s own subtype rather than the generic word', () => {
		const drawer = data.nodes.find((n) => n.id === VFIX.drawer1)!;
		const room = data.nodes.find((n) => n.id === VFIX.machineShop)!;
		expect(mapsKindWord(drawer)).toBe('drawer');
		expect(mapsKindWord(room)).toBe('Room');
	});
});
