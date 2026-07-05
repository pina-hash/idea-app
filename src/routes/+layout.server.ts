import type { LayoutServerLoad } from './$types';

/**
 * Passes the cookies and validated claims from the server to the universal
 * layout load, so the browser client can be created with the same session.
 * Also loads the signed-in user's profile once here (as `userProfile`, a key
 * no page load shadows) so the global ProfileMenu and per-user preferences
 * are available on every page.
 */
export const load: LayoutServerLoad = async ({ locals: { supabase, claims }, cookies }) => {
	let userProfile = null;
	if (claims) {
		let { data } = await supabase
			.from('profiles')
			.select(
				'id, email, full_name, display_name, avatar_url, avatar, role, section_id, pathway, preferences'
			)
			.eq('id', claims.sub)
			.single();
		if (!data) {
			// Pre-0038 fallback (pathway column not applied yet): a select naming a
			// missing column errors, which would sign everyone out of the profile
			// system. Retry without it so the portal degrades to "no pathway".
			({ data } = await supabase
				.from('profiles')
				.select(
					'id, email, full_name, display_name, avatar_url, avatar, role, section_id, preferences'
				)
				.eq('id', claims.sub)
				.single());
			if (data) (data as Record<string, unknown>).pathway = null;
		}
		userProfile = data ?? null;
	}

	return {
		claims,
		userProfile,
		cookies: cookies.getAll()
	};
};
