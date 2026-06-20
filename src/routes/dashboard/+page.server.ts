import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/**
 * Loads the signed-in user's profile. The route is already guarded in
 * hooks.server.ts, but we re-check here so this is also a dynamic (SSR)
 * route and never leaks a shell to anonymous users.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		redirect(303, '/');
	}

	const { data: profile } = await supabase
		.from('profiles')
		.select('full_name, email, avatar_url, role')
		.eq('id', claims.sub)
		.single();

	return {
		profile,
		email: claims.email ?? profile?.email ?? null
	};
};

export const actions: Actions = {
	signout: async ({ locals: { supabase } }) => {
		await supabase.auth.signOut();
		redirect(303, '/');
	}
};
