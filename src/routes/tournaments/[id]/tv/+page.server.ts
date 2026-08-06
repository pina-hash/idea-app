import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type {
	BracketMatch,
	MatchGame,
	Tournament,
	TournamentEntry
} from '$lib/tournaments/tournaments';
import type { EntryStyle } from '$lib/tournaments/entry-styles';

/**
 * TV mode: the projector view. FULLY PUBLIC and deliberately session-blind --
 * it loads nothing that depends on who is watching, renders no sign-in
 * prompt and no host control, because the machine driving a shop TV is
 * nobody's account. Every table it reads is public-select under RLS (0062 /
 * 0064), and the page subscribes to the SAME realtime channel the public
 * live view uses, so it never polls.
 *
 * /tournaments is not in hooks.server.ts authedPrefixes, so this route needs
 * no guard of its own -- and must not gain one.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const { data: tournament } = await supabase
		.from('tournaments')
		.select('*')
		.eq('id', params.id)
		.maybeSingle();
	if (!tournament) error(404, 'Tournament not found');

	const [entriesRes, bracketRes, gamesRes, stylesRes] = await Promise.all([
		supabase
			.from('tournament_entries')
			.select('*')
			.eq('tournament_id', params.id)
			.order('seed', { ascending: true, nullsFirst: false }),
		supabase.from('tournament_bracket_matches').select('*').eq('tournament_id', params.id),
		supabase.from('tournament_match_games').select('*').eq('tournament_id', params.id),
		supabase.from('tournament_entry_styles').select('*').eq('tournament_id', params.id)
	]);

	return {
		tournament: tournament as Tournament,
		entries: (entriesRes.data ?? []) as TournamentEntry[],
		bracketMatches: (bracketRes.data ?? []) as BracketMatch[],
		games: (gamesRes.data ?? []) as MatchGame[],
		// Fails soft to empty pre-0064: every entry renders in the default
		// treatment and nothing else changes.
		entryStyles: (stylesRes.data ?? []) as EntryStyle[]
	};
};
