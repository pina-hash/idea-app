import type { SupabaseClient } from '@supabase/supabase-js';
import { isAdmin } from '$lib/server/admin';

/**
 * Who may reach the notebook's SECTION REVIEW surface.
 *
 * There are two staff tiers in 0069 and this reuses both rather than
 * inventing a third:
 *
 *   * INSTRUCTOR -- has a notebook_sections row naming them as instructor_id.
 *     This is the notebook's own idea of staff, and it is exactly what
 *     `notebook_is_section_instructor()` asks inside every RLS policy and
 *     RPC. The read below is the same question from the app side:
 *     notebook_sections is readable by any signed-in user (0069), so no new
 *     RPC or grant is needed to ask it.
 *   * CHAIR -- the 0067 ADMIN tier, via the one server helper `isAdmin()`.
 *     Note the naming trap documented in CLAUDE.md: `role === 'teacher'` is
 *     NOT an admin check and is deliberately not used here.
 *
 * Like every other guard in this repo this is CONVENIENCE -- the real
 * boundary is the RLS policies and the SECURITY DEFINER RPCs, which a
 * request cannot talk its way past. What it buys is that a student never
 * lands on a page whose every query would return nothing.
 *
 * Fails CLOSED: any error answers false.
 */
export interface NotebookAccess {
	isInstructor: boolean;
	isChair: boolean;
	/** Either tier: the "Section review" link renders for this. */
	canReview: boolean;
}

export async function notebookAccess(
	supabase: SupabaseClient,
	userId: string
): Promise<NotebookAccess> {
	const [{ data: taught, error }, chair] = await Promise.all([
		supabase.from('notebook_sections').select('id').eq('instructor_id', userId).limit(1),
		isAdmin(supabase, userId)
	]);

	const isInstructor = !error && (taught?.length ?? 0) > 0;
	return { isInstructor, isChair: chair, canReview: isInstructor || chair };
}
