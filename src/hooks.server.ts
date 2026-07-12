import { createServerClient } from '@supabase/ssr';
import { type Handle, redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

/**
 * Redirects old GitHub Pages base-path links to their new homes. Scoped to the
 * exact directory paths only, so the mirrored `static/IDEA/<icon>.png` files
 * (which are served directly and never reach this hook) are not shadowed.
 */
const legacyPaths: Record<string, string> = {
	'/IDEA/': '/',
	'/IDEA/coins/': '/coins/',
	'/IDEA/entry/': '/coin-entry'
};

const legacyRedirects: Handle = async ({ event, resolve }) => {
	const target = legacyPaths[event.url.pathname];
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
 * teacher-gated in its own load; `/gauntlet` (the CAD skills dojo) and `/frc`
 * (the FRC Training track) are open to any authenticated user, with GAUNTLET's
 * teacher-only authoring page gated in that page's load.
 */
const authedPrefixes = ['/dashboard', '/gauntlet', '/frc'];

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
