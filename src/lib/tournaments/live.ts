/**
 * The live event's own arithmetic (prompt 0077): which match is on, which is
 * about to be called, how far the bracket has filled in, and in what order a
 * host's console lays its sections out while the bracket is running.
 *
 * ONE IMPLEMENTATION, THREE SURFACES. The host console, the public page and
 * the projector stage each used to derive "ready to start" for themselves
 * with the same five-line filter-and-sort, which is three copies of one rule
 * about what a callable match is. They all read `matchQueue` now, so the row
 * the host sees under "Next up" is the row the projector is showing the room
 * and the row the public page lists -- the same match, in the same order.
 *
 * Client-safe plain data + pure helpers (the tournaments.ts convention).
 * Nothing here reads a clock: `bracketProgress` is a count and every caller
 * that wants elapsed time threads `now` in, so a test can pin an instant.
 */
import type { BracketId, BracketMatch, TournamentStatus } from './tournaments';
import { isByeMatch } from './tournaments';

const BRACKET_ORDER: BracketId[] = ['winners', 'losers', 'grand_final', 'grand_final_reset'];

/** Bracket order: winners, losers, grand final, reset; then round, then slot. */
export function playOrder(a: BracketMatch, b: BracketMatch): number {
	return (
		BRACKET_ORDER.indexOf(a.bracket) - BRACKET_ORDER.indexOf(b.bracket) ||
		a.round - b.round ||
		a.slot - b.slot
	);
}

export interface MatchQueue {
	/** Started by a host and not yet decided: what the room is watching. */
	inProgress: BracketMatch[];
	/** Both sides known, nobody has pressed Start: what gets called next. */
	ready: BracketMatch[];
	/** A side still depends on an earlier result. */
	waiting: BracketMatch[];
	/** Decided and actually involving two named sides: a bye is not listed,
	 * because nobody played it and nothing about it can be corrected. */
	completed: BracketMatch[];
}

/** Partitions a bracket by what a host can do with each match right now. */
export function matchQueue(matches: BracketMatch[]): MatchQueue {
	const rows = [...matches].sort(playOrder);
	const paired = (m: BracketMatch) => m.entry_a_id !== null && m.entry_b_id !== null;
	return {
		inProgress: rows.filter((m) => m.status === 'in_progress'),
		ready: rows.filter((m) => m.status === 'pending' && paired(m)),
		waiting: rows.filter((m) => m.status === 'pending' && !paired(m)),
		completed: rows.filter((m) => m.status === 'complete' && !isByeMatch(m))
	};
}

/** The match a host will call next, or null when nothing is callable. */
export function nextUp(matches: BracketMatch[]): BracketMatch | null {
	return matchQueue(matches).ready[0] ?? null;
}

export interface BracketProgress {
	/** Matches two named sides will actually contest (byes and dead slots
	 * are the bracket's shape, not events). */
	total: number;
	played: number;
	live: number;
	/** One cell per counted match in play order: what a progress rail draws. */
	cells: ('done' | 'live' | 'todo')[];
}

/**
 * How far the bracket has filled in. A bye completes the moment the bracket
 * is generated and describes nothing that happened, so it is neither in the
 * total nor in the played count -- a 6-entry field reads "0 of 12 played" at
 * the start, not "2 of 14". A pending match with an empty side is counted in
 * the total (somebody will play it) but obviously not as played.
 *
 * THE TOTAL SETTLES AS THE BRACKET RESOLVES, so "of N" is the N known now: a
 * losers-round slot fed by a bye becomes a bye itself only once its feeder
 * decides (0062's resolver runs after every result), which lowers N, and a
 * grand-final reset raises it by one. A 6-entry field reads 12 at the start
 * and 10 at the end. The rail redraws; nothing here pretends to know the
 * final shape early.
 */
export function bracketProgress(matches: BracketMatch[]): BracketProgress {
	const rows = [...matches].filter((m) => !isByeMatch(m)).sort(playOrder);
	// A dead slot (both sides empty, resolved complete with no winner) is a
	// bye in the other direction and is already excluded by isByeMatch. What
	// is left is contested or still to be contested.
	const cells = rows.map((m) =>
		m.status === 'complete' ? ('done' as const) : m.status === 'in_progress' ? ('live' as const) : ('todo' as const)
	);
	return {
		total: cells.length,
		played: cells.filter((c) => c === 'done').length,
		live: cells.filter((c) => c === 'live').length,
		cells
	};
}

export type HostSection =
	| 'phase'
	| 'matches'
	| 'entries'
	| 'invites'
	| 'quals'
	| 'rewards'
	| 'danger';

/**
 * THE ORDER A HOST'S CONSOLE LAYS ITS CARDS OUT, BY PHASE.
 *
 * Before the bracket exists the console is a setup form and reads top to
 * bottom in the order the work happens: open registration, seed the field,
 * invite, run pools, set rewards. Once the bracket is LIVE the only thing a
 * host does on this page, on a phone, between two matches, is run the next
 * match -- and the match control used to sit UNDER five setup cards (phase,
 * the whole roster one row per entry, two invite forms, qualifying, the
 * reward rules), so every result began with a scroll past all of them; on
 * a phone with an 8-entry field that is several screens before the first
 * result control. So the match card goes FIRST the moment there is a
 * bracket, and the setup cards follow in their old order.
 *
 * `tests/tournament-live.test.ts` pins this; its positive control puts the
 * match card back at the bottom and reddens.
 */
export function hostSectionOrder(status: TournamentStatus): HostSection[] {
	const setup: HostSection[] = ['phase', 'entries', 'invites', 'quals', 'rewards'];
	if (status === 'live' || status === 'complete') return ['matches', ...setup, 'danger'];
	return [...setup, 'matches', 'danger'];
}

/**
 * Preset forfeit reasons, so awarding a no-show on a phone is a tap and not a
 * keyboard. The reason is still free text underneath (0065 logs whatever is
 * sent, 1-200 characters); a chip only fills the field. Sentence case, short,
 * and each one a thing that actually happens at a table.
 */
export const FORFEIT_REASONS = ['No-show', 'Withdrew', 'Disqualified'] as const;
