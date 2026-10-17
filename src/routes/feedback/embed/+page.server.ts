import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * THE FEEDBACK WINDOW'S OWN PAGE MAY BE FRAMED BY THIS SITE AND BY NOTHING ELSE
 * (ledger 0396).
 *
 * The window is opened in a same-origin frame by a legacy page that renders no
 * layout (`$lib/server/feedback-launch.ts`). Framed by another origin it would
 * be a page of this site, carrying a visitor's own session, drawn inside
 * somebody else's -- the shape a clickjacking page needs -- so the response
 * says so twice: `frame-ancestors 'self'` for every current browser and
 * `x-frame-options` for the rest. Neither restricts what the page itself may
 * load; the portal has no other CSP.
 *
 * `private, no-store` because the page's data is the visitor's own (the root
 * layout's session and profile), exactly as on every other page, and a shared
 * cache must never hold it.
 */
export const load: PageServerLoad = ({ setHeaders, url }) => {
	setHeaders({
		'content-security-policy': "frame-ancestors 'self'",
		'x-frame-options': 'SAMEORIGIN',
		'cache-control': 'private, no-store'
	});
	/*
	 * THE HARNESS'S SIGNED-IN WINDOW, AND ONLY IN DEV. A harness framing this
	 * page with `sink=memory&signedIn=1` (the in-memory sink, never the
	 * database) is shown the signed-in window: no contact field, the account
	 * note, and the site theme the stored value asks for, which only a session
	 * may turn on (`themeAttrFor`). Page data merges over the root layout's, so
	 * this one key is what `ThemeRoot` and the box read. `dev` is a build-time
	 * constant: a production build has no branch here at all.
	 */
	/*
	 * THE HARNESS'S WINDOW THAT CANNOT LOAD, AND ONLY IN DEV. `sink=memory&fail=1`
	 * answers this page with the site's own error page, which carries no
	 * `FEEDBACK_EMBED_MARKER`, so a harness drives the launcher's real
	 * did-not-load path (`/dev/feedback/assignment?signedIn=fail`).
	 */
	if (dev && url.searchParams.get('sink') === 'memory' && url.searchParams.get('fail') === '1') {
		error(503, 'The feedback window is switched off in this harness.');
	}
	if (dev && url.searchParams.get('sink') === 'memory' && url.searchParams.get('signedIn') === '1') {
		return { claims: { sub: '00000000-0000-4000-8000-0000000000dd' } };
	}
	return {};
};
