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
	if (claims) {
		const [invitesRes, hostsRes] = await Promise.all([
			supabase
				.from('tournament_invites')
				.select('*')
				.eq('invited_user_id', claims.sub)
				.eq('status', 'pending'),
			supabase.from('tournament_hosts').select('tournament_id').eq('user_id', claims.sub)
		]);
		myInvites = (invitesRes.data ?? []) as TournamentInvite[];
		hostedIds = (hostsRes.data ?? []).map((r: { tournament_id: string }) => r.tournament_id);
	}

	return { tournaments, entryRows, myInvites, hostedIds };
};
