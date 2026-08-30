/**
 * THE ONE COPY OF THE EDITOR'S READ. The `/maps/edit` server load and the
 * client-side reload after a write both call `loadMapsEditorData`, so what the
 * page opened on and what it refreshes to cannot drift apart (the preview-
 * parity failure, one surface over).
 *
 * NO LADDER, DELIBERATELY, AND THAT IS A DECISION RATHER THAN AN OMISSION.
 * Select ladders exist for a deployment sitting between two hand-applied
 * migrations; this surface is admin-only and 0161-0165 landed as one wave,
 * all applied before any client shipped, so there is no older schema for a
 * rung to serve. The first migration that widens these tables adds the rung
 * with it.
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

export const MAPS_NODE_COLUMNS =
	'id, parent_id, kind, name, subtype, description, outline, position_x_in, position_y_in, rotation_deg, elevation_order, elevation_h_in, elevation_w_in, status, published_at, created_at, updated_at';

export const MAPS_ITEM_TYPE_COLUMNS =
	'id, name, aliases, tags, category, brand, model, part_number, description, status, published_at, created_at, updated_at';

export const MAPS_ITEM_COLUMNS =
	'id, item_type_id, node_id, name, serial, notes, status, published_at, created_at, updated_at';

export const MAPS_STOCK_COLUMNS =
	'id, item_type_id, node_id, qty, status, published_at, created_at, updated_at';

export const MAPS_PENDING_COLUMNS =
	'id, node_id, item_type_id, item_id, stock_id, snapshot, created_at';

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

export async function loadMapsEditorData(supabase: MapsReadClient): Promise<MapsEditorData> {
	const [nodes, itemTypes, items, stock, pending] = await Promise.all([
		supabase.from('maps_nodes').select(MAPS_NODE_COLUMNS),
		supabase.from('maps_item_types').select(MAPS_ITEM_TYPE_COLUMNS),
		supabase.from('maps_items').select(MAPS_ITEM_COLUMNS),
		supabase.from('maps_stock').select(MAPS_STOCK_COLUMNS),
		supabase.from('maps_revisions').select(MAPS_PENDING_COLUMNS).eq('state', 'pending')
	]);
	for (const result of [nodes, itemTypes, items, stock, pending]) {
		if (result.error) throw new Error(result.error.message);
	}
	const byName = (a: { name?: string | null }, b: { name?: string | null }) =>
		(a.name ?? '').localeCompare(b.name ?? '');
	return {
		nodes: ((nodes.data ?? []) as MapsNode[]).slice().sort(byName),
		itemTypes: ((itemTypes.data ?? []) as MapsItemType[]).slice().sort(byName),
		items: ((items.data ?? []) as MapsItem[]).slice(),
		stock: ((stock.data ?? []) as MapsStock[]).slice(),
		pending: (pending.data ?? []) as MapsPending[]
	};
}
