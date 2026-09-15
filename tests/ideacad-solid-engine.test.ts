import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { SolidEngine } from '../src/lib/ideacad/solid/engine';
import { PLANES } from '../src/lib/ideacad/solid/math';
import type { ModelProjection, Selection, Sketch, Vec3 } from '../src/lib/ideacad/solid/types';
const engines:SolidEngine[]=[];
async function engine(){const e=await SolidEngine.create(new Uint8Array(readFileSync('static/ideacad/kernels/remus-9307e73.wasm')));engines.push(e);return e;}
afterEach(()=>{for(const e of engines)e.destroy();engines.length=0;});
const rectangle=(id='profile',points:Vec3[]=[[0,0,0],[4,0,0],[4,3,0],[0,3,0]]):Sketch=>({id,name:'Sketch',plane:{...PLANES.XY,origin:points[0]},profile:{type:'polygon',points}});
async function box(e:SolidEngine){await e.apply({type:'sketch',sketch:rectangle()});return e.apply({type:'extrude',sketchId:'profile',distance:1,operation:'new'});}
function top(model:ModelProjection):Selection{const body=model.bodies[0],face=body.faces.find(f=>f.kind==='plane'&&f.normal[2]>.99)!;return{bodyId:body.id,kind:'face',id:face.id};}
function connectedTriangles(model:ModelProjection){
	const mesh=model.bodies[0].mesh,vertex=new Map<string,number>(),ids:number[]=[];
	for(let i=0;i<mesh.positions.length;i+=3){const key=[...mesh.positions.slice(i,i+3)].map(n=>Math.round(n*1e6)).join(',');if(!vertex.has(key))vertex.set(key,vertex.size);ids.push(vertex.get(key)!);}
	const owners=new Map<string,number[]>(),neighbors=new Map<number,Set<number>>();
	for(let i=0;i<mesh.indices.length;i+=3){const t=i/3;neighbors.set(t,new Set());for(let j=0;j<3;j++){const edge=[ids[mesh.indices[i+j]],ids[mesh.indices[i+(j+1)%3]]].sort((a,b)=>a-b).join(':');owners.set(edge,[...(owners.get(edge)??[]),t]);}}
	for(const pair of owners.values()){expect(pair).toHaveLength(2);neighbors.get(pair[0])!.add(pair[1]);neighbors.get(pair[1])!.add(pair[0]);}
	const seen=new Set<number>(),todo=[0];while(todo.length){const t=todo.pop()!;if(seen.has(t))continue;seen.add(t);todo.push(...neighbors.get(t)!);}
	expect(seen.size).toBe(mesh.indices.length/3);
}
describe('direct exact solids',()=>{
	it('releases completed and superseded gesture checkpoints',async()=>{
		const e=await engine();await box(e);const checkpoints=()=>((e as unknown as {k:{checkpointCount():number}}).k.checkpointCount());
		await e.begin();expect(checkpoints()).toBe(1);await e.begin();expect(checkpoints()).toBe(1);await e.cancel();expect(checkpoints()).toBe(0);
		for(let i=0;i<12;i++){await e.begin();if(i%2)await e.update({type:'push',selection:top(e.project()),value:.1});await e.commit();expect(checkpoints()).toBe(0);}
		expect(e.project().bodies[0].volume).toBeCloseTo(19.2,8);
	});
	it('refuses malformed imports before replacing geometry, history, units or artifact bytes',async()=>{
		const e=await engine();await box(e);const saved=await e.snapshot();
		for(const change of [{sketches:[{}]},{units:'mm'},{sketches:[rectangle('dup'),rectangle('dup')]},{bodies:[{...saved.manifest.bodies[0],massG:10,massSource:null}]}]){
			await expect(e.load({...saved,manifest:{...saved.manifest,...change} as any})).rejects.toBeDefined();expect((await e.snapshot()).manifest).toEqual(saved.manifest);
		}
		const corrupt=structuredClone(saved);corrupt.artifacts[0].bytes[0]^=255;
		await expect(e.load(corrupt)).rejects.toThrow('integrity');expect((await e.snapshot()).artifacts[0].bytes).toEqual(saved.artifacts[0].bytes);
		expect((await e.undo()).sketches).toHaveLength(1);expect((await e.redo()).bodies[0].volume).toBeCloseTo(12,8);
	});
	it('round-trips closed arcs and profiles with holes, and rejects an open wire',async()=>{
		const e=await engine(),arc:Sketch={id:'arc',name:'Arc',plane:PLANES.XY,profile:{type:'wire',segments:[{type:'arc',start:[2,0,0],end:[-2,0,0],center:[0,0,0]},{type:'line',start:[-2,0,0],end:[2,0,0]}]}};
		await e.apply({type:'sketch',sketch:arc});const saved=await e.snapshot();expect((await e.load(saved)).sketches).toEqual([arc]);
		const open=structuredClone(saved);(open.manifest.sketches[0].profile as any).segments[1].end=[1,0,0];await expect(e.load(open)).rejects.toThrow('closed');
		expect((await e.apply({type:'extrude',sketchId:'arc',distance:1,operation:'new'})).bodies[0].volume).toBeCloseTo(2*Math.PI,8);
	});
	it('opens empty, extrudes a sketch, and has total grouped undo',async()=>{
		const e=await engine();expect(e.project().bodies).toEqual([]);expect(e.project().addons.ideaBlade).toBe(false);
		const model=await box(e);expect(model.bodies[0].volume).toBeCloseTo(12,10);connectedTriangles(model);
		const undone=await e.undo();expect(undone.bodies).toHaveLength(0);expect(undone.sketches).toHaveLength(1);
		expect((await e.redo()).bodies[0].volume).toBeCloseTo(12,10);
	});
	it('subtracts an analytic hole; direct push has no artificial 40-inch clamp',async()=>{
		const e=await engine(),base=await box(e),body=base.bodies[0];
		await e.apply({type:'sketch',sketch:{id:'hole',name:'Hole',plane:{...PLANES.XY,origin:[0,0,1]},profile:{type:'circle',center:[2,1.5,1],radius:.5}}});
		const cut=await e.apply({type:'extrude',sketchId:'hole',distance:-2,operation:'cut',targetId:body.id});
		expect(cut.bodies[0].volume).toBeCloseTo(12-Math.PI/4,9);connectedTriangles(cut);
		const selection=top(cut),pushed=await e.apply({type:'push',selection,value:40});
		expect(pushed.bodies[0].volume).toBeCloseTo((12-Math.PI/4)*41,8);expect(pushed.bodies[0].faces.some(f=>f.id===selection.id)).toBe(true);
		const reload=await engine();const restored=await reload.load(await e.snapshot());expect(restored.bodies[0].faces.some(f=>f.id===selection.id)).toBe(true);expect(restored.bodies[0].volume).toBeCloseTo(pushed.bodies[0].volume,8);
	});
	it('a failed drag is transactional and a whole gesture is one undo step',async()=>{
		const e=await engine(),initial=await box(e),selection=top(initial);await e.begin();
		await e.update({type:'push',selection,value:1});await e.update({type:'push',selection,value:2});await e.commit();
		expect(e.project().bodies[0].volume).toBeCloseTo(36,8);expect((await e.undo()).bodies[0].volume).toBeCloseTo(12,8);
		await expect(e.apply({type:'push',selection,value:-10})).rejects.toBeDefined();expect(e.project().bodies[0].volume).toBeCloseTo(12,8);
	});
	it('models a non-blade bracket with an exact hole and concave fillet',async()=>{
		const e=await engine();await e.apply({type:'sketch',sketch:rectangle('bracket',[[0,0,0],[4,0,0],[4,.4,0],[.4,.4,0],[.4,3,0],[0,3,0]])});
		const bracket=await e.apply({type:'extrude',sketchId:'bracket',distance:2,operation:'new'}),body=bracket.bodies[0];
		await e.apply({type:'sketch',sketch:{id:'hole',name:'Hole',plane:PLANES.XY,profile:{type:'circle',center:[2,.2,0],radius:.15}}});
		const drilled=await e.apply({type:'extrude',sketchId:'hole',distance:3,operation:'cut',targetId:body.id});
		const edge=drilled.bodies[0].edges.find(e=>e.curve==='LINE'&&Math.abs(e.points[0]-.4)<1e-6&&Math.abs(e.points[1]-.4)<1e-6&&Math.abs(e.points[3]-.4)<1e-6&&Math.abs(e.points[4]-.4)<1e-6)!;
		expect(edge).toBeDefined();const result=await e.apply({type:'fillet',selection:{bodyId:body.id,kind:'edge',id:edge.id},value:.1});
		expect(result.bodies[0].volume).toBeCloseTo((2.64-Math.PI*.15**2)*2+(1-Math.PI/4)*.1**2*2,8);connectedTriangles(result);
	});
	it('keeps planar shading normals flat at the cylindrical hole',async()=>{
		const e=await engine();const sketch=rectangle();sketch.holes=[{type:'circle',center:[2,1.5,0],radius:.5}];
		await e.apply({type:'sketch',sketch});const result=await e.apply({type:'extrude',sketchId:sketch.id,distance:1,operation:'new'});
		expect(result.bodies[0].volume).toBeCloseTo(12-Math.PI/4,9);
		for(const face of result.bodies[0].faces.filter(f=>f.kind==='plane'))for(let i=0;i<face.normals.length;i+=3)expect(face.normals[i]*face.normal[0]+face.normals[i+1]*face.normal[1]+face.normals[i+2]*face.normal[2]).toBeCloseTo(1,6);
	});
	it('moves a straight edge by rebuilding its adjacent support planes',async()=>{
		const e=await engine(),initial=await box(e),body=initial.bodies[0];
		const edge=body.edges.find(e=>e.curve==='LINE'&&Math.abs(e.points[0]-4)<1e-7&&Math.abs(e.points[2]-1)<1e-7&&Math.abs(e.points[3]-4)<1e-7&&Math.abs(e.points[5]-1)<1e-7)!;
		expect(edge).toBeDefined();const moved=await e.apply({type:'move-selection',selection:{bodyId:body.id,kind:'edge',id:edge.id},delta:[.5,0,.5]});
		expect(moved.bodies[0].volume).toBeCloseTo(15.75,8);expect(moved.bodies[0].edges.some(e=>e.id===edge.id)).toBe(true);connectedTriangles(moved);
	});
	it('never gives split faces the same selectable identity',async()=>{
		const e=await engine(),initial=await box(e),selection=top(initial),body=initial.bodies[0];
		await e.apply({type:'sketch',sketch:rectangle('slot',[[1.5,-1,.5],[2.5,-1,.5],[2.5,4,.5],[1.5,4,.5]])});
		const split=await e.apply({type:'extrude',sketchId:'slot',distance:1,operation:'cut',targetId:body.id});
		const ids=split.bodies[0].faces.map(f=>f.id);expect(new Set(ids).size).toBe(ids.length);expect(ids).not.toContain(selection.id);
		const tops=split.bodies[0].faces.filter(f=>f.kind==='plane'&&f.normal[2]>.99&&f.center[2]>.99);expect(tops).toHaveLength(2);expect(tops[0].id).not.toBe(tops[1].id);
	});
});
