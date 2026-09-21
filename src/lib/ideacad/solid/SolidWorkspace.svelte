<script lang="ts">
	/**
	 * THE MODELER. One kernel in a worker, one viewport, the design tree beside
	 * it, and the panels around them. Every edit is a `SolidCommand` sent
	 * through `apply` or a gesture, and every panel reads the same `api`.
	 *
	 * THIS FILE HAS ONE WRITER. Each panel is its own component with `api` as
	 * its only prop (`workspace-api.ts`), so a surface grows in its own file.
	 */
	import { onMount, onDestroy, untrack } from 'svelte';
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
	import type {AdvisoryTransport,AdvisoryRules} from './advisory';
	import {STOCK_MATERIALS} from './advisory';
	import {diffTrees} from '../history';
	import {foldGroups,groupHistory,inverseOperation,type DirectRow} from './history';
	import { TOOLS, QUICK_TOOLS } from './tools';
	import { SolidClient } from './client';
	import { SolidViewport, EMPTY_MODEL, type DragValue, type Gesture, type Tool, type DrawPlane } from './viewport';
	import { datumPlane } from './sketch/model';
	import { refFromSelection } from './naming';
	import { newFeatureId } from './features';
	import { download, sketchDxf,profileDxf,solidStl, solidThreeMf } from './export';
	import type { WorkspaceApi } from './workspace-api';
	import type { EdgeRef, FaceRef, Feature, ModelProjection, ModelSnapshot, PlaneRef, Selection, Sketch, SolidCommand, SolidDocument, SolidHistoryAction, SolidTransport } from './types';

	let {document:opened,transport,advisoryTransport,onback,dev=false}:{document:SolidDocument;transport:SolidTransport;advisoryTransport?:AdvisoryTransport;onback:()=>void;dev?:boolean}=$props();
	let rules:AdvisoryRules|null=$state(null),settingsOpen=$state(false);
	let title=$state(untrack(()=>opened.title));
	let canvas:HTMLCanvasElement=$state()!;
	let client:SolidClient;let viewport:SolidViewport;
	let model:ModelProjection=$state(EMPTY_MODEL);
	let selections:Selection[]=$state([]),tool:Tool=$state('select'),planeName=$state<'XY'|'XZ'|'YZ'>('XY');
	let error=$state(''),loading=$state(true),busy=$state(false),more=$state(false),objectsOpen=$state(false),addonOpen=$state(false),exportOpen=$state(false),treeOpen=$state(false),referenceOpen=$state(false),matesOpen=$state(false);
	let reopenConfirm=$state(false);
	let editingSketch=$state<string|null>(null);
	let measure=$state<{text:string;x:number;y:number}|null>(null),numeric=$state<{value:string;x:number;y:number}|null>(null);
	let numericInput:HTMLInputElement=$state()!;
	let importInput:HTMLInputElement=$state()!;
	let gesture:Gesture|null=null,gestureFeature='',queued:SolidCommand|null=null,pumping:Promise<void>|null=null;
	let currentSnapshot=untrack(()=>opened.snapshot),revision=untrack(()=>opened.revision);
	let actions:SolidHistoryAction[]=[];let committed=false;let gestureBefore:ModelSnapshot|null=null;let gestureCenter:[number,number,number]=[0,0,0];
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
	const shownTools=$derived(more?TOOLS:TOOLS.filter(t=>QUICK_TOOLS.includes(t.id)));
	const openSketches=$derived(model.sketches.filter(s=>!s.consumed));
	function show(result:ModelProjection){model=result;viewport?.display(result);}
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
		if(JSON.stringify(before.manifest)===JSON.stringify(after.manifest))return;
		const id=crypto.randomUUID(),patches=changes??diffTrees(before.manifest,after.manifest),seq=history.length,resultRevision=groupHistory(history).length+2;
		if(!patches.length)return;
		actions.push({id,label,before:before.manifest,after:after.manifest,createdAt:new Date().toISOString(),changes:patches});
		history=[...history,...patches.map((patch,i)=>({...patch,seq:seq+i,operationId:id,operationStart:i===0,operationLabel:i===0?label:null,resultRevision:i===0?resultRevision:null}))];saveState.markDirty();
	}
	async function apply(command:SolidCommand,label:string){
		if(!opened.canWrite||busy||loading)return;busy=true;error='';
		const before=currentSnapshot;
		try{show(await client.request<ModelProjection>('apply',command));await record(label,before);}
		catch(err){error=err instanceof Error?err.message:String(err);show(await client.request<ModelProjection>('project'));}
		finally{busy=false;}
	}
	async function createSketch(sketch:Sketch,ref:PlaneRef){await apply({type:'sketch',sketch,planeRef:ref},'Draw sketch');tool='extrude';select({bodyId:'',kind:'sketch',id:sketch.id});viewport.highlight();}
	async function begin(next:Gesture){
		if(!opened.canWrite)throw Error('This document is read-only.');
		if(busy)throw Error('Finish the current change first.');gesture=next;gestureFeature=newFeatureId();gestureBefore=currentSnapshot;gestureCenter=[...(model.bodies.find(b=>b.id===next.selection.bodyId)?.centerOfMass??[0,0,0])];committed=false;await client.request('begin');
	}
	/** The reference a feature stores for a selection, with its hint, from the projection the gesture started on. */
	function ref(selection:Selection){const body=model.bodies.find(b=>b.id===selection.bodyId);if(!body)throw Error('Select something on a body.');return refFromSelection(selection,body);}
	/** Omit distributed over the feature union, so each member keeps its own discriminated fields. */
	type FeatureInput=Feature extends infer F?F extends Feature?Omit<F,'id'|'name'>&{name?:string}:never:never;
	const feature=(f:FeatureInput):SolidCommand=>({type:'add-feature',feature:{id:gestureFeature,name:'',...f} as Feature});
	function commandFor(value:DragValue):SolidCommand|null {
		if(!gesture)return null;const {selection,tool:active,axis}=gesture;
		if(selection.kind==='sketch'){
			const sketch=model.sketches.find(s=>s.feature===selection.id);if(!sketch)return null;
			if(active==='revolve')return feature({type:'revolve',sketch:selection.id,angle:value.angle,axis:{kind:'sketch',feature:selection.id,axis:'v'},operation:'new'});
			const support=sketch.planeRef.kind==='face'?sketch.planeRef.face.body:undefined;
			return feature({type:'extrude',sketch:selection.id,distance:value.distance,operation:support?(value.distance<0?'cut':'add'):'new',target:support});
		}
		if(active==='fillet'||active==='chamfer'){
			const edges=[...selections.filter(s=>s.kind==='edge'),...(selection.kind==='edge'&&!selections.some(s=>s.id===selection.id)?[selection]:[])].map(s=>ref(s) as EdgeRef);
			if(!edges.length)return null;
			return active==='fillet'?feature({type:'fillet',edges,radius:Math.abs(value.distance)}):feature({type:'chamfer',edges,distance:Math.abs(value.distance)});
		}
		if(active==='shell'){const open=[...selections.filter(s=>s.kind==='face'),...(selection.kind==='face'&&!selections.some(s=>s.id===selection.id)?[selection]:[])].map(s=>ref(s) as FaceRef);return feature({type:'shell',body:selection.bodyId,thickness:Math.abs(value.distance),openFaces:open});}
		if(active==='linear-pattern'||active==='circular-pattern')return feature({type:'pattern',body:selection.bodyId,mode:active==='linear-pattern'?'linear':'circular',axis:{kind:'datum',axis:active==='linear-pattern'?'X':'Z'},spacing:active==='linear-pattern'?value.distance:360/value.count,count:value.count});
		if(active==='rotate'||active==='scale'||active==='move'){
			if(active==='move'&&(selection.kind==='edge'||selection.kind==='vertex'))return feature({type:'move-selection',entity:ref(selection) as EdgeRef,delta:scaleVector(axis,value.distance)});
			const matrix=new THREE.Matrix4(),center=new THREE.Vector3(...gestureCenter);
			if(active==='move')matrix.makeTranslation(...scaleVector(axis,value.distance));
			else if(active==='rotate')matrix.makeRotationAxis(new THREE.Vector3(...axis),value.angle*Math.PI/180);
			else {const factor=1+value.distance;matrix.makeScale(factor,factor,factor);}
			if(active!=='move')matrix.premultiply(new THREE.Matrix4().makeTranslation(...center.toArray())).multiply(new THREE.Matrix4().makeTranslation(...center.negate().toArray()));
			return feature({type:'transform',bodies:[...new Set([selection.bodyId,...selections.map(s=>s.bodyId)].filter(Boolean))],matrix:matrix.clone().transpose().toArray()});
		}
		if(selection.kind==='edge'||selection.kind==='vertex')return feature({type:'move-selection',entity:ref(selection) as EdgeRef,delta:value.delta});
		if(selection.kind==='face')return feature({type:'push',face:ref(selection) as FaceRef,value:value.distance});
		return null;
	}
	const scaleVector=(v:[number,number,number],n:number):[number,number,number]=>[v[0]*n,v[1]*n,v[2]*n];
	function update(value:DragValue){
		let command:SolidCommand|null;try{command=commandFor(value);}catch(err){error=err instanceof Error?err.message:String(err);return;}if(!command)return;
		measure={text:gesture?.tool==='revolve'||gesture?.tool==='rotate'?`${value.angle.toFixed(1)}°`:gesture?.tool.includes('pattern')?`${value.count} × ${(gesture?.tool==='circular-pattern'?360/value.count:value.distance).toFixed(gesture?.tool==='circular-pattern'?1:3)} ${gesture?.tool==='circular-pattern'?'°':'in'}`:`${value.distance.toFixed(3)} in`,x:value.point.x,y:value.point.y};
		queued=command;pump();
	}
	function pump(){
		if(pumping)return pumping;
		pumping=(async()=>{while(queued){const next=queued;queued=null;try{show(await client.request<ModelProjection>('update',next));error='';}catch(err){error=err instanceof Error?err.message:String(err);show(await client.request<ModelProjection>('project'));}}})().finally(()=>pumping=null);
		return pumping;
	}
	async function end(){
		if(committed)return;committed=true;busy=true;
		try{await pumping;if(queued)await pump();show(await client.request<ModelProjection>('commit'));if(gestureBefore)await record(TOOLS.find(t=>t.id===gesture?.tool)?.name??'Edit solid',gestureBefore);}
		catch(err){error=err instanceof Error?err.message:String(err);}
		finally{gesture=null;gestureBefore=null;measure=null;numeric=null;busy=false;}
	}
	async function cancel(){queued=null;await pumping;if(client){show(await client.request<ModelProjection>('cancel'));}gesture=null;gestureBefore=null;measure=null;numeric=null;}
	async function undo(redo=false){if(!opened.canWrite||busy||loading||gesture)return;const target=redo?historyState.redoTarget:historyState.undoTarget;if(!target)return;busy=true;const before=currentSnapshot;try{const inverse=inverseOperation(before.manifest,target);show(await client.request<ModelProjection>('load',{manifest:inverse.after,artifacts:before.artifacts}));await record(redo?'Redo':'Undo',before,inverse.actions);title=currentSnapshot.manifest.title;}catch(err){error=err instanceof Error?err.message:String(err);}finally{busy=false;}}
	async function enterNumeric(){
		if(!opened.canWrite||busy||loading)return;
		const value=Number(numeric?.value);if(!Number.isFinite(value)){error='Enter a finite number.';return;}
		if(!gesture){const selection=selections[0];if(!selection)return;const body=model.bodies.find(b=>b.id===selection.bodyId),face=body?.faces.find(f=>f.id===selection.id),sketch=model.sketches.find(s=>s.feature===selection.id);try{await begin({selection,tool,start:face?.center??sketch?.plane.origin??[0,0,0],axis:face?.normal??sketch?.plane.normal??[0,0,1]});}catch(err){error=err instanceof Error?err.message:String(err);numeric=null;return;}}
		update({distance:value,angle:value,delta:scaleVector(gesture!.axis,value),count:Math.round(value),point:{x:numeric?.x??0,y:numeric?.y??0}});await end();canvas.focus();
	}
	async function back(){if(gesture)await end();await saveState.saveNow();if(saveState.dirty)return;onback();}
	async function reopenSaved(){
		if(busy)return;busy=true;error='';
		try{const fresh=await transport.open(opened.id);show(await client.request<ModelProjection>('load',fresh.snapshot));opened=fresh;currentSnapshot=fresh.snapshot;title=fresh.title;revision=fresh.revision;history=fresh.history??[];actions=[];select(null);viewport.fit();saveState.markSaved();reopenConfirm=false;}
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
		try{viewport.painted();const scaled=document.createElement('canvas');scaled.width=160;scaled.height=120;scaled.getContext('2d')?.drawImage(canvas,0,0,160,120);await transport.thumbnail(opened.id,scaled.toDataURL('image/png'));}catch{/* a thumbnail is decoration */}
	}
	function keydown(e:KeyboardEvent){
		if(settingsOpen)return;
		const typing=(e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]');if(typing)return;
		if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();void undo(e.shiftKey);}
		else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(selections.length)void apply({type:'delete',selections},'Delete selection');}
	}
	async function openSettings(){if(!advisoryTransport)return;try{rules=await advisoryTransport.read();settingsOpen=true;}catch(err){error=err instanceof Error?err.message:String(err);}}
	/** What every panel reads and writes through. Getters, so a panel's `$derived` tracks the workspace's own state. */
	const api:WorkspaceApi={
		get model(){return model;},get selections(){return selections;},get canWrite(){return opened.canWrite&&!loading;},get busy(){return busy||loading;},get tool(){return tool;},get editingSketch(){return editingSketch;},
		apply,select,setTool,editSketch,
		request:(method,value)=>client.request(method,value),
		project:(p)=>viewport.projectPoint(p),
		error:(message)=>{error=message;}
	};
	onMount(()=>{
		const readRules=()=>{if(advisoryTransport)void advisoryTransport.read().then(value=>rules=value).catch(err=>error=err.message);};readRules();
		window.addEventListener('focus',readRules);const ruleTimer=setInterval(readRules,60000);
		client=new SolidClient();viewport=new SolidViewport(canvas,{getTool:()=>tool,getPlane:():DrawPlane=>({plane:datumPlane(planeName),ref:{kind:'datum',datum:planeName}}),getSelections:()=>selections,canWrite:()=>opened.canWrite,select,begin,update,end:()=>void end(),cancel:()=>void cancel(),sketch:(s,r)=>void createSketch(s,r),numeric:(key,point)=>{numeric={value:key,...point};requestAnimationFrame(()=>numericInput?.focus());},error:message=>error=message});
		for(const m of STOCK_MATERIALS)if(m.color)viewport.materialColours.set(m.id,m.color);
		client.request<ModelProjection>('load',opened.snapshot).then(result=>{show(result);viewport.fit();loading=false;saveState.markSaved();}).catch(err=>{error=err.message;loading=false;});
		const unbind=saveState.attach();
		if(dev)(window as unknown as {ideaCadSolid:unknown}).ideaCadSolid={get model(){return model;},get snapshot(){return currentSnapshot;},get busy(){return busy||loading||!!pumping;},get selections(){return selections;},apply,select,setTool,editSketch,project:(p:[number,number,number])=>viewport.projectPoint(p),painted:()=>viewport.painted(),fit:()=>viewport.fit(),view:(v:'iso'|'top'|'front'|'right')=>viewport.view(v),save:()=>saveState.saveNow(),undo,frameCosts:viewport.frameCosts,request:(method:string,value?:unknown)=>client.request(method,value)};
		return()=>{clearInterval(ruleTimer);window.removeEventListener('focus',readRules);unbind();viewport.destroy();client.destroy();};
	});
	onDestroy(()=>saveState.destroy());
	/* The live readout while drawing: the viewport owns the geometry, this owns the words. */
	$effect(()=>{if(!viewport)return;const timer=setInterval(()=>{if(gesture||!viewport.isDrawing()){if(!gesture&&!viewport?.isDrawing()&&measure&&!numeric)measure=null;return;}const r=viewport.drawingReadout();if(r)measure={text:r.text,x:r.point.x,y:r.point.y};},50);return()=>clearInterval(timer);});
</script>

<svelte:window onkeydown={keydown}/>
<section class="ic-root solid-workspace" class:save-failed={saveState.failed} class:tree-open={treeOpen} aria-label="IdeaCAD modeler">
	<header>
		<button class="documents" onclick={()=>void back()} aria-label="Documents">‹ <span>Documents</span></button>
		<input class="document-title" aria-label="Document name" bind:value={title} readonly={!opened.canWrite||loading||busy} maxlength="120" onchange={()=>void apply({type:'title',title},'Rename document')}/>
		<div class="document-save"><SaveIndicator state={saveState} hideClean={false}/></div>
		<button aria-label="Undo" onclick={()=>void undo()} disabled={!historyState.undoTarget||!opened.canWrite||busy}>↶</button>
		<button aria-label="Redo" onclick={()=>void undo(true)} disabled={!historyState.redoTarget||!opened.canWrite||busy}>↷</button>
		<button class="tree-toggle" class:active={treeOpen} aria-expanded={treeOpen} onclick={()=>treeOpen=!treeOpen}>Tree</button>
		<button class:active={exportOpen} onclick={()=>exportOpen=!exportOpen}>Export ↗</button>
	</header>
	<div class="body">
		<aside class="tree-rail" aria-label="Design tree rail"><FeatureTree {api}/></aside>
		<div class="workarea">
			<canvas bind:this={canvas} tabindex="0" aria-label="3D model: select and drag geometry"></canvas>
			<nav class="tools" class:expanded={more} aria-label="Modeling tools">
				{#each shownTools as item (item.id)}<ToolButton name={item.name} description={item.description} icon={item.icon} active={tool===item.id} onclick={()=>setTool(item.id)}/>{/each}
				<button class="more" aria-label={more?'Fewer tools':'More tools'} aria-expanded={more} onclick={()=>more=!more}>{more?'−':'⋯'}</button>
			</nav>
			<div class="view-tools">
				<select aria-label="Sketch plane" bind:value={planeName}><option>XY</option><option>XZ</option><option>YZ</option></select>
				<button aria-label="Fit model" title="Fit model (F)" onclick={()=>viewport.fit()}>⊡</button>
				<button aria-label="Top view" onclick={()=>viewport.view('top')}>Top</button>
				<button aria-label="Isometric view" onclick={()=>viewport.view('iso')}>3D</button>
			</div>
			<div class="right-tools"><button class:active={objectsOpen} onclick={()=>objectsOpen=!objectsOpen}>Objects <span>{model.bodies.length+openSketches.length}</span></button><button class:active={referenceOpen} onclick={()=>referenceOpen=!referenceOpen}>Reference</button><button class:active={matesOpen} onclick={()=>matesOpen=!matesOpen}>Mates</button><button class:active={addonOpen} onclick={()=>addonOpen=!addonOpen}>Add-ons</button></div>
			{#if loading}<div class="loading" role="status">Loading geometry…</div>{/if}
			{#if !opened.canWrite}<div class="read-only">{opened.deletedAt?'In the trash':opened.archivedAt?'Archived':'View only'}</div>{/if}
			{#if model.replayMs!==undefined&&model.replayMs>0&&dev}<div class="replay" data-testid="ideacad-replay">replayed from {model.replayedFrom} in {model.replayMs.toFixed(1)} ms</div>{/if}
			{#if saveState.failed}<aside class="recovery panel" aria-label="Save recovery"><h2>Changes not saved</h2><p>{saveState.message}</p><button onclick={()=>void exportFile('ideacad')}>Save backup</button>{#if reopenConfirm}<p>Discard unsaved changes and open the saved model?</p><button disabled={busy} onclick={()=>void reopenSaved()}>Discard and reopen</button><button onclick={()=>reopenConfirm=false}>Cancel</button>{:else}<button disabled={busy} onclick={()=>reopenConfirm=true}>Reopen saved model</button>{/if}</aside>{/if}
			<div class="panels">
				{#if editingSketch}<SketchEditor {api}/>{/if}
				<FeaturePanel {api}/>
				{#if referenceOpen}<ReferencePanel {api}/>{/if}
				{#if matesOpen}<MatePanel {api}/>{/if}
				{#if objectsOpen}
					<aside class="objects panel" aria-label="Objects"><h2>Objects</h2>
						{#each openSketches as sketch (sketch.feature)}<button class:selected={selections.some(s=>s.id===sketch.feature)} onclick={()=>{select({bodyId:'',kind:'sketch',id:sketch.feature});setTool('extrude');}}>◇ {sketch.name}<span>{sketch.regions.length?`${sketch.regions.length} closed`:'open'}</span></button>{/each}
						{#each model.bodies as body (body.id)}<button class:selected={selections.some(s=>s.bodyId===body.id)} onclick={(e)=>select({bodyId:body.id,kind:'body',id:body.id},e.shiftKey)}>▱ {body.name}</button>{/each}
						{#if selectedBody}<BodyProperties body={selectedBody} canWrite={opened.canWrite&&!loading&&!busy} change={(command,label)=>void apply(command,label)}/><div class="body-actions"><button onclick={()=>void apply({type:'add-feature',feature:{id:'',name:'',type:'mirror',bodies:[selectedBody.id],plane:{kind:'datum',datum:planeName}}},'Mirror body')}>Mirror {planeName}</button><button onclick={()=>void apply({type:'delete',selections:[{bodyId:selectedBody.id,kind:'body',id:selectedBody.id}]},'Delete body')}>Delete body</button></div>{/if}
						{#if new Set(selections.map(s=>s.bodyId).filter(Boolean)).size>1}<div class="body-actions">{#each ['union','subtract','intersect'] as operation}<button onclick={()=>void apply({type:'add-feature',feature:{id:'',name:'',type:'boolean',operation:operation as 'union'|'subtract'|'intersect',bodies:[...new Set(selections.map(s=>s.bodyId).filter(Boolean))]}},operation)}>{operation}</button>{/each}</div>{/if}
					</aside>
				{/if}
				{#if addonOpen}<AddonPanel {api} {rules} onsettings={()=>void openSettings()}/>{/if}
			</div>
			{#if exportOpen}<div class="export-menu panel" role="group" aria-label="Export format"><button onclick={()=>exportFile('3mf')}>3MF <span>Recommended</span></button><button onclick={()=>exportFile('stl')}>STL</button><button onclick={()=>exportFile('dxf')}>DXF profile</button><button onclick={()=>exportFile('ideacad')}>IdeaCAD backup</button>{#if opened.canWrite}<button onclick={()=>importInput.click()}>Import IdeaCAD backup</button>{/if}</div>{/if}
			<input type="file" accept=".ideacad" bind:this={importInput} hidden onchange={e=>void importBackup(e.currentTarget.files?.[0])}/>
			{#if measure&&!numeric}<output class="measure" style:left={`${Math.min(measure.x+16,(canvas?.clientWidth??1000)-160)}px`} style:top={`${measure.y+16}px`}>{measure.text}</output>{/if}
			{#if numeric}<form class="number-entry" style:left={`${Math.min(numeric.x+16,(canvas?.clientWidth??1000)-170)}px`} style:top={`${Math.min(numeric.y+16,(canvas?.clientHeight??800)-64)}px`} onsubmit={(e)=>{e.preventDefault();void enterNumeric();}}><input bind:this={numericInput} bind:value={numeric.value} aria-label="Exact value" inputmode="decimal"/><button type="submit" aria-label="Use exact value">↵</button></form>{/if}
			{#if error}<div class="error" role="alert"><span>{error}</span><button aria-label="Dismiss message" onclick={()=>error=''}>×</button></div>{/if}
		</div>
	</div>
	{#if settingsOpen&&rules&&advisoryTransport}<div class="settings-overlay"><AdvisorySettings {rules} transport={advisoryTransport} onchange={value=>rules=value} onclose={()=>settingsOpen=false}/></div>{/if}
	<footer><span>{model.bodies.length} {model.bodies.length===1?'body':'bodies'}</span><span>{model.features.length} features</span><span>inches</span><span>{selections.length?`${selections.length} selected`:''}</span><span class="tool-name">{TOOLS.find(t=>t.id===tool)?.name}</span></footer>
</section>

<style>
	@media(max-width:700px){:global(body:has(.solid-workspace) .sfb-shell){bottom:96px;right:8px}:global(body:has(.solid-workspace) .sfb-word){display:none}}
	.settings-overlay{position:absolute;inset:0;z-index:40;background:#0008;display:grid;place-items:center}.solid-workspace{position:relative}
	.recovery{z-index:22}.recovery p{font-size:16px;color:var(--text-2)}
	.document-save{min-width:0;display:flex;justify-content:flex-end}.document-save :global(.save-ind){max-width:100%;flex-wrap:nowrap}.document-save :global(.save-ind-text){min-width:0;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
	.solid-workspace{grid-template-columns:minmax(0,1fr)}
	@media(max-width:700px){.solid-workspace.save-failed{grid-template-rows:52px minmax(0,1fr) 48px}}
	.solid-workspace{height:100%;min-height:0;display:grid;grid-template-rows:56px minmax(0,1fr) 28px;overflow:hidden;background:var(--surface-0);color:var(--text-1);font-family:Rajdhani,sans-serif}header{display:flex;gap:4px;align-items:center;padding:0 12px;background:var(--surface-1);border-bottom:1px solid var(--boundary);z-index:10}button,input,select{font:600 16px Rajdhani,sans-serif;color:var(--text-1);min-height:44px;min-width:44px;border:1px solid transparent;border-radius:5px;background:transparent}button{cursor:pointer;padding:0 12px}button:hover{background:var(--surface-2)}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}button.active,button.selected{background:color-mix(in srgb,var(--green) 12%,var(--surface-1));border-color:var(--green);color:var(--green)}button:disabled{opacity:.4;cursor:default}.documents{display:flex;gap:8px;align-items:center}.document-title{max-width:300px;width:25vw;min-width:80px;font-size:21px;padding:0 12px;border-left:1px solid var(--boundary);border-radius:0}.document-save{flex:1;text-align:right;padding-right:12px}
	.body{display:grid;grid-template-columns:260px minmax(0,1fr);min-height:0}.tree-rail{min-height:0;display:flex;flex-direction:column;background:var(--surface-1);border-right:1px solid var(--boundary);overflow:hidden}.tree-toggle{display:none}
	.workarea{position:relative;min-height:0;overflow:hidden}canvas{display:block;width:100%;height:100%;touch-action:none;outline:none}.tools{position:absolute;left:12px;top:12px;display:flex;flex-direction:column;padding:5px;background:var(--surface-1);border:1px solid var(--boundary);border-radius:8px;z-index:5;max-height:calc(100% - 24px);flex-wrap:wrap;align-content:flex-start}.tools.expanded{width:110px}.more{height:44px;padding:0;font-size:24px}.view-tools{position:absolute;left:50%;transform:translateX(-50%);top:12px;display:flex;padding:2px;background:var(--surface-1);border:1px solid var(--boundary);border-radius:7px}.view-tools select{padding:0 8px;background:var(--surface-1)}.right-tools{position:absolute;right:12px;top:12px;display:flex;gap:4px;background:var(--surface-1);border:1px solid var(--boundary);border-radius:7px;flex-wrap:wrap;justify-content:flex-end;max-width:calc(100% - 24px)}.right-tools span{margin-left:6px;color:var(--text-2)}
	.panels{position:absolute;right:12px;top:68px;bottom:12px;width:260px;display:flex;flex-direction:column;gap:8px;overflow:auto;z-index:7;pointer-events:none}.panels>:global(*){pointer-events:auto}
	:global(.solid-workspace .panel){padding:10px;background:var(--surface-1);border:1px solid var(--boundary);border-radius:7px}.panel h2{margin:0 0 8px;font-size:20px;padding:5px 10px;border-bottom:1px solid var(--boundary)}.panel>button{width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left}.panel button span{font-size:13px;color:var(--text-2)}.body-actions{display:flex;flex-wrap:wrap;border-top:1px solid var(--boundary);margin-top:10px;padding-top:8px}.export-menu{position:absolute;top:8px;right:12px;z-index:15;width:245px}.measure,.number-entry{position:absolute;z-index:8;background:var(--surface-2);color:var(--text-1);border:1px solid var(--green);border-radius:5px;font:14px 'Share Tech Mono',monospace}.measure{padding:9px 12px;pointer-events:none}.number-entry{display:flex;width:170px}.number-entry input{width:120px;min-width:0;padding:0 8px;font-family:'Share Tech Mono',monospace}.error{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);max-width:min(600px,calc(100% - 30px));padding:8px 10px 8px 16px;display:flex;gap:10px;align-items:center;z-index:20;border:1px solid var(--warning);border-radius:7px;background:var(--surface-1);font-size:17px}.error button{flex-shrink:0}.loading{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:21px}.read-only{position:absolute;bottom:12px;left:12px;padding:8px 12px;background:var(--surface-1);border:1px solid var(--boundary)}.replay{position:absolute;bottom:12px;right:12px;padding:4px 8px;font:11px 'Share Tech Mono',monospace;color:var(--text-2);background:var(--surface-1);border:1px solid var(--boundary);border-radius:4px}footer{display:flex;align-items:center;gap:20px;border-top:1px solid var(--boundary);padding:0 15px;font:11px 'Share Tech Mono',monospace;color:var(--text-2)}.tool-name{margin-left:auto}
	@media(max-width:1023px){.body{grid-template-columns:minmax(0,1fr)}.tree-rail{display:none;position:absolute;left:0;top:56px;bottom:28px;width:min(300px,80vw);z-index:9}.tree-open .tree-rail{display:flex}.tree-toggle{display:inline-flex}}
	@media(max-width:700px){.solid-workspace{grid-template-rows:52px minmax(0,1fr) 26px}header{padding:0 4px;gap:0}.documents span{display:none}.document-save{position:absolute;bottom:4px;right:8px;width:55vw;max-width:calc(100% - 16px);z-index:12;padding:0;font-size:10px}.tool-name{display:none}.document-title{flex:1;width:80px;font-size:18px;padding:0 6px}header button{font-size:14px;padding:0 8px}.tools{left:8px;right:8px;bottom:8px;top:auto;flex-direction:row;flex-wrap:nowrap!important;width:auto!important;overflow-x:auto;overflow-y:hidden;max-height:66px}.view-tools{left:8px;transform:none;top:8px}.view-tools button{font-size:13px;padding:0 8px}.right-tools{right:8px;top:8px}.right-tools button{font-size:13px;padding:0 8px}.right-tools span{display:none}.panels{right:8px;left:8px;top:64px;bottom:80px;width:auto}.error{bottom:80px;font-size:16px}.read-only{bottom:74px}.tree-rail{top:52px;bottom:26px}footer{gap:10px;font-size:10px}}
</style>
