import { error, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { isAdmin } from '$lib/server/admin';
import { DRIVE_STATE_COOKIE, driveConnectReady, driveConsentUrl } from '$lib/server/notebook-drive';
import type { RequestHandler } from './$types';

/**
 * Step 1 of the one-time notebook Drive connection (see
 * src/lib/server/notebook-drive.ts): redirects the chair to Google's consent
 * screen requesting the full drive scope (the target folder pre-exists in the
 * shared drive, which drive.file cannot reliably write into), with access_type=offline
 * and prompt=consent -- without both, Google will not reliably issue the
 * refresh token this whole flow exists to produce.
 *
 * ADMIN ONLY, the /admin rule exactly: anyone else (signed out included) gets
 * a 404, never a redirect, so probing the URL reveals nothing. This route
 * must therefore stay OUT of hooks.server.ts authedPrefixes. The gate here is
 * about who may act as the school's Drive account -- chair-tier trust -- and
 * regular instructors and students are refused.
 *
 * The state cookie is checked by the callback so a forged callback URL cannot
 * complete the exchange in the admin's browser.
 */

export const GET: RequestHandler = async ({ locals: { supabase, claims }, cookies }) => {
	if (!claims) error(404, 'Not found');
	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');

	if (!driveConnectReady()) {
		return new Response(
			'The Google OAuth client is not configured. Set GOOGLE_OAUTH_CLIENT_ID and ' +
				'GOOGLE_OAUTH_CLIENT_SECRET in the Vercel project env (see .env.example), redeploy, ' +
				'then open this page again.',
			{ status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } }
		);
	}

	const state = randomUUID();
	cookies.set(DRIVE_STATE_COOKIE, state, {
		path: '/admin/drive-connect',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 600
	});
	redirect(302, driveConsentUrl(state));
};
