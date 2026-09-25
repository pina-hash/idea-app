import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only MOCKUP of a proposed Space White shape language (decision 40 item
 * 4, ledger 0298). 404s in production; no auth, no Supabase, no network.
 *
 * IT IS A PROPOSAL, NOT A HARNESS FOR SHIPPED CODE. Nothing on this page
 * changes a real surface: every proposed token is declared in this route's own
 * stylesheet, on a wrapper, and reaches nothing outside it. The "before"
 * column is today's shipping CSS (the global `.btn`, `.card`, the classroom's
 * chips and the REAL `ClassroomShell`); the "after" column is the same markup
 * with the proposed tokens applied, so the comparison is between two rulesets
 * over one set of elements rather than between two drawings.
 *
 * THE SESSION IS FAKED THE WAY /dev/themes FAKES IT, and for the same reason:
 * `ThemeRoot` applies a site theme only for a signed-in viewer, so without
 * `claims` the page would render the default palette while claiming to show
 * Space White. `/dev/themes-shape` is inside `THEME_SCOPE_DEV_PREFIXES` by its
 * `/dev/themes` prefix, so the scoped theme is allowed to apply here.
 * `?state=space-white` starts the page on the theme through the SHIPPING
 * `setSiteTheme` call (see +page.svelte).
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {
		claims: { sub: 'dev-shape-user', email: 'alice@boscotech.net', exp: 4102444800 },
		userProfile: {
			id: 'dev-shape-user',
			role: 'teacher',
			pathway: 'IDEA',
			display_name: 'Alice Nguyen',
			full_name: 'Alice Nguyen',
			avatar: null,
			avatar_url: null,
			section_id: null,
			preferences: {}
		},
		isAdmin: false,
		foundryReviewPending: null
	};
};
