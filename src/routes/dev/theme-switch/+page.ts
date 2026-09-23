import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the classroom's ONE-TAP THEME SWITCH (ledger 0297,
 * package F1a). 404s in production; no auth, no Supabase, no network.
 *
 * IT MOUNTS THE REAL `ClassroomShell`, inside the real `.cr-root` with the real
 * classroom.css and the `--cr-measure-route` the classroom layout would set for
 * a class page, because the switch's whole claim is about where it sits: in the
 * masthead beside the profile menu, reachable at 375, never pushing the
 * masthead off the screen. No other classroom harness passes a session, so no
 * other one has ever rendered the profile menu in the shell -- which is why
 * this one returns `claims` at PAGE level, the way /dev/themes does: page data
 * merges over layout data, so `ProfileMenu`, `ThemeSwitch` and `ThemeRoot` all
 * read the same `page.data.claims` production gives them.
 *
 * `?signedout=1` drops the session, which is the switch's absence proved:
 * no session, no theme applies, so no control is offered. `?state=<id>` starts
 * the page on a theme through the SHIPPING setter.
 */
export const prerender = false;

export const load: PageLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');
	const signedOut = url.searchParams.get('signedout') === '1';
	return {
		claims: signedOut ? null : { sub: 'dev-switch-user', email: 'alice@boscotech.net', exp: 4102444800 },
		userProfile: signedOut
			? null
			: {
					id: 'dev-switch-user',
					role: 'student',
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
