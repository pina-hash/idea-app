import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';
import type {
	Tournament,
	TournamentEntry,
	TournamentInvite
} from '$lib/tournaments/tournaments';

/**
 * Tournament list: PUBLIC tier (no session required; /tournaments is
 * deliberately NOT in hooks.server.ts authedPrefixes). Every read here is
 * public-select under RLS, so the anonymous server client sees everything.
 * Signed-in extras: the caller's pending invites and the tournaments they
 * host (both also public data; filtered here for convenience only).
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	const [tournamentsRes, entriesRes] = await Promise.all([
		supabase.from('tournaments').select('*').order('created_at', { ascending: false }),
		supabase.from('tournament_entries').select('id, tournament_id, display_name')
	]);

	const tournaments = (tournamentsRes.data ?? []) as Tournament[];
	const entryRows = (entriesRes.data ?? []) as Pick<
		TournamentEntry,
		'id' | 'tournament_id' | 'display_name'
	>[];

	let myInvites: TournamentInvite[] = [];
	let hostedIds: string[] = [];
	// Admins can delete any tournament (0066 + 0067), and an admin tidying up
	// somebody else's abandoned event is by definition not one of its hosts --
	// this list is the only surface that case can act from, since the host
	// console redirects non-hosts away. UI only: tournament_delete re-checks
	// server-side.
	let admin = false;
	// Real coin totals + distinct entry counts per tournament, for the
	// payout-loss warning (0068) on this page's compact delete control.
	// Only fetched for tournaments this account could actually delete
	// (admin: all of them; otherwise: the ones hosted), since it is
	// otherwise wasted work for a page most visitors see with no delete
	// control at all.
	let rewardCoinsById: Record<string, number> = {};
	let rewardEntriesById: Record<string, number> = {};
	let rewardCountById: Record<string, number> = {};
	if (claims) {
		const [invitesRes, hostsRes, adminRes] = await Promise.all([
			supabase
				.from('tournament_invites')
				.select('*')
				.eq('invited_user_id', claims.sub)
				.eq('status', 'pending'),
			supabase.from('tournament_hosts').select('tournament_id').eq('user_id', claims.sub),
			isAdmin(supabase, claims.sub)
		]);
		myInvites = (invitesRes.data ?? []) as TournamentInvite[];
		hostedIds = (hostsRes.data ?? []).map((r: { tournament_id: string }) => r.tournament_id);
		admin = adminRes;

		const deletableIds = admin ? tournaments.map((t) => t.id) : hostedIds;
		if (deletableIds.length) {
			let ledgerQuery = supabase
				.from('tournament_reward_ledger')
				.select('tournament_id, entry_id, amount');
			if (!admin) ledgerQuery = ledgerQuery.in('tournament_id', deletableIds);
			const { data: ledgerRows } = await ledgerQuery;
			const entrySets: Record<string, Set<string>> = {};
			for (const row of (ledgerRows ?? []) as {
				tournament_id: string;
				entry_id: string;
				amount: number;
			}[]) {
				rewardCoinsById[row.tournament_id] = (rewardCoinsById[row.tournament_id] ?? 0) + row.amount;
				rewardCountById[row.tournament_id] = (rewardCountById[row.tournament_id] ?? 0) + 1;
				(entrySets[row.tournament_id] ??= new Set()).add(row.entry_id);
			}
			for (const [id, set] of Object.entries(entrySets)) rewardEntriesById[id] = set.size;
		}
	}

	return {
		tournaments,
		entryRows,
		myInvites,
		hostedIds,
		isAdmin: admin,
		rewardCoinsById,
		rewardEntriesById,
		rewardCountById
	};
};
