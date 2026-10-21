/**
 * VIEW AS AND TEST ACCOUNTS: THE ONE PLACE THEY READ `SUPABASE_SERVICE_ROLE_KEY`
 * (ledger 0422). Three things and nothing else, the same shape as the
 * connector's and the Armory's backends:
 *
 *   - `mintSessionFor`: a real Supabase session for the account being viewed
 *     or acted as (`auth.admin.generateLink` then `verifyOtp` on a fresh anon
 *     client). The session is then claimed AS THAT ACCOUNT through
 *     `view_as_claim`, which reads the session id off its own verified token,
 *     so this module never names a session to the database.
 *   - `revokeSession`: signs that session out when the admin leaves.
 *   - `createTestUser`: the auth user behind a test student account. The
 *     address is always at test.ideabosco.com and no email is ever sent.
 *
 * Every read and write of site data runs on a user's own token, never here.
 * tests/view-as-service-role.test.ts holds this file to it.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';

export const TEST_ACCOUNT_DOMAIN = 'test.ideabosco.com';

export class ViewAsUnavailable extends Error {}

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

function serviceClient(): SupabaseClient {
	const key = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!key) throw new ViewAsUnavailable('Viewing as someone is not set up on this server yet.');
	return createClient(PUBLIC_SUPABASE_URL, key, { auth: NO_SESSION });
}

/** A client carrying one access token, for calls made AS that account. */
export function clientFor(accessToken: string): SupabaseClient {
	return createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		global: { headers: { Authorization: `Bearer ${accessToken}` } },
		auth: NO_SESSION
	});
}

export type MintedSession = { access_token: string; refresh_token: string; expires_at: number; user_id: string };

export async function mintSessionFor(userId: string, email: string): Promise<MintedSession> {
	const link = await serviceClient().auth.admin.generateLink({ type: 'magiclink', email });
	const tokenHash = link.data?.properties?.hashed_token;
	if (link.error || !tokenHash) throw new ViewAsUnavailable('That account could not be opened right now.');
	const fresh = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, { auth: NO_SESSION });
	const verified = await fresh.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
	const session = verified.data?.session;
	if (verified.error || !session) throw new ViewAsUnavailable('That account could not be opened right now.');
	if (session.user?.id !== userId) throw new ViewAsUnavailable('The opened session belongs to a different account.');
	return {
		access_token: session.access_token,
		refresh_token: session.refresh_token,
		expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in,
		user_id: userId
	};
}

/** Ends the minted session everywhere it is held. Never throws. */
export async function revokeSession(accessToken: string): Promise<void> {
	try {
		await serviceClient().auth.admin.signOut(accessToken, 'local');
	} catch {
		/* the session expires on its own; nothing else to do */
	}
}

/** A short, readable, unique address for a new test account. */
export function testAccountEmail(label: string, now = Date.now()): string {
	const slug =
		label
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 24) || 'student';
	return `${slug}-${now.toString(36)}@${TEST_ACCOUNT_DOMAIN}`;
}

export async function createTestUser(label: string): Promise<{ id: string; email: string }> {
	const email = testAccountEmail(label);
	const { data, error } = await serviceClient().auth.admin.createUser({
		email,
		email_confirm: true,
		user_metadata: { full_name: label, test_account: true }
	});
	if (error || !data.user) throw new ViewAsUnavailable('The test account could not be created right now.');
	return { id: data.user.id, email };
}
