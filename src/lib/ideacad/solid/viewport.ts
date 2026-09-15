import * as THREE from 'three';
import { orbitCamera } from './camera';
import { add, dot, planeFor, planePoint, scale, sketchPolyline, sub, vector } from './math';
import type { ModelProjection, Selection, Sketch, SketchPlane, Vec3 } from './types';

export type Tool = 'select'|'rectangle'|'circle'|'line'|'polygon'|'arc'|'extrude'|'revolve'|'fillet'|'chamfer'|'shell'|'move'|'rotate'|'scale'|'linear-pattern'|'circular-pattern';
export interface DragValue { distance: number; delta: Vec3; angle: number; count: number; point: {x:number;y:number} }
export interface Gesture { selection: Selection; tool: Tool; start: Vec3; axis: Vec3 }
interface Options {
	getTool:()=>Tool; getPlane:()=>SketchPlane; getSelections:()=>Selection[]; canWrite:()=>boolean;
	select:(selection:Selection|null,append:boolean)=>void;
	begin:(gesture:Gesture)=>Promise<void>; update:(value:DragValue)=>void; end:()=>void; cancel:()=>void;
	sketch:(sketch:Sketch)=>void; numeric:(key:string,point:{x:number;y:number})=>void; error:(message:string)=>void;
}
export class SolidViewport {
	readonly renderer:THREE.WebGLRenderer;
	readonly camera=new THREE.OrthographicCamera(-4,4,3,-3,.001,100000);
	readonly target=new THREE.Vector3();
	private scene=new THREE.Scene();private solids=new THREE.Group();private guides=new THREE.Group();private gizmo=new THREE.Group();
	private meshes:THREE.Object3D[]=[];private edges:THREE.Object3D[]=[];private vertices:THREE.Object3D[]=[];
	private ray=new THREE.Raycaster();private frame=0;private observer:ResizeObserver;private abort=new AbortController();
	private model:ModelProjection={bodies:[],sketches:[],addons:{ideaBlade:false},canUndo:false,canRedo:false,operationMs:0};
	private orbit:{x:number;y:number;pivot:THREE.Vector3;mode:'orbit'|'pan'|'zoom';pointerId:number}|null=null;
	private drag:{gesture:Gesture;x:number;y:number;ready:boolean;starting:boolean;last?:DragValue;pointerId:number}|null=null;
	private drawing:{tool:Tool;plane:SketchPlane;start:Vec3;current:Vec3;points:Vec3[];supportBodyId?:string}|null=null;
	private pointer={x:0,y:0};
	readonly frameCosts:number[]=[];
	constructor(private canvas:HTMLCanvasElement,private options:Options){
		this.renderer=new THREE.WebGLRenderer({canvas,antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setClearColor('#15191d');
		this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
		this.camera.up.set(0,0,1);this.camera.position.set(7,-9,7);this.camera.lookAt(this.target);
		this.scene.add(new THREE.HemisphereLight('#e2edf4','#53616a',2));
		for(const [position,intensity]of [[[5,-4,8],3],[[-4,-2,3],1.4],[[2,6,5],2.5]] as [number[],number][]){const light=new THREE.DirectionalLight('#e4edf2',intensity);light.position.fromArray(position);this.scene.add(light);}
		this.scene.add(this.solids,this.guides,this.gizmo,new THREE.AxesHelper(.45));
		this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.resize();
		const events={signal:this.abort.signal};
		canvas.addEventListener('pointerdown',e=>void this.down(e),events);
		canvas.addEventListener('pointermove',e=>this.move(e),events);
		canvas.addEventListener('pointerup',e=>this.up(e),events);
		canvas.addEventListener('pointercancel',()=>this.cancel(),events);
		canvas.addEventListener('wheel',e=>this.wheel(e),{...events,passive:false});
		canvas.addEventListener('contextmenu',e=>e.preventDefault(),events);canvas.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();},events);
		canvas.addEventListener('keydown',e=>{
			if(e.key==='Escape'){e.preventDefault();this.cancel();}
			else if(e.key==='Enter'&&this.drawing){e.preventDefault();this.finishPolyline();}
			else if(/^[0-9.-]$/.test(e.key)&&this.options.getSelections().length){e.preventDefault();this.options.numeric(e.key,this.pointer);}
			else if(e.key.toLowerCase()==='f'){e.preventDefault();this.fit();}
		},events);
	}
	private resize(){const width=this.canvas.clientWidth,height=this.canvas.clientHeight;if(width<=0||height<=0)return;this.renderer.setSize(width,height,false);this.camera.left=-3*width/height;this.camera.right=3*width/height;this.camera.top=3;this.camera.bottom=-3;this.camera.updateProjectionMatrix();this.invalidate();}
	invalidate(){if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;const start=performance.now();this.renderer.render(this.scene,this.camera);this.frameCosts.push(performance.now()-start);});}
	private clear(group:THREE.Group){for(const object of [...group.children]){group.remove(object);object.traverse(child=>{const mesh=child as THREE.Mesh;mesh.geometry?.dispose();if(Array.isArray(mesh.material))mesh.material.forEach(m=>m.dispose());else mesh.material?.dispose();});}}
	private geometry(mesh:{positions:Float32Array;normals:Float32Array;indices:Uint32Array}){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(mesh.positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(mesh.normals,3));geometry.setIndex(new THREE.BufferAttribute(mesh.indices,1));return geometry;}
	display(model:ModelProjection){
		this.model=model;this.clear(this.solids);this.meshes=[];this.edges=[];this.vertices=[];
		for(const body of model.bodies){
			for(const face of body.faces){const mesh=new THREE.Mesh(this.geometry(face),new THREE.MeshStandardMaterial({color:'#91a2ad',metalness:.42,roughness:.4,side:THREE.DoubleSide}));mesh.userData={selection:{bodyId:body.id,kind:'face',id:face.id},normal:face.normal,center:face.center};this.solids.add(mesh);this.meshes.push(mesh);}
			for(const edge of body.edges){
				const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(edge.points,3));
				const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:'#394c59'}));line.userData={selection:{bodyId:body.id,kind:'edge',id:edge.id}};this.solids.add(line);this.edges.push(line);
			}
			for(const vertex of body.vertices){const point=new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...vertex.point)]),new THREE.PointsMaterial({color:'#e7f6ff',size:6,sizeAttenuation:false,transparent:true,opacity:0}));point.userData={selection:{bodyId:body.id,kind:'vertex',id:vertex.id}};this.solids.add(point);this.vertices.push(point);}
		}
		for(const sketch of model.sketches){
			const points=sketchPolyline(sketch),local=points.map(p=>{const d=sub(p,sketch.plane.origin);return new THREE.Vector2(dot(d,sketch.plane.u),dot(d,sketch.plane.v));}),shape=new THREE.Shape(local);
			for(const profile of sketch.holes??[]){shape.holes.push(new THREE.Path(sketchPolyline({...sketch,profile}).map(p=>{const d=sub(p,sketch.plane.origin);return new THREE.Vector2(dot(d,sketch.plane.u),dot(d,sketch.plane.v));})));}
			const fillGeometry=new THREE.ShapeGeometry(shape),basis=new THREE.Matrix4().makeBasis(new THREE.Vector3(...sketch.plane.u),new THREE.Vector3(...sketch.plane.v),new THREE.Vector3(...sketch.plane.normal));basis.setPosition(...sketch.plane.origin);fillGeometry.applyMatrix4(basis);
			const fill=new THREE.Mesh(fillGeometry,new THREE.MeshBasicMaterial({color:'#a5ecff',transparent:true,opacity:.16,side:THREE.DoubleSide,depthWrite:false})),line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color:'#a5ecff'}));
			fill.userData=line.userData={selection:{bodyId:'',kind:'sketch',id:sketch.id},normal:sketch.plane.normal};this.solids.add(fill,line);this.meshes.push(fill,line);
		}
		this.highlight();
	}
	highlight(){
		const selections=this.options.getSelections(),match=(s:Selection)=>selections.some(a=>a.bodyId===s.bodyId&&(a.kind==='body'||a.kind===s.kind&&a.id===s.id));
		for(const object of [...this.meshes,...this.edges,...this.vertices]){const m=object as THREE.Mesh;const s=object.userData.selection as Selection;(m.material as THREE.MeshStandardMaterial).color.set(match(s)?'#84d8ac':s.kind==='edge'?'#394c59':s.kind==='sketch'?'#a5ecff':'#91a2ad');if(s.kind==='vertex')(m.material as THREE.PointsMaterial).opacity=match(s)?1:0;}
		this.drawGizmo();this.invalidate();
	}
	private drawGizmo(){
		this.clear(this.gizmo);const selection=this.options.getSelections()[0],tool=this.options.getTool();if(!selection||!['move','rotate','scale'].includes(tool))return;
		const body=this.model.bodies.find(b=>b.id===selection.bodyId);if(!body)return;const center=new THREE.Vector3(...body.centerOfMass),length=1/this.camera.zoom;
		for(const [axis,color]of [[[1,0,0],'#ff7878'],[[0,1,0],'#83edac'],[[0,0,1],'#80caff']] as [Vec3,string][]){
			const arrow=new THREE.ArrowHelper(new THREE.Vector3(...axis),center,length,color,length*.18,length*.08);arrow.userData={selection,axis};arrow.traverse(o=>o.userData={selection,axis});this.gizmo.add(arrow);
		}
	}
	fit(){
		if(!this.solids.children.length){this.camera.zoom=1;this.camera.updateProjectionMatrix();this.invalidate();return;}
		const bounds=new THREE.Box3().setFromObject(this.solids),center=bounds.getCenter(new THREE.Vector3());this.camera.position.add(center.clone().sub(this.target));this.target.copy(center);
		this.camera.updateMatrixWorld();const corners:THREE.Vector3[]=[];for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])corners.push(new THREE.Vector3(x,y,z).applyMatrix4(this.camera.matrixWorldInverse));
		const projected=new THREE.Box3().setFromPoints(corners),size=projected.getSize(new THREE.Vector3());
		this.camera.zoom=.76*Math.min((this.camera.right-this.camera.left)/Math.max(size.x,1e-7),(this.camera.top-this.camera.bottom)/Math.max(size.y,1e-7));this.camera.updateProjectionMatrix();this.drawGizmo();this.invalidate();
	}
	view(name:'iso'|'top'|'front'|'right') {const offset={iso:[7,-9,7],top:[0,0,10],front:[0,-10,0],right:[10,0,0]}[name];this.camera.position.copy(this.target).add(new THREE.Vector3(...offset));this.camera.up.set(0,0,1);if(name==='top')this.camera.up.set(0,1,0);this.camera.lookAt(this.target);this.fit();}
	private setRay(e:{clientX:number;clientY:number}){const r=this.canvas.getBoundingClientRect();this.ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);const threshold=(this.camera.top-this.camera.bottom)/r.height/this.camera.zoom*7;this.ray.params.Line={threshold};this.ray.params.Points={threshold};}
	private hit(e:PointerEvent){
		this.setRay(e);const tool=this.options.getTool();const gizmo=this.ray.intersectObject(this.gizmo,true)[0];if(gizmo)return gizmo;
		const faces=this.ray.intersectObjects(this.meshes,false),edges=this.ray.intersectObjects(this.edges,false),vertices=this.ray.intersectObjects(this.vertices,false);
		const front=faces[0]?.distance??Infinity,epsilon=.025/this.camera.zoom;
		const sketch=faces.find(h=>h.object.userData.selection?.kind==='sketch'&&h.distance<=front+epsilon);if(sketch)return sketch;
		if(e.altKey)return faces[0]??null;
		if(['fillet','chamfer'].includes(tool))return edges.find(h=>h.distance<=front+epsilon)??faces[0]??null;
		return vertices.find(h=>h.distance<=front+epsilon)??edges.find(h=>h.distance<=front+epsilon)??faces[0]??null;
	}
	private planeHit(e:{clientX:number;clientY:number},plane:SketchPlane):Vec3|null{this.setRay(e);const result=this.ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...plane.normal),new THREE.Vector3(...plane.origin)),new THREE.Vector3());return result?vector(result.toArray()):null;}
	private viewPlane(e:{clientX:number;clientY:number},through=this.target){this.setRay(e);return this.ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()),through),new THREE.Vector3());}
	private async down(e:PointerEvent){
		this.canvas.focus();this.pointer={x:e.offsetX,y:e.offsetY};
		if(e.button===1){e.preventDefault();if(e.altKey)return;this.setRay(e);const hit=this.ray.intersectObjects(this.meshes,false)[0],pivot=hit?.point.clone()??this.viewPlane(e);if(!pivot)return;this.orbit={x:e.clientX,y:e.clientY,pivot,mode:e.ctrlKey?'pan':e.shiftKey?'zoom':'orbit',pointerId:e.pointerId};this.canvas.setPointerCapture(e.pointerId);return;}
		if(e.button!==0)return;const tool=this.options.getTool(),hit=this.hit(e);
		if(['rectangle','circle','line','polygon','arc'].includes(tool)&&this.options.canWrite()){
			let plane=this.drawing?.plane??this.options.getPlane();
			if(!this.drawing&&hit?.object.userData.selection?.kind==='face'&&Math.hypot(...hit.object.userData.normal)>.9)plane=planeFor(vector(hit.point.toArray()),hit.object.userData.normal);
			const p=this.planeHit(e,plane);if(!p)return;
			if(this.drawing&&['line','arc'].includes(tool)){this.drawing.points.push(p);this.drawing.current=p;if(tool==='arc'&&this.drawing.points.length===3)this.finishPolyline();else if(this.drawing.points.length>3&&Math.hypot(...sub(p,this.drawing.points[0]))<.08/this.camera.zoom){this.drawing.points.pop();this.finishPolyline();}else this.drawSketch();return;}
			this.drawing={tool,plane,start:p,current:p,points:[p],supportBodyId:hit?.object.userData.selection?.kind==='face'?hit.object.userData.selection.bodyId:undefined};this.canvas.setPointerCapture(e.pointerId);return;
		}
		if(!hit){this.options.select(null,false);this.highlight();return;}
		let selection=hit.object.userData.selection as Selection;if(!selection)return;
		if(['rotate','scale','linear-pattern','circular-pattern'].includes(tool)&&selection.kind!=='sketch')selection={bodyId:selection.bodyId,kind:'body',id:selection.bodyId};
		if(!hit.object.userData.axis)this.options.select(selection,e.shiftKey);this.highlight();
		if(!this.options.canWrite()||e.shiftKey)return;
		const normal=hit.object.userData.axis??hit.object.userData.normal??[0,0,1];
		const gesture:Gesture={selection,tool,start:vector(hit.point.toArray()),axis:Math.hypot(...normal)>.9?normal:[0,0,1]};
		this.drag={gesture,x:e.clientX,y:e.clientY,ready:false,starting:false,pointerId:e.pointerId};this.canvas.setPointerCapture(e.pointerId);
	}
	private move(e:PointerEvent){
		this.pointer={x:e.offsetX,y:e.offsetY};
		if(this.orbit){const o=this.orbit,dx=e.clientX-o.x,dy=e.clientY-o.y;o.x=e.clientX;o.y=e.clientY;e.preventDefault();
			if(o.mode==='orbit')orbitCamera(this.camera,this.target,o.pivot,dx,dy,this.canvas.clientWidth);
			else if(o.mode==='zoom'){this.camera.zoom*=Math.exp(-dy/200);this.camera.updateProjectionMatrix();}
			else{const right=new THREE.Vector3(1,0,0).applyQuaternion(this.camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(this.camera.quaternion),delta=right.multiplyScalar(-dx*(this.camera.right-this.camera.left)/this.canvas.clientWidth/this.camera.zoom).add(up.multiplyScalar(dy*6/this.canvas.clientHeight/this.camera.zoom));this.camera.position.add(delta);this.target.add(delta);}
			this.camera.updateMatrixWorld();this.invalidate();return;
		}
		if(this.drawing){const p=this.planeHit(e,this.drawing.plane);if(p){this.drawing.current=p;this.drawSketch();}return;}
		const d=this.drag;if(!d)return;if(Math.hypot(e.clientX-d.x,e.clientY-d.y)<3)return;
		if(!d.ready){if(!d.starting){d.starting=true;void this.options.begin(d.gesture).then(()=>{if(this.drag===d){d.ready=true;this.move(e);}}).catch(error=>{this.options.error(error instanceof Error?error.message:String(error));this.drag=null;});}return;}
		const a=new THREE.Vector3(...d.gesture.start).project(this.camera),b=new THREE.Vector3(...add(d.gesture.start,d.gesture.axis)).project(this.camera),vx=(b.x-a.x)*this.canvas.clientWidth/2,vy=-(b.y-a.y)*this.canvas.clientHeight/2,l=vx*vx+vy*vy,dx=e.clientX-d.x,dy=e.clientY-d.y;
		const start=this.viewPlane({clientX:d.x,clientY:d.y},new THREE.Vector3(...d.gesture.start)),end=this.viewPlane(e,new THREE.Vector3(...d.gesture.start));
		const distance=l>4?(dx*vx+dy*vy)/l:-dy*6/this.canvas.clientHeight/this.camera.zoom;
		const value={distance,delta:start&&end?vector(end.sub(start).toArray()):[0,0,0] as Vec3,angle:-dy/this.canvas.clientHeight*360,count:Math.max(2,2+Math.round(-dy/35)),point:this.pointer};d.last=value;this.options.update(value);
	}
	private up(e:PointerEvent){
		if(this.orbit){this.orbit=null;}
		else if(this.drawing&&!['line','arc'].includes(this.drawing.tool)){const d=this.drawing;if(Math.hypot(...sub(d.current,d.start))>1e-6){this.options.sketch(this.drawnSketch());this.drawing=null;this.clear(this.guides);}}
		else if(this.drag){const d=this.drag;this.drag=null;if(d.last)this.options.end();else if(d.starting)this.options.cancel();}
		if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);this.invalidate();
	}
	private drawnSketch():Sketch {
		const d=this.drawing!,plane=d.plane,du=dot(sub(d.current,d.start),plane.u),dv=dot(sub(d.current,d.start),plane.v);
		const sketch:Sketch={id:crypto.randomUUID(),name:'Sketch',plane,profile:{type:'polygon',points:[]},...(d.supportBodyId?{supportBodyId:d.supportBodyId}:{})};
		if(d.tool==='circle')sketch.profile={type:'circle',center:d.start,radius:Math.hypot(du,dv)};
		else if(d.tool==='rectangle')sketch.profile={type:'polygon',points:[d.start,add(d.start,scale(plane.u,du)),d.current,add(d.start,scale(plane.v,dv))]};
		else if(d.tool==='polygon'){const radius=Math.hypot(du,dv),angle=Math.atan2(dv,du);sketch.profile={type:'polygon',points:Array.from({length:6},(_,i)=>add(d.start,add(scale(plane.u,radius*Math.cos(angle+i*Math.PI/3)),scale(plane.v,radius*Math.sin(angle+i*Math.PI/3)))))};}
		else if(d.tool==='arc'&&d.points.length>=3){const center=d.points[0],start=d.points[1],end=d.points[2];const r=Math.hypot(...sub(start,center)),direction=sub(end,center),length=Math.hypot(...direction);const onCircle=add(center,scale(direction,r/length));sketch.profile={type:'wire',segments:[{type:'arc',start,end:onCircle,center},{type:'line',start:onCircle,end:start}]};}
		else sketch.profile={type:'polygon',points:[...d.points]};
		return sketch;
	}
	private drawSketch(){this.clear(this.guides);const d=this.drawing!;let points:Vec3[];if(['line','arc'].includes(d.tool))points=[...d.points,d.current];else points=sketchPolyline(this.drawnSketch());const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color:'#a5ecff',depthTest:false}));line.renderOrder=10;this.guides.add(line);this.invalidate();}
	private finishPolyline(){if(!this.drawing)return;if(this.drawing.points.length<3){this.options.error('Close a shape with three points.');return;}this.options.sketch(this.drawnSketch());this.drawing=null;this.clear(this.guides);this.invalidate();}
	private wheel(e:WheelEvent){e.preventDefault();const before=this.viewPlane(e);this.camera.zoom*=Math.exp(-e.deltaY*.001);this.camera.updateProjectionMatrix();const after=this.viewPlane(e);if(before&&after){const delta=before.sub(after);this.camera.position.add(delta);this.target.add(delta);}this.camera.updateMatrixWorld();this.drawGizmo();this.invalidate();}
	clearDrawing(){this.drawing=null;this.clear(this.guides);this.invalidate();}
	cancel(){this.orbit=null;this.drag=null;this.clearDrawing();this.options.cancel();this.invalidate();}
	projectPoint(point:Vec3){const p=new THREE.Vector3(...point).project(this.camera),r=this.canvas.getBoundingClientRect();return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}
	painted(){this.renderer.render(this.scene,this.camera);const gl=this.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let different=0;for(let i=0;i<pixels.length;i+=4)if(Math.abs(pixels[i]-pixels[0])+Math.abs(pixels[i+1]-pixels[1])+Math.abs(pixels[i+2]-pixels[2])>40)different++;return{fraction:different/(pixels.length/4),width:gl.drawingBufferWidth,height:gl.drawingBufferHeight};}
	destroy(){this.abort.abort();this.observer.disconnect();cancelAnimationFrame(this.frame);this.clear(this.solids);this.clear(this.guides);this.clear(this.gizmo);this.renderer.dispose();}
}
