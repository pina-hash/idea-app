import type { PageServerLoad } from './$types';
import { loadMyProjects, signedInEmail } from '$lib/server/armory/page-loads';

export const load: PageServerLoad = async ({ locals }) => {
	const email = signedInEmail(locals.claims);
	if (!email) return { email: null, notReady: false, projects: [] };
	return { email, ...(await loadMyProjects(locals.supabase)) };
};
