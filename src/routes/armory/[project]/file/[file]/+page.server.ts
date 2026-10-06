import type { PageServerLoad } from './$types';
import { loadFile, signedInEmail } from '$lib/server/armory/page-loads';

export const load: PageServerLoad = async ({ locals, params }) => {
	const email = signedInEmail(locals.claims);
	if (!email) return { email: null, view: null };
	const loaded = await loadFile(locals.supabase, params.project, params.file);
	return { email, view: loaded.notReady ? null : loaded };
};
