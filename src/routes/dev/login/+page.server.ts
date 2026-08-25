import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * DEV ONLY, 404 in production.
 *
 * WHY THIS EXISTS. Production sign-in is Google OAuth against a real Bosco Tech
 * account, which cannot happen against a local Supabase stack -- so until now
 * NOTHING behind a session could be verified locally at all. Every signed-in
 * surface had to be checked against the deployed site or not at all, and
 * anything gated on a migration that has not been applied yet could not be
 * checked anywhere.
 *
 * It is a password sign-in against whatever local project `.env` points at, and
 * it is a HARNESS in exactly the sense the rest of `/dev/*` is: no auth to reach
 * it, no Supabase admin key, no server-side impersonation. It calls the same
 * browser Supabase client the app itself uses, so the session and the cookies it
 * produces are the REAL ones -- which is the whole point. There is nothing here
 * a production build ships, and nothing that would work against production even
 * if it did (no Bosco Tech account has a password).
 */
export const load: PageServerLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
