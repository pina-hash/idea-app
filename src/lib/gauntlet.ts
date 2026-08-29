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

/**
 * Build status surfaced in the mode grid. `live` modes are playable;
 * `construction` modes exist but are being reworked, so they are shown but not
 * enterable; `soon` modes are not built yet.
 */
export type ModeStatus = 'live' | 'soon' | 'construction';

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
		status: 'construction',
		href: '/gauntlet/reverse-engineer'
	},
	{
		id: 'feature_golf',
		name: 'Feature Golf',
		family: 'modeling',
		tagline: 'Hit the target geometry in the fewest features.',
		scoring: 'Correct volume, fewest features wins',
		status: 'construction',
		href: '/gauntlet/feature-golf'
	},
	{
		id: 'drawing_reading',
		name: 'Drawing Reading',
		family: 'knowledge',
		tagline: 'Read orthographic views and match them to the 3D part.',
		scoring: 'Correctness, time breaks ties',
		status: 'construction',
		href: '/gauntlet/drawing-reading'
	},
	{
		id: 'gdt_tolerance',
		name: 'GD&T and Tolerance',
		family: 'knowledge',
		tagline: 'Interpret geometric callouts, datums, and fits.',
		scoring: 'Correctness, time breaks ties',
		status: 'construction',
		href: '/gauntlet/gdt-tolerance'
	},
	{
		id: 'spot_the_error',
		name: 'Spot the Error',
		family: 'knowledge',
		tagline: 'Find the mistake in a drawing.',
		scoring: 'Correctness, time breaks ties',
		status: 'construction',
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

const MODE_STATUS_LABELS: Record<ModeStatus, string> = {
	live: 'Live',
	construction: 'Under construction',
	soon: 'Coming soon'
};

export function modeStatusLabel(status: ModeStatus): string {
	return MODE_STATUS_LABELS[status];
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

/**
 * Speedrun's per-challenge unit system: IPS (inch, pound, second) or MMGS
 * (millimeter, gram, second). Every presented property (density, target mass,
 * dimensions) follows whichever system the challenge is authored in; a
 * challenge never mixes systems. Reverse Engineer and Feature Golf are
 * unaffected (they keep the existing fixed g / cm3 / mm convention).
 */
export const UNIT_SYSTEMS = ['IPS', 'MMGS'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export interface UnitSystemUnits {
	length: string;
	mass: string;
	density: string;
	/** How dimensions read on the drawing, shown as the ruleset's "Units" line. */
	dimensionLabel: string;
}

export const UNIT_SYSTEM_UNITS: Record<UnitSystem, UnitSystemUnits> = {
	IPS: { length: 'in', mass: 'lb', density: 'lb/in³', dimensionLabel: 'Inch, 3-place decimal' },
	MMGS: { length: 'mm', mass: 'g', density: 'g/cm³', dimensionLabel: 'Millimeter, 2-place decimal' }
};

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
	/**
	 * Stable challenge identity slug (seed/authoring metadata). Harmless to expose
	 * and used as the idempotency key for content seeds; not read by the play UI.
	 */
	slug?: string;
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
	/**
	 * 0148, knowledge modes only: was THIS submit the one the server clock was
	 * running for. False on every later review attempt, whose `score_metric` is
	 * measured from the ORIGINAL start and so is a wall-clock figure rather than
	 * a time anybody spent answering. Optional because a deployment sitting
	 * between the client and the migration does not send it (see the ladder in
	 * KnowledgePlay), and because `gauntlet_submit`'s Speedrun branch has no
	 * clock of this kind at all.
	 */
	timed_attempt?: boolean;
}

/**
 * The public `prompt` framing for a modeling challenge (Speedrun, Reverse
 * Engineer, Feature Golf). `target_mass` / `tolerance_pct` here are display
 * copies; the authoritative grading values live in `answer`. For Speedrun and
 * Feature Golf the dimensioned drawing is hidden in `answer` and revealed on
 * Start; Reverse Engineer is untimed, so its `reference` is shown up front.
 */
export interface ModelingFraming {
	/** Stable, url-safe challenge slug (site data). Harmless to expose. */
	slug?: string;
	/** Speedrun only: the unit system every presented property follows. */
	unit_system?: UnitSystem;
	material?: string;
	density?: number;
	density_unit?: string;
	target_mass?: number;
	mass_unit?: string;
	tolerance_pct?: number;
	length_unit?: string;
	/** Par time in seconds (Speedrun benchmark, shown next to the challenge). */
	par_time?: number;
	/**
	 * Storage path of the STL model in the `gauntlet-models` bucket. Shape only
	 * (no dimensions), so it is public framing and previewed before Start.
	 */
	model_path?: string;
	note?: string;
	/**
	 * Optional YouTube video id for a per-drawing walkthrough. Normalized to the
	 * bare id at author time (see `normalizeYouTubeId`); public framing, rendered
	 * as a collapsible Tutorial panel in the play view (collapsed by default).
	 */
	tutorial_video_id?: string;
	/** Reverse Engineer: reference views/photo shown up front (inline SVG). */
	reference?: string;
	/** Feature Golf: the par feature count, shown for flavor (not graded). */
	par_features?: number;
	/**
	 * Speedrun: optional expected feature count for the telemetry "vs par" and
	 * stuck-point views (0035). Degrades gracefully when unset; distinct from
	 * Feature Golf's `par_features`.
	 */
	par_feature_count?: number;
	/** Placeholder demo challenge, to be replaced by a real captured part. */
	demo?: boolean;
}

/**
 * An author-defined focus region on a Speedrun drawing: a labelled rectangle the
 * student can jump to at high zoom. Coordinates are FRACTIONS of the page
 * (0 to 1, top-left origin), so they live in the drawing's own page coordinate
 * space and scale with it under pan and zoom. `page` is the 0-based page index
 * for multi-page PDF drawings; omitted means page 0 (every pre-PDF region).
 * Regions describe the hidden dimensioned drawing, so they live in the gated
 * `answer` (answer.focus_regions) and arrive with the drawing on Start.
 */
export interface FocusRegion {
	label: string;
	x: number;
	y: number;
	w: number;
	h: number;
	/** 0-based page index (multi-page PDF drawings); missing = page 0. */
	page?: number;
}

/**
 * A drawing series / collection (0022). A first-class organizing unit: authors
 * group challenges (a challenge belongs to one series or none) and students
 * browse by series. Membership lives in real challenge columns
 * (series_id / series_order), never clobbered by a content edit.
 */
export interface GauntletSeries {
	id: string;
	name: string;
	description: string | null;
	sort_order: number;
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
	/** Storage path of the dimensioned drawing PNG (gated; signed on the client). */
	drawing_image_path: string | null;
	/** Author-defined focus regions on the drawing (gated with it; may be null). */
	focus_regions: FocusRegion[] | null;
	asset_ref: string | null;
	code: string | null;
	reveal_at: string | null;
	expires_at: string | null;
}

/**
 * The one global Speedrun ruleset (a single shared record, not per-challenge).
 * Teacher-editable; shown next to every Speedrun challenge.
 */
export interface SpeedrunRuleset {
	units_label: string;
	projection: string;
	rule_lines: string[];
}

/** The default ruleset, used when the row has not been seeded/loaded yet. */
export const DEFAULT_SPEEDRUN_RULESET: SpeedrunRuleset = {
	units_label: 'inch, 3-place decimal',
	projection: 'third angle',
	rule_lines: ['Unless noted, all edges sharp', 'Do not scale drawing']
};

/** The Storage buckets holding the Speedrun geometry artifacts (private). */
export const DRAWINGS_BUCKET = 'gauntlet-drawings';
export const MODELS_BUCKET = 'gauntlet-models';

/** The grading result the macro posts back via `gauntlet_macro_submit`. */
export interface MacroResult {
	is_correct: boolean;
	score_metric: number | null;
}

/**
 * Every downloadable tool is served DIRECTLY from `static/tools/`, so the site
 * hands them out itself (no Supabase Storage bucket, no signed URL, no
 * storage-404 class of bug). The teacher rebuilds the add-in zip with
 * `tools/solidworks-addin/build.ps1 -Package` and drops it at
 * `static/tools/idea-gauntlet-addin.zip`; the macros are plain source files.
 */
export const START_MACRO_PATH = '/tools/idea-gauntlet-start.bas';
export const SUBMIT_MACRO_PATH = '/tools/idea-gauntlet-submit.bas';
export const AUTHOR_MACRO_PATH = '/tools/idea-gauntlet-author.bas';

/** Static path to the built SolidWorks add-in zip (DLL + interops + installers). */
export const ADDIN_DOWNLOAD_PATH = '/tools/idea-gauntlet-addin.zip';

/** Static path to the tools manifest (versions, dates, changelog). */
export const TOOLS_MANIFEST_PATH = '/tools/tools-manifest.json';

/** One tool track (macros or the add-in) in `tools-manifest.json`. */
export interface ToolTrack {
	version: string;
	updated: string;
	changelog: string[];
	/** The add-in track's download path; macros list their files instead. */
	path?: string;
	files?: { name: string; path: string }[];
}

/** The shape of `static/tools/tools-manifest.json`. */
export interface ToolsManifest {
	generated: string;
	macros: ToolTrack;
	addin: ToolTrack;
}

/**
 * The coarse, UNSIGNED correctness band that is the only thing a failing submit
 * learns about how wrong it is (0061, extended to every path in 0147).
 *
 * `withheld` is the room path's budgeted form: past the coaching cap the band
 * goes quiet while the racer can still submit and still pass. `unknown` means
 * the level carries no target to compare against, which is a level problem, not
 * a student one.
 */
export type DeviationBand = 'pass' | 'close' | 'near' | 'far' | 'unknown' | 'withheld';

const BAND_LABELS: Record<DeviationBand, string> = {
	pass: 'In tolerance',
	close: 'Very close',
	near: 'Outside tolerance',
	far: 'Well outside',
	unknown: 'No target set',
	withheld: 'No more hints this round'
};

const BAND_HINTS: Record<DeviationBand, string> = {
	pass: '',
	close: 'A single feature or a fillet is usually the difference.',
	near: 'Re-check a dimension against the drawing.',
	far: 'A dimension has probably been misread, or a feature is missing.',
	unknown: 'This level has no stored target, so it cannot be checked.',
	withheld: 'Keep submitting; the check still counts.'
};

/**
 * The band's own words. ONE vocabulary, shared by the practice check and the
 * room board, so the same verdict never reads two ways.
 *
 * There is deliberately NO percentage, delta or target here, and nothing that
 * takes one: a number beside the student's own mass is what 0147 removed from
 * the payload, and re-deriving one in the client would put it straight back.
 *
 * AN ABSENT BAND IS NOT `unknown`, AND THE TWO MUST NOT COLLAPSE. `unknown` is
 * the server saying the LEVEL has no target to check against; absent means this
 * caller has no band at all, which happens in two ordinary ways: a room result
 * rebuilt from a Realtime row (which carries only correctness and a time), and
 * a client deployed before 0147 is applied by hand. Both are plain misses and
 * must read as one, so absent falls back to the generic wording rather than
 * telling a student their level is broken.
 */
export function deviationBandLabel(band: string | null | undefined): string {
	if (band === null || band === undefined || band === '') return 'Outside tolerance';
	return BAND_LABELS[band as DeviationBand] ?? 'Outside tolerance';
}

export function deviationBandHint(band: string | null | undefined): string {
	if (band === null || band === undefined || band === '') return '';
	return BAND_HINTS[band as DeviationBand] ?? '';
}

/**
 * The grading result returned by `gauntlet_submit` for a Speedrun challenge (the
 * unranked manual practice check).
 *
 * `target_mass` and `tolerance_pct` were REMOVED in 0147. They were returned on
 * every call, pass or fail, to any signed-in caller with nothing but a challenge
 * id, which made this unlimited free check a one-call read of the ranked answer
 * key. What is left is the caller's OWN typed mass and the coarse band.
 */
export interface SpeedrunResult {
	mode: 'speedrun';
	is_correct: boolean;
	your_mass: number | null;
	mass_unit: string | null;
	unit_system: string | null;
	deviation_band: DeviationBand | null;
	score_metric: number | null;
}

/** The result returned by `gauntlet_room_manual_submit` (live room racer). */
export interface RoomManualResult {
	is_correct: boolean;
	score_metric: number | null;
	rank: number | null;
	your_mass: number | null;
	mass_unit: string | null;
	deviation_band: DeviationBand | null;
	coaching_remaining: number | null;
}

/** Format a mass value with its unit for display (e.g. "270 g"). */
export function formatMass(value: number | null | undefined, unit = 'g'): string {
	if (value === null || value === undefined || Number.isNaN(value)) return '--';
	const rounded = Math.round(value * 100) / 100;
	return `${rounded} ${unit}`;
}

/**
 * The target volume (mm3) implied by a level's PUBLISHED target mass and density.
 *
 * READ THE SOURCE OF `massLevel` BEFORE CALLING THIS. It must come from the
 * challenge's `prompt` -- the author's published spec card, which the student is
 * already shown and which reaches the client through the ordinary `challenges`
 * select. It must NEVER come from an RPC, because an RPC value is derived from
 * `challenges.answer` at machine precision and tracks the ranked comparison
 * exactly even where the published copy is rounded, stale or absent.
 *
 * That distinction is the whole of 0147. This function used to be fed
 * `target_mass_level` straight out of `gauntlet_run_targets`, and its own
 * docstring described that as safe on the grounds that the value was "public
 * framing". It was not: 0061 had removed `target_volume_mm3` from that payload
 * precisely because it is the ranked comparison, and then returned the same
 * number as a mass beside the density that divides it back out. This helper was
 * the divider. It survives because a gauge drawn from what the author chose to
 * publish is a display decision; it is the INPUT that had to change.
 *
 * `density` is g/cm3; `massLevel` is in the level's own unit, g for MMGS and lb
 * for IPS. Mirrors the server's mass = (volume_mm3 / 1000) * density_g_cm3.
 */
export function targetVolumeFromMass(
	massLevel: number | null,
	density: number | null,
	unitSystem: string
): number | null {
	if (massLevel == null || density == null || !(density > 0) || !(massLevel > 0)) return null;
	const massG = unitSystem.toUpperCase() === 'IPS' ? massLevel * 453.59237 : massLevel;
	return (massG * 1000) / density;
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

// ---------------------------------------------------------------------------
// Live rooms (synchronized Speedrun sessions; see docs/GAUNTLET.md).
// ---------------------------------------------------------------------------

export type RoomState = 'lobby' | 'live' | 'results';
export type RoomRole = 'host' | 'racer' | 'spectator';

export interface GauntletRoom {
	id: string;
	host_id: string;
	join_code: string;
	current_challenge_id: string | null;
	state: RoomState;
	started_at: string | null;
	/** Server-stamped room open time; the ROOM session timer counts from here. */
	created_at: string | null;
}

export interface RoomParticipant {
	user_id: string;
	role: 'racer' | 'spectator';
	player: string;
}

/** A row from the `gauntlet_room_board` view. */
export interface RoomBoardRow {
	user_id: string;
	player: string;
	is_correct: boolean | null;
	score_metric: number | null;
	source: 'manual' | 'macro';
	rank: number;
}

/** Payload from `gauntlet_room_reveal` once the host starts the round. */
export interface RoomReveal {
	drawing: string | null;
	code: string | null;
	started_at: string | null;
}

const ROOM_STATE_LABELS: Record<RoomState, string> = {
	lobby: 'Lobby',
	live: 'Live',
	results: 'Results'
};

export function roomStateLabel(state: RoomState): string {
	return ROOM_STATE_LABELS[state] ?? state;
}

// ---------------------------------------------------------------------------
// Speedrun telemetry (0035). Append-only run events + derived analysis.
// ---------------------------------------------------------------------------

/** One raw telemetry event from `gauntlet_run_events` (append-only stream). */
export interface RunEvent {
	seq: number;
	t_ms: number;
	event_type: string;
	payload: Record<string, unknown>;
}

/** The level constants a telemetry view needs to size gauges (from the load). */
export interface TelemetryTargets {
	targetVolumeMm3: number | null;
	densityGcm3: number | null;
	targetMassLevel: number | null;
	massUnit: string;
	unitSystem: string;
	parTime: number | null;
	parFeatures: number | null;
}

/** Read a numeric field from an event payload (tolerant of string encodings). */
export function eventNum(payload: Record<string, unknown>, key: string): number | null {
	const v = payload?.[key];
	if (v === null || v === undefined) return null;
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? n : null;
}

/** Format a `score_metric` (elapsed seconds, lower better) for display. */
export function formatTime(seconds: number | null | undefined): string {
	if (seconds === null || seconds === undefined) return '--';
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	const m = Math.floor(seconds / 60);
	const s = Math.round(seconds % 60);
	return `${m}m ${s.toString().padStart(2, '0')}s`;
}
