import type { BladeTree } from './tree';
export interface Material { id: string; name: string; densityGcm3: number }
export interface Stock extends Material { thicknessIn: number }
export interface StandardPart { name: string; massG: number; verified: boolean; geometry: Record<string, unknown> }
export interface BladeConfig { materials: Material[]; stock: Stock[]; standardParts: StandardPart[]; launcher: { acrossFlatsIn: number|null }; tipHeightIn: number; rules: { maxDiameterIn:number; minHeightIn:number; maxHeightIn:number; minHexExtensionIn:number; maxHexExtensionIn:number; maxMassG:number }; defaultFeatures: BladeTree }

/** The shop vocabulary for thickness. This is presentation metadata, not a unit conversion. */
export type StockThicknessConvention = 'gauge' | 'fractional-inch' | 'metric-ply';

/**
 * A material requested for the blade stock lesson.
 *
 * A density is deliberately nullable. `null` means that this repository has not
 * opened a published source which contains the value; it is not permission to
 * substitute a typical value. `densitySource` must be null at the same time.
 */
export interface BladeStockMaterial {
	id: 'ar500' | '6061' | '4140' | 'polycarbonate' | 'baltic-birch-ply';
	name: string;
	densityGcm3: number | null;
	densitySource: string | null;
	densityVerified: boolean;
	thicknessConvention: StockThicknessConvention;
	stockThicknesses: readonly { label: string; inches: number }[];
}

export const MATERIAL_DENSITY_UNVERIFIED = 'UNVERIFIED — density is unavailable; physics cannot be calculated.';
export const MATERIAL_UNKNOWN_REFUSAL = 'UNKNOWN_MATERIAL';
export const THICKNESS_UNKNOWN_REFUSAL = 'UNKNOWN_THICKNESS';
export const DENSITY_UNVERIFIED_REFUSAL = 'DENSITY_UNVERIFIED';

/**
 * The model-layer catalogue for ledger 0261.
 *
 * The execution environment could not open a manufacturer datasheet for any
 * density. In accordance with the no-invention rule, all five therefore carry
 * no density and no density citation. Thickness labels preserve the convention
 * in which each kind of stock is ordered; they do not imply density verification.
 */
export const BLADE_STOCK_MATERIALS: readonly BladeStockMaterial[] = [
	{
		id: 'ar500', name: 'AR500 abrasion-resistant steel', densityGcm3: null, densitySource: null,
		densityVerified: false, thicknessConvention: 'fractional-inch',
		stockThicknesses: [{ label: '3/16 in', inches: 0.1875 }, { label: '1/4 in', inches: 0.25 }, { label: '3/8 in', inches: 0.375 }, { label: '1/2 in', inches: 0.5 }]
	},
	{
		id: '6061', name: '6061 aluminum', densityGcm3: null, densitySource: null,
		densityVerified: false, thicknessConvention: 'fractional-inch',
		stockThicknesses: [{ label: '1/16 in', inches: 0.0625 }, { label: '1/8 in', inches: 0.125 }, { label: '3/16 in', inches: 0.1875 }, { label: '1/4 in', inches: 0.25 }]
	},
	{
		id: '4140', name: '4140 alloy steel', densityGcm3: null, densitySource: null,
		densityVerified: false, thicknessConvention: 'fractional-inch',
		stockThicknesses: [{ label: '1/8 in', inches: 0.125 }, { label: '3/16 in', inches: 0.1875 }, { label: '1/4 in', inches: 0.25 }, { label: '3/8 in', inches: 0.375 }]
	},
	{
		id: 'polycarbonate', name: 'Polycarbonate sheet', densityGcm3: null, densitySource: null,
		densityVerified: false, thicknessConvention: 'gauge',
		stockThicknesses: [{ label: '0.060 in sheet', inches: 0.06 }, { label: '0.093 in sheet', inches: 0.093 }, { label: '0.118 in sheet', inches: 0.118 }, { label: '0.177 in sheet', inches: 0.177 }]
	},
	{
		id: 'baltic-birch-ply', name: 'Baltic birch plywood', densityGcm3: null, densitySource: null,
		densityVerified: false, thicknessConvention: 'metric-ply',
		stockThicknesses: [{ label: '3 mm', inches: 3 / 25.4 }, { label: '6 mm', inches: 6 / 25.4 }, { label: '12 mm', inches: 12 / 25.4 }]
	}
] as const;

export type BladeStockResolution =
	| { ok: true; material: BladeStockMaterial; thickness: BladeStockMaterial['stockThicknesses'][number]; densityGcm3: number; densitySource: string }
	| { ok: false; refusal: typeof MATERIAL_UNKNOWN_REFUSAL | typeof THICKNESS_UNKNOWN_REFUSAL | typeof DENSITY_UNVERIFIED_REFUSAL; message: string };

/** Resolve both selectable inputs without a default, guess, or partial success. */
export function resolveBladeStock(materialId: string, thicknessIn: number): BladeStockResolution {
	const material = BLADE_STOCK_MATERIALS.find((candidate) => candidate.id === materialId);
	if (!material) return { ok: false, refusal: MATERIAL_UNKNOWN_REFUSAL, message: `Unknown material: ${materialId}` };
	const thickness = material.stockThicknesses.find((candidate) => candidate.inches === thicknessIn);
	if (!thickness) return { ok: false, refusal: THICKNESS_UNKNOWN_REFUSAL, message: `${material.name} is not listed at ${thicknessIn} in.` };
	if (!material.densityVerified || material.densityGcm3 === null || material.densitySource === null) {
		return { ok: false, refusal: DENSITY_UNVERIFIED_REFUSAL, message: `${material.name}: ${MATERIAL_DENSITY_UNVERIFIED}` };
	}
	return { ok: true, material, thickness, densityGcm3: material.densityGcm3, densitySource: material.densitySource };
}
export const DEFAULT_BLADE_TREE: BladeTree = { schema:1, editor:'blade', units:'in', rotation:'cw', materials:{body:'pla',bodySolidFraction:.42,bladeStock:'steel-0125'}, features:[
 {id:'body-revolve',type:'revolve',stations:[{r:.12,z:.125},{r:1.55,z:.35},{r:1.65,z:2.4},{r:.7,z:2.95}]},
 {id:'hex-extension',type:'hexBoss',acrossFlats:.5,height:.5},
 {id:'blade-sketch',type:'bladeSketch',rootWidth:.45,tipWidth:.3,length:.65,sweepDeg:18,mountRadius:1.45},
 {id:'blade-extrude',type:'extrude',sketch:'blade-sketch',thickness:'stock'},
 {id:'blade-pattern',type:'circularPattern',feature:'blade-extrude',count:4},
 {id:'blade-mount',type:'mount',feature:'blade-pattern',z:1.25}
]};
export const DEFAULT_BLADE_CONFIG: BladeConfig = { materials:[{id:'pla',name:'PLA',densityGcm3:1.24},{id:'petg',name:'PETG',densityGcm3:1.27}], stock:[{id:'steel-0125',name:'Steel 0.125 in',thicknessIn:.125,densityGcm3:7.85},{id:'steel-01875',name:'Steel 0.1875 in',thicknessIn:.1875,densityGcm3:7.85},{id:'aluminum-0125',name:'Aluminum 0.125 in',thicknessIn:.125,densityGcm3:2.7}], standardParts:['Hex core','Hex collar','Tip bolt'].map(name=>({name,massG:0,verified:false,geometry:{}})), launcher:{acrossFlatsIn:null}, tipHeightIn:.125, rules:{maxDiameterIn:5,minHeightIn:2.9,maxHeightIn:3.1,minHexExtensionIn:.45,maxHexExtensionIn:.55,maxMassG:680}, defaultFeatures:DEFAULT_BLADE_TREE };

/* ===========================================================================
 * THE MATERIAL LIBRARY -- 0208
 *
 * MATERIALS ARE DATA. Everything above this line is the FALLBACK: the shape of
 * a config, and one hardcoded config used when a deployment has no library and
 * no editor row. Everything below reads `ideacad_materials` (0208) and builds
 * the same `BladeConfig.materials` / `BladeConfig.stock` arrays out of rows, so
 * `evaluate()` is untouched and adding a material is a form, not a deploy.
 *
 * THE STORED TREE DID NOT CHANGE, AND THAT IS DELIBERATE. A schema-1 blade tree
 * still carries `materials.body` and `materials.bladeStock` as two strings. The
 * material and its thickness are two CONTROLS over one stored stock id
 * (`<slug>-<thickness with the decimal point removed>`), not two stored fields.
 * Two fields would make every concept row already in `ideacad_concepts` a legacy
 * shape that `validateBladeTree` would have to answer for forever.
 *
 * RESOLUTION AND SELECTION ARE TWO DIFFERENT SETS, and keeping them apart is
 * the whole of how a retired material stops breaking a part that uses it:
 *
 *   * RESOLUTION (`bladeConfigWithMaterials`) is TOTAL and includes retired
 *     rows, the fallback config's own entries, and a zero-density placeholder
 *     for an id that resolves to nothing at all. `evaluate()` finds an entry for
 *     every id it is ever handed, so a mass never comes back NaN.
 *   * SELECTION (`materialChoices`, `bladeStockChoices`) is LIVE ROWS ONLY,
 *     plus whichever entry the part is already on. So a retired material is
 *     never offered to somebody who is not already on it, and always offered --
 *     marked retired -- to somebody who is, which is the only way they can see
 *     what they are on and move off it deliberately.
 * ======================================================================== */

/** The hard ceiling 0208's own CHECK constraint holds. Stated once. */
export const MATERIAL_THICKNESS_MAX_IN = 4;

/** What a surface renders in place of a material it cannot resolve. */
export const MATERIAL_UNRESOLVED_NAME = 'Material not available';

/** One row of `public.ideacad_materials`, exactly as PostgREST returns it. */
export interface MaterialRow {
	id: string;
	slug: string;
	/** NULL = a shared material an admin manages. Set = that student's own. */
	owner: string | null;
	name: string;
	density_g_cm3: number;
	thicknesses_in: number[];
	note: string | null;
	source: string;
	source_verified: boolean;
	retired_at: string | null;
}

/** A material as the pickers see it: the row, plus what the UI needs to say. */
export interface MaterialChoice {
	value: string;
	label: string;
	retired: boolean;
	custom: boolean;
	unverified: boolean;
	note: string | null;
	densityGcm3: number;
}

/**
 * A thickness as it appears in a stock id.
 *
 * `String(n)` WITH THE DECIMAL POINT REMOVED, AND THE SPELLING IS FORCED RATHER
 * THAN CHOSEN. The deployed ids are `steel-0125`, `steel-01875` and
 * `aluminum-0125`, written into `ideacad_concepts.features` before 0208 existed;
 * 0.125 -> "0125" and 0.1875 -> "01875" is the only rule that reproduces them.
 * A fixed-decimal form would give "01250" and every concept already saved would
 * stop resolving.
 */
export function thicknessKey(inches: number): string {
	return String(inches).replace('.', '');
}

/** The stock id a (material, thickness) pair produces. One implementation. */
export function stockIdFor(slug: string, inches: number): string {
	return `${slug}-${thicknessKey(inches)}`;
}

/** A thickness as a person reads it: no trailing zeros, no exponent. */
export function formatThicknessIn(inches: number): string {
	return String(Number(inches.toFixed(4)));
}

/** `6061 aluminum, 0.125 in` -- the one spelling of a stock label. */
export function stockLabel(name: string, inches: number): string {
	return `${name}, ${formatThicknessIn(inches)} in`;
}

/** Normalize whatever the read handed back: numbers as numbers, sorted. */
export function materialLibrary(rows: readonly MaterialRow[] | null | undefined): MaterialRow[] {
	/* DEDUPED BY id, LAST WINS. A surface that has just written a custom material
	   holds it locally AND gets it back in the next read of the prop; without
	   this the picker offers the same material twice for one render. */
	const byId = new Map<string, MaterialRow>();
	for (const r of rows ?? []) if (r && typeof r.slug === 'string' && r.slug.length > 0) byId.set(r.id ?? r.slug, r);
	return [...byId.values()]
		.map((r) => ({
			...r,
			density_g_cm3: Number(r.density_g_cm3),
			thicknesses_in: [...(r.thicknesses_in ?? [])].map(Number).filter((t) => t > 0).sort((a, b) => a - b)
		}))
		.sort((a, b) => (a.owner === b.owner ? a.name.localeCompare(b.name) : a.owner ? 1 : -1));
}

/** Every stock id a material offers, in thickness order. */
export function stocksOf(row: MaterialRow): Stock[] {
	return row.thicknesses_in.map((t) => ({
		id: stockIdFor(row.slug, t),
		name: stockLabel(row.name, t),
		densityGcm3: row.density_g_cm3,
		thicknessIn: t
	}));
}

/**
 * Split a stored stock id back into its material and its thickness.
 *
 * MATCHED AGAINST THE SLUGS, NEVER AT THE LAST HYPHEN. A slug may contain
 * hyphens (`stainless-steel`), so splitting on the separator turns
 * `stainless-steel-0125` into the material `stainless` and loses the row.
 */
export function splitStockId(
	stockId: string,
	rows: readonly MaterialRow[]
): { row: MaterialRow; thicknessIn: number } | null {
	for (const row of rows) {
		for (const t of row.thicknesses_in) {
			if (stockIdFor(row.slug, t) === stockId) return { row, thicknessIn: t };
		}
	}
	return null;
}

/**
 * THE RESOLUTION SET. Total by construction: `evaluate()` non-null-asserts its
 * two lookups, so an id that resolved to nothing would produce NaN mass, NaN
 * inertia and a rail of NaN readouts with nothing saying why.
 *
 * Precedence, widest last so it wins: the fallback config's own entries (which
 * carry the pre-0208 ids a stored tree may still name), then the library, then a
 * zero-density placeholder for each id still unaccounted for. The placeholder is
 * DENSITY ZERO rather than a guess -- a part whose material is not available
 * here weighs what the rest of it weighs, and `unresolvedMaterials` is what a
 * surface says out loud about the difference.
 */
export function bladeConfigWithMaterials(
	base: BladeConfig,
	rows: readonly MaterialRow[],
	/** EVERY tree on screen, not only the draft. The compare sheet evaluates each
	 *  concept against ONE config, so an id only a sibling concept names has to
	 *  resolve too or that column comes back NaN. */
	usedBy: readonly { body?: string | null; bladeStock?: string | null }[] = []
): BladeConfig & { unresolvedMaterials: string[] } {
	const library = materialLibrary(rows);
	const materials = new Map<string, Material>();
	const stock = new Map<string, Stock>();
	for (const m of base.materials) materials.set(m.id, m);
	for (const s of base.stock) stock.set(s.id, s);
	for (const row of library) {
		materials.set(row.slug, { id: row.slug, name: row.name, densityGcm3: row.density_g_cm3 });
		for (const s of stocksOf(row)) stock.set(s.id, s);
	}
	const unresolved: string[] = [];
	for (const used of usedBy) {
		if (used?.body && !materials.has(used.body)) {
			if (!unresolved.includes(used.body)) unresolved.push(used.body);
			materials.set(used.body, { id: used.body, name: MATERIAL_UNRESOLVED_NAME, densityGcm3: 0 });
		}
		if (used?.bladeStock && !stock.has(used.bladeStock)) {
			if (!unresolved.includes(used.bladeStock)) unresolved.push(used.bladeStock);
			stock.set(used.bladeStock, {
				id: used.bladeStock,
				name: MATERIAL_UNRESOLVED_NAME,
				densityGcm3: 0,
				thicknessIn: 0
			});
		}
	}
	return {
		...base,
		materials: [...materials.values()],
		stock: [...stock.values()],
		unresolvedMaterials: unresolved
	};
}

/** Is this row offered to somebody not already on it? */
function offered(row: MaterialRow): boolean {
	return row.retired_at === null;
}

function choiceOf(row: MaterialRow): MaterialChoice {
	return {
		value: row.slug,
		label: row.retired_at ? `${row.name} (retired)` : row.name,
		retired: row.retired_at !== null,
		custom: row.owner !== null,
		unverified: !row.source_verified,
		note: row.note,
		densityGcm3: row.density_g_cm3
	};
}

/**
 * THE SELECTION SET for the body material: live rows, plus whatever the part is
 * already on even when that is retired or is an id no row explains.
 */
export function materialChoices(rows: readonly MaterialRow[], currentId: string | null): MaterialChoice[] {
	const library = materialLibrary(rows);
	const out: MaterialChoice[] = [];
	for (const row of library) {
		if (!offered(row) && row.slug !== currentId) continue;
		out.push(choiceOf(row));
	}
	if (currentId && !out.some((c) => c.value === currentId)) {
		out.unshift({
			value: currentId,
			label: `${currentId} (${MATERIAL_UNRESOLVED_NAME.toLowerCase()})`,
			retired: false,
			custom: false,
			unverified: true,
			note: null,
			densityGcm3: 0
		});
	}
	return out;
}

/**
 * THE SELECTION SET for the blade: which material, and then which of THAT
 * material's real stock thicknesses.
 *
 * THICKNESS IS A LIST AND NEVER A TYPED NUMBER. Mr. Pina's lesson, and the
 * reason this returns options rather than a min/max: in real life you work with
 * the thicknesses of material you actually have.
 */
export function bladeStockChoices(
	rows: readonly MaterialRow[],
	currentStockId: string | null
): {
	materials: MaterialChoice[];
	thicknesses: { value: string; label: string; thicknessIn: number }[];
	materialSlug: string | null;
	thicknessIn: number | null;
	unresolved: boolean;
} {
	const library = materialLibrary(rows);
	const current = currentStockId ? splitStockId(currentStockId, library) : null;
	const materials: MaterialChoice[] = [];
	for (const row of library) {
		if (row.thicknesses_in.length === 0) continue;
		if (!offered(row) && row.slug !== current?.row.slug) continue;
		materials.push(choiceOf(row));
	}
	if (currentStockId && !current) {
		materials.unshift({
			value: currentStockId,
			label: `${currentStockId} (${MATERIAL_UNRESOLVED_NAME.toLowerCase()})`,
			retired: false,
			custom: false,
			unverified: true,
			note: null,
			densityGcm3: 0
		});
	}
	const chosen = current?.row ?? null;
	return {
		materials,
		thicknesses: (chosen?.thicknesses_in ?? []).map((t) => ({
			value: stockIdFor(chosen!.slug, t),
			label: `${formatThicknessIn(t)} in`,
			thicknessIn: t
		})),
		materialSlug: chosen?.slug ?? (currentStockId && !current ? currentStockId : null),
		thicknessIn: current?.thicknessIn ?? null,
		unresolved: !!currentStockId && !current
	};
}

/**
 * The stock id to select when a student changes the blade MATERIAL and the
 * thickness they were on does not exist in the new one.
 *
 * NEAREST, NOT FIRST. Somebody on 0.25 in steel who switches to polycarbonate
 * wants the closest polycarbonate sheet, not the thinnest one in the list; the
 * first entry would silently make a part eight times thinner than the one they
 * were looking at. Ties go to the thicker sheet, which is the safer side of a
 * mass rule you are trying to pass.
 */
export function stockIdAfterMaterialChange(
	rows: readonly MaterialRow[],
	nextSlug: string,
	previousStockId: string | null
): string | null {
	const library = materialLibrary(rows);
	const row = library.find((r) => r.slug === nextSlug);
	if (!row || row.thicknesses_in.length === 0) return null;
	const was = previousStockId ? splitStockId(previousStockId, library) : null;
	if (!was) return stockIdFor(row.slug, row.thicknesses_in[0]);
	let best = row.thicknesses_in[0];
	for (const t of row.thicknesses_in) {
		const d = Math.abs(t - was.thicknessIn);
		const bd = Math.abs(best - was.thicknessIn);
		if (d < bd || (d === bd && t > best)) best = t;
	}
	return stockIdFor(row.slug, best);
}

/** Parse a student's typed thickness list into the array the RPC takes. */
export function parseThicknessList(text: string): { thicknesses: number[]; refusal: string | null } {
	const parts = text
		.split(/[,\s]+/)
		.map((p) => p.trim())
		.filter((p) => p.length > 0);
	if (parts.length === 0) return { thicknesses: [], refusal: 'List at least one thickness you actually have, in inches.' };
	const out: number[] = [];
	for (const p of parts) {
		const n = Number(p);
		if (!Number.isFinite(n) || n <= 0) return { thicknesses: [], refusal: `"${p}" is not a thickness in inches.` };
		if (n > MATERIAL_THICKNESS_MAX_IN)
			return { thicknesses: [], refusal: `${p} in is thicker than the ${MATERIAL_THICKNESS_MAX_IN} in ceiling.` };
		const r = Number(n.toFixed(4));
		if (!out.includes(r)) out.push(r);
	}
	if (out.length > 24) return { thicknesses: [], refusal: 'List no more than 24 thicknesses.' };
	return { thicknesses: out.sort((a, b) => a - b), refusal: null };
}
