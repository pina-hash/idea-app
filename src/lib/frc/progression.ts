/**
 * FRC Training progression: the client-side seam onto the `frc_user_progress`
 * table (0039_frc_user_progress.sql). The pure unlock + rank logic lives in the
 * registry (track.ts); this module reads completion rows directly and writes
 * them only through the SECURITY DEFINER RPCs added in
 * 0041_frc_progress_lockdown.sql.
 *
 * Direct client writes to `frc_user_progress` are revoked entirely (0041): a
 * student has no write path of their own. `markUnitComplete` / `clearUnitComplete`
 * are thin callers of `frc_mark_complete` / `frc_unmark_complete`, which the RPC
 * itself restricts to teachers (the dashboard override calls these). The quiz
 * gate's completion write is a SEPARATE path: `frc_quiz_grade` records it inline
 * on a genuine pass, scoped to the caller's own `auth.uid()`, so this module is
 * never involved in that flow. Everything fails soft if a migration is
 * unapplied (missing table/function -> empty progress or a surfaced RPC
 * error), the same way the pathway migration degrades.
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
 * Teacher override seam: mark that `userId` completed `unitId`. Calls the
 * `frc_mark_complete` SECURITY DEFINER RPC (0041), which itself requires the
 * CALLER to be a teacher regardless of whose `userId` is passed in — so this
 * function only succeeds when invoked by a signed-in teacher. It is NOT the
 * quiz-pass seam: a genuine quiz pass records completion inline inside
 * `frc_quiz_grade`, never through this function.
 */
export async function markUnitComplete(
	supabase: SupabaseClient,
	userId: string,
	unitId: string
): Promise<{ error: string | null }> {
	const { data, error } = await supabase.rpc('frc_mark_complete', {
		p_user_id: userId,
		p_unit_id: unitId
	});
	if (error) return { error: error.message };
	return { error: (data as { error?: string } | null)?.error ?? null };
}

/**
 * Teacher override seam: unmark a recorded completion. Calls the
 * `frc_unmark_complete` SECURITY DEFINER RPC (0041), which likewise requires
 * the caller to be a teacher. This is the mentor correction path paired with
 * markUnitComplete in the dashboard.
 */
export async function clearUnitComplete(
	supabase: SupabaseClient,
	userId: string,
	unitId: string
): Promise<{ error: string | null }> {
	const { data, error } = await supabase.rpc('frc_unmark_complete', {
		p_user_id: userId,
		p_unit_id: unitId
	});
	if (error) return { error: error.message };
	return { error: (data as { error?: string } | null)?.error ?? null };
}
