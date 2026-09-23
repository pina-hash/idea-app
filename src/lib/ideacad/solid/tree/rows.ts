/**
 * THE DESIGN TREE'S PURE HALF: what a row says, what a press on it selects,
 * where a feature may move, and why a control is refused. No DOM and no
 * kernel, so every rule the tree renders is assertable in a plain test.
 *
 * A REFUSAL IS THE REDUCER'S OWN SENTENCE, NEVER A SECOND SPELLING OF THE
 * RULE. `refusalFor` runs the real `reduce` from `commands.ts` against the
 * current manifest and hands back what it threw, so the words under a
 * disabled Up, Down or Delete are byte-identical to what the engine would
 * have said had the press gone through. `reorderRange` in `features.ts` is
 * the one statement of where a feature may move; the reducer already calls
 * it, and the drag affordance reads it directly for the same reason.
 */
import { reduce } from '../commands';
import { REFERENCE_TYPES, featureOfId, reorderRange } from '../features';
import type { Feature, FeatureRow, FeatureStatus, FeatureType, Selection, SolidCommand, SolidManifest } from '../types';

/** The glyph AND the word, always together: color is never the only signal and a glyph alone is not a word. */
export const STATUS_WORDS: Record<FeatureStatus, { word: string; glyph: string }> = {
	ok: { word: 'OK', glyph: '●' },
	error: { word: 'Error', glyph: '⚠' },
	warning: { word: 'Warning', glyph: '△' },
	suppressed: { word: 'Suppressed', glyph: '○' }
};
export const FIRST_IN_TREE = 'This feature is already first in the tree.';
export const LAST_IN_TREE = 'This feature is already last in the tree.';

/** The selection kind a feature answers to: a sketch, a reference (plane, axis, point) or a feature. */
export const selectionKindFor = (type: FeatureType): 'feature' | 'sketch' | 'reference' => type === 'sketch' ? 'sketch' : REFERENCE_TYPES.includes(type) ? 'reference' : 'feature';

/**
 * What a press on a row selects, in order: every body the feature created or
 * changed, then the feature itself. The first entry replaces the selection
 * and the rest append, so the workspace's `selections[0]` is a body whenever
 * the feature made one (which is what the Objects panel keys its body
 * properties on) and the feature is still in the list for the tree to mark.
 */
export function rowSelections(row: Pick<FeatureRow, 'id' | 'type' | 'bodies'>): Selection[] {
	return [...row.bodies.map((id) => ({ bodyId: id, kind: 'body' as const, id })), { bodyId: '', kind: selectionKindFor(row.type), id: row.id }];
}
/** Which row a selection list names: the first feature-shaped selection that is a row. Null when only geometry is selected. */
export function selectedFeatureId(selections: readonly Selection[], rows: readonly Pick<FeatureRow, 'id'>[]): string | null {
	const hit = selections.find((s) => (s.kind === 'feature' || s.kind === 'sketch' || s.kind === 'reference') && rows.some((r) => r.id === s.id));
	return hit?.id ?? null;
}

/** The sentence the reducer refuses a command with, or null when it would go through. The manifest is never changed. */
export function refusalFor(manifest: SolidManifest, command: SolidCommand): string | null {
	try { reduce(manifest, command); return null; }
	catch (error) { return error instanceof Error ? error.message : String(error); }
}
export interface MoveOption {
	/** The target index in the list WITHOUT the feature, as `move-feature` takes it; null at the end of the tree. */
	to: number | null;
	/** Why the move is refused, or null when it is allowed. */
	refusal: string | null;
}
/** One step up and one step down for a feature, each with the reducer's own reason when it is refused. */
export function moveOptions(manifest: SolidManifest, id: string): { up: MoveOption; down: MoveOption } {
	const index = manifest.features.findIndex((f) => f.id === id);
	const last = manifest.features.length - 1;
	const option = (to: number | null, boundary: string): MoveOption => to === null ? { to, refusal: boundary } : { to, refusal: refusalFor(manifest, { type: 'move-feature', id, to }) };
	return {
		up: option(index > 0 ? index - 1 : null, FIRST_IN_TREE),
		down: option(index >= 0 && index < last ? index + 1 : null, LAST_IN_TREE)
	};
}
/** Why a delete is refused (the dependents, named by the reducer), or null. */
export const deleteRefusal = (manifest: SolidManifest, id: string) => refusalFor(manifest, { type: 'remove-feature', id });
/**
 * The `move-feature` target for dropping row `from` before or after row
 * `target`, in the list without the dragged feature. Dropping a row onto
 * itself, either side, is its own index and therefore a no-op.
 */
export function dropIndex(from: number, target: number, before: boolean): number {
	if (before) return target > from ? target - 1 : target;
	return target >= from ? target : target + 1;
}
/** Whether a drop target is inside the dragged feature's legal range, for the affordance while dragging. The reducer still decides. */
export function dropAllowed(manifest: SolidManifest, id: string, to: number): boolean {
	const range = reorderRange(id, manifest.features);
	return !!range && to >= range.min && to <= range.max;
}

/* -------------------------------------------------------------------------
 * NESTING: A SKETCH SITS UNDER THE FEATURE THAT CONSUMES IT, AS SOLIDWORKS
 * SHOWS IT. The tree is still the build order; nesting is only where a row is
 * DRAWN. A sketch goes under the FIRST later feature that consumes it (a
 * shared sketch stays under its first user), a sketch nobody consumes stays at
 * the top level, and a suppressed consumer still holds its sketch, because
 * suppressing a feature does not change what it is made from.
 * ---------------------------------------------------------------------- */

/** The feature types that absorb the sketches they are made from. */
export const SKETCH_CONSUMERS: readonly FeatureType[] = ['extrude', 'revolve', 'sweep', 'loft', 'rib'];
/** The sketch ids a feature is MADE FROM: a profile, a path, a loft's sections. An axis or a face a feature merely references is not one. */
export function consumedSketches(f: Feature): string[] {
	switch (f.type) {
		case 'extrude': case 'revolve': case 'rib': return [f.sketch];
		case 'sweep': return typeof f.path === 'string' ? [f.profile, f.path] : [f.profile];
		case 'loft': return [...f.profiles];
		default: return [];
	}
}
export interface TreeNode {
	row: FeatureRow;
	/** The sketches drawn under this row, in build order. Empty for a row that absorbs nothing. */
	children: FeatureRow[];
}
/**
 * The rows as the tree draws them: top-level rows in build order, each
 * consumed sketch under its first consumer. `features` (the manifest's) says
 * exactly which sketches a feature is made from; a row with no manifest
 * feature beside it falls back to its `dependsOn`, filtered to sketch rows.
 * A dependency naming a row that is not there is ignored, never thrown.
 */
export function nestRows(rows: readonly FeatureRow[], features: readonly Feature[] = []): TreeNode[] {
	const position = new Map(rows.map((r, i) => [r.id, i]));
	const manifest = new Map(features.map((f) => [f.id, f]));
	const parentOf = new Map<string, string>();
	rows.forEach((row, i) => {
		if (!SKETCH_CONSUMERS.includes(row.type)) return;
		const feature = manifest.get(row.id);
		const made = feature && feature.type === row.type ? consumedSketches(feature) : row.dependsOn;
		for (const id of made) {
			const at = position.get(id);
			if (at === undefined || at >= i || rows[at].type !== 'sketch' || parentOf.has(id)) continue;
			parentOf.set(id, row.id);
		}
	});
	const nodes: TreeNode[] = [], byId = new Map<string, TreeNode>();
	for (const row of rows) if (!parentOf.has(row.id)) { const node = { row, children: [] }; nodes.push(node); byId.set(row.id, node); }
	for (const row of rows) { const parent = parentOf.get(row.id); if (parent) byId.get(parent)!.children.push(row); }
	return nodes;
}
/** A node's rows in build order: its sketches, then itself. Moving the node moves all of them. */
export const nodeMembers = (node: TreeNode): string[] => [...node.children.map((c) => c.id), node.row.id];
/** The top-level node holding a row, itself or as a nested sketch. */
export const nodeOf = (nodes: readonly TreeNode[], id: string) => nodes.find((n) => n.row.id === id || n.children.some((c) => c.id === id)) ?? null;
/** The rows a reader can see, top to bottom: every top-level row, and the nested rows of an expanded one. The keyboard walks this. */
export function visibleRows(nodes: readonly TreeNode[], expanded: (id: string) => boolean): FeatureRow[] {
	return nodes.flatMap((n) => [n.row, ...(n.children.length && expanded(n.row.id) ? n.children : [])]);
}

/* -------------------------------------------------------------------------
 * MOVING A NODE. A node is a feature and the sketches nested under it, and it
 * moves as one: the target order is computed, then turned into single
 * `move-feature` steps the reducer already knows, each checked by the REDUCER
 * before anything is sent. A step it refuses is the refusal, in its own
 * sentence, and nothing is sent at all.
 * ---------------------------------------------------------------------- */
export interface NodeMove {
	/** The steps, in order, that carry the node there. Null when there is nowhere to go or the reducer refuses. */
	commands: SolidCommand[] | null;
	/** The reducer's sentence, or the tree-end sentence, when the move cannot happen. */
	refusal: string | null;
	/** The whole move as one `move-features` edit, when there is a move to make. */
	atomic?: SolidCommand;
}
/**
 * The steps that put `members` (in build order) together just before or just
 * after `anchor`'s rows. A node moving up is carried by moving its own rows up
 * front-first; one moving down, back-first; so every step lifts or drops only
 * a member past rows the finished order also puts on the other side of it.
 */
export function planNodeMove(manifest: SolidManifest, members: readonly string[], anchor: readonly string[], side: 'before' | 'after'): NodeMove {
	const ids = manifest.features.map((f) => f.id);
	const moving = new Set(members);
	const rest = ids.filter((id) => !moving.has(id));
	const block = ids.filter((id) => moving.has(id));
	const anchors = rest.map((id, i) => (anchor.includes(id) ? i : -1)).filter((i) => i >= 0);
	if (!block.length || !anchors.length) return { commands: null, refusal: 'That feature is no longer in the tree.' };
	const at = side === 'before' ? Math.min(...anchors) : Math.max(...anchors) + 1;
	const target = [...rest.slice(0, at), ...block, ...rest.slice(at)];
	const current = [...ids], commands: SolidCommand[] = [];
	const step = (id: string, to: number) => { current.splice(current.indexOf(id), 1); current.splice(to, 0, id); commands.push({ type: 'move-feature', id, to }); };
	if (at <= ids.indexOf(block[0])) { for (let i = 0; i < target.length; i++) if (current[i] !== target[i]) step(target[i], i); }
	else for (let i = target.length - 1; i >= 0; i--) if (current[i] !== target[i]) step(target[i], i);
	if (!commands.length) return { commands: [], refusal: null };
	let m = manifest;
	for (const command of commands) { try { m = reduce(m, command); } catch (error) { return { commands: null, refusal: error instanceof Error ? error.message : String(error) }; } }
	/* The same move as ONE edit, so carrying a sketch is one history row and one undo. */
	return { commands, refusal: null, atomic: { type: 'move-features', ids: block, to: at } };
}
/** One step up and one step down for a top-level node, carrying its nested sketches, each with the reducer's own reason when it is refused. */
export function nodeMoveOptions(manifest: SolidManifest, nodes: readonly TreeNode[], id: string): { up: NodeMove; down: NodeMove } {
	const p = nodes.findIndex((n) => n.row.id === id);
	const members = p >= 0 ? nodeMembers(nodes[p]) : [];
	return {
		up: p > 0 ? planNodeMove(manifest, members, nodeMembers(nodes[p - 1]), 'before') : { commands: null, refusal: FIRST_IN_TREE },
		down: p >= 0 && p < nodes.length - 1 ? planNodeMove(manifest, members, nodeMembers(nodes[p + 1]), 'after') : { commands: null, refusal: LAST_IN_TREE }
	};
}

/* -------------------------------------------------------------------------
 * THE ROLLBACK BAR. It sits between top-level rows, and its position is the
 * BUILD INDEX it stands before: features at or after it are not built. The
 * index for a position is one past the last row drawn above the bar, so a row
 * drawn above is always built; a nested sketch drawn below the bar that is
 * older than every row above it is still built, and says so by not graying.
 * The position is workspace state and never enters the manifest.
 * ---------------------------------------------------------------------- */
/** The build index the bar stands before at `position` (0 is above every row), or null at the end, which is no rollback at all. */
export function rollbackIndexAt(nodes: readonly TreeNode[], position: number): number | null {
	if (position >= nodes.length) return null;
	let last = -1;
	for (const node of nodes.slice(0, Math.max(0, position))) for (const row of [node.row, ...node.children]) last = Math.max(last, row.index);
	return last + 1;
}
/** Where the bar is drawn for a build index: the lowest position whose index reaches it. Null (no rollback) draws it at the end. */
export function rollbackPosition(nodes: readonly TreeNode[], index: number | null | undefined): number {
	const end = Math.max(-1, ...nodes.flatMap((n) => [n.row.index, ...n.children.map((c) => c.index)])) + 1;
	if (index === null || index === undefined || index >= end) return nodes.length;
	for (let p = 0; p < nodes.length - 1; p++) if (rollbackIndexAt(nodes, p + 1)! > index) return p;
	return nodes.length - 1;
}
/** Whether a row is rolled back, and drawn grayed. */
export const rolledBack = (row: Pick<FeatureRow, 'index'>, index: number | null | undefined) => index !== null && index !== undefined && row.index >= index;

/* -------------------------------------------------------------------------
 * HOVER LINKS: which tree row made the geometry the pointer is over.
 * ---------------------------------------------------------------------- */
/**
 * The row a hovered selection belongs to, or its datum key (`datum:XY`), or
 * null. A face is named by the feature that created it (the id before its
 * first '.'); an edge or a vertex is named by the faces that meet there, and
 * belongs to the LATEST of their features, which is the one that made it; a
 * body belongs to the feature that created it. A pattern or mirror copy keeps
 * its source's face names on a body of its own, so the body's feature is a
 * candidate too, and the latest still wins: a face on the third copy belongs
 * to the pattern, not to the extrude it was copied from.
 */
export function rowForSelection(selection: Selection | null, rows: readonly Pick<FeatureRow, 'id' | 'index'>[]): string | null {
	if (!selection) return null;
	const at = new Map(rows.map((r) => [r.id, r.index]));
	const known = (id: string) => (at.has(id) ? id : null);
	switch (selection.kind) {
		case 'feature': case 'sketch': return known(selection.id);
		case 'reference': return selection.id.startsWith('datum:') ? selection.id : known(selection.id);
		case 'sketch-entity': return known(selection.bodyId);
		case 'body': return known(featureOfId(selection.id));
		case 'face': case 'edge': case 'vertex': {
			const names = selection.kind === 'face' ? [selection.id] : selection.id.replace(/^(edge|vertex):/, '').replace(/#\d+$/, '').split('|');
			let best: string | null = null;
			for (const id of [...names.map((name) => name.split('.')[0]), featureOfId(selection.bodyId)]) if (at.has(id) && (best === null || at.get(id)! > at.get(best)!)) best = id;
			return best;
		}
		default: return null;
	}
}

/* -------------------------------------------------------------------------
 * RENAME TIMING
 * ---------------------------------------------------------------------- */
/** A second press on the name of an already selected row renames it after this pause, unless it turns out to be a double-click. SolidWorks' slow double-click. */
export const SLOW_RENAME_MS = 500;
