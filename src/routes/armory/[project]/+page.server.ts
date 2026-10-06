import type { PageServerLoad } from './$types';
import { loadProject, signedInEmail } from '$lib/server/armory/page-loads';

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('armory:project');
	const email = signedInEmail(locals.claims);
	if (!email) return { email: null, notReady: false as const, view: null };
	const loaded = await loadProject(locals.supabase, params.project);
	return { email, notReady: loaded.notReady, view: loaded.notReady ? null : loaded };
};
