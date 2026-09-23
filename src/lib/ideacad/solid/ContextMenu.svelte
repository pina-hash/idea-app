<script lang="ts">
	/**
	 * THE ONE RIGHT-CLICK MENU. Every right-click in the viewport opens this,
	 * and so does a tree row (`api.contextMenu`), with rows the caller builds
	 * from the command registry (`context-menu.ts`). It opens at the pointer and
	 * flips at the window's edges (`anchorPosition`), its rows are 44px, the
	 * first row takes focus, the arrows move, Enter or Space runs, Escape
	 * closes, and a press outside closes it.
	 *
	 * A ROW WITH A LIST (Select Other's candidates, the views, the pick filter)
	 * OPENS IT IN PLACE, with a Back row first, rather than as a flyout that
	 * would run off a phone's screen. The right arrow opens it and the left
	 * arrow goes back.
	 *
	 * A ROW THAT CANNOT RUN STAYS, `aria-disabled` with its reason beside its
	 * name, and running it still tells the caller, which says why where every
	 * refusal is said.
	 */
	import { onMount, tick } from 'svelte';
	import { anchorPosition } from '$lib/shell/anchored';
	import type { MenuItem } from './context-menu';
	let { items, at, label = 'Menu', onclose }: { items: MenuItem[]; at: { x: number; y: number }; label?: string; onclose: () => void } = $props();
	/* The lists opened in place, deepest last; the menu shows the last one. */
	let stack = $state<{ label: string; items: MenuItem[] }[]>([]);
	let panel: HTMLDivElement | undefined = $state();
	let place = $state<{ left: number; top: number } | null>(null);
	const current = $derived(stack.length ? stack[stack.length - 1] : null);
	const rows = $derived(current ? current.items : items);
	/* A row being previewed, so it is always un-previewed: on leave, on another row, and on close. */
	let previewing: MenuItem | null = null;
	function preview(item: MenuItem | null) { if (previewing === item) return; previewing?.preview?.(false); previewing = item; item?.preview?.(true); }
	function rowsIn() { return [...(panel?.querySelectorAll<HTMLElement>('[data-menu-row]') ?? [])]; }
	function focusRow(i: number) { const list = rowsIn(); if (!list.length) return; list[((i % list.length) + list.length) % list.length]?.focus(); }
	async function position() {
		await tick(); if (!panel) return;
		const r = panel.getBoundingClientRect();
		const p = anchorPosition({ left: at.x, right: at.x, top: at.y, bottom: at.y, width: 0, height: 0 }, { width: r.width, height: r.height }, { width: window.innerWidth, height: window.innerHeight }, { prefer: 'below', align: 'start', gap: 2, margin: 8 });
		place = { left: p.left, top: p.top };
	}
	async function open(item: MenuItem) { preview(null); stack = [...stack, { label: item.label, items: item.items ?? [] }]; await position(); focusRow(1); }
	async function back() { if (!stack.length) return; preview(null); stack = stack.slice(0, -1); await position(); focusRow(stack.length ? 1 : 0); }
	/* A checkbox that stays open shows its new state at once; the caller's own rows are read again only when it reopens. */
	let toggled = $state<Record<string, boolean>>({});
	const isChecked = (item: MenuItem) => toggled[item.id] ?? item.checked;
	function activate(item: MenuItem) {
		if (item.items) { void open(item); return; }
		preview(null);
		if (item.checked !== undefined && !item.reason) toggled[item.id] = !isChecked(item);
		item.run?.();
		if (!item.keepOpen) onclose();
	}
	function key(e: KeyboardEvent) {
		const list = rowsIn(), i = list.indexOf(document.activeElement as HTMLElement);
		if (e.key === 'ArrowDown') { e.preventDefault(); focusRow(i + 1); }
		else if (e.key === 'ArrowUp') { e.preventDefault(); focusRow(i < 0 ? -1 : i - 1); }
		else if (e.key === 'Home') { e.preventDefault(); focusRow(0); }
		else if (e.key === 'End') { e.preventDefault(); focusRow(-1); }
		else if (e.key === 'ArrowLeft' || (e.key === 'Backspace' && stack.length)) { if (stack.length) { e.preventDefault(); void back(); } }
		else if (e.key === 'ArrowRight') { const item = rowItem(document.activeElement as HTMLElement); if (item?.items) { e.preventDefault(); void open(item); } }
		else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onclose(); }
		else if (e.key === 'Tab') { e.preventDefault(); focusRow(e.shiftKey ? i - 1 : i + 1); }
	}
	function rowItem(el: HTMLElement | null): MenuItem | null { const i = Number(el?.dataset.index ?? -1); return i >= 0 ? rows[i] ?? null : null; }
	function outside(e: PointerEvent) { const t = e.target as Node | null; if (t && t.isConnected && !panel?.contains(t)) onclose(); }
	onMount(() => {
		void position().then(() => focusRow(0));
		document.addEventListener('pointerdown', outside, true);
		const close = () => onclose();
		window.addEventListener('resize', close);
		window.addEventListener('blur', close);
		return () => { preview(null); document.removeEventListener('pointerdown', outside, true); window.removeEventListener('resize', close); window.removeEventListener('blur', close); };
	});
	/* A new right-click while open moves the menu to the new pointer, with the new rows. */
	$effect(() => { void at.x; void at.y; void items; stack = []; toggled = {}; void position(); });
</script>

<div class="context-menu" role="menu" tabindex="-1" aria-label={current ? current.label : label} data-testid="ideacad-context-menu" bind:this={panel} onkeydown={key} oncontextmenu={(e) => e.preventDefault()} style:left={place ? `${place.left}px` : undefined} style:top={place ? `${place.top}px` : undefined} style:visibility={place ? 'visible' : 'hidden'}>
	{#if current}
		<button type="button" role="menuitem" class="menu-back" data-menu-row data-index="-1" onclick={() => void back()} onpointerenter={() => preview(null)}>
			<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
			<span class="label">{current.label}</span>
		</button>
	{/if}
	{#each rows as item, i (item.id)}
		<button type="button" role={item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'} aria-checked={item.checked !== undefined ? isChecked(item) : undefined} aria-haspopup={item.items ? 'menu' : undefined} aria-disabled={item.reason ? 'true' : undefined} data-menu-row data-index={i} data-command={item.id} onclick={() => activate(item)} onpointerenter={() => preview(item)} onpointerleave={() => preview(null)} onfocus={() => preview(item)} onblur={() => preview(null)}>
			{#if item.checked !== undefined}
				<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v16H4z" />{#if isChecked(item)}<path d="M8 12l3 3 5-6" />{/if}</svg>
			{:else if item.icon}
				<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={item.icon} /></svg>
			{:else}<span class="blank" aria-hidden="true"></span>{/if}
			<span class="label">{item.label}{#if item.reason}<small>{item.reason}</small>{/if}</span>
			{#if item.items}<span class="more" aria-hidden="true">›</span>{:else if item.keys}<kbd>{item.keys}</kbd>{/if}
		</button>
	{/each}
</div>

<style>
	.context-menu { position: fixed; z-index: 60; min-width: 200px; max-width: min(320px, calc(100vw - 16px)); max-height: calc(100vh - 16px); overflow-y: auto; display: flex; flex-direction: column; padding: 4px; background: var(--surface-1); border: 1px solid var(--boundary); border-radius: 8px; font-family: Rajdhani, sans-serif; color: var(--text-1); user-select: none; -webkit-user-select: none; }
	button { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; align-items: center; gap: 10px; min-height: 44px; padding: 2px 12px; font: 600 16px Rajdhani, sans-serif; color: var(--text-1); text-align: left; background: transparent; border: 1px solid transparent; border-radius: 5px; cursor: pointer; }
	button:hover, button:focus-visible { background: color-mix(in srgb, var(--green) 12%, var(--surface-1)); outline: none; }
	button:focus-visible { box-shadow: inset 0 0 0 2px var(--cyan); }
	button[aria-disabled='true'] { color: var(--text-2); }
	button[aria-checked='true'] { color: var(--green); }
	.menu-back { border-bottom: 1px solid var(--hairline); border-radius: 5px 5px 0 0; margin-bottom: 2px; color: var(--text-2); }
	.label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.label small { margin-left: 8px; font-weight: 500; font-size: 13px; color: var(--text-2); }
	.blank { width: 20px; }
	.more { font-size: 20px; color: var(--text-2); }
	kbd { font: 12px 'Share Tech Mono', monospace; color: var(--text-1); padding: 2px 6px; border: 1px solid var(--boundary); border-radius: 4px; background: var(--surface-2); }
</style>
