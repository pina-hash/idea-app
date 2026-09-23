<script lang="ts">
	import {onMount} from 'svelte';
	import SolidWorkspace from '$lib/ideacad/solid/SolidWorkspace.svelte';
	import { emptyManifest, type SolidDocument, type SolidTransport } from '$lib/ideacad/solid/types';
	import { DEFAULT_LIMITS,type AdvisoryRules,type AdvisoryTransport } from '$lib/ideacad/solid/advisory';
	import { LocalPreferenceStore, PREFERENCE_GROUPS } from '$lib/ideacad/solid/preferences';
	/* The harness keeps its preferences in this browser, per viewer, the way the real route keeps them in the profile row. `?fresh=1` starts from the defaults. */
	const preferences=new LocalPreferenceStore('dev');
	onMount(()=>{if(new URLSearchParams(location.search).get('fresh')==='1')for(const g of PREFERENCE_GROUPS)preferences.reset(g);});
	let rules:AdvisoryRules={revision:1,schemaVersion:1,limits:{...DEFAULT_LIMITS},canEdit:true,changedAt:new Date().toISOString()};
	const advisoryTransport:AdvisoryTransport={read:async()=>structuredClone(rules),save:async(expected,limits)=>{if(expected!==rules.revision)throw Error('Rules changed. Reopen settings.');rules={...rules,revision:rules.revision+1,limits};return structuredClone(rules);}};
	const seed:SolidDocument={id:'dev-document',title:'Untitled document',conceptId:'dev-concept',revision:1,canWrite:true,owner:'dev',archivedAt:null,snapshot:{manifest:emptyManifest(),artifacts:[]},history:[{seq:0,kind:'origin',path:'',after:emptyManifest()}]};
	let document:SolidDocument=$state.raw(seed);let chosen=$state(false),ready=$state(false);
	onMount(()=>ready=true);
	const transport:SolidTransport={create:async()=>structuredClone(seed),open:async()=>structuredClone(document),save:async(input)=>{let history=[...document.history!],revision=document.revision;for(const action of input.actions){if(history.some(h=>h.operationId===action.id))continue;revision++;const start=history.length;history.push(...action.changes!.map((a,i)=>({...a,seq:start+i,operationId:action.id,operationStart:i===0,operationLabel:i===0?action.label:null,resultRevision:i===0?revision:null})));}document={...document,title:input.title,snapshot:structuredClone(input.snapshot),history,revision};return{revision};}};
</script>
<svelte:head><title>IdeaCAD direct modeler · Development</title></svelte:head>
<main>{#if chosen}<SolidWorkspace {document} {transport} {advisoryTransport} {preferences} dev onback={()=>chosen=false}/>{:else}<section class="chooser"><h1>IdeaCAD</h1><button disabled={!ready} onclick={()=>chosen=true}>+ New document</button>{#if document.revision}<button onclick={()=>chosen=true}>{document.title}</button>{/if}</section>{/if}</main>
<style>:global(html),:global(body){width:100%;height:100%;overflow:hidden}main{position:fixed;inset:0;width:100vw;height:100vh;max-width:none;margin:0;padding:0;background:#15191d;z-index:50}.chooser{padding:60px;color:#e6e9ec;font-family:Rajdhani,sans-serif}.chooser h1{font-size:36px}.chooser button{min-width:180px;min-height:56px;border:1px solid #70818d;border-radius:6px;background:#22272c;color:#e6e9ec;font:600 20px Rajdhani,sans-serif;cursor:pointer;margin-right:16px}</style>
