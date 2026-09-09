import { redirect } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';
import type {
	BracketMatch,
	MatchGame,
	QualMatch,
	QualPool,
	RewardRule,
	Tournament,
	TournamentEntry,
	TournamentEntryMember,
	TournamentInvite
} from '$lib/tournaments/tournaments';
import type { EntryStyle } from '$lib/tournaments/entry-styles';

/**
 * Host console: needs a session AND (a tournament_hosts row OR a site admin
 * grant). An admin manages, edits and deletes any tournament regardless of
 * who hosts it (prompt 0110, item 5); 0192 re-gated every host RPC the same
 * way through `_tournament_require_host`, so this gate is discoverability
 * only -- the UI-gating-is-convenience doctrine -- and the database is what
 * refuses a non-admin non-host (`tests/db/tournament-admin-manage.test.ts`).
 * Anyone else lands on the public view.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, `/tournaments/${params.id}`);

	const [{ data: hostRow }, admin] = await Promise.all([
		supabase
			.from('tournament_hosts')
			.select('user_id')
			.eq('tournament_id', params.id)
			.eq('user_id', claims.sub)
			.maybeSingle(),
		isAdmin(supabase, claims.sub)
	]);
	const isHost = !!hostRow;
	if (!isHost && !admin) redirect(303, `/tournaments/${params.id}`);

	const { data: tournament } = await supabase
		.from('tournaments')
		.select('*')
		.eq('id', params.id)
		.maybeSingle();
	if (!tournament) redirect(303, '/tournaments');

	const [
		entriesRes,
		membersRes,
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
		supabase.from('tournament_entry_members').select('*').eq('tournament_id', params.id),
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
		// rather than a head-only count. Since 0192 a payout is one row per
		// REGISTRANT, so the sum is the true total paid and the payout COUNT
		// is distinct awards (entry + match + reason, as `rewardAwards` keys
		// them), never the row count.
		supabase
			.from('tournament_reward_ledger')
			.select('entry_id, match_id, reason, amount')
			.eq('tournament_id', params.id)
	]);

	const ledgerRows = (ledgerRes.data ?? []) as {
		entry_id: string;
		match_id: string | null;
		reason: string;
		amount: number;
	}[];
	const rewardLedgerCoins = ledgerRows.reduce((sum, r) => sum + r.amount, 0);
	const rewardLedgerEntries = new Set(ledgerRows.map((r) => r.entry_id)).size;
	const rewardLedgerCount = new Set(
		ledgerRows.map((r) => `${r.entry_id}|${r.match_id ?? ''}|${r.reason}`)
	).size;

	return {
		tournament: tournament as Tournament,
		isHost,
		isAdmin: admin,
		entries: (entriesRes.data ?? []) as TournamentEntry[],
		// Fails soft to empty pre-0192.
		members: (membersRes.data ?? []) as TournamentEntryMember[],
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
		rewardLedgerCount,
		rewardLedgerCoins,
		rewardLedgerEntries
	};
};
