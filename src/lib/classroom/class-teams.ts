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
import {
	createTeamTransports,
	teamSetEditedWords,
	withTeamStyle,
	type SaveTeamStyleInput,
	type Team,
	type TeamSet,
	type TeamStyleResult
} from './teams';
import { PollSignedOut } from './poll';

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
	/**
	 * A TEACHER CHANGED THESE TEAMS BY HAND AFTER THE DRAW (0225, decision
	 * 44). A boolean and nothing more: the board tells a manager WHO, and the
	 * class page carries no address, so the projection keeps the fact and
	 * drops the person.
	 */
	edited: boolean;
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
			edited: teamSetEditedWords(s) !== null,
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
export function teamsManageLink(sectionId: string): { href: string; label: string } | null {
	const tab = sectionTabs(sectionId).find((t) => t.id === 'people');
	// No typed fallback URL: a second spelling of the People route is the thing
	// this reads `sectionTabs` to avoid. Without the tab there is no strip.
	return tab ? { href: tab.href, label: tab.label } : null;
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
	// Two or more: the soonest end is the one a teacher acts on, and it is not
	// necessarily the first board listed (the board is newest draw first).
	return soonest
		? `${sets.length} team draws posted; the next comes down ${formatDue(soonest, today)}`
		: `${sets.length} team draws posted until you take them down`;
}

/**
 * HOW OFTEN AN OPEN CLASS PAGE RE-ASKS FOR POSTED TEAMS (ledger 0298, R23).
 *
 * The section layout's load runs once per visit to the class: a navigation
 * between the class's own tabs and items never re-runs it (its only input is
 * the section id), so a draw posted while a student already had the class
 * open never reached them, and a teacher who posted from People and pressed
 * the Class tab read the page as it was BEFORE the post. The class page
 * therefore re-reads the same audience-gated board on this interval while the
 * tab is visible, and when the tab comes back into view -- the hall pass's own
 * polling shape, on the shared poller (`$lib/classroom/poll`).
 *
 * 300 SECONDS, RAISED FROM 60 IN LEDGER 0357. A teacher posts a draw a few
 * times a term; the teacher's own page re-reads the moment they post (People's
 * `onchanged`), and a student who switches back to the tab re-reads then. At 60
 * seconds this was a third of every class page's steady-state calls, for a
 * board that almost never changes.
 */
export const CLASS_TEAMS_POLL_MS = 300_000;

/**
 * THE SAME READ, FOR A REFRESH: the projection when the board answered, and
 * NULL when it did not. A refresh that failed must keep what is on screen, so
 * "the read failed" cannot be the same answer as "nothing is posted"; the page
 * load's `loadPostedTeams` folds the two together because it has nothing on
 * screen to keep.
 */
export async function refreshPostedTeams(
	supabase: SupabaseClient,
	sectionId: string
): Promise<ClassTeamSet[] | null> {
	let res;
	try {
		res = await createTeamTransports(supabase).board(sectionId);
	} catch {
		return null;
	}
	// A refusal for want of a session is thrown, not folded into null, so the
	// class page's poll stops instead of asking again as anon (ledger 0357).
	if (!res.ok && res.reason === 'error' && res.signedOut) throw new PollSignedOut();
	return res.ok ? postedTeamSets(res.sets) : null;
}

/** The class page's read: the same audience-gated board the People tab uses.
    Any failure, a lost session included, is "nothing posted" here: a page load
    has nothing on screen to keep, and must never fail over a team board. */
export async function loadPostedTeams(
	supabase: SupabaseClient,
	sectionId: string
): Promise<ClassTeamSet[]> {
	try {
		return (await refreshPostedTeams(supabase, sectionId)) ?? [];
	} catch {
		return [];
	}
}

/**
 * A STUDENT'S OWN TEAM LOOK, SAVED FROM THE CLASS PAGE (ledger 0360, report
 * R17). The same membership-gated RPC the People tab's Rename calls, through
 * the same transport; the database re-checks that the caller is on the team or
 * teaches the class. The section layout hands this to `ClassTeams` as its
 * `style` prop, and without it the class page offers no control at all.
 */
export function saveTeamStyle(supabase: SupabaseClient, input: SaveTeamStyleInput): Promise<TeamStyleResult> {
	return createTeamTransports(supabase).style!(input);
}

/**
 * THE CLASS PAGE'S OVERLAY AFTER A SAVE: the saved fields laid onto the team
 * with that id in every posted set (a team belongs to one draw, but a student's
 * own card and the board card are two renders of it, and both read this). Pure,
 * so the card shows the new look the moment the write is acknowledged and the
 * board re-read that follows only confirms it.
 */
export function withSavedStyle(sets: readonly ClassTeamSet[], input: SaveTeamStyleInput): ClassTeamSet[] {
	return sets.map((set) =>
		set.teams.some((t) => t.id === input.teamId)
			? { ...set, teams: set.teams.map((t) => (t.id === input.teamId ? withTeamStyle(t, input) : t)) }
			: set
	);
}
