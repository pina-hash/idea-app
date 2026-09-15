// Experimental, deliberately separate from the saved-document render path.
// Coordinates are inches. The source of truth is the B-rep, never these meshes.
import { OcctKernel } from '/kernel/index.js';

export class KernelSpike {
	static async init() {
		const started = performance.now();
		const kernel = await OcctKernel.init({ wasm: '/kernel/occt-wasm.wasm' });
		return new KernelSpike(kernel, performance.now() - started);
	}
	constructor(kernel, coldMs) { this.k = kernel; this.coldMs = coldMs; this.ids = new Map(); }
	describe(face) {
		const k = this.k, uv = k.uvBounds(face);
		return { kind: k.surfaceType(face), center: k.getSurfaceCenterOfMass(face), area: k.getSurfaceArea(face),
			normal: k.surfaceNormal(face, (uv.uMin+uv.uMax)/2, (uv.vMin+uv.vMax)/2) };
	}
	fingerprint(d) {
		return JSON.stringify([d.kind, ...Object.values(d.center), d.area, ...Object.values(d.normal)].map(x => typeof x === 'number' ? Math.round(x*1e7)/1e7 : x));
	}
	reset() {
		const k = this.k;
		k.releaseAll(); this.ids.clear();
		const box = k.makeBox(4,3,1), cylinder = k.translate(k.makeCylinder(.5,3),2,1.5,-1);
		const start = performance.now();
		this.shape = k.simplify(k.cut(box,cylinder));
		this.booleanMs = performance.now()-start;
		this.base = this.shape;
		this.faces = k.getSubShapes(this.shape,'face');
		this.faces.forEach((face, i) => this.ids.set(this.fingerprint(this.describe(face)), `face-${i+1}`));
		this.baseMark = k.checkpoint();
		return this.project();
	}
	project() {
		const k=this.k, start=performance.now();
		const faceData=k.getSubShapes(this.shape,'face').map(face=>{
			const info=this.describe(face), fingerprint=this.fingerprint(info);
			const mesh=k.tessellate(face,{linearDeflection:.005,angularDeflection:.2});
			return { ...info, id:this.ids.get(fingerprint) ?? `new:${fingerprint}`, fingerprint, positions:mesh.positions, normals:mesh.normals, indices:mesh.indices };
		});
		return { faces:faceData, mesh:k.tessellate(this.shape,{linearDeflection:.005,angularDeflection:.2}),
			volume:k.getVolume(this.shape), valid:k.isValid(this.shape), solids:k.subShapeCount(this.shape,'solid'),
			coldMs:this.coldMs, booleanMs:this.booleanMs, projectMs:performance.now()-start };
	}
	begin(id) {
		const k=this.k;
		this.base=this.shape;
		this.faces=k.getSubShapes(this.base,'face');
		this.selected=this.faces.find(f=>this.ids.get(this.fingerprint(this.describe(f)))===id);
		if (!this.selected) throw Error('Select a face first.');
		this.selectedInfo=this.describe(this.selected); this.selectedId=id;
		if (this.selectedInfo.kind !== 'plane') throw Error('This spike only implements planar face extrusion.');
		this.baseMark=k.checkpoint();
		return { id, ...this.selectedInfo };
	}
	push(distance) {
		const k=this.k, start=performance.now(), before=this.selectedInfo;
		if (!Number.isFinite(distance)) throw Error('Enter a finite distance.');
		k.releaseSince(this.baseMark);
		if (Math.abs(distance)<1e-9) { this.shape=this.base; return {...this.project(),distance,operationMs:0,selectionSurvived:true}; }
		const n=before.normal, prism=k.extrude(this.selected,n.x*distance,n.y*distance,n.z*distance);
		this.shape=k.simplify(distance>0?k.fuse(this.base,prism):k.cut(this.base,prism));
		if (!k.isValid(this.shape) || k.subShapeCount(this.shape,'solid')!==1) { this.shape=this.base; throw Error('That edit does not produce one valid solid.'); }
		// An explicit operation correspondence, NOT the claim that a changed
		// geometric fingerprint is stable. Refuse ambiguity; never pick nearest.
		const matches=k.getSubShapes(this.shape,'face').filter(f=>{
			const d=this.describe(f); return d.kind===before.kind && Math.abs(d.area-before.area)<1e-6 &&
				Math.hypot(d.center.x-before.center.x-n.x*distance,d.center.y-before.center.y-n.y*distance,d.center.z-before.center.z-n.z*distance)<1e-6 &&
				Math.hypot(d.normal.x-n.x,d.normal.y-n.y,d.normal.z-n.z)<1e-6;
		});
		if (matches.length===1) this.ids.set(this.fingerprint(this.describe(matches[0])),this.selectedId);
		const projected=this.project();
		return {...projected,distance,operationMs:performance.now()-start,selectionSurvived:matches.length===1};
	}
	serialize() { return this.k.toBREP(this.shape); }
}
