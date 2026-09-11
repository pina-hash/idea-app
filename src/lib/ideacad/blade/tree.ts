export type Rotation = 'cw' | 'ccw';
export interface Station { r: number; z: number }
export interface RevolveFeature { id: 'body-revolve'; type: 'revolve'; stations: Station[] }
export interface HexFeature { id: 'hex-extension'; type: 'hexBoss'; acrossFlats: number; height: number }
export interface BladeSketchFeature { id: 'blade-sketch'; type: 'bladeSketch'; rootWidth: number; tipWidth: number; length: number; sweepDeg: number; mountRadius: number }
export interface ExtrudeFeature { id: 'blade-extrude'; type: 'extrude'; sketch: 'blade-sketch'; thickness: 'stock' }
export interface PatternFeature { id: 'blade-pattern'; type: 'circularPattern'; feature: 'blade-extrude'; count: number }
export interface MountFeature { id: 'blade-mount'; type: 'mount'; feature: 'blade-pattern'; z: number }
export type BladeFeature = RevolveFeature | HexFeature | BladeSketchFeature | ExtrudeFeature | PatternFeature | MountFeature;
export interface BladeTree { schema: 1; editor: 'blade'; units: 'in'; rotation: Rotation; materials: { body: string; bodySolidFraction: number; bladeStock: string }; features: BladeFeature[] }
export function featureOf<T extends BladeFeature['type']>(tree: BladeTree, type: T): Extract<BladeFeature,{type:T}> { return tree.features.find((f) => f.type === type) as Extract<BladeFeature,{type:T}>; }
export function cloneTree(tree: BladeTree): BladeTree { return structuredClone(tree); }
