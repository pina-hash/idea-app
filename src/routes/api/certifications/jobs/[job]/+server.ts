import { json } from '@sveltejs/kit';
import { serviceClient } from '$lib/server/push';
import { isAdmin } from '$lib/server/admin';
import { certSiteOrigin } from '$lib/server/certifications/gate';
import { isCertJob, runCertJob, schedulerAuthorized, throttled } from '$lib/server/certifications/jobs';
import type { RequestHandler } from './$types';

/**
 * THE SCHEDULED JOBS' ONE DOOR (ledger 0391, DECISIONS D4). `vercel.json`
 * calls `/api/certifications/jobs/<job>` once a day each for `mirror`,
 * `dormant`, `expiry` and `emails`; an admin may call one by hand.
 *
 * WHO GETS IN: a signed-in admin (`isAdmin` on the caller's own client), or the
 * scheduler. The scheduler check is the one the audit found on the repository's
 * existing cron route, `/api/coin/autopay`, which is NO CHECK: that route holds
 * no credential because its function can only pay what is owed. The same holds
 * here (every job is idempotent housekeeping), so with `CRON_SECRET` unset the
 * scheduler path is open as autopay's is, and with it set Vercel's own
 * `Authorization: Bearer <CRON_SECRET>` is required. See `jobs.ts`. A refused
 * caller gets the 404 every other certifier surface gives; an unknown job gets
 * the same 404, so a probe learns nothing.
 *
 * THE WORK RUNS ON `serviceClient()` from `$lib/server/push.ts`, an existing
 * reader of the service key; absent, the route answers 503 `not_configured`.
 */
async function run({ params, request, url, locals }: Parameters<RequestHandler>[0]) {
	const job = params.job;
	if (!isCertJob(job)) return new Response(null, { status: 404 });

	let admin = false;
	if (locals.claims) {
		try {
			admin = await isAdmin(locals.supabase, locals.claims.sub);
		} catch {
			admin = false;
		}
	}
	if (!admin) {
		if (!schedulerAuthorized(request)) return new Response(null, { status: 404 });
		if (throttled(job)) {
			return json({ ok: false, job, reason: 'throttled', message: 'This job ran less than a minute ago.' }, { status: 429, headers: { 'cache-control': 'no-store' } });
		}
	}

	const client = serviceClient();
	if (!client) {
		return json({ ok: false, job, reason: 'not_configured' }, { status: 503, headers: { 'cache-control': 'no-store' } });
	}
	const summary = await runCertJob(job, client, certSiteOrigin(url));
	return json(summary, { status: summary.ok ? 200 : 500, headers: { 'cache-control': 'no-store' } });
}

export const GET: RequestHandler = (event) => run(event);
export const POST: RequestHandler = (event) => run(event);
