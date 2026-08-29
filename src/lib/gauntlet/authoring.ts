/**
 * IDEA // GAUNTLET authoring helpers (client-side). Plain logic, no Svelte: the
 * paste-capture parser for the macro Author output, and the builders that turn
 * the mode-aware form state into the EXACT `prompt` / `answer` JSONB shapes the
 * play screens and grading RPCs already read (see docs/GAUNTLET.md). Keep these
 * shapes in lock-step with the seeds in supabase/migrations/0004..0008.
 *
 * THE SPLIT BETWEEN THE TWO OBJECTS IS AN AUTHORIZATION BOUNDARY, NOT A
 * CONVENIENCE. `challenges.prompt` carries a column grant to `authenticated`
 * (0004) and `challenges.answer` carries none, so a field's OBJECT decides
 * whether every signed-in student can read it. `buildPayload` is where that
 * decision is made; see its own comment for the three fields 0153 moved.
 */

import {
	modeById,
	UNIT_SYSTEM_UNITS,
	type FocusRegion,
	type GauntletModeId,
	type UnitSystem
} from '$lib/gauntlet';

/**
 * Extract a bare YouTube video id from a URL or an already-bare id (feature 4).
 * Returns '' when nothing valid is found, so the form can flag bad input and
 * `buildPayload` simply omits an empty tutorial. Accepts watch, youtu.be, embed,
 * shorts, and live URL shapes.
 */
export function normalizeYouTubeId(input: string): string {
	const s = (input ?? '').trim();
	if (!s) return '';
	if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
	const patterns = [
		/[?&]v=([A-Za-z0-9_-]{11})/,
		/youtu\.be\/([A-Za-z0-9_-]{11})/,
		/\/embed\/([A-Za-z0-9_-]{11})/,
		/\/shorts\/([A-Za-z0-9_-]{11})/,
		/\/live\/([A-Za-z0-9_-]{11})/
	];
	for (const re of patterns) {
		const m = s.match(re);
		if (m) return m[1];
	}
	return '';
}

/**
 * A focus region as edited in the form: percent (0 to 100) of the page,
 * top-left origin, plus the 0-based page index for multi-page PDF drawings.
 * Converted to the canonical 0-to-1 `FocusRegion` fractions in `buildPayload`,
 * and back in `formFromChallenge`.
 */
export interface FocusRegionInput {
	label: string;
	x: number;
	y: number;
	w: number;
	h: number;
	/** 0-based page index (multi-page PDF drawings); 0 for single-page/raster/SVG. */
	page: number;
}

/** Geometry parsed out of the macro's Author-capture message-box text. */
export interface CapturedGeometry {
	target_volume_mm3?: number;
	surface_area_mm2?: number;
	feature_count?: number;
	density?: number;
	target_mass?: number;
	/** Exact SolidWorks library material name; student submits must match it (0026). */
	material?: string;
}

/**
 * Parse the macro's Author-capture output (lines like `key : value`) into the
 * geometry fields. Tolerant of spacing and of the unit suffixes the macro adds
 * (e.g. `density (g/cm3)`).
 */
export function parseAuthorCapture(text: string): CapturedGeometry {
	const num = (re: RegExp): number | undefined => {
		const m = text.match(re);
		if (!m) return undefined;
		const n = Number(m[1]);
		return Number.isFinite(n) ? n : undefined;
	};
	const materialMatch = text.match(/^\s*material\s*:\s*(.+)$/im);
	const material = materialMatch ? materialMatch[1].trim() : undefined;
	return {
		target_volume_mm3: num(/target_volume_mm3\s*:?\s*([0-9.eE+-]+)/i),
		surface_area_mm2: num(/surface_area_mm2\s*:?\s*([0-9.eE+-]+)/i),
		feature_count: num(/feature_count\s*:?\s*([0-9]+)/i),
		density: num(/density[^:\n]*:?\s*([0-9.eE+-]+)/i),
		target_mass: num(/target_mass[^:\n]*:?\s*([0-9.eE+-]+)/i),
		material: material && material.length > 0 ? material : undefined
	};
}

/**
 * Mass implied by a volume (mm3) and density, in whichever unit system the
 * challenge is authored in (MMGS: g from vol_cm3 * density in g/cm3; IPS: lb
 * from vol_in3 * density in lb/in3). Defaults to MMGS for Reverse Engineer and
 * Feature Golf, which have no unit_system field and keep the original g/cm3
 * convention.
 */
export function massFromGeometry(
	volumeMm3: number | null,
	density: number | null,
	system: UnitSystem = 'MMGS'
): number | null {
	if (volumeMm3 == null || density == null || volumeMm3 <= 0 || density <= 0) return null;
	const volume = system === 'IPS' ? volumeMm3 / 16387.064 : volumeMm3 / 1000;
	return Math.round(volume * density * 1000) / 1000;
}

export type AnswerType = 'choice' | 'text' | 'numeric';

/**
 * The ranked volume pass band, percent, a freshly authored modeling challenge
 * starts on. It MUST equal the server's own default, `c_volume_tol_pct` in
 * `gauntlet_macro_submit` (currently 0.1, set by migration 0036 and carried
 * forward verbatim by 0061), which is also the value the VBA capture macros
 * (GAUNTLET_VOLUME_TOL_PCT) and the C# add-in (GauntletMath.VolumeTolPct) show
 * the student live while they model.
 *
 * WHY THIS EXISTS AS A CONSTANT AT ALL, rather than the form simply leaving the
 * field unset and letting the server default govern -- which is what the
 * no-duplicate-rule instinct asks for, and what was tried first.
 * `gauntlet_publish_blocker` (0009, last defined in 0034) REFUSES to publish a
 * modeling challenge whose `answer` carries no `tolerance_pct`:
 *
 *     'A tolerance band is required to publish.'
 *
 * So an explicit band is mandatory on every published modeling challenge, and
 * the only question the form gets to answer is which one it starts on. Seeding
 * null would leave a freshly authored challenge unpublishable until the author
 * typed a number they have no guidance for, which is how 0.5 gets typed again.
 *
 * THE BUG THIS REPLACES. The seed was the literal 0.5 from 0009 onwards. 0036
 * tightened the server default 0.5 -> 0.1 and kept the macros and the add-in in
 * sync, but nothing moved the form -- and because `buildPayload` writes the seed
 * into `answer`, where the per-level override BEATS the server constant, every
 * challenge authored through the form since 0036 has been graded at 0.5: five
 * times wider than the default, and five times wider than the band the student
 * watched while modelling. A part the add-in calls a fail could be a ranked
 * pass. `tests/gauntlet-authoring-tolerance.test.ts` reads the constant back out
 * of the live migration SQL and pins the two together so the next tightening
 * cannot leave the form behind again.
 *
 * Already-stored rows are NOT touched by changing this: `formFromChallenge`
 * reads the challenge's own stored band when editing, so an existing 0.5
 * challenge keeps grading at 0.5 until somebody decides otherwise. Migration
 * 0146 prints the counts at apply time.
 */
export const GAUNTLET_DEFAULT_TOLERANCE_PCT = 0.1;

/** Flat, editable state behind the authoring form. */
export interface AuthorFormState {
	id: string | null;
	mode: GauntletModeId;
	title: string;
	difficulty: number;
	status: 'draft' | 'published' | 'archived';
	// modeling
	/** Stable, url-safe challenge slug (Speedrun site data). */
	slug: string;
	/** Speedrun only: the unit system every presented property follows. */
	unit_system: UnitSystem;
	material: string;
	density: number | null;
	target_volume_mm3: number | null;
	surface_area_mm2: number | null;
	feature_count: number | null;
	target_mass: number | null;
	/**
	 * Ranked pass band, percent, written into `answer` ALONE -- what
	 * `gauntlet_macro_submit` grades on, where it beats the server's own default.
	 * It used to be written into `prompt` as well, as the student's on-page
	 * readout; that copy is gone and must not come back (see `buildPayload`). It
	 * is seeded to GAUNTLET_DEFAULT_TOLERANCE_PCT and must stay equal to the
	 * server constant: see that constant for why the form cannot simply leave it
	 * unset.
	 */
	tolerance_pct: number | null;
	/** Par time in seconds (Speedrun benchmark). */
	par_time: number | null;
	par_features: number | null;
	note: string;
	/** Speedrun only: optional per-drawing YouTube walkthrough (URL or id). */
	tutorialVideoId: string;
	/** Speedrun only: optional focus regions (percent), gated with the drawing. */
	focusRegions: FocusRegionInput[];
	/** Drawing (gated modes) or reference (Reverse Engineer): inline SVG or URL. */
	asset: string;
	/** Storage path of the dimensioned drawing PNG (gated, `gauntlet-drawings`). */
	drawing_image_path: string;
	/** Storage path of the STL model (preview, `gauntlet-models`). */
	model_path: string;
	// knowledge
	question: string;
	instructions: string;
	answerType: AnswerType;
	options: { id: string; label: string }[];
	/** Option id (choice) or the literal value (text / numeric). */
	correct: string;
	numericTolerance: number | null;
	inputUnit: string;
	explanation: string;
}

export function emptyForm(mode: GauntletModeId): AuthorFormState {
	return {
		id: null,
		mode,
		title: '',
		difficulty: 2,
		status: 'draft',
		slug: '',
		unit_system: 'IPS',
		material: '',
		density: null,
		target_volume_mm3: null,
		surface_area_mm2: null,
		feature_count: null,
		target_mass: null,
		tolerance_pct: GAUNTLET_DEFAULT_TOLERANCE_PCT,
		par_time: null,
		par_features: null,
		note: '',
		tutorialVideoId: '',
		focusRegions: [],
		asset: '',
		drawing_image_path: '',
		model_path: '',
		question: '',
		instructions: '',
		answerType: 'choice',
		options: [
			{ id: 'a', label: '' },
			{ id: 'b', label: '' }
		],
		correct: '',
		numericTolerance: 0,
		inputUnit: '',
		explanation: ''
	};
}

export function isModeling(mode: GauntletModeId): boolean {
	return modeById(mode)?.family === 'modeling';
}

function clean<T extends Record<string, unknown>>(obj: T): T {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(obj)) {
		if (v === null || v === undefined) continue;
		if (typeof v === 'string' && v.trim() === '') continue;
		out[k] = v;
	}
	return out as T;
}

/**
 * Build the `prompt` (public) and `answer` (private) JSONB exactly as the play
 * screens and grading RPCs expect them, per mode.
 */
export function buildPayload(s: AuthorFormState): { prompt: object; answer: object } {
	if (isModeling(s.mode)) {
		// Speedrun's density/mass/length units follow its unit_system, never mixed;
		// Reverse Engineer and Feature Golf keep the original fixed convention.
		const units = s.mode === 'speedrun' ? UNIT_SYSTEM_UNITS[s.unit_system] : null;
		// THE THREE ANSWER FIELDS ARE NOT HERE, AND PUTTING ONE BACK REOPENS THE
		// LEADERBOARD. `density`, `target_mass` and `tolerance_pct` used to be
		// written into BOTH objects, described as "display copies". They are not
		// display copies of anything: `prompt` is granted to `authenticated`
		// column by column (0004), so every published level handed any signed-in
		// student the ranked target and the pass band in one ordinary PostgREST
		// read -- no reveal, no run token, no search. 0061 and 0147 each recorded
		// this in their headers and neither closed it; 0153 strips it from the
		// rows already stored. They live in `answer`, which has no client grant,
		// and the author still sees what they typed because `gauntlet_author_get`
		// returns the whole row to a teacher.
		//
		// The unit LABELS stay: they say which units this level is authored in,
		// which is what a student needs to read their own Mass Properties, and
		// they name no quantity. `density_unit` outlives the density it labelled
		// for that reason -- it is one third of the unit convention, not a copy of
		// a value.
		const prompt = clean({
			material: s.material,
			density_unit: units ? units.density : 'g/cm³',
			mass_unit: units ? units.mass : 'g',
			length_unit: units ? units.length : 'mm',
			note: s.note,
			// Speedrun site data: stable slug, unit system, par time, and the
			// STL preview path (shape only, public and shown before Start).
			...(s.mode === 'speedrun'
				? {
						slug: s.slug.trim(),
						unit_system: s.unit_system,
						par_time: s.par_time,
						model_path: s.model_path,
						// Optional per-drawing walkthrough; normalized to a bare id (or '',
						// which clean() then drops so no field is written).
						tutorial_video_id: normalizeYouTubeId(s.tutorialVideoId)
					}
				: {}),
			// Reverse Engineer shows its reference up front (public, untimed).
			...(s.mode === 'reverse_engineer' ? { reference: s.asset } : {}),
			...(s.mode === 'feature_golf' ? { par_features: s.par_features } : {})
		});
		// Focus regions (Speedrun) are gated with the drawing: convert the form's
		// percents to 0-to-1 fractions and drop empty/degenerate ones.
		const regions =
			s.mode === 'speedrun'
				? s.focusRegions
						.map((r) => ({
							label: r.label.trim(),
							x: (r.x ?? 0) / 100,
							y: (r.y ?? 0) / 100,
							w: (r.w ?? 0) / 100,
							h: (r.h ?? 0) / 100,
							page: Math.max(0, Math.round(r.page ?? 0))
						}))
						.filter((r) => r.w > 0 && r.h > 0)
				: [];
		const answer = clean({
			// Gated drawing for Speedrun / Feature Golf (hidden, revealed on Start).
			...(s.mode === 'speedrun' || s.mode === 'feature_golf' ? { drawing: s.asset } : {}),
			// Gated dimensioned drawing PNG path (Speedrun), revealed on Start.
			...(s.mode === 'speedrun' ? { drawing_image_path: s.drawing_image_path } : {}),
			// Gated focus regions (Speedrun), handed back by the reveal RPC on Start.
			...(regions.length ? { focus_regions: regions } : {}),
			target_volume_mm3: s.target_volume_mm3,
			// Reverse Engineer scores on surface-area accuracy too.
			...(s.mode === 'reverse_engineer'
				? { target_surface_area_mm2: s.surface_area_mm2 }
				: { surface_area_mm2: s.surface_area_mm2 }),
			feature_count: s.feature_count,
			target_mass: s.target_mass,
			density: s.density,
			tolerance_pct: s.tolerance_pct
		});
		return { prompt, answer };
	}

	// knowledge
	const prompt: Record<string, unknown> = clean({
		drawing: s.asset,
		question: s.question,
		instructions: s.instructions
	});
	if (s.answerType === 'choice') {
		prompt.options = s.options
			.filter((o) => o.label.trim() !== '')
			.map((o) => ({ id: o.id, label: o.label.trim() }));
	} else {
		prompt.input = clean({ type: s.answerType, unit: s.inputUnit });
	}
	const answer = clean({
		correct: s.correct,
		type: s.answerType,
		...(s.answerType === 'numeric' ? { tolerance: s.numericTolerance ?? 0 } : {}),
		explanation: s.explanation
	});
	return { prompt, answer };
}

interface ChallengeFull {
	id: string;
	mode: GauntletModeId;
	title: string;
	difficulty: number;
	status: 'draft' | 'published' | 'archived';
	prompt: Record<string, unknown>;
	answer: Record<string, unknown>;
}

/** Populate the form state from a full challenge (gauntlet_author_get result). */
export function formFromChallenge(c: ChallengeFull): AuthorFormState {
	const base = emptyForm(c.mode);
	const p = c.prompt ?? {};
	const a = c.answer ?? {};
	const numOr = (v: unknown): number | null =>
		v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);

	if (isModeling(c.mode)) {
		return {
			...base,
			id: c.id,
			title: c.title,
			difficulty: c.difficulty,
			status: c.status,
			slug: (p.slug as string) ?? '',
			unit_system: (p.unit_system as UnitSystem) ?? base.unit_system,
			material: (p.material as string) ?? '',
			density: numOr(a.density ?? p.density),
			target_volume_mm3: numOr(a.target_volume_mm3),
			surface_area_mm2: numOr(a.target_surface_area_mm2 ?? a.surface_area_mm2),
			feature_count: numOr(a.feature_count),
			target_mass: numOr(a.target_mass ?? p.target_mass),
			tolerance_pct: numOr(a.tolerance_pct ?? p.tolerance_pct),
			par_time: numOr(p.par_time),
			par_features: numOr(p.par_features),
			note: (p.note as string) ?? '',
			tutorialVideoId: (p.tutorial_video_id as string) ?? '',
			focusRegions: Array.isArray(a.focus_regions)
				? (a.focus_regions as FocusRegion[]).map((r) => ({
						label: r.label ?? '',
						x: (r.x ?? 0) * 100,
						y: (r.y ?? 0) * 100,
						w: (r.w ?? 0) * 100,
						h: (r.h ?? 0) * 100,
						page: Math.max(0, Math.round(r.page ?? 0))
					}))
				: [],
			asset:
				c.mode === 'reverse_engineer'
					? ((p.reference as string) ?? '')
					: ((a.drawing as string) ?? ''),
			drawing_image_path: (a.drawing_image_path as string) ?? '',
			model_path: (p.model_path as string) ?? ''
		};
	}

	const options = Array.isArray(p.options)
		? (p.options as { id: string; label?: string }[]).map((o) => ({
				id: o.id,
				label: o.label ?? ''
			}))
		: base.options;
	const answerType = ((a.type as AnswerType) ?? 'choice') as AnswerType;
	const input = (p.input as { unit?: string } | undefined) ?? undefined;
	return {
		...base,
		id: c.id,
		title: c.title,
		difficulty: c.difficulty,
		status: c.status,
		question: (p.question as string) ?? '',
		instructions: (p.instructions as string) ?? '',
		asset: (p.drawing as string) ?? '',
		answerType,
		options,
		correct: (a.correct as string) ?? '',
		numericTolerance: numOr(a.tolerance) ?? 0,
		inputUnit: input?.unit ?? '',
		explanation: (a.explanation as string) ?? ''
	};
}
