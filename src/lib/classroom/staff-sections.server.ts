import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * THE GATE THE TEAM STAFF PAGES SHARE (ledger 0436): the sign-off queue and
 * the team board. An admin, or a teacher of record of a class, reaches them;
 * anyone else gets the 404 every staff surface answers, because the existence
 * of a review lane is not public. Each page's own read re-checks the caller,
 * so this is convenience. The sections are the live channels the page listens
 * on: every class for an admin, their own for a teacher.
 */
export async function staffSections(
	supabase: SupabaseClient,
	claims: unknown
): Promise<{ isAdmin: boolean; sections: string[] }> {
	const email = String((claims as { email?: string } | null)?.email ?? '').toLowerCase();
	const [{ data: admin }, { data: own }] = await Promise.all([
		supabase.rpc('is_admin'),
		supabase.from('classroom_sections').select('id').eq('teacher_email', email)
	]);
	const isAdmin = admin === true;
	if (!isAdmin && !(own ?? []).length) error(404, 'Not found');
	let sections = (own ?? []).map((s) => String((s as { id: string }).id));
	if (isAdmin) {
		const { data: all } = await supabase.from('classroom_sections').select('id');
		sections = (all ?? []).map((s) => String((s as { id: string }).id));
	}
	return { isAdmin, sections };
}
