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
 * Every mode, in build order. Drawing Reading and Speedrun are live; the rest
 * render as "coming soon" until their prompts land. Keep `id` in sync with the
 * `gauntlet_mode` enum.
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
		scoring: 'Volume plus surface area',
		status: 'soon'
	},
	{
		id: 'feature_golf',
		name: 'Feature Golf',
		family: 'modeling',
		tagline: 'Hit the target geometry in the fewest features.',
		scoring: 'Correct volume, fewest features wins',
		status: 'soon'
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
		status: 'soon'
	},
	{
		id: 'spot_the_error',
		name: 'Spot the Error',
		family: 'knowledge',
		tagline: 'Find the mistake in a drawing or model.',
		scoring: 'Correctness, time breaks ties',
		status: 'soon'
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

/** The public `prompt` payload for a knowledge-mode (e.g. Drawing Reading) challenge. */
export interface KnowledgePrompt {
	/** Inline SVG of the drawing/views, when the challenge ships its own art. */
	drawing?: string;
	question: string;
	options: ChallengeOption[];
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
 * The public `prompt` framing for a Speedrun challenge. Shown BEFORE Start (the
 * dimensioned drawing is hidden in the `answer` column and revealed by the
 * `gauntlet_speedrun_reveal` RPC). `target_mass` / `tolerance_pct` here are
 * display copies; the authoritative grading values live in `answer`.
 */
export interface SpeedrunFraming {
	material?: string;
	density?: number;
	density_unit?: string;
	target_mass?: number;
	mass_unit?: string;
	tolerance_pct?: number;
	length_unit?: string;
	note?: string;
	/** Placeholder demo challenge, to be replaced by a real captured part. */
	demo?: boolean;
}

/** Payload returned by `gauntlet_speedrun_reveal` when the student clicks Start. */
export interface SpeedrunReveal {
	drawing: string | null;
	asset_ref: string | null;
}

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

/** Format a `score_metric` (elapsed seconds, lower better) for display. */
export function formatTime(seconds: number | null | undefined): string {
	if (seconds === null || seconds === undefined) return '--';
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	const m = Math.floor(seconds / 60);
	const s = Math.round(seconds % 60);
	return `${m}m ${s.toString().padStart(2, '0')}s`;
}
