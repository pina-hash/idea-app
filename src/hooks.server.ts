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

/**
 * Validates the session and guards protected routes on the server.
 *
 * `getClaims` validates the JWT signature locally (against the project's
 * asymmetric signing keys) without an extra round-trip to the Auth server,
 * which is both faster and safer than `getSession` for route protection.
 */
/**
 * Route prefixes that require a signed-in user. `/dashboard` is additionally
 * teacher-gated in its own load; `/gauntlet` (the CAD skills dojo) and `/frc`
 * (the FRC Training track) are open to any authenticated user, with GAUNTLET's
 * teacher-only authoring page gated in that page's load.
 */
const authedPrefixes = ['/dashboard', '/gauntlet', '/frc'];

const authGuard: Handle = async ({ event, resolve }) => {
	const { data } = await event.locals.supabase.auth.getClaims();
	event.locals.claims = (data?.claims ?? null) as App.Claims | null;

	// Protected tier: only authenticated users may reach these sections.
	const { pathname } = event.url;
	const needsAuth = authedPrefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
	if (!event.locals.claims && needsAuth) {
		redirect(303, '/');
	}

	return resolve(event);
};

export const handle: Handle = sequence(legacyRedirects, supabase, authGuard);
