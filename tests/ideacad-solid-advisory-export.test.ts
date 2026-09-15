import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {SolidEngine} from '../src/lib/ideacad/solid/engine';
import {PLANES} from '../src/lib/ideacad/solid/math';
import {DEFAULT_LIMITS,STOCK_MATERIALS,advisory,approvedDensitySource,bodyMass} from '../src/lib/ideacad/solid/advisory';
import {orbitCamera} from '../src/lib/ideacad/solid/camera';
import {profileDxf,sketchDxf,solidThreeMf,solidStl} from '../src/lib/ideacad/solid/export';
import {zip} from '../src/lib/ideacad/export/three-mf';
import type {Sketch} from '../src/lib/ideacad/solid/types';
import {evaluate} from '../src/lib/ideacad/blade/evaluate';
import {DEFAULT_BLADE_CONFIG,DEFAULT_BLADE_TREE} from '../src/lib/ideacad/blade/materials';
const source=readFileSync('static/ideacad/kernels/remus-9307e73.wasm');
const profile:Sketch={id:'box',name:'Box',plane:PLANES.XY,profile:{type:'polygon',points:[[0,0,0],[1,0,0],[1,1,0],[0,1,0]]}};
async function makeBox(e:SolidEngine){await e.apply({type:'sketch',sketch:profile});return e.apply({type:'extrude',sketchId:profile.id,distance:1,operation:'new'});}
describe('mass provenance and manufactured profiles',()=>{
	it('preserves legacy geometry without using old density or fill arithmetic in the website reader',()=>{
		const original=structuredClone(DEFAULT_BLADE_TREE),historic=evaluate(original,DEFAULT_BLADE_CONFIG),reader=evaluate(original,DEFAULT_BLADE_CONFIG,false);
		expect(Number.isFinite(historic.massG)).toBe(true);expect(Number.isFinite(reader.massG)).toBe(false);expect(Number.isFinite(reader.inertiaGcm2)).toBe(false);expect(Number.isFinite(reader.comHeightIn)).toBe(false);
		expect(reader.geometry).toEqual(historic.geometry);expect(original).toEqual(DEFAULT_BLADE_TREE);
	});
	it('never assigns bulk density to printed or unidentified material',async()=>{
		const e=await SolidEngine.create(source);try{let m=await makeBox(e),id=m.bodies[0].id;
			for(const material of STOCK_MATERIALS){m=await e.apply({type:'metadata',bodyId:id,materialId:material.id});const mass=bodyMass(m.bodies[0]);if(material.printed||material.densityGcm3===null)expect(mass.grams).toBeNull();else{expect(approvedDensitySource(material.source!)).toBe(true);expect(mass.grams).toBeCloseTo(16.387064*material.densityGcm3,8);}}
			m=await e.apply({type:'metadata',bodyId:id,materialId:'printed-hips',massG:25,massSource:'bambu-studio'});expect(advisory(m,{...DEFAULT_LIMITS,maxMassG:24}).checks[2].status).toBe('fail');expect(advisory(m,DEFAULT_LIMITS).center).toBeNull();
			m=await e.apply({type:'transform',bodyIds:[id],matrix:new THREE.Matrix4().makeTranslation(3,0,0).transpose().toArray()});expect(bodyMass(m.bodies[0]).grams).toBe(25);
			m=await e.apply({type:'transform',bodyIds:[id],matrix:new THREE.Matrix4().makeScale(2,2,2).toArray()});expect(m.bodies[0].volume).toBeCloseTo(8,8);expect(bodyMass(m.bodies[0]).grams).toBeNull();
		}finally{e.destroy();}
	});
	it('exports exact planar outline and analytic circular hole in millimetres',async()=>{
		const e=await SolidEngine.create(source);try{const m=await makeBox(e),id=m.bodies[0].id;await e.apply({type:'sketch',sketch:{id:'hole',name:'Hole',plane:PLANES.XY,profile:{type:'circle',center:[.5,.5,0],radius:.2}}});const cut=await e.apply({type:'extrude',sketchId:'hole',distance:2,operation:'cut',targetId:id}),face=cut.bodies[0].faces.find(f=>f.normal[2]>.9)!;
			const curves=e.planarProfile({bodyId:id,kind:'face',id:face.id});expect(curves.filter(c=>c.type==='line')).toHaveLength(4);expect(curves.filter(c=>c.type==='circle')).toHaveLength(1);expect(curves.find(c=>c.type==='circle')?.radius).toBeCloseTo(.2,8);
			const dxf=profileDxf(curves);expect(dxf).toContain('$INSUNITS\n70\n4');expect(dxf).toContain('CIRCLE\n100\nAcDbEntity');expect(solidThreeMf(cut,'Plate').length).toBeGreaterThan(1000);expect(new DataView(solidStl(cut).buffer).getUint32(80,true)).toBe(cut.bodies[0].mesh.indices.length/3);
		}finally{e.destroy();}
	});
	it('keeps a drawn arc analytic and packages large 3MF entries without an argument overflow',()=>{
		const dxf=sketchDxf({...profile,profile:{type:'wire',segments:[{type:'arc',start:[2.5,0,0],end:[-2.5,0,0],center:[0,0,0]},{type:'line',start:[-2.5,0,0],end:[2.5,0,0]}]}});expect(dxf).toContain('ARC\n100');expect(dxf).toContain('40\n63.5');expect(dxf).toContain('50\n0\n51\n180');
		const archive=zip([{name:'large.model',bytes:new Uint8Array(1024*1024)}]);expect(archive.length).toBeGreaterThan(1024*1024);expect(new DataView(archive.buffer).getUint32(18,true)).toBe(1024*1024);
	});
});
describe('SolidWorks orbit contract',()=>{
	it('upward drag shows the underside while the captured point stays on its screen pixel',()=>{
		const camera=new THREE.PerspectiveCamera(45,1,.01,1000);camera.up.set(0,0,1);camera.position.set(7,-9,7);const target=new THREE.Vector3(),pivot=new THREE.Vector3(1,-.5,1);camera.lookAt(target);camera.updateMatrixWorld();const before=pivot.clone().project(camera);orbitCamera(camera,target,pivot,0,-800,1440);expect(camera.position.z).toBeLessThan(pivot.z);expect(pivot.clone().project(camera).distanceTo(before)).toBeLessThan(1e-10);
	});
	it('preserves horizontal sign and fails the deliberately inverted vertical control',()=>{
		const camera=new THREE.PerspectiveCamera(),target=new THREE.Vector3(),pivot=new THREE.Vector3();camera.up.set(0,0,1);camera.position.set(7,-9,7);camera.lookAt(target);camera.updateMatrixWorld();const angle=Math.atan2(camera.position.y,camera.position.x);orbitCamera(camera,target,pivot,100,0,1440);expect(Math.atan2(camera.position.y,camera.position.x)).toBeLessThan(angle);const originalZ=camera.position.z;orbitCamera(camera,target,pivot,0,100,1440);expect(camera.position.z).toBeGreaterThan(originalZ);
	});
});
