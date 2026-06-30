/**
 * IDEA // GAUNTLET: the single source of truth for the CAD skills dojo's modes
 * and shared types.
 *
 * Like `curriculum.ts`, this module is PLAIN DATA (no `?raw` / `$lib/legacy`
 * imports) so it is safe in the client bundle. The mode catalog drives the
 * mode-select grid; the types describe the JSONB shapes stored in the
 * `challenges` table (see `supabase/migrations/0004_gauntlet.sql` and
 * `docs/GAUNTLET.md`).
 */

/** The six modes, matching the `gauntlet_mode` Postgres enum exactly. */
export type GauntletModeId =
	| 'speedrun'
	| 'reverse_engineer'
	| 'feature_golf'
	| 'drawing_reading'
	| 'gdt_tolerance'
	| 'spot_the_error';

/** Modeling modes read geometry from SolidWorks; knowledge modes are web only. */
export type ModeFamily = 'modeling' | 'knowledge';

/** Build status surfaced in the mode grid. `live` modes are playable. */
export type ModeStatus = 'live' | 'soon';

export interface GauntletMode {
	id: GauntletModeId;
	name: string;
	family: ModeFamily;
	/** One-line pitch for the mode card. */
	tagline: string;
	/** How the mode is scored, shown as the card's metric line. */
	scoring: string;
	status: ModeStatus;
	/** Route for a live mode; undefined while a mode is still "coming soon". */
	href?: string;
}

/**
 * Every mode, in build order. Keep `id` in sync with the `gauntlet_mode` enum.
 */
export const MODES: GauntletMode[] = [
	{
		id: 'speedrun',
		name: 'Speedrun',
		family: 'modeling',
		tagline: 'Model a dimensioned part as fast as you can.',
		scoring: 'Hit the mass, fastest time wins',
		status: 'live',
		href: '/gauntlet/speedrun'
	},
	{
		id: 'reverse_engineer',
		name: 'Reverse Engineer',
		family: 'modeling',
		tagline: 'Reproduce a part from an object or its views. No clock.',
		scoring: 'Closest on volume and area wins',
		status: 'live',
		href: '/gauntlet/reverse-engineer'
	},
	{
		id: 'feature_golf',
		name: 'Feature Golf',
		family: 'modeling',
		tagline: 'Hit the target geometry in the fewest features.',
		scoring: 'Correct volume, fewest features wins',
		status: 'live',
		href: '/gauntlet/feature-golf'
	},
	{
		id: 'drawing_reading',
		name: 'Drawing Reading',
		family: 'knowledge',
		tagline: 'Read orthographic views and match them to the 3D part.',
		scoring: 'Correctness, time breaks ties',
		status: 'live',
		href: '/gauntlet/drawing-reading'
	},
	{
		id: 'gdt_tolerance',
		name: 'GD&T and Tolerance',
		family: 'knowledge',
		tagline: 'Interpret geometric callouts, datums, and fits.',
		scoring: 'Correctness, time breaks ties',
		status: 'live',
		href: '/gauntlet/gdt-tolerance'
	},
	{
		id: 'spot_the_error',
		name: 'Spot the Error',
		family: 'knowledge',
		tagline: 'Find the mistake in a drawing.',
		scoring: 'Correctness, time breaks ties',
		status: 'live',
		href: '/gauntlet/spot-the-error'
	}
];

export function modeById(id: string | null | undefined): GauntletMode | undefined {
	if (!id) return undefined;
	return MODES.find((m) => m.id === id);
}

const FAMILY_LABELS: Record<ModeFamily, string> = {
	modeling: 'Modeling',
	knowledge: 'Knowledge'
};

export function familyLabel(family: ModeFamily): string {
	return FAMILY_LABELS[family];
}

/** Difficulty is stored as 1 to 5; these are the human labels for the chips. */
export const DIFFICULTY_LABELS: Record<number, string> = {
	1: 'Warmup',
	2: 'Easy',
	3: 'Medium',
	4: 'Hard',
	5: 'Expert'
};

export function difficultyLabel(d: number): string {
	return DIFFICULTY_LABELS[d] ?? `Level ${d}`;
}

// ---------------------------------------------------------------------------
// JSONB shapes. These mirror the `prompt` column written by the seed migration.
// The `answer` column is never sent to the client, so it has no type here.
// ---------------------------------------------------------------------------

/** One selectable answer. `label` is plain text; `svg` is an inline thumbnail. */
export interface ChallengeOption {
	id: string;
	label?: string;
	svg?: string;
}

/** A free-entry answer field (short text or a number), as an alternative to options. */
export interface KnowledgeInput {
	/** 'text' is exact-match (case/space-insensitive); 'numeric' grades with a tolerance. */
	type: 'text' | 'numeric';
	unit?: string;
	placeholder?: string;
}

/**
 * The public `prompt` payload for a knowledge-mode challenge (Drawing Reading,
 * GD&T and Tolerance, Spot the Error). A challenge is either multiple choice
 * (`options`) or free entry (`input`); the server grades by the answer `type` in
 * the hidden `answer` payload. The correct answer never appears here.
 */
export interface KnowledgePrompt {
	/** Inline SVG of the drawing/views, when the challenge ships its own art. */
	drawing?: string;
	question: string;
	/** Multiple-choice options; omit for a free-entry answer. */
	options?: ChallengeOption[];
	/** Free-entry answer field; omit for multiple choice. */
	input?: KnowledgeInput;
	/** Optional reading instructions shown above the question. */
	instructions?: string;
}

/** A challenge row as exposed to the client (no answer fields). */
export interface ChallengeSummary {
	id: string;
	mode: GauntletModeId;
	title: string;
	difficulty: number;
}

export interface ChallengeDetail extends ChallengeSummary {
	asset_ref: string | null;
	prompt: KnowledgePrompt;
}

/** A row from the `gauntlet_leaderboard` view. */
export interface LeaderboardRow {
	challenge_id: string;
	user_id: string;
	player: string;
	is_correct: boolean | null;
	score_metric: number | null;
	rank: number;
	created_at: string;
}

/** The grading result returned by the `gauntlet_submit` RPC (knowledge modes). */
export interface SubmitResult {
	is_correct: boolean;
	correct: string | null;
	explanation: string | null;
	score_metric: number | null;
}

/**
 * The public `prompt` framing for a modeling challenge (Speedrun, Reverse
 * Engineer, Feature Golf). `target_mass` / `tolerance_pct` here are display
 * copies; the authoritative grading values live in `answer`. For Speedrun and
 * Feature Golf the dimensioned drawing is hidden in `answer` and revealed on
 * Start; Reverse Engineer is untimed, so its `reference` is shown up front.
 */
export interface ModelingFraming {
	material?: string;
	density?: number;
	density_unit?: string;
	target_mass?: number;
	mass_unit?: string;
	tolerance_pct?: number;
	length_unit?: string;
	note?: string;
	/** Reverse Engineer: reference views/photo shown up front (inline SVG). */
	reference?: string;
	/** Feature Golf: the par feature count, shown for flavor (not graded). */
	par_features?: number;
	/** Placeholder demo challenge, to be replaced by a real captured part. */
	demo?: boolean;
}

/** Backwards-compatible alias: Speedrun uses the shared modeling framing. */
export type SpeedrunFraming = ModelingFraming;

/**
 * Payload returned by `gauntlet_speedrun_reveal` when the student clicks Start.
 * `code` is the single-use submit code the macro posts; `reveal_at` is the
 * server-authoritative clock start (the macro times against it, not the client).
 */
export interface SpeedrunReveal {
	drawing: string | null;
	asset_ref: string | null;
	code: string | null;
	reveal_at: string | null;
	expires_at: string | null;
}

/** The grading result the macro posts back via `gauntlet_macro_submit`. */
export interface MacroResult {
	is_correct: boolean;
	score_metric: number | null;
}

/** Path to the downloadable SolidWorks capture macro (served from static/). */
export const MACRO_PATH = '/gauntlet/idea-gauntlet-speedrun.bas';

/** The grading result returned by `gauntlet_submit` for a Speedrun challenge. */
export interface SpeedrunResult {
	mode: 'speedrun';
	is_correct: boolean;
	your_mass: number | null;
	target_mass: number | null;
	tolerance_pct: number | null;
	score_metric: number | null;
}

/** Format a mass value with its unit for display (e.g. "270 g"). */
export function formatMass(value: number | null | undefined, unit = 'g'): string {
	if (value === null || value === undefined || Number.isNaN(value)) return '--';
	const rounded = Math.round(value * 100) / 100;
	return `${rounded} ${unit}`;
}

/** Format a Reverse Engineer deviation metric (percent, lower is better). */
export function formatDeviation(value: number | null | undefined): string {
	if (value === null || value === undefined || Number.isNaN(value)) return '--';
	return `${value}%`;
}

/** Format a Feature Golf feature count (lower is better). */
export function formatFeatures(value: number | null | undefined): string {
	if (value === null || value === undefined || Number.isNaN(value)) return '--';
	return `${value}`;
}

/** Format a `score_metric` (elapsed seconds, lower better) for display. */
export function formatTime(seconds: number | null | undefined): string {
	if (seconds === null || seconds === undefined) return '--';
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	const m = Math.floor(seconds / 60);
	const s = Math.round(seconds % 60);
	return `${m}m ${s.toString().padStart(2, '0')}s`;
}
