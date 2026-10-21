/**
 * STARTING AND LEAVING A VIEW-AS OR ACT-AS SESSION (ledger 0422).
 *
 * Starting swaps the browser's Supabase session for one minted for the target,
 * so every server load, every policy and every browser-side query answers as
 * that person: the page IS what they see. The admin's own refresh token waits
 * in an httpOnly cookie (`VIEW_AS_RETURN_COOKIE`) and is used once, on the way
 * out, to put the admin's session back.
 *
 * Read-only is not this file's to enforce: the database refuses every write a
 * view session makes (0288's guard), whatever path it arrives by.
 */
import { dev } from '$app/environment';
import type { Cookies } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseViewAs, type ViewAsMode, type ViewAsState } from '$lib/view-as';
import { clientFor, mintSessionFor, revokeSession, ViewAsUnavailable } from './service';

export const VIEW_AS_RETURN_COOKIE = 'idea_va_return';
const RETURN_MAX_AGE = 4 * 60 * 60;

export class ViewAsRefused extends Error {}

function dbMessage(e: { message?: string } | null | undefined, fallback: string): string {
	const m = e?.message?.trim();
	return m && m.length < 300 ? m : fallback;
}

/** The current session's view-as state, or null. Never throws. */
export async function currentViewAs(supabase: SupabaseClient): Promise<ViewAsState | null> {
	try {
		const { data, error } = await supabase.rpc('view_as_current');
		if (error) return null;
		return parseViewAs(data);
	} catch {
		return null;
	}
}

/**
 * As the signed-in admin: open `targetUser` in `mode`. Leaves the request's
 * cookies holding the target's session. Throws ViewAsRefused with a message
 * for the admin when the database says no.
 */
export async function startViewAs(
	supabase: SupabaseClient,
	cookies: Cookies,
	targetUser: string,
	mode: ViewAsMode
): Promise<ViewAsState> {
	const {
		data: { session: own }
	} = await supabase.auth.getSession();
	if (!own?.refresh_token) throw new ViewAsRefused('Sign in again, then try once more.');
	if (cookies.get(VIEW_AS_RETURN_COOKIE)) throw new ViewAsRefused('Leave the current view first.');

	const grant = await supabase.rpc('view_as_grant', { p_user: targetUser, p_mode: mode });
	if (grant.error || !grant.data) throw new ViewAsRefused(dbMessage(grant.error, 'That account cannot be opened.'));
	const { grant: grantId, email } = grant.data as { grant: string; email: string };

	let minted;
	try {
		minted = await mintSessionFor(targetUser, email);
	} catch (e) {
		throw new ViewAsRefused(e instanceof ViewAsUnavailable ? e.message : 'That account could not be opened right now.');
	}
	const claimed = await clientFor(minted.access_token).rpc('view_as_claim', { p_grant: grantId });
	const state = parseViewAs(claimed.data);
	if (claimed.error || !state) {
		await revokeSession(minted.access_token);
		throw new ViewAsRefused(dbMessage(claimed.error, 'That account could not be opened right now.'));
	}

	cookies.set(VIEW_AS_RETURN_COOKIE, own.refresh_token, {
		path: '/',
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax',
		maxAge: RETURN_MAX_AGE
	});
	const swapped = await supabase.auth.setSession({
		access_token: minted.access_token,
		refresh_token: minted.refresh_token
	});
	if (swapped.error) {
		cookies.delete(VIEW_AS_RETURN_COOKIE, { path: '/' });
		await revokeSession(minted.access_token);
		throw new ViewAsRefused('That account could not be opened right now.');
	}
	return state;
}

/**
 * Leave: end the session in the database (so an act session's notice counts
 * what changed), put the admin's own session back, and sign the target's out.
 * If the admin's session cannot be restored, the browser is signed out rather
 * than left as the target.
 */
export async function exitViewAs(supabase: SupabaseClient, cookies: Cookies): Promise<{ restored: boolean }> {
	const back = cookies.get(VIEW_AS_RETURN_COOKIE);
	const {
		data: { session: target }
	} = await supabase.auth.getSession();
	if (target) {
		try {
			await supabase.rpc('view_as_end');
		} catch {
			/* the session row expires on its own */
		}
	}
	let restored = false;
	if (back) {
		const { data, error } = await supabase.auth.refreshSession({ refresh_token: back });
		restored = !error && !!data.session;
	}
	if (!restored) await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
	if (target && target.access_token) await revokeSession(target.access_token);
	cookies.delete(VIEW_AS_RETURN_COOKIE, { path: '/' });
	return { restored };
}
