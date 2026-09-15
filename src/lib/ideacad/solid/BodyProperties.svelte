<script lang="ts">
	import { STOCK_MATERIALS,bodyMass } from './advisory';
	import type {BodyProjection,BodyRole,SolidCommand} from './types';
	let {body,canWrite,change}:{body:BodyProjection;canWrite:boolean;change:(command:SolidCommand,label:string)=>void}=$props();
	const material=$derived(STOCK_MATERIALS.find(m=>m.id===body.materialId));
	const mass=$derived(bodyMass(body));
</script>
<section aria-label="Body properties">
	<label>Name<input value={body.name} disabled={!canWrite} onchange={e=>change({type:'metadata',bodyId:body.id,name:e.currentTarget.value},'Rename body')}/></label>
	<label>Material<select value={body.materialId??''} disabled={!canWrite} onchange={e=>change({type:'metadata',bodyId:body.id,materialId:e.currentTarget.value||null,massG:null,massSource:'measured'},'Set material')}><option value="">Unassigned</option>{#each STOCK_MATERIALS as material}<option value={material.id}>{material.name}</option>{/each}</select></label>
	<label>IdeaBlade role<select value={body.role} disabled={!canWrite} onchange={e=>change({type:'metadata',bodyId:body.id,role:e.currentTarget.value as BodyRole},'Set body role')}><option value="part">Part</option><option value="blade">Blade</option><option value="hex-core">Hex core</option><option value="collar">Collar</option><option value="spin-bolt">Spin bolt</option></select></label>
	<label>{material?.printed?'Printed part mass (g)':'Part mass override (g)'}<input type="number" min="0" step="any" value={body.massG??''} placeholder={material?.printed?'Enter finished part mass':'Optional measured mass'} disabled={!canWrite} title="Enter the cleaned part mass. For a Bambu Studio estimate, exclude supports, purge tower, brim and other removable material. Geometry changes clear this value so it can be updated." onchange={e=>change({type:'metadata',bodyId:body.id,massG:e.currentTarget.value===''?null:Number(e.currentTarget.value),massSource:body.massSource??'measured'},'Set part mass')}/></label>
	{#if material?.printed}<label>Mass source<select value={body.massSource??'measured'} disabled={!canWrite} onchange={e=>change({type:'metadata',bodyId:body.id,massSource:e.currentTarget.value as 'measured'|'bambu-studio'},'Set mass source')}><option value="measured">Scale measurement</option><option value="bambu-studio">Bambu Studio estimate</option></select></label>{/if}
	<output>Mass: {mass.grams===null?'Unknown':`${mass.grams.toFixed(2)} g${mass.estimated?' · Estimate':''}`}</output>
	{#if material?.printed}<small>Exclude supports, purge, brim and other removable material. Shape changes clear the entered mass.</small>{/if}
	{#if material?.source}<a href={material.source} target="_blank" rel="noreferrer" title={material.sourceNote}>Density reference · MatWeb ↗</a>{/if}
</section>
<style>
	section{border-top:1px solid var(--boundary);margin-top:10px;padding-top:10px;display:grid;gap:10px}label{display:grid;gap:4px;font:600 15px Rajdhani,sans-serif;color:var(--text-2)}input,select{min-height:44px;width:100%;box-sizing:border-box;background:var(--surface-0);color:var(--text-1);border:1px solid var(--boundary);border-radius:4px;padding:0 8px;font:16px Rajdhani,sans-serif}output,a{font:15px Rajdhani,sans-serif;color:var(--text-2)}a{min-height:44px;display:flex;align-items:center;color:var(--cyan)}
</style>
