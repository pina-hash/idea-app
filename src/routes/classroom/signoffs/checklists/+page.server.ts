import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** THE SIGN-OFF CHECKLISTS (ledger 0436, 0304): admin-editable data. 404 to anyone else. */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');
	const { data: admin } = await supabase.rpc('is_admin');
	if (admin !== true) error(404, 'Not found');
	return {};
};
