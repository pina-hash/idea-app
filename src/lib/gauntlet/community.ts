/**
 * COMMUNITY SPEEDRUNS (0296, ledger 0433, report b4a6b733: "have user made
 * speedruns"). A student strings 2 to 8 published Speedrun parts into a
 * speedrun of their own and shares it by link at once; listing it for every
 * student takes a GAUNTLET author or an admin (`gauntlet_can_author`).
 *
 * WHY ONLY THE LISTING IS REVIEWED. The parts are already published, so a
 * speedrun adds no new geometry, and its board is built from runs the part
 * boards already rank (`gauntlet_leaderboard`, ranked rows only), so the
 * plausibility floor, the held state and the run review are the part boards'
 * own. The one new thing a speedrun carries is the student's own title and
 * description, and that is what the review is for, before it is shown to
 * everyone. Editing a listed speedrun sends it back.
 *
 * Every rule is in the database. This module holds the shapes and the words.
 */

export type RouteStatus = 'private' | 'pending' | 'listed' | 'hidden';

export interface RouteSummary {
	id: string;
	title: string;
	description: string;
	author: string;
	mine: boolean;
	/** The owner's and a reviewer's to see; null for everyone else. */
	status: RouteStatus | null;
	part_count: number;
	created_at: string;
}

export interface RoutePart {
	id: string;
	title: string;
	difficulty: number;
	published: boolean;
	my_seconds: number | null;
	my_state: 'ranked' | 'pending_verification' | null;
}

export interface RouteBoardRow {
	rank: number;
	player: string;
	total_seconds: number;
	me: boolean;
}

export interface RouteDetail extends RouteSummary {
	parts: RoutePart[];
	board: RouteBoardRow[];
	can_review: boolean;
}

/** The fewest and most parts a speedrun holds (the database's own bounds). */
export const ROUTE_MIN_PARTS = 2;
export const ROUTE_MAX_PARTS = 8;
export const ROUTE_TITLE_MAX = 60;
export const ROUTE_DESCRIPTION_MAX = 280;

/** What each state says, to the owner and a reviewer. A word and a glyph, never colour alone. */
export const ROUTE_STATUS_WORDS: Record<RouteStatus, { word: string; glyph: string; hint: string }> = {
	private: { word: 'Link only', glyph: '◇', hint: 'Anyone you send the link to can run it.' },
	pending: { word: 'Waiting for review', glyph: '◷', hint: 'A teacher checks it before it is listed for everyone.' },
	listed: { word: 'Listed', glyph: '◆', hint: 'Every student can find it.' },
	hidden: { word: 'Taken down', glyph: '✕', hint: 'A teacher took it down. Only you can see it.' }
};

/** Why the builder cannot save yet, or null. Mirrors the database's refusals so the button says why. */
export function routeDraftProblem(title: string, partIds: readonly string[]): string | null {
	const t = title.trim();
	if (!t) return 'Name your speedrun.';
	if (t.length > ROUTE_TITLE_MAX) return `Keep the name to ${ROUTE_TITLE_MAX} characters.`;
	if (partIds.length < ROUTE_MIN_PARTS) return `Pick at least ${ROUTE_MIN_PARTS} parts.`;
	if (partIds.length > ROUTE_MAX_PARTS) return `A speedrun holds at most ${ROUTE_MAX_PARTS} parts.`;
	if (new Set(partIds).size !== partIds.length) return 'Each part can be in a speedrun once.';
	return null;
}

/** Moves one part up or down in the order. Pure; out-of-range moves return the list unchanged. */
export function movePart(ids: readonly string[], index: number, delta: -1 | 1): string[] {
	const to = index + delta;
	if (index < 0 || index >= ids.length || to < 0 || to >= ids.length) return [...ids];
	const next = [...ids];
	[next[index], next[to]] = [next[to], next[index]];
	return next;
}

/** How far the viewer is through a speedrun: ranked parts over parts. */
export function routeProgress(parts: readonly RoutePart[]): { done: number; held: number; total: number } {
	return {
		done: parts.filter((p) => p.my_state === 'ranked').length,
		held: parts.filter((p) => p.my_state === 'pending_verification').length,
		total: parts.length
	};
}
