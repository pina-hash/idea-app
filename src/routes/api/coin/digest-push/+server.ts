// The Friday digest notification (IDEA Coin V2, session two, 2.13).
//
// `coin_digest_push_due()` (0249) decides everything: it answers `due: true`
// only on a Friday afternoon in Los Angeles, at most once a week, and stamps
// the week in the same statement, so a second call that week answers
// `already_sent`. That is why this route holds no credential of its own and
// checks no session: anybody calling it can only make the week's one
// notification go out at the time it was going out anyway, to the coin staff
// who turned it on. The function is granted to `service_role` alone, so the
// call goes through the push module's own service client
// (`serviceClient()` in `$lib/server/push`, the one reader of the key for
// push); nothing here reads the key itself.
//
// TWO SCHEDULERS CALL IT, ON PURPOSE: Vercel's cron (`vercel.json`, Fridays)
// and a GitHub Actions schedule (`.github/workflows/autopay.yml`) as the
// second. The weekly stamp makes the redundancy free.
//
// It never answers an error status: a scheduler that sees a 500 retries, and
// a missing function (the migration not applied yet) or an unconfigured push
// key is a state, not a fault. The answer carries counts only, never an id.

import { json } from '@sveltejs/kit';
import { pushConfigured, sendPushToUsers, serviceClient } from '$lib/server/push';
import type { RequestHandler } from './$types';

const NO_STORE = { headers: { 'cache-control': 'no-store' } };

// Not exported: a +server.ts may export only its methods (and `_`-prefixed names).
const DIGEST_PUSH_PAYLOAD = {
	title: 'IDEA Coin digest',
	body: 'This week in the coin economy is ready.',
	url: '/coin-desk/digest',
	tag: 'coin-digest'
};

async function run() {
	try {
		const admin = serviceClient();
		if (!admin) return json({ ok: false, reason: 'not_configured' }, NO_STORE);
		if (!pushConfigured()) return json({ ok: false, reason: 'push_not_configured' }, NO_STORE);
		const { data, error } = await admin.rpc('coin_digest_push_due');
		if (error) {
			const code = error.code ?? null;
			const missing = code === 'PGRST202' || code === '42883';
			return json({ ok: false, reason: missing ? 'unavailable' : 'error', code }, NO_STORE);
		}
		const answer = (data ?? {}) as { due?: boolean; reason?: string; user_ids?: unknown };
		if (!answer.due) return json({ ok: true, due: false, reason: answer.reason ?? null }, NO_STORE);
		const ids = Array.isArray(answer.user_ids) ? answer.user_ids.map(String) : [];
		const attempted = ids.length ? await sendPushToUsers(admin, ids, DIGEST_PUSH_PAYLOAD) : 0;
		return json({ ok: true, due: true, recipients: ids.length, attempted }, NO_STORE);
	} catch {
		return json({ ok: false, reason: 'unavailable' }, NO_STORE);
	}
}

export const GET: RequestHandler = () => run();
export const POST: RequestHandler = () => run();
