import { json } from '@sveltejs/kit';
import {
	PUBLIC_LEDGER_ACTIONS,
	callLedger,
	forwardableParams,
	ledgerConfigured
} from '$lib/server/coin-ledger';
import type { RequestHandler } from './$types';

/**
 * Public, read-only coin ledger proxy.
 *
 * `static/coins/index.html` is public tier by design (it is the coin
 * leaderboard, linked from the homepage) and needs a handful of ledger reads to
 * render: the contracts board, the reason guide, which roles are open, and the
 * application questions. Those reads used to be direct browser calls, which is
 * what put the ledger's `/exec` URL in front of every visitor.
 *
 * They come through here instead. No session is required — nothing behind this
 * route is private and nothing here moves a balance — but the action ALLOWLIST
 * is what keeps it from being a general anonymous proxy onto the whole ledger.
 * Any action outside `PUBLIC_LEDGER_ACTIONS` is refused here regardless of what
 * Code.gs would have done with it, so the two checks are independent.
 *
 * Writes do not live here. Role applications, the one write the public page
 * performs, go to `/api/coin-ledger/apply`, which requires a session.
 */
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const action = url.searchParams.get('action') ?? '';

	if (!PUBLIC_LEDGER_ACTIONS.has(action)) {
		return json({ error: 'unsupported action' }, { status: 400 });
	}

	if (!ledgerConfigured()) {
		return json({ error: 'the coin ledger is not configured' }, { status: 503 });
	}

	const res = await callLedger(action, forwardableParams(url.searchParams));
	if (!res.ok) {
		return json({ error: res.error }, { status: res.status });
	}

	// The legacy page parses with res.json(); the upstream body is passed
	// through verbatim so its shape is exactly what the page saw before.
	setHeaders({ 'cache-control': 'no-store' });
	return new Response(res.body, {
		headers: { 'content-type': 'application/json; charset=utf-8' }
	});
};
