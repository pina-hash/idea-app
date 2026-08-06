import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type {
	BracketMatch,
	MatchGame,
	QualMatch,
	QualPool,
	RewardLedgerRow,
	Tournament,
	TournamentEntry
} from '$lib/tournaments/tournaments';
import type { EntryStyle } from '$lib/tournaments/entry-styles';

/**
 * One entry's detail view within a tournament: fully PUBLIC, reads only.
 *
 * The identity rule holds here as everywhere else -- this page is built
 * entirely from tournament_entries.display_name / thumbnail_url and the
 * entry's own tournament_entry_styles row. It never touches profiles, and
 * the entry's user_id is deliberately not returned.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const { data: tournament } = await supabase
		.from('tournaments')
		.select('*')
		.eq('id', params.id)
		.maybeSingle();
	if (!tournament) error(404, 'Tournament not found');

	const { data: entry } = await supabase
		.from('tournament_entries')
		.select('*')
		.eq('id', params.entryId)
		.eq('tournament_id', params.id)
		.maybeSingle();
	if (!entry) error(404, 'Entry not found');

	const [entriesRes, stylesRes, bracketRes, qualRes, poolsRes, gamesRes, ledgerRes] =
		await Promise.all([
			supabase.from('tournament_entries').select('*').eq('tournament_id', params.id),
			supabase.from('tournament_entry_styles').select('*').eq('tournament_id', params.id),
			supabase.from('tournament_bracket_matches').select('*').eq('tournament_id', params.id),
			supabase
				.from('tournament_qual_matches')
				.select('*')
				.eq('tournament_id', params.id)
				.order('sequence'),
			supabase.from('tournament_qual_pools').select('*').eq('tournament_id', params.id),
			supabase.from('tournament_match_games').select('*').eq('tournament_id', params.id),
			supabase
				.from('tournament_reward_ledger')
				.select('*')
				.eq('tournament_id', params.id)
				.eq('entry_id', params.entryId)
				.order('id')
		]);

	return {
		tournament: tournament as Tournament,
		entry: entry as TournamentEntry,
		entries: (entriesRes.data ?? []) as TournamentEntry[],
		entryStyles: (stylesRes.data ?? []) as EntryStyle[],
		bracketMatches: (bracketRes.data ?? []) as BracketMatch[],
		qualMatches: (qualRes.data ?? []) as QualMatch[],
		pools: (poolsRes.data ?? []) as QualPool[],
		games: (gamesRes.data ?? []) as MatchGame[],
		// Fails soft to empty pre-0063.
		ledger: (ledgerRes.data ?? []) as RewardLedgerRow[]
	};
};
