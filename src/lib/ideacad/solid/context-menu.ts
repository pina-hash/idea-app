/**
 * THE RIGHT-CLICK MENU, THE CONTEXT TOOLBAR AND THE BREADCRUMB: WHAT THEY
 * SAY, WITH NO DOM. `ContextMenu.svelte` and `ContextBar.svelte` draw it;
 * everything a row says is decided here, from the command registry, so a row
 * and its command cannot disagree.
 *
 * A ROW THAT CANNOT RUN STAYS, WITH ITS REASON. A menu that hides what does
 * not apply is a menu a student never learns the shape of; a row whose
 * command does not fit the selection, or cannot run right now, is kept,
 * marked `aria-disabled`, and says why in a few words (`reason`), and running
 * it says the same thing where every refusal is said.
 *
 * NAMES ARE THE MODEL'S OWN. A candidate in Select Other and a crumb in the
 * breadcrumb read "End face of Extrude 1", "Front plane", "Sketch 2": the
 * feature's name as the tree shows it, never an internal id.
 */
import { acceptReason, commandById, keyLabel, type Command, type CommandContext } from './command-registry';
import { DATUM_SELECTION_PREFIX, type Datum } from './features/reference';
import { DATUM_NAMES } from './viewport/reference-layer';
import { rowSelections } from './tree/rows';
import type { FeatureRow, ModelProjection, Selection } from './types';

export interface MenuItem {
	id: string;
	label: string;
	/** An SVG path in a 24 x 24 box, stroked. */
	icon?: string;
	/** The key it answers to, as it reads on screen. */
	keys?: string;
	/** Why it cannot run now. The row stays, `aria-disabled`, and says this. */
	reason?: string | null;
	/** A checkbox row, and whether it is ticked. */
	checked?: boolean;
	/** A row that opens a list in place of the menu, with a way back. */
	items?: MenuItem[];
	run?: () => void;
	/** Called with true while the row is hovered or focused and false once it is not: Select Other previews each candidate this way. */
	preview?: (on: boolean) => void;
	/** Stay open after running (a checkbox in a list of checkboxes). */
	keepOpen?: boolean;
}

/** Registry commands as rows: name, icon, key, and the reason a row cannot run, from `unavailable` or from what the command accepts. */
export function commandItems(ids: readonly string[], ctx: CommandContext, keys: ReadonlyMap<string, readonly string[]>, run: (command: Command) => void, label?: (command: Command) => string | undefined): MenuItem[] {
	const out: MenuItem[] = [];
	for (const id of ids) {
		const c = commandById(id); if (!c) continue;
		const key = keys.get(id)?.[0];
		out.push({ id, label: label?.(c) ?? c.name, icon: c.icon, keys: key ? keyLabel(key) : undefined, reason: c.unavailable?.(ctx) ?? acceptReason(c, ctx.selections), run: () => run(c) });
	}
	return out;
}

/* -------------------------------------------------------------------------
 * NAMES
 * ---------------------------------------------------------------------- */

const datumOf = (s: Selection): Datum | null => (s.kind === 'reference' && s.id.startsWith(DATUM_SELECTION_PREFIX) ? (s.id.slice(DATUM_SELECTION_PREFIX.length) as Datum) : null);
/** The feature that made a face: the id before its construction role (`<fid>.end`, `<fid>.blend.A|B`), when that is a feature of the model. */
export function faceFeature(model: Pick<ModelProjection, 'features' | 'bodies'>, bodyId: string, faceId: string): FeatureRow | undefined {
	const fid = faceId.split('.')[0];
	return model.features.find((f) => f.id === fid) ?? model.features.find((f) => f.id === model.bodies.find((b) => b.id === bodyId)?.createdBy);
}
/** The feature that made an edge: of the features that made its two faces, the later one in the tree (a fillet's blend, not the extrude it rounds). */
export function edgeFeature(model: Pick<ModelProjection, 'features' | 'bodies'>, bodyId: string, edgeId: string): FeatureRow | undefined {
	const edge = model.bodies.find((b) => b.id === bodyId)?.edges.find((e) => e.id === edgeId);
	const rows = (edge?.faces ?? []).map((f) => faceFeature(model, bodyId, f)).filter((r): r is FeatureRow => !!r);
	return rows.sort((a, b) => b.index - a.index)[0];
}
/** The sketch a feature was made from, when it was made from one. */
export function sketchOf(model: Pick<ModelProjection, 'features'>, row: FeatureRow | undefined): FeatureRow | undefined {
	if (!row) return undefined;
	return row.dependsOn.map((id) => model.features.find((f) => f.id === id)).find((f): f is FeatureRow => f?.type === 'sketch');
}
/**
 * What a face IS, from the construction role in its name (`naming.ts`), so two
 * faces of one feature read differently in a list: the end an extrude was
 * pulled to, one of its sides, a hole's wall, a fillet's round.
 */
export function faceRole(faceId: string): string {
	const parts = faceId.replace(/~\d+$/, '').split('.'), role = parts[1] ?? '';
	const n = Number(parts[parts.length - 1]);
	if (role === 'end') return 'End face';
	if (role === 'start') return 'Start face';
	if (role === 'side') return Number.isFinite(n) ? `Side face ${n + 1}` : 'Side face';
	if (role === 'hole') return 'Hole wall';
	if (role === 'rev') return 'Round face';
	if (role === 'blend') return 'Fillet face';
	if (role === 'bevel') return 'Chamfer face';
	if (role === 'corner') return 'Corner patch';
	if (role === 'inner') return 'Inner face';
	if (role === 'face' && Number.isFinite(n)) return `Face ${n + 1}`;
	return 'Face';
}
/** How a selection reads in a list: "End face of Extrude 1", "Edge of Fillet 1", "Body 1", "Front plane". */
export function selectionLabel(model: Pick<ModelProjection, 'features' | 'bodies' | 'references' | 'sketches'>, s: Selection): string {
	const datum = datumOf(s);
	if (datum) return `${DATUM_NAMES[datum]} plane`;
	const body = model.bodies.find((b) => b.id === s.bodyId);
	if (s.kind === 'body') return body?.name ?? 'Body';
	if (s.kind === 'face') { const f = faceFeature(model, s.bodyId, s.id), role = faceRole(s.id); return f ? `${role} of ${f.name}` : role; }
	if (s.kind === 'edge') { const f = edgeFeature(model, s.bodyId, s.id); return f ? `Edge of ${f.name}` : 'Edge'; }
	if (s.kind === 'vertex') return body ? `Corner of ${body.name}` : 'Corner';
	const row = model.features.find((f) => f.id === s.id);
	if (s.kind === 'reference') { const r = model.references.find((x) => x.feature === s.id); return r?.name ?? row?.name ?? 'Reference'; }
	return row?.name ?? model.sketches.find((k) => k.feature === s.id)?.name ?? 'Feature';
}

/* -------------------------------------------------------------------------
 * THE BREADCRUMB: the selection, then what made it, then its sketch, then its body
 * ---------------------------------------------------------------------- */

export interface Crumb {
	/** Stable within one breadcrumb. */
	id: string;
	/** A word or a name: "Face", "Extrude 1", "Sketch 1", "Body 1". */
	label: string;
	/** What a press on the crumb selects, first replacing and the rest added. */
	selections: Selection[];
}
/**
 * The chain from a selection outward, as SolidWorks' breadcrumb reads it:
 * face (or edge, or corner), then the feature that made it, then that
 * feature's sketch, then the body. A sketch leads to the feature that used it
 * and its body; a body to the feature that made it and its sketch. Each crumb
 * is something a press can select, and duplicates are dropped.
 */
export function breadcrumb(model: Pick<ModelProjection, 'features' | 'bodies' | 'references' | 'sketches'>, s: Selection): Crumb[] {
	const out: Crumb[] = [];
	const add = (id: string, label: string, selections: Selection[]) => { if (!out.some((c) => c.id === id)) out.push({ id, label, selections }); };
	const addRow = (row: FeatureRow | undefined) => { if (row) add(`feature:${row.id}`, row.name, rowSelections(row)); };
	const addBody = (bodyId: string) => { const body = model.bodies.find((b) => b.id === bodyId); if (body) add(`body:${body.id}`, body.name, [{ bodyId: body.id, kind: 'body', id: body.id }]); };
	if (datumOf(s)) { add('self', selectionLabel(model, s), [s]); return out; }
	if (s.kind === 'face' || s.kind === 'edge' || s.kind === 'vertex') {
		add('self', s.kind === 'face' ? faceRole(s.id) : s.kind === 'edge' ? 'Edge' : 'Corner', [s]);
		const row = s.kind === 'face' ? faceFeature(model, s.bodyId, s.id) : s.kind === 'edge' ? edgeFeature(model, s.bodyId, s.id) : undefined;
		addRow(row); addRow(sketchOf(model, row)); addBody(s.bodyId);
	} else if (s.kind === 'body') {
		addBody(s.bodyId);
		const row = model.features.find((f) => f.id === model.bodies.find((b) => b.id === s.bodyId)?.createdBy);
		addRow(row); addRow(sketchOf(model, row));
	} else if (s.kind === 'sketch') {
		const row = model.features.find((f) => f.id === s.id);
		add('self', row?.name ?? selectionLabel(model, s), [s]);
		const user = model.features.find((f) => f.dependsOn.includes(s.id) && f.type !== 'sketch');
		addRow(user); for (const b of user?.bodies ?? []) addBody(b);
	} else add('self', selectionLabel(model, s), [s]);
	return out;
}
