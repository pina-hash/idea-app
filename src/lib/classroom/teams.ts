/**
 * CLASSROOM TEAMS: the persisted draw, its posting window, and its style.
 *
 * The one new module this lane adds. It holds the SHAPE of what 0223's
 * `classroom_team_board` returns, the transports that reach its RPCs, and
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
import { laCalendarDay, schoolDayEnd } from './school-calendar';
import { isSignedOutFailure } from './poll';
import { isTransientSqlstate } from '$lib/pg-errors';

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
	/**
	 * WHEN A TEACHER LAST MOVED A STUDENT BY HAND AFTER THE DRAW (0225,
	 * decision 44), or null when the teams are exactly what the seed dealt.
	 * The seed is never rewritten: this is the mark that says it no longer
	 * reproduces these teams. NULL, NOT ABSENT, EVEN BEFORE 0225 IS APPLIED:
	 * the board transport fills it in, so a pre-0225 payload reads as a draw
	 * nobody has edited rather than as a shape no branch renders.
	 */
	edited_at: string | null;
	/**
	 * WHO made that edit, an address, and the board projects it ONLY to a
	 * manager of the section: a student is told the teams were changed, never
	 * by whom. Null for every student, and for a draw nobody edited.
	 */
	edited_by: string | null;
	teams: Team[];
}

export interface TeamBoard {
	ok: true;
	manages: boolean;
	/**
	 * DOES THIS DATABASE HAVE 0225'S MOVE, told by the board itself: its sets
	 * carry an `edited_at` key. False with no sets (nothing to tell by, and
	 * nothing to move). OPTIONAL, and absent reads as "not known to be
	 * missing": a surface still treats a move answering `unavailable` as the
	 * last word, so a transport that does not report this cannot strand a
	 * control that works.
	 */
	editsReady?: boolean;
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
	| {
			ok: false;
			reason: 'error';
			message: string;
			/** The caller has no valid session (ledger 0357): a poll stops on this. */
			signedOut?: true;
	  };

/**
 * WHAT A MOVE ANSWERED (0225's `classroom_move_team_member`).
 *
 * `moved` and `added` are two different outcomes and never both true: `moved`
 * is a student already on the draw changing team, `added` is a student who was
 * on no team of this draw joining one (a latecomer, which needs a live
 * enrollment). Both false is the no-op: they were already on that team, and
 * nothing was stamped.
 *
 * `unavailable` is PGRST202 AND NOTHING ELSE: this client can ship before 0225
 * is applied, and a surface handed that answer removes its move controls and
 * says so. Every other failure is `error`, carrying the database's own sentence
 * verbatim ("That student is not enrolled in this class.").
 */
export type TeamMoveResult =
	| { ok: true; moved: boolean; added: boolean }
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
	style?(input: SaveTeamStyleInput): Promise<TeamStyleResult>;
	/**
	 * MOVE ONE STUDENT TO ANOTHER TEAM OF THE SAME DRAW, or add a latecomer to
	 * one (0225). A manager's write; the database re-checks that, and that the
	 * target team belongs to this draw. Optional for the same reason `style`
	 * is: a surface handed none renders no move control and no drag.
	 */
	move?(setId: string, studentEmail: string, toTeamId: string): Promise<TeamMoveResult>;
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

/**
 * WHAT A STYLE WRITE ANSWERED. `message` is the database's own sentence on a
 * refusal ("Only a student on this team, or a teacher of the class, can
 * customize it."), shown verbatim. `retryable` says the failure was a named
 * transient (`$lib/pg-errors`), so a save state may try again; absent or false
 * is a considered refusal, answered once. ADDITIVE: the People tab's Rename
 * reads `ok` and `message` and ignores it.
 */
export interface TeamStyleResult {
	ok: boolean;
	message?: string;
	retryable?: boolean;
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

/** The six columns a team's look is made of: what `teamStyle` reads, and all it reads. */
export type TeamStyleFields = Pick<
	Team,
	'background_type' | 'background_value' | 'accent_color' | 'badge' | 'flourish' | 'tagline'
>;

/**
 * The style a team carries, in the exact shape the tournament renderers take.
 * One projection, so no surface reaches into a team row field by field.
 */
export function teamStyle(team: TeamStyleFields): EntryStyleDraft {
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
 * A TEAM'S OWN COLOURS AS INLINE CUSTOM PROPERTIES (`--team-accent`,
 * `--team-bg`, `--team-ink`), for any surface that draws a team card. It moved
 * here from PeoplePanel when the class page began drawing posted teams for the
 * students (ledger 0297), so the teacher's board and the class's board read one
 * answer rather than two.
 *
 * THE INK COMES FROM `bannerInk` AND IS NOT CHOSEN AT A CALL SITE. A student
 * may pick any background; which of dark or light text survives on it is
 * arithmetic the tournament module already does, and a second answer to that
 * question is how a team ends up with black text on a black gradient with
 * nothing on screen reporting it.
 */
export function teamStyleVars(team: TeamStyleFields): string {
	const style = teamStyle(team);
	const bg = backgroundCss(style);
	return [
		`--team-accent: ${accentOf(style)}`,
		bg ? `--team-ink: ${bannerInk(style)}` : null,
		bg ? `--team-bg: ${bg}` : null
	]
		.filter(Boolean)
		.join('; ');
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
 * THE WORDS FOR A DRAW A TEACHER CHANGED BY HAND (decision 44), and the one
 * spelling of them: the People tab, the class page and the CSV all read this,
 * so the three cannot say it three ways. Null for a draw that is exactly what
 * its seed dealt, which renders nothing.
 *
 * It reads `edited_at` and nothing else. `edited_by` is withheld from a
 * student, so a surface keyed on it would say "not edited" to every student
 * looking at a draw their teacher changed.
 */
export function teamSetEditedWords(set: { edited_at?: string | null }): 'Edited by hand' | null {
	return typeof set.edited_at === 'string' && set.edited_at !== '' ? 'Edited by hand' : null;
}

/**
 * WHAT "Edited by hand" MEANS, for wherever there is room to say it. The seed
 * is what makes a draw checkable, so a reader holding the seed needs to know
 * it will no longer give back these exact teams.
 */
export const TEAM_EDITED_NOTE =
	'A teacher moved students by hand after the draw, so the seed no longer reproduces these teams exactly.';

/**
 * ONE SET FROM THE BOARD PAYLOAD, WITH THE FIELDS 0225 ADDED FILLED IN.
 *
 * A database before 0225 answers sets with no `edited_at` or `edited_by` key
 * at all. An absent key would reach every surface as `undefined`, which is
 * neither "edited" nor "not edited" to a strict comparison, so the transport
 * turns it into the null a pre-0225 draw genuinely means: nobody has moved
 * anybody, because nobody could.
 */
export function normalizeTeamSet(raw: TeamSet): TeamSet {
	const loose = raw as TeamSet & { edited_at?: string | null; edited_by?: string | null };
	return {
		...raw,
		edited_at: loose.edited_at ?? null,
		edited_by: loose.edited_by ?? null
	};
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
 * A POSTING END, FROM A NUMBER OF CALENDAR DAYS COUNTING TODAY (on the
 * school's calendar; weekends count), and it lands at the END of the last one
 * rather than at the same clock time days later: "post these for the week" on
 * a Monday means through Friday, not until Friday morning. One day is today.
 *
 * THE DAY IS THE SCHOOL'S, IN AMERICA/LOS_ANGELES, and that is ledger 0298's
 * repair. This used to add `days` to the date and set 23:59 on the BROWSER'S
 * clock, so "today" ended at the end of TOMORROW, and on a device set to
 * another zone at the end of that zone's tomorrow. The day comes from
 * `laCalendarDay` and the instant from `schoolDayEnd`, which is the one
 * conversion between the two; nothing here reads a clock.
 *
 * Takes `now` and returns an ISO string or null for "no end".
 */
export function teamWindowEnd(nowMs: number, days: number | null): string | null {
	if (days === null || !Number.isFinite(days) || days < 1 || !Number.isFinite(nowMs)) return null;
	return schoolDayEnd(laCalendarDay(new Date(nowMs)), Math.floor(days) - 1);
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
// The team style editor's draft (ledger 0360, report R17)
// ---------------------------------------------------------------------------
//
// THE WRITE HAD NO CALLER BUT A RENAME. 0223 shipped `classroom_set_team_style`
// gated on membership, and the class page mounted the team card read-only, so
// the only thing that ever reached the RPC was the People tab's manager-only
// Rename. These are the pure halves of the editor that closes that gap: what a
// draft is, how a draft becomes the RPC's input, and what is wrong with one
// before it is sent. No Svelte, no DOM, no clock.

/** 0223's CHECKs on `classroom_teams`: `char_length(btrim(name)) between 1 and 40`. */
export const TEAM_NAME_MAX = 40;
/** And `char_length(btrim(tagline)) between 1 and 48`. */
export const TEAM_TAGLINE_MAX = 48;

/**
 * WHAT THE EDITOR HOLDS WHILE SOMEBODY IS CHOOSING. Text fields are strings
 * (an empty one is "not set"), and the background keeps all three colour wells
 * whatever mode is chosen, so switching Solid to Gradient and back does not
 * throw away the colour somebody picked a moment ago.
 *
 * THERE IS NO FLOURISH HERE, ON PURPOSE. No team card renders one -- the class
 * page and the People tab draw a name, a badge, a motto and members -- so a
 * flourish control would be a control whose only outcome is nothing. The
 * stored value is CARRIED OVER by `teamStyleInputOf`, never offered.
 */
export interface TeamStyleDraft {
	name: string;
	tagline: string;
	/** A `#rrggbb` accent, or null for none. */
	accent: string | null;
	bg: 'none' | 'solid' | 'gradient';
	solid: string;
	gradA: string;
	gradB: string;
	badge: string | null;
}

/** The colour wells' starting values for a team that has never chosen a background. */
export const TEAM_DRAFT_SOLID = '#3e7bfa';
export const TEAM_DRAFT_GRADIENT: readonly [string, string] = ['#1d5a4f', '#3e7bfa'];

const isHexColour = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

/** A team's stored look, as the editor starts from it. */
export function teamStyleDraftOf(
	team: Pick<Team, 'name' | 'tagline' | 'accent_color' | 'background_type' | 'background_value' | 'badge'>
): TeamStyleDraft {
	const value = team.background_value;
	const pair = Array.isArray(value) && value.length === 2 && value.every(isHexColour) ? value : null;
	const solid = typeof value === 'string' && isHexColour(value) ? value : null;
	// 0223 refuses 'image' outright, so a team can only hold solid or gradient;
	// anything else (a shape a later build stored) starts the editor at None.
	const bg: TeamStyleDraft['bg'] =
		team.background_type === 'solid' && solid
			? 'solid'
			: team.background_type === 'gradient' && pair
				? 'gradient'
				: 'none';
	return {
		name: team.name ?? '',
		tagline: team.tagline ?? '',
		accent: isHexColour(team.accent_color) ? team.accent_color.toLowerCase() : null,
		bg,
		solid: (solid ?? TEAM_DRAFT_SOLID).toLowerCase(),
		gradA: (pair?.[0] ?? TEAM_DRAFT_GRADIENT[0]).toLowerCase(),
		gradB: (pair?.[1] ?? TEAM_DRAFT_GRADIENT[1]).toLowerCase(),
		badge: team.badge ?? null
	};
}

/**
 * A DRAFT AS THE RPC TAKES IT, AND IT CARRIES ALL SEVEN FIELDS.
 *
 * `classroom_set_team_style` REPLACES every column it writes -- the name and
 * the six style fields -- and a null clears, so an input built from the
 * fields somebody touched would wipe the rest: the People tab's Rename already
 * learned that and carries the style over (`saveRename`). Here the flourish is
 * the one field the editor does not offer, so it comes from the STORED row.
 *
 * Every hex is LOWERCASED. 0223 lowercases the accent itself but checks the
 * background against `^#[0-9a-f]{6}` WITHOUT `lower()`, so an uppercase
 * background colour would be refused with a sentence about hex values that the
 * person never typed. `<input type=color>` already answers lowercase; this is
 * for every other path a value can arrive by.
 *
 * Text is trimmed and a blank becomes null, which is what 0223 stores for
 * "not set" ("Team <n>" is then the name). An invalid colour is DROPPED to
 * null rather than sent: `teamStyleDraftProblems` is what tells the person.
 */
export function teamStyleInputOf(
	teamId: string,
	draft: TeamStyleDraft,
	stored: Pick<TeamStyleFields, 'flourish'>
): SaveTeamStyleInput {
	const hex = (v: string | null | undefined) => (isHexColour(v) ? v.toLowerCase() : null);
	const text = (v: string) => {
		const t = v.trim();
		return t === '' ? null : t;
	};
	let backgroundType: SaveTeamStyleInput['backgroundType'] = null;
	let backgroundValue: SaveTeamStyleInput['backgroundValue'] = null;
	if (draft.bg === 'solid' && hex(draft.solid)) {
		backgroundType = 'solid';
		backgroundValue = hex(draft.solid);
	} else if (draft.bg === 'gradient' && hex(draft.gradA) && hex(draft.gradB)) {
		backgroundType = 'gradient';
		backgroundValue = [hex(draft.gradA)!, hex(draft.gradB)!];
	}
	const badge = typeof draft.badge === 'string' ? draft.badge.trim() : '';
	return {
		teamId,
		name: text(draft.name),
		accentColor: hex(draft.accent),
		backgroundType,
		backgroundValue,
		badge: badge === '' ? null : badge,
		flourish: stored.flourish ?? null,
		tagline: text(draft.tagline)
	};
}

/**
 * WHAT IS WRONG WITH A DRAFT, BEFORE IT IS SENT, in the RPC's own sentences
 * where 0223 has one. The lengths are table CHECKs, which the RPC does not
 * pre-check: sent anyway, they would come back as a constraint name rather
 * than a sentence. Empty when the draft can be saved.
 */
export function teamStyleDraftProblems(draft: TeamStyleDraft): string[] {
	const out: string[] = [];
	if ([...draft.name.trim()].length > TEAM_NAME_MAX) {
		out.push(`A team name can be at most ${TEAM_NAME_MAX} characters.`);
	}
	if ([...draft.tagline.trim()].length > TEAM_TAGLINE_MAX) {
		out.push(`A motto can be at most ${TEAM_TAGLINE_MAX} characters.`);
	}
	if (draft.accent !== null && !isHexColour(draft.accent)) {
		out.push('An accent colour must be a hex value like #3f8f5f.');
	}
	if (draft.bg === 'solid' && !isHexColour(draft.solid)) {
		out.push('A solid background must be one hex colour.');
	}
	if (draft.bg === 'gradient' && !(isHexColour(draft.gradA) && isHexColour(draft.gradB))) {
		out.push('A gradient background must be two hex colours.');
	}
	return out;
}

/**
 * A SAVE INPUT LAID OVER A TEAM ROW: the seven fields the RPC writes, nothing
 * else. One spelling for the editor's live preview (the draft, before it is
 * sent) and the class page's overlay (the save, before the board re-read
 * confirms it), so the card a student is looking at while choosing is the card
 * the class gets.
 */
export function withTeamStyle<T extends Pick<Team, 'name' | 'accent_color' | 'background_type' | 'background_value' | 'badge' | 'flourish' | 'tagline'>>(
	team: T,
	input: SaveTeamStyleInput
): T {
	return {
		...team,
		name: input.name,
		accent_color: input.accentColor,
		background_type: input.backgroundType,
		background_value: input.backgroundValue,
		badge: input.badge,
		flourish: input.flourish,
		tagline: input.tagline
	};
}

/** The draft as a team row, for the live preview: the input's own normalization, so the preview never shows what a save would not send. */
export function draftTeam<T extends Pick<Team, 'id' | 'name' | 'accent_color' | 'background_type' | 'background_value' | 'badge' | 'flourish' | 'tagline'>>(
	team: T,
	draft: TeamStyleDraft
): T {
	return withTeamStyle(team, teamStyleInputOf(team.id, draft, team));
}

/**
 * HAS THE DRAFT MOVED OFF THE STORED LOOK, asked of what a save would SEND
 * rather than of the draft's own fields: a blank motto and an absent one are
 * the same team, and so are `#3E7BFA` and `#3e7bfa`. The editor's Save control
 * and its handler both read this, so the two cannot disagree about whether
 * there is anything to save.
 */
export function teamStyleChanged(
	team: Pick<Team, 'id' | 'name' | 'tagline' | 'accent_color' | 'background_type' | 'background_value' | 'badge' | 'flourish'>,
	draft: TeamStyleDraft
): boolean {
	const now = teamStyleInputOf(team.id, draft, team);
	const was = teamStyleInputOf(team.id, teamStyleDraftOf(team), team);
	return JSON.stringify(now) !== JSON.stringify(was);
}

/**
 * WHAT "Clear look" DOES: the colour, the background, the badge and the motto
 * go, and the NAME STAYS. It is the teacher's quick way to take something down
 * from the class page without retiring the whole draw (0223's reason a manager
 * may write at all), and the name is kept because "Team 3" coming back is a
 * separate, deliberate edit of the name field.
 */
export function clearedTeamLook(draft: TeamStyleDraft): TeamStyleDraft {
	return { ...draft, accent: null, bg: 'none', badge: null, tagline: '' };
}

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

/**
 * The six RPCs 0223 grants to `authenticated`, and 0225's move, and nothing
 * else.
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
			const { data, error, status } = await supabase.rpc('classroom_team_board', {
				p_section_id: sectionId
			});
			if (error) {
				if ((error as { code?: string }).code === 'PGRST202') {
					return { ok: false, reason: 'unavailable' };
				}
				// No session is not "the board failed": a poll stops on it rather
				// than asking again as anon (ledger 0357, `$lib/classroom/poll`).
				return isSignedOutFailure(error, status)
					? { ok: false, reason: 'error', message: error.message, signedOut: true }
					: { ok: false, reason: 'error', message: error.message };
			}
			const payload = data as { manages?: boolean; sets?: TeamSet[] } | null;
			const raw = payload?.sets ?? [];
			return {
				ok: true,
				manages: payload?.manages === true,
				// 0225's board projects `edited_at` on every set, null or not, so
				// the KEY is the rung that proves the move RPC exists -- read
				// before `normalizeTeamSet` fills it in for an older payload.
				editsReady: raw.length > 0 && raw.every((set) => 'edited_at' in (set as object)),
				sets: raw.map(normalizeTeamSet)
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
			if (!error) return { ok: true };
			return { ...failed(error), retryable: isTransientSqlstate((error as { code?: string }).code) };
		},

		async move(setId, studentEmail, toTeamId) {
			const { data, error } = await supabase.rpc('classroom_move_team_member', {
				p_team_set_id: setId,
				p_student_email: studentEmail,
				p_to_team_id: toTeamId
			});
			if (error) {
				if ((error as { code?: string }).code === 'PGRST202') {
					return { ok: false, reason: 'unavailable' };
				}
				return { ok: false, reason: 'error', message: error.message ?? 'That did not work.' };
			}
			const payload = data as { moved?: boolean; added?: boolean } | null;
			return { ok: true, moved: payload?.moved === true, added: payload?.added === true };
		}
	};
}
