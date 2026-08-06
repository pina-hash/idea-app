import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type {
	BracketMatch,
	MatchGame,
	QualMatch,
	QualPool,
	RewardRule,
	Tournament,
	TournamentEntry,
	TournamentInvite
} from '$lib/tournaments/tournaments';

/**
 * Host console: needs a session AND a tournament_hosts row. This gate is
 * discoverability only -- every host RPC re-checks the hosts row server-side
 * (the UI-gating-is-convenience doctrine). Non-hosts land on the public view.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, `/tournaments/${params.id}`);

	const { data: hostRow } = await supabase
		.from('tournament_hosts')
		.select('user_id')
		.eq('tournament_id', params.id)
		.eq('user_id', claims.sub)
		.maybeSingle();
	if (!hostRow) redirect(303, `/tournaments/${params.id}`);

	const { data: tournament } = await supabase
		.from('tournaments')
		.select('*')
		.eq('id', params.id)
		.maybeSingle();
	if (!tournament) redirect(303, '/tournaments');

	const [entriesRes, poolsRes, qualRes, bracketRes, gamesRes, invitesRes, hostsRes, rulesRes] =
		await Promise.all([
			supabase
				.from('tournament_entries')
				.select('*')
				.eq('tournament_id', params.id)
				.order('seed', { ascending: true, nullsFirst: false }),
			supabase.from('tournament_qual_pools').select('*').eq('tournament_id', params.id),
			supabase
				.from('tournament_qual_matches')
				.select('*')
				.eq('tournament_id', params.id)
				.order('sequence'),
			supabase.from('tournament_bracket_matches').select('*').eq('tournament_id', params.id),
			supabase.from('tournament_match_games').select('*').eq('tournament_id', params.id),
			supabase
				.from('tournament_invites')
				.select('*')
				.eq('tournament_id', params.id)
				.order('created_at'),
			supabase.from('tournament_hosts').select('*').eq('tournament_id', params.id),
			supabase.from('tournament_reward_rules').select('*').eq('tournament_id', params.id)
		]);

	return {
		tournament: tournament as Tournament,
		entries: (entriesRes.data ?? []) as TournamentEntry[],
		pools: (poolsRes.data ?? []) as QualPool[],
		qualMatches: (qualRes.data ?? []) as QualMatch[],
		bracketMatches: (bracketRes.data ?? []) as BracketMatch[],
		games: (gamesRes.data ?? []) as MatchGame[],
		invites: (invitesRes.data ?? []) as TournamentInvite[],
		hostCount: (hostsRes.data ?? []).length,
		// Fails soft to empty pre-0063.
		rewardRules: (rulesRes.data ?? []) as RewardRule[]
	};
};
