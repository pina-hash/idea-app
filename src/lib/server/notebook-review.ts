import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReviewSection } from '$lib/notebook-review';

/**
 * The ONE server-side read of the notebook SECTION REVIEWER tier (0169).
 *
 * WHY THIS IS NOT `isAdmin` AND NOT A `teacher_email` FILTER.
 * `classroom_sections.teacher_email` is one address, so before 0169 a second
 * instructor who genuinely teaches a section could reach its review console
 * only by taking the section over or by holding `app_admins` -- the whole
 * 0067 tier. 0169 gives "may review this section's notebooks" its own
 * section-scoped allowlist (`notebook_section_reviewers`, mirroring
 * `gauntlet_authors` and `frc_reviewers`), and this module is where the app
 * asks about it.
 *
 * THIS GUARD IS CONVENIENCE, exactly as `isAdmin` and `canAuthorGauntlet`
 * are. The real boundary is `notebook_reviews_section()` inside the re-gated
 * RPCs and policies, which a request cannot talk its way past. What it buys
 * is that a reviewer's sections appear in the review page's picker and that a
 * non-reviewer still 404s off the route.
 *
 * The RPC is `notebook_reviewed_sections()`: the CALLER's own grants, with
 * the section labels the picker needs -- it exists because
 * `classroom_sections` is readable only to members and managers (0082), and a
 * reviewer is neither. It takes no identity parameter, so "only their own
 * grants" is a property of the signature.
 */

interface ReviewedSectionRow {
	section_id: string;
	label: string;
	block: string | null;
	teacher_email: string;
	course_code: string;
	course_title: string;
}

/**
 * The sections the CALLER (resolved from their own cookie session, never a
 * passed id) holds on the reviewer tier, shaped for the review page.
 * `manages: false` on every row by construction: a reviewer row is exactly
 * the grant that is NOT manage-ness, and the caller merges these with the
 * sections they actually manage.
 *
 * PRE-0169 FALLBACK: migrations are applied by hand and separately from the
 * deploy, so a deployment sitting between this code shipping and 0169 being
 * pasted is a real state. In that world the tier does not exist and nobody
 * holds it, so `PGRST202` (no such function, matched nowhere because it needs
 * no distinct handling) and every other error land on the same honest answer:
 * the empty list. Unlike `canAuthorGauntlet`, whose pre-migration world was
 * "the gate still says admin" and so degrades to `isAdmin`, this tier's
 * pre-migration world is "nobody holds it" -- the degrade and the denial
 * coincide, and "cannot tell" must never read as "reviews something".
 */
export async function reviewedSections(supabase: SupabaseClient): Promise<ReviewSection[]> {
	const { data, error } = await supabase.rpc('notebook_reviewed_sections');
	if (error) return [];
	return ((data ?? []) as ReviewedSectionRow[]).map((row) => ({
		id: row.section_id,
		label: row.label,
		block: row.block,
		teacher_email: row.teacher_email,
		course_code: row.course_code,
		course_title: row.course_title,
		manages: false
	}));
}
