import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';
import type {
	BracketMatch,
	Tournament,
	TournamentEntry,
	TournamentInvite
} from '$lib/tournaments/tournaments';
import type { EntryStyle } from '$lib/tournaments/entry-styles';

/**
 * Tournament list: PUBLIC tier (no session required; /tournaments is
 * deliberately NOT in hooks.server.ts authedPrefixes). Every read here is
 * public-select under RLS, so the anonymous server client sees everything.
 * Signed-in extras: the caller's pending invites and the tournaments they
 * host (both also public data; filtered here for convenience only).
 *
 * THE BOARD (prompt 0110, item 3) reads whole entry rows and, for the LIVE
 * tournaments only, their bracket rows and banner styles: the marquee puts
 * the pair on the floor in their own banners and runs the event rail, and
 * neither is worth loading for an event nobody is playing. Everything the
 * board draws is public, which is what lets a signed-out spectator see the
 * same marquee a competitor does.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	const [tournamentsRes, entriesRes] = await Promise.all([
		supabase.from('tournaments').select('*').order('created_at', { ascending: false }),
		supabase.from('tournament_entries').select('*')
	]);

	const tournaments = (tournamentsRes.data ?? []) as Tournament[];
	const entries = (entriesRes.data ?? []) as TournamentEntry[];

	// Live tournaments' bracket rows and styles, for the marquee. `.in()` with
	// an empty list is refused by PostgREST, so the reads are skipped outright
	// when nothing is live.
	const liveIds = tournaments.filter((t) => t.status === 'live').map((t) => t.id);
	let matches: BracketMatch[] = [];
	let entryStyles: EntryStyle[] = [];
	if (liveIds.length) {
		const [matchesRes, stylesRes] = await Promise.all([
			supabase.from('tournament_bracket_matches').select('*').in('tournament_id', liveIds),
			supabase.from('tournament_entry_styles').select('*').in('tournament_id', liveIds)
		]);
		matches = (matchesRes.data ?? []) as BracketMatch[];
		// Fails soft to empty pre-0064: default banner treatment.
		entryStyles = (stylesRes.data ?? []) as EntryStyle[];
	}

	let myInvites: TournamentInvite[] = [];
	let hostedIds: string[] = [];
	// Admins manage and delete any tournament (0066 + 0067, re-gated by 0192
	// so every host RPC admits an admin), and an admin tidying up somebody
	// else's abandoned event is by definition not one of its hosts. UI only:
	// tournament_delete re-checks server-side.
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
				.select('tournament_id, entry_id, match_id, reason, amount');
			if (!admin) ledgerQuery = ledgerQuery.in('tournament_id', deletableIds);
			const { data: ledgerRows } = await ledgerQuery;
			const entrySets: Record<string, Set<string>> = {};
			// Since 0192 one award writes one ledger row per REGISTRANT, so the
			// payout COUNT is distinct awards keyed exactly as `rewardAwards`
			// keys them (entry + match + reason), never a row count. Coins stay
			// the summed rows, which is the true total paid.
			const awardSets: Record<string, Set<string>> = {};
			for (const row of (ledgerRows ?? []) as {
				tournament_id: string;
				entry_id: string;
				match_id: string | null;
				reason: string;
				amount: number;
			}[]) {
				rewardCoinsById[row.tournament_id] = (rewardCoinsById[row.tournament_id] ?? 0) + row.amount;
				(awardSets[row.tournament_id] ??= new Set()).add(
					`${row.entry_id}|${row.match_id ?? ''}|${row.reason}`
				);
				(entrySets[row.tournament_id] ??= new Set()).add(row.entry_id);
			}
			for (const [id, set] of Object.entries(entrySets)) rewardEntriesById[id] = set.size;
			for (const [id, set] of Object.entries(awardSets)) rewardCountById[id] = set.size;
		}
	}

	return {
		tournaments,
		entries,
		matches,
		entryStyles,
		myInvites,
		hostedIds,
		isAdmin: admin,
		rewardCoinsById,
		rewardEntriesById,
		rewardCountById
	};
};
