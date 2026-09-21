import {KERNEL_ID,type Feature,type Sketch,type SolidManifest,type LegacyManifest,type Vec3} from './types';
import {cross,dot,sub} from './math';
import { EXECUTORS } from './features/index';

function check(value:unknown,message:string):asserts value {if(!value)throw Error(message);}
function object(value:unknown):asserts value is Record<string,any>{check(value!==null&&typeof value==='object'&&!Array.isArray(value),'The model contains an invalid record.');}
function name(value:unknown):value is string{return typeof value==='string'&&value.trim().length>0;}
function vector(value:unknown):asserts value is Vec3 {check(Array.isArray(value)&&value.length===3&&value.every(n=>typeof n==='number'&&Number.isFinite(n)),'Sketch coordinates must be three finite numbers.');}
const distance=(a:Vec3,b:Vec3)=>Math.hypot(...sub(a,b));
const tolerance=1e-7;

/** The v1 sketch shape, still accepted so a saved v1 document opens. */
export function validateSketch(value:unknown):asserts value is Sketch {
	object(value);check(name(value.id)&&name(value.name),'A sketch needs a unique ID and name.');
	check(value.supportBodyId===undefined||name(value.supportBodyId),'The sketch support is invalid.');
	object(value.plane);const plane=value.plane;
	for(const key of ['origin','u','v','normal'])vector(plane[key]);
	check(['u','v','normal'].every(key=>Math.abs(dot(plane[key],plane[key])-1)<=tolerance)&&Math.abs(dot(plane.u,plane.v))<=tolerance&&sub(cross(plane.u,plane.v),plane.normal).every(n=>Math.abs(n)<=tolerance),'A sketch needs an orthonormal plane.');
	const point=(p:unknown)=>{vector(p);check(Math.abs(dot(sub(p,plane.origin),plane.normal))<=tolerance*Math.max(1,...p.map(Math.abs),...plane.origin.map(Math.abs)),'A sketch point is outside its plane.');};
	const profile=(shape:unknown)=>{
		object(shape);
		if(shape.type==='polygon'){
			check(Array.isArray(shape.points)&&shape.points.length>=3,'A polygon needs at least three points.');shape.points.forEach(point);
			check(shape.points.every((p:Vec3,i:number)=>distance(p,shape.points[(i+1)%shape.points.length])>1e-10),'A polygon has a zero-length edge.');
		}else if(shape.type==='circle'){
			point(shape.center);check(typeof shape.radius==='number'&&Number.isFinite(shape.radius)&&shape.radius>0,'A circle needs a finite positive radius.');
		}else if(shape.type==='wire'){
			check(Array.isArray(shape.segments)&&shape.segments.length>=2,'A closed wire needs at least two segments.');
			for(const segment of shape.segments){object(segment);check(segment.type==='line'||segment.type==='arc','The sketch has an unsupported curve.');point(segment.start);point(segment.end);
				if(segment.type==='arc'){point(segment.center);const radius=distance(segment.start,segment.center),endRadius=distance(segment.end,segment.center);check(radius>0&&Math.abs(radius-endRadius)<=tolerance*Math.max(1,radius,endRadius),'An arc has inconsistent radii.');}
				else check(distance(segment.start,segment.end)>1e-10,'A line needs two different points.');
			}
			check(shape.segments.every((s:any,i:number)=>distance(s.end,shape.segments[(i+1)%shape.segments.length].start)<=tolerance),'A sketch wire must be closed.');
		}else throw Error('The sketch has an unsupported profile.');
	};
	profile(value.profile);
	check(value.holes===undefined||Array.isArray(value.holes),'Sketch holes must be an array.');
	value.holes?.forEach(profile);
}

const ENTITY_TYPES=['point','line','circle','arc'];
const CONSTRAINT_TYPES=['coincident','distance','pointLineDistance','horizontal','vertical','angle','parallel','perpendicular','equalLength','circleRadius','arcRadius','equalRadius','pointOnCircle','pointOnArc','tangentLineArc','tangentArcArc','concentric','midpoint','symmetric','fixX','fixY'];
const finiteNumber=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
/** A feature's shape, as far as the list can tell without a kernel. What it MEANS is the executor's to refuse, on the tree, at replay. */
export function validateFeature(value:unknown,ids:Set<string>):asserts value is Feature {
	object(value);
	check(name(value.id)&&!ids.has(value.id),'Features need unique IDs.');ids.add(value.id);
	check(name(value.name)&&value.name.length<=60,'A feature needs a name of 1 to 60 characters.');
	check(typeof value.type==='string'&&Object.hasOwn(EXECUTORS,value.type),`This document uses a feature (${String(value.type)}) this version of IdeaCAD does not know.`);
	check(value.suppressed===undefined||typeof value.suppressed==='boolean','A feature is either suppressed or not.');
	if(value.type==='sketch'){
		check(Array.isArray(value.entities)&&Array.isArray(value.constraints)&&value.plane&&typeof value.plane==='object','A sketch feature needs a plane, entities and constraints.');
		const entityIds=new Set<string>();
		for(const e of value.entities){object(e);check(name(e.id)&&!entityIds.has(e.id)&&ENTITY_TYPES.includes(e.type),'A sketch entity needs a unique ID and a known type.');entityIds.add(e.id);
			if(e.type==='point')check(finiteNumber(e.x)&&finiteNumber(e.y),'Sketch coordinates must be finite numbers.');
			else if(e.type==='circle')check(name(e.center)&&finiteNumber(e.radius)&&e.radius>0,'A circle needs a center and a positive radius.');
			else if(e.type==='line')check(name(e.a)&&name(e.b),'A line needs two points.');
			else check(name(e.center)&&name(e.start)&&name(e.end),'An arc needs a center, a start and an end.');
		}
		for(const c of value.constraints){object(c);check(name(c.id)&&CONSTRAINT_TYPES.includes(c.type),'A sketch constraint needs an ID and a known type.');if('value' in c)check(finiteNumber(c.value),'A dimension must be a finite number.');}
	}
	if(value.type==='body')check(typeof value.artifact==='string'&&/^[0-9a-f]{64}$/.test(value.artifact)&&name(value.bodyId),'A saved body needs its artifact and its body ID.');
}

/** Validate external documents before replacing a live kernel or displaying them. Accepts v1 and v2. */
export function validateManifest(value:unknown):asserts value is SolidManifest|LegacyManifest {
	object(value);
	check((value.format==='ideacad-solid-v1'||value.format==='ideacad-solid-v2')&&value.kernel===KERNEL_ID,'This document needs its original geometry reader.');
	check(value.units==='in','This model uses unsupported units.');
	check(name(value.title)&&value.title.trim().length<=120,'Use a document name between 1 and 120 characters.');
	check(Array.isArray(value.bodies)&&Array.isArray(value.sketches),'The model needs body and sketch lists.');
	object(value.addons);check(typeof value.addons.ideaBlade==='boolean','The add-on settings are invalid.');
	const ids=new Set<string>();
	for(const body of value.bodies){object(body);
		check(name(body.id)&&name(body.name)&&!ids.has(body.id),'Bodies need unique IDs and names.');ids.add(body.id);
		check(typeof body.artifact==='string'&&/^[0-9a-f]{64}$/.test(body.artifact),'A body needs its BREP artifact.');
		check(body.materialId===null||typeof body.materialId==='string','A body material is invalid.');
		check(['part','hex-core','collar','spin-bolt','blade'].includes(body.role),'The body role is invalid.');
		check(body.topologyEpoch===undefined||typeof body.topologyEpoch==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.topologyEpoch),'A body has an invalid topology identity.');
		check(body.massSource===undefined||['measured','bambu-studio'].includes(body.massSource),'Choose a scale measurement or Bambu Studio estimate.');
		if(body.massG!==undefined&&body.massG!==null)check(typeof body.massG==='number'&&Number.isFinite(body.massG)&&body.massG>=0&&body.massSource!==undefined,'Part mass needs a finite nonnegative value and its source.');
		check(body.color===undefined||body.color===null||typeof body.color==='string'&&/^#[0-9a-f]{6}$/.test(body.color),'A body colour must be a six-digit hex colour.');
		check(body.fixed===undefined||typeof body.fixed==='boolean','A body is either fixed or not.');
	}
	for(const sketch of value.sketches){validateSketch(sketch);check(!ids.has(sketch.id),'Sketch and body IDs must be unique.');ids.add(sketch.id);}
	if(value.format==='ideacad-solid-v2'){
		check(Array.isArray(value.features),'A version 2 document needs its feature list.');
		const featureIds=new Set<string>();
		for(const feature of value.features)validateFeature(feature,featureIds);
	}
}
