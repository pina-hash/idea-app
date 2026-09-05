/**
 * Fixture data and an in-memory search transport for the PUBLIC maps viewer
 * harness.
 *
 * IT CONTAINS ONLY PUBLISHED ROWS, AND THAT IS THE FIXTURE'S CENTRAL CLAIM.
 * The viewer's payload comes off an anonymous client, where 0161's and 0163's
 * `status = 'published'` policies have already decided what exists -- so a
 * fixture carrying drafts would model a world the surface can never be in and
 * would quietly turn the harness into a test of a filter the viewer must not
 * have. The DRAFT-invisibility claim is proved where it is actually enforced,
 * in `tests/db/maps-viewer-anonymous.test.ts`, against a real Postgres with the
 * real policies applied.
 *
 * THE SEARCH TRANSPORT MIRRORS THE PAYLOAD SHAPE `maps_search` RETURNS,
 * containment chain and all (0162's `_maps_chain_link`), because the staged
 * route is built from that chain and a harness that returned bare rows would
 * drive a route the real one cannot produce. What it does NOT mirror is 0165's
 * ranking -- that is asserted against the real function in
 * `tests/maps-search-corpus.test.ts`, and a second, worse ranker here would be
 * a second implementation of the thing this repo is most careful about.
 */

import type { MapsItem, MapsItemType, MapsNode, MapsStock } from '$lib/maps/maps';
import type { MapsPhoto } from '$lib/maps/media';
import type { MapsSearchRow, MapsViewerTransports } from '$lib/maps/transports';
import type { MapsViewerData } from '$lib/maps/viewer/viewer';

const T = '2026-08-20T12:00:00Z';

/** Stable ids the route specs and the render tests reference by name. */
export const VFIX = {
	building: 'b0000000-0000-4000-8000-000000000001',
	machineShop: 'b0000000-0000-4000-8000-000000000002',
	millRoom: 'b0000000-0000-4000-8000-000000000003',
	toolChest: 'b0000000-0000-4000-8000-000000000004',
	drawer1: 'b0000000-0000-4000-8000-000000000005',
	drawer2: 'b0000000-0000-4000-8000-000000000006',
	drawer3: 'b0000000-0000-4000-8000-000000000007',
	benchCabinet: 'b0000000-0000-4000-8000-000000000008',
	undrawnRoom: 'b0000000-0000-4000-8000-000000000009',
	partsCabinet: 'b0000000-0000-4000-8000-000000000010',
	hexKeyType: 'c0000000-0000-4000-8000-000000000001',
	caliperType: 'c0000000-0000-4000-8000-000000000002',
	sawType: 'c0000000-0000-4000-8000-000000000003',
	shopCaliper: 'd0000000-0000-4000-8000-000000000001',
	mill: 'd0000000-0000-4000-8000-000000000002',
	hexStock: 'e0000000-0000-4000-8000-000000000001',
	sawStock: 'e0000000-0000-4000-8000-000000000002'
} as const;

const node = (
	id: string,
	kind: MapsNode['kind'],
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

const type = (id: string, name: string, extra: Partial<MapsItemType> = {}): MapsItemType => ({
	id,
	name,
	aliases: [],
	tags: [],
	category: null,
	brand: null,
	model: null,
	part_number: null,
	description: null,
	status: 'published',
	published_at: T,
	created_at: T,
	updated_at: T,
	...extra
});

export function mapsViewerFixture(): MapsViewerData {
	const nodes: MapsNode[] = [
		node(VFIX.building, 'building', 'IDEA Building', null, {
			outline: { kind: 'rect', w: 1200, h: 800 },
			description: 'The main Bosco Tech IDEA building.'
		}),
		node(VFIX.machineShop, 'room', 'Machine Shop', VFIX.building, {
			outline: { kind: 'rect', w: 400, h: 300 },
			position_x_in: 40,
			position_y_in: 40
		}),
		node(VFIX.millRoom, 'room', 'Mill Room', VFIX.building, {
			outline: { kind: 'rect', w: 300, h: 300 },
			position_x_in: 520,
			position_y_in: 40
		}),
		// A ROTATED, NON-RECTANGULAR ROOM: the plan drawing derives its path from
		// `mapsShapeCorners`, so a shape that is neither axis-aligned nor a
		// rectangle is what proves it is not squaring everything off the box.
		node(VFIX.undrawnRoom, 'room', 'Weld Bay', VFIX.building, {
			outline: { kind: 'polygon', points: [[0, 0], [240, 0], [240, 160], [120, 220], [0, 160]] },
			position_x_in: 40,
			position_y_in: 420,
			rotation_deg: 12
		}),
		node(VFIX.toolChest, 'unit', 'Tool Chest A', VFIX.machineShop, {
			outline: { kind: 'rect', w: 30, h: 18 },
			position_x_in: 12,
			position_y_in: 12
		}),
		// THE UNIT WITH NO PLAN GEOMETRY: `mapsPlanView` must list it rather than
		// drop it, which is the "a map cannot lie by omission" case.
		node(VFIX.benchCabinet, 'unit', 'Bench Cabinet', VFIX.machineShop),
		node(VFIX.drawer1, 'compartment', 'Drawer 1', VFIX.toolChest, {
			subtype: 'drawer',
			elevation_order: 1,
			elevation_h_in: 3,
			elevation_w_in: 28
		}),
		node(VFIX.drawer2, 'compartment', 'Drawer 2', VFIX.toolChest, {
			subtype: 'drawer',
			elevation_order: 2,
			elevation_h_in: 9,
			elevation_w_in: 28
		}),
		// A COMPARTMENT WITH NO TYPED HEIGHT: the elevation says so rather than
		// inventing one, and still gives it a 44px row.
		node(VFIX.drawer3, 'compartment', 'Bottom bay', VFIX.toolChest, {
			subtype: 'bay',
			elevation_order: 3
		}),
		// THE STACK WHERE PROPORTION AND THE TAP FLOOR ACTUALLY CONFLICT, which
		// is the only place the elevation's central compromise can be measured.
		// Ten 1.5in bins share a 420px drawing at 42px each -- under the floor --
		// so every one of them is pushed to 44px and the proportion is given up
		// exactly where keeping it would produce ten rows nobody can hit. Tool
		// Chest A's own slots are all comfortably above the floor, so without
		// this unit the floor branch would never run.
		node(VFIX.partsCabinet, 'unit', 'Small Parts Cabinet', VFIX.millRoom, {
			outline: { kind: 'rect', w: 24, h: 12 },
			position_x_in: 20,
			position_y_in: 20
		}),
		...Array.from({ length: 10 }, (_, i) =>
			node(
				`b0000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`,
				'compartment',
				`Bin ${i + 1}`,
				VFIX.partsCabinet,
				{ subtype: 'bin', elevation_order: i + 1, elevation_h_in: 1.5, elevation_w_in: 22 }
			)
		)
	];

	const itemTypes: MapsItemType[] = [
		type(VFIX.hexKeyType, 'Hex Key Set', {
			aliases: ['Allen wrenches', 'Allen keys'],
			tags: ['fastening', 'driving'],
			category: 'Hand Tools',
			brand: 'Bondhus',
			model: 'HX-13',
			part_number: 'BD-10937',
			description: 'Ball end hex driver set, inch sizes.'
		}),
		type(VFIX.caliperType, 'Dial Caliper', {
			aliases: ['vernier caliper'],
			tags: ['measuring', 'metrology'],
			category: 'Measurement',
			brand: 'Mitutoyo',
			model: 'CD-6',
			part_number: '505-742'
		}),
		type(VFIX.sawType, 'Horizontal Band Saw', {
			aliases: ['cutoff saw'],
			tags: ['cutting', 'cuts aluminum'],
			category: 'Sawing',
			brand: 'DoAll'
		})
	];

	const items: MapsItem[] = [
		{
			id: VFIX.shopCaliper,
			item_type_id: VFIX.caliperType,
			node_id: VFIX.drawer1,
			name: null,
			serial: 'MIT-505-0099',
			notes: null,
			status: 'published',
			published_at: T,
			created_at: T,
			updated_at: T
		},
		{
			id: VFIX.mill,
			item_type_id: null,
			node_id: VFIX.millRoom,
			name: 'Bridgeport Series I Mill',
			serial: 'BP-1998-4471',
			notes: 'Knee mill with a digital readout.',
			status: 'published',
			published_at: T,
			created_at: T,
			updated_at: T
		}
	];

	const stock: MapsStock[] = [
		{
			id: VFIX.hexStock,
			item_type_id: VFIX.hexKeyType,
			node_id: VFIX.drawer1,
			qty: 6,
			status: 'published',
			published_at: T,
			created_at: T,
			updated_at: T
		},
		{
			id: VFIX.sawStock,
			item_type_id: VFIX.sawType,
			node_id: VFIX.machineShop,
			qty: 1,
			status: 'published',
			published_at: T,
			created_at: T,
			updated_at: T
		}
	];

	const photos: MapsPhoto[] = [];

	return { nodes, itemTypes, items, stock, photos };
}

/** The chain `maps_search` returns for one node id, root to leaf. */
function chainOf(data: MapsViewerData, nodeId: string) {
	const byId = new Map(data.nodes.map((n) => [n.id, n]));
	const out = [];
	let cursor: string | null = nodeId;
	while (cursor) {
		const n: MapsNode | undefined = byId.get(cursor);
		if (!n) break;
		out.push({
			id: n.id,
			kind: n.kind,
			name: n.name,
			subtype: n.subtype,
			outline: n.outline,
			position_x_in: n.position_x_in,
			position_y_in: n.position_y_in,
			rotation_deg: n.rotation_deg,
			elevation_order: n.elevation_order,
			elevation_h_in: n.elevation_h_in,
			elevation_w_in: n.elevation_w_in
		});
		cursor = n.parent_id;
	}
	return out.reverse();
}

/**
 * A deliberately SIMPLE matcher: every indexed string joined and asked whether
 * it contains each typed term. It stands in for reachability, never for rank.
 */
export function memoryMapsViewerTransports(
	data: MapsViewerData,
	sink: { logged: { query: string; count: number }[] } = { logged: [] }
): MapsViewerTransports & { sink: typeof sink } {
	const vocab = (row: MapsSearchRow, extra: string[]) =>
		[row.label, ...extra].join(' ').toLowerCase();

	return {
		sink,
		async search(query, limit = 20) {
			const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
			if (terms.length === 0) return { ok: true, data: [] };
			const rows: MapsSearchRow[] = [];
			const push = (row: MapsSearchRow, extra: string[]) => {
				const hay = vocab(row, extra);
				if (terms.every((t) => hay.includes(t))) rows.push(row);
			};
			for (const n of data.nodes) {
				push(
					{
						result_kind: 'node',
						result_id: n.id,
						item_type_id: null,
						label: n.name,
						detail: { kind: n.kind },
						node_id: n.id,
						chain: chainOf(data, n.id),
						depth: chainOf(data, n.id).length,
						score: 1
					},
					[n.description ?? '', ...chainOf(data, n.id).map((c) => c.name)]
				);
			}
			for (const item of data.items) {
				const t = data.itemTypes.find((x) => x.id === item.item_type_id) ?? null;
				push(
					{
						result_kind: 'item',
						result_id: item.id,
						item_type_id: item.item_type_id,
						label: item.name ?? t?.name ?? 'Unnamed',
						detail: { serial: item.serial },
						node_id: item.node_id,
						chain: chainOf(data, item.node_id),
						depth: chainOf(data, item.node_id).length,
						score: 1
					},
					[
						item.serial ?? '',
						item.notes ?? '',
						t?.name ?? '',
						...(t?.aliases ?? []),
						...(t?.tags ?? []),
						t?.brand ?? '',
						t?.part_number ?? '',
						...chainOf(data, item.node_id).map((c) => c.name)
					]
				);
			}
			for (const row of data.stock) {
				const t = data.itemTypes.find((x) => x.id === row.item_type_id) ?? null;
				push(
					{
						result_kind: 'stock',
						result_id: row.id,
						item_type_id: row.item_type_id,
						label: t?.name ?? 'Unnamed',
						detail: { qty: row.qty },
						node_id: row.node_id,
						chain: chainOf(data, row.node_id),
						depth: chainOf(data, row.node_id).length,
						score: 1
					},
					[
						...(t?.aliases ?? []),
						...(t?.tags ?? []),
						t?.brand ?? '',
						t?.part_number ?? '',
						...chainOf(data, row.node_id).map((c) => c.name)
					]
				);
			}
			return { ok: true, data: rows.slice(0, limit) };
		},
		async log(query, count) {
			sink.logged.push({ query, count });
		}
	};
}
