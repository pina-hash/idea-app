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
import type { EntryStyle } from '$lib/tournaments/entry-styles';

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

	const [
		entriesRes,
		poolsRes,
		qualRes,
		bracketRes,
		gamesRes,
		invitesRes,
		hostsRes,
		rulesRes,
		stylesRes,
		ledgerRes
	] = await Promise.all([
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
		supabase.from('tournament_reward_rules').select('*').eq('tournament_id', params.id),
		supabase.from('tournament_entry_styles').select('*').eq('tournament_id', params.id),
		// The console never lists individual payouts, but the delete flow's
		// payout-loss warning (0068) needs the real coin total and distinct
		// entry count, not just a row count, so this pulls entry_id + amount
		// rather than a head-only count.
		supabase
			.from('tournament_reward_ledger')
			.select('entry_id, amount')
			.eq('tournament_id', params.id)
	]);

	const ledgerRows = (ledgerRes.data ?? []) as { entry_id: string; amount: number }[];
	const rewardLedgerCoins = ledgerRows.reduce((sum, r) => sum + r.amount, 0);
	const rewardLedgerEntries = new Set(ledgerRows.map((r) => r.entry_id)).size;

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
		rewardRules: (rulesRes.data ?? []) as RewardRule[],
		// Fails soft to empty pre-0064.
		entryStyles: (stylesRes.data ?? []) as EntryStyle[],
		rewardLedgerCount: ledgerRows.length,
		rewardLedgerCoins,
		rewardLedgerEntries
	};
};
