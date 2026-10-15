// The nightly autopay call (IDEA Coin V2, ledger 0383).
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
import type { RequestHandler } from './$types';

async function run(locals: App.Locals) {
	try {
		const { data, error } = await locals.supabase.rpc('coin_autopay_run', { p_trigger: 'nightly' });
		if (error) return json({ ok: false, reason: 'unavailable', code: error.code ?? null }, { headers: { 'cache-control': 'no-store' } });
		return json(data ?? { ok: false }, { headers: { 'cache-control': 'no-store' } });
	} catch {
		return json({ ok: false, reason: 'unavailable' }, { headers: { 'cache-control': 'no-store' } });
	}
}

export const GET: RequestHandler = ({ locals }) => run(locals);
export const POST: RequestHandler = ({ locals }) => run(locals);
