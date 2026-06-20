import { createServerClient } from '@supabase/ssr';
import { type Handle, redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

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
const authGuard: Handle = async ({ event, resolve }) => {
	const { data } = await event.locals.supabase.auth.getClaims();
	event.locals.claims = (data?.claims ?? null) as App.Claims | null;

	// Protected tier: only authenticated users may reach /dashboard.
	if (!event.locals.claims && event.url.pathname.startsWith('/dashboard')) {
		redirect(303, '/');
	}

	return resolve(event);
};

export const handle: Handle = sequence(supabase, authGuard);
