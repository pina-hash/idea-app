<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import * as THREE from 'three';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import { SaveState } from '$lib/save-state.svelte';
	import { guardSaveNavigation } from '$lib/save-guard.svelte';
	import '../ideacad.css';
	import ToolButton from './ToolButton.svelte';
	import BodyProperties from './BodyProperties.svelte';
	import AdvisoryPanel from './AdvisoryPanel.svelte';
	import AdvisorySettings from './AdvisorySettings.svelte';
	import type {AdvisoryTransport,AdvisoryRules} from './advisory';
	import {diffTrees} from '../history';
	import {foldGroups,groupHistory,inverseOperation,type DirectRow} from './history';
	import { TOOLS } from './tools';
	import { SolidClient } from './client';
	import { SolidViewport, type DragValue, type Gesture, type Tool } from './viewport';
	import { PLANES, scale as scaleVector, vector } from './math';
	import { download, sketchDxf,profileDxf,solidStl, solidThreeMf } from './export';
	import type { ModelProjection, ModelSnapshot, Selection, Sketch, SolidCommand, SolidDocument, SolidHistoryAction, SolidTransport } from './types';

	let {document:opened,transport,advisoryTransport,onback,dev=false}:{document:SolidDocument;transport:SolidTransport;advisoryTransport?:AdvisoryTransport;onback:()=>void;dev?:boolean}=$props();
	let rules:AdvisoryRules|null=$state(null),settingsOpen=$state(false);
	let title=$state(untrack(()=>opened.title));
	let canvas:HTMLCanvasElement=$state()!;
	let client:SolidClient;let viewport:SolidViewport;
	let model:ModelProjection=$state({bodies:[],sketches:[],addons:{ideaBlade:false},canUndo:false,canRedo:false,operationMs:0});
	let selections:Selection[]=$state([]),tool:Tool=$state('select'),planeName=$state('XY');
	let error=$state(''),loading=$state(true),busy=$state(false),more=$state(false),objectsOpen=$state(false),addonOpen=$state(false),exportOpen=$state(false);
	let reopenConfirm=$state(false);
	let measure=$state<{text:string;x:number;y:number}|null>(null),numeric=$state<{value:string;x:number;y:number}|null>(null);
	let numericInput:HTMLInputElement=$state()!;
	let importInput:HTMLInputElement=$state()!;
	let gesture:Gesture|null=null,queued:SolidCommand|null=null,pumping:Promise<void>|null=null;
	let currentSnapshot=untrack(()=>opened.snapshot),revision=untrack(()=>opened.revision);
	let actions:SolidHistoryAction[]=[];let committed=false;let gestureBefore:ModelSnapshot|null=null;let gestureCenter:[number,number,number]=[0,0,0];
	let history:DirectRow[]=$state(untrack(()=>opened.history??[{seq:0,kind:'origin',path:'',after:opened.snapshot.manifest}]));
	const historyState=$derived(foldGroups(groupHistory(history)));
	const saveState=new SaveState({save:async()=>{
		if(!actions.length)return {ok:true};
		const batch=actions.slice(),last=batch[batch.length-1];
		try{
			const saved=await transport.save({documentId:opened.id,conceptId:opened.conceptId,expectedRevision:revision,requestId:batch[0].id,title:last.after.title,snapshot:{manifest:last.after,artifacts:currentSnapshot.artifacts},actions:batch});
			revision=saved.revision;const sent=new Set(batch.map(a=>a.id));actions=actions.filter(a=>!sent.has(a.id));return {ok:true};
		}catch(err){const message=err instanceof Error?err.message:String(err);return {ok:false,retryable:!message.includes('changed in another')&&!message.includes('read-only')&&!message.includes('permission'),message};}
	}});
	guardSaveNavigation(saveState,{warning:'Your latest model changes have not been saved.',enabled:()=>opened.canWrite});
	const selectedBody=$derived(model.bodies.find(b=>b.id===selections[0]?.bodyId));
	const selectedSketch=$derived(model.sketches.find(s=>s.id===selections[0]?.id));
	const shownTools=$derived(more?TOOLS:TOOLS.filter(t=>['select','rectangle','circle','line','extrude','fillet','move'].includes(t.id)));
	function show(result:ModelProjection){model=result;viewport?.display(result);}
	function select(selection:Selection|null,append=false){
		if(!selection)selections=[];
		else if(append){const exists=selections.some(s=>s.bodyId===selection.bodyId&&s.id===selection.id&&s.kind===selection.kind);selections=exists?selections.filter(s=>!(s.bodyId===selection.bodyId&&s.id===selection.id)): [...selections,selection];}
		else selections=[selection];
		viewport?.highlight();
	}
	function setTool(next:Tool){if(gesture)void cancel();viewport?.clearDrawing();tool=next;error='';viewport?.highlight();canvas?.focus();}
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
	async function createSketch(sketch:Sketch){await apply({type:'sketch',sketch},'Draw sketch');tool='extrude';select({bodyId:'',kind:'sketch',id:sketch.id});viewport.highlight();}
	async function begin(next:Gesture){
		if(!opened.canWrite)throw Error('This document is read-only.');
		if(busy)throw Error('Finish the current change first.');gesture=next;gestureBefore=currentSnapshot;gestureCenter=[...(model.bodies.find(b=>b.id===next.selection.bodyId)?.centerOfMass??[0,0,0])];committed=false;await client.request('begin');
	}
	function commandFor(value:DragValue):SolidCommand|null {
		if(!gesture)return null;const {selection,tool:active,axis}=gesture;
		if(selection.kind==='sketch'){
			if(active==='revolve'){const sketch=gestureBefore?.manifest.sketches.find(s=>s.id===selection.id);if(!sketch)return null;return{type:'revolve',sketchId:selection.id,angle:value.angle,origin:sketch.plane.origin,axis:sketch.plane.v};}
			const distance=value.distance,sketch=gestureBefore?.manifest.sketches.find(s=>s.id===selection.id);
			return{type:'extrude',sketchId:selection.id,distance,operation:sketch?.supportBodyId?(distance<0?'cut':'add'):'new',targetId:sketch?.supportBodyId};
		}
		if(['fillet','chamfer','shell'].includes(active))return{type:active as 'fillet'|'chamfer'|'shell',selection,value:Math.abs(value.distance)};
		if(active==='linear-pattern'||active==='circular-pattern')return{type:'pattern',bodyId:selection.bodyId,mode:active==='linear-pattern'?'linear':'circular',direction:active==='linear-pattern'?[1,0,0]:[0,0,1],spacing:value.distance,count:value.count};
		if(active==='rotate'||active==='scale'||active==='move'){
			if(active==='move'&&(selection.kind==='edge'||selection.kind==='vertex'))return{type:'move-selection',selection,delta:scaleVector(axis,value.distance)};
			const matrix=new THREE.Matrix4(),center=new THREE.Vector3(...gestureCenter);
			if(active==='move')matrix.makeTranslation(...scaleVector(axis,value.distance));
			else if(active==='rotate')matrix.makeRotationAxis(new THREE.Vector3(...axis),value.angle*Math.PI/180);
			else {const factor=1+value.distance;matrix.makeScale(factor,factor,factor);}
			if(active!=='move')matrix.premultiply(new THREE.Matrix4().makeTranslation(...center.toArray())).multiply(new THREE.Matrix4().makeTranslation(...center.negate().toArray()));
			return{type:'transform',bodyIds:[...new Set(selections.map(s=>s.bodyId).filter(Boolean))],matrix:matrix.clone().transpose().toArray()};
		}
		if(selection.kind==='edge'||selection.kind==='vertex')return{type:'move-selection',selection,delta:value.delta};
		return{type:'push',selection,value:value.distance};
	}
	function update(value:DragValue){
		const command=commandFor(value);if(!command)return;
		measure={text:gesture?.tool==='revolve'||gesture?.tool==='rotate'?`${value.angle.toFixed(1)}°`:gesture?.tool.includes('pattern')?`${value.count} × ${value.distance.toFixed(3)} in`:`${value.distance.toFixed(3)} in`,x:value.point.x,y:value.point.y};
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
		if(!gesture){const selection=selections[0];if(!selection)return;const body=model.bodies.find(b=>b.id===selection.bodyId),face=body?.faces.find(f=>f.id===selection.id),sketch=model.sketches.find(s=>s.id===selection.id);await begin({selection,tool,start:face?.center??sketch?.plane.origin??[0,0,0],axis:face?.normal??sketch?.plane.normal??[0,0,1]});}
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
	function keydown(e:KeyboardEvent){
		if(settingsOpen)return;
		const typing=(e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]');if(typing)return;
		if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();void undo(e.shiftKey);}
		else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();void apply({type:'delete',selections},'Delete selection');}
	}
	async function openSettings(){if(!advisoryTransport)return;try{rules=await advisoryTransport.read();settingsOpen=true;}catch(err){error=err instanceof Error?err.message:String(err);}}
	onMount(()=>{
		const readRules=()=>{if(advisoryTransport)void advisoryTransport.read().then(value=>rules=value).catch(err=>error=err.message);};readRules();
		window.addEventListener('focus',readRules);const ruleTimer=setInterval(readRules,60000);
		client=new SolidClient();viewport=new SolidViewport(canvas,{getTool:()=>tool,getPlane:()=>PLANES[planeName],getSelections:()=>selections,canWrite:()=>opened.canWrite,select,begin,update,end:()=>void end(),cancel:()=>void cancel(),sketch:s=>void createSketch(s),numeric:(key,point)=>{numeric={value:key,...point};requestAnimationFrame(()=>numericInput?.focus());},error:message=>error=message});
		client.request<ModelProjection>('load',opened.snapshot).then(result=>{show(result);viewport.fit();loading=false;saveState.markSaved();}).catch(err=>{error=err.message;loading=false;});
		const unbind=saveState.attach();
		if(dev)(window as unknown as {ideaCadSolid:unknown}).ideaCadSolid={get model(){return model;},get snapshot(){return currentSnapshot;},get busy(){return busy||loading||!!pumping;},get selections(){return selections;},apply,select,setTool,project:(p:[number,number,number])=>viewport.projectPoint(p),painted:()=>viewport.painted(),fit:()=>viewport.fit(),view:(v:'iso'|'top'|'front'|'right')=>viewport.view(v),save:()=>saveState.saveNow(),undo,frameCosts:viewport.frameCosts};
		return()=>{clearInterval(ruleTimer);window.removeEventListener('focus',readRules);unbind();viewport.destroy();client.destroy();};
	});
	onDestroy(()=>saveState.destroy());
</script>

<svelte:window onkeydown={keydown}/>
<section class="ic-root solid-workspace" class:save-failed={saveState.failed} aria-label="IdeaCAD modeler">
	<header>
		<button class="documents" onclick={()=>void back()} aria-label="Documents">‹ <span>Documents</span></button>
		<input class="document-title" aria-label="Document name" bind:value={title} readonly={!opened.canWrite||loading||busy} maxlength="120" onchange={()=>void apply({type:'title',title},'Rename document')}/>
		<div class="document-save"><SaveIndicator state={saveState} hideClean={false}/></div>
		<button aria-label="Undo" onclick={()=>void undo()} disabled={!historyState.undoTarget||!opened.canWrite||busy}>↶</button>
		<button aria-label="Redo" onclick={()=>void undo(true)} disabled={!historyState.redoTarget||!opened.canWrite||busy}>↷</button>
		<button class:active={exportOpen} onclick={()=>exportOpen=!exportOpen}>Export ↗</button>
	</header>
	<div class="workarea">
		<canvas bind:this={canvas} tabindex="0" aria-label="3D model: select and drag geometry"></canvas>
		<nav class="tools" class:expanded={more} aria-label="Modeling tools">
			{#each shownTools as item}<ToolButton name={item.name} description={item.description} icon={item.icon} active={tool===item.id} onclick={()=>setTool(item.id)}/>{/each}
			<button class="more" aria-label={more?'Fewer tools':'More tools'} aria-expanded={more} onclick={()=>more=!more}>{more?'−':'⋯'}</button>
		</nav>
		<div class="view-tools">
			<select aria-label="Sketch plane" bind:value={planeName}><option>XY</option><option>XZ</option><option>YZ</option></select>
			<button aria-label="Fit model" title="Fit model (F)" onclick={()=>viewport.fit()}>⊡</button>
			<button aria-label="Top view" onclick={()=>viewport.view('top')}>Top</button>
			<button aria-label="Isometric view" onclick={()=>viewport.view('iso')}>3D</button>
		</div>
		<div class="right-tools"><button class:active={objectsOpen} onclick={()=>objectsOpen=!objectsOpen}>Objects <span>{model.bodies.length+model.sketches.length}</span></button><button class:active={addonOpen} onclick={()=>addonOpen=!addonOpen}>Add-ons</button></div>
		{#if loading}<div class="loading" role="status">Loading geometry…</div>{/if}
		{#if !opened.canWrite}<div class="read-only">{opened.archivedAt?'Archived':'View only'}</div>{/if}
		{#if saveState.failed}<aside class="recovery panel" aria-label="Save recovery"><h2>Changes not saved</h2><p>{saveState.message}</p><button onclick={()=>void exportFile('ideacad')}>Save backup</button>{#if reopenConfirm}<p>Discard unsaved changes and open the saved model?</p><button disabled={busy} onclick={()=>void reopenSaved()}>Discard and reopen</button><button onclick={()=>reopenConfirm=false}>Cancel</button>{:else}<button disabled={busy} onclick={()=>reopenConfirm=true}>Reopen saved model</button>{/if}</aside>{/if}
		{#if objectsOpen}
			<aside class="objects panel" aria-label="Objects"><h2>Objects</h2>
				{#each model.sketches as sketch}<button class:selected={selections.some(s=>s.id===sketch.id)} onclick={()=>{select({bodyId:'',kind:'sketch',id:sketch.id});setTool('extrude');}}>◇ {sketch.name}</button>{/each}
				{#each model.bodies as body}<button class:selected={selections.some(s=>s.bodyId===body.id)} onclick={(e)=>select({bodyId:body.id,kind:'body',id:body.id},e.shiftKey)}>▱ {body.name}</button>{/each}
				{#if selectedBody}<BodyProperties body={selectedBody} canWrite={opened.canWrite&&!loading&&!busy} change={(command,label)=>void apply(command,label)}/><div class="body-actions"><button onclick={()=>void apply({type:'mirror',bodyIds:[selectedBody.id],origin:PLANES[planeName].origin,normal:PLANES[planeName].normal},'Mirror body')}>Mirror {planeName}</button><button onclick={()=>void apply({type:'delete',selections:[{bodyId:selectedBody.id,kind:'body',id:selectedBody.id}]},'Delete body')}>Delete body</button></div>{/if}
				{#if new Set(selections.map(s=>s.bodyId).filter(Boolean)).size>1}<div class="body-actions">{#each ['union','subtract','intersect'] as operation}<button onclick={()=>void apply({type:'boolean',operation:operation as 'union'|'subtract'|'intersect',bodyIds:[...new Set(selections.map(s=>s.bodyId))]},operation)}>{operation}</button>{/each}</div>{/if}
			</aside>
		{/if}
		{#if addonOpen}<aside class="addons panel" aria-label="Add-ons"><h2>Add-ons</h2><button class:selected={model.addons.ideaBlade} aria-pressed={model.addons.ideaBlade} disabled={!opened.canWrite||loading||busy} onclick={()=>void apply({type:'addon',enabled:!model.addons.ideaBlade},'Toggle IdeaBlade')}>IdeaBlade <span>{model.addons.ideaBlade?'On':'Off'}</span></button>{#if model.addons.ideaBlade}<AdvisoryPanel {model} {rules} onsettings={()=>void openSettings()}/>{:else if rules?.canEdit}<button onclick={()=>void openSettings()}>Edit advisory limits</button>{/if}</aside>{/if}
		{#if exportOpen}<div class="export-menu panel" role="group" aria-label="Export format"><button onclick={()=>exportFile('3mf')}>3MF <span>Recommended</span></button><button onclick={()=>exportFile('stl')}>STL</button><button onclick={()=>exportFile('dxf')}>DXF profile</button><button onclick={()=>exportFile('ideacad')}>IdeaCAD backup</button>{#if opened.canWrite}<button onclick={()=>importInput.click()}>Import IdeaCAD backup</button>{/if}</div>{/if}
		<input type="file" accept=".ideacad" bind:this={importInput} hidden onchange={e=>void importBackup(e.currentTarget.files?.[0])}/>
		{#if measure&&!numeric}<output class="measure" style:left={`${Math.min(measure.x+16,(canvas?.clientWidth??1000)-140)}px`} style:top={`${measure.y+16}px`}>{measure.text}</output>{/if}
		{#if numeric}<form class="number-entry" style:left={`${Math.min(numeric.x+16,(canvas?.clientWidth??1000)-170)}px`} style:top={`${Math.min(numeric.y+16,(canvas?.clientHeight??800)-64)}px`} onsubmit={(e)=>{e.preventDefault();void enterNumeric();}}><input bind:this={numericInput} bind:value={numeric.value} aria-label="Exact value" inputmode="decimal"/><button type="submit" aria-label="Use exact value">↵</button></form>{/if}
		{#if error}<div class="error" role="alert"><span>{error}</span><button aria-label="Dismiss message" onclick={()=>error=''}>×</button></div>{/if}
	</div>
	{#if settingsOpen&&rules&&advisoryTransport}<div class="settings-overlay"><AdvisorySettings {rules} transport={advisoryTransport} onchange={value=>rules=value} onclose={()=>settingsOpen=false}/></div>{/if}
	<footer><span>{model.bodies.length} {model.bodies.length===1?'body':'bodies'}</span><span>inches</span><span>{selections.length?`${selections.length} selected`:''}</span><span class="tool-name">{TOOLS.find(t=>t.id===tool)?.name}</span></footer>
</section>

<style>
	@media(max-width:700px){:global(body:has(.solid-workspace) .sfb-shell){bottom:96px;right:8px}:global(body:has(.solid-workspace) .sfb-word){display:none}}
	.settings-overlay{position:absolute;inset:0;z-index:40;background:#0008;display:grid;place-items:center}.solid-workspace{position:relative}
	.recovery{z-index:22}.recovery p{font-size:16px;color:var(--text-2)}
	.document-save{min-width:0;display:flex;justify-content:flex-end}.document-save :global(.save-ind){max-width:100%;flex-wrap:nowrap}.document-save :global(.save-ind-text){min-width:0;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
	.solid-workspace{grid-template-columns:minmax(0,1fr)}
	@media(max-width:700px){.solid-workspace.save-failed{grid-template-rows:52px minmax(0,1fr) 48px}}
	.solid-workspace{height:100%;min-height:0;display:grid;grid-template-rows:56px minmax(0,1fr) 28px;overflow:hidden;background:var(--surface-0);color:var(--text-1);font-family:Rajdhani,sans-serif}header{display:flex;gap:4px;align-items:center;padding:0 12px;background:var(--surface-1);border-bottom:1px solid var(--boundary);z-index:10}button,input,select{font:600 16px Rajdhani,sans-serif;color:var(--text-1);min-height:44px;min-width:44px;border:1px solid transparent;border-radius:5px;background:transparent}button{cursor:pointer;padding:0 12px}button:hover{background:var(--surface-2)}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}button.active,button.selected{background:color-mix(in srgb,var(--green) 12%,var(--surface-1));border-color:var(--green);color:var(--green)}button:disabled{opacity:.4;cursor:default}.documents{display:flex;gap:8px;align-items:center}.document-title{max-width:300px;width:25vw;min-width:80px;font-size:21px;padding:0 12px;border-left:1px solid var(--boundary);border-radius:0}.document-save{flex:1;text-align:right;padding-right:12px}.workarea{position:relative;min-height:0;overflow:hidden}canvas{display:block;width:100%;height:100%;touch-action:none;outline:none}.tools{position:absolute;left:12px;top:12px;display:flex;flex-direction:column;padding:5px;background:var(--surface-1);border:1px solid var(--boundary);border-radius:8px;z-index:5;max-height:calc(100% - 24px);flex-wrap:wrap;align-content:flex-start}.tools.expanded{width:110px}.more{height:44px;padding:0;font-size:24px}.view-tools{position:absolute;left:50%;transform:translateX(-50%);top:12px;display:flex;padding:2px;background:var(--surface-1);border:1px solid var(--boundary);border-radius:7px}.view-tools select{padding:0 8px;background:var(--surface-1)}.right-tools{position:absolute;right:12px;top:12px;display:flex;gap:4px;background:var(--surface-1);border:1px solid var(--boundary);border-radius:7px}.right-tools span{margin-left:6px;color:var(--text-2)}.panel{position:absolute;right:12px;top:68px;width:245px;max-height:calc(100% - 88px);overflow:auto;padding:10px;background:var(--surface-1);border:1px solid var(--boundary);border-radius:7px;z-index:7}.panel h2{margin:0 0 8px;font-size:20px;padding:5px 10px;border-bottom:1px solid var(--boundary)}.panel>button{width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left}.panel button span{font-size:13px;color:var(--text-2)}.body-actions{display:flex;flex-wrap:wrap;border-top:1px solid var(--boundary);margin-top:10px;padding-top:8px}.addons{top:68px;right:12px}.objects:has(+.addons){right:268px}.export-menu{top:8px;right:12px;z-index:15}.measure,.number-entry{position:absolute;z-index:8;background:var(--surface-2);color:var(--text-1);border:1px solid var(--green);border-radius:5px;font:14px 'Share Tech Mono',monospace}.measure{padding:9px 12px;pointer-events:none}.number-entry{display:flex;width:170px}.number-entry input{width:120px;min-width:0;padding:0 8px;font-family:'Share Tech Mono',monospace}.error{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);max-width:min(600px,calc(100% - 30px));padding:8px 10px 8px 16px;display:flex;gap:10px;align-items:center;z-index:20;border:1px solid var(--warning);border-radius:7px;background:var(--surface-1);font-size:17px}.error button{flex-shrink:0}.loading{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:21px}.read-only{position:absolute;bottom:12px;left:12px;padding:8px 12px;background:var(--surface-1);border:1px solid var(--boundary)}footer{display:flex;align-items:center;gap:20px;border-top:1px solid var(--boundary);padding:0 15px;font:11px 'Share Tech Mono',monospace;color:var(--text-2)}.tool-name{margin-left:auto}
	@media(max-width:700px){.solid-workspace{grid-template-rows:52px minmax(0,1fr) 26px}header{padding:0 4px;gap:0}.documents span{display:none}.document-save{position:absolute;bottom:4px;right:8px;width:55vw;max-width:calc(100% - 16px);z-index:12;padding:0;font-size:10px}.tool-name{display:none}.document-title{flex:1;width:80px;font-size:18px;padding:0 6px}header button{font-size:14px;padding:0 8px}.tools{left:8px;right:8px;bottom:8px;top:auto;flex-direction:row;flex-wrap:nowrap!important;width:auto!important;overflow-x:auto;overflow-y:hidden;max-height:66px}.view-tools{left:8px;transform:none;top:8px}.view-tools button{font-size:13px;padding:0 8px}.right-tools{right:8px;top:8px}.right-tools button{font-size:13px;padding:0 8px}.right-tools span{display:none}.panel{right:8px;left:8px;top:64px;width:auto;max-height:calc(100% - 140px)}.objects:has(+.addons){display:none}.error{bottom:80px;font-size:16px}.read-only{bottom:74px}footer{gap:10px;font-size:10px}}
</style>
