/**
 * THE PUBLIC VIEWER'S ARITHMETIC -- spec section 6, and nothing but pure
 * functions, so route resolution, the containment chain and the staged route
 * are all assertable with no browser and no database.
 *
 * WHY THE POSITION IS IN THE URL AND NOT IN COMPONENT STATE. A student who
 * finds something wants to send somebody else to it, and a phone that loses
 * the tab wants to come back to it. Every level of the descent is therefore an
 * address: `/maps?at=<node>` is a container, `?item=<id>` is an item card, and
 * `?to=<kind>:<id>` is the staged route's TARGET. Nothing about where you are
 * lives anywhere but the URL, which is also what makes the browser's own Back
 * button walk the stages backwards for free.
 *
 * THE STAGED ROUTE IS DERIVED FROM THE TARGET, NEVER STORED AS A CURSOR.
 * `?to=` names the thing that was found and `?at=` names the step being shown;
 * `mapsStagedRoute` recomputes the whole ordered walk from the data on every
 * render. A stage INDEX in the URL would be a second statement of where the
 * route goes -- reload it after the map changed and the index points at a
 * different room -- and would not survive a person editing the address. Two
 * parameters that each name a real object cannot drift from each other.
 *
 * PUBLISHED-ONLY IS NOT RE-CHECKED HERE, AND MUST NOT BE. RLS is the boundary
 * (0161/0163: every `maps_*` table answers an anonymous caller with its
 * published rows and nothing else), so what reaches this module is already the
 * public set. A `status === 'published'` filter written here would be a second
 * copy of that rule, in the one place that cannot enforce it -- and the day the
 * two disagreed, the client's copy would be the one nobody tested.
 */

import {
	MAPS_KIND_LABELS,
	mapsElevationStack,
	mapsNodeContent,
	mapsPlacedBox,
	mapsShapeCorners,
	type MapsBox,
	type MapsElevationSlot,
	type MapsItem,
	type MapsItemType,
	type MapsNode,
	type MapsStock
} from '../maps';
import type { MapsPhoto } from '../media';

/**
 * Everything the public map is, read once. The whole published tree is small
 * (spec 8's P1 acceptance artefact is ONE room end to end, and P3's campus is
 * still a building's worth of rows), so the viewer loads it in one server pass
 * and every descent afterwards is local -- which is what makes a phone at a
 * toolbox instant rather than one round trip per level.
 */
export interface MapsViewerData {
	nodes: MapsNode[];
	itemTypes: MapsItemType[];
	items: MapsItem[];
	stock: MapsStock[];
	photos: MapsPhoto[];
}

export const EMPTY_VIEWER_DATA: MapsViewerData = {
	nodes: [],
	itemTypes: [],
	items: [],
	stock: [],
	photos: []
};

/** What a search result names, and what a staged route walks toward. */
export type MapsTargetKind = 'node' | 'item' | 'stock';
export interface MapsTarget {
	kind: MapsTargetKind;
	id: string;
}

/**
 * The viewer's whole position, as it comes out of the query string.
 *
 * `q` IS IN THE URL BECAUSE THE SEARCH BAR IS PERSISTENT (spec 6). A query
 * that lived in component state would be lost by the one navigation the
 * feature is built around -- opening a result -- so the descent would erase
 * the search that produced it.
 */
export interface MapsPosition {
	/** The container being shown. Null is the directory: every root node. */
	at: string | null;
	/** An item card open over the container. */
	item: string | null;
	/** The staged route's target, or null when the descent was walked by hand. */
	to: MapsTarget | null;
	/** The live query. Empty is no search. */
	q: string;
}

const TARGET_KINDS: readonly MapsTargetKind[] = ['node', 'item', 'stock'];

/** `node:<uuid>` etc. Anything else is null -- an address is never trusted. */
export function parseMapsTarget(raw: string | null | undefined): MapsTarget | null {
	if (!raw) return null;
	const at = raw.indexOf(':');
	if (at <= 0) return null;
	const kind = raw.slice(0, at) as MapsTargetKind;
	const id = raw.slice(at + 1);
	if (!TARGET_KINDS.includes(kind) || id === '') return null;
	return { kind, id };
}

export function formatMapsTarget(target: MapsTarget): string {
	return `${target.kind}:${target.id}`;
}

/**
 * The position a URL names. Reads the query string and NOTHING else: an
 * unknown parameter, a malformed target and a missing node all resolve to a
 * position the viewer can render, because a public address is something people
 * retype and trim.
 */
export function mapsPositionFrom(params: URLSearchParams): MapsPosition {
	return {
		at: params.get('at') || null,
		item: params.get('item') || null,
		to: parseMapsTarget(params.get('to')),
		q: (params.get('q') ?? '').slice(0, 200)
	};
}

/** The query string for a position, with every empty parameter omitted. */
export function mapsHref(position: Partial<MapsPosition>): string {
	const params = new URLSearchParams();
	if (position.at) params.set('at', position.at);
	if (position.item) params.set('item', position.item);
	if (position.to) params.set('to', formatMapsTarget(position.to));
	if (position.q) params.set('q', position.q);
	const qs = params.toString();
	return qs ? `/maps?${qs}` : '/maps';
}

// ---------------------------------------------------------------------------
// The containment chain -- the breadcrumb, and the spine every stage walks.
// ---------------------------------------------------------------------------

/**
 * Root to leaf, inclusive. A node whose parent is missing from the data ends
 * the walk there rather than throwing: an anonymous caller CAN legitimately
 * hold a published node under an unpublished parent (0161 has no policy tying
 * the two), and the honest answer is the part of the chain that is public.
 *
 * The visited set is not defensiveness about a cycle that cannot happen -- the
 * schema's own trigger refuses one -- it is what stops a corrupt payload
 * hanging the render on a phone.
 */
export function mapsChain(nodes: MapsNode[], nodeId: string | null): MapsNode[] {
	if (!nodeId) return [];
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const chain: MapsNode[] = [];
	const seen = new Set<string>();
	let cursor: string | null = nodeId;
	while (cursor && !seen.has(cursor)) {
		seen.add(cursor);
		const node: MapsNode | undefined = byId.get(cursor);
		if (!node) break;
		chain.push(node);
		cursor = node.parent_id;
	}
	return chain.reverse();
}

/** The children of a container, ordered by name so two renders agree. */
export function mapsChildren(nodes: MapsNode[], parentId: string | null): MapsNode[] {
	return nodes
		.filter((n) => n.parent_id === parentId)
		.slice()
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** The node a target lives in: itself for a node, its container otherwise. */
export function mapsTargetNodeId(data: MapsViewerData, target: MapsTarget): string | null {
	if (target.kind === 'node') {
		return data.nodes.some((n) => n.id === target.id) ? target.id : null;
	}
	if (target.kind === 'item') {
		return data.items.find((i) => i.id === target.id)?.node_id ?? null;
	}
	return data.stock.find((s) => s.id === target.id)?.node_id ?? null;
}

// ---------------------------------------------------------------------------
// The staged route -- spec 6's "building plan with the room highlighted, room
// plan with the unit highlighted, elevation with the compartment highlighted,
// then the item card".
// ---------------------------------------------------------------------------

export interface MapsStage {
	/** The container this stage shows. Null is the directory. */
	at: string | null;
	/** The child (or item) this stage marks in gold. Null on the last node stage. */
	mark: string | null;
	/** Set on the final stage of an item or stock target: the card to open. */
	item: string | null;
	/**
	 * What the person is being shown, in their own words. It is a full sentence
	 * fragment rather than a node name, because the point of staging is that
	 * somebody learns the building -- "Machine Shop, inside IDEA Building" is
	 * the teaching and "Machine Shop" is a label.
	 */
	label: string;
}

/**
 * The ordered walk from the top of the map down to the found thing.
 *
 * ONE STAGE PER CONTAINMENT LINK, PLUS THE CARD. Every stage but the last
 * shows a container with the NEXT link marked; the last shows the container
 * the thing is actually in, with the thing itself marked. So a person watches
 * the map narrow rather than arriving at an answer with no idea how they got
 * there -- which is the difference spec 6 is asking for and the reason this is
 * not a redirect to the item.
 *
 * An unresolvable target returns an EMPTY route, never a partial one. A
 * half-walk that stops in the middle of a building is indistinguishable from
 * a route that worked, and the caller cannot tell it apart afterwards.
 */
export function mapsStagedRoute(data: MapsViewerData, target: MapsTarget | null): MapsStage[] {
	if (!target) return [];
	const nodeId = mapsTargetNodeId(data, target);
	if (!nodeId) return [];
	const chain = mapsChain(data.nodes, nodeId);
	if (chain.length === 0) return [];

	const stages: MapsStage[] = [];
	// The directory stage: the whole map, with the root this thing is under
	// marked. It is the first thing a person sees and it is what says the
	// building exists at all.
	stages.push({
		at: null,
		mark: chain[0].id,
		item: null,
		label: `${chain[0].name}, on the map`
	});
	for (let i = 0; i < chain.length - 1; i += 1) {
		stages.push({
			at: chain[i].id,
			mark: chain[i + 1].id,
			item: null,
			label: `${chain[i + 1].name}, inside ${chain[i].name}`
		});
	}
	const leaf = chain[chain.length - 1];
	if (target.kind === 'node') {
		stages.push({ at: leaf.id, mark: null, item: null, label: `Inside ${leaf.name}` });
	} else {
		stages.push({
			at: leaf.id,
			mark: target.id,
			item: target.kind === 'item' ? target.id : null,
			label: `In ${leaf.name}`
		});
	}
	return stages;
}

/**
 * Which stage a position is standing on, or -1 when it is off the route.
 *
 * KEYED ON THE POSITION RATHER THAN ON A COUNTER, which is what lets somebody
 * step OFF the staged route (tap a different room) and have the surface notice
 * -- the route is still in the URL, so the trail stays offered, but the "next"
 * control stops claiming to advance a walk the person has already left.
 */
export function mapsStageIndex(stages: MapsStage[], position: MapsPosition): number {
	return stages.findIndex(
		(s) => s.at === position.at && (s.item ?? null) === (position.item ?? null)
	);
}

/** The href for one stage, carrying the target and the query forward. */
export function mapsStageHref(
	stage: MapsStage,
	target: MapsTarget | null,
	q: string
): string {
	return mapsHref({ at: stage.at, item: stage.item, to: target, q });
}

// ---------------------------------------------------------------------------
// What a container holds.
// ---------------------------------------------------------------------------

export interface MapsContents {
	/** Child containers, name-ordered. */
	children: MapsNode[];
	/** Unique items directly in this container. */
	items: MapsItem[];
	/** Stocked types placed in this container. */
	stock: MapsStock[];
}

export function mapsContents(data: MapsViewerData, nodeId: string | null): MapsContents {
	return {
		children: mapsChildren(data.nodes, nodeId),
		items: nodeId
			? data.items
					.filter((i) => i.node_id === nodeId)
					.slice()
					.sort((a, b) =>
						mapsPublicItemLabel(a, data.itemTypes).localeCompare(
							mapsPublicItemLabel(b, data.itemTypes)
						)
					)
			: [],
		stock: nodeId
			? data.stock
					.filter((s) => s.node_id === nodeId)
					.slice()
					.sort((a, b) =>
						mapsTypeName(a.item_type_id, data.itemTypes).localeCompare(
							mapsTypeName(b.item_type_id, data.itemTypes)
						)
					)
			: []
	};
}

/** An item type's name, or a placeholder for one whose type is not public. */
export function mapsTypeName(typeId: string | null, itemTypes: MapsItemType[]): string {
	if (!typeId) return '';
	return itemTypes.find((t) => t.id === typeId)?.name ?? 'Unnamed';
}

/**
 * What an item is CALLED on a public surface.
 *
 * `mapsItemLabel` in `maps.ts` is the editor's spelling and answers the same
 * question, so this delegates to it rather than restating the own-name-then-
 * type-name rule. What it adds is the one case the editor never meets: an item
 * whose TYPE is still a draft. The item row is public and the type row is not,
 * so `mapsItemLabel` would return an empty string and the card would render
 * nameless. "Unnamed" is what an anonymous caller can honestly be told.
 */
export function mapsPublicItemLabel(item: MapsItem, itemTypes: MapsItemType[]): string {
	if (item.name) return item.name;
	const typed = mapsTypeName(item.item_type_id, itemTypes);
	return typed || 'Unnamed';
}

/** The photos attached to one owner, in their authored order. */
export function mapsPhotosFor(
	photos: MapsPhoto[],
	owner: 'node' | 'item_type' | 'item',
	ownerId: string
): MapsPhoto[] {
	const column = owner === 'node' ? 'node_id' : owner === 'item_type' ? 'item_type_id' : 'item_id';
	return photos
		.filter((p) => p[column] === ownerId)
		.slice()
		.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

// ---------------------------------------------------------------------------
// Plan geometry -- what a container's plan drawing needs, in one shape.
// ---------------------------------------------------------------------------

export interface MapsPlanShape {
	node: MapsNode;
	box: MapsBox;
	/** The outline's own corner path in the PARENT frame, for a polygon. */
	points: [number, number][];
}

export interface MapsPlanView {
	/** The container's own extent, which is the drawing's frame. */
	frame: MapsBox;
	shapes: MapsPlanShape[];
	/** Children with no plan geometry: real containers the drawing cannot place. */
	unplaced: MapsNode[];
}

/**
 * The plan of one container: every placed child in the container's own frame,
 * plus the children that have no geometry.
 *
 * AN UNPLACED CHILD IS LISTED, NEVER DROPPED. A room somebody created and has
 * not drawn yet is still a room with things in it, and a viewer that silently
 * omitted it would be a map that lies by omission -- the one failure mode a
 * map cannot have. The editor's elevation stack makes the same call about a
 * compartment with no slot, for the same reason.
 *
 * THE FRAME COMES FROM THE CONTAINER'S OWN OUTLINE WHERE IT HAS ONE, and from
 * the union of what it holds where it does not. A drawing scaled to its
 * contents is still a true drawing; a drawing scaled to a frame of zero is a
 * blank pane, which reads as a broken page rather than as an undrawn room.
 */
export function mapsPlanView(data: MapsViewerData, nodeId: string | null): MapsPlanView {
	const node = nodeId ? (data.nodes.find((n) => n.id === nodeId) ?? null) : null;
	const children = mapsChildren(data.nodes, nodeId);
	const shapes: MapsPlanShape[] = [];
	const unplaced: MapsNode[] = [];
	for (const child of children) {
		const content = mapsNodeContent(child);
		const box = mapsPlacedBox(content);
		if (!box || !content.outline) {
			unplaced.push(child);
			continue;
		}
		const x = content.position_x_in ?? 0;
		const y = content.position_y_in ?? 0;
		// THE CORNERS COME FROM `mapsShapeCorners`, WHICH IS ALSO WHAT THE
		// FOOTPRINT IS MEASURED FROM. Deriving the drawn path from the box
		// instead would silently square off every rotated shape and every
		// polygon -- a plan that disagrees with the dimension it is drawn to.
		const points = mapsShapeCorners(content.outline, content.rotation_deg).map(
			([px, py]) => [px + x, py + y] as [number, number]
		);
		shapes.push({ node: child, box, points });
	}

	let frame: MapsBox | null = null;
	if (node) {
		const own = mapsNodeContent(node);
		if (own.outline) {
			// The container's own outline sits at ITS origin, which is the frame's.
			const corners = own.outline.kind === 'rect'
				? [
						[0, 0],
						[own.outline.w, 0],
						[own.outline.w, own.outline.h],
						[0, own.outline.h]
					]
				: own.outline.points;
			frame = corners.reduce<MapsBox>(
				(acc, [cx, cy]) => ({
					minX: Math.min(acc.minX, cx),
					minY: Math.min(acc.minY, cy),
					maxX: Math.max(acc.maxX, cx),
					maxY: Math.max(acc.maxY, cy)
				}),
				{ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
			);
		}
	}
	if (!frame || !Number.isFinite(frame.minX) || frame.maxX <= frame.minX) {
		frame = shapes.reduce<MapsBox | null>((acc, s) => {
			if (!acc) return { ...s.box };
			return {
				minX: Math.min(acc.minX, s.box.minX),
				minY: Math.min(acc.minY, s.box.minY),
				maxX: Math.max(acc.maxX, s.box.maxX),
				maxY: Math.max(acc.maxY, s.box.maxY)
			};
		}, null);
	}
	return {
		frame: frame ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 },
		shapes,
		unplaced
	};
}

/** True when a container has a plan drawing worth rendering. */
export function mapsHasPlan(view: MapsPlanView): boolean {
	return view.shapes.length > 0 && view.frame.maxX > view.frame.minX && view.frame.maxY > view.frame.minY;
}

/**
 * The elevation of a unit -- the editor's own stack, read on a surface that
 * cannot edit. `mapsElevationStack` takes the editor's data shape because it
 * is pending-aware; the public map has no pending revisions to be aware of
 * (they are `maps_revisions` rows, which carry no anon grant at all), so it is
 * handed an empty pending list rather than being reimplemented here.
 */
export function mapsViewerElevation(data: MapsViewerData, unitId: string): MapsElevationSlot[] {
	return mapsElevationStack(
		{ nodes: data.nodes, itemTypes: [], items: [], stock: [], pending: [], photos: [] },
		unitId
	);
}

/** "Room", "Toolbox drawer", ... -- the word for a container, for a reader. */
export function mapsKindWord(node: MapsNode): string {
	if (node.kind === 'compartment' && node.subtype) return node.subtype;
	return MAPS_KIND_LABELS[node.kind];
}
