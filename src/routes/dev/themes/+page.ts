import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the SITE THEME (404s in production; no auth, no
 * Supabase, no network).
 *
 * WHAT IT MOUNTS AND WHY THOSE TWO THINGS. The launcher, because A4's rule is
 * about the launcher: a theme that repainted the per-app accents would make
 * twelve cards indistinguishable, and the only way to say that has NOT
 * happened is to put the real `AppLauncher` on screen under the theme and
 * count the distinct accents the browser actually computed. And a chrome
 * board, because every text role this theme repaints has to be measured on
 * every ground it repaints, and no shipping page carries all of them at once.
 *
 * THE KEYS ARE RETURNED AT PAGE LEVEL, following /dev/home-order: page data
 * merges over layout data, so `claims`, `userProfile` and `isAdmin` reach
 * `page.data`, which is where `AppLauncher`, `ProfileMenu` and `ThemeRoot` all
 * read them -- the same path production uses. `claims` is what makes the theme
 * APPLY at all (see ThemeRoot's session gate), so a harness without it would
 * measure the base palette while reporting on the theme.
 */
export const prerender = false;

export const load: PageLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');

	/**
	 * `?signedout=1` DROPS THE SESSION, and it is the only way to drive the one
	 * decision this feature makes that is not about colour: the theme is
	 * applied only where its own control is reachable, and the control is in
	 * ProfileMenu, which renders nothing without a session. A harness that
	 * could only ever be signed in would leave that gate measured by nothing.
	 *
	 * `?state=matrix` starts the page on the theme, through `setSiteTheme` in
	 * +page.svelte -- the SHIPPING call, the same one the ProfileMenu control
	 * makes. It writes the preference exactly as a press would, which is what
	 * makes it a legitimate starting state rather than a fake one.
	 */
	const signedOut = url.searchParams.get('signedout') === '1';

	return {
		claims: signedOut
			? null
			: { sub: 'dev-theme-user', email: 'alice@boscotech.net', exp: 4102444800 },
		userProfile: signedOut ? null : {
			id: 'dev-theme-user',
			role: 'student',
			pathway: 'IDEA',
			display_name: 'Alice Nguyen',
			full_name: 'Alice Nguyen',
			avatar: null,
			avatar_url: null,
			section_id: null,
			preferences: {}
		},
		/* Admin, so `visibleApps(true)` mounts every card including the three
		   admin-only ones. Without it three cards never mount and a sweep over
		   the accents on screen silently covers nine of twelve. */
		isAdmin: !signedOut,
		foundryReviewPending: null
	};
};
