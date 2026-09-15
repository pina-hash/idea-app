import type {IdeacadAction} from '../history';
import type {DirectRow} from './history';
export type Vec3 = [number, number, number];
export type ProfileCurve = {type:'line';start:[number,number];end:[number,number]}|{type:'circle';center:[number,number];radius:number}|{type:'arc';center:[number,number];radius:number;startAngle:number;endAngle:number};
export type EntityKind = 'body' | 'face' | 'edge' | 'vertex' | 'sketch';
export interface Selection { bodyId: string; kind: EntityKind; id: string }
export interface SketchPlane { origin: Vec3; u: Vec3; v: Vec3; normal: Vec3 }
export type SketchSegment = { type: 'line'; start: Vec3; end: Vec3 } | { type: 'arc'; start: Vec3; end: Vec3; center: Vec3 };
export interface Sketch {
	id: string; name: string; plane: SketchPlane; supportBodyId?: string;
	profile: { type: 'polygon'; points: Vec3[] } | { type: 'circle'; center: Vec3; radius: number } | { type: 'wire'; segments: SketchSegment[] };
	holes?: Sketch['profile'][];
}
export type BodyRole = 'part' | 'hex-core' | 'collar' | 'spin-bolt' | 'blade';
export interface BodyRecord {
	id: string; name: string; artifact: string; materialId: string | null; role: BodyRole; topologyEpoch?: string;
	massG?: number|null; massSource?: 'measured'|'bambu-studio';
}
export interface SolidManifest {
	format: 'ideacad-solid-v1'; kernel: 'remus-f7907f5-2.130.20'; units: 'in'; title: string;
	bodies: BodyRecord[]; sketches: Sketch[]; addons: { ideaBlade: boolean };
}
export const emptyManifest = (): SolidManifest => ({ format: 'ideacad-solid-v1', kernel: 'remus-f7907f5-2.130.20', units: 'in', title:'Untitled document', bodies: [], sketches: [], addons: { ideaBlade: false } });
export interface GeometryArtifact { hash: string; bytes: Uint8Array }
export interface ModelSnapshot { manifest: SolidManifest; artifacts: GeometryArtifact[] }
export interface MeshData { positions: Float32Array; normals: Float32Array; indices: Uint32Array }
export interface FaceProjection extends MeshData {
	id: string; kind: string; center: Vec3; normal: Vec3; area: number;
	surface: Record<string, unknown>;
}
export interface EdgeProjection { id: string; curve: string; points: Float32Array; faces: string[] }
export interface VertexProjection { id: string; point: Vec3; faces: string[] }
export interface BodyProjection {
	id: string; name: string; materialId: string | null; role: BodyRole;
	massG?: number|null; massSource?: 'measured'|'bambu-studio';
	faces: FaceProjection[]; edges: EdgeProjection[]; vertices: VertexProjection[];
	mesh: MeshData; bounds: number[]; volume: number; centerOfMass: Vec3; inertia: number[];
}
export interface ModelProjection { bodies: BodyProjection[]; sketches: Sketch[]; addons: SolidManifest['addons']; operationMs: number; canUndo: boolean; canRedo: boolean }
export type SolidCommand =
	| { type: 'sketch'; sketch: Sketch }
	| { type: 'extrude'; sketchId: string; distance: number; operation: 'new' | 'add' | 'cut'; targetId?: string }
	| { type: 'revolve'; sketchId: string; angle: number; origin: Vec3; axis: Vec3 }
	| { type: 'push' | 'fillet' | 'chamfer' | 'shell'; selection: Selection; value: number }
	| { type: 'transform'; bodyIds: string[]; matrix: number[] }
	| { type: 'move-selection'; selection: Selection; delta: Vec3 }
	| { type: 'mirror'; bodyIds: string[]; origin: Vec3; normal: Vec3 }
	| { type: 'pattern'; bodyId: string; mode: 'linear' | 'circular'; direction: Vec3; spacing: number; count: number }
	| { type: 'boolean'; operation: 'union' | 'subtract' | 'intersect'; bodyIds: string[] }
	| { type: 'delete'; selections: Selection[] }
	| { type: 'metadata'; bodyId: string; name?: string; materialId?: string | null; role?: BodyRole; massG?: number|null; massSource?: 'measured'|'bambu-studio' }
	| { type: 'addon'; enabled: boolean }
	| { type: 'title'; title: string };

export interface SolidDocument {
	id: string; title: string; conceptId: string; revision: number; canWrite: boolean;
	owner: string; archivedAt: string | null; snapshot: ModelSnapshot;
	history?:DirectRow[];
}
export interface SolidHistoryAction { id: string; label: string; before: SolidManifest; after: SolidManifest; createdAt: string;changes?:Array<IdeacadAction&{undoesSeq?:number}> }
export interface SolidSave { documentId: string; conceptId: string; expectedRevision: number; requestId: string; title: string; snapshot: ModelSnapshot; actions: SolidHistoryAction[] }
export interface SolidTransport {
	create(title: string): Promise<SolidDocument>;
	open(id: string): Promise<SolidDocument>;
	save(input: SolidSave): Promise<{ revision: number }>;
}
