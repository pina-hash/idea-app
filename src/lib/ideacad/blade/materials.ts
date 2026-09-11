import type { BladeTree } from './tree';
export interface Material { id: string; name: string; densityGcm3: number }
export interface Stock extends Material { thicknessIn: number }
export interface StandardPart { name: string; massG: number; verified: boolean; geometry: Record<string, unknown> }
export interface BladeConfig { materials: Material[]; stock: Stock[]; standardParts: StandardPart[]; launcher: { acrossFlatsIn: number|null }; tipHeightIn: number; rules: { maxDiameterIn:number; minHeightIn:number; maxHeightIn:number; minHexExtensionIn:number; maxHexExtensionIn:number; maxMassG:number }; defaultFeatures: BladeTree }
export const DEFAULT_BLADE_TREE: BladeTree = { schema:1, editor:'blade', units:'in', rotation:'cw', materials:{body:'pla',bodySolidFraction:.42,bladeStock:'steel-0125'}, features:[
 {id:'body-revolve',type:'revolve',stations:[{r:.12,z:.125},{r:1.55,z:.35},{r:1.65,z:2.4},{r:.7,z:2.95}]},
 {id:'hex-extension',type:'hexBoss',acrossFlats:.5,height:.5},
 {id:'blade-sketch',type:'bladeSketch',rootWidth:.45,tipWidth:.3,length:.65,sweepDeg:18,mountRadius:1.45},
 {id:'blade-extrude',type:'extrude',sketch:'blade-sketch',thickness:'stock'},
 {id:'blade-pattern',type:'circularPattern',feature:'blade-extrude',count:4},
 {id:'blade-mount',type:'mount',feature:'blade-pattern',z:1.25}
]};
export const DEFAULT_BLADE_CONFIG: BladeConfig = { materials:[{id:'pla',name:'PLA',densityGcm3:1.24},{id:'petg',name:'PETG',densityGcm3:1.27}], stock:[{id:'steel-0125',name:'Steel 0.125 in',thicknessIn:.125,densityGcm3:7.85},{id:'steel-01875',name:'Steel 0.1875 in',thicknessIn:.1875,densityGcm3:7.85},{id:'aluminum-0125',name:'Aluminum 0.125 in',thicknessIn:.125,densityGcm3:2.7}], standardParts:['Hex core','Hex collar','Tip bolt'].map(name=>({name,massG:0,verified:false,geometry:{}})), launcher:{acrossFlatsIn:null}, tipHeightIn:.125, rules:{maxDiameterIn:5,minHeightIn:2.9,maxHeightIn:3.1,minHexExtensionIn:.45,maxHexExtensionIn:.55,maxMassG:680}, defaultFeatures:DEFAULT_BLADE_TREE };
