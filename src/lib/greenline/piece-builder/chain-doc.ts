/**
 * GREENLINE piece-chain builder: the authoring document and its export.
 *
 * This is the v3 counterpart to `builder/pieces.ts` (which authors RIBBON
 * tracks and owns its own generators). The difference is the whole point:
 * this module owns NO geometry math. A piece chain's poses, samples, closure,
 * catch-plane raise, grade lint, and bank cap all come from `track-pieces.ts`
 * through `diagnoseChain` — the same walk `parseTrack` runs on a real track
 * load — so what the builder shows an author and what the game will accept
 * cannot drift. What lives here is the editor's document (kinds, params,
 * defaults, ordering) and the surrounding TrackData a chain needs to become a
 * file: spawn, gates, boundaries, and serialization.
 *
 * Pure data + math on the compiler's OUTPUT: no three.js, no Svelte, so a
 * console or a scratch script can drive the whole export path.
 */

import {
	diagnoseChain,
	PIECE_BANK_MAX_DEG,
	PIECE_GRADE_MAX,
	PIECE_PITCH_MAX_DEG,
	type ChainDiagnostics,
	type CompiledChain
} from '../track-pieces';
import type {
	PieceChainStart,
	PieceChainSurface,
	TrackBoundary,
	TrackData,
	TrackGate,
	TrackPiece,
	TrackVec2
} from '../track-schema';

const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ */
/* boundary margins (the Terminal Nine run-off lesson, ribbon builder's */
/* constants reused verbatim so both builders enclose a track alike)    */
/* ------------------------------------------------------------------ */

/** Flat-ground boundary offset beyond the ribbon edge (Proving Ground's 9 m). */
export const FLAT_MARGIN_M = 9;
/** Boundary offset floor beside raised track (Terminal Nine's deck lesson). */
export const MIN_ELEVATED_MARGIN_M = 1.8;

/* ------------------------------------------------------------------ */
/* the editable document                                               */
/* ------------------------------------------------------------------ */

export type PieceKind = TrackPiece['kind'];

/** One editable numeric field on a piece. */
export interface ParamSpec {
	key: string;
	label: string;
	min: number;
	max: number;
	step: number;
	unit: string;
	hint?: string;
}

export interface KindSpec {
	kind: PieceKind;
	label: string;
	blurb: string;
	params: ParamSpec[];
}

const WIDTH_PARAM: ParamSpec = {
	key: 'width',
	label: 'width',
	min: 4,
	max: 40,
	step: 0.5,
	unit: 'm',
	hint: 'corridor width this piece blends to'
};

/**
 * The catalog the palette and the inspector both render. Ranges MIRROR
 * `pieceIssue`'s ranges on purpose: the inputs stop an author short of a
 * violation, and the compiler still has the final say (a value typed past the
 * clamp is reported, never silently accepted).
 */
export const KIND_SPECS: KindSpec[] = [
	{
		kind: 'straight',
		label: 'Straight',
		blurb: 'Heading and bank held; the grade eases to a target pitch.',
		params: [
			{ key: 'length', label: 'length', min: 1, max: 2000, step: 1, unit: 'm' },
			{
				key: 'targetPitchDeg',
				label: 'target pitch',
				min: -PIECE_PITCH_MAX_DEG,
				max: PIECE_PITCH_MAX_DEG,
				step: 0.5,
				unit: 'deg',
				hint: 'grade at the exit; the climb eases into it'
			},
			WIDTH_PARAM
		]
	},
	{
		kind: 'curve',
		label: 'Curve',
		blurb: 'Plan arc at a fixed radius. Positive turn goes left.',
		params: [
			{ key: 'radius', label: 'radius', min: 4, max: 2000, step: 1, unit: 'm' },
			{
				key: 'turnDeg',
				label: 'turn',
				min: -270,
				max: 270,
				step: 5,
				unit: 'deg',
				hint: '+ left, - right'
			},
			WIDTH_PARAM
		]
	},
	{
		kind: 'bank',
		label: 'Bank',
		blurb: 'Roll transition on a straight run: bank eases to a target.',
		params: [
			{ key: 'length', label: 'length', min: 1, max: 2000, step: 1, unit: 'm' },
			{
				key: 'targetBankDeg',
				label: 'target bank',
				min: -PIECE_BANK_MAX_DEG,
				max: PIECE_BANK_MAX_DEG,
				step: 1,
				unit: 'deg',
				hint: '+ raises the driver-right edge'
			},
			WIDTH_PARAM
		]
	},
	{
		kind: 'jump',
		label: 'Jump',
		blurb: 'Kicker to a lip, a steep drop face, then a flat run-out.',
		params: [
			{
				key: 'length',
				label: 'length',
				min: 10,
				max: 2000,
				step: 1,
				unit: 'm'
			},
			{
				key: 'kickHeight',
				label: 'kick height',
				min: 0.25,
				max: 20,
				step: 0.1,
				unit: 'm'
			},
			WIDTH_PARAM
		]
	},
	{
		kind: 'corkscrew',
		label: 'Corkscrew',
		blurb: 'Bank and grade move together: the spiral climbs while it rolls.',
		params: [
			{ key: 'length', label: 'length', min: 8, max: 2000, step: 1, unit: 'm' },
			{
				key: 'turnDeg',
				label: 'turn',
				min: -270,
				max: 270,
				step: 5,
				unit: 'deg',
				hint: '0 = straight spiral'
			},
			{ key: 'rise', label: 'rise', min: -40, max: 40, step: 0.5, unit: 'm' },
			{
				key: 'peakBankDeg',
				label: 'peak bank',
				min: -PIECE_BANK_MAX_DEG,
				max: PIECE_BANK_MAX_DEG,
				step: 1,
				unit: 'deg',
				hint: 'reached mid-piece, back to the entry bank at the exit'
			},
			WIDTH_PARAM
		]
	},
	{
		kind: 'freeform',
		label: 'Freeform',
		blurb: 'Verbatim authored geometry in world coordinates. Ignores the incoming pose.',
		params: []
	}
];

export const kindSpec = (kind: PieceKind): KindSpec =>
	KIND_SPECS.find((k) => k.kind === kind) ?? KIND_SPECS[0];

/**
 * A new piece of the given kind. Parametric kinds get neutral defaults that
 * are always legal; a freeform piece is seeded with a short straight run from
 * `after` (the current chain exit) so it connects the moment it is added and
 * the author edits real numbers rather than an empty box.
 */
export function defaultPiece(
	kind: PieceKind,
	after?: { x: number; z: number; y: number; headingDeg: number }
): TrackPiece {
	switch (kind) {
		case 'straight':
			return { kind: 'straight', length: 60 };
		case 'curve':
			return { kind: 'curve', radius: 30, turnDeg: 90 };
		case 'bank':
			return { kind: 'bank', length: 24, targetBankDeg: 16 };
		case 'jump':
			return { kind: 'jump', length: 50, kickHeight: 2.4 };
		case 'corkscrew':
			return {
				kind: 'corkscrew',
				length: 70,
				turnDeg: 0,
				rise: 5,
				peakBankDeg: 22
			};
		case 'freeform': {
			const p = after ?? { x: 0, z: 0, y: 0, headingDeg: 0 };
			const dx = Math.cos(p.headingDeg * DEG);
			const dz = -Math.sin(p.headingDeg * DEG);
			const centerline: TrackVec2[] = [0, 1, 2, 3].map((k) => ({
				x: round2(p.x + dx * 4 * k),
				z: round2(p.z + dz * 4 * k)
			}));
			return {
				kind: 'freeform',
				centerline,
				elevations: centerline.map(() => round2(p.y))
			};
		}
	}
}

/** The whole authoring document: everything the export needs, nothing more. */
export interface ChainDoc {
	id: string;
	name: string;
	description: string;
	/** Corridor full width the chain starts at. */
	width: number;
	start: Required<PieceChainStart>;
	pieces: TrackPiece[];
	/** How many checkpoints the export spreads around the lap. */
	checkpointCount: number;
}

export function emptyDoc(): ChainDoc {
	return {
		id: 'my-track-01',
		name: 'My Track 01',
		description: '',
		width: 12,
		start: { x: 0, z: 0, y: 0, headingDeg: 0, pitchDeg: 0, bankDeg: 0 },
		pieces: [],
		checkpointCount: 4
	};
}

export const docSurface = (doc: ChainDoc): PieceChainSurface => ({
	type: 'pieces',
	width: doc.width,
	start: { ...doc.start },
	pieces: doc.pieces
});

/** Compile + guardrail report for the current document (the compiler's own). */
export const diagnoseDoc = (doc: ChainDoc): ChainDiagnostics => diagnoseChain(docSurface(doc));

/** A short human summary of a piece for the chain list. */
export function pieceSummary(p: TrackPiece): string {
	switch (p.kind) {
		case 'straight':
			return `${p.length} m${p.targetPitchDeg ? ` -> ${p.targetPitchDeg} deg` : ''}`;
		case 'curve':
			return `R${p.radius} ${p.turnDeg > 0 ? 'left' : 'right'} ${Math.abs(p.turnDeg)} deg`;
		case 'bank':
			return `${p.length} m -> ${p.targetBankDeg} deg`;
		case 'jump':
			return `${p.length} m, ${p.kickHeight} m lip`;
		case 'corkscrew':
			return `${p.length} m, ${p.rise >= 0 ? '+' : ''}${p.rise} m, ${p.peakBankDeg} deg${p.turnDeg ? `, ${p.turnDeg} deg turn` : ''}`;
		case 'freeform':
			return `${p.centerline.length} authored points`;
	}
}

/* ------------------------------------------------------------------ */
/* export: the compiled chain -> a droppable TrackData file            */
/* ------------------------------------------------------------------ */

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Unit tangent and driver-right normal at a stitched sample. */
function frameAt(c: CompiledChain, i: number): { tx: number; tz: number; nx: number; nz: number } {
	const n = c.center.length;
	const prev = c.center[(i - 1 + n) % n];
	const next = c.center[(i + 1) % n];
	let tx = next.x - prev.x;
	let tz = next.z - prev.z;
	const len = Math.hypot(tx, tz) || 1;
	tx /= len;
	tz /= len;
	// The runtime's leftEdge normal, the side positive banking raises.
	return { tx, tz, nx: -tz, nz: tx };
}

const headingOf = (tx: number, tz: number): number => Math.atan2(-tz, tx) / DEG;

/**
 * A gate placed BETWEEN two samples, never on one. A gate line through a
 * centerline point is degenerate: the vehicle's motion segment meets it at an
 * endpoint, `crossesGate` accepts t at both 0 and 1, and the same gate reports
 * again on the next segment as an out-of-order crossing. The ribbon builder
 * learned this the same way; midpoints removed the spurious rejections there.
 */
function gateAt(c: CompiledChain, i: number, id: string, name: string): TrackGate {
	const n = c.center.length;
	const a = c.center[i];
	const b = c.center[(i + 1) % n];
	const f = frameAt(c, i);
	const w = Math.max(c.widths[i], c.widths[(i + 1) % n]);
	return {
		id,
		name,
		x: round2((a.x + b.x) / 2),
		z: round2((a.z + b.z) / 2),
		headingDeg: round2(headingOf(f.tx, f.tz)),
		halfWidth: round2(w / 2 + 1)
	};
}

/**
 * Boundary offset for an edge at height `edgeY`: the Proving Ground 9 m on
 * flat ground, shrinking toward wall-tight as the edge rises, because 9 m of
 * run-off beside a deck is 9 m of thin air (Terminal Nine, Phase 8b).
 */
const marginFor = (edgeY: number): number =>
	Math.min(
		FLAT_MARGIN_M,
		Math.max(MIN_ELEVATED_MARGIN_M, FLAT_MARGIN_M - Math.max(0, edgeY - 0.4) * 2.4)
	);

export interface ExportOptions {
	/** Samples the spawn sits behind the start/finish line (default 2). */
	spawnBackSamples?: number;
}

/** Everything a compiled chain needs around it to become a raceable track. */
interface TrackFurniture {
	spawn: TrackData['spawn'];
	startFinish: TrackGate;
	checkpoints: TrackGate[];
	boundaries: TrackBoundary[];
}

/**
 * Derive the spawn, gates and boundaries from a COMPILED chain. Shared by the
 * export and the 3D preview so the surroundings an author inspects are the
 * ones the exported file will carry.
 */
function deriveFurniture(
	doc: ChainDoc,
	c: CompiledChain,
	opts: ExportOptions = {}
): TrackFurniture {
	const n = c.center.length;

	// --- gates: start/finish just after the chain start, checkpoints spread
	// evenly by sample count around the lap.
	const startFinish = gateAt(c, Math.min(6, Math.max(0, n - 2)), 'sf', 'Start/Finish');
	const count = Math.max(1, Math.min(12, Math.round(doc.checkpointCount)));
	const checkpoints: TrackGate[] = [];
	for (let k = 1; k <= count; k++) {
		const i = Math.round((k * n) / (count + 1)) % n;
		checkpoints.push(gateAt(c, i, `cp${k}`, `Checkpoint ${k}`));
	}

	// --- boundaries: one offset loop per side. Which side is "outer" is a
	// vote (the ribbon builder's convention): the side that lands further from
	// the lap's centroid on more samples.
	let cx = 0;
	let cz = 0;
	for (const p of c.center) {
		cx += p.x;
		cz += p.z;
	}
	cx /= n;
	cz /= n;
	let vote = 0;
	const frames = c.center.map((_, i) => frameAt(c, i));
	for (let i = 0; i < n; i++) {
		const f = frames[i];
		const dPlus = Math.hypot(c.center[i].x + f.nx - cx, c.center[i].z + f.nz - cz);
		const dMinus = Math.hypot(c.center[i].x - f.nx - cx, c.center[i].z - f.nz - cz);
		vote += dPlus > dMinus ? 1 : -1;
	}
	const plusIsOuter = vote >= 0;
	const offsetPt = (i: number, sign: 1 | -1): TrackVec2 => {
		const f = frames[i];
		const hw = c.widths[i] / 2;
		const br = c.banking[i] * DEG;
		const arm = hw * Math.cos(br);
		// The +normal side is the one positive banking raises.
		const edgeY = c.elevations[i] + sign * hw * Math.sin(br);
		const off = arm + marginFor(edgeY);
		return {
			x: round2(c.center[i].x + f.nx * sign * off),
			z: round2(c.center[i].z + f.nz * sign * off)
		};
	};
	const boundaries: TrackBoundary[] = [
		{
			id: 'outer',
			closed: true,
			points: c.center.map((_, i) => offsetPt(i, plusIsOuter ? 1 : -1))
		},
		{
			id: 'infield',
			closed: true,
			points: c.center.map((_, i) => offsetPt(i, plusIsOuter ? -1 : 1))
		}
	];

	// --- spawn: on the centerline a couple of samples BEHIND the line, facing
	// along it, so the grid sits before the timing gate the way every
	// committed track's does.
	const back = Math.max(1, Math.round(opts.spawnBackSamples ?? 2));
	const si = (Math.min(6, Math.max(0, n - 2)) - back + n) % n;
	const sf = frames[si];

	return {
		spawn: {
			x: round2(c.center[si].x),
			z: round2(c.center[si].z),
			headingDeg: round2(headingOf(sf.tx, sf.tz))
		},
		startFinish,
		checkpoints,
		boundaries
	};
}

/**
 * Turn the document into a complete TrackData: the compiled chain as a v3
 * `pieces` surface, plus the spawn, gates, and boundaries that make it
 * raceable. The SURFACE is exported as the authored chain (not the compiled
 * samples) — that is the whole point of v3 — while the gates and boundaries
 * are derived from the compiled geometry, so they always match the shape the
 * compiler actually produces.
 */
export function exportTrack(doc: ChainDoc, opts: ExportOptions = {}): TrackData {
	const diag = diagnoseDoc(doc);
	return {
		schemaVersion: 3,
		id: doc.id,
		name: doc.name,
		...(doc.description ? { description: doc.description } : {}),
		units: 'meters',
		...deriveFurniture(doc, diag.chain, opts),
		surface: {
			type: 'pieces',
			width: doc.width,
			start: cleanStart(doc.start),
			pieces: doc.pieces.map(cleanPiece)
		}
	};
}

/**
 * The SAME compiled chain as a track the 3D preview can build a runtime from,
 * even while the chain is breaking a guardrail.
 *
 * A v3 `pieces` surface cannot carry a broken chain: `parseTrack` compiles it
 * and the compiler throws on the first violation, which is right for a track
 * load and useless for an author who needs to SEE what they just broke. So the
 * preview ships `diagnoseChain`'s already-compiled arrays as a verbatim
 * `ribbon` surface. This is not a second geometry path: a ribbon IS a one-piece
 * verbatim `freeform` chain internally (the documented v3 backward-compat
 * contract), so `compileSurface` hands these very arrays straight back and
 * `buildRuntime` sweeps them exactly as it sweeps the pieces surface. Same
 * numbers, same sweep, same mesh — reachable while the chain is still invalid.
 *
 * Returns null when there is not yet enough chain to build a track from.
 */
export function previewTrack(doc: ChainDoc, diag: ChainDiagnostics): TrackData | null {
	const c = diag.chain;
	if (c.center.length < 3) return null;
	return {
		schemaVersion: 2,
		id: `${doc.id}-preview`,
		name: doc.name,
		units: 'meters',
		...deriveFurniture(doc, c),
		surface: {
			type: 'ribbon',
			width: c.width,
			widths: c.widths,
			elevations: c.elevations,
			banking: c.banking,
			closed: c.closed,
			centerline: c.center.map((p) => ({ x: p.x, z: p.z }))
		}
	};
}

function cleanStart(s: Required<PieceChainStart>): PieceChainStart {
	const out: PieceChainStart = {
		x: round2(s.x),
		z: round2(s.z),
		headingDeg: round2(s.headingDeg)
	};
	if (s.y) out.y = round2(s.y);
	if (s.pitchDeg) out.pitchDeg = round2(s.pitchDeg);
	if (s.bankDeg) out.bankDeg = round2(s.bankDeg);
	return out;
}

/** Drop optional fields left at their defaults, the committed tracks' style. */
function cleanPiece(p: TrackPiece): TrackPiece {
	if (p.kind === 'freeform') return p;
	const base = { ...p } as Record<string, unknown>;
	if (base.width === undefined) delete base.width;
	if (p.kind === 'straight' && p.targetPitchDeg === undefined) delete base.targetPitchDeg;
	return base as unknown as TrackPiece;
}

/** Stable key order at 2 dp, matching the committed track files. */
export function serializeTrack(track: TrackData): string {
	return `${JSON.stringify(track, (_k, v) => (typeof v === 'number' ? round2(v) : v), '\t')}\n`;
}

/* ------------------------------------------------------------------ */
/* guardrail summary for the UI                                        */
/* ------------------------------------------------------------------ */

export interface ChainSummary {
	sampleCount: number;
	lengthM: number;
	minElevM: number;
	maxElevM: number;
	maxBankDeg: number;
	maxGrade: number;
	/** Lowest swept edge y anywhere: what the y = 0 catch plane judges. */
	minEdgeYM: number;
	maxBankRaiseM: number;
	maxArchLiftM: number;
	closureGapM: number | null;
	closureHeadingDeg: number | null;
	closureElevM: number | null;
	closureBankDeg: number | null;
}

export function summarize(diag: ChainDiagnostics): ChainSummary {
	const c = diag.chain;
	let minElevM = Infinity;
	let maxElevM = -Infinity;
	let maxBankDeg = 0;
	let minEdgeYM = Infinity;
	for (let i = 0; i < c.center.length; i++) {
		minElevM = Math.min(minElevM, c.elevations[i]);
		maxElevM = Math.max(maxElevM, c.elevations[i]);
		maxBankDeg = Math.max(maxBankDeg, Math.abs(c.banking[i]));
		minEdgeYM = Math.min(
			minEdgeYM,
			c.elevations[i] - (c.widths[i] / 2) * Math.sin(Math.abs(c.banking[i]) * DEG)
		);
	}
	return {
		sampleCount: c.center.length,
		lengthM: c.lengthM,
		minElevM: minElevM === Infinity ? 0 : minElevM,
		maxElevM: maxElevM === -Infinity ? 0 : maxElevM,
		maxBankDeg,
		maxGrade: diag.pieces.reduce((m, p) => Math.max(m, p.maxGrade), 0),
		minEdgeYM: minEdgeYM === Infinity ? 0 : minEdgeYM,
		maxBankRaiseM: c.maxBankRaiseM,
		maxArchLiftM: diag.pieces.reduce((m, p) => Math.max(m, p.archLiftM), 0),
		closureGapM: c.closure?.gapM ?? null,
		closureHeadingDeg: c.closure?.headingGapDeg ?? null,
		closureElevM: c.closure?.elevGapM ?? null,
		closureBankDeg: c.closure?.bankGapDeg ?? null
	};
}

/** The grade ceiling the lint enforces, for the UI to show beside a reading. */
export const GRADE_LIMIT = PIECE_GRADE_MAX;
export const BANK_LIMIT_DEG = PIECE_BANK_MAX_DEG;

/* ------------------------------------------------------------------ */
/* per-browser persistence (the ribbon builder's convention)           */
/* ------------------------------------------------------------------ */

export const STORAGE_KEY = 'greenline_piece_builder_v1';

export function loadDoc(): ChainDoc | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<ChainDoc>;
		if (!parsed || !Array.isArray(parsed.pieces)) return null;
		const base = emptyDoc();
		return {
			...base,
			...parsed,
			start: { ...base.start, ...(parsed.start ?? {}) },
			pieces: parsed.pieces as TrackPiece[]
		};
	} catch {
		return null;
	}
}

export function saveDoc(doc: ChainDoc): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
	} catch {
		/* a full or blocked store must never break the editor */
	}
}
