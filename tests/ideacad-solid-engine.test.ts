// tests/ideacad-solid-engine.test.ts
//
// The kernel-facing guarantees the 2026-09-15 modeler proved, re-stated over
// the feature list: an exact hole, no artificial clamp on a push, a
// transactional failed drag, a bracket with a concave fillet, flat shading
// normals at a hole, an edge moved by rebuilding its planes, split faces that
// never share an identity, and a refused import that replaces nothing.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { SolidEngine } from '../src/lib/ideacad/solid/engine';
import { refFromSelection } from '../src/lib/ideacad/solid/naming';
import type { Feature, FeatureOf, ModelProjection, Selection, Vec3 } from '../src/lib/ideacad/solid/types';
const engines:SolidEngine[]=[];
async function engine(){const e=await SolidEngine.create(new Uint8Array(readFileSync('static/ideacad/kernels/remus-9307e73.wasm')));engines.push(e);return e;}
afterEach(()=>{for(const e of engines)e.destroy();engines.length=0;});
function outline(id:string,points:[number,number][],plane:FeatureOf<'sketch'>['plane']={kind:'datum',datum:'XY'}):FeatureOf<'sketch'>{
	const pts=points.map((p,i)=>({id:`p${i}`,type:'point' as const,x:p[0],y:p[1]})),lines=points.map((_,i)=>({id:`l${i}`,type:'line' as const,a:`p${i}`,b:`p${(i+1)%points.length}`}));
	return {id,name:id,type:'sketch',plane,entities:[...pts,...lines],constraints:[]};
}
const circle=(id:string,c:[number,number],r:number,plane:FeatureOf<'sketch'>['plane']):FeatureOf<'sketch'>=>({id,name:id,type:'sketch',plane,entities:[{id:'c',type:'point',x:c[0],y:c[1]},{id:'k',type:'circle',center:'c',radius:r}],constraints:[]});
const add=(e:SolidEngine,feature:Feature)=>e.apply({type:'add-feature',feature});
async function box(e:SolidEngine){await add(e,outline('profile',[[0,0],[4,0],[4,3],[0,3]]));return add(e,{id:'box',name:'Box',type:'extrude',sketch:'profile',distance:1,operation:'new'});}
function top(model:ModelProjection):Selection{const body=model.bodies[0],face=body.faces.find(f=>f.kind==='plane'&&f.normal[2]>.99)!;return{bodyId:body.id,kind:'face',id:face.id};}
const faceRef=(model:ModelProjection,selection:Selection)=>refFromSelection(selection,model.bodies.find(b=>b.id===selection.bodyId)!) as never;
function connectedTriangles(model:ModelProjection){
	const mesh=model.bodies[0].mesh,vertex=new Map<string,number>(),ids:number[]=[];
	for(let i=0;i<mesh.positions.length;i+=3){const key=[...mesh.positions.slice(i,i+3)].map(n=>Math.round(n*1e6)).join(',');if(!vertex.has(key))vertex.set(key,vertex.size);ids.push(vertex.get(key)!);}
	const owners=new Map<string,number[]>(),neighbors=new Map<number,Set<number>>();
	for(let i=0;i<mesh.indices.length;i+=3){const t=i/3;neighbors.set(t,new Set());for(let j=0;j<3;j++){const edge=[ids[mesh.indices[i+j]],ids[mesh.indices[i+(j+1)%3]]].sort((a,b)=>a-b).join(':');owners.set(edge,[...(owners.get(edge)??[]),t]);}}
	for(const pair of owners.values()){expect(pair).toHaveLength(2);neighbors.get(pair[0])!.add(pair[1]);neighbors.get(pair[1])!.add(pair[0]);}
	const seen=new Set<number>(),todo=[0];while(todo.length){const t=todo.pop()!;if(seen.has(t))continue;seen.add(t);todo.push(...neighbors.get(t)!);}
	expect(seen.size).toBe(mesh.indices.length/3);
}
describe('direct exact solids over the feature list',()=>{
	it('refuses malformed imports before replacing geometry, history, units or artifact bytes',async()=>{
		const e=await engine();await box(e);const saved=await e.snapshot();
		for(const change of [{sketches:[{}]},{units:'mm'},{features:[{id:'x',name:'x',type:'nope'}]},{bodies:[{...saved.manifest.bodies[0],massG:10,massSource:null}]},{features:[saved.manifest.features[0],saved.manifest.features[0]]}]){
			await expect(e.load({...saved,manifest:{...saved.manifest,...change} as never})).rejects.toBeDefined();expect((await e.snapshot()).manifest).toEqual(saved.manifest);
		}
		const corrupt=structuredClone(saved);corrupt.artifacts[0].bytes[0]^=255;
		await expect(e.load(corrupt)).rejects.toThrow('integrity');expect((await e.snapshot()).artifacts[0].bytes).toEqual(saved.artifacts[0].bytes);
		expect((await e.undo()).bodies).toHaveLength(0);expect((await e.redo()).bodies[0].volume).toBeCloseTo(12,8);
	});
	it('round-trips an arc-and-chord profile, and refuses an open outline',async()=>{
		const e=await engine();
		const arc:FeatureOf<'sketch'>={id:'arc',name:'Arc',type:'sketch',plane:{kind:'datum',datum:'XY'},entities:[{id:'c',type:'point',x:0,y:0},{id:'s',type:'point',x:2,y:0},{id:'t',type:'point',x:-2,y:0},{id:'a',type:'arc',center:'c',start:'s',end:'t'},{id:'l',type:'line',a:'t',b:'s'}],constraints:[]};
		await add(e,arc);const saved=await e.snapshot();expect((await e.load(saved)).sketches[0].regions).toHaveLength(1);
		expect((await add(e,{id:'x',name:'x',type:'extrude',sketch:'arc',distance:1,operation:'new'})).bodies[0].volume).toBeCloseTo(2*Math.PI,8);
		const open=await engine();await add(open,{...arc,id:'open',entities:arc.entities.filter(en=>en.id!=='l')});
		await expect(add(open,{id:'x',name:'x',type:'extrude',sketch:'open',distance:1,operation:'new'})).rejects.toThrow(/closed/);
	});
	it('opens empty, extrudes a sketch, and has total grouped undo',async()=>{
		const e=await engine();expect(e.project().bodies).toEqual([]);expect(e.project().addons.ideaBlade).toBe(false);
		const model=await box(e);expect(model.bodies[0].volume).toBeCloseTo(12,10);connectedTriangles(model);
		const undone=await e.undo();expect(undone.bodies).toHaveLength(0);expect(undone.sketches).toHaveLength(1);expect(undone.sketches[0].consumed).toBe(false);
		expect((await e.redo()).bodies[0].volume).toBeCloseTo(12,10);
	});
	it('subtracts an analytic hole; direct push has no artificial 40-inch clamp',async()=>{
		const e=await engine(),base=await box(e),body=base.bodies[0];
		await add(e,circle('hole',[2,1.5],.5,{kind:'face',face:faceRef(base,top(base))}));
		const cut=await add(e,{id:'cut',name:'Cut',type:'extrude',sketch:'hole',distance:-2,operation:'cut',target:body.id});
		expect(cut.bodies[0].volume).toBeCloseTo(12-Math.PI/4,9);connectedTriangles(cut);
		const selection=top(cut),pushed=await add(e,{id:'push',name:'Push',type:'push',face:faceRef(cut,selection),value:40});
		expect(pushed.bodies[0].volume).toBeCloseTo((12-Math.PI/4)*41,8);expect(pushed.bodies[0].faces.some(f=>f.id===selection.id)).toBe(true);
		const reload=await engine();const restored=await reload.load(await e.snapshot());expect(restored.bodies[0].faces.some(f=>f.id===selection.id)).toBe(true);expect(restored.bodies[0].volume).toBeCloseTo(pushed.bodies[0].volume,8);
	});
	it('a failed drag is transactional and a whole gesture is one undo step',async()=>{
		const e=await engine(),initial=await box(e),selection=top(initial),face=faceRef(initial,selection);await e.begin();
		await e.update({type:'add-feature',feature:{id:'g',name:'Push',type:'push',face,value:1}});await e.update({type:'add-feature',feature:{id:'g',name:'Push',type:'push',face,value:2}});await e.commit();
		expect(e.project().bodies[0].volume).toBeCloseTo(36,8);expect((await e.undo()).bodies[0].volume).toBeCloseTo(12,8);
		await expect(add(e,{id:'bad',name:'Push',type:'push',face,value:-10})).rejects.toBeDefined();expect(e.project().bodies[0].volume).toBeCloseTo(12,8);
		expect(e.project().features.map(f=>f.id)).not.toContain('bad');
	});
	it('models a non-blade bracket with an exact hole and concave fillet',async()=>{
		const e=await engine();await add(e,outline('bracket',[[0,0],[4,0],[4,.4],[.4,.4],[.4,3],[0,3]]));
		const bracket=await add(e,{id:'b',name:'Bracket',type:'extrude',sketch:'bracket',distance:2,operation:'new'}),body=bracket.bodies[0];
		await add(e,circle('hole',[2,.2],.15,{kind:'datum',datum:'XY'}));
		const drilled=await add(e,{id:'h',name:'Hole',type:'extrude',sketch:'hole',distance:3,operation:'cut',target:body.id});
		const edge=drilled.bodies[0].edges.find(ed=>ed.curve==='LINE'&&Math.abs(ed.points[0]-.4)<1e-6&&Math.abs(ed.points[1]-.4)<1e-6&&Math.abs(ed.points[3]-.4)<1e-6&&Math.abs(ed.points[4]-.4)<1e-6)!;
		expect(edge).toBeDefined();expect(edge.faces.sort()).toEqual(['b.side.2','b.side.3']);
		const result=await add(e,{id:'f',name:'Fillet',type:'fillet',edges:[refFromSelection({bodyId:body.id,kind:'edge',id:edge.id},drilled.bodies[0]) as never],radius:.1});
		expect(result.bodies[0].volume).toBeCloseTo((2.64-Math.PI*.15**2)*2+(1-Math.PI/4)*.1**2*2,8);connectedTriangles(result);
		expect(result.bodies[0].faces.map(f=>f.id)).toContain('f.blend.b.side.2|b.side.3');
	});
	it('keeps planar shading normals flat at the cylindrical hole',async()=>{
		const e=await engine();const sketch=outline('holed',[[0,0],[4,0],[4,3],[0,3]]);sketch.entities.push({id:'c',type:'point',x:2,y:1.5},{id:'k',type:'circle',center:'c',radius:.5});
		await add(e,sketch);const result=await add(e,{id:'x',name:'x',type:'extrude',sketch:'holed',distance:1,operation:'new'});
		expect(result.bodies[0].volume).toBeCloseTo(12-Math.PI/4,9);
		expect(result.bodies[0].faces.map(f=>f.id)).toContain('x.hole.0.0');
		for(const face of result.bodies[0].faces.filter(f=>f.kind==='plane'))for(let i=0;i<face.normals.length;i+=3)expect(face.normals[i]*face.normal[0]+face.normals[i+1]*face.normal[1]+face.normals[i+2]*face.normal[2]).toBeCloseTo(1,6);
	});
	it('moves a straight edge by rebuilding its adjacent support planes',async()=>{
		const e=await engine(),initial=await box(e),body=initial.bodies[0];
		const edge=body.edges.find(ed=>ed.curve==='LINE'&&Math.abs(ed.points[0]-4)<1e-7&&Math.abs(ed.points[2]-1)<1e-7&&Math.abs(ed.points[3]-4)<1e-7&&Math.abs(ed.points[5]-1)<1e-7)!;
		expect(edge).toBeDefined();const moved=await add(e,{id:'m',name:'Move edge',type:'move-selection',entity:refFromSelection({bodyId:body.id,kind:'edge',id:edge.id},body) as never,delta:[.5,0,.5] as Vec3});
		expect(moved.bodies[0].volume).toBeCloseTo(15.75,8);expect(moved.bodies[0].edges.some(ed=>ed.id===edge.id)).toBe(true);connectedTriangles(moved);
	});
	it('never gives split faces the same selectable identity, and names the pieces by ordinal',async()=>{
		const e=await engine(),initial=await box(e),selection=top(initial),body=initial.bodies[0];
		await add(e,outline('slot',[[1.5,-1],[2.5,-1],[2.5,4],[1.5,4]],{kind:'datum',datum:'XY',offset:.5}));
		const split=await add(e,{id:'s',name:'Slot',type:'extrude',sketch:'slot',distance:1,operation:'cut',target:body.id});
		const ids=split.bodies[0].faces.map(f=>f.id);expect(new Set(ids).size).toBe(ids.length);expect(ids).not.toContain(selection.id);
		const tops=split.bodies[0].faces.filter(f=>f.kind==='plane'&&f.normal[2]>.99&&f.center[2]>.99);expect(tops).toHaveLength(2);expect(tops.map(t=>t.id).sort()).toEqual(['box.end~0','box.end~1']);
	});
});
