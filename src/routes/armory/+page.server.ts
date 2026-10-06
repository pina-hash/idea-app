import type { PageServerLoad } from './$types';
import { loadMyDevices, loadMyProjects, signedInEmail } from '$lib/server/armory/page-loads';

export const load: PageServerLoad = async ({ locals }) => {
	const email = signedInEmail(locals.claims);
	if (!email) return { email: null, notReady: false, projects: [], devices: [], now: Date.now() };
	const [mine, devices] = await Promise.all([loadMyProjects(locals.supabase), loadMyDevices(locals.supabase)]);
	return { email, ...mine, devices, now: Date.now() };
};
