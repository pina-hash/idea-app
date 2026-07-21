/**
 * GREENLINE grid size: how many AI opponents the next race launches with, as a
 * reactive, localStorage-backed choice (the track-selection / creative /
 * weather store pattern).
 *
 * Deliberately NOT part of the loadout, for the same reason the track is not:
 * the size of the field is who you race, not what you race, so loading a saved
 * build must never silently change it. Per browser, no migration.
 *
 * This module also owns GRID_MAX_AI, which is the single source of truth for
 * the ceiling: the picker clamps to it and GreenlineRace's own MAX_AI reads it,
 * so the UI can never offer a grid the sim will not build.
 */
import { browser } from '$app/environment';

/**
 * Hard ceiling on AI opponents (Phase 8c, raised from 6). Both the grid builder
 * and the round reset in GreenlineRace clamp to this one constant.
 *
 * 11 (a 12-car grid with the player), NOT straight to the 16 the design wants,
 * because the perf target is the school's 6-8 year old desktops and draw calls
 * are the known budget: every vehicle is a multi-part rig with its own hull
 * clone and tint material. 11 was picked against measured frame time on a full
 * grid, with 16 left as a stretch goal contingent on a cheaper rig (instanced
 * bodywork / shared hull) — raise this constant only behind the same
 * measurement, not on the assumption that it scales.
 */
export const GRID_MAX_AI = 11;
/** Minimum: a race needs at least one opponent to be a race. */
export const GRID_MIN_AI = 1;
/** The historical default grid (matches GreenlineRace's DEFAULTS.aiCount). */
export const DEFAULT_AI_COUNT = 3;

const KEY = 'greenline_ai_count';

/** Whole number inside [GRID_MIN_AI, GRID_MAX_AI]; anything else = the default. */
export function clampAiCount(n: unknown): number {
	const v = typeof n === 'string' ? Number(n) : n;
	if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_AI_COUNT;
	return Math.max(GRID_MIN_AI, Math.min(GRID_MAX_AI, Math.round(v)));
}

export const gridSelection = $state({
	aiCount: browser ? clampAiCount(localStorage.getItem(KEY)) : DEFAULT_AI_COUNT
});

export function setAiCount(n: number): void {
	const resolved = clampAiCount(n);
	gridSelection.aiCount = resolved;
	if (browser) localStorage.setItem(KEY, String(resolved));
}
