/**
 * IDEA // GAUNTLET authoring helpers (client-side). Plain logic, no Svelte: the
 * paste-capture parser for the macro Author output, and the builders that turn
 * the mode-aware form state into the EXACT `prompt` / `answer` JSONB shapes the
 * play screens and grading RPCs already read (see docs/GAUNTLET.md). Keep these
 * shapes in lock-step with the seeds in supabase/migrations/0004..0008.
 */

import { modeById, type GauntletModeId } from '$lib/gauntlet';

/** Geometry parsed out of the macro's Author-capture message-box text. */
export interface CapturedGeometry {
	target_volume_mm3?: number;
	surface_area_mm2?: number;
	feature_count?: number;
	density?: number;
	target_mass?: number;
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
	return {
		target_volume_mm3: num(/target_volume_mm3\s*:?\s*([0-9.eE+-]+)/i),
		surface_area_mm2: num(/surface_area_mm2\s*:?\s*([0-9.eE+-]+)/i),
		feature_count: num(/feature_count\s*:?\s*([0-9]+)/i),
		density: num(/density[^:\n]*:?\s*([0-9.eE+-]+)/i),
		target_mass: num(/target_mass[^:\n]*:?\s*([0-9.eE+-]+)/i)
	};
}

/** Mass (g) implied by a volume (mm3) and density (g/cm3): vol_cm3 * density. */
export function massFromGeometry(
	volumeMm3: number | null,
	density: number | null
): number | null {
	if (volumeMm3 == null || density == null || volumeMm3 <= 0 || density <= 0) return null;
	return Math.round((volumeMm3 / 1000) * density * 1000) / 1000;
}

export type AnswerType = 'choice' | 'text' | 'numeric';

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
	/** Challenge tier T1 to T4 (site data, distinct from difficulty). */
	tier: string;
	material: string;
	density: number | null;
	target_volume_mm3: number | null;
	surface_area_mm2: number | null;
	feature_count: number | null;
	target_mass: number | null;
	tolerance_pct: number | null;
	/** Par time in seconds (Speedrun benchmark). */
	par_time: number | null;
	par_features: number | null;
	note: string;
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
		tier: 'T1',
		material: '',
		density: null,
		target_volume_mm3: null,
		surface_area_mm2: null,
		feature_count: null,
		target_mass: null,
		tolerance_pct: 0.5,
		par_time: null,
		par_features: null,
		note: '',
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
		const prompt = clean({
			material: s.material,
			density: s.density,
			density_unit: 'g/cm³',
			target_mass: s.target_mass,
			mass_unit: 'g',
			tolerance_pct: s.tolerance_pct,
			length_unit: 'mm',
			note: s.note,
			// Speedrun site data: stable slug, tier, par time, and the STL preview
			// path (shape only, public and shown before Start).
			...(s.mode === 'speedrun'
				? {
						slug: s.slug.trim(),
						tier: s.tier,
						par_time: s.par_time,
						model_path: s.model_path
					}
				: {}),
			// Reverse Engineer shows its reference up front (public, untimed).
			...(s.mode === 'reverse_engineer' ? { reference: s.asset } : {}),
			...(s.mode === 'feature_golf' ? { par_features: s.par_features } : {})
		});
		const answer = clean({
			// Gated drawing for Speedrun / Feature Golf (hidden, revealed on Start).
			...(s.mode === 'speedrun' || s.mode === 'feature_golf' ? { drawing: s.asset } : {}),
			// Gated dimensioned drawing PNG path (Speedrun), revealed on Start.
			...(s.mode === 'speedrun' ? { drawing_image_path: s.drawing_image_path } : {}),
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
			tier: (p.tier as string) ?? base.tier,
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
