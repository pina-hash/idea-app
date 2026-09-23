<script lang="ts" module>
	/** One view button: the command it runs, the word on it, what hover says, and why it cannot run now (it still explains itself when pressed). */
	export interface ViewItem { id: string; label: string; title: string; reason?: string | null }
</script>
<script lang="ts">
	/**
	 * THE VIEW CONTROL, PRIORITY-PLUS. Every view is a word on a button, in the
	 * order it matters most; when the row has less room than the words need, the
	 * last ones fold into one "Views" menu rather than overlapping whatever is
	 * beside the row. Widths are read from a hidden copy of the whole row, so
	 * a folded button is still measured and the row unfolds the moment there is
	 * room again. The commands are the registry's: this only lays them out.
	 */
	import { anchored } from '$lib/shell/anchored';
	let { items, onrun }: { items: ViewItem[]; onrun: (id: string) => void } = $props();
	let available = $state(0), widths = $state<number[]>([]), moreWidth = $state(0), open = $state(false);
	let measurer: HTMLDivElement | undefined = $state(), moreButton: HTMLButtonElement | null = $state(null), menu: HTMLDivElement | undefined = $state();
	const GAP = 2, FRAME = 2;
	/** How many buttons fit: all of them, or as many as leave room for the Views button. */
	const fit = $derived.by(() => {
		if (!available || widths.length !== items.length) return items.length;
		const sum = (n: number) => widths.slice(0, n).reduce((a, w) => a + w, 0) + GAP * Math.max(0, n - 1) + FRAME;
		if (sum(items.length) <= available) return items.length;
		let n = items.length - 1;
		while (n > 0 && sum(n) + GAP + moreWidth > available) n--;
		return n;
	});
	const shown = $derived(items.slice(0, fit)), folded = $derived(items.slice(fit));
	function measure() {
		if (!measurer) return;
		const buttons = [...measurer.querySelectorAll('button')];
		widths = buttons.slice(0, -1).map((b) => b.getBoundingClientRect().width);
		moreWidth = buttons.at(-1)?.getBoundingClientRect().width ?? 0;
	}
	$effect(() => {
		void items.length;
		if (!measurer) return;
		measure();
		/* Fonts arriving change every width; a resize of the hidden row is when to read them again. */
		const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => measure()) : null;
		observer?.observe(measurer);
		return () => observer?.disconnect();
	});
	$effect(() => { if (!folded.length) open = false; });
	function run(id: string) { open = false; onrun(id); }
	function outside(e: PointerEvent) { const t = e.target as Node | null; if (!t || !t.isConnected) return; if (!menu?.contains(t) && !moreButton?.contains(t)) open = false; }
	function menuKey(e: KeyboardEvent) {
		const items = [...(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
		const i = items.indexOf(document.activeElement as HTMLButtonElement);
		if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
		else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
		else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); open = false; moreButton?.focus(); }
	}
	$effect(() => {
		if (!open) return;
		document.addEventListener('pointerdown', outside, true);
		queueMicrotask(() => menu?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus());
		return () => document.removeEventListener('pointerdown', outside, true);
	});
</script>

<div class="view-controls" bind:clientWidth={available} data-testid="ideacad-view-controls">
	<div class="row" role="toolbar" aria-label="View">
		{#each shown as item (item.id)}<button type="button" data-view={item.id} title={item.title} aria-disabled={item.reason ? 'true' : undefined} onclick={() => run(item.id)}>{item.label}</button>{/each}
		{#if folded.length}<button type="button" class="more" bind:this={moreButton} aria-haspopup="menu" aria-expanded={open} onclick={() => (open = !open)}>Views <span aria-hidden="true">▾</span></button>{/if}
	</div>
	<div class="measurer" aria-hidden="true" bind:this={measurer}>
		{#each items as item (item.id)}<button type="button" tabindex="-1">{item.label}</button>{/each}<button type="button" class="more" tabindex="-1">Views <span>▾</span></button>
	</div>
	{#if open && folded.length}
		<div class="menu" role="menu" aria-label="More views" tabindex="-1" bind:this={menu} onkeydown={menuKey} use:anchored={{ anchor: moreButton, open, prefer: 'below', align: 'start', gap: 4 }}>
			{#each folded as item (item.id)}<button type="button" role="menuitem" data-view={item.id} aria-disabled={item.reason ? 'true' : undefined} onclick={() => run(item.id)}><span>{item.label}</span>{#if item.reason}<small>{item.reason}</small>{/if}</button>{/each}
		</div>
	{/if}
</div>

<style>
	/* The root FILLS its slot, so the width it reads is the room there is, never the width of the buttons it chose to show (which would fold once and never unfold). The row inside is only as wide as its buttons; the rest passes presses through to the model. */
	.view-controls { position: relative; flex: 1 1 auto; min-width: 0; display: flex; pointer-events: none; }
	.row { display: flex; gap: 2px; padding: 0; background: var(--surface-1); border: 1px solid var(--boundary); border-radius: 7px; pointer-events: auto; }
	button { font: 600 16px Rajdhani, sans-serif; color: var(--text-1); min-height: 44px; min-width: 44px; padding: 0 10px; border: 1px solid transparent; border-radius: 5px; background: transparent; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; gap: 4px; }
	button:hover { background: var(--surface-2); }
	button:focus-visible { outline: 2px solid var(--cyan); outline-offset: -2px; }
	button[aria-disabled='true'] { color: var(--text-2); }
	.more span { font-size: 12px; color: var(--text-2); }
	.measurer { position: absolute; left: 0; top: 0; display: flex; gap: 2px; visibility: hidden; pointer-events: none; height: 0; overflow: hidden; }
	.menu { position: absolute; top: calc(100% + 4px); left: 0; z-index: 30; min-width: 170px; display: flex; flex-direction: column; padding: 4px; background: var(--surface-1); border: 1px solid var(--boundary); border-radius: 7px; pointer-events: auto; }
	.menu button { justify-content: space-between; text-align: left; width: 100%; }
	.menu small { font: 13px Rajdhani, sans-serif; color: var(--text-2); }
	@media (max-width: 700px) { button { font-size: 14px; padding: 0 8px; } }
</style>
