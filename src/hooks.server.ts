import { createServerClient } from '@supabase/ssr';
import { type Handle, type HandleServerError, redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

/**
 * Redirects old GitHub Pages base-path links to their new homes. Scoped to the
 * exact directory paths only, so the mirrored `static/IDEA/<icon>.png` files
 * (which are served directly and never reach this hook) are not shadowed.
 *
 * KEYED WITHOUT THE TRAILING SLASH, WHICH IS THE WHOLE REASON THIS WORKS.
 * SvelteKit normalizes `/IDEA/` to `/IDEA` and issues its own redirect BEFORE
 * a hook ever sees the request, so a map keyed on `/IDEA/` could never match
 * and every one of these links 404'd: `/IDEA/` -> `/IDEA` -> 404, and
 * `/IDEA/coins/` -> `/coins/` -> `/coins` -> 404. Measured, not assumed.
 *
 * The targets carry the explicit `index.html` for the same reason the Ledger's
 * own nav does: the Vite dev server does not resolve a bare directory to its
 * index (404) even though Vercel does, so a bare `/coins/` target would have
 * moved the 404 rather than removed it.
 */
const legacyPaths: Record<string, string> = {
	'/IDEA': '/',
	'/IDEA/coins': '/coins/index.html'
	// `/IDEA/entry/` used to redirect to the Sheets-backed coin entry tool. That
	// tool is retired (see docs/coin-economy/archive/legacy-system/), so the old
	// link now falls through to a 404 rather than pointing at nothing.
};

const legacyRedirects: Handle = async ({ event, resolve }) => {
	// Tolerate either spelling: the with-slash form is what old printed links
	// actually carry, and it is only SvelteKit's own normalization that usually
	// strips it before this runs.
	const path = event.url.pathname.replace(/\/+$/, '') || '/';
	const target = legacyPaths[path];
	if (target) {
		redirect(308, target);
	}
	return resolve(event);
};

/**
 * Creates a request-specific Supabase client that reads the Auth token from
 * the request cookies and writes refreshed cookies back on the response.
 */
const supabase: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			/**
			 * SvelteKit's cookies API requires `path` to be explicitly set.
			 * Setting it to `/` replicates standard cookie behavior.
			 */
			setAll: (cookiesToSet, headers) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, { ...options, path: '/' });
				});
				if (Object.keys(headers).length > 0) {
					event.setHeaders(headers);
				}
			}
		}
	});

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			/**
			 * Supabase libraries use these headers, so pass them through.
			 */
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Validates the session and guards protected routes on the server.
 *
 * `getClaims` validates the JWT signature locally only for projects using
 * asymmetric signing keys. This project (like most Supabase projects, which
 * default to legacy HS256/shared-secret signing) doesn't have those, so
 * `getClaims` transparently falls back to `getUser()` -- a live round trip to
 * the Auth server -- on every call. That round trip can transiently fail
 * right after a fresh OAuth sign-in (back-to-back requests to the Auth
 * server, a cold serverless start, ...), which would otherwise read as
 * "not signed in" until the user retries or refreshes. A couple of quick
 * retries survive that blip; a clean "no session" result (no error) is never
 * retried, so anonymous requests (most of this public-first site's traffic)
 * pay no extra cost.
 */
async function resolveClaims(supabase: App.Locals['supabase']): Promise<App.Claims | null> {
	for (let attempt = 0; attempt < 3; attempt++) {
		const { data, error } = await supabase.auth.getClaims();
		if (data?.claims) return data.claims as App.Claims;
		if (!error) return null;
		if (attempt < 2) await sleep(150);
	}
	return null;
}

/**
 * Route prefixes that require a signed-in user. `/dashboard` is additionally
 * teacher-gated in its own load; `/gauntlet` (the CAD skills dojo), `/frc`
 * (the FRC Training track), and `/greenline` (the combat-racing game) are open
 * to any authenticated user. GAUNTLET's teacher-only authoring page is gated in
 * that page's load; GREENLINE's tuning panel is teacher-gated in its own load.
 * `/coin-balance` and `/contracts` are deliberately ABSENT now: both 308 to
 * the IDEA Coin Ledger, which is public tier, so an anonymous visitor has to
 * reach the redirect rather than being bounced to `/` before it.
 */
const authedPrefixes = [
	'/dashboard',
	'/gauntlet',
	'/frc',
	'/greenline',
	'/notebook',
	'/classroom'
];

const authGuard: Handle = async ({ event, resolve }) => {
	event.locals.claims = await resolveClaims(event.locals.supabase);

	// Protected tier: only authenticated users may reach these sections.
	const { pathname } = event.url;
	const needsAuth = authedPrefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
	if (!event.locals.claims && needsAuth) {
		redirect(303, '/');
	}

	return resolve(event);
};

export const handle: Handle = sequence(legacyRedirects, supabase, authGuard);

/**
 * THE MINIMUM THAT MAKES A SERVER ERROR AND A REPORT ABOUT IT THE SAME EVENT.
 *
 * Until this existed, an unexpected throw fell to SvelteKit's default error
 * page: outside the app's chrome, carrying nothing, with a log line on the
 * server that nobody could tie to the report a student filed ten minutes later
 * ("the notebook broke"). The correlation id is the whole feature. It is minted
 * here, logged beside the route and the stack, handed to the page as
 * `page.error.id`, shown on the error boundary, and captured into the `meta` of
 * any report filed from it -- so the two rows join on one string.
 *
 * WHAT IS NOT DONE HERE, deliberately: no reporting service, no database write,
 * no attempt to read the session. `handleError` runs on a request that has
 * already gone wrong, and a second thing that can fail inside it turns a 500
 * into a 500 with no log line at all. `console.error` reaches the Vercel
 * function log, which is where a server error is already looked for.
 *
 * The returned MESSAGE stays generic. An internal error's real text can carry a
 * query, a path or a token, and this value is rendered to the caller.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const id = crypto.randomUUID();
	console.error(
		`[error ${id}] ${status} ${event.request.method} ${event.url.pathname}` +
			` route=${event.route.id ?? 'none'}`,
		error
	);
	// 404s and other expected statuses keep their own words; only a genuine
	// internal failure gets the generic line.
	return { message: status === 500 ? 'Something went wrong on our side.' : message, id };
};
