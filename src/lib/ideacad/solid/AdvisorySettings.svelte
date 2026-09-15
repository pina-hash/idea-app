<script lang="ts">
	import {untrack} from 'svelte';
	import type {AdvisoryRules,AdvisoryLimits,AdvisoryTransport} from './advisory';
	let {rules,transport,onchange,onclose}:{rules:AdvisoryRules;transport:AdvisoryTransport;onchange:(value:AdvisoryRules)=>void;onclose:()=>void}=$props();
	let limits:AdvisoryLimits=$state(untrack(()=>({...rules.limits}))),saving=$state(false),error=$state('');
	const draftRevision=untrack(()=>rules.revision);
	const dimensions=[{key:'DiameterIn',name:'Diameter',unit:'in'},{key:'HeightIn',name:'Body height',unit:'in'},{key:'MassG',name:'Assembly mass',unit:'g'},{key:'HexExtensionIn',name:'Hex extension',unit:'in'}];
	async function save(){saving=true;error='';try{const result=await transport.save(draftRevision,$state.snapshot(limits));onchange(result);onclose();}catch(err){error=err instanceof Error?err.message:String(err);}finally{saving=false;}}
</script>
<section class="settings" aria-label="IdeaBlade advisory settings">
	<header><div><h2>IdeaBlade limits</h2><span>Administrator · Revision {draftRevision}</span></div><button aria-label="Close advisory settings" onclick={onclose}>×</button></header>
	<form onsubmit={e=>{e.preventDefault();void save();}}>
		<div class="heads"><span>Check</span><span>Minimum</span><span>Maximum</span></div>
		{#each dimensions as dimension}<div class="limit-row"><strong>{dimension.name}<small>{dimension.unit}</small></strong>{#each ['min','max'] as bound}{@const key=(bound+dimension.key) as keyof AdvisoryLimits}<input type="number" step="any" aria-label={`${dimension.name} ${bound==='min'?'minimum':'maximum'} (${dimension.unit})`} value={limits[key]??''} placeholder="None" oninput={e=>limits[key]=e.currentTarget.value===''?null:Number(e.currentTarget.value)}/>{/each}</div>{/each}
		{#if error}<p role="alert">{error}</p>{/if}
		<footer><span>Advisory checks only</span><button type="submit" disabled={saving||!rules.canEdit}>{saving?'Saving…':'Save limits'}</button></footer>
	</form>
</section>
<style>
	.settings{background:var(--surface-1,#22272c);border:1px solid var(--boundary,#71808c);border-radius:8px;color:var(--text-1,#e6e9ec);font-family:Rajdhani,sans-serif;box-shadow:0 12px 50px #0009;width:min(560px,calc(100vw - 24px))}header{display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid var(--boundary,#71808c)}h2{font-size:24px;margin:0}header span,footer span{color:var(--text-2,#a4adb5);font-size:14px}form{padding:16px}.heads,.limit-row{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:12px;align-items:center}.heads{font-size:13px;color:var(--text-2,#a4adb5);padding-bottom:8px}.limit-row{padding:10px 0;border-top:1px solid var(--boundary,#71808c)}strong{font-size:17px}small{display:block;font:12px 'Share Tech Mono',monospace;color:var(--text-2,#a4adb5)}input,button{min-height:44px;min-width:44px;border-radius:5px;border:1px solid var(--boundary,#71808c);background:var(--surface-0,#15191d);color:var(--text-1,#e6e9ec);font:16px Rajdhani,sans-serif}input{width:100%;padding:0 8px;box-sizing:border-box}button{padding:0 16px;cursor:pointer}footer{display:flex;justify-content:space-between;align-items:center;margin-top:12px}footer button{background:var(--green,#83edac);color:#15191d;font-weight:700}p{color:#ffa69e;font-size:17px}@media(max-width:500px){form{padding:12px}.heads,.limit-row{gap:8px;grid-template-columns:1fr 1fr 1fr}strong{font-size:15px}}
</style>
