import { createKernel, type BrepKernel } from '../kernel/remus';
import {validateManifest,validateSketch} from './validate';
import { cross, dot, orientedPolygon, scale, sub, unit, vector } from './math';
import { emptyManifest, type BodyProjection, type BodyRecord, type GeometryArtifact, type ModelProjection, type ModelSnapshot, type Selection, type Sketch, type SolidCommand, type SolidManifest, type Vec3 } from './types';

const json = <T = Record<string, any>>(input: unknown): T => (typeof input === 'string' ? JSON.parse(input) : input) as T;
const clone = <T>(value: T): T => structuredClone(value);
const uuid = () => crypto.randomUUID();
const finite = (n: number) => { if (!Number.isFinite(n)) throw Error('Enter a finite value.'); return n; };
const positive = (n: number) => { finite(n); if (n <= 0) throw Error('Use a value greater than zero.'); return n; };
interface LiveBody { record: BodyRecord; solid: number }
interface Pick { body: LiveBody; handle: number; kind: Selection['kind'] }
interface Step { before: SolidManifest; after: SolidManifest }

/** Exact geometry and its projections. The document contains no feature replay tree. */
export class SolidEngine {
	private bodies: LiveBody[] = [];
	private sketches: Sketch[] = [];
	private addons = { ideaBlade: false };
	private title = 'Untitled document';
	private artifacts = new Map<string, Uint8Array>();
	private picks = new Map<string, Pick>();
	private generation = uuid();
	private undoSteps: Step[] = [];
	private redoSteps: Step[] = [];
	private preview: { checkpoint: number; bodies: LiveBody[]; before: SolidManifest; command?: SolidCommand } | null = null;
	private constructor(private k: BrepKernel) {}
	static async create(source?: string | Uint8Array) { return new SolidEngine(await createKernel(source)); }
	destroy() { this.k.free(); }
	private key(pick: Selection) { return `${pick.bodyId}/${pick.kind}/${pick.id}`; }
	private pick(selection: Selection): Pick {
		const result = this.picks.get(this.key(selection));
		if (!result) throw Error('That selection changed. Select it again.');
		return result;
	}
	private body(id: string) { const body=this.bodies.find(b=>b.record.id===id); if(!body)throw Error('Select a body.'); return body; }
	private markFaces(solid: number, fresh=false) {
		const faces=[...this.k.getSolidFaces(solid)],counts=new Map<string,number>();
		for(const face of faces){const name=this.k.getFaceName(face);if(name)counts.set(name,(counts.get(name)??0)+1);}
		let changed=false;
		for(const face of faces){const name=this.k.getFaceName(face);if(fresh||!name||counts.get(name)!>1){this.k.setFaceName(face,uuid());changed=true;}}
		return changed;
	}
	private journal(result: string): number {
		const operation=json(result);
		if(operation.isPartial || operation.failedEdges?.length)throw Error('This blend could not be completed. Use a smaller size or another edge.');
		this.k.propagateAttributesForOp(operation.op,false);
		this.markFaces(operation.solid);
		return operation.solid;
	}
	private replace(body: LiveBody, solid: number, preserveIncidence=false) { body.solid=solid; body.record.artifact='';body.record.massG=null;if(!preserveIncidence)body.record.topologyEpoch=uuid();this.markFaces(solid); }
	private add(solid: number, name='Body', source?: BodyRecord) {
		this.markFaces(solid,true);
		const body={solid,record:{id:uuid(),name:`${name} ${this.bodies.length+1}`,artifact:'',materialId:source?.materialId??null,role:source?.role??'part',...(source?.massG!=null?{massG:source.massG,massSource:source.massSource}:{})} satisfies BodyRecord};
		this.bodies.push(body); return body;
	}
	private profile(sketch: Sketch, profile=sketch.profile, hole=false): number {
		const k=this.k,n=scale(sketch.plane.normal,hole?-1:1);
		if(profile.type==='circle'){
			positive(profile.radius);const c=profile.center;
			return k.makeWire(new Uint32Array([k.makeCircleEdge(...c,...n,profile.radius)]),true);
		}
		if(profile.type==='polygon'){
			if(profile.points.length<3)throw Error('Close a shape with at least three corners.');
			return k.makePolygonWire(new Float64Array(orientedPolygon(profile.points,sketch.plane.normal,hole).flat()));
		}
		const edges=profile.segments.map(segment=>segment.type==='line'
			? k.makeLineEdge(...segment.start,...segment.end)
			: k.makeCircleArc3d(...segment.start,...segment.end,...segment.center,...n));
		return k.makeWire(new Uint32Array(edges),true);
	}
	private face(sketch: Sketch) {
		const outer=this.profile(sketch),holes=(sketch.holes??[]).map(profile=>this.profile(sketch,profile,true));
		return holes.length?this.k.makeFaceFromWires(outer,new Uint32Array(holes)):this.k.makePlanarFaceFromWire(outer);
	}
	private sketch(id: string) { const s=this.sketches.find(s=>s.id===id);if(!s)throw Error('Select a closed sketch.');return s; }
	private execute(command: SolidCommand) {
		const k=this.k;
		switch(command.type){
			case 'sketch': validateSketch(command.sketch);if(this.sketches.some(s=>s.id===command.sketch.id)||this.bodies.some(b=>b.record.id===command.sketch.id))throw Error('A sketch with this ID already exists.');this.face(command.sketch); this.sketches.push(clone(command.sketch)); break;
			case 'extrude': {
				const s=this.sketch(command.sketchId),distance=finite(command.distance);if(Math.abs(distance)<1e-9)throw Error('Pull the sketch to give it depth.');
				const solid=k.extrude(this.face(s),...scale(s.plane.normal,Math.sign(distance)),Math.abs(distance));
				if(command.operation==='new')this.add(solid);
				else {const target=this.body(command.targetId??'');this.replace(target,this.journal(command.operation==='cut'?k.cutJournaled(target.solid,solid):k.fuseJournaled(target.solid,solid)));}
				this.sketches=this.sketches.filter(sketch=>sketch.id!==s.id);break;
			}
			case 'revolve': {
				const s=this.sketch(command.sketchId);this.add(k.revolve(this.face(s),...command.origin,...unit(command.axis),finite(command.angle)));
				this.sketches=this.sketches.filter(sketch=>sketch.id!==s.id);break;
			}
			case 'push': {
				const {body,handle,kind}=this.pick(command.selection),value=finite(command.value);
				if(Math.abs(value)<1e-9)break;
				if(kind==='face'){
					const surface=json(k.getAnalyticSurfaceParams(handle));
					const solid=surface.type==='cylinder'
						? this.journal(k.resizeCylindricalFaceJournaled(body.solid,handle,positive(surface.radius+value)))
						: this.journal(k.moveFacesJournaled(body.solid,new Uint32Array([handle]),value));
					this.replace(body,solid,true);
				}else throw Error('Use Move for this selection, or select a face to push it.');
				break;
			}
			case 'fillet': case 'chamfer': {
				const {body,handle,kind}=this.pick(command.selection);if(kind!=='edge')throw Error('Select an edge to round or bevel.');
				const n=positive(command.value),edges=new Uint32Array([handle]);
				this.replace(body,this.journal(command.type==='fillet'?k.filletJournaled(body.solid,edges,n):k.chamferJournaled(body.solid,edges,n,n)));break;
			}
			case 'shell': {
				const {body,handle,kind}=this.pick(command.selection);
				this.replace(body,k.shell(body.solid,positive(command.value),new Uint32Array(kind==='face'?[handle]:[])));break;
			}
			case 'transform': {
				if(command.matrix.length!==16)throw Error('Invalid transform.');command.matrix.forEach(finite);
				const m=command.matrix,axes=[[m[0],m[4],m[8]],[m[1],m[5],m[9]],[m[2],m[6],m[10]]] as Vec3[];
				const rigid=axes.every((a,i)=>axes.every((b,j)=>Math.abs(dot(a,b)-(i===j?1:0))<1e-8));
				for(const id of command.bodyIds){const body=this.body(id);k.transformSolid(body.solid,new Float64Array(command.matrix));body.record.artifact='';if(!rigid)body.record.massG=null;}break;
			}
			case 'move-selection': {
				const {body,handle,kind}=this.pick(command.selection);command.delta.forEach(finite);
				if(kind!=='edge'&&kind!=='vertex')throw Error('Select an edge or corner to move.');
				const selected=new Set<number>();
				if(kind==='vertex')selected.add(handle);
				else {
					if(k.getEdgeCurveType(handle)!=='LINE')throw Error('Move a straight edge, or resize its curved face.');
					const ends=k.getEdgeVertices(handle);
					for(const vertex of k.getSolidVertices(body.solid)){const p=k.getVertexPosition(vertex);if(Math.hypot(p[0]-ends[0],p[1]-ends[1],p[2]-ends[2])<1e-8||Math.hypot(p[0]-ends[3],p[1]-ends[4],p[2]-ends[5])<1e-8)selected.add(vertex);}
				}
				const changes:{name:string;normal:Vec3;d:number}[]=[];
				for(const face of k.getSolidFaces(body.solid)){
					const vertices=[...k.getFaceVertices(face)];if(!vertices.some(v=>selected.has(v)))continue;
					if(k.getSurfaceType(face)!=='plane')throw Error('This corner meets a curved face. Move its face instead.');
					const points=vertices.map(v=>{const p=vector(k.getVertexPosition(v));return selected.has(v)?[p[0]+command.delta[0],p[1]+command.delta[1],p[2]+command.delta[2]] as Vec3:p;});
					let normal:Vec3|undefined;
					for(let i=1;i<points.length-1;i++){const n=cross(sub(points[i],points[0]),sub(points[i+1],points[0]));if(Math.hypot(...n)>1e-8){normal=unit(n);break;}}
					if(!normal)throw Error('This move would collapse a face.');
					if(dot(normal,vector(k.getFaceNormal(face)))<0)normal=scale(normal,-1);
					const d=dot(normal,points[0]);if(points.some(p=>Math.abs(dot(normal!,p)-d)>1e-7))throw Error('This move would bend a flat face. Move its edge or face instead.');
					const original=json(k.getAnalyticSurfaceParams(face));
					if(Math.hypot(...sub(normal,vector(original.normal)))<1e-8&&Math.abs(d-original.d)<1e-8)continue;
					changes.push({name:k.getFaceName(face)!,normal,d});
				}
				for(const change of changes){const faces=[...k.getSolidFaces(body.solid)].filter(f=>k.getFaceName(f)===change.name);if(faces.length!==1)throw Error('The adjoining face changed. Select it again.');this.replace(body,this.journal(k.replaceSurfaceJournaled(body.solid,faces[0],JSON.stringify({type:'plane',normal:change.normal,d:change.d}))),true);}
				break;
			}
			case 'mirror': for(const id of command.bodyIds){const body=this.body(id);this.add(k.mirror(body.solid,...command.origin,...unit(command.normal)),'Mirror',body.record);}break;
			case 'pattern': {
				if(!Number.isSafeInteger(command.count)||command.count<2)throw Error('A pattern needs at least two copies.');
				const body=this.body(command.bodyId),d=unit(command.direction);
				const compound=command.mode==='linear'?k.linearPattern(body.solid,...d,finite(command.spacing),command.count):k.circularPattern(body.solid,...d,command.count);
				const solids=[...k.getCompoundSolids(compound)];
				for(let i=1;i<solids.length;i++)this.add(solids[i],'Pattern',body.record);break;
			}
			case 'boolean': {
				if(command.bodyIds.length<2)throw Error('Select two bodies with Shift-click.');
				const target=this.body(command.bodyIds[0]);
				for(const id of command.bodyIds.slice(1)){const tool=this.body(id);this.replace(target,this.journal(command.operation==='union'?k.fuseJournaled(target.solid,tool.solid):command.operation==='subtract'?k.cutJournaled(target.solid,tool.solid):k.intersectJournaled(target.solid,tool.solid)));if(command.operation==='union'&&target.record.materialId!==tool.record.materialId)target.record.materialId=null;this.bodies=this.bodies.filter(b=>b!==tool);}break;
			}
			case 'delete': {
				if(command.selections.some(s=>s.kind!=='body'&&s.kind!=='sketch'))throw Error('Select a whole body in Objects to delete it.');
				for(const selection of command.selections){if(selection.kind==='sketch')this.sketches=this.sketches.filter(s=>s.id!==selection.id);else this.bodies=this.bodies.filter(b=>b.record.id!==selection.bodyId);}break;
			}
			case 'metadata': {const record=this.body(command.bodyId).record; if(command.name!==undefined)record.name=command.name;if(command.materialId!==undefined)record.materialId=command.materialId;if(command.role!==undefined)record.role=command.role;if(command.massG!==undefined){if(command.massG!==null&&(finite(command.massG)<0))throw Error('Mass cannot be negative.');record.massG=command.massG;}if(command.massSource!==undefined)record.massSource=command.massSource;break;}
			case 'addon': this.addons.ideaBlade=command.enabled;break;
			case 'title': this.title=command.title.trim()||'Untitled document';break;
		}
		// A detached sketch remains usable after deleting or consuming its support.
		for(const sketch of this.sketches)if(sketch.supportBodyId&&!this.bodies.some(b=>b.record.id===sketch.supportBodyId))delete sketch.supportBodyId;
	}
	private validate() {
		for(const body of this.bodies){
			if(this.k.validateSolid(body.solid)!==0)throw Error('This change could not form a valid solid. Try a different size.');
			const volume=this.k.volume(body.solid,.002);if(!Number.isFinite(volume)||volume<=0)throw Error('This change would remove the whole body. Use Delete to remove it.');
		}
	}
	async snapshot(): Promise<ModelSnapshot> {
		for(const body of this.bodies)if(!body.record.artifact){
			const bytes=this.k.serializeSolids(new Uint32Array([body.solid]));
			const digest=await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>);
			const hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
			this.artifacts.set(hash,bytes);body.record.artifact=hash;
		}
		const manifest: SolidManifest={...emptyManifest(),title:this.title,bodies:this.bodies.map(b=>clone(b.record)),sketches:clone(this.sketches),addons:clone(this.addons)};
		validateManifest(manifest);
		return {manifest,artifacts:[...this.artifacts].map(([hash,bytes])=>({hash,bytes}))};
	}
	async load(snapshot: ModelSnapshot, resetHistory=true): Promise<ModelProjection> {
		validateManifest(snapshot?.manifest);if(!Array.isArray(snapshot.artifacts))throw Error('The model has no artifact list.');
		const artifacts=new Map(this.artifacts);
		for(const artifact of snapshot.artifacts){
			if(!artifact||typeof artifact.hash!=='string'||!/^[0-9a-f]{64}$/.test(artifact.hash)||!(artifact.bytes instanceof Uint8Array))throw Error('Invalid geometry artifact.');
			const known=artifacts.get(artifact.hash);
			if(known){if(known.length!==artifact.bytes.length||known.some((n,i)=>n!==artifact.bytes[i]))throw Error('The geometry artifact failed its integrity check.');}
			else{const digest=await crypto.subtle.digest('SHA-256',artifact.bytes as Uint8Array<ArrayBuffer>);if([...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')!==artifact.hash)throw Error('The geometry artifact failed its integrity check.');artifacts.set(artifact.hash,artifact.bytes);}
		}
		const candidate=new SolidEngine(await createKernel());candidate.artifacts=artifacts;
		try{
			for(const record of snapshot.manifest.bodies){const bytes=artifacts.get(record.artifact);if(!bytes)throw Error('A saved body is missing. Reload the document.');const roots=candidate.k.deserializeSolids(bytes);if(roots.length!==1)throw Error('Invalid saved body root count.');candidate.bodies.push({solid:roots[0],record:clone(record)});}
			candidate.sketches=clone(snapshot.manifest.sketches);candidate.addons=clone(snapshot.manifest.addons);candidate.title=snapshot.manifest.title;
			candidate.undoSteps=resetHistory?[]:this.undoSteps;candidate.redoSteps=resetHistory?[]:this.redoSteps;
			candidate.validate();const projection=candidate.project();
			this.k.free();this.k=candidate.k;this.generation=candidate.generation;this.bodies=candidate.bodies;this.sketches=candidate.sketches;this.addons=candidate.addons;this.title=candidate.title;this.artifacts=artifacts;this.picks=candidate.picks;this.preview=null;this.undoSteps=candidate.undoSteps;this.redoSteps=candidate.redoSteps;
			return projection;
		}catch(error){candidate.destroy();throw error;}
	}
	async apply(command: SolidCommand): Promise<ModelProjection> {
		const before=await this.snapshot(),start=performance.now();
		try{this.execute(command);this.validate();const after=await this.snapshot();this.undoSteps.push({before:before.manifest,after:after.manifest});this.redoSteps=[];return this.project(performance.now()-start);}
		catch(error){await this.load(before,false);throw error;}
	}
	async begin() {if(this.preview)await this.cancel();const before=(await this.snapshot()).manifest;this.preview={checkpoint:this.k.checkpoint(),bodies:this.bodies.map(b=>({solid:b.solid,record:clone(b.record)})),before};return true;}
	async update(command: SolidCommand) {
		if(!this.preview)throw Error('Start the gesture again.');
		const p=this.preview;this.k.restore(p.checkpoint);this.bodies=p.bodies.map(b=>({solid:b.solid,record:clone(b.record)}));this.sketches=clone(p.before.sketches);this.addons=clone(p.before.addons);this.project();
		const start=performance.now();
		try{this.execute(command);this.validate();p.command=command;return this.project(performance.now()-start);}
		catch(error){this.k.restore(p.checkpoint);this.bodies=p.bodies.map(b=>({solid:b.solid,record:clone(b.record)}));this.sketches=clone(p.before.sketches);this.project();p.command=undefined;throw error;}
	}
	async commit() {
		const p=this.preview;this.preview=null;
		try{if(p?.command){const after=(await this.snapshot()).manifest;this.undoSteps.push({before:p.before,after});this.redoSteps=[];}return this.project();}
		finally{if(p)this.k.discardCheckpoint(p.checkpoint);}
	}
	async cancel() {const p=this.preview;if(p)await this.load({manifest:p.before,artifacts:[]},false);return this.project();}
	async undo() {const step=this.undoSteps.pop();if(step){await this.load({manifest:step.before,artifacts:[]},false);this.redoSteps.push(step);}return this.project();}
	async redo() {const step=this.redoSteps.pop();if(step){await this.load({manifest:step.after,artifacts:[]},false);this.undoSteps.push(step);}return this.project();}
	planarProfile(selection:Selection):import('./types').ProfileCurve[]{
		const {kind,handle}=this.pick(selection),k=this.k;if(kind!=='face'||k.getSurfaceType(handle)!=='plane')throw Error('Select a flat face to export its outline and holes.');
		const n=vector(k.getFaceNormal(handle)),seed:Vec3=Math.abs(n[2])<.9?[0,0,1]:[0,1,0],u=unit(cross(seed,n)),v=cross(n,u),origin=vector(k.getVertexPosition(k.getFaceVertices(handle)[0]));
		const local=(p:ArrayLike<number>):[number,number]=>{const d=sub(vector(p),origin);return[dot(d,u),dot(d,v)];};
		const curves:import('./types').ProfileCurve[]=[];
		for(const wire of k.getFaceWires(handle))for(const edge of k.getWireEdges(wire)){
			const curve=k.getEdgeCurveType(edge),ends=k.getEdgeVertices(edge);if(curve==='LINE'){curves.push({type:'line',start:local(ends.slice(0,3)),end:local(ends.slice(3,6))});continue;}
			if(curve!=='CIRCLE')throw Error('This profile includes a curve that DXF export does not yet support.');
			const [a,b]=k.getEdgeParamSpan(edge),full=Math.abs(Math.abs(b-a)-Math.PI*2)<1e-7;
			const p=local(k.evaluateEdgeCurve(edge,a)),q=local(k.evaluateEdgeCurve(edge,a+(b-a)*(full?1/3:.5))),r=local(k.evaluateEdgeCurve(edge,a+(b-a)*(full?2/3:1)));
			const bx=q[0]-p[0],by=q[1]-p[1],cx=r[0]-p[0],cy=r[1]-p[1],d=2*(bx*cy-by*cx);
			if(Math.abs(d)<1e-14)throw Error('This arc is too small to export reliably.');
			const center:[number,number]=[p[0]+(cy*(bx*bx+by*by)-by*(cx*cx+cy*cy))/d,p[1]+(bx*(cx*cx+cy*cy)-cx*(bx*bx+by*by))/d],radius=Math.hypot(p[0]-center[0],p[1]-center[1]);
			if(full)curves.push({type:'circle',center,radius});else {const angle=(point:[number,number])=>(Math.atan2(point[1]-center[1],point[0]-center[0])*180/Math.PI+360)%360;curves.push({type:'arc',center,radius,startAngle:angle(d>0?p:r),endAngle:angle(d>0?r:p)});}
		}
		return curves;
	}
	project(operationMs=0): ModelProjection {
		const k=this.k;this.picks.clear();
		const bodies: BodyProjection[]=this.bodies.map(body=>{
			const faceHandles=[...k.getSolidFaces(body.solid)];if(this.markFaces(body.solid))body.record.artifact='';
			const faceNames=new Map(faceHandles.map(f=>[f,k.getFaceName(f)!]));
			const edgeFaces=new Map<number,string[]>(),vertexFaces=new Map<number,string[]>();
			for(const face of faceHandles){for(const edge of k.getFaceEdges(face))edgeFaces.set(edge,[...(edgeFaces.get(edge)??[]),faceNames.get(face)!]);for(const vertex of k.getFaceVertices(face))vertexFaces.set(vertex,[...(vertexFaces.get(vertex)??[]),faceNames.get(face)!]);}
			const addPick=(kind: Selection['kind'],id: string,handle: number)=>this.picks.set(this.key({bodyId:body.record.id,kind,id}),{body,handle,kind});
			addPick('body',body.record.id,body.solid);
			const faces=faceHandles.map(handle=>{
				const id=faceNames.get(handle)!,mesh=k.tessellateFace(handle,.002,.15),positions=new Float32Array(mesh.positions),normals=new Float32Array(mesh.normals),indices=mesh.indices;mesh.free();
				const surface=json(k.getAnalyticSurfaceParams(handle)),kind=k.getSurfaceType(handle),normal=kind==='plane'?vector(k.getFaceNormal(handle)):[0,0,0] as Vec3;
				const center: Vec3=[0,0,0];for(let i=0;i<positions.length;i++)center[i%3]+=positions[i]/(positions.length/3);
				addPick('face',id,handle);return {id,kind,center,normal,surface,area:k.faceArea(handle,.002),positions,normals,indices};
			});
			// Incidence is exact combinatorial identity. Ambiguous sets get no stable
			// identity claim; they use a runtime-only handle and expire after an edit.
			const edgeKeys=new Map<string,number>(),vertexKeys=new Map<string,number>();
			for(const names of edgeFaces.values()){const key=[...new Set(names)].sort().join(':');edgeKeys.set(key,(edgeKeys.get(key)??0)+1);}
			for(const names of vertexFaces.values()){const key=[...new Set(names)].sort().join(':');vertexKeys.set(key,(vertexKeys.get(key)??0)+1);}
			const edges=[...edgeFaces].flatMap(([handle,names])=>{
				const adjacent=[...new Set(names)].sort();if(adjacent.length<2)return [];
				const key=adjacent.join(':'),id=edgeKeys.get(key)===1?`edge:${body.record.topologyEpoch??'created'}:${key}`:`runtime-edge:${this.generation}:${body.record.topologyEpoch??'created'}:${handle}`;
				addPick('edge',id,handle);
				return [{id,curve:k.getEdgeCurveType(handle),faces:adjacent,points:new Float32Array(k.sampleEdge(handle,.002))}];
			});
			const vertices=[...vertexFaces].flatMap(([handle,names])=>{
				const adjacent=[...new Set(names)].sort();if(adjacent.length<3)return [];
				const key=adjacent.join(':'),id=vertexKeys.get(key)===1?`vertex:${body.record.topologyEpoch??'created'}:${key}`:`runtime-vertex:${this.generation}:${body.record.topologyEpoch??'created'}:${handle}`;
				addPick('vertex',id,handle);return [{id,point:vector(k.getVertexPosition(handle)),faces:adjacent}];
			});
			const grouped=k.tessellateSolidGroupedBinary(body.solid,.002,.15),mesh={positions:grouped.positions,normals:grouped.normals,indices:grouped.indices};grouped.free();
			const props=json(k.massProperties(body.solid));
			return {...body.record,faces,edges,vertices,mesh,bounds:[...k.boundingBox(body.solid)],volume:props.volume,centerOfMass:props.centerOfMass as Vec3,inertia:props.inertia as number[]};
		});
		return {bodies,sketches:clone(this.sketches),addons:clone(this.addons),operationMs,canUndo:!!this.undoSteps.length,canRedo:!!this.redoSteps.length};
	}
}
