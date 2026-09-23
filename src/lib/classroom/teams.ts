/**
 * CLASSROOM TEAMS: the persisted draw, its posting window, and its style.
 *
 * The one new module this lane adds. It holds the SHAPE of what 0223's
 * `classroom_team_board` returns, the transports that reach the five RPCs, and
 * the pure helpers a surface needs -- no Svelte, no DOM and no clock, so every
 * one of them is assertable at a pinned instant.
 *
 * WHY THE STYLE TYPE IS BORROWED AND NOT REDECLARED. `src/lib/tournaments/entry-styles.ts`
 * already owns `accentOf`, `hasStyle`, `backgroundCss` and `bannerInk`, and
 * every one of them takes `EntryStyleDraft` -- a `Pick` that deliberately
 * EXCLUDES `entry_id` and `tournament_id`. So those functions are structurally
 * reusable by a team TODAY, with no adapter and no extraction, and `teamStyle`
 * below is the one-line projection that hands them a team.
 *
 * LANE D2 IS GENERALIZING THAT MODULE OFF `TournamentEntry` RIGHT NOW, and it
 * had not landed on `origin/integration` when this was written. So this module
 * CONSUMES it read-only and does not touch it. When D2 lands, the import below
 * is the one line that moves; nothing else here knows where the renderers live.
 * Doing the extraction here as well would be two lanes doing one job, which is
 * exactly what the prompt said not to do.
 *
 * WHAT IS DELIBERATELY NOT HERE: a second copy of the preset badge and flourish
 * lists. `BADGES` and `FLOURISHES` are re-exported from the tournament module
 * so a team offers the same vocabulary, and 0223 stores an id as length-bounded
 * free text rather than a CHECK constraint, precisely so that list can move in
 * D2 without a migration here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	ACCENT_PRESETS,
	BADGES,
	FLOURISHES,
	NEUTRAL_ACCENT,
	accentOf,
	backgroundCss,
	bannerInk,
	hasStyle,
	type EntryStyleDraft
} from '$lib/tournaments/entry-styles';

export { ACCENT_PRESETS, BADGES, FLOURISHES, NEUTRAL_ACCENT, accentOf, backgroundCss, bannerInk, hasStyle };

/** How the teacher asked for the draw. Mirrors `picker.ts`'s own union. */
export type TeamMode = 'size' | 'count';

/** One person on a team, as the board projects them. */
export interface TeamMember {
	student_email: string;
	display_name: string;
	/**
	 * FALSE IS A NORMAL ANSWER AND THE WHOLE REASON THE READ LEFT JOINS.
	 * A student who transferred out mid-term is still on the team that was
	 * drawn -- that is a fact about who worked with whom -- so the row survives
	 * and carries a word for what happened, rather than being dropped by an
	 * inner join the way every presence-shaped read in this app drops one.
	 */
	still_enrolled: boolean;
}

export interface Team {
	id: string;
	team_number: number;
	/** The students' own name for themselves. Null renders as "Team <n>". */
	name: string | null;
	accent_color: string | null;
	background_type: EntryStyleDraft['background_type'];
	background_value: EntryStyleDraft['background_value'];
	badge: string | null;
	flourish: string | null;
	tagline: string | null;
	style_updated_by: string | null;
	style_updated_at: string | null;
	/**
	 * Whether the CALLER is on this team, projected by the database. The client
	 * cannot re-derive it: a browser does not know which of these addresses is
	 * the person holding it, and two spellings of "am I on this team" is the
	 * pair that stops agreeing.
	 */
	mine: boolean;
	members: TeamMember[];
}

export interface TeamSet {
	id: string;
	label: string;
	/** Text, not a number: a bigint through JSON loses precision, and the seed is the reproducibility claim. */
	seed: string;
	mode: TeamMode;
	mode_value: number;
	created_at: string;
	posted_at: string | null;
	visible_until: string | null;
	/** Computed by the database at call time. There is no stored flag to go stale. */
	showing: boolean;
	teams: Team[];
}

export interface TeamBoard {
	ok: true;
	manages: boolean;
	sets: TeamSet[];
}

/**
 * WHAT A FAILED READ MEANS, AND THE TWO CASES ARE NOT THE SAME.
 *
 * `unavailable` is "this deployment has no 0223 yet", which is a REAL state --
 * migrations here are applied by hand, one file at a time, so a client can ship
 * before its migration lands. The surface removes the teams area and says so.
 * `error` is anything else and is reported as a failure.
 */
export type TeamBoardResult =
	| TeamBoard
	| { ok: false; reason: 'unavailable' }
	| { ok: false; reason: 'error'; message: string };

/** Everything a surface needs the server for. Injected, never imported by a component. */
export interface TeamTransports {
	board(sectionId: string): Promise<TeamBoardResult>;
	save?(input: SaveTeamSetInput): Promise<{ ok: boolean; id?: string; message?: string }>;
	post?(setId: string, visibleUntil: string | null): Promise<{ ok: boolean; message?: string }>;
	unpost?(setId: string): Promise<{ ok: boolean; message?: string }>;
	archive?(setId: string): Promise<{ ok: boolean; message?: string }>;
	/**
	 * OPTIONAL, AND THE ABSENCE IS THE MECHANISM. A surface handed no `style`
	 * transport renders no style controls at all, down through every child --
	 * read-only is then structural rather than a flag somebody can forget to
	 * pass. That is how the grading console's read-only view of a worksheet
	 * works and it is the same rule here.
	 */
	style?(input: SaveTeamStyleInput): Promise<{ ok: boolean; message?: string }>;
}

export interface SaveTeamSetInput {
	sectionId: string;
	label: string;
	seed: number;
	mode: TeamMode;
	modeValue: number;
	/** Team n is `teams[n - 1]`, each an array of student emails. */
	teams: readonly (readonly string[])[];
}

export interface SaveTeamStyleInput {
	teamId: string;
	name: string | null;
	accentColor: string | null;
	backgroundType: EntryStyleDraft['background_type'];
	backgroundValue: EntryStyleDraft['background_value'];
	badge: string | null;
	flourish: string | null;
	tagline: string | null;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * The style a team carries, in the exact shape the tournament renderers take.
 * One projection, so no surface reaches into a team row field by field.
 */
export function teamStyle(team: Team): EntryStyleDraft {
	return {
		background_type: team.background_type,
		background_value: team.background_value,
		accent_color: team.accent_color,
		badge: team.badge,
		flourish: team.flourish,
		tagline: team.tagline
	};
}

/**
 * WHAT TO CALL A TEAM. Its own name when the students have given it one, and
 * "Team <n>" otherwise -- never an empty heading and never a placeholder that
 * reads like a name.
 */
export function teamLabel(team: Pick<Team, 'name' | 'team_number'>): string {
	const named = (team.name ?? '').trim();
	return named || `Team ${team.team_number}`;
}

/** How many students are on this team, and how many of them are still in the class. */
export function teamRosterCounts(team: Pick<Team, 'members'>): { total: number; enrolled: number } {
	return {
		total: team.members.length,
		enrolled: team.members.filter((m) => m.still_enrolled).length
	};
}

/**
 * THE SENTENCE A TEACHER READS ABOUT A DRAW WHOSE ROSTER HAS MOVED, and it is
 * a sentence rather than a count on its own because "2" beside a team says
 * nothing about what happened.
 *
 * Null when nothing has moved, which is the ordinary case and renders nothing.
 */
export function teamDriftNote(set: Pick<TeamSet, 'teams'>): string | null {
	const gone = set.teams.flatMap((t) => t.members.filter((m) => !m.still_enrolled));
	if (gone.length === 0) return null;
	const names = gone.map((m) => m.display_name).join(', ');
	return gone.length === 1
		? `${names} is on a team here but is no longer on the live roster for this class. The team is left exactly as it was drawn.`
		: `${gone.length} students on these teams are no longer on the live roster for this class: ${names}. The teams are left exactly as they were drawn.`;
}

/**
 * IS THIS DRAW SHOWING TO THE CLASS, asked in the browser.
 *
 * `showing` off the payload is the AUTHORITY -- the database computed it at
 * call time and the database is what gates the student read. This function
 * exists for a different job: telling a teacher what the window MEANS while
 * they are deciding, and keeping the page honest between polls. `now` is
 * threaded in rather than read, so it is assertable at a pinned instant.
 */
export function teamWindowState(
	set: Pick<TeamSet, 'posted_at' | 'visible_until'>,
	nowMs: number
): 'not-posted' | 'scheduled' | 'showing' | 'ended' {
	if (!set.posted_at) return 'not-posted';
	const from = Date.parse(set.posted_at);
	if (Number.isFinite(from) && from > nowMs) return 'scheduled';
	if (set.visible_until) {
		const until = Date.parse(set.visible_until);
		if (Number.isFinite(until) && until <= nowMs) return 'ended';
	}
	return 'showing';
}

/** The words for each of those states. One spelling, so two surfaces cannot disagree. */
export const TEAM_WINDOW_WORDS: Record<ReturnType<typeof teamWindowState>, string> = {
	'not-posted': 'Not posted. Only you can see these teams.',
	scheduled: 'Scheduled. The class cannot see these teams yet.',
	showing: 'Posted. The whole class can see these teams.',
	ended: 'Ended. The class can no longer see these teams.'
};

/**
 * A POSTING END, FROM A NUMBER OF DAYS, and it lands at the END of that
 * school day rather than at the same clock time days later -- "post these for
 * the week" means through Friday, not until Friday morning.
 *
 * Takes `now` and returns an ISO string or null for "no end".
 */
export function teamWindowEnd(nowMs: number, days: number | null): string | null {
	if (days === null || !Number.isFinite(days) || days < 1) return null;
	const d = new Date(nowMs);
	d.setDate(d.getDate() + Math.floor(days));
	d.setHours(23, 59, 59, 0);
	return d.toISOString();
}

/**
 * WHAT A STUDENT MAY CHANGE ABOUT A TEAM, and it is one predicate so the
 * control and the handler cannot disagree about it. Two spellings of "is this
 * ready" is what produces a click that does nothing.
 *
 * The DATABASE is the boundary -- 0223 re-checks membership inside the RPC --
 * and this is the convenience gate that stops a control being offered whose
 * only possible answer is a refusal.
 */
export function canStyleTeam(team: Pick<Team, 'mine'>, manages: boolean): boolean {
	return team.mine || manages;
}

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

/**
 * The five RPCs 0223 grants to `authenticated`, and nothing else.
 *
 * NONE OF THIS IS A BOUNDARY. Every function re-checks the caller in its own
 * body -- `classroom_manages_section` for the four manager writes,
 * `_classroom_team_member` for the style write, and an enrollment check for the
 * read -- so this module is plumbing. What it decides is only how a FAILURE is
 * reported.
 *
 * `PGRST202` AND NOTHING ELSE DEGRADES. That code means the function does not
 * exist, which on this project is a real deployment state: migrations are
 * applied by hand, one file at a time, so a client genuinely can ship before
 * 0223 lands. Every OTHER error is reported as a failure, so a runtime error
 * inside a function fails closed instead of falling through to a weaker path
 * that would read as "the feature is not installed".
 */
export function createTeamTransports(supabase: SupabaseClient): TeamTransports {
	/**
	 * A refusal is shown to the person, verbatim where the database wrote one.
	 * These RPCs raise sentences a teacher and a student are meant to read
	 * ("Only a student on this team, or a teacher of the class, can customize
	 * it."), so re-toning them here would mean two vocabularies for one rule.
	 */
	const failed = (error: { message?: string } | null) => ({
		ok: false,
		message: error?.message ?? 'That did not work.'
	});

	return {
		async board(sectionId) {
			const { data, error } = await supabase.rpc('classroom_team_board', {
				p_section_id: sectionId
			});
			if (error) {
				if ((error as { code?: string }).code === 'PGRST202') {
					return { ok: false, reason: 'unavailable' };
				}
				return { ok: false, reason: 'error', message: error.message };
			}
			const payload = data as { manages?: boolean; sets?: TeamSet[] } | null;
			return {
				ok: true,
				manages: payload?.manages === true,
				sets: payload?.sets ?? []
			};
		},

		async save(input) {
			const { data, error } = await supabase.rpc('classroom_save_team_set', {
				p_section_id: input.sectionId,
				p_label: input.label,
				p_seed: input.seed,
				p_mode: input.mode,
				p_mode_value: input.modeValue,
				p_teams: input.teams.map((members, i) => ({ team_number: i + 1, members }))
			});
			if (error) return failed(error);
			return { ok: true, id: data as string };
		},

		async post(setId, visibleUntil) {
			const { error } = await supabase.rpc('classroom_post_team_set', {
				p_team_set_id: setId,
				p_visible_until: visibleUntil
			});
			return error ? failed(error) : { ok: true };
		},

		async unpost(setId) {
			const { error } = await supabase.rpc('classroom_unpost_team_set', {
				p_team_set_id: setId
			});
			return error ? failed(error) : { ok: true };
		},

		async archive(setId) {
			const { error } = await supabase.rpc('classroom_archive_team_set', {
				p_team_set_id: setId
			});
			return error ? failed(error) : { ok: true };
		},

		async style(input) {
			const { error } = await supabase.rpc('classroom_set_team_style', {
				p_team_id: input.teamId,
				p_name: input.name,
				p_accent_color: input.accentColor,
				p_background_type: input.backgroundType,
				p_background_value: input.backgroundValue,
				p_badge: input.badge,
				p_flourish: input.flourish,
				p_tagline: input.tagline
			});
			return error ? failed(error) : { ok: true };
		}
	};
}
