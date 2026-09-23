<script lang="ts">
	/**
	 * A ROW'S MENU: the same entries from the "⋯" control and from a
	 * right-click, opened at the control or at the pointer. It is a real menu:
	 * `role="menu"`, the arrow keys, Home and End walk it, Enter and Space run an
	 * entry, Escape closes it and puts focus back where it came from, Tab closes
	 * it, and a press anywhere else closes it (on `pointerdown`, ignoring a
	 * target the press itself detached).
	 *
	 * A REFUSED ENTRY IS SHOWN AND SAYS WHY. It is `aria-disabled`, never
	 * `disabled`, so it can still be focused and pressed, and the reason is
	 * written under its word; a press on it hands the same sentence to the
	 * caller, which shows it where every refusal shows.
	 *
	 * IT ESCAPES THE TREE'S SCROLL BOX. The list scrolls, so a menu positioned
	 * inside it would be clipped; this one is `position: fixed` and placed by
	 * `anchorPosition`, the same arithmetic `$lib/shell/anchored` uses, against
	 * a zero-size box at the point it was opened.
	 */
	import { onMount, tick } from 'svelte';
	import { anchorPosition } from '$lib/shell/anchored';
	import type { TreeMenuRequest, TreeMenuItem } from './api';
	let { request, onclose, onrefused }: { request: TreeMenuRequest; onclose: (restoreFocus: boolean) => void; onrefused: (reason: string) => void } = $props();
	let menu = $state<HTMLElement>();
	let place = $state<{ left: number; top: number } | null>(null);
	const items = $derived(request.items);
	const buttons = () => [...(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
	function close(restore: boolean) { onclose(restore); }
	function press(item: TreeMenuItem) {
		if (item.refusal) { onrefused(item.refusal); return; }
		close(false); item.run();
	}
	function keydown(e: KeyboardEvent) {
		const list = buttons(), at = list.indexOf(document.activeElement as HTMLButtonElement);
		const go = (i: number) => list[(i + list.length) % list.length]?.focus();
		if (e.key === 'ArrowDown') go(at + 1);
		else if (e.key === 'ArrowUp') go(at < 0 ? list.length - 1 : at - 1);
		else if (e.key === 'Home') go(0);
		else if (e.key === 'End') go(list.length - 1);
		else if (e.key === 'Escape') close(true);
		else if (e.key === 'Tab') { close(false); return; }
		else return;
		e.preventDefault(); e.stopPropagation();
	}
	function position() {
		if (!menu) return;
		const r = menu.getBoundingClientRect();
		const at = anchorPosition({ left: request.x, top: request.y, right: request.x, bottom: request.y, width: 0, height: 0 }, { width: r.width, height: r.height }, { width: window.innerWidth, height: window.innerHeight }, { prefer: 'below', align: 'start', gap: 2 });
		place = { left: Math.round(at.left), top: Math.round(at.top) };
	}
	onMount(() => {
		position();
		void tick().then(() => buttons()[0]?.focus());
		/* Outside dismiss: pointerdown, not click, so the press that opened the menu never closes it; a target the press detached is ignored. */
		const outside = (e: PointerEvent) => { const t = e.target as Node | null; if (!t || !t.isConnected || menu?.contains(t)) return; close(false); };
		const resize = () => position();
		window.addEventListener('pointerdown', outside, true);
		window.addEventListener('resize', resize);
		return () => { window.removeEventListener('pointerdown', outside, true); window.removeEventListener('resize', resize); };
	});
</script>
<div class="row-menu" role="menu" tabindex="-1" aria-label={request.label} bind:this={menu} style:left={place ? `${place.left}px` : undefined} style:top={place ? `${place.top}px` : undefined} class:placed={!!place} onkeydown={keydown} oncontextmenu={(e) => e.preventDefault()}>
	{#each items as item (item.id)}
		<button type="button" role="menuitem" class="item" aria-disabled={item.refusal ? 'true' : undefined} data-item={item.id} onclick={() => press(item)}>
			<span class="word">{#if item.icon}<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={item.icon} /></svg>{/if}{item.label}</span>
			{#if item.refusal}<span class="reason" class:indented={!!item.icon}>{item.refusal}</span>{/if}
		</button>
	{/each}
</div>
<style>
	.row-menu{position:fixed;left:-9999px;top:-9999px;z-index:80;min-width:196px;max-width:min(300px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto;display:flex;flex-direction:column;padding:4px;box-sizing:border-box;background:var(--ic-head,var(--surface-2));border:1px solid var(--boundary);border-radius:4px;font-family:Rajdhani,sans-serif;color:var(--text-1)}.row-menu:focus{outline:none}
	.item{min-height:44px;width:100%;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:1px;padding:4px 10px;box-sizing:border-box;border:1px solid transparent;border-radius:3px;background:transparent;box-shadow:none;color:inherit;font:600 15px Rajdhani,sans-serif;text-align:left;cursor:pointer}.item:hover,.item:focus-visible{background:var(--surface-2);border-color:transparent}.item:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}
	.word{display:flex;align-items:center;gap:8px;line-height:1.2}.word svg{flex-shrink:0;color:var(--text-2)}
	.item[aria-disabled="true"]{color:var(--text-2);cursor:default}.reason{font:13px/1.35 Rajdhani,sans-serif;color:var(--text-2);white-space:normal}.reason.indented{padding-left:26px}
</style>
