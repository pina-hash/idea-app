import { json } from '@sveltejs/kit';
import { PUBLIC_COIN_ACTIONS, readCoinPublic } from '$lib/server/coin-public';
import type { RequestHandler } from './$types';

/**
 * The public, read-only coin surface the IDEA Coin Ledger
 * (`src/lib/legacy/coins/index.html`) runs on.
 *
 * No session is required — the Ledger is public tier by design — and the
 * action ALLOWLIST is what keeps this from being a general proxy onto the
 * economy: an action outside `PUBLIC_COIN_ACTIONS` is refused here regardless
 * of what the database would have done with it -- two independent checks, the
 * discipline the retired Apps Script proxy this replaced also used.
 *
 * Every read runs as the CALLER'S OWN client (anonymous in the normal case)
 * against `anon`-granted SECURITY DEFINER RPCs. There is deliberately NO
 * service-role client in this path: the no-email boundary is enforced inside
 * the database (0089), not by anything this route remembers to do.
 *
 * Writes do not live here. Claiming a contract and applying for a role are
 * `/api/coin/claim` and `/api/coin/role-apply`, both session-gated.
 */
export const GET: RequestHandler = async ({ url, locals: { supabase }, setHeaders }) => {
	const action = url.searchParams.get('action') ?? '';

	if (!PUBLIC_COIN_ACTIONS.has(action)) {
		return json({ error: 'unsupported action' }, { status: 400 });
	}

	try {
		const { body, contentType } = await readCoinPublic(supabase, action, url.searchParams);
		setHeaders({ 'cache-control': 'no-store' });
		return new Response(body, { headers: { 'content-type': contentType } });
	} catch (err) {
		return json({ error: (err as Error).message }, { status: 502 });
	}
};
