<script lang="ts">
	let {name,description,icon,active=false,onclick}:{name:string;description:string;icon:string;active?:boolean;onclick:()=>void}=$props();
</script>
<span class="tool-wrap">
	<button type="button" class:active aria-label={name} aria-pressed={active} {onclick}>
		<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={icon}/></svg>
	</button>
	<span class="tooltip" role="tooltip"><strong>{name}</strong><span>{description}</span></span>
</span>
<style>
	.tool-wrap{position:relative;display:inline-flex;flex-shrink:0}button{width:44px;height:44px;display:grid;place-items:center;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--text-2)}button:hover,button:focus-visible{background:var(--surface-2);color:var(--text-1)}button.active{background:color-mix(in srgb,var(--green) 14%,var(--surface-1));color:var(--green);border-color:var(--green)}button:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}.tooltip{pointer-events:none;position:absolute;left:52px;top:0;z-index:40;display:none;min-width:210px;max-width:260px;padding:12px;background:var(--surface-2);border:1px solid var(--boundary);border-radius:6px;box-shadow:0 6px 20px #0008;color:var(--text-1);font:16px Rajdhani,sans-serif}.tooltip strong{display:block;font-weight:700;font-size:18px}.tooltip span{display:block;color:var(--text-2)}.tool-wrap:hover .tooltip,.tool-wrap:focus-within .tooltip{display:block}
	@media(max-width:700px){.tooltip{position:fixed;left:12px;right:12px;bottom:100px;top:auto;max-width:none}}
</style>
