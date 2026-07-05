import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/**
 * The dashboard is the teacher-only area; students use the homepage as their
 * dashboard. We load the profile and redirect anyone who is not a teacher to
 * `/`. (hooks.server.ts already redirects anonymous users off `/dashboard`; the
 * role lives in `profiles`, so the teacher check happens here.)
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

	if (profile?.role !== 'teacher') {
		redirect(303, '/');
	}

	// Student roster for the pathway admin view. Teachers read every profile
	// via the "teachers select all profiles" RLS policy; pathway edits go
	// through the "teachers update any profile" policy from the client. Fails
	// soft to an empty roster until migration 0038 adds the pathway column.
	const { data: students, error: rosterError } = await supabase
		.from('profiles')
		.select('id, email, full_name, display_name, avatar, avatar_url, pathway')
		.eq('role', 'student')
		.order('full_name', { ascending: true });

	return {
		profile,
		email: claims.email ?? profile?.email ?? null,
		students: students ?? [],
		rosterReady: !rosterError
	};
};

export const actions: Actions = {
	signout: async ({ locals: { supabase } }) => {
		await supabase.auth.signOut();
		redirect(303, '/');
	}
};
