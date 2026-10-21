// The nightly autopay call (IDEA Coin V2, ledger 0384).
//
// `coin_autopay_run` (0242) pays everything owed and nothing more: every kind
// of pay is a database uniqueness key, so a second call finds every key taken.
// That is why this route holds no credential and checks no session: anybody
// calling it can only make the economy pay what it already owes, sooner. The
// function throttles itself and answers a caller who is not an admin with
// counts only, never a name or an address.
//
// TWO SCHEDULERS CALL IT, ON PURPOSE: Vercel's cron (`vercel.json`, once a
// day, which every plan allows) and a GitHub Actions schedule
// (`.github/workflows/autopay.yml`) as the second. Idempotence makes the
// redundancy free. Every coin page also calls it on load as a catch-up.
//
// It never answers an error status: a scheduler that sees a 500 retries, and
// a missing function (the migration not applied yet) is a state, not a fault.

import { json } from '@sveltejs/kit';
import { connectorDeps } from '$lib/server/connector/deps';
import { runNightlyReplay } from '$lib/server/connector/replay';
import type { RequestHandler } from './$types';

/**
 * THE CONNECTOR'S NIGHTLY REPLAY RIDES THIS CALL (ledger 0422): it is the one
 * thing that already reaches the site every night, twice. The replay runs at
 * most once in twenty hours, never touches coin data, and cannot fail the
 * payout: its answer, or the reason it did not run, rides beside it.
 */
async function replay() {
	try {
		return await runNightlyReplay((await connectorDeps()).backend);
	} catch (e) {
		return { ran: false, reason: (e as Error).message?.slice(0, 200) ?? 'unavailable' };
	}
}

async function run(locals: App.Locals) {
	try {
		const [{ data, error }, connectorReplay] = await Promise.all([
			locals.supabase.rpc('coin_autopay_run', { p_trigger: 'nightly' }),
			replay()
		]);
		if (error) return json({ ok: false, reason: 'unavailable', code: error.code ?? null, connector_replay: connectorReplay }, { headers: { 'cache-control': 'no-store' } });
		const paid = data && typeof data === 'object' && !Array.isArray(data) ? data : { ok: false };
		return json({ ...paid, connector_replay: connectorReplay }, { headers: { 'cache-control': 'no-store' } });
	} catch {
		return json({ ok: false, reason: 'unavailable' }, { headers: { 'cache-control': 'no-store' } });
	}
}

export const GET: RequestHandler = ({ locals }) => run(locals);
export const POST: RequestHandler = ({ locals }) => run(locals);
