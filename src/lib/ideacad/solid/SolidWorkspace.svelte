<script lang="ts">
	/**
	 * THE MODELER. One kernel in a worker, one viewport, the design tree beside
	 * it, and the panels around them. Every edit is a `SolidCommand` sent
	 * through `apply` or a gesture, and every panel reads the same `api`.
	 *
	 * THIS FILE HAS ONE WRITER. Each panel is its own component with `api` as
	 * its only prop (`workspace-api.ts`), so a surface grows in its own file.
	 *
	 * EVERY COMMAND COMES FROM THE REGISTRY (`command-registry.ts`), and every
	 * key goes through ONE shortcut layer here (`keydown`): Escape, the value
	 * box's digits, and each command's keys, read from the student's
	 * preferences over the registry's defaults. The palette, the view control,
	 * command search and the preferences panel all read the same list.
	 *
	 * THE STUDENT'S CHOICES LIVE IN `preferences` (a `PreferenceStore`, from the
	 * route), never in the manifest: the manifest is the model, and everything
	 * `record()` sees change becomes a history row and a save.
	 */
	import { onMount, onDestroy, untrack, tick } from 'svelte';
	import * as THREE from 'three';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import { SaveState } from '$lib/save-state.svelte';
	import { guardSaveNavigation } from '$lib/save-guard.svelte';
	import '../ideacad.css';
	import ToolButton from './ToolButton.svelte';
	import BodyProperties from './BodyProperties.svelte';
	import AdvisorySettings from './AdvisorySettings.svelte';
	import FeatureTree from './FeatureTree.svelte';
	import SketchEditor from './SketchEditor.svelte';
	import ReferencePanel from './ReferencePanel.svelte';
	import MatePanel from './MatePanel.svelte';
	import FeaturePanel from './FeaturePanel.svelte';
	import AddonPanel from './AddonPanel.svelte';
	import DimensionPanel from './DimensionPanel.svelte';
	import MovePanel from './MovePanel.svelte';
	import MeasurePanel from './MeasurePanel.svelte';
	import SectionPanel from './SectionPanel.svelte';
	import ViewControls, { type ViewItem } from './ViewControls.svelte';
	import CommandSearch from './CommandSearch.svelte';
	import EmptyCue from './EmptyCue.svelte';
	import PreferencesPanel from './PreferencesPanel.svelte';
	import { COMMANDS, commandById, effectiveShortcuts, keyFromEvent, keyLabel, recordRecent, type Command, type CommandContext, type CommandGroup, type PanelId } from './command-registry';
	import { MemoryPreferenceStore, applyToModules, captureFromModules, changedGroups, type PreferenceStore } from './preferences';
	import { onDatumPlanesChange, datumPlanesVisible, DATUM_NAMES } from './viewport/reference-layer';
	import { DATUM_SELECTION_PREFIX, type Datum } from './features/reference';
	import { holeFeatureAt, withOptions } from './features/options';
	import { matePreview, MATE_SNAP_TOLERANCE } from './viewport/mate-preview';
	import { parseDimension } from './dimensions/model';
	import type {AdvisoryTransport,AdvisoryRules} from './advisory';
	import {STOCK_MATERIALS} from './advisory';
	import {applyActions,diffTrees} from '../history';
	import {foldGroups,groupHistory,inverseOperation,type DirectRow} from './history';
	import { TOOLS, QUICK_TOOLS } from './tools';
	import { SolidClient } from './client';
	import { SolidViewport, EMPTY_MODEL, type DragValue, type Gesture, type Tool, type DrawPlane } from './viewport';
	import { dragReadout, numericPrompt, numericUnit, withDisplayUnit } from './viewport/readout';
	import { rectangleEntities, type SketchDraft } from './sketch/editor';
	import { datumPlane, planeFromNormal } from './sketch/model';
	import { refFromSelection } from './naming';
	import { newFeatureId } from './features';
	import { download, sketchDxf,profileDxf,solidStl, solidThreeMf } from './export';
	import type { WorkspaceApi } from './workspace-api';
	import type { EdgeRef, EntityRef, FaceRef, Feature, MateKind, ModelProjection, ModelSnapshot, PlaneRef, ResolvedPlane, Selection, SolidCommand, SolidDocument, SolidHistoryAction, SolidManifest, SolidTransport } from './types';

	let {document:opened,transport,advisoryTransport,onback,dev=false,preferences}:{document:SolidDocument;transport:SolidTransport;advisoryTransport?:AdvisoryTransport;onback:()=>void;dev?:boolean;preferences?:PreferenceStore}=$props();
	/* The student's choices, applied to the module settings BEFORE any panel's script runs, so a panel that seeds its boxes from a module setting seeds them with the student's value. A store is only ever handed in once. */
	const prefStore:PreferenceStore=untrack(()=>preferences)??new MemoryPreferenceStore();
	applyToModules(prefStore.current);
	let prefs=$state.raw(prefStore.current);
	let rules:AdvisoryRules|null=$state(null),settingsOpen=$state(false);
	let title=$state(untrack(()=>opened.title));
	let canvas:HTMLCanvasElement=$state()!;
	let client:SolidClient;let viewport:SolidViewport;
	let model:ModelProjection=$state(EMPTY_MODEL);
	let selections:Selection[]=$state([]),tool:Tool=$state('select');
	let error=$state(''),loading=$state(true),busy=$state(false),more=$state(false),objectsOpen=$state(false),addonOpen=$state(false),exportOpen=$state(false),treeOpen=$state(false),referenceOpen=$state(false),matesOpen=$state(false),sectionOpen=$state(false);
	let reopenConfirm=$state(false);
	/* Transient chrome: command search (and the view menu, which is the same list narrowed), the preferences panel. */
	let search=$state<{at:{x:number;y:number};group?:CommandGroup}|null>(null),prefsOpen=$state(false);
	/* A student who pressed "Sketch on a plane" sees the planes whatever the preference, until the part has a feature. */
	let planesForced=$state(false);
	/* The value box: a drawing just released (`drafting`) takes digits before its sketch exists, and an Enter that arrives while the worker is busy waits for it (`submitWhenIdle`). */
	let drafting=$state(false),submitWhenIdle=$state(false);
	let triadSlot:HTMLDivElement|undefined=$state();
	/* The widths the shell's Voice and Report controls take out of the footer, where they are docked. */
	let dockLeft=$state(12),dockRight=$state(12);
	let editingSketch=$state<string|null>(null);
	let measure=$state<{text:string;x:number;y:number}|null>(null),numeric=$state<{value:string;x:number;y:number}|null>(null);
	let numericInput:HTMLInputElement=$state()!;
	let importInput:HTMLInputElement=$state()!;
	let gesture:Gesture|null=null,gestureFeature='',queued:SolidCommand|null=null,pumping:Promise<void>|null=null;
	let currentSnapshot:ModelSnapshot=$state.raw(untrack(()=>opened.snapshot)),revision=untrack(()=>opened.revision);
	/* THE TREE THE SERVER HOLDS, AS OF THE LAST RECORDED OPERATION, and it is not the engine's. A stored version 1 document is upgraded in memory on load, so `currentSnapshot` (the engine's) reads version 2 while the row still holds version 1 until a save carries the upgrade. Every history diff and every undo inverse is computed against THIS tree, and the model a save sends is the tree the recorded actions PRODUCE from it: measured before this split, undoing the first edit of a version 1 document inverted the upgrade too, landed the server on version 1 while p_model was the engine's version 2, and every existing document ended in the recovery panel on its first Undo. */
	let serverManifest:SolidManifest=untrack(()=>opened.snapshot.manifest);
	/** While a sketch is open, the sketch editor installs the handler that receives viewport presses in plane coordinates. */
	let sketchPointer:((event:'down'|'move'|'up',at:[number,number],e:PointerEvent)=>boolean)|null=null;
	let actions:SolidHistoryAction[]=[];let committed=false;let gestureBefore:ModelSnapshot|null=null;let gestureCenter:[number,number,number]=[0,0,0];
	/* The model as it stood when the gesture began: a mate preview reads it, because during the drag `model` already shows the moved body. */
	let gestureModel:ModelProjection=EMPTY_MODEL;let mateCandidate:{kind:MateKind;a:Selection;b:Selection}|null=null;
	let history:DirectRow[]=$state(untrack(()=>opened.history??[{seq:0,kind:'origin',path:'',after:opened.snapshot.manifest}]));
	const historyState=$derived(foldGroups(groupHistory(history)));
	const saveState=new SaveState({save:async()=>{
		if(!actions.length)return {ok:true};
		const batch=actions.slice(),last=batch[batch.length-1];
		try{
			const saved=await transport.save({documentId:opened.id,conceptId:opened.conceptId,expectedRevision:revision,requestId:batch[0].id,title:last.after.title,snapshot:{manifest:last.after,artifacts:currentSnapshot.artifacts},actions:batch});
			revision=saved.revision;const sent=new Set(batch.map(a=>a.id));actions=actions.filter(a=>!sent.has(a.id));void sendThumbnail();return {ok:true};
		}catch(err){const message=err instanceof Error?err.message:String(err);return {ok:false,retryable:!message.includes('changed in another')&&!message.includes('read-only')&&!message.includes('permission')&&!message.includes('not supported'),message};}
	}});
	guardSaveNavigation(saveState,{warning:'Your latest model changes have not been saved.',enabled:()=>opened.canWrite});
	const selectedBody=$derived(model.bodies.find(b=>b.id===selections[0]?.bodyId));
	const selectedSketch=$derived(model.sketches.find(s=>s.feature===selections[0]?.id&&selections[0]?.kind==='sketch'));
	/* The palette shows the student's own quick set, in their order; the armed tool joins it while it is armed, so the palette always shows what is active. */
	const quickTools=$derived(prefs.toolbar.quick.map(id=>TOOLS.find(t=>t.id===id)).filter((t):t is typeof TOOLS[number]=>!!t));
	const shownTools=$derived(more?TOOLS:quickTools.some(t=>t.id===tool)||tool==='select'?quickTools:[...quickTools,...TOOLS.filter(t=>t.id===tool)]);
	const shortcuts=$derived(effectiveShortcuts(prefs.shortcuts));
	const keyFor=(id:string)=>{const k=shortcuts.byCommand.get(id)?.[0];return k?keyLabel(k):'';};
	/* The view control's words, in the order they matter; the last ones fold into its Views menu first when the row is short. */
	const VIEW_ITEMS:{id:string;label:string}[]=[{id:'fit',label:'Fit'},{id:'view-iso',label:'Iso'},{id:'view-front',label:'Front'},{id:'view-top',label:'Top'},{id:'normal-to',label:'Normal to'},{id:'view-right',label:'Right'}];
	const viewItems:ViewItem[]=$derived(VIEW_ITEMS.map(v=>{const c=commandById(v.id)!,k=keyFor(v.id);return{id:v.id,label:v.label,title:`${c.name}${k?` (${k})`:''}`,reason:v.id==='normal-to'&&!normalTarget()?'Select a flat face or plane':null};}));
	const openSketches=$derived(model.sketches.filter(s=>!s.consumed));
	function show(result:ModelProjection){model=result;if(planesForced&&result.features.length){planesForced=false;if(viewport)viewport.datumForced=false;}viewport?.display(result);}
	function select(selection:Selection|null,append=false){
		if(!selection)selections=[];
		else if(append){const exists=selections.some(s=>s.bodyId===selection.bodyId&&s.id===selection.id&&s.kind===selection.kind);selections=exists?selections.filter(s=>!(s.bodyId===selection.bodyId&&s.id===selection.id)): [...selections,selection];}
		else selections=[selection];
		viewport?.highlight();
	}
	function setTool(next:Tool){if(gesture)void cancel();viewport?.clearDrawing();tool=next;error='';if(next==='reference')referenceOpen=true;if(next==='mate')matesOpen=true;viewport?.highlight();canvas?.focus();}
	function editSketch(id:string|null){
		editingSketch=id;const sketch=id?model.sketches.find(s=>s.feature===id):null;
		viewport.editingPlane=sketch?sketch.plane:null;if(sketch){viewport.lookAt(sketch.plane);select({bodyId:'',kind:'sketch',id:sketch.feature});}
	}
	async function record(label:string,before:ModelSnapshot,changes?:SolidHistoryAction['changes']){
		const after=await client.request<ModelSnapshot>('snapshot');currentSnapshot=after;
		if(!changes&&JSON.stringify(before.manifest)===JSON.stringify(after.manifest))return;
		/* Diff against the server's tree; an undo's inverse rows are exact (groupHistory refuses anything else) and PRODUCE the tree the server will hold, which is what p_model must equal. */
		const base=serverManifest,patches=changes??diffTrees(base,after.manifest),produced=changes?applyActions(base,changes):after.manifest;
		if(!patches.length)return;
		serverManifest=produced;
		const id=crypto.randomUUID(),seq=history.length,resultRevision=groupHistory(history).length+2;
		actions.push({id,label,before:base,after:produced,createdAt:new Date().toISOString(),changes:patches});
		history=[...history,...patches.map((patch,i)=>({...patch,seq:seq+i,operationId:id,operationStart:i===0,operationLabel:i===0?label:null,resultRevision:i===0?resultRevision:null}))];saveState.markDirty();
	}
	/** Features whose picks are spent once they exist: the next tool must not act on the faces a mate, a combine or a mirror was made from. */
	const CONSUMES_PICKS=['mate','boolean','mirror'];
	async function apply(command:SolidCommand,label:string){
		if(!opened.canWrite||busy||loading)return;busy=true;error='';
		const before=currentSnapshot;let landed=false;
		try{show(await client.request<ModelProjection>('apply',command));await record(label,before);landed=true;}
		catch(err){error=err instanceof Error?err.message:String(err);show(await client.request<ModelProjection>('project'));}
		finally{busy=false;}
		if(landed&&command.type==='add-feature'&&CONSUMES_PICKS.includes(command.feature.type))select(null);
	}
	/**
	 * Several commands as ONE change: one history row, one undo, one save. A
	 * refusal part way puts the model back exactly as it was, so a half-made
	 * box is never left behind.
	 */
	async function applyAll(commands:SolidCommand[],label:string){
		if(!opened.canWrite||busy||loading)return false;busy=true;error='';
		const before=currentSnapshot;
		try{let result:ModelProjection|null=null;for(const command of commands)result=await client.request<ModelProjection>('apply',command);if(result)show(result);await record(label,before);return true;}
		catch(err){error=err instanceof Error?err.message:String(err);try{show(await client.request<ModelProjection>('load',before));currentSnapshot=before;}catch{/* the refusal above is the message */}return false;}
		finally{busy=false;}
	}
	/** A drawn entity collection becomes a sketch feature on the plane it was drawn on, selected and ready to extrude. */
	async function createDraft(draft:SketchDraft,ref:PlaneRef){drafting=true;try{const id=newFeatureId();await apply({type:'add-feature',feature:{id,name:'',type:'sketch',plane:ref,entities:draft.entities,constraints:draft.constraints}},'Draw sketch');if(model.features.some(f=>f.id===id)){tool='extrude';select({bodyId:'',kind:'sketch',id});viewport.highlight();}}finally{drafting=false;}}
	/** "Start from a box": a 2 x 2 in square on Top, pulled up 1 in, as one change, then selected. */
	async function startFromBox(){
		const sketch=newFeatureId(),extrude=newFeatureId(),square=rectangleEntities([-1,-1],[1,1]);
		const made=await applyAll([{type:'add-feature',feature:{id:sketch,name:'',type:'sketch',plane:{kind:'datum',datum:'XY'},entities:square.entities,constraints:square.constraints}},{type:'add-feature',feature:{id:extrude,name:'',type:'extrude',sketch,distance:1,operation:'new'}}],'Start from a box');
		if(!made)return;const body=model.bodies.find(b=>b.createdBy===extrude)??model.bodies[0];if(body)select({bodyId:body.id,kind:'body',id:body.id});viewport.fit();canvas.focus();
	}
	/** "Sketch on a plane": Rectangle, with Front, Top and Right on screen whatever the preference says. */
	function sketchOnPlane(){planesForced=true;viewport.datumForced=true;viewport.display(model);setTool('rectangle');}
	async function begin(next:Gesture){
		if(!opened.canWrite)throw Error('This document is read-only.');
		if(busy)throw Error('Finish the current change first.');gesture=next;gestureFeature=newFeatureId();gestureBefore=currentSnapshot;gestureCenter=[...(model.bodies.find(b=>b.id===next.selection.bodyId)?.centerOfMass??[0,0,0])];committed=false;gestureModel=model;mateCandidate=null;try{await client.request('begin');}catch(err){gesture=null;gestureBefore=null;throw err;}
	}
	/** The reference a feature stores for a selection, with its hint, from the projection the gesture started on. */
	function ref(selection:Selection){const body=model.bodies.find(b=>b.id===selection.bodyId);if(!body)throw Error('Select something on a body.');return refFromSelection(selection,body);}
	/** The selected reference of a kind, when one is among the selections: the axis a revolve or a pattern turns about or runs along, or the plane a mirror reflects across. A reference among the selections is the student's own say-so. */
	function selectedReference(kind:'plane'|'axis'|'point'){for(const s of selections)if(s.kind==='reference'){const r=model.references.find(r=>r.feature===s.id);if(r?.kind===kind)return r;}return undefined;}
	const mirrorPlane=$derived(selectedReference('plane'));
	/* A mirror with no reference plane picked goes across a picked datum plane, else across Top, as it always has. */
	const mirrorDatum=$derived.by(():Datum=>{const d=selections.find(s=>s.kind==='reference'&&s.id.startsWith(DATUM_SELECTION_PREFIX));return d?d.id.slice(DATUM_SELECTION_PREFIX.length) as Datum:'XY';});
	/** Omit distributed over the feature union, so each member keeps its own discriminated fields. */
	type FeatureInput=Feature extends infer F?F extends Feature?Omit<F,'id'|'name'>&{name?:string}:never:never;
	const feature=(f:FeatureInput):SolidCommand=>({type:'add-feature',feature:{id:gestureFeature,name:'',...f} as Feature});
	function commandFor(value:DragValue):SolidCommand|null {
		if(!gesture)return null;const {selection,tool:active,axis}=gesture;
		if(selection.kind==='sketch'){
			const sketch=model.sketches.find(s=>s.feature===selection.id);if(!sketch)return null;
			if(active==='revolve'){const about=selectedReference('axis');return feature({type:'revolve',sketch:selection.id,angle:value.angle,axis:about?{kind:'reference',feature:about.feature}:{kind:'sketch',feature:selection.id,axis:'v'},operation:'new'});}
			const support=sketch.planeRef.kind==='face'?sketch.planeRef.face.body:undefined;
			return feature({type:'extrude',sketch:selection.id,distance:value.distance,operation:support?(value.distance<0?'cut':'add'):'new',target:support});
		}
		if(active==='fillet'||active==='chamfer'){
			const edges=[...selections.filter(s=>s.kind==='edge'),...(selection.kind==='edge'&&!selections.some(s=>s.id===selection.id)?[selection]:[])].map(s=>ref(s) as EdgeRef);
			if(!edges.length)return null;
			return active==='fillet'?feature(withOptions({type:'fillet',edges,radius:Math.abs(value.distance)})):feature(withOptions({type:'chamfer',edges,distance:Math.abs(value.distance)}));
		}
		if(active==='shell'){const open=[...selections.filter(s=>s.kind==='face'),...(selection.kind==='face'&&!selections.some(s=>s.id===selection.id)?[selection]:[])].map(s=>ref(s) as FaceRef);return feature(withOptions({type:'shell',body:selection.bodyId,thickness:Math.abs(value.distance),openFaces:open}));}
		/* The hole tool: the press point on the face is the hole's centre; size, fit and depth come from the Feature panel. */
		if(active==='hole'&&selection.kind==='face'){const body=model.bodies.find(b=>b.id===selection.bodyId),face=body?.faces.find(f=>f.id===selection.id);if(!body||!face)return null;return feature(holeFeatureAt(body,face,gesture.start));}
		if(active==='linear-pattern'||active==='circular-pattern'){const along=selectedReference('axis');return feature({type:'pattern',body:selection.bodyId,mode:active==='linear-pattern'?'linear':'circular',axis:along?{kind:'reference',feature:along.feature}:{kind:'datum',axis:active==='linear-pattern'?'X':'Z'},spacing:active==='linear-pattern'?value.distance:360/value.count,count:value.count});}
		if(active==='rotate'||active==='scale'||active==='move'){
			if(active==='move'&&(selection.kind==='edge'||selection.kind==='vertex'))return feature({type:'move-selection',entity:ref(selection) as EdgeRef,delta:scaleVector(axis,value.distance)});
			const matrix=new THREE.Matrix4(),center=new THREE.Vector3(...gestureCenter),mode=value.handle?.mode;
			/* The triad's handle says what the drag is: a ring is a turn about its axis through the centre, a plane square or the centre sphere is a delta, an arrow is a distance along its axis. A move is offered the magnetic mate snap unless Ctrl is held. */
			if(mode==='ring')matrix.makeRotationAxis(new THREE.Vector3(...(value.handle?.axis??axis)).normalize(),value.angle*Math.PI/180);
			else if(mode==='plane'||mode==='free'||active==='move'){
				const t=mode==='plane'||mode==='free'?value.delta:scaleVector(axis,value.distance);
				const preview=active==='move'&&!value.modifiers?.ctrl?matePreview(gestureModel,selection.bodyId,t,MATE_SNAP_TOLERANCE):null;
				mateCandidate=preview?.candidate??null;viewport.clearGuides();for(const g of preview?.guides??[])viewport.guide(g,'#d9b96a');
				matrix.makeTranslation(...(preview?.delta??t));
			}
			else if(active==='rotate')matrix.makeRotationAxis(new THREE.Vector3(...axis),value.angle*Math.PI/180);
			else {const factor=1+value.distance;matrix.makeScale(factor,factor,factor);}
			const aboutCenter=mode==='ring'||(mode!=='plane'&&mode!=='free'&&active!=='move');
			if(aboutCenter)matrix.premultiply(new THREE.Matrix4().makeTranslation(...center.toArray())).multiply(new THREE.Matrix4().makeTranslation(...center.negate().toArray()));
			return feature({type:'transform',bodies:[...new Set([selection.bodyId,...selections.map(s=>s.bodyId)].filter(Boolean))],matrix:matrix.clone().transpose().toArray()});
		}
		if(selection.kind==='edge'||selection.kind==='vertex')return feature({type:'move-selection',entity:ref(selection) as EdgeRef,delta:value.delta});
		if(selection.kind==='face')return feature({type:'push',face:ref(selection) as FaceRef,value:value.distance});
		return null;
	}
	const scaleVector=(v:[number,number,number],n:number):[number,number,number]=>[v[0]*n,v[1]*n,v[2]*n];
	function update(value:DragValue){
		let command:SolidCommand|null;try{command=commandFor(value);}catch(err){error=err instanceof Error?err.message:String(err);return;}if(!command)return;
		measure={text:dragReadout(gesture!.tool,value,{kind:gesture!.selection.kind}),x:value.point.x,y:value.point.y};
		queued=command;pump();
	}
	function pump(){
		if(pumping)return pumping;
		pumping=(async()=>{while(queued){const next=queued;queued=null;try{show(await client.request<ModelProjection>('update',next));error='';}catch(err){error=err instanceof Error?err.message:String(err);show(await client.request<ModelProjection>('project'));}}})().finally(()=>pumping=null);
		return pumping;
	}
	async function end(){
		if(committed)return;committed=true;busy=true;
		const candidate=mateCandidate;mateCandidate=null;viewport.clearGuides();
		try{await pumping;if(queued)await pump();show(await client.request<ModelProjection>('commit'));if(gestureBefore)await record(gesture?.handle?.mode==='ring'?'Rotate':(TOOLS.find(t=>t.id===gesture?.tool)?.name??'Edit solid'),gestureBefore);}
		catch(err){error=err instanceof Error?err.message:String(err);}
		finally{gesture=null;gestureBefore=null;measure=null;numeric=null;busy=false;}
		/* A move that snapped to another body's face adds the mate it previewed, after the transform has landed; `ref` reads the faces where the bodies now sit. */
		if(candidate&&!error){try{const a=ref(candidate.a),b=ref(candidate.b);await apply({type:'add-feature',feature:{id:'',name:'',type:'mate',kind:candidate.kind,a:{kind:'face',...a} as EntityRef,b:{kind:'face',...b} as EntityRef}},`Add ${candidate.kind} mate`);}catch(err){error=err instanceof Error?err.message:String(err);}}
	}
	async function cancel(){queued=null;try{await pumping;if(client){show(await client.request<ModelProjection>('cancel'));}}catch(err){error=err instanceof Error?err.message:String(err);}finally{gesture=null;gestureBefore=null;measure=null;numeric=null;mateCandidate=null;viewport?.clearGuides();}}
	async function undo(redo=false){if(!opened.canWrite||busy||loading||gesture)return;const target=redo?historyState.redoTarget:historyState.undoTarget;if(!target)return;busy=true;const before=currentSnapshot;try{const inverse=inverseOperation(serverManifest,target);show(await client.request<ModelProjection>('load',{manifest:inverse.after,artifacts:before.artifacts}));await record(redo?'Redo':'Undo',before,inverse.actions);title=currentSnapshot.manifest.title;}catch(err){error=err instanceof Error?err.message:String(err);}finally{busy=false;}}
	async function enterNumeric(){
		if(!opened.canWrite||loading)return;
		/* An Enter that arrives while a drawing is still becoming a sketch, or while the worker replays, waits for it rather than being dropped. */
		if(busy||drafting){submitWhenIdle=true;return;}
		submitWhenIdle=false;
		const unit=numericUnit(tool),parsed=parseDimension(withDisplayUnit(numeric?.value??'',unit),unit);if(!parsed.ok){error=parsed.reason;return;}const value=tool==='scale'?parsed.value-1:parsed.value;
		if(!gesture){const selection=selections[0];if(!selection)return;const body=model.bodies.find(b=>b.id===selection.bodyId),face=body?.faces.find(f=>f.id===selection.id),sketch=model.sketches.find(s=>s.feature===selection.id);try{await begin({selection,tool,start:face?.center??sketch?.plane.origin??[0,0,0],axis:face?.normal??sketch?.plane.normal??[0,0,1]});}catch(err){error=err instanceof Error?err.message:String(err);numeric=null;return;}}
		update({distance:value,angle:value,delta:scaleVector(gesture!.axis,value),count:value,point:{x:numeric?.x??0,y:numeric?.y??0}});await end();canvas.focus();
	}
	async function back(){if(gesture)await end();await saveState.saveNow();if(saveState.dirty)return;onback();}
	async function reopenSaved(){
		if(busy)return;busy=true;error='';
		try{const fresh=await transport.open(opened.id);show(await client.request<ModelProjection>('load',fresh.snapshot));opened=fresh;serverManifest=fresh.snapshot.manifest;currentSnapshot=await client.request<ModelSnapshot>('snapshot');title=fresh.title;revision=fresh.revision;history=fresh.history??[];actions=[];select(null);viewport.fit();saveState.markSaved();reopenConfirm=false;}
		catch(err){error=err instanceof Error?err.message:String(err);}finally{busy=false;}
	}
	async function exportFile(kind:'3mf'|'stl'|'dxf'|'ideacad'){
		error='';try{const name=title.replace(/[^a-zA-Z0-9 _-]/g,'').trim()||'IdeaCAD';
			if(kind==='3mf')download(solidThreeMf(model,title),`${name}.3mf`,'model/3mf');
			else if(kind==='stl')download(solidStl(model),`${name}.stl`,'model/stl');
			else if(kind==='dxf'){const content=selectedSketch?sketchDxf(selectedSketch):profileDxf(await client.request('profile',selections[0]));download(content,`${name}.dxf`,'application/dxf');}
			else download(JSON.stringify({manifest:currentSnapshot.manifest,artifacts:currentSnapshot.artifacts.map(a=>({hash:a.hash,bytes:Array.from(a.bytes)}))}),`${name}.ideacad`,'application/json');
			exportOpen=false;
		}catch(err){error=err instanceof Error?err.message:String(err);}
	}
	async function importBackup(file:File|undefined){
		if(!file||!opened.canWrite||busy)return;busy=true;error='';const before=currentSnapshot;
		try{const data=JSON.parse(await file.text());if(!Array.isArray(data.artifacts))throw Error('This is not an IdeaCAD backup.');const artifacts=data.artifacts.map((a:{hash:string;bytes:number[]})=>({hash:a.hash,bytes:new Uint8Array(a.bytes)}));for(const a of artifacts){const digest=await crypto.subtle.digest('SHA-256',a.bytes);if([...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')!==a.hash)throw Error('The backup failed its integrity check.');}show(await client.request<ModelProjection>('load',{manifest:data.manifest,artifacts:[...before.artifacts,...artifacts]}));await record('Import backup',before);title=currentSnapshot.manifest.title;select(null);viewport.fit();exportOpen=false;}catch(err){error=err instanceof Error?err.message:String(err);show(await client.request<ModelProjection>('load',before));currentSnapshot=before;title=before.manifest.title;}finally{busy=false;importInput.value='';}
	}
	/** A small picture of the model after each save, for the launch page. Best effort: a failure here never touches the save. */
	async function sendThumbnail(){
		if(!transport.thumbnail||!canvas||!model.bodies.length)return;
		try{viewport.painted();const scaled=document.createElement('canvas');scaled.width=160;scaled.height=120;scaled.getContext('2d')?.drawImage(canvas,0,0,160,120);const dataUrl=scaled.toDataURL('image/jpeg',0.82);/* 0217 caps the column at 60000 characters; a PNG of a shaded render can pass it on compression luck alone, so a JPEG is sent and an oversize one is not sent at all. */if(dataUrl.length>60000)return;await transport.thumbnail(opened.id,dataUrl);}catch{/* a thumbnail is decoration */}
	}
	/* ------------------------------------------------------------------ COMMANDS AND THE ONE SHORTCUT LAYER */
	const isDatum=(s:Selection)=>s.kind==='reference'&&s.id.startsWith(DATUM_SELECTION_PREFIX);
	/** Delete what is selected: a feature, sketch or reference by its row, anything else from its body. The datum planes are not features and are never deleted. */
	function deleteSelection(){const kept=selections.filter(s=>!isDatum(s));const feature=kept.find(s=>s.kind==='feature'||s.kind==='sketch'||s.kind==='reference');if(feature)void apply({type:'remove-feature',id:feature.id},'Delete feature');else if(kept.length)void apply({type:'delete',selections:kept},'Delete selection');}
	/** What Normal To faces: the open sketch's plane, else the selected flat face, plane or sketch. */
	function normalTarget():ResolvedPlane|null{
		if(editingSketch){const open=model.sketches.find(k=>k.feature===editingSketch);if(open)return open.plane;}
		const s=selections[0];if(!s)return null;
		if(s.kind==='face'){const face=model.bodies.find(b=>b.id===s.bodyId)?.faces.find(f=>f.id===s.id);return face&&face.kind==='plane'?planeFromNormal(face.normal,face.center):null;}
		if(s.kind==='sketch')return model.sketches.find(k=>k.feature===s.id)?.plane??null;
		if(isDatum(s))return datumPlane(s.id.slice(DATUM_SELECTION_PREFIX.length) as Datum);
		if(s.kind==='reference'){const r=model.references.find(r=>r.feature===s.id);return r?.kind==='plane'?{origin:r.origin,u:r.u!,v:r.v!,normal:r.normal!}:null;}
		return null;
	}
	/** The plane a drawing press on empty space lands on: a selected plane, else the datum the view looks straight at, else Top. */
	function defaultDrawPlane(){
		for(const s of selections){if(isDatum(s)){const datum=s.id.slice(DATUM_SELECTION_PREFIX.length) as Datum;return{plane:datumPlane(datum),ref:{kind:'datum' as const,datum}};}if(s.kind==='reference'){const r=model.references.find(r=>r.feature===s.id);if(r?.kind==='plane')return{plane:{origin:r.origin,u:r.u!,v:r.v!,normal:r.normal!},ref:{kind:'reference' as const,feature:r.feature}};}}
		const datum=viewport?.facingDatum()??'XY';return{plane:datumPlane(datum),ref:{kind:'datum' as const,datum}};
	}
	function togglePanel(panel:PanelId){if(panel==='objects')objectsOpen=!objectsOpen;else if(panel==='reference')referenceOpen=!referenceOpen;else if(panel==='mates')matesOpen=!matesOpen;else if(panel==='section')sectionOpen=!sectionOpen;else addonOpen=!addonOpen;}
	/** Show or hide Front, Top and Right: the student's choice, stored, so it holds on every document. */
	function togglePlanes(){const shown=datumPlanesVisible(model,planesForced);planesForced=false;viewport.datumForced=false;prefStore.set('view',{...prefs.view,planes:shown?'never':'always'});}
	function openSearch(group?:CommandGroup){const r=canvas.getBoundingClientRect(),p=viewport?.pointerPosition()??{x:r.width/2,y:r.height/3};const inside=p.x>0&&p.y>0&&p.x<r.width&&p.y<r.height;search={at:inside?{x:r.left+p.x,y:r.top+p.y}:{x:r.left+r.width/2-170,y:r.top+80},group};}
	const commandContext:CommandContext={
		get selections(){return selections;},get canUndo(){return !!historyState.undoTarget&&opened.canWrite;},get canRedo(){return !!historyState.redoTarget&&opened.canWrite;},get canWrite(){return opened.canWrite&&!loading;},get canNormalTo(){return !!normalTarget();},
		setTool,undo:()=>void undo(),redo:()=>void undo(true),deleteSelection,fit:()=>viewport.fit(),view:(v)=>viewport.view(v),
		normalTo:()=>{const plane=normalTarget();if(plane)viewport.normalTo(plane);},togglePlanes,togglePanel,
		openExport:()=>exportOpen=!exportOpen,openSearch,openPreferences:()=>{prefsOpen=!prefsOpen;},
		/* Help is the searchable list of every command until the tutorial lands; it never opens nothing. */
		openHelp:()=>openSearch()
	};
	/** Run a registry command from any path (a key, search, the view control, the palette), and remember it for search's ranking. One that cannot run says why, where every refusal is said. */
	function runCommand(command:Command){
		search=null;const reason=command.unavailable?.(commandContext);if(reason){error=reason;return;}
		command.run(commandContext);
		/* Opening a list is not using a command: only what was run from it ranks. */
		if(!OPENERS.includes(command.id))prefStore.set('commands',{recent:recordRecent(prefs.commands.recent,command.id)});
	}
	const OPENERS=['search','view-menu','help'];
	function runById(id:string){const command=commandById(id);if(command)runCommand(command);}
	/* The value box. A digit, a point or a minus with something selected, or while a drawing is becoming a sketch, opens it; digits that arrive before it has focus are appended in order, never dropped. */
	function numericKey(key:string){
		if(numeric){numeric.value+=key;focusNumeric();return true;}
		if(!selections.length&&!drafting)return false;
		const p=viewport?.pointerPosition()??{x:0,y:0};numeric={value:key,x:p.x,y:p.y};focusNumeric();return true;
	}
	function focusNumeric(){void tick().then(()=>{if(!numericInput||document.activeElement===numericInput)return;numericInput.focus();const end=numericInput.value.length;numericInput.setSelectionRange(end,end);});}
	function closeNumeric(){numeric=null;submitWhenIdle=false;}
	/* A deferred Enter runs the moment the worker is free and the drawing has become its sketch. */
	$effect(()=>{if(submitWhenIdle&&!busy&&!drafting&&!loading)queueMicrotask(()=>untrack(()=>{if(submitWhenIdle&&numeric)void enterNumeric();}));});
	/**
	 * ESCAPE, ONE STEP AT A TIME: cancel a drag or a drawing in progress; else
	 * close whatever is open on top (the value box, search, a menu, the
	 * preferences); else clear the selection. In a panel's own input it only
	 * lets go of the input, so a typed value is never thrown away by it.
	 */
	function escape(e:KeyboardEvent){
		const target=e.target as HTMLElement|null;
		if(numericInput&&target===numericInput){e.preventDefault();closeNumeric();canvas.focus();return;}
		if(target?.closest?.('input,textarea,select,[contenteditable=true]')){target.blur();return;}
		if(gesture||viewport?.isDrawing()){e.preventDefault();viewport.cancel();return;}
		if(numeric||search||exportOpen||prefsOpen){e.preventDefault();closeNumeric();search=null;exportOpen=false;prefsOpen=false;return;}
		if(selections.length){e.preventDefault();select(null);}
	}
	function keydown(e:KeyboardEvent){
		if(settingsOpen||e.defaultPrevented&&e.key!=='Escape')return;
		if(e.key==='Escape'){escape(e);return;}
		const target=e.target as HTMLElement|null;
		if(target?.closest?.('input,textarea,select,[contenteditable=true]'))return;
		if(numeric&&e.key==='Enter'){e.preventDefault();void enterNumeric();return;}
		if(numeric&&e.key==='Backspace'){e.preventDefault();numeric.value=numeric.value.slice(0,-1);focusNumeric();return;}
		if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&/^[0-9.\-]$/.test(e.key)){if(numericKey(e.key))e.preventDefault();return;}
		const key=keyFromEvent(e);if(!key)return;
		/* Space and Enter on a focused button press that button; a shortcut never takes them from it. */
		if((key==='Space'||key==='Enter')&&target?.closest?.('button,a,[role=button],[role=option],[role=menuitem],summary'))return;
		const id=shortcuts.byKey.get(key);if(!id)return;
		const command=commandById(id);if(!command)return;
		e.preventDefault();runCommand(command);
	}
	async function openSettings(){if(!advisoryTransport)return;try{rules=await advisoryTransport.read();settingsOpen=true;}catch(err){error=err instanceof Error?err.message:String(err);}}
	/** What every panel reads and writes through. Getters, so a panel's `$derived` tracks the workspace's own state. */
	const api:WorkspaceApi={
		get model(){return model;},get manifest(){return currentSnapshot.manifest;},get selections(){return selections;},get canWrite(){return opened.canWrite&&!loading;},get busy(){return busy||loading;},get tool(){return tool;},get editingSketch(){return editingSketch;},
		setSketchPointer:(handler)=>{sketchPointer=handler;},
		apply,select,setTool,editSketch,
		request:(method,value)=>client.request(method,value),
		project:(p)=>viewport.projectPoint(p),
		error:(message)=>{error=message;},
		guide:(points,color)=>viewport.guide(points,color),clearGuides:()=>viewport.clearGuides(),
		clip:(plane)=>viewport.clip(plane),lookAt:(plane)=>viewport.lookAt(plane),fit:()=>viewport.fit(),
		unproject:(x,y,plane)=>viewport.unproject(x,y,plane)
	};
	onMount(()=>{
		const readRules=()=>{if(advisoryTransport)void advisoryTransport.read().then(value=>rules=value).catch(err=>error=err.message);};readRules();
		window.addEventListener('focus',readRules);const ruleTimer=setInterval(readRules,60000);
		client=new SolidClient();viewport=new SolidViewport(canvas,{getTool:()=>tool,getPlane:():DrawPlane=>defaultDrawPlane(),getSelections:()=>selections,canWrite:()=>opened.canWrite,select,begin,update,end:()=>void end(),cancel:()=>void cancel(),draft:(d,r)=>void createDraft(d,r),error:message=>error=message,sketchPointer:(event,at,e)=>sketchPointer?.(event,at,e)??false});
		for(const m of STOCK_MATERIALS)if(m.color)viewport.materialColours.set(m.id,m.color);
		viewport.triadShown=prefs.view.triad;viewport.setTriadSlot(triadSlot??null);
		/* A press anywhere on the model closes the value box: what was typed there was for what is no longer being pointed at. */
		canvas.addEventListener('pointerdown',()=>{if(numeric)closeNumeric();},{capture:true});
		/* PREFERENCES: a change from the preferences panel reaches the module settings and the viewport; a panel that wrote a module setting (a snap box, the polygon sides, a fillet option, the planes box) is read back into the store a moment later. */
		const unsubscribe=prefStore.subscribe(next=>{prefs=next;applyToModules(next);if(viewport){viewport.triadShown=next.view.triad;viewport.invalidate();}});
		let captureTimer:ReturnType<typeof setTimeout>|undefined;
		const captureModules=()=>{const next=captureFromModules(prefStore.current);for(const group of changedGroups(prefStore.current,next))prefStore.set(group,next[group] as never);};
		const scheduleCapture=()=>{clearTimeout(captureTimer);captureTimer=setTimeout(captureModules,300);};
		window.addEventListener('change',scheduleCapture,true);window.addEventListener('input',scheduleCapture,true);
		const offDatum=onDatumPlanesChange(scheduleCapture);
		/* THE SHELL'S VOICE AND REPORT CONTROLS ARE DOCKED IN THE FOOTER'S ENDS (see the style block); the footer's words start and end clear of whatever width they take. */
		const measureDocks=()=>{const v=document.querySelector('.vnav-shell .vnav-trigger')?.getBoundingClientRect(),r=document.querySelector('.sfb-shell .sfb-trigger')?.getBoundingClientRect();dockLeft=v&&v.width?Math.ceil(v.right)+12:15;dockRight=r&&r.width?Math.ceil(window.innerWidth-r.left)+12:15;};
		const docks=typeof ResizeObserver==='function'?new ResizeObserver(measureDocks):null;const watchDocks=()=>{for(const el of document.querySelectorAll('.vnav-shell .vnav-trigger,.sfb-shell .sfb-trigger'))docks?.observe(el);measureDocks();};watchDocks();const dockTimer=setTimeout(watchDocks,800);window.addEventListener('resize',measureDocks);
		client.request<ModelProjection>('load',opened.snapshot).then(async result=>{show(result);currentSnapshot=await client.request<ModelSnapshot>('snapshot');viewport.fit();loading=false;saveState.markSaved();}).catch(err=>{error=err.message;loading=false;});
		const unbind=saveState.attach();
		if(dev)(window as unknown as {ideaCadSolid:unknown}).ideaCadSolid={get model(){return model;},get snapshot(){return currentSnapshot;},get busy(){return busy||loading||!!pumping||drafting;},get selections(){return selections;},apply,select,setTool,editSketch,project:(p:[number,number,number])=>viewport.projectPoint(p),painted:()=>viewport.painted(),fit:()=>viewport.fit(),view:(v:'iso'|'top'|'front'|'right'|'normal')=>v==='normal'?commandContext.normalTo():viewport.view(v),save:()=>saveState.saveNow(),undo,frameCosts:viewport.frameCosts,request:(method:string,value?:unknown)=>client.request(method,value),get prefs(){return prefs;},preferences:prefStore,triad:()=>viewport.triadRect(),get tool(){return tool;}};
		return()=>{clearInterval(ruleTimer);window.removeEventListener('focus',readRules);unbind();unsubscribe();offDatum();clearTimeout(captureTimer);captureModules();void prefStore.flush();window.removeEventListener('change',scheduleCapture,true);window.removeEventListener('input',scheduleCapture,true);docks?.disconnect();clearTimeout(dockTimer);window.removeEventListener('resize',measureDocks);viewport.destroy();client.destroy();};
	});
	onDestroy(()=>saveState.destroy());
	/* The live readout while drawing: the viewport owns the geometry, this owns the words. */
	$effect(()=>{if(!viewport)return;const timer=setInterval(()=>{if(gesture||!viewport.isDrawing()){if(!gesture&&!viewport?.isDrawing()&&measure&&!numeric)measure=null;return;}const r=viewport.drawingReadout();if(r)measure={text:r.text,x:r.point.x,y:r.point.y};},50);return()=>clearInterval(timer);});
</script>

<svelte:window onkeydown={keydown}/>
<section class="ic-root solid-workspace" class:save-failed={saveState.failed} class:tree-open={treeOpen} aria-label="IdeaCAD modeler" style:--dock-left={`${dockLeft}px`} style:--dock-right={`${dockRight}px`} style:--ic-tip-delay={`${prefs.hints.tooltipDelayMs}ms`}>
	<header>
		<button class="documents" onclick={()=>void back()} aria-label="Documents">‹ <span>Documents</span></button>
		<input class="document-title" aria-label="Document name" bind:value={title} readonly={!opened.canWrite||loading||busy} maxlength="120" onchange={()=>void apply({type:'title',title},'Rename document')}/>
		<div class="document-save"><SaveIndicator state={saveState} hideClean={false}/></div>
		<button aria-label="Undo" onclick={()=>void undo()} disabled={!historyState.undoTarget||!opened.canWrite||busy}>↶</button>
		<button aria-label="Redo" onclick={()=>void undo(true)} disabled={!historyState.redoTarget||!opened.canWrite||busy}>↷</button>
		<button class="search-open" class:active={!!search&&!search.group} aria-label="Search commands" title={keyFor('search')?`Search commands (${keyFor('search')})`:'Search commands'} onclick={()=>search&&!search.group?search=null:runById('search')}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M10 17a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM15 15l6 6"/></svg><span>Search</span></button>
		<button class="prefs-open" class:active={prefsOpen} aria-label="Preferences" aria-expanded={prefsOpen} onclick={()=>prefsOpen=!prefsOpen}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg><span>Settings</span></button>
		<button class="tree-toggle" class:active={treeOpen} aria-expanded={treeOpen} onclick={()=>treeOpen=!treeOpen}>Tree</button>
		<button class="export-open" class:active={exportOpen} onclick={()=>exportOpen=!exportOpen}>Export <span aria-hidden="true">↗</span></button>
	</header>
	<div class="body">
		<aside class="tree-rail" aria-label="Design tree rail"><FeatureTree {api}/></aside>
		<div class="workarea">
			<canvas bind:this={canvas} tabindex="0" aria-label="3D model: select and drag geometry"></canvas>
			<nav class="tools" class:expanded={more} aria-label="Modeling tools">
				{#each shownTools as item (item.id)}<ToolButton name={keyFor(item.id)?`${item.name} (${keyFor(item.id)})`:item.name} description={item.description} icon={item.icon} active={tool===item.id} onclick={()=>runById(item.id)}/>{/each}
				<button class="more" aria-label={more?'Fewer tools':'More tools'} aria-expanded={more} onclick={()=>more=!more}>{more?'−':'⋯'}</button>
			</nav>
			<div class="top-bar">
				<div class="view-tools"><ViewControls items={viewItems} onrun={runById}/></div>
				<div class="right-tools"><button class:active={objectsOpen} onclick={()=>objectsOpen=!objectsOpen}>Objects <span>{model.bodies.length+openSketches.length}</span></button><button class:active={referenceOpen} onclick={()=>referenceOpen=!referenceOpen}>Reference</button><button class:active={matesOpen} onclick={()=>matesOpen=!matesOpen}>Mates</button><button class:active={sectionOpen} aria-pressed={sectionOpen} onclick={()=>sectionOpen=!sectionOpen}>Section</button><button class:active={addonOpen} onclick={()=>addonOpen=!addonOpen}>Add-ons</button></div>
			</div>
			<div class="triad-slot" bind:this={triadSlot} aria-hidden="true" data-testid="ideacad-triad" data-shown={prefs.view.triad}></div>
			{#if !loading&&opened.canWrite&&!model.features.length&&!editingSketch}<div class="empty-slot"><EmptyCue onsketch={sketchOnPlane} onbox={()=>void startFromBox()} {busy}/></div>{/if}
			{#if loading}<div class="loading" role="status">Loading geometry…</div>{/if}
			{#if !opened.canWrite}<div class="read-only">{opened.deletedAt?'In the trash':opened.archivedAt?'Archived':'View only'}</div>{/if}
			{#if model.replayMs!==undefined&&model.replayMs>0&&dev}<div class="replay" data-testid="ideacad-replay">replayed from {model.replayedFrom} in {model.replayMs.toFixed(1)} ms</div>{/if}
			{#if saveState.failed}<aside class="recovery panel" aria-label="Save recovery"><h2>Changes not saved</h2><p>{saveState.message}</p><button onclick={()=>void exportFile('ideacad')}>Save backup</button>{#if reopenConfirm}<p>Discard unsaved changes and open the saved model?</p><button disabled={busy} onclick={()=>void reopenSaved()}>Discard and reopen</button><button onclick={()=>reopenConfirm=false}>Cancel</button>{:else}<button disabled={busy} onclick={()=>reopenConfirm=true}>Reopen saved model</button>{/if}</aside>{/if}
			<div class="panels">
				{#if prefsOpen}<PreferencesPanel store={prefStore} {prefs} onclose={()=>{prefsOpen=false;}}/>{/if}
				{#if editingSketch}<SketchEditor {api}/>{/if}
				<FeaturePanel {api}/>
				<DimensionPanel {api}/>
				{#if tool==='move'||tool==='rotate'||tool==='scale'}<MovePanel {api}/>{/if}
				{#if tool==='measure'}<MeasurePanel {api}/>{/if}
				{#if sectionOpen}<SectionPanel {api}/>{/if}
				{#if referenceOpen}<ReferencePanel {api}/>{/if}
				{#if matesOpen}<MatePanel {api}/>{/if}
				{#if objectsOpen}
					<aside class="objects panel" aria-label="Objects"><h2>Objects</h2>
						{#each openSketches as sketch (sketch.feature)}<button class:selected={selections.some(s=>s.id===sketch.feature)} onclick={()=>{select({bodyId:'',kind:'sketch',id:sketch.feature});setTool('extrude');}}>◇ {sketch.name}<span>{sketch.regions.length?`${sketch.regions.length} closed`:'open'}</span></button>{/each}
						{#each model.bodies as body (body.id)}<button class:selected={selections.some(s=>s.bodyId===body.id)} onclick={(e)=>select({bodyId:body.id,kind:'body',id:body.id},e.shiftKey)}>▱ {body.name}</button>{/each}
						{#if selectedBody}<BodyProperties body={selectedBody} canWrite={opened.canWrite&&!loading&&!busy} change={(command,label)=>void apply(command,label)} error={api.error}/><div class="body-actions"><button onclick={()=>void apply({type:'add-feature',feature:{id:'',name:'',type:'mirror',bodies:[selectedBody.id],plane:mirrorPlane?{kind:'reference',feature:mirrorPlane.feature}:{kind:'datum',datum:mirrorDatum}}},'Mirror body')}>Mirror across {mirrorPlane?mirrorPlane.name:DATUM_NAMES[mirrorDatum]}</button><button onclick={()=>void apply({type:'delete',selections:[{bodyId:selectedBody.id,kind:'body',id:selectedBody.id}]},'Delete body')}>Delete body</button></div>{/if}
						{#if new Set(selections.map(s=>s.bodyId).filter(Boolean)).size>1}<div class="body-actions">{#each ['union','subtract','intersect'] as operation}<button onclick={()=>void apply({type:'add-feature',feature:{id:'',name:'',type:'boolean',operation:operation as 'union'|'subtract'|'intersect',bodies:[...new Set(selections.map(s=>s.bodyId).filter(Boolean))]}},operation)}>{operation}</button>{/each}</div>{/if}
					</aside>
				{/if}
				{#if addonOpen}<AddonPanel {api} {rules} onsettings={()=>void openSettings()}/>{/if}
			</div>
			{#if exportOpen}<div class="export-menu panel" role="group" aria-label="Export format"><button onclick={()=>exportFile('3mf')}>3MF <span>Recommended</span></button><button onclick={()=>exportFile('stl')}>STL</button><button onclick={()=>exportFile('dxf')}>DXF profile</button><button onclick={()=>exportFile('ideacad')}>IdeaCAD backup</button>{#if opened.canWrite}<button onclick={()=>importInput.click()}>Import IdeaCAD backup</button>{/if}</div>{/if}
			<input type="file" accept=".ideacad" bind:this={importInput} hidden onchange={e=>void importBackup(e.currentTarget.files?.[0])}/>
			{#if measure&&!numeric}<output class="measure" style:left={`${Math.min(measure.x+16,(canvas?.clientWidth??1000)-160)}px`} style:top={`${measure.y+16}px`}>{measure.text}</output>{/if}
			{#if numeric}<form class="number-entry" style:left={`${Math.min(numeric.x+16,(canvas?.clientWidth??1000)-170)}px`} style:top={`${Math.min(numeric.y+16,(canvas?.clientHeight??800)-64)}px`} onsubmit={(e)=>{e.preventDefault();void enterNumeric();}}><input bind:this={numericInput} bind:value={numeric.value} aria-label={numericPrompt(tool)} autocomplete="off"/><button type="submit" aria-label="Use exact value">↵</button></form>{/if}
			{#if error}<div class="error" role="alert"><span>{error}</span><button aria-label="Dismiss message" onclick={()=>error=''}>×</button></div>{/if}
			{#if search}<CommandSearch commands={search.group?COMMANDS.filter(c=>!OPENERS.includes(c.id)):COMMANDS} recent={prefs.commands.recent} keys={shortcuts.byCommand} group={search.group} at={search.at} unavailable={(c)=>c.unavailable?.(commandContext)??null} onrun={runCommand} onclose={()=>{search=null;canvas?.focus();}}/>{/if}
		</div>
	</div>
	{#if settingsOpen&&rules&&advisoryTransport}<div class="settings-overlay"><AdvisorySettings {rules} transport={advisoryTransport} onchange={value=>rules=value} onclose={()=>settingsOpen=false}/></div>{/if}
	<footer><span>{model.bodies.length} {model.bodies.length===1?'body':'bodies'}</span><span>{model.features.length} features</span><span>{prefs.units.display==='mm'?'millimeters':'inches'}</span><span>{selections.length?`${selections.length} selected`:''}</span><span class="tool-name">{TOOLS.find(t=>t.id===tool)?.name}</span></footer>
</section>

<style>
	/* THE SHELL'S TWO FLOATING CONTROLS ARE DOCKED IN THE FOOTER'S ENDS: Voice on the left, Report on the right, each 2px inside the 48px footer. The footer's words run between them (`--dock-left`, `--dock-right`, measured from the controls themselves), so neither covers a count, the tool strip or a panel at any width. */
	:global(body:has(.solid-workspace) .sfb-shell){bottom:calc(2px + env(safe-area-inset-bottom, 0px));right:8px}
	:global(body:has(.solid-workspace) .vnav-shell){bottom:calc(2px + env(safe-area-inset-bottom, 0px));left:8px}
	@media(max-width:700px){:global(body:has(.solid-workspace) .sfb-word){display:none}}
	/* A tool's hover card waits for the student's own delay (preferences, Hints) before it shows, instead of covering the model the instant the pointer crosses the palette. */
	.tools :global(.tool-wrap .tooltip){display:block;visibility:hidden}.tools :global(.tool-wrap:hover .tooltip),.tools :global(.tool-wrap:focus-within .tooltip){visibility:visible;transition:visibility 0s linear var(--ic-tip-delay,400ms)}
	.settings-overlay{position:absolute;inset:0;z-index:40;background:#0008;display:grid;place-items:center}.solid-workspace{position:relative}
	.recovery{z-index:22}.recovery p{font-size:16px;color:var(--text-2)}
	.document-save{min-width:0;display:flex;justify-content:flex-end}.document-save :global(.save-ind){max-width:100%;flex-wrap:nowrap}.document-save :global(.save-ind-text){min-width:0;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
	.solid-workspace{grid-template-columns:minmax(0,1fr)}
	@media(max-width:700px){.solid-workspace.save-failed{grid-template-rows:52px minmax(0,1fr) 48px}}
	.top-bar{position:absolute;top:12px;left:76px;right:12px;display:flex;align-items:flex-start;gap:8px;z-index:8;pointer-events:none}.workarea:has(.tools.expanded) .top-bar{left:168px}.view-tools{flex:1 1 0;min-width:0;display:flex}.right-tools{pointer-events:auto}
	.triad-slot{position:absolute;left:12px;bottom:12px;width:84px;height:84px;pointer-events:none}
	.empty-slot{position:absolute;left:50%;top:68px;transform:translateX(-50%);z-index:6;pointer-events:none;width:max-content;max-width:calc(100% - 24px)}
	.search-open,.prefs-open{display:inline-flex;align-items:center;gap:6px}.tree-toggle{align-items:center}
	.solid-workspace{height:100%;min-height:0;display:grid;grid-template-rows:56px minmax(0,1fr) 48px;overflow:hidden;background:var(--surface-0);color:var(--text-1);font-family:Rajdhani,sans-serif}header{display:flex;gap:4px;align-items:center;padding:0 12px;background:var(--surface-1);border-bottom:1px solid var(--hairline);z-index:10}button,input{font:600 16px Rajdhani,sans-serif;color:var(--text-1);min-height:44px;min-width:44px;border:1px solid transparent;border-radius:5px;background:transparent}button{cursor:pointer;padding:0 12px}button:hover{background:var(--surface-2)}button:focus-visible,input:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}button.active,button.selected{background:color-mix(in srgb,var(--green) 12%,var(--surface-1));border-color:var(--green);color:var(--green)}button:disabled{opacity:.4;cursor:default}.documents{display:flex;gap:8px;align-items:center}.document-title{max-width:300px;width:25vw;min-width:80px;font-size:21px;padding:0 12px;border-left:1px solid var(--hairline);border-radius:0}.document-save{flex:1;text-align:right;padding-right:12px}
	.body{display:grid;grid-template-columns:260px minmax(0,1fr);min-height:0}.tree-rail{min-height:0;display:flex;flex-direction:column;background:var(--surface-1);border-right:1px solid var(--hairline);overflow:hidden}.tree-toggle{display:none}
	.workarea{position:relative;min-height:0;overflow:hidden}canvas{display:block;width:100%;height:100%;touch-action:none;outline:none}.tools{position:absolute;left:12px;top:12px;display:flex;flex-direction:column;padding:5px;background:var(--surface-1);border:1px solid var(--boundary);border-radius:8px;z-index:5;max-height:calc(100% - 24px);flex-wrap:wrap;align-content:flex-start}.tools.expanded{display:grid;grid-template-columns:repeat(3,44px);grid-auto-rows:44px;width:auto;overflow-y:auto}.more{height:44px;padding:0;font-size:24px}.right-tools{flex:0 1 auto;display:flex;gap:4px;background:var(--surface-1);border:1px solid var(--boundary);border-radius:7px;flex-wrap:wrap;justify-content:flex-end}.right-tools span{margin-left:6px;color:var(--text-2)}
	.panels{position:absolute;right:12px;top:68px;bottom:12px;width:260px;display:flex;flex-direction:column;gap:8px;overflow:auto;z-index:7;pointer-events:none}.panels>:global(*){pointer-events:auto}
	:global(.solid-workspace .panel){padding:10px;background:var(--surface-1);border:1px solid var(--boundary);border-radius:7px}.panel h2{margin:0 0 8px;font-size:20px;padding:5px 10px;border-bottom:1px solid var(--hairline)}.panel>button{width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left}.panel button span{font-size:13px;color:var(--text-2)}.body-actions{display:flex;flex-wrap:wrap;border-top:1px solid var(--hairline);margin-top:10px;padding-top:8px}.export-menu{position:absolute;top:8px;right:12px;z-index:15;width:245px}.measure,.number-entry{position:absolute;z-index:8;background:var(--surface-2);color:var(--text-1);border:1px solid var(--green);border-radius:5px;font:14px 'Share Tech Mono',monospace}.measure{padding:9px 12px;pointer-events:none}.number-entry{display:flex;width:170px}.number-entry input{width:120px;min-width:0;padding:0 8px;font-family:'Share Tech Mono',monospace}.error{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);max-width:min(600px,calc(100% - 30px));padding:8px 10px 8px 16px;display:flex;gap:10px;align-items:center;z-index:20;border:1px solid var(--ic-warn);border-radius:7px;background:var(--surface-1);font-size:17px}.error button{flex-shrink:0}.loading{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:21px}.read-only{position:absolute;bottom:12px;left:108px;padding:8px 12px;background:var(--surface-1);border:1px solid var(--hairline)}.replay{position:absolute;bottom:12px;right:12px;padding:4px 8px;font:11px 'Share Tech Mono',monospace;color:var(--text-2);background:var(--surface-1);border:1px solid var(--hairline);border-radius:4px}footer{display:flex;align-items:center;gap:20px;border-top:1px solid var(--hairline);padding:0 var(--dock-right,15px) 0 var(--dock-left,15px);font:11px 'Share Tech Mono',monospace;color:var(--text-2);min-width:0;overflow:hidden;white-space:nowrap}.tool-name{margin-left:auto}
	@media(max-width:1023px){.body{grid-template-columns:minmax(0,1fr)}.tree-rail{display:none;position:absolute;left:0;top:56px;bottom:48px;width:min(300px,80vw);z-index:9}.tree-open .tree-rail{display:flex}.tree-toggle{display:inline-flex}}
	@media(max-width:700px){.solid-workspace{grid-template-rows:52px minmax(0,1fr) 48px}header{padding:0 4px;gap:0}.documents span,.prefs-open span{display:none}.search-open{display:none}.document-save{position:absolute;bottom:5px;left:var(--dock-left,8px);right:var(--dock-right,8px);width:auto;justify-content:flex-start;z-index:12;padding:0;font-size:10px}.tool-name{display:none}.document-title{flex:1;width:80px;font-size:18px;padding:0 6px}header button{font-size:14px;padding:0 8px;white-space:nowrap}.export-open span{display:none}.tools{left:8px;right:8px;bottom:8px;top:auto;flex-direction:row;flex-wrap:nowrap!important;width:auto!important;overflow-x:auto;overflow-y:hidden;max-height:66px}.tools.expanded{display:grid;grid-template-columns:repeat(6,44px);grid-auto-rows:44px;max-height:none;overflow:visible;right:auto}.workarea:has(.tools.expanded) .triad-slot{bottom:206px}.workarea:has(.panels>:global(.panel)) .empty-slot{display:none}.top-bar,.workarea:has(.tools.expanded) .top-bar{left:8px;right:8px;top:8px;flex-direction:column;align-items:stretch}.right-tools{align-self:flex-end}.right-tools button{font-size:13px;padding:0 8px}.right-tools span{display:none}.panels{right:8px;left:8px;top:112px;bottom:80px;width:auto}.workarea:has(.tools.expanded) .panels{bottom:206px}.error{bottom:80px;font-size:16px}.triad-slot{left:8px;bottom:82px;width:64px;height:64px}.read-only{bottom:82px;left:80px}.empty-slot{top:120px}.tree-rail{top:52px;bottom:48px}footer{gap:10px;font-size:10px;align-items:flex-start;padding-top:8px}}
</style>
