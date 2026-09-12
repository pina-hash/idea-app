/**
 * The FeatureManager's and the PropertyManager's arithmetic, with no Svelte and
 * no DOM in it, so every rule below is assertable without mounting anything.
 *
 * WHAT THIS MODULE MAY NOT DO: change the shape of a blade document.
 * `blade/tree.ts` owns `BladeFeature`, `blade/evaluate.ts` consumes it by
 * `featureOf(tree, <type>)`, and `blade/validate.ts` says what is legal. This
 * file reads all three and writes nothing they do not already describe -- every
 * edit below returns a `BladeTree` that `validateBladeTree` and `evaluate` were
 * already written for. That constraint is what decides which of the four verbs
 * the tree can actually offer, and each refusal below names its reason rather
 * than the control simply being missing.
 */
import type { BladeConfig } from '../blade/materials';
import type { BladeFeature, BladeTree, Station } from '../blade/tree';
import type { BladeProblem } from '../blade/validate';

/** The names 0145 PART 5 fixes for the six features, plus the two read nodes. */
export const FEATURE_LABELS: Record<string, string> = {
	'body-revolve': 'Body Revolve',
	'hex-extension': 'Hex Extension',
	'blade-sketch': 'Blade Sketch',
	'blade-extrude': 'Blade Extrude',
	'blade-pattern': 'Circular Pattern',
	'blade-mount': 'Blade Mount',
	materials: 'Materials',
	'standard-parts': 'Standard Parts'
};

export function featureLabel(id: string): string {
	return FEATURE_LABELS[id] ?? id;
}

/**
 * The features a feature is BUILT ON, read off the tree's own reference fields
 * rather than from a table written beside them. `ExtrudeFeature.sketch`,
 * `PatternFeature.feature` and `MountFeature.feature` are the declaration; a
 * second list of "what depends on what" is the copy that stops matching.
 */
export function featureParents(f: BladeFeature): string[] {
	switch (f.type) {
		case 'extrude':
			return [f.sketch];
		case 'circularPattern':
		case 'mount':
			return [f.feature];
		default:
			return [];
	}
}

/**
 * REORDER IS REAL AND IS THE ONE OF THE FOUR VERBS THE SCHEMA CARRIES WHOLE.
 * `evaluate` finds each feature by TYPE, so the array's order changes no
 * number; what it changes is the build order a student reads, which is the
 * order SolidWorks shows and the order a rollback would respect. So it is
 * offered, and it is constrained by the declared references above: a feature
 * may never sit above something it is built on, nor below something built on
 * it. A refusal is a SENTENCE, because a move that silently does nothing is
 * the same control twice.
 */
export function moveFeature(
	features: BladeFeature[],
	id: string,
	direction: -1 | 1
): { features: BladeFeature[]; refusal: string | null } {
	const from = features.findIndex((f) => f.id === id);
	const to = from + direction;
	if (from < 0) return { features, refusal: 'That feature is not in this tree.' };
	if (to < 0 || to >= features.length)
		return {
			features,
			refusal: `${featureLabel(id)} is already ${direction < 0 ? 'first' : 'last'}.`
		};
	const moving = features[from];
	const other = features[to];
	/* Moving UP past a parent, or DOWN past a child, is the illegal pair. */
	const blocked =
		direction < 0
			? featureParents(moving).includes(other.id)
			: featureParents(other).includes(moving.id);
	if (blocked) {
		const parent = direction < 0 ? other : moving;
		const child = direction < 0 ? moving : other;
		return {
			features,
			refusal: `${featureLabel(child.id)} is built on ${featureLabel(parent.id)}, so it cannot move above it.`
		};
	}
	const next = [...features];
	next[from] = other;
	next[to] = moving;
	return { features: next, refusal: null };
}

/**
 * DELETE IS REFUSED FOR EVERY FEATURE, AND THE REASON IS `evaluate.ts`.
 * It reads all six by type and would throw on the first missing one -- a blade
 * with no body is not a degraded blade, it is a document nothing can open. The
 * schema has no suppress flag and `blade/tree.ts` is not this lane's to widen,
 * so the row SAYS this rather than offering a control whose only answer is a
 * refusal, which is this repo's own rule for a control that is absent for a
 * reason.
 */
export const FEATURE_DELETE_REFUSAL =
	'The six features are what a blade is. None can be deleted; edit its parameters instead.';

/**
 * RENAME IS REFUSED FOR THE SAME KIND OF REASON AND A DIFFERENT ONE.
 * A `BladeFeature` carries no name field, so a typed name would live only in
 * this browser's memory and be gone at the next load -- which is worse than no
 * control, because the student would not be told. What IS the student's to name
 * is the concept, and the sentence says so rather than leaving a gap.
 */
export const FEATURE_RENAME_REFUSAL =
	'A feature keeps the name the part gives it. Rename your concept instead, in the strip below.';

/** A station may be removed only while `validateBladeTree`'s 3 to 8 still holds. */
export const MIN_STATIONS = 3;
export const MAX_STATIONS = 8;

export function stationsCanRemove(count: number): boolean {
	return count > MIN_STATIONS;
}
export function stationsCanAdd(count: number): boolean {
	return count < MAX_STATIONS;
}

/**
 * A new station is inserted AFTER `index`, midway to the one above it in z, so
 * the strictly-increasing-z rule `validateBladeTree` enforces holds by
 * construction rather than by the student repairing it afterwards. Appended at
 * the top, it clears the last station by the same gap the last pair used, so a
 * body never gains a zero-height frustum (whose inertia term divides by zero).
 */
export function addStation(stations: Station[], index: number): Station[] {
	const at = Math.min(Math.max(index, 0), stations.length - 1);
	const a = stations[at];
	const b = stations[at + 1];
	const made: Station = b
		? { r: round4((a.r + b.r) / 2), z: round4((a.z + b.z) / 2) }
		: { r: a.r, z: round4(a.z + Math.max(0.05, a.z - (stations[at - 1]?.z ?? a.z - 0.1))) };
	return [...stations.slice(0, at + 1), made, ...stations.slice(at + 1)];
}

export function removeStation(stations: Station[], index: number): Station[] {
	if (!stationsCanRemove(stations.length)) return stations;
	return stations.filter((_, i) => i !== index);
}

/** Four decimals is a thousandth of an inch and then some; it exists so a
 *  midpoint does not write 1.4750000000000002 into a saved document. */
export function round4(n: number): number {
	return Number(n.toFixed(4));
}

/** A field the PropertyManager draws. `slider` is set only where the bound is a
 *  real rule rather than a guard rail, which is 0145's own distinction. */
export interface NumberField {
	kind: 'number';
	key: string;
	label: string;
	unit: string;
	value: number;
	min: number;
	max: number;
	step: number;
	slider: boolean;
}
export interface ChoiceField {
	kind: 'choice';
	key: string;
	label: string;
	value: string;
	options: { value: string; label: string }[];
}
export interface FactField {
	kind: 'fact';
	key: string;
	label: string;
	value: string;
	note: string;
}
export type PmField = NumberField | ChoiceField | FactField;

export interface PmPanel {
	id: string;
	label: string;
	fields: PmField[];
	/** The body's stations edit as a table with its own add and remove. */
	stations: Station[] | null;
	/** Read-only nodes say so in words rather than by having nothing in them. */
	note: string | null;
}

function num(
	key: string,
	label: string,
	unit: string,
	value: number,
	min: number,
	max: number,
	step: number,
	slider = false
): NumberField {
	return { kind: 'number', key, label, unit, value, min, max, step, slider };
}

/**
 * THE PANEL FOR ONE SELECTED NODE. Every bound quoted here comes from the
 * CONFIG's own rules or from `validateBladeTree`, never from a number typed
 * beside it: a slider whose range disagreed with the rule it is drawn for would
 * let a student reach a value the rail then calls FAIL with nothing to say why.
 */
export function panelFor(tree: BladeTree, id: string, config: BladeConfig): PmPanel | null {
	const r = config.rules;
	if (id === 'materials') {
		return {
			id,
			label: featureLabel(id),
			stations: null,
			note: null,
			fields: [
				{
					kind: 'choice',
					key: 'materials.body',
					label: 'Body material',
					value: tree.materials.body,
					options: config.materials.map((m) => ({ value: m.id, label: m.name }))
				},
				num(
					'materials.bodySolidFraction',
					'Body fill',
					'%',
					Math.round(tree.materials.bodySolidFraction * 100),
					10,
					100,
					1,
					true
				),
				{
					kind: 'choice',
					key: 'materials.bladeStock',
					label: 'Blade stock',
					value: tree.materials.bladeStock,
					options: config.stock.map((s) => ({ value: s.id, label: s.name }))
				},
				{
					kind: 'choice',
					key: 'rotation',
					label: 'Spin direction',
					value: tree.rotation,
					options: [
						{ value: 'cw', label: 'Clockwise' },
						{ value: 'ccw', label: 'Counter-clockwise' }
					]
				}
			]
		};
	}
	if (id === 'standard-parts') {
		return {
			id,
			label: featureLabel(id),
			stations: null,
			fields: config.standardParts.map((p) => ({
				kind: 'fact' as const,
				key: p.name,
				label: p.name,
				value: `${p.massG} g`,
				note: p.verified ? 'Verified' : 'UNVERIFIED'
			})),
			note: 'The launcher parts are given, not designed. Their mass counts against your 680 g.'
		};
	}
	const f = tree.features.find((x) => x.id === id);
	if (!f) return null;
	const base = { id, label: featureLabel(id), stations: null as Station[] | null, note: null as string | null };
	switch (f.type) {
		case 'revolve':
			return {
				...base,
				stations: f.stations,
				fields: [],
				note: 'The body is a revolve of these stations. Heights must increase from the tip up.'
			};
		case 'hexBoss':
			return {
				...base,
				fields: [
					num('acrossFlats', 'Across flats', 'in', f.acrossFlats, 0.25, 1, 0.005),
					num(
						'height',
						'Extension height',
						'in',
						f.height,
						r.minHexExtensionIn,
						r.maxHexExtensionIn,
						0.005,
						true
					)
				]
			};
		case 'bladeSketch':
			return {
				...base,
				fields: [
					num('rootWidth', 'Root width', 'in', f.rootWidth, 0.1, 1.5, 0.005),
					num('tipWidth', 'Tip width', 'in', f.tipWidth, 0.1, 1.5, 0.005),
					num('length', 'Length', 'in', f.length, 0.1, 2, 0.005),
					num('sweepDeg', 'Sweep', 'deg', f.sweepDeg, -45, 45, 1, true),
					num('mountRadius', 'Mount radius', 'in', f.mountRadius, 0.2, r.maxDiameterIn / 2, 0.005)
				]
			};
		case 'extrude':
			return {
				...base,
				fields: [
					{ kind: 'fact', key: 'sketch', label: 'Sketch', value: featureLabel(f.sketch), note: 'Parent' },
					{
						kind: 'fact',
						key: 'thickness',
						label: 'Thickness',
						value:
							config.stock.find((s) => s.id === tree.materials.bladeStock)?.name ?? tree.materials.bladeStock,
						note: 'From the blade stock'
					}
				],
				note: 'The extrude takes its thickness from the stock you picked in Materials.'
			};
		case 'circularPattern':
			return { ...base, fields: [num('count', 'Blades', '', f.count, 2, 8, 1, true)] };
		case 'mount':
			return {
				...base,
				fields: [
					num('z', 'Mount height', 'in', f.z, 0, r.maxHeightIn, 0.005)
				]
			};
	}
}

/**
 * THE ONE WRITER. Every PropertyManager control routes through this, so a new
 * field cannot arrive with its own idea of how an edit lands, and a caller
 * never mutates the tree it was handed -- a fresh document comes back, which is
 * what the undo stack and the live preview both rest on.
 */
export function applyField(tree: BladeTree, id: string, key: string, value: number | string): BladeTree {
	const next = structuredClone(tree);
	if (key === 'rotation') {
		next.rotation = value === 'ccw' ? 'ccw' : 'cw';
		return next;
	}
	if (key.startsWith('materials.')) {
		const which = key.slice('materials.'.length);
		if (which === 'body') next.materials.body = String(value);
		else if (which === 'bladeStock') next.materials.bladeStock = String(value);
		else if (which === 'bodySolidFraction')
			/* The field is a PERCENT and the document is a FRACTION. The conversion
			   lives here, once, because a panel that stored the percent and a rail
			   that read the fraction is a body 100 times too heavy. */
			next.materials.bodySolidFraction = round4(Number(value) / 100);
		return next;
	}
	const f = next.features.find((x) => x.id === id);
	if (!f) return next;
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n)) return next;
	const set = (k: string, v: number) => {
		(f as unknown as Record<string, number>)[k] = v;
	};
	if (f.type === 'circularPattern' && key === 'count') set('count', Math.round(n));
	else if (f.type === 'hexBoss' && (key === 'acrossFlats' || key === 'height')) set(key, round4(n));
	else if (
		f.type === 'bladeSketch' &&
		(key === 'rootWidth' || key === 'tipWidth' || key === 'length' || key === 'sweepDeg' || key === 'mountRadius')
	)
		set(key, round4(n));
	else if (f.type === 'mount' && key === 'z') set('z', round4(n));
	return next;
}

/** A station cell edit, by index and axis. */
export function applyStation(tree: BladeTree, index: number, axis: 'r' | 'z', value: number): BladeTree {
	const next = structuredClone(tree);
	const body = next.features.find((f) => f.type === 'revolve');
	if (!body || body.type !== 'revolve' || !body.stations[index] || !Number.isFinite(value)) return next;
	body.stations[index] = { ...body.stations[index], [axis]: round4(value) };
	return next;
}

export function setStations(tree: BladeTree, stations: Station[]): BladeTree {
	const next = structuredClone(tree);
	const body = next.features.find((f) => f.type === 'revolve');
	if (body && body.type === 'revolve') body.stations = stations;
	return next;
}

export function setFeatures(tree: BladeTree, features: BladeFeature[]): BladeTree {
	const next = structuredClone(tree);
	next.features = features;
	return next;
}

/**
 * The problem chip a row carries, which is how SolidWorks marks a feature with
 * a rebuild error. `BladeProblem.featureId` is `'materials'` for the two
 * material rules and `'document'` for a document that is not a blade at all, so
 * both land on a row that exists.
 */
export function problemsFor(problems: BladeProblem[], id: string): BladeProblem[] {
	return problems.filter((p) => p.featureId === id);
}

/**
 * THE 2D PROFILE, AS A POLYLINE IN THE PANEL'S OWN BOX. The preview beside the
 * station table is the same points `LatheGeometry` revolves, which is the whole
 * point of showing it -- a second idea of what the profile is would draw a
 * picture of a body nobody is going to get.
 */
export function profilePolyline(
	stations: Station[],
	width: number,
	height: number,
	pad = 6
): { points: string; dots: { x: number; y: number }[] } {
	const maxR = Math.max(...stations.map((s) => s.r), 1e-6);
	const minZ = Math.min(...stations.map((s) => s.z));
	const maxZ = Math.max(...stations.map((s) => s.z), minZ + 1e-6);
	const w = Math.max(1, width - pad * 2);
	const h = Math.max(1, height - pad * 2);
	const dots = stations.map((s) => ({
		x: round4(pad + (s.r / maxR) * w),
		/* z runs UP the part and DOWN the screen, so the axis is flipped here
		   rather than by the caller reversing the array, which would also
		   reverse the indices the table is numbered by. */
		y: round4(pad + h - ((s.z - minZ) / (maxZ - minZ)) * h)
	}));
	return { points: dots.map((d) => `${d.x},${d.y}`).join(' '), dots };
}
