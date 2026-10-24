/**
 * A TOURNAMENT'S TEAMS, TAKEN FROM A CLASS (0297, ledger 0433, connector gap
 * 5f6a37e8). Mr. Pina, 2026-10-23: "class teams are the source of truth;
 * tournaments follow them". The class team set is the record; an entry made
 * from it is LINKED, follows the team's name, picture, description and look,
 * and follows a teacher's moves while registration is open. Every rule is in
 * the database; this module only reads and words what it answers.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** One class team set a host may take entries from (`tournament_team_set_options`). */
export interface TeamSetOption {
	id: string;
	label: string;
	/** The class, as the classroom names it ("IDEA 100 · Block 1"). */
	class: string | null;
	teams: number;
	/** The biggest team's size, so a host sees a team-size clash before pressing. */
	largest: number;
	/** How many of its teams this tournament already follows. */
	linked_here: number;
}

/** What `tournament_take_team_set` answers. */
export interface TakeTeamSetResult {
	created: number;
	linked: number;
	already: number;
	players_added: number;
	no_account: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The one sentence a host reads after taking a team set. */
export function takeTeamSetSentence(r: TakeTeamSetResult): string {
	const parts: string[] = [];
	if (r.created) parts.push(`${plural(r.created, 'team')} added`);
	if (r.linked) parts.push(`${plural(r.linked, 'entry', 'entries')} you made by hand now ${r.linked === 1 ? 'follows' : 'follow'} ${r.linked === 1 ? 'its' : 'their'} class team`);
	if (r.already) parts.push(`${plural(r.already, 'team')} already here`);
	const head = parts.length ? parts.join(', ') : 'Nothing to add';
	const players = r.players_added ? ` ${plural(r.players_added, 'player')} put on their teams.` : '';
	const waiting = r.no_account
		? ` ${plural(r.no_account, 'student has', 'students have')} not signed in to the site yet; once they have, they can join their team's entry.`
		: '';
	return `${head}.${players}${waiting}`;
}

/** Why a set cannot be taken as it stands, or null. */
export function teamSetBlocker(o: TeamSetOption, teamSize: number, status: string): string | null {
	if (status !== 'registration_open' && status !== 'seeding') return 'Open registration first.';
	if (o.teams === 0) return 'No teams in this draw.';
	if (o.linked_here >= o.teams) return 'Every team is already here.';
	if (o.largest > teamSize) return `Its biggest team has ${o.largest}; raise the team size to ${o.largest} in Settings first.`;
	return null;
}

/** The host console's two reads, best effort: a deployment before 0297 answers empty. */
export async function loadClassTeamLinks(
	supabase: SupabaseClient,
	tournamentId: string,
	withOptions: boolean
): Promise<{ linked: string[]; options: TeamSetOption[] }> {
	const [linkedRes, optionsRes] = await Promise.all([
		supabase.rpc('tournament_class_linked_entries', { p_tournament_id: tournamentId }),
		withOptions
			? supabase.rpc('tournament_team_set_options', { p_tournament_id: tournamentId })
			: Promise.resolve({ data: [], error: null })
	]);
	return {
		linked: !linkedRes.error && Array.isArray(linkedRes.data) ? (linkedRes.data as string[]) : [],
		options: !optionsRes.error && Array.isArray(optionsRes.data) ? (optionsRes.data as TeamSetOption[]) : []
	};
}
