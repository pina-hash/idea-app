/**
 * WHAT A FEATURE EXECUTOR IS HANDED. One object, built by `engine.ts` for each
 * feature in replay order; the executor reads references through it, creates
 * or replaces bodies through it, and never touches kernel handles it did not
 * get from it. Every executor module under `features/` takes exactly this.
 */
import type { BrepKernel } from '../../kernel/remus';
import type { AxisRef, EdgeRef, FaceRef, Feature, MateKind, EntityRef, PlaneRef, PointRef, ResolvedAxis, ResolvedPlane, ResolvedPoint, SketchConstraint, SketchEntity, SketchSolveReport, SolidManifest, Vec3, VertexRef } from '../types';
import type { NamingOptions, NamingReport } from '../naming';
import type { Region } from '../sketch/model';

export interface LiveBody {
	id: string;
	solid: number;
	createdBy: string;
	/** Set when the solid handle changed since the artifact was last serialized. */
	dirty: boolean;
	artifact: string;
}
export interface SketchState {
	feature: string;
	plane: ResolvedPlane;
	/** Entities with the solver's positions applied. */
	entities: SketchEntity[];
	constraints: SketchConstraint[];
	report: SketchSolveReport;
	regions: Region[];
	consumed: boolean;
}
export type ResolvedRef = { kind: 'plane'; plane: ResolvedPlane } | { kind: 'axis'; axis: ResolvedAxis } | { kind: 'point'; point: ResolvedPoint };
export interface MateState { feature: string; kind: MateKind; a: EntityRef; b: EntityRef; value?: number; flip?: boolean; residual: number }

/** A resolved topological reference: which live body and which kernel handle. `note` is set when the hint tier did the resolving. */
export interface Resolved { body: LiveBody; handle: number; note?: string }

export interface ExecutorContext {
	readonly k: BrepKernel;
	readonly feature: Feature;
	readonly index: number;
	readonly manifest: SolidManifest;
	/** Live bodies in creation order. */
	readonly bodies: ReadonlyMap<string, LiveBody>;
	readonly order: readonly string[];
	readonly refs: ReadonlyMap<string, ResolvedRef>;
	readonly sketches: ReadonlyMap<string, SketchState>;
	readonly mates: readonly MateState[];

	/** A live body, or a lost-reference error naming it. */
	body(id: string): LiveBody;
	/** Adds a body this feature created; the id is `<feature id>#<k>` unless given. Names its faces from `options`. */
	addBody(solid: number, options?: { id?: string; naming?: NamingOptions; name?: string }): LiveBody;
	/** Replaces a body's solid after an operation on it. Names new faces from `options`. */
	replaceBody(body: LiveBody, solid: number, options?: NamingOptions): NamingReport;
	removeBody(id: string): void;
	/** Parses a journaled result `{solid, op, ...}`, propagates names across it, refuses a partial blend. Returns the solid. */
	journal(result: string): number;
	/** Runs `fn` on a scratch checkpoint and restores afterwards, so kernel scratch (a gcs sketch, a probe face) leaves nothing behind. */
	scratch<T>(fn: () => T): T;

	resolveFace(ref: FaceRef): Resolved;
	resolveEdge(ref: EdgeRef): Resolved;
	resolveVertex(ref: VertexRef): Resolved;
	resolvePlane(ref: PlaneRef): ResolvedPlane;
	resolveAxis(ref: AxisRef): ResolvedAxis;
	resolvePoint(ref: PointRef): ResolvedPoint;
	/** A solved sketch, or a lost-reference error. */
	sketch(id: string): SketchState;
	/** Records a solved sketch, a reference or a mate for later features to read. */
	setSketch(state: SketchState): void;
	setRef(ref: ResolvedRef): void;
	setMate(state: MateState): void;
	markConsumed(sketchId: string): void;
	/** The persistent name a kernel face carries. */
	faceName(face: number): string | undefined;
	/** A student-facing warning; the feature still counts as run. */
	warn(message: string): void;
	/** Mass-properties volume, exact; throws the student-facing message when a solid is empty. */
	volume(solid: number): number;
	/** Bounding box of every live body, for drawing sizes. */
	extent(): { min: Vec3; max: Vec3 } | null;
}
export type Executor<T extends Feature = Feature> = (ctx: ExecutorContext, feature: T) => void;
