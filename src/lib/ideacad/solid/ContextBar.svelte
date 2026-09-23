<script lang="ts">
	/**
	 * SELECTION IMPLIES THE TOOL. The moment a click picks something, the few
	 * commands a student most often runs on that kind of thing appear just
	 * above the pointer (`CONTEXT_BAR` in the registry), with the selection's
	 * BREADCRUMB beside them: the face, then the feature that made it, then that
	 * feature's sketch, then the body, each a button that selects it, and
	 * hovering one lights it in the model. It is SolidWorks' context toolbar
	 * and breadcrumb, from the one registry.
	 *
	 * IT GETS OUT OF THE WAY. It opens above the pointer so the pointer is never
	 * on it; it fades as the pointer moves away and closes once the pointer is
	 * far off; it closes on Escape, on a click on empty space, and the moment a
	 * drag, a drawing or a box starts, so it never covers the drag readout.
	 *
	 * THE ICONS HAVE THEIR WORDS. Each icon names itself on hover and on focus
	 * (the palette's own delay), and every one of them is also a row, with its
	 * name, in the right-click menu. The breadcrumb is words.
	 *
	 * KEYBOARD: it sits right after the model in the tab order, so Tab from the
	 * model reaches it; the arrows move along it, Escape closes it.
	 */
	import { onMount } from 'svelte';
	import { anchorPosition } from '$lib/shell/anchored';
	import type { MenuItem } from './context-menu';
	import type { Crumb } from './context-menu';
	let { at, touch = false, commands, crumbs, onrun, oncrumb, onpreview, onclose }: {
		/** The pointer, in client pixels, where the selection was made. */
		at: { x: number; y: number };
		/** The selection was made with a finger or a pen: there is no hover to wait for, so the bar takes a tap at once. */
		touch?: boolean;
		commands: MenuItem[];
		crumbs: Crumb[];
		onrun: (item: MenuItem) => void;
		oncrumb: (crumb: Crumb) => void;
		onpreview: (crumb: Crumb | null) => void;
		onclose: () => void;
	} = $props();
	let bar: HTMLDivElement | undefined = $state();
	let place = $state<{ left: number; top: number; side: 'above' | 'below' } | null>(null);
	let faded = $state(false);
	/* A PRESS PASSES THROUGH UNTIL THE POINTER HAS RESTED ON THE BAR. A student who presses the model just above what they clicked (to push the face they just picked) reaches the model, not a command; one who moves onto the bar to use it waits a moment no one notices. */
	let resting = $state(false), restTimer: ReturnType<typeof setTimeout> | undefined;
	const REST_MS = 120;
	/* Far enough away to fade, and far enough to close: the student has moved on. */
	const FADE_PX = 180, CLOSE_PX = 360;
	function position() {
		if (!bar) return;
		const r = bar.getBoundingClientRect();
		/* A box around the pointer, so the bar clears it by a finger's width either way. */
		const p = anchorPosition({ left: at.x - 8, right: at.x + 8, top: at.y - 22, bottom: at.y + 22, width: 16, height: 44 }, { width: r.width, height: r.height }, { width: window.innerWidth, height: window.innerHeight }, { prefer: 'above', align: 'start', gap: 6, margin: 8 });
		place = { left: p.left, top: p.top, side: p.side };
	}
	function distance(e: PointerEvent) {
		if (!bar) return 0;
		const r = bar.getBoundingClientRect();
		const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right), dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
		return Math.hypot(dx, dy);
	}
	function moved(e: PointerEvent) {
		const d = distance(e); faded = d > FADE_PX; if (d > CLOSE_PX) { onclose(); return; }
		if (d > 0) { clearTimeout(restTimer); restTimer = undefined; resting = false; }
		else if (!resting && !restTimer) restTimer = setTimeout(() => { restTimer = undefined; resting = true; }, REST_MS);
	}
	/* Whether a crumb is lit in the model right now, so closing clears only a preview that exists. */
	let previewing = false;
	function preview(crumb: Crumb | null) { previewing = !!crumb; onpreview(crumb); }
	function buttons() { return [...(bar?.querySelectorAll<HTMLButtonElement>('button') ?? [])]; }
	function key(e: KeyboardEvent) {
		const list = buttons(), i = list.indexOf(document.activeElement as HTMLButtonElement);
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
		else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus(); }
		else if (e.key === 'End') { e.preventDefault(); list[list.length - 1]?.focus(); }
		else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onclose(); }
	}
	onMount(() => {
		position();
		window.addEventListener('pointermove', moved);
		const close = () => onclose();
		window.addEventListener('resize', close);
		return () => { clearTimeout(restTimer); if (previewing) onpreview(null); window.removeEventListener('pointermove', moved); window.removeEventListener('resize', close); };
	});
	/* A new click moves it to the new pointer; new crumbs or commands can change its size. */
	$effect(() => { void at.x; void at.y; void commands.length; void crumbs.length; faded = false; queueMicrotask(position); });
</script>

<div class="context-bar" class:faded class:live={resting || touch} role="toolbar" aria-label="Selection" data-testid="ideacad-context-bar" data-side={place?.side} tabindex="-1" bind:this={bar} onkeydown={key} style:left={place ? `${place.left}px` : undefined} style:top={place ? `${place.top}px` : undefined} style:visibility={place ? 'visible' : 'hidden'}>
	{#if commands.length}
		<div class="icons">
			{#each commands as item (item.id)}
				<button type="button" class="icon" aria-label={item.reason ? `${item.label}: ${item.reason}` : item.label} aria-disabled={item.reason ? 'true' : undefined} data-command={item.id} onclick={() => onrun(item)}>
					<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={item.icon} /></svg>
					<span class="tip" aria-hidden="true">{item.label}{#if item.keys}<kbd>{item.keys}</kbd>{/if}{#if item.reason}<small>{item.reason}</small>{/if}</span>
				</button>
			{/each}
		</div>
	{/if}
	{#if crumbs.length}
		<div class="crumbs" role="group" aria-label="Breadcrumb">
			{#each crumbs as crumb, i (crumb.id)}
				{#if i}<span class="sep" aria-hidden="true">›</span>{/if}
				<button type="button" class="crumb" class:first={i === 0} data-crumb={crumb.id} onclick={() => oncrumb(crumb)} onpointerenter={() => preview(crumb)} onpointerleave={() => preview(null)} onfocus={() => preview(crumb)} onblur={() => preview(null)}>{crumb.label}</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.context-bar { position: fixed; z-index: 30; display: flex; flex-direction: column; gap: 2px; max-width: min(460px, calc(100vw - 16px)); padding: 3px; background: var(--surface-1); border: 1px solid var(--boundary); border-radius: 8px; font-family: Rajdhani, sans-serif; color: var(--text-1); user-select: none; -webkit-user-select: none; transition: opacity 0.15s linear; }
	@media (prefers-reduced-motion: reduce) { .context-bar { transition: none; } }
	.context-bar.faded { opacity: 0.35; }
	/* Presses pass through to the model until the pointer rests on the bar; a keyboard in it, or a finger, uses it at once. */
	.context-bar:not(.live):not(:focus-within) { pointer-events: none; }
	.context-bar.faded:focus-within, .context-bar.faded:hover { opacity: 1; }
	.icons { display: flex; gap: 2px; }
	.icon { position: relative; width: 44px; height: 44px; display: grid; place-items: center; padding: 0; color: var(--text-1); background: transparent; border: 1px solid transparent; border-radius: 5px; cursor: pointer; }
	.icon[aria-disabled='true'] { color: var(--text-2); }
	.icon:hover, .crumb:hover { background: var(--surface-2); }
	button:focus-visible { outline: 2px solid var(--cyan); outline-offset: -2px; }
	.tip { pointer-events: none; position: absolute; left: 0; bottom: calc(100% + 6px); display: flex; align-items: center; gap: 8px; white-space: nowrap; padding: 4px 10px; min-height: 30px; background: var(--surface-2); border: 1px solid var(--boundary); border-radius: 6px; font: 600 16px Rajdhani, sans-serif; color: var(--text-1); visibility: hidden; }
	[data-side='below'] .tip { bottom: auto; top: calc(100% + 6px); }
	.icon:hover .tip, .icon:focus-visible .tip { visibility: visible; transition: visibility 0s linear var(--ic-tip-delay, 400ms); }
	.tip kbd { font: 12px 'Share Tech Mono', monospace; padding: 1px 5px; border: 1px solid var(--boundary); border-radius: 4px; }
	.tip small { font-weight: 500; font-size: 13px; color: var(--text-2); }
	.crumbs { display: flex; flex-wrap: wrap; align-items: center; column-gap: 0; border-top: 1px solid var(--hairline); padding-top: 2px; }
	.icons:empty + .crumbs, .crumbs:first-child { border-top: 0; padding-top: 0; }
	.crumb { min-height: 44px; min-width: 44px; padding: 0 10px; font: 600 15px Rajdhani, sans-serif; color: var(--text-2); background: transparent; border: 1px solid transparent; border-radius: 5px; cursor: pointer; white-space: nowrap; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
	.crumb.first { color: var(--text-1); }
	.sep { color: var(--text-2); font-size: 16px; padding: 0 1px; }
</style>
