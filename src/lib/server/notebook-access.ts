import type { SupabaseClient } from '@supabase/supabase-js';
import { isAdmin } from '$lib/server/admin';

/**
 * Who may reach the notebook's SECTION REVIEW surface.
 *
 * There are two staff tiers and this reuses both rather than inventing a
 * third:
 *
 *   * INSTRUCTOR -- the TEACHER OF RECORD of at least one classroom section
 *     (0082's `classroom_sections.teacher_email`). Since 0094 that is the
 *     notebook's only idea of an instructor: `notebook_sections.instructor_id`
 *     is gone, and every notebook policy and RPC asks
 *     `classroom_manages_section()`, which asks this same question. The read
 *     below is the app-side version of it -- a plain filter on teacher_email,
 *     NOT `select from classroom_sections limit 1`, because that table is
 *     readable by enrolled STUDENTS too (0082's
 *     "classroom sections readable to members") and an unfiltered probe would
 *     hand every student the review link.
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
	/**
	 * The caller's own lowercased email, resolved once here so the review load
	 * can scope its section list without asking again. Empty when unknown.
	 */
	email: string;
}

export async function notebookAccess(
	supabase: SupabaseClient,
	userId: string,
	claimedEmail?: string | null
): Promise<NotebookAccess> {
	// profiles.email is the copy written at signup; the JWT claim is the live
	// one. Either identifies the caller, and classroom_sections.teacher_email is
	// stored lowercased (0082 CHECK), so both are lowercased before use.
	const [{ data: profile }, chair] = await Promise.all([
		supabase.from('profiles').select('email').eq('id', userId).maybeSingle(),
		isAdmin(supabase, userId)
	]);

	const email = (
		(profile?.email as string | null) ??
		claimedEmail ??
		''
	).toLowerCase().trim();

	let isInstructor = false;
	if (email) {
		const { data: taught, error } = await supabase
			.from('classroom_sections')
			.select('id')
			.eq('teacher_email', email)
			.limit(1);
		isInstructor = !error && (taught?.length ?? 0) > 0;
	}

	return { isInstructor, isChair: chair, canReview: isInstructor || chair, email };
}
