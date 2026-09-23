/**
 * THE ONE COPY OF THE EDITOR'S READ. The `/maps/edit` server load and the
 * client-side reload after a write both call `loadMapsEditorData`, so what the
 * page opened on and what it refreshes to cannot drift apart (the preview-
 * parity failure, one surface over).
 *
 * ONE LADDER, ON THE NODE READ, AND 0224 IS THE MIGRATION THIS MODULE SAID
 * WOULD ADD IT. Until 0224 this header read "NO LADDER, DELIBERATELY" -- right
 * at the time, because 0161-0165 landed as one wave, all applied before any
 * client shipped, so there was no older schema for a rung to serve -- and it
 * ended "the first migration that widens these tables adds the rung with it".
 * 0224 is that migration and this is that rung.
 *
 * TWO RUNGS, WIDEST FIRST: the node columns WITH `wall_thickness_in` and
 * `default_wall_thickness_in`, then the 0161 set without them. The narrow rung
 * is what a deployment answers between the day this bundle ships and the day
 * Mr. Pina pastes 0224 by hand, which is a real state and not a hypothetical
 * one -- every migration in this repo is applied by hand and separately.
 *
 * THE CAPABILITY REPORTS ITSELF (`thicknessReady`), starting FALSE and turned
 * on only by the wide rung actually succeeding. "Cannot tell" must never
 * render as "no wall": one is a deployment that has not been migrated and the
 * other is a room somebody deliberately left as a drawn line, and a surface
 * that conflated them would offer a thickness field whose value silently went
 * nowhere. The other five reads get no rung of their own, because 0224 widens
 * no table but `maps_nodes` -- a new capability gets its OWN rung, never a
 * fold into an existing one.
 *
 * NO IDENTITY FILTER, per the read-path rule: the caller's own client runs
 * these selects and RLS answers. An admin sees every row; anyone else sees
 * published rows only, and the route's 404 guard has already turned them away
 * before this runs. Filtering and ordering happen here in JS over the small
 * admin payload, not in the query -- `pending` is the only row-level cut
 * (state = 'pending'), and it IS expressed to the database because retained
 * history grows without bound and the editor never reads it.
 */

import type {
	MapsEditorData,
	MapsItem,
	MapsItemType,
	MapsNode,
	MapsPending,
	MapsStock
} from './maps';
import type { MapsPhoto } from './media';

/** The 0161 node set: every rung ends here, and this one works on the oldest supported schema. */
export const MAPS_NODE_COLUMNS =
	'id, parent_id, kind, name, subtype, description, outline, position_x_in, position_y_in, rotation_deg, elevation_order, elevation_h_in, elevation_w_in, status, published_at, created_at, updated_at';

/** The 0224 rung: the 0161 set plus the two wall-thickness columns. */
export const MAPS_NODE_COLUMNS_0224 = `${MAPS_NODE_COLUMNS}, wall_thickness_in, default_wall_thickness_in`;

/**
 * The rungs, widest first. Written as a derivation rather than two literals so
 * a column added to the base set cannot be left out of the wide one -- which
 * is the way two hand-maintained select strings stop agreeing.
 */
export const MAPS_NODE_RUNGS: readonly string[] = [MAPS_NODE_COLUMNS_0224, MAPS_NODE_COLUMNS];

export const MAPS_ITEM_TYPE_COLUMNS =
	'id, name, aliases, tags, category, brand, model, part_number, description, status, published_at, created_at, updated_at';

export const MAPS_ITEM_COLUMNS =
	'id, item_type_id, node_id, name, serial, notes, status, published_at, created_at, updated_at';

export const MAPS_STOCK_COLUMNS =
	'id, item_type_id, node_id, qty, status, published_at, created_at, updated_at';

export const MAPS_PENDING_COLUMNS =
	'id, node_id, item_type_id, item_id, stock_id, snapshot, created_at';

/**
 * 0163's photo rows. No rung of their own: 0163 is part of the 0161-0165 wave
 * this module's header already says landed together, so there is no deployment
 * where `maps_nodes` answers and `maps_photos` does not.
 */
export const MAPS_PHOTO_COLUMNS =
	'id, node_id, item_type_id, item_id, storage_key, caption, sort_order, created_at, updated_at';

/** The slice of a Supabase client this read needs -- server and browser alike. */
export interface MapsReadClient {
	from(table: string): {
		select(columns: string): PromiseLike<{ data: unknown; error: { message: string } | null }> & {
			eq(
				column: string,
				value: unknown
			): PromiseLike<{ data: unknown; error: { message: string } | null }>;
		};
	};
}

/**
 * The node read, down the rungs. Returns the rows AND whether the rung that
 * answered carried the thickness columns, which is the only honest way to tell
 * "this deployment has no 0224" from "nobody has typed a wall thickness".
 *
 * A FAILURE ON THE LAST RUNG IS RE-THROWN, not swallowed into an empty list: a
 * read that genuinely cannot run is a page that says so, and a ladder that
 * bottomed out into `[]` would render the map as empty rather than as broken.
 */
export async function loadMapsNodes(
	supabase: MapsReadClient
): Promise<{ nodes: MapsNode[]; thicknessReady: boolean }> {
	let lastError = 'The map could not be loaded.';
	for (let rung = 0; rung < MAPS_NODE_RUNGS.length; rung += 1) {
		const result = await supabase.from('maps_nodes').select(MAPS_NODE_RUNGS[rung]);
		if (!result.error) {
			return { nodes: (result.data ?? []) as MapsNode[], thicknessReady: rung === 0 };
		}
		lastError = result.error.message;
	}
	throw new Error(lastError);
}

export async function loadMapsEditorData(supabase: MapsReadClient): Promise<MapsEditorData> {
	const [nodes, itemTypes, items, stock, pending, photos] = await Promise.all([
		loadMapsNodes(supabase),
		supabase.from('maps_item_types').select(MAPS_ITEM_TYPE_COLUMNS),
		supabase.from('maps_items').select(MAPS_ITEM_COLUMNS),
		supabase.from('maps_stock').select(MAPS_STOCK_COLUMNS),
		supabase.from('maps_revisions').select(MAPS_PENDING_COLUMNS).eq('state', 'pending'),
		supabase.from('maps_photos').select(MAPS_PHOTO_COLUMNS)
	]);
	for (const result of [itemTypes, items, stock, pending, photos]) {
		if (result.error) throw new Error(result.error.message);
	}
	const byName = (a: { name?: string | null }, b: { name?: string | null }) =>
		(a.name ?? '').localeCompare(b.name ?? '');
	return {
		thicknessReady: nodes.thicknessReady,
		nodes: nodes.nodes.slice().sort(byName),
		itemTypes: ((itemTypes.data ?? []) as MapsItemType[]).slice().sort(byName),
		items: ((items.data ?? []) as MapsItem[]).slice(),
		stock: ((stock.data ?? []) as MapsStock[]).slice(),
		pending: (pending.data ?? []) as MapsPending[],
		photos: (photos.data ?? []) as MapsPhoto[]
	};
}
