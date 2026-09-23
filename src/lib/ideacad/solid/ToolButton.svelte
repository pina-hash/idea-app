<script lang="ts">
	/**
	 * ONE PALETTE TOOL AND ITS CARD. The card waits for the student's own delay
	 * (`--ic-tip-delay`, which the workspace sets from the Hints preferences,
	 * default 400 ms) before it shows, on hover and on keyboard focus alike; it
	 * stays while the pointer moves into it and goes about 500 ms after the
	 * pointer leaves; Escape and a press on the tool put it away. It is the
	 * button's description (`aria-describedby`), so a screen reader hears the
	 * same line a pointer reads.
	 *
	 * IT NEVER COVERS THE TOOL IT DESCRIBES: `placeTip` puts it beside the tool
	 * and, where there is no room beside (a phone's strip), above or below it
	 * through `$lib/shell/anchored`, flipping at the viewport's edges.
	 *
	 * A drawing or feature tool's card carries a looping picture of the gesture
	 * (`learn/ToolDemo.svelte`), still under reduced motion. `hint` is the one
	 * line a tool shows while it is armed, until the student has used it once
	 * (the workspace decides which; `learn/hints.ts`).
	 */
	import ToolDemo from './learn/ToolDemo.svelte';
	import { cssTimeMs, placeTip, splitShortcut } from './learn/tip-place';
	import { COMMANDS } from './command-registry';
	let {name,description,icon,active=false,onclick,id,hint=null}:{name:string;description:string;icon:string;active?:boolean;onclick:()=>void;id?:string;hint?:string|null}=$props();
	const uid=$props.id();
	const tipId=`ic-tip-${uid}`,hintId=`ic-hint-${uid}`;
	const HIDE_MS=500;
	const parts=$derived(splitShortcut(name));
	const command=$derived(id??COMMANDS.find(c=>c.name===parts.name)?.id);
	let wrap=$state<HTMLSpanElement>(),button=$state<HTMLButtonElement>(),tip=$state<HTMLSpanElement>(),first=$state<HTMLSpanElement>();
	let open=$state(false),placed=$state(false),at=$state({left:0,top:0}),hintAt=$state({left:0,top:0}),pressed=false;
	let showTimer:ReturnType<typeof setTimeout>|null=null,hideTimer:ReturnType<typeof setTimeout>|null=null;
	const clear=()=>{if(showTimer)clearTimeout(showTimer);if(hideTimer)clearTimeout(hideTimer);showTimer=hideTimer=null;};
	function delay(){try{return cssTimeMs(wrap?getComputedStyle(wrap).getPropertyValue('--ic-tip-delay'):null,400);}catch{return 400;}}
	function show(){if(pressed)return;if(hideTimer){clearTimeout(hideTimer);hideTimer=null;}if(open||showTimer)return;showTimer=setTimeout(()=>{showTimer=null;placed=false;open=true;},delay());}
	function hideLater(){if(showTimer){clearTimeout(showTimer);showTimer=null;}if(!open||hideTimer)return;hideTimer=setTimeout(()=>{hideTimer=null;open=false;},HIDE_MS);}
	function hideNow(){clear();open=false;}
	function place(el:HTMLElement|undefined){if(!el||!button)return null;const a=button.getBoundingClientRect(),r=el.getBoundingClientRect();const p=placeTip(a,{width:r.width,height:r.height},{width:window.innerWidth,height:window.innerHeight});return {left:Math.round(p.left),top:Math.round(p.top)};}
	/* Measured after the card is drawn, then placed; it stays invisible for that one frame so it never flashes over the tool. */
	$effect(()=>{if(!open||!tip)return;const p=place(tip);if(p){at=p;placed=true;}});
	$effect(()=>{if(!open)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape')hideNow();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);});
	const showHint=$derived(!!hint&&active&&!open);
	$effect(()=>{if(!showHint||!first)return;const p=place(first);if(p)hintAt=p;});
	$effect(()=>()=>clear());
</script>
<span class="tool-wrap" bind:this={wrap} role="presentation" onpointerenter={show} onpointerleave={()=>{pressed=false;hideLater();}} onfocusin={(e)=>{if((e.target as HTMLElement).matches?.(':focus-visible'))show();}} onfocusout={hideNow}>
	<button bind:this={button} type="button" class:active aria-label={name} aria-pressed={active} aria-describedby={showHint?`${tipId} ${hintId}`:tipId} data-command={command} onpointerdown={()=>{pressed=true;hideNow();}} {onclick}>
		<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={icon}/></svg>
	</button>
	<span class="tip" class:placed role="tooltip" id={tipId} hidden={!open} style:left={`${at.left}px`} style:top={`${at.top}px`} bind:this={tip} data-testid="ideacad-tool-tip">
		<strong class="tip-head"><span>{parts.name}</span>{#if parts.shortcut}<kbd>{parts.shortcut}</kbd>{/if}</strong>
		<span class="tip-line">{description}</span>
		{#if command}<ToolDemo tool={command}/>{/if}
	</span>
	{#if hint}<span class="first-use" id={hintId} hidden={!showHint} bind:this={first} style:left={`${hintAt.left}px`} style:top={`${hintAt.top}px`} data-testid="ideacad-tool-hint">{hint}</span>{/if}
</span>
<style>
	.tool-wrap{position:relative;display:inline-flex;flex-shrink:0}button{width:44px;height:44px;display:grid;place-items:center;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--text-2)}button:hover,button:focus-visible{background:var(--surface-2);color:var(--text-1)}button.active{background:color-mix(in srgb,var(--green) 14%,var(--surface-1));color:var(--green);border-color:var(--green)}button:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}
	.tip{position:fixed;z-index:60;display:grid;gap:2px;width:max-content;min-width:180px;max-width:min(260px,calc(100vw - 16px));box-sizing:border-box;padding:10px 12px;background:var(--surface-2);border:1px solid var(--boundary);border-radius:6px;color:var(--text-1);font:16px/1.3 Rajdhani,sans-serif;text-align:left;visibility:hidden}.tip.placed{visibility:visible}.tip[hidden]{display:none}
	.tip-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font-weight:700;font-size:18px}.tip-head kbd{font:12px 'Share Tech Mono',monospace;color:var(--cyan);border:1px solid var(--boundary);border-radius:3px;padding:1px 6px}
	.tip-line{color:var(--text-2)}
	.first-use{position:fixed;z-index:55;width:max-content;max-width:min(340px,calc(100vw - 16px));box-sizing:border-box;padding:6px 10px;background:var(--surface-1);border:1px solid var(--green);border-radius:5px;color:var(--text-1);font:15px/1.25 Rajdhani,sans-serif;pointer-events:none}.first-use[hidden]{display:none}
</style>
