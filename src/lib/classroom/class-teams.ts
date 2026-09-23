/**
 * POSTED TEAMS ON THE CLASS PAGE (ledger 0297, package LIVE).
 *
 * `0223` built everything a posted roster needs -- the posting window, the
 * audience-gated read (`classroom_team_board` answers a student only the sets
 * that are showing), the membership-gated style write -- and the People tab's
 * "Post to the class" told the teacher "The whole class can see these teams"
 * while no student surface rendered one. That was a false acknowledgement.
 * This is the read the class page makes to make it true.
 *
 * WHAT IT CARRIES IS NARROWER THAN WHAT THE RPC ANSWERS, ON PURPOSE. The board
 * payload names every member by email and the last decorator by email, because
 * the teacher's People tab needs both. The class page needs neither: a student
 * reads a team as names. So this projects each set down to labels, names, the
 * team's own style and the caller's own membership, and the emails never
 * reach the class page's payload at all.
 *
 * FAILS SOFT TO NOTHING. A deployment before 0223 (`unavailable`), a read that
 * errors, or a class with nothing posted all answer an empty list, which the
 * page renders as no board: posted teams are one card on a page whose real
 * content is the class, and they must not take the class down with them.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createTeamTransports, type Team, type TeamSet } from './teams';

/** One team as the class page shows it: its name, its style, whether it is mine, and names. */
export interface ClassTeam
	extends Pick<
		Team,
		| 'id'
		| 'team_number'
		| 'name'
		| 'accent_color'
		| 'background_type'
		| 'background_value'
		| 'badge'
		| 'flourish'
		| 'tagline'
		| 'mine'
	> {
	members: string[];
}

export interface ClassTeamSet {
	id: string;
	label: string;
	teams: ClassTeam[];
}

/** The sets the class can see right now, projected to what the class page draws. */
export function postedTeamSets(sets: readonly TeamSet[]): ClassTeamSet[] {
	return sets
		.filter((s) => s.showing === true)
		.map((s) => ({
			id: s.id,
			label: s.label,
			teams: s.teams.map((t) => ({
				id: t.id,
				team_number: t.team_number,
				name: t.name,
				accent_color: t.accent_color,
				background_type: t.background_type,
				background_value: t.background_value,
				badge: t.badge,
				flourish: t.flourish,
				tagline: t.tagline,
				mine: t.mine === true,
				members: t.members.map((m) => m.display_name)
			}))
		}));
}

/** The class page's read: the same audience-gated board the People tab uses. */
export async function loadPostedTeams(
	supabase: SupabaseClient,
	sectionId: string
): Promise<ClassTeamSet[]> {
	try {
		const res = await createTeamTransports(supabase).board(sectionId);
		return res.ok ? postedTeamSets(res.sets) : [];
	} catch {
		return [];
	}
}
