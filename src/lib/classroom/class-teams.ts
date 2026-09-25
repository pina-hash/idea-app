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
 * reads a team as names. So this projects each set down to labels, its posting
 * window, names, the team's own style and the caller's own membership, and the
 * emails never reach the class page's payload at all.
 *
 * FAILS SOFT TO NOTHING. A deployment before 0223 (`unavailable`), a read that
 * errors, or a class with nothing posted all answer an empty list, which the
 * page renders as no board: posted teams are one card on a page whose real
 * content is the class, and they must not take the class down with them.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatDue } from './classroom';
import { sectionTabs } from './nav';
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
	/** When the teacher posted it, and when it comes down (null: until they take it down). */
	posted_at: string | null;
	visible_until: string | null;
	teams: ClassTeam[];
}

/** The sets the class can see right now, projected to what the class page draws. */
export function postedTeamSets(sets: readonly TeamSet[]): ClassTeamSet[] {
	return sets
		.filter((s) => s.showing === true)
		.map((s) => ({
			id: s.id,
			label: s.label,
			posted_at: s.posted_at ?? null,
			visible_until: s.visible_until ?? null,
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

/** One of the caller's own teams, with the draw it belongs to. */
export interface OwnTeam {
	set: ClassTeamSet;
	team: ClassTeam;
}

/**
 * THE CALLER'S OWN TEAMS, ACROSS EVERY POSTED DRAW, in the board's order
 * (newest draw first). The class page draws these FIRST, above every board
 * (ledger 0298, R23): a student opening the class should see their team
 * without opening anything, and with two draws posted the second draw's card
 * must not sit below the first draw's board.
 *
 * `mine` is the database's answer, never re-derived here.
 */
export function ownTeams(sets: readonly ClassTeamSet[]): OwnTeam[] {
	return sets.flatMap((set) => set.teams.filter((t) => t.mine).map((team) => ({ set, team })));
}

/**
 * WHERE A TEACHER MANAGES A DRAW: the People tab, read from `sectionTabs` so
 * the link and the tab bar cannot name two different places.
 */
export function teamsManageLink(sectionId: string): { href: string; label: string } {
	const tab = sectionTabs(sectionId).find((t) => t.id === 'people');
	// The People tab is always in the list; the fallback only keeps the type total.
	return tab ? { href: tab.href, label: tab.label } : { href: `/classroom/${sectionId}/people`, label: 'People' };
}

/**
 * THE ONE LINE A TEACHER READS ON THE CLASS PAGE WHILE A DRAW IS POSTED
 * (ledger 0298, R23): "Teams posted until Sep 26, 11:59 PM". Null when nothing
 * is posted, which renders nothing.
 *
 * It exists because a teacher belongs to no team, so before it the only thing
 * a teacher saw of a posted draw on their own class page was a closed board
 * with a label on it, and a draw that the class could see read the same as a
 * draw that nobody could. The date is printed by `formatDue`, the classroom's
 * one date string, in the school's zone.
 */
export function postedTeamsNotice(sets: readonly ClassTeamSet[], today?: string | null): string | null {
	if (sets.length === 0) return null;
	const ends = sets
		.map((s) => s.visible_until)
		.filter((v): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v)))
		.sort((a, b) => Date.parse(a) - Date.parse(b));
	const soonest = ends[0] ?? null;
	if (sets.length === 1) {
		return soonest ? `Teams posted until ${formatDue(soonest, today)}` : 'Teams posted until you take them down';
	}
	return soonest
		? `${sets.length} team draws posted, the first until ${formatDue(soonest, today)}`
		: `${sets.length} team draws posted until you take them down`;
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
