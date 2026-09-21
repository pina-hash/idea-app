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
import { REFERENCE_TYPES, reorderRange } from '../features';
import type { FeatureRow, FeatureStatus, FeatureType, Selection, SolidCommand, SolidManifest } from '../types';

/** The glyph AND the word, always together: colour is never the only signal and a glyph alone is not a word. */
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
