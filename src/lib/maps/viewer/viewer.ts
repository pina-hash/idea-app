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

// ---------------------------------------------------------------------------
// The map pane -- what is DRAWN for a position, which is not always the
// position's own plan.
// ---------------------------------------------------------------------------

/**
 * What the map pane shows for one level.
 *
 * THE RULE: THE DEEPEST DRAWABLE FRAME AT OR ABOVE THE LEVEL, WITH THE LEVEL
 * MARKED WHEN THE FRAME IS ITS PARENT'S. A room with placed units draws its
 * own plan; a unit with compartments draws its own elevation; a compartment
 * has no drawing of its own and gets its UNIT's elevation with itself marked
 * "here"; a unit nobody has given compartments yet gets its ROOM's plan with
 * itself marked. That is the map behaving the way a person expects a map to:
 * selecting a place never blanks the map, it shows the place on the nearest
 * drawing that can hold it (prompt 0112). Before this rule a compartment level
 * drew nothing at all and the item card sat over an empty pane.
 *
 * `hereId` IS A DIFFERENT STATE FROM `markId`. Gold marks the thing that was
 * FOUND (the staged route's next link); "here" marks the thing that is OPEN.
 * The two coincide on no stage -- the last stage of a node target marks
 * nothing -- and both are drawn with a word beside the colour.
 *
 * THE DIRECTORY IS THE ONE PLACE THE RULE LOOKS DOWN RATHER THAN UP. Root
 * nodes usually carry an outline and no position (a building is drawn, a
 * site is not, spec 4.1), so the directory's own plan is empty. One root is
 * then drawn as ITSELF -- the whole map is that building, and an empty pane
 * at the top of a map is the wrong first impression -- and several roots are
 * laid out side by side at their true sizes with a caption saying their
 * positions are not recorded: honest about size, and honest about placement.
 */
export type MapsDrawing =
	| {
			kind: 'plan';
			/** The container whose plan this is. Null is the site (every root). */
			frame: MapsNode | null;
			view: MapsPlanView;
			hereId: string | null;
			/** True when the shapes were laid out by this module, not by an author. */
			synthetic: boolean;
	  }
	| { kind: 'elevation'; unit: MapsNode; slots: MapsElevationSlot[]; hereId: string | null }
	| { kind: 'none' };

export function mapsDrawing(data: MapsViewerData, at: string | null): MapsDrawing {
	const byId = new Map(data.nodes.map((n) => [n.id, n]));
	let hereId: string | null = null;
	let cursor: string | null = at && byId.has(at) ? at : null;
	const seen = new Set<string>();
	for (;;) {
		const node = cursor ? (byId.get(cursor) ?? null) : null;
		if (node?.kind === 'unit') {
			const slots = mapsViewerElevation(data, node.id);
			if (slots.length > 0) return { kind: 'elevation', unit: node, slots, hereId };
		}
		const view = mapsPlanView(data, cursor);
		if (mapsHasPlan(view)) return { kind: 'plan', frame: node, view, hereId, synthetic: false };
		if (!node || !cursor) break;
		if (seen.has(cursor)) break;
		seen.add(cursor);
		hereId = cursor;
		cursor = node.parent_id;
	}
	// The top of the map, and nothing above it drew: look down once.
	const roots = mapsChildren(data.nodes, null);
	if (roots.length === 1) {
		const own = mapsPlanView(data, roots[0].id);
		if (mapsHasPlan(own)) return { kind: 'plan', frame: roots[0], view: own, hereId, synthetic: false };
	}
	const site = mapsSitePlanView(data);
	if (mapsHasPlan(site)) return { kind: 'plan', frame: null, view: site, hereId, synthetic: true };
	return { kind: 'none' };
}

/**
 * Every root with an outline, in a row, at its true size. Used only when the
 * roots carry no positions of their own; the gap between them is a tenth of
 * the widest, which is enough to read them as separate and little enough that
 * the frame is still mostly building.
 */
export function mapsSitePlanView(data: MapsViewerData): MapsPlanView {
	const roots = mapsChildren(data.nodes, null);
	const drawable = roots.filter((r) => mapsNodeContent(r).outline);
	const unplaced = roots.filter((r) => !mapsNodeContent(r).outline);
	const shapes: MapsPlanShape[] = [];
	let x = 0;
	let widest = 0;
	const sized = drawable.map((root) => {
		const content = mapsNodeContent(root);
		const corners = mapsShapeCorners(content.outline!, content.rotation_deg);
		const minX = Math.min(...corners.map(([px]) => px));
		const minY = Math.min(...corners.map(([, py]) => py));
		const maxX = Math.max(...corners.map(([px]) => px));
		widest = Math.max(widest, maxX - minX);
		return { root, corners, minX, minY };
	});
	const gap = widest * 0.1;
	for (const { root, corners, minX, minY } of sized) {
		const points = corners.map(([px, py]) => [px - minX + x, py - minY] as [number, number]);
		const box = points.reduce<MapsBox>(
			(acc, [px, py]) => ({
				minX: Math.min(acc.minX, px),
				minY: Math.min(acc.minY, py),
				maxX: Math.max(acc.maxX, px),
				maxY: Math.max(acc.maxY, py)
			}),
			{ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
		);
		shapes.push({ node: root, box, points });
		x = box.maxX + gap;
	}
	const frame = shapes.reduce<MapsBox | null>((acc, s) => {
		if (!acc) return { ...s.box };
		return {
			minX: Math.min(acc.minX, s.box.minX),
			minY: Math.min(acc.minY, s.box.minY),
			maxX: Math.max(acc.maxX, s.box.maxX),
			maxY: Math.max(acc.maxY, s.box.maxY)
		};
	}, null);
	return { frame: frame ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 }, shapes, unplaced };
}

// ---------------------------------------------------------------------------
// Zoom and pan -- the viewBox arithmetic, kept pure so it is assertable.
// ---------------------------------------------------------------------------

export interface MapsViewBox {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** The furthest in a plan zooms. Eight is a 30in chest filling a 400in room's pane. */
export const MAPS_ZOOM_MAX = 8;
/** One button press, one wheel notch's worth. */
export const MAPS_ZOOM_STEP = 1.5;

export function mapsClampZoom(zoom: number): number {
	if (!Number.isFinite(zoom)) return 1;
	return Math.min(MAPS_ZOOM_MAX, Math.max(1, zoom));
}

/**
 * The viewBox for a zoom level centred on a point, CLAMPED so the frame can
 * never be panned out of view: at zoom 1 the box IS the base and the centre is
 * ignored; at any deeper zoom the box slides inside the base and stops at its
 * edges. A map that can be dragged into an empty pane with nothing on it is
 * one a person cannot find their way back from.
 */
export function mapsZoomedBox(base: MapsViewBox, zoom: number, cx: number, cy: number): MapsViewBox {
	const z = mapsClampZoom(zoom);
	const w = base.w / z;
	const h = base.h / z;
	const x = Math.min(base.x + base.w - w, Math.max(base.x, cx - w / 2));
	const y = Math.min(base.y + base.h - h, Math.max(base.y, cy - h / 2));
	return { x, y, w, h };
}

/**
 * Zoom by a factor ABOUT A POINT, keeping that point where it is on screen --
 * which is what a wheel over a plan does in every map anybody has used: the
 * thing under the pointer stays under the pointer and the rest moves. Zooming
 * about the centre instead makes the thing you were looking at slide away.
 */
export function mapsZoomAbout(
	current: { zoom: number; cx: number; cy: number },
	factor: number,
	px: number,
	py: number
): { zoom: number; cx: number; cy: number } {
	const zoom = mapsClampZoom(current.zoom * factor);
	const ratio = current.zoom / zoom;
	return {
		zoom,
		cx: px - (px - current.cx) * ratio,
		cy: py - (py - current.cy) * ratio
	};
}

/**
 * A scale bar for the current rendered scale: the longest round length that
 * fits the bar's room, labelled in feet once it is a whole number of them.
 * Null below one pixel per inch of the shortest candidate, which is a drawing
 * too small to put a bar on.
 */
const SCALE_CANDIDATES_IN = [1, 2, 3, 6, 12, 24, 36, 48, 60, 120, 240, 360, 600, 1200, 2400];
export function mapsScaleBar(
	pxPerIn: number,
	maxPx = 160
): { inches: number; px: number; label: string } | null {
	if (!Number.isFinite(pxPerIn) || pxPerIn <= 0) return null;
	let pick: number | null = null;
	for (const inches of SCALE_CANDIDATES_IN) {
		if (inches * pxPerIn <= maxPx) pick = inches;
	}
	if (pick === null) return null;
	const px = pick * pxPerIn;
	if (px < 8) return null;
	const label = pick >= 12 && pick % 12 === 0 ? `${pick / 12} ft` : `${pick} in`;
	return { inches: pick, px, label };
}
