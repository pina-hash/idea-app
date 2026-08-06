import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type {
	BracketMatch,
	MatchEvent,
	MatchGame,
	QualMatch,
	QualPool,
	RewardLedgerRow,
	Tournament,
	TournamentEntry
} from '$lib/tournaments/tournaments';
import type { EntryStyle } from '$lib/tournaments/entry-styles';

/**
 * One match's detail view: fully PUBLIC, like every other tournament surface.
 * The whole page is reads over public-select tables -- there is no RPC here
 * and nothing to write.
 *
 * The route serves BOTH match kinds. A bracket match and a qualifying match
 * live in different tables with disjoint uuid spaces, so the id is looked up
 * in the bracket first and falls through to quals; whichever hits decides
 * `kind`, and the page renders the pieces that kind actually has.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const { data: tournament } = await supabase
		.from('tournaments')
		.select('*')
		.eq('id', params.id)
		.maybeSingle();
	if (!tournament) error(404, 'Tournament not found');

	const { data: bracketMatch } = await supabase
		.from('tournament_bracket_matches')
		.select('*')
		.eq('id', params.matchId)
		.eq('tournament_id', params.id)
		.maybeSingle();

	let qualMatch: QualMatch | null = null;
	let qualPool: QualPool | null = null;
	if (!bracketMatch) {
		const { data: qm } = await supabase
			.from('tournament_qual_matches')
			.select('*')
			.eq('id', params.matchId)
			.eq('tournament_id', params.id)
			.maybeSingle();
		qualMatch = (qm as QualMatch | null) ?? null;
		if (!qualMatch) error(404, 'Match not found');
		const { data: pool } = await supabase
			.from('tournament_qual_pools')
			.select('*')
			.eq('id', qualMatch.pool_id)
			.maybeSingle();
		qualPool = (pool as QualPool | null) ?? null;
	}

	const [entriesRes, stylesRes, eventsRes, gamesRes, bracketRes, ledgerRes] = await Promise.all([
		supabase.from('tournament_entries').select('*').eq('tournament_id', params.id),
		supabase.from('tournament_entry_styles').select('*').eq('tournament_id', params.id),
		supabase
			.from('tournament_match_events')
			.select('*')
			.eq('tournament_id', params.id)
			.eq('match_id', params.matchId)
			.order('id'),
		supabase
			.from('tournament_match_games')
			.select('*')
			.eq('bracket_match_id', params.matchId)
			.order('game_number'),
		// The sibling matches are only needed to label this one's round
		// ("Winners Final" vs "Winners Round 2") and to name where each side
		// goes next.
		supabase
			.from('tournament_bracket_matches')
			.select('id,bracket,round,slot,status,winner_id,entry_a_id,entry_b_id')
			.eq('tournament_id', params.id),
		supabase
			.from('tournament_reward_ledger')
			.select('*')
			.eq('tournament_id', params.id)
			.eq('match_id', params.matchId)
			.order('id')
	]);

	return {
		tournament: tournament as Tournament,
		kind: bracketMatch ? ('bracket' as const) : ('qual' as const),
		// `forfeit` / `forfeit_reason` arrive with select('*') once 0065 is
		// applied and are simply absent before it, which every consumer of
		// isForfeitMatch() reads as "not a forfeit".
		match: (bracketMatch as BracketMatch | null) ?? null,
		qualMatch,
		qualPool,
		entries: (entriesRes.data ?? []) as TournamentEntry[],
		entryStyles: (stylesRes.data ?? []) as EntryStyle[],
		events: (eventsRes.data ?? []) as MatchEvent[],
		games: (gamesRes.data ?? []) as MatchGame[],
		siblings: (bracketRes.data ?? []) as BracketMatch[],
		// Fails soft to empty pre-0063.
		ledger: (ledgerRes.data ?? []) as RewardLedgerRow[]
	};
};
