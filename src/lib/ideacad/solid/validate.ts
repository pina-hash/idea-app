import {emptyManifest,type Sketch,type SolidManifest,type Vec3} from './types';
import {cross,dot,sub} from './math';

function check(value:unknown,message:string):asserts value {if(!value)throw Error(message);}
function object(value:unknown):asserts value is Record<string,any>{check(value!==null&&typeof value==='object'&&!Array.isArray(value),'The model contains an invalid record.');}
function name(value:unknown):value is string{return typeof value==='string'&&value.trim().length>0;}
function vector(value:unknown):asserts value is Vec3 {check(Array.isArray(value)&&value.length===3&&value.every(n=>typeof n==='number'&&Number.isFinite(n)),'Sketch coordinates must be three finite numbers.');}
const distance=(a:Vec3,b:Vec3)=>Math.hypot(...sub(a,b));
const tolerance=1e-7;

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

/** Validate external documents before replacing a live kernel or displaying them. */
export function validateManifest(value:unknown):asserts value is SolidManifest {
	object(value);
	check(value.format==='ideacad-solid-v1'&&value.kernel===emptyManifest().kernel,'This document needs its original geometry reader.');
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
	}
	for(const sketch of value.sketches){validateSketch(sketch);check(!ids.has(sketch.id),'Sketch and body IDs must be unique.');ids.add(sketch.id);}
}
