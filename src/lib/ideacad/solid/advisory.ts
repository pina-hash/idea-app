import type { BodyProjection, ModelProjection } from './types';
export const DEFAULT_LIMITS={minDiameterIn:null,maxDiameterIn:5,minHeightIn:2.9,maxHeightIn:3.1,minMassG:null,maxMassG:680,minHexExtensionIn:.5,maxHexExtensionIn:null};
export type AdvisoryLimits={ [K in keyof typeof DEFAULT_LIMITS]: number|null };
export interface AdvisoryRules { revision:number;schemaVersion:number;limits:AdvisoryLimits;changedAt:string;canEdit:boolean }
export interface AdvisoryTransport {read():Promise<AdvisoryRules>;save(expectedRevision:number,limits:AdvisoryLimits):Promise<AdvisoryRules>}
export interface StockMaterial { id:string;name:string;densityGcm3:number|null;source:string|null;sourceNote:string;printed?:boolean;/** The colour a body takes when this material is assigned and no body colour overrides it (`#rrggbb`). Appearance only: it says nothing about the density, which is cited or absent. */color:string }
/** Only MatWeb reference grades. Unidentified shop stock has no guessed density. Every row carries a colour, because a colour is decoration and costs no citation; a density is a number and does. */
export const STOCK_MATERIALS:StockMaterial[]=[
	{id:'printed-pla',name:'3D print · PLA',densityGcm3:null,source:null,sourceNote:'Use the finished part mass.',printed:true,color:'#e0a33a'},
	{id:'printed-abs',name:'3D print · ABS',densityGcm3:null,source:null,sourceNote:'Use the finished part mass.',printed:true,color:'#c65a3f'},
	{id:'printed-hips',name:'3D print · HIPS',densityGcm3:null,source:null,sourceNote:'Use the finished part mass.',printed:true,color:'#e9e4d6'},
	{id:'printed-tpu',name:'3D print · TPU',densityGcm3:null,source:null,sourceNote:'Use the finished part mass.',printed:true,color:'#4d9bd3'},
	{id:'printed-other',name:'3D print · Other',densityGcm3:null,source:null,sourceNote:'Use the finished part mass.',printed:true,color:'#9a72c4'},
	{id:'aluminum-6061-t6',name:'6061-T6/T651 aluminum',densityGcm3:2.7,source:'https://www.matweb.com/search/datasheet.aspx?matguid=b8d536e0b9b54bd7b69e4124d8f1d20a',sourceNote:'MatWeb indexed table: AA typical, 2.70 g/cm³. Reference estimate; match the stock grade.',color:'#c7ccd1'},
	{id:'carbon-steel',name:'Carbon steel · Grade unknown',densityGcm3:null,source:null,sourceNote:'Identify the grade or enter a measured mass.',color:'#6b7075'},
	{id:'steel-1018',name:'AISI 1018 carbon steel',densityGcm3:7.87,source:'https://www.matweb.com/search/datasheet.aspx?matguid=3a9cc570fbb24d119f08db22a53e2421',sourceNote:'MatWeb indexed table: cold drawn AISI 1018, 7.87 g/cm³. Reference estimate.',color:'#7b8187'},
	{id:'stainless-unknown',name:'Stainless steel · Grade unknown',densityGcm3:null,source:null,sourceNote:'Identify the grade or enter a measured mass.',color:'#aeb5bb'},
	{id:'stainless-304',name:'304 stainless · Annealed bar',densityGcm3:8,source:'https://matweb.com/search/DataSheet.aspx?MatGUID=072da6c8d36c4c519a87c9b082c58cd3',sourceNote:'MatWeb indexed table: annealed 304 bar, 8.00 g/cm³. Reference estimate.',color:'#c2c9ce'},
	{id:'galvanized-unknown',name:'Galvanized steel · Grade unknown',densityGcm3:null,source:null,sourceNote:'Coating and steel grade are unspecified. Enter a measured mass.',color:'#9fa9b1'},
	{id:'steel-unknown',name:'Other steel · Grade unknown',densityGcm3:null,source:null,sourceNote:'Identify the grade or enter a measured mass.',color:'#747a80'},
	{id:'polycarbonate-unknown',name:'Polycarbonate · Grade unknown',densityGcm3:null,source:null,sourceNote:'Identify the sheet grade or enter a measured mass.',color:'#cfe1e8'},
	{id:'polycarbonate-et2613',name:'Makrolon ET2613 polycarbonate',densityGcm3:1.2,source:'https://www.matweb.com/search/DataSheet.aspx?MatGUID=1b0b3e2e5425444bba6c5da695fb3906',sourceNote:'MatWeb indexed table: solid sheet resin, ISO 1183-1, 1.20 g/cm³. Reference estimate.',color:'#d8e7ed'}
];
export function approvedDensitySource(url:string){try{const hostname=new URL(url).hostname.toLowerCase();return hostname==='matweb.com'||hostname.endsWith('.matweb.com')||hostname==='bambulab.com'||hostname.endsWith('.bambulab.com');}catch{return false;}}
/** The word a source link carries, for the two hosts `approvedDensitySource` admits. */
export function densitySourceName(url:string):'MatWeb'|'Bambu Lab'{try{return new URL(url).hostname.toLowerCase().includes('bambulab')?'Bambu Lab':'MatWeb';}catch{return 'MatWeb';}}
/** A density the modeler may multiply by: a number, AND a source on MatWeb or Bambu Lab. A number with no source, or with a source elsewhere, is unverified and is never used; a null density is simply absent. `bodyMass`, the body panel and the materials test all ask this one predicate. */
export function hasCitedDensity(material:Pick<StockMaterial,'densityGcm3'|'source'>):material is StockMaterial&{densityGcm3:number;source:string}{return material.densityGcm3!==null&&Number.isFinite(material.densityGcm3)&&material.source!==null&&approvedDensitySource(material.source);}
export function bodyMass(body:BodyProjection):{grams:number|null;estimated:boolean;distributed:boolean}{
	if(body.massG!==undefined&&body.massG!==null&&Number.isFinite(body.massG)&&body.massG>=0)return{grams:body.massG,estimated:body.massSource==='bambu-studio',distributed:false};
	const material=STOCK_MATERIALS.find(m=>m.id===body.materialId);
	if(!material||material.printed||!hasCitedDensity(material))return{grams:null,estimated:false,distributed:false};
	return{grams:body.volume*16.387064*material.densityGcm3,estimated:true,distributed:true};
}
export interface AdvisoryCheck { key:string;label:string;value:number|null;unit:string;min:number|null;max:number|null;status:'pass'|'fail'|'unknown';note?:string }
export function advisory(model:ModelProjection,limits:AdvisoryLimits){
	const masses=model.bodies.map(bodyMass),hasBody=model.bodies.length>0,known=hasBody&&masses.every(m=>m.grams!==null),mass=known?masses.reduce((n,m)=>n+m.grams!,0):null;
	const bodyParts=model.bodies.filter(b=>b.role!=='hex-core'),hex=model.bodies.filter(b=>b.role==='hex-core');
	const bodyTop=bodyParts.length?Math.max(...bodyParts.map(b=>b.bounds[5])):null;
	const height=bodyParts.length?bodyTop!-Math.min(...bodyParts.map(b=>b.bounds[2])):null;
	const extension=hex.length&&bodyTop!==null?Math.max(...hex.map(b=>b.bounds[5]))-bodyTop:null;
	// The projection is an approximation. A tolerance band around a rule boundary
	// remains unknown, so tessellation cannot falsely certify a near-limit part.
	let radius=0;for(const body of model.bodies)for(let i=0;i<body.mesh.positions.length;i+=3)radius=Math.max(radius,Math.hypot(body.mesh.positions[i],body.mesh.positions[i+1]));
	const diameter=hasBody?radius*2:null;
	const check=(key:string,label:string,value:number|null,unit:string,min:number|null,max:number|null,note?:string):AdvisoryCheck=>({key,label,value,unit,min,max,status:value===null?'unknown':min!==null&&value<min-1e-8||max!==null&&value>max+1e-8?'fail':'pass',note});
	const checks=[check('diameter','Diameter',diameter,'in',limits.minDiameterIn,limits.maxDiameterIn,'About the origin Z axis; includes all bodies.'),check('height','Body height',height,'in',limits.minHeightIn,limits.maxHeightIn,'Bottom tip to body top, excluding bodies marked Hex core.'),check('mass','Assembly mass',mass,'g',limits.minMassG,limits.maxMassG,masses.some(m=>m.estimated)?'Includes reference-density or slicer estimates.':'Measured part masses.'),check('hex','Hex extension',extension,'in',limits.minHexExtensionIn,limits.maxHexExtensionIn)];
	if(diameter!==null&&checks[0].status==='pass'&&[limits.minDiameterIn,limits.maxDiameterIn].some(limit=>limit!==null&&Math.abs(diameter-limit)<.004))checks[0].status='unknown';
	const distributionsKnown=known&&masses.every(m=>m.distributed);
	let center:[number,number,number]|null=null,inertia:number|null=null;
	if(distributionsKnown&&mass!>0){center=[0,0,0];inertia=0;model.bodies.forEach((body,i)=>{const g=masses[i].grams!;for(let d=0;d<3;d++)center![d]+=body.centerOfMass[d]*g/mass!;inertia!+=body.inertia[2]*g/body.volume+g*(body.centerOfMass[0]**2+body.centerOfMass[1]**2);});}
	return{checks,mass,estimated:masses.some(m=>m.estimated),center,inertia,radiusOfGyration:mass&&inertia!==null?Math.sqrt(inertia/mass):null,hardware:'Manual inspection'};
}
