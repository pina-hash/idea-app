import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type {
	BracketMatch,
	MatchGame,
	QualMatch,
	QualPool,
	Tournament,
	TournamentEntry,
	TournamentInvite
} from '$lib/tournaments/tournaments';

/**
 * The live tournament view: fully PUBLIC (no session, no cookie needed) --
 * every table is public-select under RLS, and the page subscribes to
 * Realtime client-side so signed-out spectators see updates live too.
 * Signed-in extras (own entry, own pending invite, host flag) are
 * convenience lookups over the same public data.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase, claims } }) => {
	const { data: tournament } = await supabase
		.from('tournaments')
		.select('*')
		.eq('id', params.id)
		.maybeSingle();
	if (!tournament) error(404, 'Tournament not found');

	const [entriesRes, poolsRes, qualRes, bracketRes, gamesRes, hostsRes] = await Promise.all([
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
		supabase.from('tournament_hosts').select('user_id').eq('tournament_id', params.id)
	]);

	const hostIds = (hostsRes.data ?? []).map((r: { user_id: string }) => r.user_id);
	const entries = (entriesRes.data ?? []) as TournamentEntry[];

	let myInvite: TournamentInvite | null = null;
	if (claims) {
		const { data: inv } = await supabase
			.from('tournament_invites')
			.select('*')
			.eq('tournament_id', params.id)
			.eq('invited_user_id', claims.sub)
			.eq('status', 'pending')
			.maybeSingle();
		myInvite = (inv as TournamentInvite | null) ?? null;
	}

	return {
		tournament: tournament as Tournament,
		entries,
		pools: (poolsRes.data ?? []) as QualPool[],
		qualMatches: (qualRes.data ?? []) as QualMatch[],
		bracketMatches: (bracketRes.data ?? []) as BracketMatch[],
		games: (gamesRes.data ?? []) as MatchGame[],
		isHost: !!claims && hostIds.includes(claims.sub),
		myEntry: claims ? (entries.find((e) => e.user_id === claims.sub) ?? null) : null,
		myInvite
	};
};
