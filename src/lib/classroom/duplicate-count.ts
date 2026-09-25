/**
 * HOW MANY DUPLICATE DRAFTS A CLASS HAS, FOR THE DOOR ON THE CLASS PAGE
 * (ledger 0298, report 28).
 *
 * The Duplicates tab left the tab bar because most days it has nothing to act
 * on; what replaced it is a door beside the class page's Drafts filter that
 * renders ONLY when there is something behind it. That needs the count, and
 * the count is `classroom_duplicate_drafts` (0187) -- the SAME function the
 * page itself calls, asked through the caller's own client, so the door and
 * the page cannot disagree about what a duplicate is. A second, client-side
 * definition over the items the class page already holds was the cheaper
 * shape and is refused: 0187 groups on author, kind, title and BODY and scopes
 * to items the caller may manage, and a copy of that rule is the one that
 * stops matching.
 *
 * `null` MEANS "COULD NOT TELL", NEVER "NONE". A deployment short of 0187
 * (`PGRST202`) and any other failure both answer null, and the class page
 * shows no door for either -- the door is a convenience, and the palette's
 * `class.duplicates` command and the page itself still answer and still say
 * why when they cannot. What the door must never do is claim a number it did
 * not read.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { readAnswer } from '$lib/classroom/DuplicateDrafts.svelte';

/** The surplus copies 0187 would list for this class, or null when it could not say. */
export async function loadDuplicateDraftCount(
	supabase: SupabaseClient,
	sectionId: string
): Promise<number | null> {
	try {
		const { data, error } = await supabase.rpc('classroom_duplicate_drafts', { p_section_id: sectionId });
		if (error) return null;
		return readAnswer(data).totals.surplus;
	} catch {
		return null;
	}
}

/** The door's words: the count and its noun, never a bare number. */
export function duplicateDoorLabel(count: number): string {
	return `${count} duplicate ${count === 1 ? 'draft' : 'drafts'}`;
}
