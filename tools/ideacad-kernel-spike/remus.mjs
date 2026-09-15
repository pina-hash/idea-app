import * as bindings from '/remus/remus_wasm_bg.js';
const {BrepKernel}=bindings;
const json=value=>typeof value==='string'?JSON.parse(value):value;
const vector=arr=>({x:arr[0],y:arr[1],z:arr[2]});
export class KernelSpike {
	static async init(){const t=performance.now();const {instance}=await WebAssembly.instantiateStreaming(fetch('/artifacts/remus-9307e73.wasm'),{'./remus_wasm_bg.js':bindings});bindings.__wbg_set_wasm(instance.exports);instance.exports.__wbindgen_start();return new KernelSpike(performance.now()-t);}
	constructor(coldMs){this.coldMs=coldMs;}
	reset(){
		this.k?.free();const k=this.k=new BrepKernel();
		const box=k.makeBox(4,3,1),cylinder=k.makeCylinder(.5,3);
		k.transformSolid(cylinder,new Float64Array([1,0,0,2,0,1,0,1.5,0,0,1,-1,0,0,0,1]));
		const t=performance.now(),cut=json(k.cutJournaled(box,cylinder));this.booleanMs=performance.now()-t;
		this.shape=cut.solid;this.op=cut.op;this.selectedId=null;this.faceRefs=new Map();
		for(let i=0;i<k.getSolidFaces(this.shape).length;i++){
			const result=json(k.resolveOperationOutput(cut.op,'face',i));
			if(result.status==='bound')this.faceRefs.set(k.makeOperationOutputRef(cut.op,'face',i),`face-${i+1}`);
		}
		return this.project();
	}
	project(){
		const k=this.k,t=performance.now(),group=k.tessellateSolidGroupedBinary(this.shape,.005,.2);
		const positions=group.positions,normals=group.normals,indices=group.indices,offsets=group.faceOffsets;group.free();
		const ids=new Map();for(const [ref,id]of this.faceRefs){const resolved=json(k.resolveRef(ref));if(resolved.status==='bound'&&resolved.provenance==='construction')for(const entity of resolved.entities)ids.set(entity.handle,id);}
		const faces=[...k.getSolidFaces(this.shape)].map((face,i)=>{
			const vertices=[...k.getFaceVertices(face)].map(v=>k.getVertexPosition(v)),center=[0,0,0];
			for(const p of vertices)for(let j=0;j<3;j++)center[j]+=p[j]/vertices.length;
			const kind=k.getSurfaceType(face);
			return {id:ids.get(face)??`unbound-${face}`,kind,normal:vector(kind==='plane'?k.getFaceNormal(face):[0,0,0]),center:vector(center),area:k.faceArea(face,.005),positions,normals,indices:indices.slice(offsets[i],offsets[i+1])};
		});
		return {faces,mesh:{positions,normals,indices,triangleCount:indices.length/3},volume:k.volume(this.shape,.005),valid:k.validateSolid(this.shape)===0,solids:k.getSolidShells(this.shape).length,coldMs:this.coldMs,booleanMs:this.booleanMs,projectMs:performance.now()-t};
	}
	begin(id){
		this.base=this.shape;this.selectedId=id;this.selectedRef=[...this.faceRefs].find(([,value])=>value===id)?.[0];
		const resolved=this.selectedRef&&json(this.k.resolveRef(this.selectedRef));if(resolved?.status!=='bound')throw Error('Select a face first.');
		this.selectedFace=resolved.entities[0].handle;this.mark=this.k.checkpoint();
		return {id,normal:vector(this.k.getFaceNormal(this.selectedFace))};
	}
	push(distance){
		if(!Number.isFinite(distance))throw Error('Enter a finite distance.');
		const k=this.k,t=performance.now();k.restore(this.mark);this.shape=this.base;
		if(Math.abs(distance)>1e-9)this.shape=json(k.moveFacesJournaled(this.base,new Uint32Array([this.selectedFace]),distance)).solid;
		const resolution=json(k.resolveRef(this.selectedRef));const selectionSurvived=resolution.status==='bound'&&resolution.provenance==='construction'&&resolution.entities.some(e=>[...k.getSolidFaces(this.shape)].includes(e.handle));
		return {...this.project(),distance,selectionSurvived,operationMs:performance.now()-t};
	}
	serialize(){return this.k.serializeSolids(new Uint32Array([this.shape]));}
}
