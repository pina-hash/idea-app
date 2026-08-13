/**
 * Server-side Web Push for the IDEA portal ($lib/server, so SvelteKit refuses
 * to bundle any of this client-side). The subscription ledger lives in
 * public.push_subscriptions (0063); this module is the SEND half, because
 * VAPID signing + payload encryption cannot run inside Postgres.
 *
 * Keys: PUBLIC_VAPID_PUBLIC_KEY ($env/dynamic/public, also used by the
 * browser to subscribe) + VAPID_PRIVATE_KEY ($env/dynamic/private,
 * server-only). Both unset -> pushConfigured() is false and every send is a
 * clean no-op, never a build break: a missing credential degrades, it does
 * not break the build, the way SUPABASE_SERVICE_ROLE_KEY does. Reads and
 * the pair-claim write use the service-role key: push_subscriptions is
 * own-row-select under RLS and pair_notified_at has no client write path.
 *
 * Delivery is deliberately best-effort: a dead endpoint fails silently (the
 * row is deleted only on the push service saying 404/410 Gone); any other
 * failure is swallowed. Nothing here may ever make the wrapped RPC call look
 * failed after it committed.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env as publicEnv } from '$env/dynamic/public';
import { env } from '$env/dynamic/private';

export interface PushPayload {
	title: string;
	body: string;
	/** Path the notification click opens (same-origin). */
	url: string;
	/** Collapse key: a re-send with the same tag replaces, never stacks. */
	tag?: string;
}

interface SubscriptionRow {
	endpoint: string;
	user_id: string;
	p256dh: string;
	auth: string;
}

export function pushConfigured(): boolean {
	return !!(publicEnv.PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

export function serviceClient(): SupabaseClient | null {
	const key = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!key) return null;
	return createClient(PUBLIC_SUPABASE_URL, key, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
}

function vapidDetails() {
	return {
		subject: env.VAPID_SUBJECT || 'https://ideabosco.com',
		publicKey: publicEnv.PUBLIC_VAPID_PUBLIC_KEY!,
		privateKey: env.VAPID_PRIVATE_KEY!
	};
}

/** Sends one payload to every subscription of every listed user. Returns how
 * many sends were attempted; failures are silent (410/404 prunes the row). */
export async function sendPushToUsers(
	admin: SupabaseClient,
	userIds: string[],
	payload: PushPayload
): Promise<number> {
	const targets = [...new Set(userIds)].filter(Boolean);
	if (!pushConfigured() || !targets.length) return 0;

	const { data } = await admin
		.from('push_subscriptions')
		.select('endpoint, user_id, p256dh, auth')
		.in('user_id', targets);
	const subs = (data ?? []) as SubscriptionRow[];
	if (!subs.length) return 0;

	const { subject, publicKey, privateKey } = vapidDetails();
	const body = JSON.stringify(payload);

	await Promise.all(
		subs.map(async (s) => {
			try {
				await webpush.sendNotification(
					{ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
					body,
					{ vapidDetails: { subject, publicKey, privateKey }, TTL: 60 * 60 }
				);
			} catch (e) {
				const status = (e as { statusCode?: number })?.statusCode;
				if (status === 404 || status === 410) {
					// The push service says this subscription no longer exists.
					await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
				}
				// Everything else: silent by design.
			}
		})
	);
	return subs.length;
}

/** Server-side round naming for notification copy (no maxRound context here,
 * so finals are named by bracket rather than detected by round). */
export function matchLabel(bracket: string, round: number): string {
	if (bracket === 'grand_final') return 'Grand Final';
	if (bracket === 'grand_final_reset') return 'Bracket Reset';
	return `${bracket === 'winners' ? 'Winners' : 'Losers'} round ${round}`;
}

interface ClaimedMatch {
	id: string;
	bracket: string;
	round: number;
	entry_a_id: string;
	entry_b_id: string;
}

/**
 * The "your next match is set" sweep. Atomically CLAIMS every fully-paired,
 * not-yet-notified, not-complete bracket match of the tournament (one UPDATE
 * ... WHERE pair_notified_at IS NULL, so concurrent sweeps never double-send),
 * then pushes both competitors of each claimed match. Runs after every
 * mutation that can pair a match (generate bracket, submit result, correct
 * result); repeat calls are no-ops. Returns the number of sends attempted.
 */
export async function sweepPairNotifications(tournamentId: string): Promise<number> {
	if (!pushConfigured()) return 0;
	const admin = serviceClient();
	if (!admin) return 0;

	const { data: claimed } = await admin
		.from('tournament_bracket_matches')
		.update({ pair_notified_at: new Date().toISOString() })
		.eq('tournament_id', tournamentId)
		.is('pair_notified_at', null)
		.not('entry_a_id', 'is', null)
		.not('entry_b_id', 'is', null)
		.neq('status', 'complete')
		.select('id, bracket, round, entry_a_id, entry_b_id');
	const matches = (claimed ?? []) as ClaimedMatch[];
	if (!matches.length) return 0;

	const [{ data: t }, { data: entryRows }] = await Promise.all([
		admin.from('tournaments').select('name').eq('id', tournamentId).maybeSingle(),
		admin
			.from('tournament_entries')
			.select('id, user_id, display_name')
			.eq('tournament_id', tournamentId)
	]);
	const entries = new Map(
		(entryRows ?? []).map((e: { id: string; user_id: string | null; display_name: string }) => [
			e.id,
			e
		])
	);
	const tournamentName = (t?.name as string | undefined) ?? 'Tournament';

	let attempted = 0;
	for (const m of matches) {
		const a = entries.get(m.entry_a_id);
		const b = entries.get(m.entry_b_id);
		if (!a || !b) continue;
		const linked = [a.user_id, b.user_id].filter((u): u is string => !!u);
		if (!linked.length) continue;
		attempted += await sendPushToUsers(admin, linked, {
			title: 'Your next match is set',
			body: `${a.display_name} vs ${b.display_name} — ${matchLabel(m.bracket, m.round)} · ${tournamentName}`,
			url: `/tournaments/${tournamentId}`,
			tag: `match-${m.id}`
		});
	}
	return attempted;
}
