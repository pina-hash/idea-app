/**
 * FSP homepage open-state: the client seam onto the `fsp_item_opens` table
 * (0048_fsp_item_opens.sql). Records that a signed-in student has opened a given
 * FSP section item, so the "opened" progress dots follow them across devices
 * (the cross-device intent behind the tour-state flag in 0045).
 *
 * This is a SELF-write, not a staff cross-user write: a student reads and writes
 * only their own rows through the RLS-scoped select/insert policies, no RPC.
 * Writes are insert-only and first-open-only (ON CONFLICT DO NOTHING), so opening
 * an item again is a silent no-op and nothing is ever overwritten. Everything
 * fails soft (empty set / surfaced-but-ignored error) until the migration is
 * applied, matching the pathway/progression modules.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const FSP_ITEM_OPENS_TABLE = 'fsp_item_opens';

/**
 * Load the set of FSP item ids (assignment slugs) the user has opened. Fails soft
 * to `[]` if the table is absent (migration unapplied) or the read is blocked, so
 * callers can always build an opened-set without special-casing.
 */
export async function loadItemOpens(
	supabase: SupabaseClient,
	userId: string
): Promise<string[]> {
	const { data, error } = await supabase
		.from(FSP_ITEM_OPENS_TABLE)
		.select('item_id')
		.eq('user_id', userId);
	if (error) return [];
	return (data ?? []).map((r: { item_id: string }) => r.item_id);
}

/**
 * Record the first open of an FSP item for a user. Uses INSERT ... ON CONFLICT DO
 * NOTHING (upsert with `ignoreDuplicates`), so it needs only INSERT privilege and
 * a repeat open never rewrites the original `opened_at`. Fire-and-forget: callers
 * trigger this on the OPEN click and let navigation proceed; a failure is
 * surfaced to the caller but never blocks the link.
 */
export async function markItemOpened(
	supabase: SupabaseClient,
	userId: string,
	itemId: string
): Promise<{ error: string | null }> {
	const { error } = await supabase
		.from(FSP_ITEM_OPENS_TABLE)
		.upsert(
			{ user_id: userId, item_id: itemId },
			{ onConflict: 'user_id,item_id', ignoreDuplicates: true }
		);
	if (error) return { error: error.message };
	return { error: null };
}
