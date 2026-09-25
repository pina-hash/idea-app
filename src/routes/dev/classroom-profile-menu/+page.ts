import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the PROFILE MENU INSIDE THE CLASSROOM'S APPLICATION
 * FRAME (ledger 0298, report R18). 404s in production; no auth, no Supabase,
 * no network.
 *
 * WHY A SECOND PROFILE-MENU HARNESS. `/dev/profile-menu` mounts the menu in a
 * plain header on a page that scrolls, which is the portal's case. The report
 * was filed from the portal, but the half that could not be reached at all was
 * the classroom's: above 1024px `.cr-app` is `100dvh` with `overflow: hidden`,
 * so an absolutely positioned panel taller than the window was CLIPPED by the
 * frame and no scroll of any kind reached its lower half. The only honest
 * reproduction is the real `ClassroomShell` inside the real `.cr-root.cr-app`
 * with the real classroom stylesheet and the console measure a console route
 * sets, so that is what the page mounts. `/dev/theme-switch` also renders the
 * menu in the shell, but on a class page's measure without the frame, where
 * the page scrolls and nothing clips.
 *
 * The session is returned at PAGE level, the way `/dev/theme-switch` does it:
 * page data merges over layout data, so `ProfileMenu` and `ThemeRoot` read the
 * same `page.data.claims` production gives them, and Space White applies here
 * because `/dev/classroom` is one of the theme's in-scope harness prefixes.
 * No `supabase` stub: nothing this harness measures writes.
 *
 * `?state=space-white` starts on that theme through the SHIPPING setter;
 * `?pathway=none` seeds the unset pathway a student who deferred the
 * first-login sheet arrives with.
 */
export const prerender = false;

export const load: PageLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');
	const pathway = url.searchParams.get('pathway');
	return {
		claims: { sub: 'dev-pm-classroom', email: 'alex.rivera@boscotech.net', exp: 4102444800 },
		userProfile: {
			id: 'dev-pm-classroom',
			email: 'alex.rivera@boscotech.net',
			role: 'student',
			pathway: pathway === 'none' ? null : 'IDEA',
			display_name: null,
			full_name: 'Alex Rivera',
			avatar: 'preset:hex',
			avatar_url: null,
			section_id: null,
			preferences: {},
			/* Present and null, which is every uncustomized row once 0220 is
			   applied: it is what makes the Identity section render at all. */
			style_background_type: null,
			style_background_value: null,
			style_accent_color: null,
			style_badge: null,
			style_flourish: null,
			style_tagline: null
		},
		isAdmin: false,
		foundryReviewPending: null
	};
};
