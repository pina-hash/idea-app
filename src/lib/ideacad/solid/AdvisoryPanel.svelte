<script lang="ts">
	import {advisory,type AdvisoryRules} from './advisory';
	import type {ModelProjection} from './types';
	let {model,rules,onsettings}:{model:ModelProjection;rules:AdvisoryRules|null;onsettings:()=>void}=$props();
	const report=$derived(rules?advisory(model,rules.limits):null);
</script>
{#if report}
	<div class="revision">IdeaBlade · Rules revision {rules?.revision}</div>
	{#if report.estimated}<p class="estimate">Mass includes estimates.</p>{/if}
	{#each report.checks as check}<div class="check" title={check.note}><div><strong>{check.label}</strong><span class={check.status}>{check.status==='pass'?'Within limits':check.status==='fail'?'Outside limits':'Unknown'}</span></div><output>{check.value===null?'—':`${check.value.toFixed(check.unit==='g'?1:3)} ${check.unit}`}</output><small>{check.min===null&&check.max===null?'No numeric limit':`${check.min??'—'} – ${check.max??'—'} ${check.unit}`}</small></div>{/each}
	<dl><dt>Center of mass</dt><dd>{report.center?report.center.map(v=>v.toFixed(3)).join(', ')+' in':'Distribution unknown'}</dd><dt>Z-axis inertia</dt><dd>{report.inertia===null?'Distribution unknown':report.inertia.toFixed(2)+' g·in²'}</dd><dt>Hardware</dt><dd>Inspect collar and bolt</dd></dl>
{:else}<p role="status">Advisory rules are unavailable.</p>{/if}
{#if rules?.canEdit}<button onclick={onsettings}>Edit advisory limits</button>{/if}
<style>
	.revision{font:12px 'Share Tech Mono',monospace;color:var(--text-2);padding:12px 0}.check{border-top:1px solid var(--boundary);padding:10px 0;display:grid;gap:4px}.check>div{display:flex;justify-content:space-between;gap:8px;align-items:center}strong{font-size:17px}.check span{font-size:12px}.pass{color:var(--green)}.fail{color:var(--ic-warn)}.unknown,small{color:var(--text-2)}output{font:17px 'Share Tech Mono',monospace}small{font-size:14px}dl{font-size:14px}dt{margin-top:8px;color:var(--text-2)}dd{margin:2px 0}button{min-height:44px;width:100%;border:1px solid var(--green);border-radius:5px;background:var(--surface-0);color:var(--green);font:600 17px Rajdhani,sans-serif;cursor:pointer}
</style>
