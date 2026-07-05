/**
 * FRC Training progression: the client-side seam onto the `frc_user_progress`
 * table (0039_frc_user_progress.sql). The pure unlock + rank logic lives in the
 * registry (track.ts); this module only reads and writes completion rows.
 *
 * `markUnitComplete` is the SINGLE completion seam: the interim teacher override
 * calls it today, and the future quiz / GAUNTLET gate engines will call the same
 * function to record a pass. No gate execution is built here. Everything fails
 * soft if the migration is unapplied (missing table -> empty progress), the same
 * way the pathway migration degrades.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const FRC_PROGRESS_TABLE = 'frc_user_progress';

export interface UnitCompletion {
	unit_id: string;
	completed_at: string;
}

/**
 * Load a user's completed unit rows. Fails soft to `[]` if the table is absent
 * (migration unapplied) or the read is blocked, so callers can always build a
 * completed set without special-casing.
 */
export async function loadUserProgress(
	supabase: SupabaseClient,
	userId: string
): Promise<UnitCompletion[]> {
	const { data, error } = await supabase
		.from(FRC_PROGRESS_TABLE)
		.select('unit_id, completed_at')
		.eq('user_id', userId);
	if (error) return [];
	return (data ?? []) as UnitCompletion[];
}

/**
 * Load completions for many users at once (the teacher dashboard override).
 * `ready` is false when the read fails (e.g. migration unapplied), so the UI
 * can show a "not available yet" note instead of a misleading empty roster.
 */
export async function loadProgressForUsers(
	supabase: SupabaseClient,
	userIds: string[]
): Promise<{ ready: boolean; byUser: Record<string, string[]> }> {
	const byUser: Record<string, string[]> = {};
	if (!userIds.length) return { ready: true, byUser };
	const { data, error } = await supabase
		.from(FRC_PROGRESS_TABLE)
		.select('user_id, unit_id')
		.in('user_id', userIds);
	if (error) return { ready: false, byUser };
	for (const row of (data ?? []) as { user_id: string; unit_id: string }[]) {
		(byUser[row.user_id] ??= []).push(row.unit_id);
	}
	return { ready: true, byUser };
}

/**
 * The single completion seam. Records (idempotently) that `userId` completed
 * `unitId`. Used by the teacher override now and by the future gate engines.
 * `ignoreDuplicates` keeps a re-mark a no-op so the original completed_at
 * stands and no UPDATE grant is needed.
 */
export async function markUnitComplete(
	supabase: SupabaseClient,
	userId: string,
	unitId: string
): Promise<{ error: string | null }> {
	const { error } = await supabase
		.from(FRC_PROGRESS_TABLE)
		.upsert({ user_id: userId, unit_id: unitId }, { onConflict: 'user_id,unit_id', ignoreDuplicates: true });
	return { error: error?.message ?? null };
}

/**
 * Teacher override only: clear a recorded completion (unmark). This is NOT a
 * gate seam; it is the mentor correction path paired with markUnitComplete in
 * the dashboard.
 */
export async function clearUnitComplete(
	supabase: SupabaseClient,
	userId: string,
	unitId: string
): Promise<{ error: string | null }> {
	const { error } = await supabase
		.from(FRC_PROGRESS_TABLE)
		.delete()
		.eq('user_id', userId)
		.eq('unit_id', unitId);
	return { error: error?.message ?? null };
}
