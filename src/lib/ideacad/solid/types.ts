/**
 * THE SOLID DOCUMENT CONTRACT, VERSION 2: A DOCUMENT IS ITS FEATURE LIST.
 *
 * Version 1 (ledger `ideacad-direct-modeler`, 2026-09-15) persisted only the
 * RESULT of modeling -- a list of bodies, each pointing at immutable B-rep
 * bytes -- and threw every command away once the kernel had applied it. That is
 * why there was no design tree and why no number could be changed after the
 * fact. Version 2 keeps the commands: `features` is an ordered, re-playable
 * list, and the bodies are DERIVED from it by replay (see `engine.ts`).
 *
 * `bodies` stays in the manifest for three reasons, none of them "the truth":
 *   1. it is the STORAGE form -- 0216's save RPC validates that every body's
 *      artifact hash exists, and the artifacts are what a reader fetches;
 *   2. it carries the per-body METADATA that survives a replay (name, material,
 *      colour, role, entered mass), keyed by the body id the creating feature
 *      assigns deterministically;
 *   3. a v1 document IS a bodies-only document, and it upgrades into v2 as a
 *      list of `body` features whose parameter is the artifact itself -- so a
 *      document with no history is a valid document, opens, renders from the
 *      exact bytes it was saved with, and can be built on from that point.
 *
 * WHAT CHANGED SHAPE AND WHAT DID NOT. `format` moved to `ideacad-solid-v2`;
 * 0216's validator refuses that string, and migration 0217 widens it. Every
 * key 0216 validates (`kernel`, `units`, `title`, `bodies[*].{id,name,artifact,
 * materialId,role,massG,massSource}`, `sketches`, `addons.ideaBlade`) keeps its
 * meaning and its type. `sketches` is kept as a key and is `[]` for a v2
 * document, because sketches are features now.
 */
import type {IdeacadAction} from '../history';
import type {DirectRow} from './history';

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];
export type ProfileCurve = {type:'line';start:[number,number];end:[number,number]}|{type:'circle';center:[number,number];radius:number}|{type:'arc';center:[number,number];radius:number;startAngle:number;endAngle:number};

/* -------------------------------------------------------------------------
 * SELECTION AND ENTITY REFERENCES
 * ---------------------------------------------------------------------- */

/**
 * What a click in the viewport or the tree names. `face` ids are PERSISTENT
 * FACE NAMES (see `naming.ts`); `edge` and `vertex` ids are derived from the
 * names of the faces they join; `feature` and `reference` ids are feature ids;
 * `sketch-entity` ids are `<sketch feature id>/<entity id>`.
 */
export type EntityKind = 'body' | 'face' | 'edge' | 'vertex' | 'sketch' | 'feature' | 'reference' | 'sketch-entity';
export interface Selection { bodyId: string; kind: EntityKind; id: string }

/**
 * A reference a FEATURE stores to topology it consumed. The `name` (or the
 * face-name set) is the construction tier of the topological-naming scheme;
 * the `hint` is the inference tier, used only when the name no longer resolves.
 * `naming.ts` states the whole scheme and exactly when each tier breaks.
 */
export interface FaceHint { kind: string; center: Vec3; normal: Vec3; area: number }
export interface EdgeHint { curve: string; mid: Vec3; length: number }
export interface VertexHint { point: Vec3 }
export interface FaceRef { body: string; name: string; hint?: FaceHint }
export interface EdgeRef { body: string; faces: string[]; ordinal?: number; hint?: EdgeHint }
export interface VertexRef { body: string; faces: string[]; ordinal?: number; hint?: VertexHint }
export type EntityRef =
	| { kind: 'body'; body: string }
	| ({ kind: 'face' } & FaceRef)
	| ({ kind: 'edge' } & EdgeRef)
	| ({ kind: 'vertex' } & VertexRef)
	| { kind: 'reference'; feature: string }
	| { kind: 'sketch-entity'; feature: string; entity: string };

/** Where a sketch lives, or what a mirror reflects across. */
export type PlaneRef =
	| { kind: 'datum'; datum: 'XY' | 'XZ' | 'YZ'; offset?: number }
	| { kind: 'face'; face: FaceRef }
	| { kind: 'reference'; feature: string }
	/** A plane held by value: what a v1 sketch drawn on an arbitrary face becomes on upgrade. */
	| { kind: 'fixed'; plane: ResolvedPlane };
/** What a revolve turns about, or a pattern runs along. */
export type AxisRef =
	| { kind: 'datum'; axis: 'X' | 'Y' | 'Z' }
	| { kind: 'sketch'; feature: string; axis: 'u' | 'v'; through?: Vec2 }
	| { kind: 'edge'; edge: EdgeRef }
	| { kind: 'face'; face: FaceRef }
	| { kind: 'reference'; feature: string }
	| { kind: 'line'; origin: Vec3; direction: Vec3 };
export type PointRef =
	| { kind: 'origin' }
	| { kind: 'vertex'; vertex: VertexRef }
	| { kind: 'reference'; feature: string }
	| { kind: 'coordinates'; point: Vec3 };

/** A plane, axis or point once it has been resolved against the model. */
export interface ResolvedPlane { origin: Vec3; u: Vec3; v: Vec3; normal: Vec3 }
export interface ResolvedAxis { origin: Vec3; direction: Vec3 }
export interface ResolvedPoint { point: Vec3 }
export type SketchPlane = ResolvedPlane;

/* -------------------------------------------------------------------------
 * SKETCHES: an editable collection of entities and driving constraints
 * ---------------------------------------------------------------------- */

/**
 * Points are the primitives and are SHARED: a rectangle is four points and four
 * lines, and two lines meeting at one point are connected because they name
 * the same point, which is how a closed profile is a property of the entity
 * graph rather than of a separate "coincident" list. Coordinates are 2D, in the
 * sketch plane's own (u, v) basis, in inches.
 */
export type SketchEntity =
	| { id: string; type: 'point'; x: number; y: number; fixed?: boolean; construction?: boolean }
	| { id: string; type: 'line'; a: string; b: string; construction?: boolean }
	| { id: string; type: 'circle'; center: string; radius: number; construction?: boolean }
	| { id: string; type: 'arc'; center: string; start: string; end: string; construction?: boolean };

/**
 * Constraints are DRIVING: the kernel's 2D solver (`gcs*`) moves the points to
 * satisfy them, so a typed length is a length. Names and fields mirror the
 * kernel's own vocabulary one to one (`remus_wasm_bg.d.ts`, `gcsAddConstraint`)
 * so the translation in `sketch/model.ts` is a table and not a second solver.
 */
export type SketchConstraint =
	| { id: string; type: 'coincident'; a: string; b: string }
	| { id: string; type: 'distance'; a: string; b: string; value: number }
	| { id: string; type: 'pointLineDistance'; point: string; line: string; value: number }
	| { id: string; type: 'horizontal'; line: string }
	| { id: string; type: 'vertical'; line: string }
	| { id: string; type: 'angle'; l1: string; l2: string; value: number }
	| { id: string; type: 'parallel'; l1: string; l2: string }
	| { id: string; type: 'perpendicular'; l1: string; l2: string }
	| { id: string; type: 'equalLength'; l1: string; l2: string }
	| { id: string; type: 'circleRadius'; circle: string; value: number }
	| { id: string; type: 'arcRadius'; arc: string; value: number }
	| { id: string; type: 'equalRadius'; a: string; b: string }
	| { id: string; type: 'pointOnCircle'; point: string; circle: string }
	| { id: string; type: 'pointOnArc'; point: string; arc: string }
	| { id: string; type: 'tangentLineArc'; line: string; arc: string; point: string }
	| { id: string; type: 'tangentArcArc'; arc1: string; arc2: string; point: string }
	| { id: string; type: 'concentric'; a: string; b: string }
	| { id: string; type: 'midpoint'; point: string; line: string }
	| { id: string; type: 'symmetric'; a: string; b: string; axis: string }
	| { id: string; type: 'fixX'; point: string; value: number }
	| { id: string; type: 'fixY'; point: string; value: number };

export interface SketchSolveReport {
	converged: boolean;
	classification: 'solved' | 'underConstrained' | 'redundant' | 'unsatisfied' | 'unsolved';
	dof: number;
	maxResidual: number;
	/** Constraint ids the solver reports as conflicting or redundant, when it can name them. */
	trouble: string[];
}

/** The v1 sketch shape, kept so a saved v1 document still opens. */
export type SketchSegment = { type: 'line'; start: Vec3; end: Vec3 } | { type: 'arc'; start: Vec3; end: Vec3; center: Vec3 };
export interface Sketch {
	id: string; name: string; plane: SketchPlane; supportBodyId?: string;
	profile: { type: 'polygon'; points: Vec3[] } | { type: 'circle'; center: Vec3; radius: number } | { type: 'wire'; segments: SketchSegment[] };
	holes?: Sketch['profile'][];
}

/* -------------------------------------------------------------------------
 * FEATURES: the spine
 * ---------------------------------------------------------------------- */

export interface FeatureBase {
	/** Stable for the life of the document. Never reused. */
	id: string;
	/** What the tree shows. Renameable. */
	name: string;
	/** A suppressed feature is skipped on replay and keeps its parameters. */
	suppressed?: boolean;
}

export type MateKind = 'coincident' | 'concentric' | 'parallel' | 'perpendicular' | 'distance' | 'angle';

export type Feature = FeatureBase & (
	/** A body whose only parameter is its exact bytes: a v1 body, an import, or a copy. */
	| { type: 'body'; bodyId: string; artifact: string; source?: 'legacy' | 'import' | 'addon' }
	| { type: 'sketch'; plane: PlaneRef; entities: SketchEntity[]; constraints: SketchConstraint[] }
	| { type: 'extrude'; sketch: string; distance: number; direction?: 'normal' | 'reverse' | 'both'; operation: 'new' | 'add' | 'cut'; target?: string; regions?: string[] }
	| { type: 'revolve'; sketch: string; angle: number; axis: AxisRef; operation: 'new' | 'add' | 'cut'; target?: string }
	| { type: 'push'; face: FaceRef; value: number }
	| { type: 'move-selection'; entity: EdgeRef | VertexRef; delta: Vec3 }
	| { type: 'fillet'; edges: EdgeRef[]; radius: number; propagate?: boolean; variable?: { end: number; law?: 'linear' | 'scurve' } }
	| { type: 'chamfer'; edges: EdgeRef[]; distance: number; distance2?: number; angle?: number; propagate?: boolean }
	| { type: 'shell'; body: string; thickness: number; openFaces: FaceRef[]; faceThickness?: { face: FaceRef; thickness: number }[] }
	| { type: 'transform'; bodies: string[]; matrix: number[] }
	| { type: 'mirror'; bodies: string[]; plane: PlaneRef; merge?: boolean }
	| { type: 'pattern'; body: string; mode: 'linear' | 'circular'; axis: AxisRef; spacing: number; count: number }
	| { type: 'boolean'; operation: 'union' | 'subtract' | 'intersect'; bodies: string[] }
	| { type: 'delete'; bodies: string[] }
	| { type: 'plane'; definition: PlaneDefinition }
	| { type: 'axis'; definition: AxisDefinition }
	| { type: 'point'; definition: PointDefinition }
	| { type: 'mate'; kind: MateKind; a: EntityRef; b: EntityRef; value?: number; flip?: boolean }
	| { type: 'hole'; face: FaceRef; center: Vec2 | { kind: 'point'; point: PointRef }; standard: string; fit: 'tapped' | 'close' | 'normal' | 'custom'; diameter?: number; depth: number | 'through' }
	| { type: 'draft'; faces: FaceRef[]; angle: number; pull: AxisRef; neutral: PlaneRef }
	| { type: 'sweep'; profile: string; path: string | EdgeRef[]; operation: 'new' | 'add' | 'cut'; target?: string }
	| { type: 'loft'; profiles: string[]; smooth?: boolean; operation: 'new' | 'add' | 'cut'; target?: string }
	| { type: 'rib'; sketch: string; thickness: number; target: string }
);
export type FeatureType = Feature['type'];
export type FeatureOf<T extends FeatureType> = Extract<Feature, { type: T }>;

export type PlaneDefinition =
	| { kind: 'offset'; from: PlaneRef; offset: number }
	| { kind: 'through-points'; points: [PointRef, PointRef, PointRef] }
	| { kind: 'point-normal'; point: PointRef; normal: AxisRef }
	| { kind: 'angle'; from: PlaneRef; about: AxisRef; angle: number }
	| { kind: 'mid'; a: PlaneRef; b: PlaneRef };
export type AxisDefinition =
	| { kind: 'datum'; axis: 'X' | 'Y' | 'Z' }
	| { kind: 'two-points'; a: PointRef; b: PointRef }
	| { kind: 'cylinder'; face: FaceRef }
	| { kind: 'edge'; edge: EdgeRef }
	| { kind: 'plane-plane'; a: PlaneRef; b: PlaneRef }
	| { kind: 'point-direction'; point: PointRef; direction: AxisRef };
export type PointDefinition =
	| { kind: 'coordinates'; point: Vec3 }
	| { kind: 'vertex'; vertex: VertexRef }
	| { kind: 'edge-midpoint'; edge: EdgeRef }
	| { kind: 'face-center'; face: FaceRef }
	| { kind: 'axis-plane'; axis: AxisRef; plane: PlaneRef }
	| { kind: 'body-center'; body: string };

/* -------------------------------------------------------------------------
 * BODIES AND THE MANIFEST
 * ---------------------------------------------------------------------- */

export type BodyRole = 'part' | 'hex-core' | 'collar' | 'spin-bolt' | 'blade';
export interface BodyRecord {
	id: string; name: string; artifact: string; materialId: string | null; role: BodyRole; topologyEpoch?: string;
	massG?: number|null; massSource?: 'measured'|'bambu-studio';
	/** An explicit per-body colour, `#rrggbb`, which overrides the material's appearance. */
	color?: string | null;
	/** A body pinned in place takes no motion from a mate. */
	fixed?: boolean;
}
export const KERNEL_ID = 'remus-f7907f5-2.130.20' as const;
export type ManifestFormat = 'ideacad-solid-v1' | 'ideacad-solid-v2';
export interface AddonState { ideaBlade: boolean; [addon: string]: boolean | Record<string, unknown> }
export interface SolidManifest {
	format: 'ideacad-solid-v2'; kernel: typeof KERNEL_ID; units: 'in'; title: string;
	features: Feature[];
	bodies: BodyRecord[]; sketches: Sketch[]; addons: AddonState;
}
/** A v1 manifest as 0216 stored it. Read by `upgradeManifest`, never written. */
export interface LegacyManifest {
	format: 'ideacad-solid-v1'; kernel: typeof KERNEL_ID; units: 'in'; title: string;
	bodies: BodyRecord[]; sketches: Sketch[]; addons: { ideaBlade: boolean };
}
export const emptyManifest = (): SolidManifest => ({ format: 'ideacad-solid-v2', kernel: KERNEL_ID, units: 'in', title:'Untitled document', features: [], bodies: [], sketches: [], addons: { ideaBlade: false } });
export interface GeometryArtifact { hash: string; bytes: Uint8Array }
export interface ModelSnapshot { manifest: SolidManifest; artifacts: GeometryArtifact[] }

/* -------------------------------------------------------------------------
 * PROJECTIONS: what the viewport and the panels read
 * ---------------------------------------------------------------------- */

export interface MeshData { positions: Float32Array; normals: Float32Array; indices: Uint32Array }
export interface FaceProjection extends MeshData {
	id: string; kind: string; center: Vec3; normal: Vec3; area: number;
	surface: Record<string, unknown>;
	/** Edge ids around this face, for select-face-then-all-its-edges. */
	edges: string[];
}
export interface EdgeProjection { id: string; curve: string; points: Float32Array; faces: string[]; length: number; mid: Vec3; ordinal?: number }
export interface VertexProjection { id: string; point: Vec3; faces: string[]; ordinal?: number }
export interface BodyProjection {
	id: string; name: string; materialId: string | null; role: BodyRole; color?: string | null; fixed?: boolean;
	massG?: number|null; massSource?: 'measured'|'bambu-studio';
	faces: FaceProjection[]; edges: EdgeProjection[]; vertices: VertexProjection[];
	mesh: MeshData; bounds: number[]; volume: number; centerOfMass: Vec3; inertia: number[];
	/** Which feature created this body. */
	createdBy: string;
	/** Rigid degrees of freedom left by the mates on this body, 0..6. Undefined when no mate names it. */
	dof?: number;
}
export type FeatureStatus = 'ok' | 'error' | 'suppressed' | 'warning';
export interface FeatureRow {
	id: string; index: number; type: FeatureType; name: string; status: FeatureStatus;
	/** A sentence a student can act on. Present when status is `error` or `warning`. */
	message?: string;
	/** The one number or word the tree shows beside the name. */
	summary: string;
	/** Bodies this feature created or changed. */
	bodies: string[];
	/** Feature ids this one depends on; a reorder above any of them is refused. */
	dependsOn: string[];
	suppressed: boolean;
}
export interface ReferenceProjection {
	feature: string; name: string; kind: 'plane' | 'axis' | 'point';
	origin: Vec3; normal?: Vec3; direction?: Vec3; u?: Vec3; v?: Vec3;
	/** A drawing size in inches, from the model's extent. */
	size: number;
}
export interface SketchProjection {
	feature: string; name: string; plane: ResolvedPlane; planeRef: PlaneRef; entities: SketchEntity[]; constraints: SketchConstraint[];
	solve: SketchSolveReport;
	/** Closed regions the sketch currently encloses, as 3D polylines for drawing and picking. */
	regions: { id: string; outline: Vec3[]; holes: Vec3[][]; area: number }[];
	/** True once a later feature has consumed it: drawn faintly and not offered to Extrude. */
	consumed: boolean;
}
export interface MateProjection { feature: string; kind: MateKind; a: EntityRef; b: EntityRef; value?: number; status: FeatureStatus; message?: string; residual?: number }
export interface ModelProjection {
	bodies: BodyProjection[];
	sketches: SketchProjection[];
	references: ReferenceProjection[];
	features: FeatureRow[];
	mates: MateProjection[];
	addons: AddonState;
	operationMs: number; replayMs?: number; replayedFrom?: number; canUndo: boolean; canRedo: boolean;
}

/* -------------------------------------------------------------------------
 * COMMANDS: every edit is an edit of the feature list or of body metadata
 * ---------------------------------------------------------------------- */

export type SolidCommand =
	| { type: 'add-feature'; feature: Feature; at?: number }
	| { type: 'set-feature'; id: string; patch: Partial<Feature> & Record<string, unknown> }
	| { type: 'remove-feature'; id: string }
	| { type: 'move-feature'; id: string; to: number }
	| { type: 'suppress-feature'; id: string; suppressed: boolean }
	| { type: 'rename-feature'; id: string; name: string }
	| { type: 'metadata'; bodyId: string; name?: string; materialId?: string | null; role?: BodyRole; massG?: number|null; massSource?: 'measured'|'bambu-studio'; color?: string | null; fixed?: boolean }
	| { type: 'addon'; addon?: string; enabled: boolean; settings?: Record<string, unknown> }
	| { type: 'title'; title: string }
	/** Convenience wrappers the tools use; each becomes an add-feature. */
	| { type: 'sketch'; sketch: Sketch; planeRef?: PlaneRef }
	| { type: 'delete'; selections: Selection[] };

export interface SolidDocument {
	id: string; title: string; conceptId: string; revision: number; canWrite: boolean;
	owner: string; archivedAt: string | null; deletedAt?: string | null; snapshot: ModelSnapshot;
	history?:DirectRow[];
}
export interface SolidHistoryAction { id: string; label: string; before: SolidManifest; after: SolidManifest; createdAt: string;changes?:Array<IdeacadAction&{undoesSeq?:number}> }
export interface SolidSave { documentId: string; conceptId: string; expectedRevision: number; requestId: string; title: string; snapshot: ModelSnapshot; actions: SolidHistoryAction[] }
export interface SolidTransport {
	create(title: string): Promise<SolidDocument>;
	open(id: string): Promise<SolidDocument>;
	save(input: SolidSave): Promise<{ revision: number }>;
	/** Optional: a small picture of the model, written after a save. */
	thumbnail?(documentId: string, dataUrl: string): Promise<void>;
}
