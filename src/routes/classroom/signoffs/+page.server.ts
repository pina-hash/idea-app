import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * THE SIGN-OFF QUEUE (ledger 0436, 0304), phone first. An admin, or a teacher
 * of record of a class, reaches it; anyone else gets the 404 every staff
 * surface answers, because the existence of a review lane is not public. The
 * queue itself re-checks every request it shows (`classroom_signoff_queue`),
 * so this gate is convenience. The sections are the live channels the page
 * listens on for a new request.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');
	const email = String((claims as { email?: string }).email ?? '').toLowerCase();
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
};
