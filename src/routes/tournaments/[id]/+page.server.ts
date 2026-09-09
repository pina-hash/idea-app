import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';
import {
	myEntryFor,
	type BracketMatch,
	type MatchGame,
	type QualMatch,
	type QualPool,
	type RewardLedgerRow,
	type RewardRule,
	type Tournament,
	type TournamentEntry,
	type TournamentEntryMember,
	type TournamentInvite
} from '$lib/tournaments/tournaments';
import type { EntryStyle } from '$lib/tournaments/entry-styles';

/**
 * The live tournament view: fully PUBLIC (no session, no cookie needed) --
 * every table is public-select under RLS, and the page subscribes to
 * Realtime client-side so signed-out spectators see updates live too.
 * Signed-in extras (own entry, own pending invite, host flag, admin flag)
 * are convenience lookups over the same public data.
 *
 * "MY ENTRY" IS `myEntryFor` (0192): membership first, then the entry's own
 * user_id. A teammate who joined somebody else's entry has no
 * entries.user_id of their own and is still in the tournament, so the old
 * inline `entries.find` against the claims would have told them they were
 * not. `tests/tournament-members.test.ts` sweeps for that inline form.
 *
 * `canManage` is a host row OR a site admin (item 5): the admin manages any
 * tournament, and every host RPC re-checks the same rule through
 * `_tournament_require_host`, so this flag only decides which links render.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase, claims } }) => {
	const { data: tournament } = await supabase
		.from('tournaments')
		.select('*')
		.eq('id', params.id)
		.maybeSingle();
	if (!tournament) error(404, 'Tournament not found');

	const [
		entriesRes,
		membersRes,
		poolsRes,
		qualRes,
		bracketRes,
		gamesRes,
		hostsRes,
		rulesRes,
		ledgerRes,
		stylesRes
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
		supabase.from('tournament_hosts').select('user_id').eq('tournament_id', params.id),
		supabase.from('tournament_reward_rules').select('*').eq('tournament_id', params.id),
		supabase
			.from('tournament_reward_ledger')
			.select('*')
			.eq('tournament_id', params.id)
			.order('id', { ascending: false }),
		supabase.from('tournament_entry_styles').select('*').eq('tournament_id', params.id)
	]);

	const hostIds = (hostsRes.data ?? []).map((r: { user_id: string }) => r.user_id);
	const entries = (entriesRes.data ?? []) as TournamentEntry[];
	// Fails soft to empty pre-0192 (a select on a missing table yields no
	// data): every entry then reads as having no registrants, and the
	// surfaces that need the members RPCs stay off the page.
	const members = (membersRes.data ?? []) as TournamentEntryMember[];

	let myInvite: TournamentInvite | null = null;
	let admin = false;
	if (claims) {
		const [invRes, adminRes] = await Promise.all([
			supabase
				.from('tournament_invites')
				.select('*')
				.eq('tournament_id', params.id)
				.eq('invited_user_id', claims.sub)
				.eq('status', 'pending')
				.maybeSingle(),
			isAdmin(supabase, claims.sub)
		]);
		myInvite = (invRes.data as TournamentInvite | null) ?? null;
		admin = adminRes;
	}

	const uid = claims?.sub ?? null;
	const isHost = uid !== null && hostIds.includes(uid);
	const myEntry = myEntryFor(entries, members, uid);
	// The viewer's OWN member row (their chosen name on the roster), not
	// their entry: `myEntryFor` above is the one spelling of that.
	const myMember = uid === null ? null : (members.find((m) => m.user_id === uid) ?? null);

	return {
		tournament: tournament as Tournament,
		entries,
		members,
		pools: (poolsRes.data ?? []) as QualPool[],
		qualMatches: (qualRes.data ?? []) as QualMatch[],
		bracketMatches: (bracketRes.data ?? []) as BracketMatch[],
		games: (gamesRes.data ?? []) as MatchGame[],
		isHost,
		isAdmin: admin,
		canManage: isHost || admin,
		myEntry,
		myMember,
		myInvite,
		// Reward tables fail soft to empty pre-0063 (a select error yields no
		// data), so the page renders without the migration applied.
		rewardRules: (rulesRes.data ?? []) as RewardRule[],
		rewardLedger: (ledgerRes.data ?? []) as RewardLedgerRow[],
		// Same fail-soft rule: no 0064 yet means no styles, and every entry
		// renders with the Phase 1 default treatment.
		entryStyles: (stylesRes.data ?? []) as EntryStyle[]
	};
};
