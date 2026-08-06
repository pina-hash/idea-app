import { json } from '@sveltejs/kit';
import {
	matchLabel,
	pushConfigured,
	sendPushToUsers,
	serviceClient,
	sweepPairNotifications
} from '$lib/server/push';
import type { RequestHandler } from './$types';

/**
 * Tournament mutations that trigger web push, wrapped as ONE server endpoint.
 *
 * Why a SvelteKit wrapper rather than a Database Webhook / pg_net: the send
 * needs the server-only VAPID private key and web-push's crypto, which cannot
 * run in Postgres, and this repo already does server-triggered side effects
 * from SvelteKit server routes (the coin-ledger + track-publish idiom) -- no
 * Edge Function deploy surface exists here. Wrapping the RPC call (instead of
 * having the browser fire a separate "now notify" request after it) makes the
 * notification part of the same server request as the mutation, so a host tab
 * closing mid-flight can never lose it.
 *
 * Authorization is unchanged from Phase 1: each RPC is called through the
 * caller's own cookie session (locals.supabase) and re-checks the hosts row
 * server-side. The service-role key is used only AFTER the RPC succeeded, for
 * the subscription reads + the pair_notified_at claim, neither of which has a
 * client write path.
 *
 * Actions:
 *   { action: 'generate-bracket', tournamentId }
 *   { action: 'submit-result',   tournamentId, matchId, result }
 *   { action: 'correct-result',  tournamentId, matchId, result, reason }
 *   { action: 'ping',            matchId, entryId }        (immediate, any state)
 *
 * The first three run the Phase 1 RPC, then sweep the tournament for
 * newly-paired bracket matches (both slots filled, pair_notified_at null) and
 * push both competitors "your next match is set". The sweep's claim is one
 * atomic UPDATE, so re-runs are no-ops. Push being unconfigured never fails
 * the mutation: the RPC result still returns, notified reads 0.
 */

const RPC_BY_ACTION: Record<string, string> = {
	'generate-bracket': 'tournament_generate_bracket',
	'submit-result': 'tournament_submit_match_result',
	'correct-result': 'tournament_correct_match_result'
};

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ ok: false, error: 'You must be signed in.' }, { status: 401 });
	}

	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
	}

	const action = typeof body.action === 'string' ? body.action : '';
	const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : '');

	if (action === 'ping') {
		const { data, error } = await supabase.rpc('tournament_ping_entry', {
			p_match_id: str('matchId'),
			p_entry_id: str('entryId')
		});
		if (error) return json({ ok: false, error: error.message }, { status: 400 });
		if (!pushConfigured() || !serviceClient()) {
			return json(
				{ ok: false, error: 'Push notifications are not configured on this deployment.' },
				{ status: 503 }
			);
		}
		const target = data as {
			tournament_id: string;
			tournament_name: string;
			user_id: string;
			entry_name: string;
			opponent_name: string | null;
			bracket: string;
			round: number;
		};
		const admin = serviceClient()!;
		const sent = await sendPushToUsers(admin, [target.user_id], {
			title: `You're up, ${target.entry_name}`,
			body: `${matchLabel(target.bracket, target.round)}${
				target.opponent_name ? ` vs ${target.opponent_name}` : ''
			} — head to the arena · ${target.tournament_name}`,
			url: `/tournaments/${target.tournament_id}`,
			tag: `ping-${str('matchId')}-${str('entryId')}`
		});
		return json({
			ok: true,
			sent,
			note: sent === 0 ? 'That account has no subscribed devices.' : undefined
		});
	}

	const rpcName = RPC_BY_ACTION[action];
	if (!rpcName) {
		return json({ ok: false, error: `Unknown action "${action}".` }, { status: 400 });
	}
	const tournamentId = str('tournamentId');
	if (!tournamentId) {
		return json({ ok: false, error: 'tournamentId is required.' }, { status: 400 });
	}

	const args: Record<string, unknown> =
		action === 'generate-bracket'
			? { p_tournament_id: tournamentId }
			: action === 'submit-result'
				? { p_match_id: str('matchId'), p_result: body.result }
				: { p_match_id: str('matchId'), p_new_result: body.result, p_reason: str('reason') };

	const { data, error } = await supabase.rpc(rpcName, args);
	if (error) return json({ ok: false, error: error.message }, { status: 400 });

	// The mutation committed; notification delivery is best-effort from here.
	let notified = 0;
	try {
		notified = await sweepPairNotifications(tournamentId);
	} catch {
		// Never let a push failure make a committed result look failed.
	}
	return json({ ok: true, result: data ?? null, notified });
};
