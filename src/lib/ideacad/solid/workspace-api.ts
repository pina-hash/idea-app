/**
 * WHAT A PANEL IS HANDED BY THE WORKSPACE. One shape, so every panel surface
 * (the design tree, the sketch editor, reference geometry, mates, blends and
 * features, appearance, add-ons) reads the same props and writes through the
 * same two calls, and `SolidWorkspace.svelte` stays a single-writer file.
 *
 * `apply` is the ONLY way a panel changes the document, and the label it
 * passes is what the history row and the undo button say. A panel never holds
 * kernel state; what it needs beyond the projection it asks for with
 * `request` (a sketch solve, a measurement), which is the worker passthrough.
 */
import type { ModelProjection, ResolvedPlane, Selection, SketchConstraint, SketchEntity, SketchSolveReport, SolidCommand, Vec3 } from './types';
import type { Tool } from './viewport';

export interface WorkspaceApi {
	readonly model: ModelProjection;
	readonly selections: Selection[];
	readonly canWrite: boolean;
	readonly busy: boolean;
	readonly tool: Tool;
	/** The sketch feature open for editing, if any. */
	readonly editingSketch: string | null;
	apply(command: SolidCommand, label: string): Promise<void>;
	select(selection: Selection | null, append?: boolean): void;
	setTool(tool: Tool): void;
	/** Open a sketch feature for editing in the viewport, or close the open one. */
	editSketch(featureId: string | null): void;
	/** Worker passthrough. `sketch-solve` returns `{entities, report}`; `measure` returns `{kind, value, points?}`. */
	request<T>(method: 'sketch-solve' | 'measure' | 'project' | 'snapshot', value?: unknown): Promise<T>;
	/** Screen position of a world point, for labels beside geometry. */
	project(point: [number, number, number]): { x: number; y: number };
	/** Show a sentence where every other refusal shows. */
	error(message: string): void;
	/** Draw a transient polyline in the viewport (a mate preview, a measurement, a dimension witness line) until `clearGuides`. */
	guide(points: Vec3[], color?: string): void;
	clearGuides(): void;
	/** A section view: cut everything on the plane's normal side away. Null restores the model. */
	clip(plane: ResolvedPlane | null): void;
	/** Camera: look straight at a plane, or fit the model. */
	lookAt(plane: ResolvedPlane): void;
	fit(): void;
	/** The world point under a viewport position on a plane. */
	unproject(x: number, y: number, plane: ResolvedPlane): Vec3 | null;
}
export type SketchSolve = { entities: SketchEntity[]; report: SketchSolveReport };
export type SketchSolveInput = { entities: SketchEntity[]; constraints: SketchConstraint[] };
