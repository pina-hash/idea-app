import type { PageServerLoad } from './$types';

/**
 * The homepage doubles as the signed-in student's dashboard. When signed in we
 * load the profile so the page can pin the student's chosen class and show the
 * teacher-only Dashboard link. Anonymous visitors get `profile: null` and see
 * the public curriculum.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		return { profile: null };
	}

	const { data: profile } = await supabase
		.from('profiles')
		.select('full_name, role, section_id')
		.eq('id', claims.sub)
		.single();

	return { profile: profile ?? null };
};
