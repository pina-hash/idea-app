/**
 * GAUNTLET progression model: XP, levels, streaks, badges, and the next-best
 * suggestion. PLAIN TS, client-safe and server-safe. The raw aggregates come
 * from the read-only `gauntlet_progression()` RPC (0021); everything here is
 * a pure, deterministic mapping of them, so the display can be computed
 * anywhere without another write surface.
 *
 * Design guardrails (see the phase spec): everything is distinct-based (no
 * grind farming), the streak has a gentle one-missed-day grace instead of a
 * punitive reset, and there are no artificial pressure timers. Coins are
 * deferred and deliberately absent.
 */
import { MODES, type GauntletModeId } from '$lib/gauntlet';

export interface ModeProgress {
	total: number;
	attempted: number;
	cleared: number;
}

/** The payload returned by the gauntlet_progression() RPC. */
export interface ProgressionPayload {
	attempted_ids: string[];
	cleared_ids: string[];
	per_mode: Partial<Record<GauntletModeId, ModeProgress>>;
	/** Distinct practice days (YYYY-MM-DD, school timezone), newest first. */
	practice_days: string[];
	/** Today in the school timezone (YYYY-MM-DD). */
	today: string;
	macro_clears: number;
	sub_par_clears: number;
	dead_on: boolean;
}

// ---------------------------------------------------------------------------
// XP + levels. Distinct-based: attempts and clears count once per challenge,
// practice days once per day.
// ---------------------------------------------------------------------------

export const XP_PER_ATTEMPT = 15;
export const XP_PER_CLEAR = 120;
export const XP_PER_PRACTICE_DAY = 20;

export function xpFromProgression(p: ProgressionPayload): number {
	return (
		p.attempted_ids.length * XP_PER_ATTEMPT +
		p.cleared_ids.length * XP_PER_CLEAR +
		p.practice_days.length * XP_PER_PRACTICE_DAY
	);
}

/** XP earned by one run, for the post-run screen (day XP shown separately). */
export function xpForRun(firstAttempt: boolean, firstClear: boolean): number {
	return (firstAttempt ? XP_PER_ATTEMPT : 0) + (firstClear ? XP_PER_CLEAR : 0);
}

const LEVEL_NAMES = [
	'Trainee',
	'Apprentice',
	'Operator',
	'Machinist',
	'Toolmaker',
	'Prototyper',
	'Master',
	'Grandmaster'
];

export interface LevelInfo {
	level: number;
	name: string;
	xp: number;
	/** XP where this level started and where the next begins. */
	floor: number;
	ceiling: number;
	/** 0..1 progress toward the next level. */
	progress: number;
}

/** Quadratic curve: level n starts at 120 * (n-1)^2 XP. */
export function levelFromXp(xp: number): LevelInfo {
	const level = Math.max(1, Math.floor(Math.sqrt(xp / 120)) + 1);
	const floor = 120 * (level - 1) ** 2;
	const ceiling = 120 * level ** 2;
	return {
		level,
		name: LEVEL_NAMES[Math.min(level, LEVEL_NAMES.length) - 1],
		xp,
		floor,
		ceiling,
		progress: Math.min(1, (xp - floor) / (ceiling - floor))
	};
}

// ---------------------------------------------------------------------------
// Streak: consecutive practice days with a one-missed-day grace. A single
// missed day never kills a streak (the gentle restore window); two missed
// days in a row does.
// ---------------------------------------------------------------------------

export type StreakState = 'active' | 'alive' | 'restore' | 'none';

export interface StreakInfo {
	/** The current streak in practice days (0 when broken). */
	current: number;
	best: number;
	state: StreakState;
	/** Human hint for the state, empty when there is nothing to say. */
	hint: string;
}

const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T12:00:00Z`) / 86400000);

/** Walk a newest-first day list counting a run that forgives 1-day gaps. */
function walkStreak(days: number[], from: number): number {
	let count = 0;
	let cursor = from;
	for (const d of days) {
		if (d > cursor) continue;
		const gap = cursor - d;
		if (count === 0 ? gap > 0 : gap > 2) break;
		count += 1;
		cursor = d;
	}
	return count;
}

export function computeStreak(practiceDays: string[], todayIso: string): StreakInfo {
	const days = [...new Set(practiceDays)].map(dayNumber).sort((a, b) => b - a);
	const today = dayNumber(todayIso);
	if (!days.length) return { current: 0, best: 0, state: 'none', hint: '' };

	// Best streak ever: try a walk starting at every practice day.
	let best = 0;
	for (const d of days) best = Math.max(best, walkStreak(days, d));

	const last = days[0];
	const sinceLast = today - last;
	const run = walkStreak(days, last);
	if (sinceLast <= 0) {
		return { current: run, best, state: 'active', hint: 'Practiced today. Streak is safe.' };
	}
	if (sinceLast === 1) {
		return { current: run, best, state: 'alive', hint: 'Practice today to extend your streak.' };
	}
	if (sinceLast === 2) {
		return {
			current: run,
			best,
			state: 'restore',
			hint: 'One day missed. Practice today to keep your streak.'
		};
	}
	return { current: 0, best, state: 'none', hint: '' };
}

// ---------------------------------------------------------------------------
// Badges. Pure predicates over the aggregates; earned states are recomputed
// on read, never stored.
// ---------------------------------------------------------------------------

export interface Badge {
	id: string;
	name: string;
	desc: string;
	/** Small glyph key rendered by the badge strip. */
	icon: 'cut' | 'clear' | 'clock' | 'macro' | 'par' | 'target' | 'streak' | 'modes' | 'series';
	earned: (p: ProgressionPayload, streak: StreakInfo) => boolean;
}

const modeCleared = (p: ProgressionPayload, id: GauntletModeId) => p.per_mode[id]?.cleared ?? 0;

export const BADGES: Badge[] = [
	{
		id: 'first-cut',
		name: 'First Cut',
		desc: 'Attempt your first challenge in any mode.',
		icon: 'cut',
		earned: (p) => p.attempted_ids.length >= 1
	},
	{
		id: 'first-clear',
		name: 'First Clear',
		desc: 'Clear any challenge.',
		icon: 'clear',
		earned: (p) => p.cleared_ids.length >= 1
	},
	{
		id: 'speedrunner',
		name: 'Speedrunner',
		desc: 'Clear your first Speedrun.',
		icon: 'clock',
		earned: (p) => modeCleared(p, 'speedrun') >= 1
	},
	{
		id: 'machine-verified',
		name: 'Machine Verified',
		desc: 'Get a clear verified by the SolidWorks macro.',
		icon: 'macro',
		earned: (p) => p.macro_clears >= 1
	},
	{
		id: 'under-par',
		name: 'Under Par',
		desc: 'Clear a Speedrun at or under its par time.',
		icon: 'par',
		earned: (p) => p.sub_par_clears >= 1
	},
	{
		id: 'dead-on',
		name: 'Dead On',
		desc: 'Land a modeling clear within half the allowed tolerance.',
		icon: 'target',
		earned: (p) => p.dead_on
	},
	{
		id: 'streak-3',
		name: 'Warmed Up',
		desc: 'Practice 3 days in a row.',
		icon: 'streak',
		earned: (_p, s) => s.best >= 3
	},
	{
		id: 'streak-7',
		name: 'In the Groove',
		desc: 'Practice 7 days in a row.',
		icon: 'streak',
		earned: (_p, s) => s.best >= 7
	},
	{
		id: 'streak-14',
		name: 'Relentless',
		desc: 'Practice 14 days in a row.',
		icon: 'streak',
		earned: (_p, s) => s.best >= 14
	},
	{
		id: 'cross-trained',
		name: 'Cross-Trained',
		desc: 'Attempt challenges in 4 different modes.',
		icon: 'modes',
		earned: (p) =>
			Object.values(p.per_mode).filter((m) => (m?.attempted ?? 0) >= 1).length >= 4
	},
	{
		id: 'series-complete',
		name: 'Series Complete',
		desc: 'Clear every published challenge in one mode.',
		icon: 'series',
		earned: (p) =>
			Object.values(p.per_mode).some((m) => (m?.total ?? 0) > 0 && m!.cleared >= m!.total)
	}
];

// ---------------------------------------------------------------------------
// Next-best suggestion: the lowest-difficulty published challenge you have
// not cleared yet, preferring the mode you played most recently.
// ---------------------------------------------------------------------------

export interface SuggestibleChallenge {
	id: string;
	mode: GauntletModeId;
	title: string;
	difficulty: number;
}

export function modeHref(mode: GauntletModeId): string {
	return MODES.find((m) => m.id === mode)?.href ?? '/gauntlet';
}

export function suggestNext(
	challenges: SuggestibleChallenge[],
	clearedIds: string[],
	preferMode?: GauntletModeId | null
): SuggestibleChallenge | null {
	const cleared = new Set(clearedIds);
	const open = challenges
		.filter((c) => !cleared.has(c.id))
		.sort((a, b) => a.difficulty - b.difficulty || a.title.localeCompare(b.title));
	if (!open.length) return null;
	if (preferMode) {
		const inMode = open.find((c) => c.mode === preferMode);
		if (inMode) return inMode;
	}
	return open[0];
}
