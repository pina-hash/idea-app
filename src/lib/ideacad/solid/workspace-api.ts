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
import type { ModelProjection, ResolvedPlane, Selection, SketchConstraint, SketchEntity, SketchSolveReport, SolidCommand, SolidManifest, Vec3 } from './types';
import type { Tool } from './viewport';
import type { PreferenceGroup, SolidPreferences } from './preferences';

export interface WorkspaceApi {
	readonly model: ModelProjection;
	/** The document as last projected: the feature list with every parameter, for a panel that edits one. */
	readonly manifest: SolidManifest;
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
	/** While a sketch is open, the sketch editor installs this to receive viewport presses in the sketch plane's (u, v) coordinates; return true to consume the event. Null uninstalls. */
	setSketchPointer(handler: ((event: 'down' | 'move' | 'up', at: [number, number], e: PointerEvent) => boolean) | null): void;
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
	/** The student's own settings (display unit, hint state, shortcuts), read-only. Optional so a test's fake workspace need not supply it. */
	readonly prefs?: SolidPreferences;
	/** Change one group of the student's settings; validated and saved by the workspace's store. */
	setPreference?<G extends PreferenceGroup>(group: G, value: SolidPreferences[G]): void;
	/** Run a registry command by id (`command-registry.ts`), exactly as its key or its search row would: a tutorial step or a context menu names a command, never a handler. */
	runCommand?(id: string): void;
	/** Preselect geometry from a panel or the tree (a row's bodies, a crumb's face), lit in the viewport exactly as the pointer's hover lights it; null stops. Optional so a fake workspace need not supply it. */
	hover?(selections: Selection[] | null): void;
	/** Hear what the pointer is over in the viewport: a selection, or null over empty space. The tree lights the matching row this way. Returns the unsubscribe. */
	onHover?(listener: (selection: Selection | null) => void): () => void;
	/** Open the workspace's one right-click menu with the caller's rows: the design tree's row menus draw in the same menu the viewport's right-click does. */
	contextMenu?(request: WorkspaceMenuRequest): void;
	/** Move the rollback bar: build only features [0, index), or everything for null. Workspace state: it never enters the manifest, and a feature added while rolled back goes in at the bar. */
	rollback?(index: number | null): void | Promise<void>;
	/** Where the rollback bar stands: the build index it stands before, or null at the end. */
	readonly rollbackIndex?: number | null;
}
/** One row of a menu a panel hands the workspace. `refusal` set means the row is shown `aria-disabled` with the reason under its word, and a press says it where every refusal shows. */
export interface WorkspaceMenuItem {
	id: string;
	label: string;
	/** The drawing beside the word, as a 24-unit SVG path. */
	icon?: string;
	refusal?: string | null;
	run(): void;
}
/** What a panel hands the workspace's right-click menu. */
export interface WorkspaceMenuRequest {
	/** What the menu is about, for a screen reader: "Extrude 1 actions". */
	label: string;
	/** Where the menu opens, in viewport pixels. */
	x: number;
	y: number;
	items: WorkspaceMenuItem[];
	/** Where focus returns when the menu closes. */
	returnFocus?: HTMLElement | null;
}
export type SketchSolve = { entities: SketchEntity[]; report: SketchSolveReport };
export type SketchSolveInput = { entities: SketchEntity[]; constraints: SketchConstraint[] };
