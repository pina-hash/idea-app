/**
 * THE VIEWPORT HOST: one renderer, one orthographic camera, the body meshes,
 * the pick pipeline and the pointer gestures. Everything a surface owns is a
 * module under `viewport/` that this file calls:
 *
 *   viewport/sketch-layer.ts     how a sketch is drawn            (sketching)
 *   viewport/drawing.ts          the drawing tools' state machine (sketching)
 *   viewport/reference-layer.ts  how reference geometry is drawn  (reference geometry)
 *   viewport/triad.ts            the move triad and its handles   (part movement)
 *   viewport/drag-math.ts        what a pointer movement is worth (part movement)
 *   viewport/readout.ts          the words beside the cursor      (dimensional control)
 *   viewport/pick.ts             what a press or a hover takes    (selection)
 *   viewport/box-select.ts       what a dragged box takes         (selection)
 *   viewport/edge-loop.ts        the loop an edge is on           (selection)
 *
 * A surface changes its module; this file changes when the host contract
 * does. Mates preview through `guide`, a section view through `clip`.
 *
 * THE KEYBOARD IS NOT HERE. The workspace's one shortcut layer reads every
 * key (Escape, the value box's digits, every command's shortcut); the canvas
 * keeps only the drawing tool's own Enter, which finishes a line chain.
 *
 * THE CORNER TRIAD is a second, tiny scene rendered into the bottom-left
 * corner of the same canvas after the model, with a camera that copies the
 * main camera's rotation, so it turns with the view and costs three lines and
 * three letters. Where it sits is a slot element the workspace lays out in
 * CSS (`setTriadSlot`), so the corner is chosen by the same stylesheet that
 * places everything it must stay clear of.
 *
 * THREE LOOKS, KEYED BY SELECTION, NEVER BY OBJECT. Every pick object is
 * painted from two facts about its selection: is it SELECTED (the green) and
 * is it HOVERED (the preselection: a face tints, an edge draws thick, a
 * vertex shows a dot, a plane or a sketch brightens). `display()` rebuilds
 * every object on every projection (each drag frame is one), so both facts are
 * kept as selections and re-applied at the end of `display()`; a pointer move
 * that changes what is under it repaints only the objects of the old and the
 * new hover (`repaintHover`), never the whole model. A 1px line on a dark body
 * is invisible, so a selected or hovered edge is ALSO drawn as a thick screen-
 * space line (`Line2`) in the overlay group, pulled a few pixels toward the
 * camera so the faces beside it do not cut it in half; in an orthographic view
 * that pull moves nothing on screen.
 *
 * HOVER IS A RAY-CAST ON THE MAIN THREAD, THROTTLED TO ONE PER FRAME. Only
 * while idle (not orbiting, dragging, boxing or drawing), scheduled on a frame
 * OR a timeout (a backgrounded window never ticks a frame), and every pick's
 * cost is pushed to `hoverCosts` beside `frameCosts`, so the price is a
 * reading. It never goes through the worker, which replays on one queue.
 *
 * A CONSUMED SKETCH IS NOT DRAWN AND NOT PICKABLE, unless it is open for
 * editing or selected (or hovered FROM THE TREE, never by the pointer, which
 * would keep one shown by resting on it): it lies on the face it made,
 * so drawn it covered a hole's mouth (the wall could not be picked from any
 * angle) and stayed behind as a ghost when its body moved.
 */
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { orbitCamera } from './camera';
import { dot, sub, vector } from './math';
import { datumPlane, planeFromNormal } from './sketch/model';
import { buildTriad, triadHandle, type TriadHandle } from './viewport/triad';
import { sketchObjects, HOVER_COLOUR, SELECTED_COLOUR } from './viewport/sketch-layer';
import { referenceObjects, datumPlaneObjects, originMarkerObjects, onDatumPlanesChange, AXIS_COLOURS } from './viewport/reference-layer';
import { DrawingTool, isDrawTool, type DrawPlane } from './viewport/drawing';
import { dragValue, snapTargetsFrom, bodyAnchors, type SnapTarget } from './viewport/drag-math';
import { disposeObject, polyline } from './viewport/shared';
import { orderPicks, selectionKey, type PickHit, type PickPart } from './viewport/pick';
import { boxMode, boxRect, boxSelect, BOX_THRESHOLD_PX, type BoxMode, type ScreenRect } from './viewport/box-select';
import { boxKinds, pickKinds, type PickFilterKind } from './command-registry';
import { bodyColour } from './appearance';
import type { SketchDraft } from './sketch/editor';
import type { ModelProjection, PlaneRef, ResolvedPlane, Selection, SketchPlane, SketchProjection, Vec3 } from './types';

export type Tool = 'select'|'rectangle'|'circle'|'line'|'polygon'|'arc'|'extrude'|'revolve'|'fillet'|'chamfer'|'shell'|'move'|'rotate'|'scale'|'linear-pattern'|'circular-pattern'|'measure'|'hole'|'mate'|'reference'|'draft'|'sweep'|'loft';
/** Tools whose press only selects: the panel that goes with them builds the feature from the selection. */
export const SELECT_ONLY_TOOLS: readonly Tool[] = ['measure','mate','reference','draft','sweep','loft'];
export interface DragValue { distance: number; delta: Vec3; angle: number; count: number; point: {x:number;y:number}; handle?: TriadHandle | null; /** The snap the drag took, when it took one (part movement). */ snapped?: { to: string }; /** Held modifiers at this sample; Ctrl suppresses the magnetic mate snap. */ modifiers?: { shift?: boolean; ctrl?: boolean; alt?: boolean } }
export interface Gesture { selection: Selection; tool: Tool; start: Vec3; axis: Vec3; handle?: TriadHandle | null }
export type { DrawPlane } from './viewport/drawing';
/** One thing under the pointer, for Select Other: what it is, where the ray met it, and how far along. */
export interface PickCandidate { selection: Selection; point: Vec3; distance: number; part: PickPart }
/** What is under a point of the canvas: the one a press takes, and everything, nearest first. */
export interface ViewportPick { best: PickCandidate | null; all: PickCandidate[] }
/** A box being dragged, in client pixels, and which rule it is. */
export interface BoxState { rect: ScreenRect; mode: BoxMode }
interface Options {
	getTool:()=>Tool; getPlane:()=>DrawPlane; getSelections:()=>Selection[]; canWrite:()=>boolean;
	select:(selection:Selection|null,append:boolean)=>void;
	begin:(gesture:Gesture)=>Promise<void>; update:(value:DragValue)=>void; end:()=>void; cancel:()=>void;
	/** A finished entity collection from a drawing tool: the workspace turns it into a sketch feature. */
	draft:(draft:SketchDraft,ref:PlaneRef)=>void;
	error:(message:string)=>void;
	/** While a sketch is open for editing, presses and moves inside the viewport go here as plane coordinates. */
	sketchPointer?:(event:'down'|'move'|'up',at:[number,number],e:PointerEvent)=>boolean;
	/** The pick filter the student chose (preferences). Absent or empty: anything. */
	getPickFilter?:()=>readonly PickFilterKind[];
	/** What the pointer is over changed: a selection, or null over empty space. */
	hover?:(selection:Selection|null)=>void;
	/** A right-click on the canvas, at client pixels, with what was under it. The browser's own menu never opens here. */
	contextMenu?:(at:{x:number;y:number},pick:ViewportPick)=>void;
	/** A box is being dragged (its rectangle and rule), or ended (null). */
	box?:(box:BoxState|null)=>void;
	/** A finished box's picks; `append` when Ctrl or Shift was held as it started. */
	boxSelect?:(selections:Selection[],append:boolean)=>void;
	/** A press that did not become a drag let go, at client pixels: where the context toolbar opens. */
	clicked?:(at:{x:number;y:number},touch:boolean)=>void;
	/** A drag, a drawing or a box began: transient chrome near the pointer gets out of the way. */
	busyPointer?:()=>void;
}
/** How tall a reference or plane name is on screen, in CSS pixels. */
export const LABEL_PX=20;
/** The width of a hovered edge and of a selected edge, in CSS pixels: thick enough to see on a dark body at every zoom. */
export const HOVER_EDGE_PX=5,SELECTED_EDGE_PX=3.5;
/** The colour of the edges a blend under the pointer will round, before any press: not the hover's and not the selection's. */
export const PREVIEW_COLOUR='#7fd4f0';
export const EMPTY_MODEL: ModelProjection = {bodies:[],sketches:[],references:[],features:[],mates:[],addons:{ideaBlade:false},canUndo:false,canRedo:false,operationMs:0};
export { bodyColour } from './appearance';
type Role='face'|'edge'|'vertex'|'sketch-fill'|'sketch-line'|'reference'|'datum';
/** A frame OR a timeout, never a frame alone: a backgrounded window never ticks one. */
function schedule(run:()=>void):()=>void{let done=false;const once=()=>{if(done)return;done=true;run();};const frame=typeof requestAnimationFrame==='function'?requestAnimationFrame(once):0;const timer=setTimeout(once,32);return()=>{done=true;if(frame)cancelAnimationFrame(frame);clearTimeout(timer);};}
export class SolidViewport {
	readonly renderer:THREE.WebGLRenderer;
	readonly camera=new THREE.OrthographicCamera(-4,4,3,-3,.001,100000);
	readonly target=new THREE.Vector3();
	private scene=new THREE.Scene();private solids=new THREE.Group();private guides=new THREE.Group();private gizmo=new THREE.Group();private refs=new THREE.Group();private sketchLayer=new THREE.Group();private overlay=new THREE.Group();
	private faces:THREE.Mesh[]=[];private sketchObjs:THREE.Object3D[]=[];private edges:THREE.Object3D[]=[];private vertices:THREE.Object3D[]=[];private refObjects:THREE.Object3D[]=[];private datumObjects:THREE.Object3D[]=[];
	/** Every pick object by its selection's key, and a body's faces by body id: what a hover repaints. */
	private index=new Map<string,THREE.Object3D[]>();private bodyFaces=new Map<string,THREE.Object3D[]>();
	/** Draw Front, Top and Right whatever the preference says, for a student who just asked to sketch on a plane. */
	datumForced=false;
	/** The corner triad: its own scene and camera, and the box it is drawn in, in canvas pixels from the bottom-left. */
	private triadScene=new THREE.Scene();private triadCamera=new THREE.OrthographicCamera(-1.42,1.42,1.42,-1.42,.1,20);private triadBox={left:12,bottom:12,size:0};private triadSlot:HTMLElement|null=null;
	triadShown=true;
	private ray=new THREE.Raycaster();private frame=0;private observer:ResizeObserver;private abort=new AbortController();
	private model:ModelProjection=EMPTY_MODEL;
	private orbit:{x:number;y:number;pivot:THREE.Vector3;mode:'orbit'|'pan'|'zoom';pointerId:number}|null=null;
	private drag:{gesture:Gesture;x:number;y:number;ready:boolean;starting:boolean;last?:DragValue;pointerId:number;snap?:{targets:SnapTarget[];anchors:Vec3[]}}|null=null;
	/** A press on empty space: a click clears the selection, a drag past the threshold is a box. */
	private boxing:{x:number;y:number;append:boolean;pointerId:number;active:boolean;mode:BoxMode;rect:ScreenRect}|null=null;
	/** A press that selected something and may yet become a drag: if it lets go first, it was a click. */
	private press:{x:number;y:number;reselect?:Selection}|null=null;
	private drawingTool:DrawingTool;
	private pointer={x:0,y:0};
	/** The sketch open for editing, whose plane every press is dropped onto, and its feature id (so a consumed sketch is drawn while it is open). */
	editingPlane:ResolvedPlane|null=null;editingSketchId:string|null=null;
	/** The material colours the appearance surface hands in, by material id. */
	materialColours=new Map<string,string>();
	/** Bodies hidden for this session: not drawn, not pickable, not boxed. Never saved. */
	readonly hiddenBodies=new Set<string>();
	readonly frameCosts:number[]=[];
	/** The milliseconds each hover pick took, newest last. */
	readonly hoverCosts:number[]=[];
	/* THE HOVER: what the pointer is over, and what a panel or the tree asks to preselect. */
	private pointerHover:Selection|null=null;private externalHover:Selection[]=[];private previewEdges:Selection[]=[];private hoverEvent:{clientX:number;clientY:number;altKey:boolean}|null=null;private hoverPending:(()=>void)|null=null;
	private shownSketches='';
	constructor(private canvas:HTMLCanvasElement,private options:Options){
		this.renderer=new THREE.WebGLRenderer({canvas,antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setClearColor('#15191d');
		this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
		this.camera.up.set(0,0,1);this.camera.position.set(7,-9,7);this.camera.lookAt(this.target);
		this.scene.add(new THREE.HemisphereLight('#e2edf4','#53616a',2));
		for(const [position,intensity]of [[[5,-4,8],3],[[-4,-2,3],1.4],[[2,6,5],2.5]] as [number[],number][]){const light=new THREE.DirectionalLight('#e4edf2',intensity);light.position.fromArray(position);this.scene.add(light);}
		this.scene.add(this.solids,this.sketchLayer,this.refs,this.overlay,this.guides,this.gizmo);
		this.buildTriad();
		this.drawingTool=new DrawingTool({
			planeHit:(e,plane)=>this.planeHit(e,plane),zoom:()=>this.camera.zoom,
			guide:(points,color)=>{this.clear(this.guides);const line=polyline(points,color??'#a5ecff',1,false);line.renderOrder=10;this.guides.add(line);this.invalidate();},
			clearGuides:()=>{this.clear(this.guides);this.invalidate();},
			error:message=>this.options.error(message),
			draft:(draft,ref)=>this.options.draft(draft,ref),
			capture:e=>this.capture(e.pointerId),pointer:()=>this.pointer
		});
		this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.resize();
		const events={signal:this.abort.signal};
		canvas.addEventListener('pointerdown',e=>void this.down(e),events);
		canvas.addEventListener('pointermove',e=>this.move(e),events);
		canvas.addEventListener('pointerup',e=>this.up(e),events);
		canvas.addEventListener('pointercancel',()=>this.cancel(),events);
		canvas.addEventListener('pointerleave',()=>{if(!this.drag&&!this.boxing&&!this.orbit){this.hoverEvent=null;this.setPointerHover(null);}},events);
		canvas.addEventListener('wheel',e=>this.wheel(e),{...events,passive:false});
		/* The browser's own menu never opens over the model; IdeaCAD's does, built from what is under the pointer. */
		canvas.addEventListener('contextmenu',e=>{e.preventDefault();if(this.orbit||this.drag||this.boxing||this.editingPlane||!this.options.contextMenu)return;this.options.contextMenu({x:e.clientX,y:e.clientY},this.pickAt({clientX:e.clientX,clientY:e.clientY,altKey:e.altKey}));},events);
		canvas.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();},events);
		canvas.addEventListener('keydown',e=>{if(this.drawingTool.key(e)){e.preventDefault();this.invalidate();}},events);
		/* The datum-plane setting is written by the reference panel; a change redraws the scene. destroy() aborts, which unsubscribes. */
		this.abort.signal.addEventListener('abort',onDatumPlanesChange(()=>this.display(this.model)));
	}
	private resize(){const width=this.canvas.clientWidth,height=this.canvas.clientHeight;if(width<=0||height<=0)return;this.renderer.setSize(width,height,false);this.camera.left=-3*width/height;this.camera.right=3*width/height;this.camera.top=3;this.camera.bottom=-3;this.camera.updateProjectionMatrix();this.measureTriad();this.buildOverlay();this.invalidate();}
	invalidate(){if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;const start=performance.now();this.sizeLabels();this.pullOverlay();this.renderer.render(this.scene,this.camera);this.renderTriad();this.frameCosts.push(performance.now()-start);});}
	/** World units per CSS pixel at the current zoom. */
	private perPixel(){const h=this.canvas.clientHeight||1;return(this.camera.top-this.camera.bottom)/(this.camera.zoom*h);}
	/** Reference and plane names stay a readable size on screen at every zoom: each name is scaled to `LABEL_PX` tall for the current zoom, keeping its own width-to-height ratio. */
	private sizeLabels(){
		const h=this.canvas.clientHeight;if(h<=0)return;const perPixel=this.perPixel();
		for(const o of this.refs.children){if(!(o as THREE.Sprite).isSprite||!o.userData.label)continue;const aspect=o.userData.aspect??(o.scale.x/Math.max(o.scale.y,1e-9));o.userData.aspect=aspect;const y=LABEL_PX*perPixel;o.scale.set(y*aspect,y,1);}
	}
	/** The thick edge lines sit a few pixels toward the camera, so the faces meeting at an inside corner do not hide half their width. In an orthographic view this moves nothing on screen. */
	private pullOverlay(){const d=this.camera.getWorldDirection(new THREE.Vector3());this.overlay.position.copy(d.multiplyScalar(-6*this.perPixel()));}
	/* ------------------------------------------------------------------ THE CORNER TRIAD */
	/** The model's axes in its own corner: the same red, green and blue lines the world-origin helper drew, with X, Y and Z beside them. */
	private buildTriad(){
		this.triadScene.add(new THREE.AxesHelper(1));
		for(const [text,at,color] of [['X',[1.24,0,0],AXIS_COLOURS.x],['Y',[0,1.24,0],AXIS_COLOURS.y],['Z',[0,0,1.24],AXIS_COLOURS.z]] as [string,[number,number,number],string][]){
			const map=triadLetter(text,color);if(!map)continue;
			const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,depthTest:false,depthWrite:false,transparent:true,toneMapped:false}));sprite.position.set(...at);sprite.scale.set(.52,.52,1);this.triadScene.add(sprite);
		}
	}
	/** The element whose box the triad is drawn in. The workspace positions it in CSS; the viewport reads it at every resize. */
	setTriadSlot(slot:HTMLElement|null){this.triadSlot=slot;this.measureTriad();this.invalidate();}
	private measureTriad(){const slot=this.triadSlot;if(!slot){this.triadBox={left:0,bottom:0,size:0};return;}const c=this.canvas.getBoundingClientRect(),r=slot.getBoundingClientRect();this.triadBox={left:r.left-c.left,bottom:c.bottom-r.bottom,size:Math.min(r.width,r.height)};}
	/** The triad's box in canvas pixels from the bottom-left, for a measurement to compare against the chrome around it. */
	triadRect(){return{...this.triadBox};}
	private renderTriad(){
		const {left,bottom,size}=this.triadBox;if(!this.triadShown||size<=0)return;
		const r=this.renderer,dir=this.camera.getWorldDirection(new THREE.Vector3());
		this.triadCamera.position.copy(dir.multiplyScalar(-5));this.triadCamera.quaternion.copy(this.camera.quaternion);this.triadCamera.updateMatrixWorld();
		r.setScissorTest(true);r.setScissor(left,bottom,size,size);r.setViewport(left,bottom,size,size);r.autoClear=false;r.clearDepth();r.render(this.triadScene,this.triadCamera);r.autoClear=true;r.setScissorTest(false);r.setViewport(0,0,this.canvas.clientWidth,this.canvas.clientHeight);
	}
	/** Capture the pointer for a drag, as a courtesy: a pointer the browser no longer counts as active (a synthetic event, a lost touch) is simply not captured, and the drag goes on. */
	private capture(pointerId:number){try{this.canvas.setPointerCapture(pointerId);}catch{/* not an active pointer */}}
	private clear(group:THREE.Group){for(const object of [...group.children]){group.remove(object);disposeObject(object);}}
	private geometry(mesh:{positions:Float32Array;normals:Float32Array;indices:Uint32Array}){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(mesh.positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(mesh.normals,3));geometry.setIndex(new THREE.BufferAttribute(mesh.indices,1));return geometry;}
	/* ------------------------------------------------------------------ DRAWING THE MODEL */
	/** Remember a pick object's own colour, opacity and size as it was made, so painting it back is exact whoever made it. */
	private register(object:THREE.Object3D,role:Role){
		const m=(object as THREE.Mesh).material as THREE.Material&{color?:THREE.Color;size?:number};
		object.userData.role=role;object.userData.paint={color:m.color?`#${m.color.getHexString()}`:null,opacity:m.opacity,size:m.size};
		const s=object.userData.selection as Selection|undefined;if(!s)return;
		const key=selectionKey(s);const list=this.index.get(key);if(list)list.push(object);else this.index.set(key,[object]);
		if(role==='face'){const faces=this.bodyFaces.get(s.bodyId);if(faces)faces.push(object);else this.bodyFaces.set(s.bodyId,[object]);}
	}
	display(model:ModelProjection){
		this.model=model;this.clear(this.solids);this.clear(this.refs);this.faces=[];this.edges=[];this.vertices=[];this.refObjects=[];this.datumObjects=[];this.index.clear();this.bodyFaces.clear();
		for(const body of model.bodies){
			if(this.hiddenBodies.has(body.id))continue;
			const colour=bodyColour(body,this.materialColours.get(body.materialId??''));
			for(const face of body.faces){const mesh=new THREE.Mesh(this.geometry(face),new THREE.MeshStandardMaterial({color:colour,metalness:.42,roughness:.4,side:THREE.DoubleSide}));mesh.userData={selection:{bodyId:body.id,kind:'face',id:face.id},normal:face.normal,center:face.center,base:colour,kind:face.kind};this.solids.add(mesh);this.faces.push(mesh);this.register(mesh,'face');}
			for(const edge of body.edges){
				const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(edge.points,3));
				const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:'#394c59'}));line.userData={selection:{bodyId:body.id,kind:'edge',id:edge.id},base:'#394c59'};this.solids.add(line);this.edges.push(line);this.register(line,'edge');
			}
			for(const vertex of body.vertices){const point=new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...vertex.point)]),new THREE.PointsMaterial({color:'#e7f6ff',size:6,sizeAttenuation:false,transparent:true,opacity:0}));point.userData={selection:{bodyId:body.id,kind:'vertex',id:vertex.id},base:'#e7f6ff'};this.solids.add(point);this.vertices.push(point);this.register(point,'vertex');}
		}
		this.buildSketches();
		for(const ref of model.references)for(const object of referenceObjects(ref)){this.refs.add(object);this.refObjects.push(object);this.register(object,'reference');}
		/* Front, Top and Right and the Origin, when the preference (or a student's own press) says so. Pickable, but lowest of everything: a face, an edge or a reference always wins the press. */
		for(const object of datumPlaneObjects(model,{forced:this.datumForced})){this.refs.add(object);this.datumObjects.push(object);this.register(object,'datum');}
		for(const object of originMarkerObjects(model,{forced:this.datumForced}))this.refs.add(object);
		this.highlight();
		/* The model moved under a pointer that did not: what it is over is asked again. */
		if(this.hoverEvent&&this.idle())this.scheduleHover(this.hoverEvent);
	}
	/** Whether a sketch is drawn: every sketch a later feature has not consumed, and a consumed one only while it is open, selected, or hovered from the tree. */
	private sketchShown(sketch:SketchProjection){
		if(!sketch.consumed||sketch.feature===this.editingSketchId)return true;
		const s:Selection={bodyId:'',kind:'sketch',id:sketch.feature};
		/* The tree's hover shows one; the POINTER's never does, or a sketch shown for a selection would keep itself shown by being under the pointer. */
		return this.options.getSelections().some(a=>a.kind==='sketch'&&a.id===s.id)||this.externalHover.some(a=>a.kind==='sketch'&&a.id===s.id);
	}
	private sketchKey(){return this.model.sketches.filter(s=>this.sketchShown(s)).map(s=>s.feature).join('|');}
	private buildSketches(){
		for(const o of this.sketchObjs){const key=selectionKey(o.userData.selection as Selection);this.index.delete(key);}
		this.clear(this.sketchLayer);this.sketchObjs=[];
		for(const sketch of this.model.sketches){if(!this.sketchShown(sketch))continue;for(const object of sketchObjects(sketch)){this.sketchLayer.add(object);this.sketchObjs.push(object);this.register(object,object.userData.region?'sketch-fill':'sketch-line');}}
		this.shownSketches=this.sketchKey();
	}
	/* ------------------------------------------------------------------ THE THREE LOOKS */
	/** Whether an object's selection is selected: named exactly, or a face of a selected body (a body's edges keep their own colour, so its shape still reads). */
	private matches(list:readonly Selection[],s:Selection){return list.some(a=>a.kind==='body'?(!!s.bodyId&&a.bodyId===s.bodyId&&s.kind==='face'):a.kind===s.kind&&a.id===s.id&&a.bodyId===s.bodyId);}
	private hoverSet():Selection[]{return this.pointerHover?[...this.externalHover,this.pointerHover]:this.externalHover;}
	/** Paint one pick object from what is selected and what is hovered. */
	private paint(object:THREE.Object3D,selections:readonly Selection[]=this.options.getSelections(),hovered:readonly Selection[]=this.hoverSet()){
		const s=object.userData.selection as Selection|undefined,p=object.userData.paint as {color:string|null;opacity:number;size?:number}|undefined;if(!s||!p)return;
		const sel=this.matches(selections,s),hov=!sel&&this.matches(hovered,s);
		const m=(object as THREE.Mesh).material as THREE.Material&{color?:THREE.Color;size?:number};const role=object.userData.role as Role;
		const base=p.color??'#91a2ad';
		if(role==='face'){m.color?.set(sel?SELECTED_COLOUR:base);if(hov&&m.color)m.color.lerp(new THREE.Color(HOVER_COLOUR),.42);}
		else if(role==='vertex'){m.color?.set(sel?SELECTED_COLOUR:HOVER_COLOUR);m.opacity=0;/* the dot is drawn in the overlay, over the faces */}
		else if(role==='datum'){m.color?.set(sel?SELECTED_COLOUR:hov?HOVER_COLOUR:base);m.opacity=object.userData.part==='fill'?(sel?.09:hov?.12:p.opacity):sel||hov?1:p.opacity;}
		else if(role==='sketch-fill'){m.color?.set(sel?SELECTED_COLOUR:hov?HOVER_COLOUR:base);m.opacity=sel||hov?Math.min(.5,p.opacity*2.2+.04):p.opacity;}
		else if(role==='reference'&&(object as THREE.Mesh).isMesh){m.color?.set(sel?SELECTED_COLOUR:hov?HOVER_COLOUR:base);m.opacity=sel||hov?Math.min(.3,p.opacity*2.5):p.opacity;}
		else {m.color?.set(sel?SELECTED_COLOUR:hov?HOVER_COLOUR:base);if(role==='sketch-line')m.opacity=sel||hov?1:p.opacity;}
	}
	/** Every pick object, repainted: after a selection changes. */
	highlight(){
		if(this.sketchKey()!==this.shownSketches)this.buildSketches();
		const selections=this.options.getSelections(),hovered=this.hoverSet();
		for(const object of [...this.faces,...this.sketchObjs,...this.edges,...this.vertices,...this.refObjects,...this.datumObjects])this.paint(object,selections,hovered);
		this.buildOverlay();this.drawGizmo();this.invalidate();
	}
	/** The objects a selection paints: its own, or every face of a body. */
	private objectsFor(s:Selection){return s.kind==='body'?this.bodyFaces.get(s.bodyId)??[]:this.index.get(selectionKey(s))??[];}
	/** Repaint only what the hover touched: the objects of the old hover and of the new one. */
	private repaintHover(before:readonly Selection[]){
		if(this.sketchKey()!==this.shownSketches){this.buildSketches();this.highlight();return;}
		const selections=this.options.getSelections(),hovered=this.hoverSet(),touched=new Set<THREE.Object3D>();
		for(const s of [...before,...hovered])for(const o of this.objectsFor(s))touched.add(o);
		for(const o of touched)this.paint(o,selections,hovered);
		this.buildOverlay();this.invalidate();
	}
	/** The thick lines of the selected and hovered edges, and the dots of the selected and hovered vertices. */
	private buildOverlay(){
		this.clear(this.overlay);
		const width=this.canvas.clientWidth,height=this.canvas.clientHeight;if(width<=0||height<=0)return;
		const selections=this.options.getSelections(),hovered=this.hoverSet();
		const add=(s:Selection,color:string,px:number,order:number,xray=false)=>{
			if(s.kind==='edge'){const edge=this.model.bodies.find(b=>b.id===s.bodyId)?.edges.find(e=>e.id===s.id);if(!edge||this.hiddenBodies.has(s.bodyId)||edge.points.length<6)return;const g=new LineGeometry();g.setPositions(Array.from(edge.points));const m=new LineMaterial({color:new THREE.Color(color).getHex(),linewidth:px,worldUnits:false,depthTest:!xray,transparent:xray,opacity:xray?.85:1});m.resolution.set(width,height);const line=new Line2(g,m);line.computeLineDistances();line.renderOrder=order;line.raycast=()=>{};this.overlay.add(line);}
			else if(s.kind==='vertex'){const v=this.model.bodies.find(b=>b.id===s.bodyId)?.vertices.find(x=>x.id===s.id);if(!v||this.hiddenBodies.has(s.bodyId))return;const dot=new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...v.point)]),new THREE.PointsMaterial({color,size:px*2.4,sizeAttenuation:false}));dot.renderOrder=order;dot.raycast=()=>{};this.overlay.add(dot);}
		};
		for(const s of selections)add(s,SELECTED_COLOUR,SELECTED_EDGE_PX,6);
		for(const s of this.previewEdges)if(!this.matches(selections,s))add(s,PREVIEW_COLOUR,HOVER_EDGE_PX,7);
		for(const s of hovered)if(!this.matches(selections,s)&&!this.matches(this.previewEdges,s))add(s,HOVER_COLOUR,HOVER_EDGE_PX,7);
		/* A face named from a list (Select Other, the tree, a crumb) may be behind the model: its outline is drawn through it, so the preview shows which face even from the far side. */
		for(const s of this.externalHover)if(s.kind==='face'&&!this.matches(selections,s)){const face=this.model.bodies.find(b=>b.id===s.bodyId)?.faces.find(f=>f.id===s.id);for(const id of face?.edges??[])add({bodyId:s.bodyId,kind:'edge',id},HOVER_COLOUR,3,8,true);}
	}
	private drawGizmo(){
		this.clear(this.gizmo);const selection=this.options.getSelections()[0],tool=this.options.getTool();if(!selection||!['move','rotate','scale'].includes(tool))return;
		const body=this.model.bodies.find(b=>b.id===selection.bodyId);if(!body||this.hiddenBodies.has(body.id))return;
		buildTriad(this.gizmo,{tool:tool as 'move'|'rotate'|'scale',selection,center:body.centerOfMass,scale:1/this.camera.zoom});
	}
	/* ------------------------------------------------------------------ HOVER */
	/** What a panel or the tree preselects (a row's geometry, a crumb's item), or null to stop. */
	setExternalHover(selections:readonly Selection[]|null){
		/* Clearing a preview that is not there changes nothing and repaints nothing: a component's teardown clears its preview unconditionally, at a moment Svelte may hand it the selection as it was a frame ago. */
		if(!this.externalHover.length&&!selections?.length)return;
		const before=this.hoverSet();this.externalHover=[...(selections??[])];this.repaintHover(before);
	}
	/** The edges a Fillet or Chamfer under the pointer would round (its tangent chain), drawn before any press; null stops. */
	setPreviewEdges(edges:readonly Selection[]|null){if(!this.previewEdges.length&&!edges?.length)return;this.previewEdges=[...(edges??[])];this.buildOverlay();this.invalidate();}
	/** What the pointer is over right now. */
	hovered(){return this.pointerHover;}
	/** How many pick objects of each kind are drawn: a measurement reads it to say a consumed sketch is gone. */
	drawnCounts(){return{preview:this.previewEdges.length,faces:this.faces.length,edges:this.edges.length,vertices:this.vertices.length,sketches:this.sketchObjs.length,references:this.refObjects.length,datums:this.datumObjects.length,overlay:this.overlay.children.length,externalHover:this.externalHover.length,editing:this.editingSketchId};}
	private setPointerHover(selection:Selection|null){
		const same=selection&&this.pointerHover?selectionKey(selection)===selectionKey(this.pointerHover):selection===this.pointerHover;
		this.canvas.style.cursor=isDrawTool(this.options.getTool())?'crosshair':selection?'pointer':'';
		/* What the pointer is over, as a word a measurement can read. */
		if(selection)this.canvas.dataset.hover=selection.kind;else delete this.canvas.dataset.hover;
		if(same)return;
		const before=this.hoverSet();this.pointerHover=selection;this.repaintHover(before);this.options.hover?.(selection);
	}
	private scheduleHover(e:{clientX:number;clientY:number;altKey:boolean}){
		this.hoverEvent={clientX:e.clientX,clientY:e.clientY,altKey:e.altKey};
		if(!this.hoverPending)this.hoverPending=schedule(()=>{this.hoverPending=null;this.runHover();});
	}
	private idle(){return !this.orbit&&!this.drag&&!this.boxing&&!this.drawingTool.active&&!this.editingPlane;}
	private runHover(){
		const e=this.hoverEvent;if(!e)return;
		if(!this.idle()){if(this.editingPlane)this.setPointerHover(null);return;}
		const start=performance.now();const pick=this.pickAt(e,true);this.hoverCosts.push(performance.now()-start);if(this.hoverCosts.length>4000)this.hoverCosts.splice(0,this.hoverCosts.length-4000);
		this.setPointerHover(pick.best?.selection??null);
		if(pick.gizmo)this.canvas.style.cursor='grab';
	}
	/* ------------------------------------------------------------------ PICKING */
	private setRay(e:{clientX:number;clientY:number}){const r=this.canvas.getBoundingClientRect();this.ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);const threshold=(this.camera.top-this.camera.bottom)/r.height/this.camera.zoom*7;this.ray.params.Line={threshold};this.ray.params.Points={threshold};}
	/**
	 * THE ONE PICK: everything under a point of the canvas, as the press, the
	 * hover, the right-click menu and Select Other all see it. The gizmo's
	 * handles come first and are answered on their own; everything else goes
	 * through `orderPicks` with the active tool's kinds and the pick filter.
	 */
	pickAt(e:{clientX:number;clientY:number;altKey?:boolean},bestOnly=false):ViewportPick&{gizmo?:THREE.Intersection;hit?:PickHit<THREE.Object3D>}{
		this.setRay(e);const tool=this.options.getTool();
		const gizmo=this.gizmo.children.length?this.ray.intersectObject(this.gizmo,true)[0]:undefined;if(gizmo)return{best:null,all:[],gizmo};
		const hits:PickHit<THREE.Object3D>[]=[];
		const push=(list:THREE.Intersection[],part:PickPart)=>{for(const h of list){const s=h.object.userData.selection as Selection|undefined;if(!s)continue;hits.push({selection:s,part,distance:h.distance,point:vector(h.point.toArray()),datumPart:h.object.userData.part,object:h.object});}};
		push(this.ray.intersectObjects(this.faces,false),'face');
		push(this.ray.intersectObjects(this.sketchObjs,false),'sketch');
		push(this.ray.intersectObjects(this.edges,false),'edge');
		push(this.ray.intersectObjects(this.vertices,false),'vertex');
		push(this.ray.intersectObjects(this.refObjects,false),'reference');
		if(this.datumObjects.length)push(this.ray.intersectObjects(this.datumObjects,false),'datum');
		const drawing=isDrawTool(tool);
		const picked=orderPicks(hits,{allowed:pickKinds(tool,this.options.getPickFilter?.()??[]),drawing,edgesFirst:tool==='fillet'||tool==='chamfer',referencesWin:['reference','revolve','mate','select','measure'].includes(tool)||drawing,alt:!!e.altKey,epsilon:.025/this.camera.zoom});
		const out=(h:PickHit<THREE.Object3D>):PickCandidate=>({selection:h.selection,point:h.point,distance:h.distance,part:h.part});
		return{best:picked.best?out(picked.best):null,all:bestOnly?[]:picked.all.map(out),hit:picked.best??undefined};
	}
	private planeHit(e:{clientX:number;clientY:number},plane:SketchPlane):Vec3|null{this.setRay(e);const result=this.ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...plane.normal),new THREE.Vector3(...plane.origin)),new THREE.Vector3());return result?vector(result.toArray()):null;}
	private viewPlane(e:{clientX:number;clientY:number},through=this.target){this.setRay(e);return this.ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()),through),new THREE.Vector3());}
	/** Plane coordinates of a pointer event on the sketch being edited. */
	private editingPoint(e:{clientX:number;clientY:number}):[number,number]|null{if(!this.editingPlane)return null;const p=this.planeHit(e,this.editingPlane);if(!p)return null;const d=sub(p,this.editingPlane.origin);return[dot(d,this.editingPlane.u),dot(d,this.editingPlane.v)];}
	/** The plane a drawing press lands on: the one being drawn on, a flat face under the pointer, a reference plane, or the chosen datum. */
	private drawPlaneFor(hit:PickHit<THREE.Object3D>|undefined):DrawPlane{
		const current=this.drawingTool.plane;if(current)return current;
		const data=hit?.object?.userData;
		if(hit&&data?.selection?.kind==='face'&&Math.hypot(...(data.normal as Vec3))>.9){
			const s=data.selection as Selection,body=this.model.bodies.find(b=>b.id===s.bodyId),face=body?.faces.find(f=>f.id===s.id);
			if(body&&face)return{plane:planeFromNormal(face.normal,hit.point),ref:{kind:'face',face:{body:body.id,name:face.id,hint:{kind:face.kind,center:face.center,normal:face.normal,area:face.area}}}};
		}
		if(data?.datum){const datum=data.datum as 'XY'|'XZ'|'YZ';return{plane:datumPlane(datum),ref:{kind:'datum',datum}};}
		if(data?.selection?.kind==='reference'&&data.plane)return{plane:data.plane,ref:{kind:'reference',feature:(data.selection as Selection).id}};
		return this.options.getPlane();
	}
	/**
	 * Whether a point on a body's surface can be seen: a ray from the camera
	 * toward it meets no face of a shown body sooner. Box select asks it at a
	 * few sample points of each item that fell inside the box.
	 */
	private visibleAny(points:Vec3[]){
		const dir=this.camera.getWorldDirection(new THREE.Vector3()),far=1e4,eps=4*this.perPixel()+1e-4;
		for(const p of points){const origin=new THREE.Vector3(...p).addScaledVector(dir,-far);this.ray.set(origin,dir);const hit=this.ray.intersectObjects(this.faces,false)[0];if(!hit||hit.distance>=far-eps)return true;}
		return false;
	}
	/** What a finished box picks, with the active tool's kinds and the pick filter. */
	boxPicks(rect:ScreenRect,mode:BoxMode):Selection[]{
		return boxSelect(this.model,rect,mode,boxKinds(this.options.getTool(),this.options.getPickFilter?.()??[]),{project:p=>this.projectPoint(p),visible:points=>this.visibleAny(points),hidden:this.hiddenBodies});
	}
	/* ------------------------------------------------------------------ POINTER */
	private async down(e:PointerEvent){
		this.canvas.focus();this.pointer={x:e.offsetX,y:e.offsetY};this.press=null;
		if(e.button===1){e.preventDefault();if(e.altKey)return;this.setRay(e);const hit=this.ray.intersectObjects(this.faces,false)[0],pivot=hit?.point.clone()??this.viewPlane(e);if(!pivot)return;this.orbit={x:e.clientX,y:e.clientY,pivot,mode:e.ctrlKey?'pan':e.shiftKey?'zoom':'orbit',pointerId:e.pointerId};this.capture(e.pointerId);this.options.busyPointer?.();return;}
		if(e.button!==0)return;
		if(this.editingPlane&&this.options.sketchPointer){const at=this.editingPoint(e);if(at&&this.options.sketchPointer('down',at,e)){this.capture(e.pointerId);return;}}
		const tool=this.options.getTool(),pick=this.pickAt(e),hit=pick.hit;
		if(isDrawTool(tool)&&this.options.canWrite()){this.options.busyPointer?.();this.drawingTool.down(e,tool,this.drawPlaneFor(hit));return;}
		if(pick.gizmo){if(!e.shiftKey)this.startDrag(e,pick.gizmo,null,tool);return;}
		/* EMPTY SPACE: a click clears the selection (unless Ctrl or Shift is held), a drag draws a box. The sketch being edited takes its own presses above. */
		if(!hit){const append=e.ctrlKey||e.shiftKey||e.metaKey;this.boxing={x:e.clientX,y:e.clientY,append,pointerId:e.pointerId,active:false,mode:'window',rect:{left:e.clientX,top:e.clientY,right:e.clientX,bottom:e.clientY}};this.capture(e.pointerId);return;}
		let selection=hit.selection;
		if(['rotate','scale','linear-pattern','circular-pattern'].includes(tool)&&selection.kind!=='sketch'&&selection.kind!=='reference')selection={bodyId:selection.bodyId,kind:'body',id:selection.bodyId};
		/* Ctrl or Shift adds or takes away, as SolidWorks does; a plain press replaces. */
		const append=e.shiftKey||e.ctrlKey||e.metaKey;
		/* A plain press on something already among several selected keeps them all, so a drag rounds or pushes every one; a plain CLICK on it (no drag) then selects it alone, on release. */
		const current=this.options.getSelections(),among=!append&&current.length>1&&this.matches(current.filter(a=>a.kind!=='body'),selection);
		if(!among){this.options.select(selection,append);this.highlight();}
		this.press={x:e.clientX,y:e.clientY,reselect:among?selection:undefined};
		if(!this.options.canWrite()||append)return;
		if(selection.kind==='reference'||SELECT_ONLY_TOOLS.includes(tool))return;
		this.startDrag(e,null,hit,tool,selection);
	}
	private startDrag(e:PointerEvent,gizmo:THREE.Intersection|null,hit:PickHit<THREE.Object3D>|undefined|null,tool:Tool,picked?:Selection){
		if(!this.options.canWrite())return;
		const handle=triadHandle(gizmo??undefined);
		/* A handle carries the selection the triad was drawn for; a tool that turns or copies a body takes the whole body. */
		let selection=picked??(gizmo?.object.userData.selection as Selection|undefined);if(!selection)return;
		if(!picked&&['rotate','scale','linear-pattern','circular-pattern'].includes(tool)&&selection.kind!=='sketch'&&selection.kind!=='reference')selection={bodyId:selection.bodyId,kind:'body',id:selection.bodyId};
		const normal=handle?.axis??hit?.object?.userData.normal??[0,0,1];
		const start=gizmo?vector(gizmo.point.toArray()):hit?hit.point:[0,0,0] as Vec3;
		const gesture:Gesture={selection,tool,start,axis:Math.hypot(...normal)>.9?normal:[0,0,1],handle};
		/* Snap targets and the body's own anchors are computed once at press: the anchors are the corners at the gesture's start, the targets are the other bodies. */
		const snap=handle?{targets:snapTargetsFrom(this.model,[selection.bodyId]),anchors:bodyAnchors(this.model,selection.bodyId)}:undefined;
		this.drag={gesture,x:e.clientX,y:e.clientY,ready:false,starting:false,pointerId:e.pointerId,snap};this.capture(e.pointerId);
	}
	private move(e:PointerEvent){
		this.pointer={x:e.offsetX,y:e.offsetY};
		if(this.orbit){const o=this.orbit,dx=e.clientX-o.x,dy=e.clientY-o.y;o.x=e.clientX;o.y=e.clientY;e.preventDefault();
			if(o.mode==='orbit')orbitCamera(this.camera,this.target,o.pivot,dx,dy,this.canvas.clientWidth);
			else if(o.mode==='zoom'){this.camera.zoom*=Math.exp(-dy/200);this.camera.updateProjectionMatrix();}
			else{const right=new THREE.Vector3(1,0,0).applyQuaternion(this.camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(this.camera.quaternion),delta=right.multiplyScalar(-dx*(this.camera.right-this.camera.left)/this.canvas.clientWidth/this.camera.zoom).add(up.multiplyScalar(dy*6/this.canvas.clientHeight/this.camera.zoom));this.camera.position.add(delta);this.target.add(delta);}
			this.camera.updateMatrixWorld();this.invalidate();return;
		}
		const b=this.boxing;
		if(b){
			if(!b.active&&Math.hypot(e.clientX-b.x,e.clientY-b.y)<BOX_THRESHOLD_PX)return;
			if(!b.active){b.active=true;this.setPointerHover(null);this.options.busyPointer?.();}
			b.mode=boxMode({x:b.x,y:b.y},{x:e.clientX,y:e.clientY});b.rect=boxRect({x:b.x,y:b.y},{x:e.clientX,y:e.clientY});this.options.box?.({rect:b.rect,mode:b.mode});return;
		}
		if(this.editingPlane&&this.options.sketchPointer&&!this.drawingTool.active&&!this.drag){const at=this.editingPoint(e);if(at)this.options.sketchPointer('move',at,e);}
		if(this.drawingTool.move(e))return;
		const d=this.drag;if(!d){if(e.buttons===0)this.scheduleHover(e);return;}if(Math.hypot(e.clientX-d.x,e.clientY-d.y)<3)return;
		if(!d.ready){if(!d.starting){d.starting=true;this.press=null;this.setPointerHover(null);this.options.busyPointer?.();void this.options.begin(d.gesture).then(()=>{if(this.drag===d){d.ready=true;this.move(e);}}).catch(error=>{this.options.error(error instanceof Error?error.message:String(error));this.drag=null;});}return;}
		const r=this.canvas.getBoundingClientRect();
		const value=dragValue({
			start:d.gesture.start,axis:d.gesture.axis,handle:d.gesture.handle,
			origin:{x:d.x,y:d.y},pointer:{x:e.clientX,y:e.clientY},offset:this.pointer,
			canvas:{width:this.canvas.clientWidth,height:this.canvas.clientHeight},zoom:this.camera.zoom,
			toScreen:(p)=>{const v=new THREE.Vector3(...p).project(this.camera);return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};},
			viewPlanePoint:(client,through)=>{const p=this.viewPlane({clientX:client.x,clientY:client.y},new THREE.Vector3(...through));return p?vector(p.toArray()):null;},
			planePoint:(client,plane)=>{this.setRay({clientX:client.x,clientY:client.y});const p=this.ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...plane.normal),new THREE.Vector3(...plane.origin)),new THREE.Vector3());return p?vector(p.toArray()):null;},
			viewDirection:vector(this.camera.getWorldDirection(new THREE.Vector3()).toArray()),
			snapTargets:d.snap?.targets,anchors:d.snap?.anchors,
			modifiers:{shift:e.shiftKey,ctrl:e.ctrlKey,alt:e.altKey}
		});
		d.last=value;this.options.update(value);
	}
	private up(e:PointerEvent){
		const press=this.press;this.press=null;
		/* A plain click on one of several selected items, which did not become a drag: now it is selected alone. */
		if(press?.reselect&&!this.drag?.starting){this.options.select(press.reselect,false);this.highlight();}
		if(this.orbit){this.orbit=null;}
		else if(this.boxing){
			const b=this.boxing;this.boxing=null;
			if(b.active){this.options.box?.(null);this.options.boxSelect?.(this.boxPicks(b.rect,b.mode),b.append);this.options.clicked?.({x:e.clientX,y:e.clientY},e.pointerType!=='mouse');}
			else if(!b.append){this.options.select(null,false);this.highlight();this.options.clicked?.({x:e.clientX,y:e.clientY},e.pointerType!=='mouse');}
		}
		else if(this.editingPlane&&this.options.sketchPointer&&!this.drawingTool.active&&!this.drag){const at=this.editingPoint(e);if(at)this.options.sketchPointer('up',at,e);}
		else if(this.drawingTool.up()){/* a drag-drawn profile finished */}
		else if(this.drag){const d=this.drag;this.drag=null;if(d.last)this.options.end();else if(d.starting)this.options.cancel();else if(press)this.options.clicked?.({x:e.clientX,y:e.clientY},e.pointerType!=='mouse');}
		else if(press)this.options.clicked?.({x:e.clientX,y:e.clientY},e.pointerType!=='mouse');
		if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);this.invalidate();
	}
	/** The live readout of what is being drawn: width x height, diameter, or the current side, in inches. */
	drawingReadout(){return this.drawingTool.readout();}
	private wheel(e:WheelEvent){e.preventDefault();const before=this.viewPlane(e);this.camera.zoom*=Math.exp(-e.deltaY*.001);this.camera.updateProjectionMatrix();const after=this.viewPlane(e);if(before&&after){const delta=before.sub(after);this.camera.position.add(delta);this.target.add(delta);}this.camera.updateMatrixWorld();this.drawGizmo();this.invalidate();}
	/* ------------------------------------------------------------------ CAMERA */
	fit(){
		/* An empty part fits its Front, Top and Right planes, at a size that leaves the top of the view for the start cue. */
		const onlyPlanes=!this.solids.children.length&&!this.sketchLayer.children.length;
		if(onlyPlanes&&!this.datumObjects.length){this.camera.zoom=1;this.camera.updateProjectionMatrix();this.invalidate();return;}
		const bounds=new THREE.Box3();if(this.solids.children.length)bounds.setFromObject(this.solids);else if(this.sketchLayer.children.length)bounds.setFromObject(this.sketchLayer);else for(const o of this.datumObjects)if(o.userData.part==='fill')bounds.expandByObject(o);const center=bounds.getCenter(new THREE.Vector3());this.camera.position.add(center.clone().sub(this.target));this.target.copy(center);
		this.camera.updateMatrixWorld();const corners:THREE.Vector3[]=[];for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])corners.push(new THREE.Vector3(x,y,z).applyMatrix4(this.camera.matrixWorldInverse));
		const projected=new THREE.Box3().setFromPoints(corners),size=projected.getSize(new THREE.Vector3());
		this.camera.zoom=(onlyPlanes?.5:.76)*Math.min((this.camera.right-this.camera.left)/Math.max(size.x,1e-7),(this.camera.top-this.camera.bottom)/Math.max(size.y,1e-7));this.camera.updateProjectionMatrix();this.drawGizmo();this.invalidate();
	}
	/**
	 * Face a plane head on, keeping the point the view turns about. Pressed
	 * again while already facing it, the view flips to the other side, as
	 * SolidWorks' Normal To does.
	 */
	normalTo(plane:ResolvedPlane){
		const n=new THREE.Vector3(...plane.normal).normalize();if(n.lengthSq()<.5)return;
		const facing=this.camera.getWorldDirection(new THREE.Vector3()).dot(n)<-.999;
		this.camera.position.copy(this.target).add(n.multiplyScalar(facing?-10:10));this.camera.up.set(...plane.v);this.camera.lookAt(this.target);this.camera.updateMatrixWorld();this.drawGizmo();this.invalidate();
	}
	/** The datum plane the view looks straight at (within about 25 degrees), or null in a view that faces none. */
	facingDatum():'XY'|'XZ'|'YZ'|null{
		const d=this.camera.getWorldDirection(new THREE.Vector3());let best:'XY'|'XZ'|'YZ'|null=null,score=.9;
		for(const [name,n] of [['XY',[0,0,1]],['XZ',[0,1,0]],['YZ',[1,0,0]]] as ['XY'|'XZ'|'YZ',[number,number,number]][]){const a=Math.abs(d.dot(new THREE.Vector3(...n)));if(a>score){score=a;best=name;}}
		return best;
	}
	/** Where the pointer last was over the canvas, in canvas pixels: the value box opens beside it. */
	pointerPosition(){return{...this.pointer};}
	view(name:'iso'|'top'|'front'|'right') {const offset={iso:[7,-9,7],top:[0,0,10],front:[0,-10,0],right:[10,0,0]}[name];this.camera.position.copy(this.target).add(new THREE.Vector3(...offset));this.camera.up.set(0,0,1);if(name==='top')this.camera.up.set(0,1,0);this.camera.lookAt(this.target);this.fit();}
	/** Look straight at a plane, for sketch editing. */
	lookAt(plane:ResolvedPlane){const distance=10;this.target.set(...plane.origin);this.camera.position.copy(this.target).add(new THREE.Vector3(...plane.normal).multiplyScalar(distance));this.camera.up.set(...plane.v);this.camera.lookAt(this.target);this.camera.updateMatrixWorld();this.invalidate();}
	/** A section view: everything on the plane's normal side is cut away. Null restores the whole model. Caps are not drawn. */
	clip(plane:ResolvedPlane|null){
		this.renderer.localClippingEnabled=!!plane;
		this.renderer.clippingPlanes=plane?[new THREE.Plane(new THREE.Vector3(...plane.normal).negate(),dot(plane.normal,plane.origin))]:[];
		this.invalidate();
	}
	/** Hide bodies for this session, or show them again: redrawn at once, never saved. */
	setHiddenBodies(ids:Iterable<string>){this.hiddenBodies.clear();for(const id of ids)this.hiddenBodies.add(id);this.display(this.model);}
	/** Draw transient guide lines (a mate preview, a measurement) until the next clear. */
	guide(points:Vec3[],color='#d9b96a'){const line=polyline(points,color,1,false);line.renderOrder=10;this.guides.add(line);this.invalidate();}
	clearGuides(){this.clear(this.guides);this.invalidate();}
	clearDrawing(){this.drawingTool.cancel();this.invalidate();}
	isDrawing(){return this.drawingTool.active;}
	/** A box, a drag or an orbit is in progress. */
	isPointerBusy(){return !!(this.boxing?.active||this.drag||this.orbit);}
	cancel(){this.orbit=null;this.drag=null;this.press=null;if(this.boxing){this.boxing=null;this.options.box?.(null);}this.clearDrawing();this.options.cancel();this.invalidate();}
	projectPoint(point:Vec3){const p=new THREE.Vector3(...point).project(this.camera),r=this.canvas.getBoundingClientRect();return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}
	/** The world point under a screen position on a plane, for a sketch editor's snapping and a mate preview. */
	unproject(x:number,y:number,plane:ResolvedPlane):Vec3|null{const r=this.canvas.getBoundingClientRect();return this.planeHit({clientX:r.left+x,clientY:r.top+y},plane);}
	/** The canvas as it renders now, RGBA from the bottom row up: two readings a pointer move apart are a pixel diff with no screenshot. */
	readPixels(){this.pullOverlay();this.renderer.render(this.scene,this.camera);this.renderTriad();const gl=this.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;}
	painted(){this.pullOverlay();this.renderer.render(this.scene,this.camera);const gl=this.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let different=0;for(let i=0;i<pixels.length;i+=4)if(Math.abs(pixels[i]-pixels[0])+Math.abs(pixels[i+1]-pixels[1])+Math.abs(pixels[i+2]-pixels[2])>40)different++;return{fraction:different/(pixels.length/4),width:gl.drawingBufferWidth,height:gl.drawingBufferHeight};}
	destroy(){this.abort.abort();this.observer.disconnect();cancelAnimationFrame(this.frame);this.hoverPending?.();this.clear(this.solids);this.clear(this.sketchLayer);this.clear(this.refs);this.clear(this.overlay);this.clear(this.guides);this.clear(this.gizmo);this.renderer.dispose();}
}
export { datumPlane };
/** A letter for the corner triad, drawn on a canvas. Null where there is no document. */
function triadLetter(text:string,color:string):THREE.Texture|null{
	if(typeof document==='undefined')return null;const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');if(!ctx)return null;
	ctx.font='700 46px Rajdhani, "Share Tech Mono", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=7;ctx.strokeStyle='rgba(21,25,29,0.9)';ctx.strokeText(text,32,34);ctx.fillStyle=color;ctx.fillText(text,32,34);
	const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
