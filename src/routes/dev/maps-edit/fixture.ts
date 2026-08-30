/**
 * Fixture data and in-memory transports for the maps editor harness -- states
 * a real database cannot show on demand at once: a published tree, drafts at
 * two depths, and a PENDING edit on a node and on an item type (the state the
 * whole draft-and-publish model exists for).
 *
 * `memoryMapsTransports` mirrors the MECHANISMS it stands in for, not only
 * the happy path (a harness missing a guard the real page has makes a passing
 * drive prove nothing): the kind-pair trigger's refusals, delete refused
 * while children or contents remain, publish answering `nothing_pending`, and
 * promote-applies-the-snapshot. The refusal sentences follow 0161's own.
 *
 * Lives beside the dev route rather than in $lib because it is fixture, not
 * shipping code; the render tests import it from here so the surface they
 * assert is the surface the harness drives.
 */

import {
	MAPS_PENDING_COLUMN,
	MAPS_ROOT_KINDS,
	mapsKindPairOk,
	type MapsEditorData,
	type MapsKind,
	type MapsNode,
	type MapsPending,
	type MapsTable
} from '$lib/maps/maps';
import type { MapsResult, MapsTransports } from '$lib/maps/transports';

const T = '2026-08-20T12:00:00Z';

const node = (
	id: string,
	kind: MapsKind,
	name: string,
	parent_id: string | null,
	extra: Partial<MapsNode> = {}
): MapsNode => ({
	id,
	parent_id,
	kind,
	name,
	subtype: null,
	description: null,
	outline: null,
	position_x_in: null,
	position_y_in: null,
	rotation_deg: null,
	elevation_order: null,
	elevation_h_in: null,
	elevation_w_in: null,
	status: 'published',
	published_at: T,
	created_at: T,
	updated_at: T,
	...extra
});

/** Stable ids the route specs and tests reference by name. */
export const FIX = {
	building: 'node-building',
	machineShop: 'node-machine-shop',
	millRoom: 'node-mill-room', // published + PENDING edit
	toolChest: 'node-tool-chest',
	workbench: 'node-workbench-b', // the sibling every snap target test needs
	drawer1: 'node-drawer-1', // compartment: nothing may nest inside
	drawer2: 'node-drawer-2', // draft compartment
	protoLab: 'node-proto-lab', // draft room
	caliperType: 'type-caliper',
	hexKeyType: 'type-hex-keys', // published + PENDING edit
	bladeType: 'type-blade', // draft
	caliperItem: 'item-caliper-3',
	spareItem: 'item-spare', // draft, typeless (own name)
	hexStock: 'stock-hex-drawer-1'
} as const;

export function mapsEditFixture(): MapsEditorData {
	return {
		nodes: [
			node(FIX.building, 'building', 'IDEA Building', null, {
				outline: { kind: 'rect', w: 1200, h: 800 },
				description: 'The main Bosco Tech IDEA building.'
			}),
			node(FIX.machineShop, 'room', 'Machine Shop', FIX.building, {
				outline: { kind: 'rect', w: 400, h: 300 },
				position_x_in: 0,
				position_y_in: 0
			}),
			node(FIX.millRoom, 'room', 'Mill Room', FIX.building, {
				outline: { kind: 'rect', w: 300, h: 300 },
				position_x_in: 400,
				position_y_in: 0,
				description: 'Three mills.'
			}),
			/* POSITIONED SO THE ROTATION LANDS INSIDE THE ROOM. Rotation is about
			   the shape's own position origin, so a 30x18 chest turned 90deg
			   occupies x = position - 18 .. position: at the original x of 12
			   it hung 6in outside the west wall, which drew a shape half off
			   the plan the moment there was a plan to draw it on. 30 is the
			   smallest x that clears the wall exactly (its leading edge lands
			   on 12). */
			node(FIX.toolChest, 'unit', 'Tool Chest A', FIX.machineShop, {
				outline: { kind: 'rect', w: 30, h: 18 },
				position_x_in: 30,
				position_y_in: 12,
				rotation_deg: 90
			}),
			/* A SIBLING WITH A REAL EDGE. Snapping has nothing to snap to in a
			   room holding one object, so the placement checks would have been
			   measuring the walls alone -- which is the case that passes even
			   when sibling snapping is broken. Unrotated on purpose: the
			   rotated chest and the square-on bench together are the two
			   footprint shapes the arithmetic has to get right. */
			node(FIX.workbench, 'unit', 'Workbench B', FIX.machineShop, {
				outline: { kind: 'rect', w: 72, h: 30 },
				position_x_in: 120,
				position_y_in: 12
			}),
			node(FIX.drawer1, 'compartment', 'Drawer 1', FIX.toolChest, {
				subtype: 'drawer',
				elevation_order: 1,
				elevation_h_in: 3,
				elevation_w_in: 28
			}),
			node(FIX.drawer2, 'compartment', 'Drawer 2', FIX.toolChest, {
				subtype: 'drawer',
				elevation_order: 2,
				elevation_h_in: 5,
				elevation_w_in: 28,
				status: 'draft',
				published_at: null
			}),
			node(FIX.protoLab, 'room', 'Prototype Lab', FIX.building, {
				status: 'draft',
				published_at: null
			})
		],
		itemTypes: [
			{
				id: FIX.caliperType,
				name: 'Digital Caliper',
				aliases: ['calipers', 'vernier'],
				tags: ['measuring', 'precision'],
				category: 'Metrology',
				brand: 'Mitutoyo',
				model: '500-196-30',
				part_number: null,
				description: 'Reads to a thousandth of an inch.',
				status: 'published',
				published_at: T,
				created_at: T,
				updated_at: T
			},
			{
				id: FIX.hexKeyType,
				name: 'Hex Key Set',
				aliases: ['allen keys'],
				tags: ['fastening'],
				category: 'Hand tools',
				brand: null,
				model: null,
				part_number: null,
				description: null,
				status: 'published',
				published_at: T,
				created_at: T,
				updated_at: T
			},
			{
				id: FIX.bladeType,
				name: 'Bandsaw Blade',
				aliases: [],
				tags: ['cutting'],
				category: 'Consumables',
				brand: null,
				model: null,
				part_number: 'BS-64.5-14',
				description: null,
				status: 'draft',
				published_at: null,
				created_at: T,
				updated_at: T
			}
		],
		items: [
			{
				id: FIX.caliperItem,
				item_type_id: FIX.caliperType,
				node_id: FIX.drawer1,
				name: null,
				serial: 'MC-0031',
				notes: 'Jaw tips slightly worn.',
				status: 'published',
				published_at: T,
				created_at: T,
				updated_at: T
			},
			{
				id: FIX.spareItem,
				item_type_id: null,
				node_id: FIX.toolChest,
				name: 'Mystery Fixture Plate',
				serial: null,
				notes: null,
				status: 'draft',
				published_at: null,
				created_at: T,
				updated_at: T
			}
		],
		stock: [
			{
				id: FIX.hexStock,
				item_type_id: FIX.hexKeyType,
				node_id: FIX.drawer1,
				qty: 4,
				status: 'published',
				published_at: T,
				created_at: T,
				updated_at: T
			}
		],
		/* 0163's photo rows. Empty here: the editor harness predates photos
		   and asserts nothing about them; the SHELF harness composes this
		   fixture and pushes rows into it as uploads land. */
		photos: [],
		pending: [
			{
				id: 'pending-mill-room',
				node_id: FIX.millRoom,
				item_type_id: null,
				item_id: null,
				stock_id: null,
				snapshot: {
					parent_id: FIX.building,
					kind: 'room',
					name: 'Mill Room',
					subtype: null,
					description: 'Three mills and the new surface grinder.',
					outline: { kind: 'rect', w: 300, h: 300 },
					position_x_in: 400,
					position_y_in: 0,
					rotation_deg: null,
					elevation_order: null,
					elevation_h_in: null,
					elevation_w_in: null
				},
				created_at: T
			},
			{
				id: 'pending-hex-keys',
				node_id: null,
				item_type_id: FIX.hexKeyType,
				item_id: null,
				stock_id: null,
				snapshot: {
					name: 'Hex Key Set',
					aliases: ['allen keys', 'allen wrenches'],
					tags: ['fastening'],
					category: 'Hand tools',
					brand: null,
					model: null,
					part_number: null,
					description: 'Metric and imperial.'
				},
				created_at: T
			}
		]
	};
}

const CONTENT_STAMPS = ['id', 'status', 'published_at', 'created_at', 'updated_at'];

type Row = Record<string, unknown> & {
	id: string;
	status: 'draft' | 'published';
	published_at: string | null;
	updated_at: string;
};

function refusal(message: string): MapsResult<never> {
	return { ok: false, retryable: false, message };
}

/**
 * In-memory MapsTransports over one MapsEditorData, mutated in place. The
 * refusals mirror 0161's real ones so a driven illegal action fails here the
 * way it fails against the database.
 */
export function memoryMapsTransports(state: MapsEditorData): MapsTransports {
	let counter = 0;

	const listFor = (table: MapsTable): Row[] =>
		(table === 'maps_nodes'
			? state.nodes
			: table === 'maps_item_types'
				? state.itemTypes
				: table === 'maps_items'
					? state.items
					: state.stock) as unknown as Row[];

	/** Mirror of `_maps_node_tree_ok` for inserts and updates of maps_nodes. */
	function nodeTreeProblem(values: Record<string, unknown>, selfId: string | null): string | null {
		const kind = values.kind as MapsKind;
		const parentId = (values.parent_id as string | null) ?? null;
		if (parentId === null) {
			if (!MAPS_ROOT_KINDS.includes(kind)) {
				return `A ${kind} needs a parent: only a site, a building or an outdoor zone may sit at the root.`;
			}
		} else {
			const parent = state.nodes.find((n) => n.id === parentId);
			if (!parent) return `Parent node ${parentId} does not exist.`;
			if (!mapsKindPairOk(parent.kind, kind)) {
				return `A ${kind} cannot sit inside a ${parent.kind}. Allowed: building or outdoor zone in a site, room or outdoor zone in a building, unit in a room or outdoor zone, compartment in a unit.`;
			}
		}
		if (selfId) {
			const bad = state.nodes.filter(
				(n) => n.parent_id === selfId && !mapsKindPairOk(kind, n.kind)
			).length;
			if (bad > 0) {
				return `Cannot change this node to a ${kind}: ${bad} child node(s) could not sit inside one. Move or re-kind the children first.`;
			}
		}
		return null;
	}

	function applyContent(row: Row, content: Record<string, unknown>) {
		for (const [key, value] of Object.entries(content)) {
			if (!CONTENT_STAMPS.includes(key)) row[key] = value;
		}
		row.updated_at = new Date().toISOString();
	}

	return {
		async insertRow(table, values) {
			if (table === 'maps_nodes') {
				const problem = nodeTreeProblem(values, null);
				if (problem) return refusal(problem);
			}
			if (table === 'maps_stock') {
				const dup = state.stock.some(
					(s) => s.item_type_id === values.item_type_id && s.node_id === values.node_id
				);
				if (dup) return refusal('duplicate key value violates unique constraint "maps_stock_one_row_per_placement"');
			}
			const id = `fix-new-${++counter}`;
			const now = new Date().toISOString();
			const row = {
				...values,
				id,
				status: 'draft',
				published_at: null,
				created_at: now,
				updated_at: now
			} as unknown as Row;
			listFor(table).push(row);
			return { ok: true, data: { id } };
		},

		async updateRow(table, id, patch) {
			const row = listFor(table).find((r) => r.id === id);
			if (!row) return refusal('That object is no longer there. Reload the editor and try again.');
			if (table === 'maps_nodes') {
				const problem = nodeTreeProblem({ ...row, ...patch }, id);
				if (problem) return refusal(problem);
			}
			applyContent(row, patch);
			return { ok: true, data: null };
		},

		async deleteRow(table, id) {
			if (table === 'maps_nodes') {
				const used =
					state.nodes.some((n) => n.parent_id === id) ||
					state.items.some((i) => i.node_id === id) ||
					state.stock.some((s) => s.node_id === id);
				if (used) return refusal('Something still lives inside this. Move or delete its contents first.');
			}
			if (table === 'maps_item_types') {
				const used =
					state.items.some((i) => i.item_type_id === id) ||
					state.stock.some((s) => s.item_type_id === id);
				if (used) {
					return refusal(
						'This type is still placed or referenced somewhere. Remove its items and stock placements first.'
					);
				}
			}
			const list = listFor(table);
			const index = list.findIndex((r) => r.id === id);
			if (index === -1) return refusal('That object is no longer there. Reload the editor and try again.');
			list.splice(index, 1);
			// The revision cascade.
			const col = MAPS_PENDING_COLUMN[table];
			state.pending = state.pending.filter((p) => p[col] !== id);
			return { ok: true, data: null };
		},

		async stagePending(table, id, snapshot) {
			const col = MAPS_PENDING_COLUMN[table];
			const existing = state.pending.find((p) => p[col] === id);
			if (existing) {
				existing.snapshot = snapshot;
			} else {
				const entry: MapsPending = {
					id: `pending-new-${++counter}`,
					node_id: null,
					item_type_id: null,
					item_id: null,
					stock_id: null,
					snapshot,
					created_at: new Date().toISOString()
				};
				(entry as unknown as Record<string, unknown>)[col] = id;
				state.pending.push(entry);
			}
			return { ok: true, data: null };
		},

		async discardPending(table, id) {
			const col = MAPS_PENDING_COLUMN[table];
			state.pending = state.pending.filter((p) => p[col] !== id);
			return { ok: true, data: null };
		},

		async publish(table, id) {
			const row = listFor(table).find((r) => r.id === id);
			if (!row) {
				return refusal('That object is no longer there. Reload the editor and try again.');
			}
			const col = MAPS_PENDING_COLUMN[table];
			const staged = state.pending.find((p) => p[col] === id);
			if (!staged && row.status === 'published') {
				return refusal('Nothing is waiting to publish on this object.');
			}
			if (staged) {
				if (table === 'maps_nodes') {
					const problem = nodeTreeProblem({ ...row, ...staged.snapshot }, id);
					if (problem) return refusal(problem);
				}
				applyContent(row, staged.snapshot);
				state.pending = state.pending.filter((p) => p !== staged);
			}
			row.status = 'published';
			row.published_at = new Date().toISOString();
			return {
				ok: true,
				data: { ok: true, action: staged ? 'promoted' : 'first_publish', retained_revision: null }
			};
		},

		async reload() {
			return { ok: true, data: structuredClone(state) };
		}
	};
}
