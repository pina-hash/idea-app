/**
 * THE REFERENCE ROWS AT THE TOP OF THE TREE: Front Plane, Top Plane, Right
 * Plane and the Origin, in the order SolidWorks lists them. They are NOT
 * features: they are in no manifest, cannot be moved, renamed or deleted, and
 * a press on a plane selects the datum the viewport draws, by the same
 * `datum:<name>` selection id the viewport's own plane carries.
 *
 * THE NAMES ARE SOLIDWORKS', ON IDEACAD'S Z-UP SCENE: Top is XY, Front is XZ,
 * Right is YZ.
 *
 * WHETHER THE PLANES ARE DRAWN IS THE REFERENCE LAYER'S SETTING, READ HERE AND
 * NEVER STORED HERE. The layer began as one on/off switch
 * (`datumPlanesShown` / `setDatumPlanesShown`) and is growing a three-way mode
 * (draw them while a part has no body, always, never). The eye on a row has to
 * mean "the planes are on screen right now" under either shape, so the two
 * functions below ask the richer shape when the layer has it and fall back to
 * the switch when it does not. The namespace is spread into a plain object so
 * a member the layer does not export yet reads as absent rather than as a
 * build-time error.
 */
import * as referenceLayer from '../viewport/reference-layer';
import { DATUM_SELECTION_PREFIX, type Datum } from '../features/reference';
import type { ModelProjection, Selection } from '../types';

export type ReferenceKey = Datum | 'origin';
export interface ReferenceRow {
	key: ReferenceKey;
	/** What the row says. */
	name: string;
	/** What a press on the row selects. */
	selection: Selection;
	/** The datum a plane row is, for sketching on it. Absent on the Origin. */
	datum?: Datum;
}
/** The id a press on the Origin row selects: the same `datum:` family as the planes, so a surface that learns to draw the origin can light it. */
export const ORIGIN_SELECTION_ID = `${DATUM_SELECTION_PREFIX}origin`;
const plane = (datum: Datum, name: string): ReferenceRow => ({ key: datum, name, datum, selection: { bodyId: '', kind: 'reference', id: `${DATUM_SELECTION_PREFIX}${datum}` } });
/** Front, Top, Right, Origin: SolidWorks' order. */
export const REFERENCE_ROWS: readonly ReferenceRow[] = [
	plane('XZ', 'Front Plane'),
	plane('XY', 'Top Plane'),
	plane('YZ', 'Right Plane'),
	{ key: 'origin', name: 'Origin', selection: { bodyId: '', kind: 'reference', id: ORIGIN_SELECTION_ID } }
];
/** The reference row a selection id names, or null. */
export const referenceRowFor = (id: string | null | undefined) => REFERENCE_ROWS.find((r) => r.selection.id === id) ?? null;

type Mode = 'auto' | 'always' | 'never';
const layer: Record<string, unknown> = { ...referenceLayer };
const visibleIn = layer.datumPlanesVisible as ((model: ModelProjection) => boolean) | undefined;
const setMode = layer.setDatumPlaneMode as ((mode: Mode) => void) | undefined;
/** Whether the datum planes (and the origin drawn with them) are on screen for this model. */
export function planesVisible(model: ModelProjection): boolean {
	return typeof visibleIn === 'function' ? visibleIn(model) : referenceLayer.datumPlanesShown();
}
/** Show or hide the datum planes. Under the three-way setting this is the student's own choice, `always` or `never`, so a hidden plane stays hidden on an empty part too. */
export function setPlanesVisible(on: boolean): void {
	if (typeof setMode === 'function') setMode(on ? 'always' : 'never');
	else referenceLayer.setDatumPlanesShown(on);
}
/** The layer's change feed, for a surface that shows the setting. Returns the unsubscribe. */
export const onPlanesChange = (listener: () => void) => referenceLayer.onDatumPlanesChange(listener);
