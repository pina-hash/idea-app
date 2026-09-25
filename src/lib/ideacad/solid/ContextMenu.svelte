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
	 * OPENS IT ONE OF TWO WAYS, decided once per menu by `submenuLayout`:
	 *
	 * - BESIDE THE MENU on a fine pointer (a mouse) with room on one side, the
	 *   way desktop menus do and the way Mr. Pina asked for (report R04, ledger
	 *   0298). Resting on the row for `SUBMENU_OPEN_MS` opens a second panel
	 *   against the menu's edge, its first row level with the row, placed by
	 *   `submenuPlacement` (which is `anchorPosition` on its side) so it flips
	 *   to the left at the window's right edge. A move OFF the row waits
	 *   `SUBMENU_GRACE_MS` before closing or changing the list, so a diagonal
	 *   move toward it across the rows below does not lose it, and entering
	 *   the list keeps it; it closes once the pointer has left both panels. A
	 *   press opens it at once. The right arrow opens it and moves into it,
	 *   and the left arrow or Escape closes it and goes back to its row. ONE
	 *   TIMER PER PANEL (`timers[level]`), on `setTimeout` and never on
	 *   `requestAnimationFrame`, which a background window never ticks.
	 * - IN PLACE, with a Back row first, on a finger or in a window with no
	 *   room beside the menu (a phone), because a flyout there would run off
	 *   the screen. This was the only way until R04 and is unchanged: a press
	 *   or the right arrow opens it, the left arrow goes back, and hovering
	 *   opens nothing.
	 *
	 * Both ways keep the 44px rows, `aria-haspopup`, and preview: a row is lit
	 * while hovered or focused and un-lit on leave, on blur, when its list
	 * closes, and when the menu closes.
	 *
	 * A ROW THAT CANNOT RUN STAYS, `aria-disabled` with its reason beside its
	 * name, and running it still tells the caller, which says why where every
	 * refusal is said. A row whose list is EMPTY opens nothing beside the menu:
	 * its reason already says why.
	 */
	import { onMount, tick } from 'svelte';
	import { anchorPosition } from '$lib/shell/anchored';
	import { SUBMENU_GRACE_MS, SUBMENU_OPEN_MS, submenuLayout, submenuPlacement, type MenuItem } from './context-menu';
	let { items, at, label = 'Menu', onclose }: { items: MenuItem[]; at: { x: number; y: number }; label?: string; onclose: () => void } = $props();
	/* IN PLACE: the lists opened in place, deepest last; the menu shows the last one. */
	let stack = $state<{ label: string; items: MenuItem[] }[]>([]);
	/* BESIDE: the lists open beside the menu, one per level. `sides[k]` is panel k + 1, opened from row `from` of panel k; panel 0 is the menu. Raw, so the caller's rows are never proxied. */
	type Side = { label: string; items: MenuItem[]; from: number; place: { left: number; top: number; side: 'right' | 'left' } | null };
	let sides = $state.raw<Side[]>([]);
	let layout = $state<'side' | 'inline'>('inline');
	let panel: HTMLDivElement | undefined = $state();
	const sidePanels: (HTMLDivElement | null | undefined)[] = $state([]);
	let place = $state<{ left: number; top: number } | null>(null);
	const current = $derived(stack.length ? stack[stack.length - 1] : null);
	const rows = $derived(current ? current.items : items);
	/* A row being previewed, so it is always un-previewed: on leave, on another row, when its list closes, and on close. */
	let previewing: MenuItem | null = null;
	function preview(item: MenuItem | null) { if (previewing === item) return; previewing?.preview?.(false); previewing = item; item?.preview?.(true); }
	const panelAt = (level: number) => (level === 0 ? panel : sidePanels[level - 1]) ?? undefined;
	const listAt = (level: number) => (level === 0 ? rows : sides[level - 1]?.items ?? []);
	const inMenu = (t: Node) => !!panel?.contains(t) || sidePanels.some((el) => !!el?.contains(t));
	const hasList = (item: MenuItem) => !!item.items?.length;
	function rowsIn(level = 0) { return [...(panelAt(level)?.querySelectorAll<HTMLElement>('[data-menu-row]') ?? [])]; }
	function focusRow(i: number, level = 0) { const list = rowsIn(level); if (!list.length) return; list[((i % list.length) + list.length) % list.length]?.focus(); }
	const finePointer = () => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
	async function position() {
		await tick(); if (!panel) return;
		const r = panel.getBoundingClientRect();
		const p = anchorPosition({ left: at.x, right: at.x, top: at.y, bottom: at.y, width: 0, height: 0 }, { width: r.width, height: r.height }, { width: window.innerWidth, height: window.innerHeight }, { prefer: 'below', align: 'start', gap: 2, margin: 8 });
		place = { left: p.left, top: p.top };
		if (!stack.length) layout = submenuLayout(finePointer(), { left: p.left, right: p.left + r.width }, window.innerWidth);
	}
	async function open(item: MenuItem) { preview(null); stack = [...stack, { label: item.label, items: item.items ?? [] }]; await position(); focusRow(1); }
	async function back() { if (!stack.length) return; preview(null); stack = stack.slice(0, -1); await position(); focusRow(stack.length ? 1 : 0); }

	/* ONE TIMER PER PANEL: what the pointer resting in panel `level` asks for next (open a list, change it, or close it). */
	const timers: (ReturnType<typeof setTimeout> | undefined)[] = [];
	function cancel(level: number) { clearTimeout(timers[level]); timers[level] = undefined; }
	function cancelAll() { for (let k = 0; k < timers.length; k++) cancel(k); }
	function later(level: number, ms: number, run: () => void) { cancel(level); timers[level] = setTimeout(() => { timers[level] = undefined; run(); }, ms); }
	/** Close every list beside panel `level` and past it. Focus inside them goes back to a row of panel `level`; a row lit inside them is un-lit. */
	function closeSides(level: number, focusTo?: number) {
		if (sides.length <= level) return;
		for (let k = level + 1; k < timers.length; k++) cancel(k);
		const closing = sides.slice(level);
		if (previewing && closing.some((s) => s.items.includes(previewing as MenuItem))) preview(null);
		const held = sidePanels.slice(level).some((el) => !!el?.contains(document.activeElement));
		if (held) panelAt(level)?.querySelector<HTMLElement>(`[data-menu-row][data-index="${focusTo ?? sides[level].from}"]`)?.focus();
		sides = sides.slice(0, level);
	}
	/** Open row `from`'s list beside panel `level`, replacing whatever list was there; `focus` moves into it (a key, never a hover). */
	async function openSide(level: number, from: number, item: MenuItem, focus: boolean) {
		cancel(level);
		if (!hasList(item)) return;
		if (sides[level]?.from !== from) {
			closeSides(level, from);
			sides = [...sides, { label: item.label, items: item.items ?? [], from, place: null }];
			await tick();
			placeSide(level);
		}
		if (focus) { await tick(); focusRow(0, level + 1); }
	}
	function placeSide(level: number) {
		const el = sidePanels[level], parent = panelAt(level), side = sides[level];
		const row = parent?.querySelector<HTMLElement>(`[data-menu-row][data-index="${side?.from}"]`);
		if (!el || !parent || !side || !row) return;
		/* Named field by field: a DOMRect's sides are getters on its prototype, so spreading one copies nothing. */
		const r = row.getBoundingClientRect(), m = parent.getBoundingClientRect(), p = el.getBoundingClientRect();
		const first = el.querySelector<HTMLElement>('[data-menu-row]');
		const inset = first ? first.getBoundingClientRect().top - p.top : 0;
		const to = submenuPlacement({ top: r.top, bottom: r.bottom }, { left: m.left, right: m.right }, { width: p.width, height: p.height }, { width: window.innerWidth, height: window.innerHeight }, inset);
		sides = sides.map((s, k) => (k === level ? { ...s, place: { left: to.left, top: to.top, side: to.side } } : s));
	}
	/** The pointer rests on row `i` of panel `level`. In place it only lights the row; beside the menu it also asks for that row's list, or for the open one to close, after the wait. */
	function hover(level: number, i: number, item: MenuItem) {
		preview(item);
		if (layout !== 'side') return;
		const child = sides[level];
		if (child && child.from === i) cancel(level);
		else if (hasList(item)) later(level, child ? SUBMENU_GRACE_MS : SUBMENU_OPEN_MS, () => void openSide(level, i, item, false));
		else if (child) later(level, SUBMENU_GRACE_MS, () => closeSides(level));
		else cancel(level);
	}
	/* Entering a list keeps it: whatever the panels before it were about to do to it is called off. */
	function enter(level: number) { for (let k = 0; k < level; k++) cancel(k); }
	/* Leaving every panel closes the lists beside the menu, after the same wait, and calls off a list the pointer only crossed on its way out. */
	function leave(e: PointerEvent) { const to = e.relatedTarget as Node | null; if (to && inMenu(to)) return; if (layout !== 'side') return; cancelAll(); if (sides.length) later(0, SUBMENU_GRACE_MS, () => closeSides(0)); }

	/* A checkbox that stays open shows its new state at once; the caller's own rows are read again only when it reopens. */
	let toggled = $state<Record<string, boolean>>({});
	const isChecked = (item: MenuItem) => toggled[item.id] ?? item.checked;
	function activate(item: MenuItem, level: number, i: number, e: MouseEvent) {
		/* A press from a key (Enter or Space: `detail` 0) moves into the list; a press from a pointer leaves focus where the pointer is. */
		if (item.items) { if (layout === 'side') void openSide(level, i, item, e.detail === 0); else void open(item); return; }
		preview(null);
		if (item.checked !== undefined && !item.reason) toggled[item.id] = !isChecked(item);
		item.run?.();
		if (!item.keepOpen) onclose();
	}
	function key(e: KeyboardEvent, level: number) {
		const list = rowsIn(level), i = list.indexOf(document.activeElement as HTMLElement);
		if (e.key === 'ArrowDown') { e.preventDefault(); focusRow(i + 1, level); }
		else if (e.key === 'ArrowUp') { e.preventDefault(); focusRow(i < 0 ? -1 : i - 1, level); }
		else if (e.key === 'Home') { e.preventDefault(); focusRow(0, level); }
		else if (e.key === 'End') { e.preventDefault(); focusRow(-1, level); }
		else if (e.key === 'ArrowLeft' || (e.key === 'Backspace' && (stack.length || level > 0))) {
			if (level > 0) { e.preventDefault(); closeSides(level - 1); }
			else if (stack.length) { e.preventDefault(); void back(); }
		}
		else if (e.key === 'ArrowRight') {
			const index = Number((document.activeElement as HTMLElement | null)?.dataset.index ?? -1), item = index >= 0 ? listAt(level)[index] : undefined;
			if (item?.items) { e.preventDefault(); if (layout === 'side') void openSide(level, index, item, true); else void open(item); }
		}
		else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (level > 0) closeSides(level - 1); else onclose(); }
		else if (e.key === 'Tab') { e.preventDefault(); focusRow(e.shiftKey ? i - 1 : i + 1, level); }
	}
	function outside(e: PointerEvent) { const t = e.target as Node | null; if (t && t.isConnected && !inMenu(t)) onclose(); }
	onMount(() => {
		void position().then(() => focusRow(0));
		document.addEventListener('pointerdown', outside, true);
		const close = () => onclose();
		window.addEventListener('resize', close);
		window.addEventListener('blur', close);
		return () => { cancelAll(); preview(null); document.removeEventListener('pointerdown', outside, true); window.removeEventListener('resize', close); window.removeEventListener('blur', close); };
	});
	/* A new right-click while open moves the menu to the new pointer, with the new rows. */
	$effect(() => { void at.x; void at.y; void items; stack = []; sides = []; cancelAll(); toggled = {}; void position(); });
</script>

{#snippet row(item: MenuItem, i: number, level: number)}
	<button type="button" role={item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'} aria-checked={item.checked !== undefined ? isChecked(item) : undefined} aria-haspopup={item.items ? 'menu' : undefined} aria-expanded={item.items && layout === 'side' ? sides[level]?.from === i : undefined} aria-disabled={item.reason ? 'true' : undefined} data-menu-row data-index={i} data-command={item.id} onclick={(e) => activate(item, level, i, e)} onpointerenter={() => hover(level, i, item)} onpointerleave={() => preview(null)} onfocus={() => preview(item)} onblur={() => preview(null)}>
		{#if item.checked !== undefined}
			<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v16H4z" />{#if isChecked(item)}<path d="M8 12l3 3 5-6" />{/if}</svg>
		{:else if item.icon}
			<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={item.icon} /></svg>
		{:else}<span class="blank" aria-hidden="true"></span>{/if}
		<span class="label">{item.label}{#if item.reason}<small>{item.reason}</small>{/if}</span>
		{#if item.items}<span class="more" aria-hidden="true">›</span>{:else if item.keys}<kbd>{item.keys}</kbd>{/if}
	</button>
{/snippet}

<div class="context-menu" role="menu" tabindex="-1" aria-label={current ? current.label : label} data-testid="ideacad-context-menu" data-submenus={layout} bind:this={panel} onkeydown={(e) => key(e, 0)} oncontextmenu={(e) => e.preventDefault()} onpointerleave={leave} onscroll={() => closeSides(0)} style:left={place ? `${place.left}px` : undefined} style:top={place ? `${place.top}px` : undefined} style:visibility={place ? 'visible' : 'hidden'}>
	{#if current}
		<button type="button" role="menuitem" class="menu-back" data-menu-row data-index="-1" onclick={() => void back()} onpointerenter={() => preview(null)}>
			<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
			<span class="label">{current.label}</span>
		</button>
	{/if}
	{#each rows as item, i (item.id)}{@render row(item, i, 0)}{/each}
</div>
{#each sides as side, k (k)}
	<div class="context-menu" role="menu" tabindex="-1" aria-label={side.label} data-testid="ideacad-context-submenu" data-level={k + 1} data-side={side.place?.side} bind:this={sidePanels[k]} onkeydown={(e) => key(e, k + 1)} oncontextmenu={(e) => e.preventDefault()} onpointerenter={() => enter(k + 1)} onpointerleave={leave} onscroll={() => closeSides(k + 1)} style:left={side.place ? `${side.place.left}px` : undefined} style:top={side.place ? `${side.place.top}px` : undefined} style:visibility={side.place ? 'visible' : 'hidden'}>
		{#each side.items as item, i (item.id)}{@render row(item, i, k + 1)}{/each}
	</div>
{/each}

<style>
	.context-menu { position: fixed; z-index: 60; min-width: 200px; max-width: min(320px, calc(100vw - 16px)); max-height: calc(100vh - 16px); overflow-y: auto; display: flex; flex-direction: column; padding: 4px; background: var(--surface-1); border: 1px solid var(--boundary); border-radius: 8px; font-family: Rajdhani, sans-serif; color: var(--text-1); user-select: none; -webkit-user-select: none; }
	button { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; align-items: center; gap: 10px; min-height: 44px; padding: 4px 12px; font: 600 16px Rajdhani, sans-serif; color: var(--text-1); text-align: left; background: transparent; border: 1px solid transparent; border-radius: 5px; cursor: pointer; }
	/* A row whose list is open beside the menu stays lit while the pointer is in the list, so the two read as one path. */
	button:hover, button:focus-visible, button[aria-expanded='true'] { background: color-mix(in srgb, var(--green) 12%, var(--surface-1)); outline: none; }
	button:focus-visible { box-shadow: inset 0 0 0 2px var(--cyan); }
	button[aria-disabled='true'] { color: var(--text-2); }
	button[aria-checked='true'] { color: var(--green); }
	.menu-back { border-bottom: 1px solid var(--hairline); border-radius: 5px 5px 0 0; margin-bottom: 2px; color: var(--text-2); }
	.label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.label small { display: block; margin: 0; white-space: normal; line-height: 1.2; font-weight: 500; font-size: 13px; color: var(--text-2); }
	.blank { width: 20px; }
	.more { font-size: 20px; color: var(--text-2); }
	kbd { font: 12px 'Share Tech Mono', monospace; color: var(--text-1); padding: 2px 6px; border: 1px solid var(--boundary); border-radius: 4px; background: var(--surface-2); }
</style>
