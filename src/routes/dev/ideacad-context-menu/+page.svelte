<script lang="ts">
	/**
	 * THE RIGHT-CLICK MENU'S LISTS: BESIDE THE MENU ON A MOUSE, IN PLACE ON A
	 * FINGER. A development harness (404 in production) that mounts the REAL
	 * `ContextMenu` with the rows the modeler builds (names and icons from the
	 * real command registry), so the two ways a row's list opens can be driven
	 * without booting the kernel (report R04, ledger 0298).
	 *
	 * `?kind=empty` (the default) is the menu on empty space: Recent, Views,
	 * Fit, Show planes, the pick filter (boxes that stay open) and Search.
	 * `?kind=face` is a face's menu, whose Select other lists four candidates
	 * that LIGHT while hovered or focused, so preview and un-preview are
	 * readable on screen (`harness-lit`). `?at=left` (the default), `right` or
	 * `bottom` opens it near that edge of the window, which is where a list
	 * beside the menu has to flip. A right-click anywhere on the surface opens
	 * it at the pointer, as the modeler's viewport does, and
	 * `window.__icMenuHarness.open(x, y, kind)` does the same from a script.
	 *
	 * The surface is the modeler's `.ic-root` room, so the menu paints in the
	 * tokens it paints in there.
	 */
	import { onMount } from 'svelte';
	import ContextMenu from '$lib/ideacad/solid/ContextMenu.svelte';
	import { commandById } from '$lib/ideacad/solid/command-registry';
	import type { MenuItem } from '$lib/ideacad/solid/context-menu';
	import '$lib/ideacad/ideacad.css';
	type Kind = 'empty' | 'face';
	let menu = $state.raw<{ items: MenuItem[]; at: { x: number; y: number }; label: string } | null>(null);
	let lit = $state('nothing'), ran = $state<string[]>([]), ready = $state(false);
	let picks = $state<string[]>([]);
	const log = (what: string) => { ran = [...ran, what]; };
	function commands(ids: string[], keys: Record<string, string> = {}): MenuItem[] {
		return ids.map((id) => { const c = commandById(id); return { id, label: c?.name ?? id, icon: c?.icon, keys: keys[id], run: () => log(c?.name ?? id) }; });
	}
	const PICK_KINDS: [string, string][] = [['face', 'Faces'], ['edge', 'Edges'], ['vertex', 'Corners'], ['body', 'Bodies'], ['sketch', 'Sketches'], ['reference', 'Planes and axes']];
	function pickItems(): MenuItem[] {
		return [...PICK_KINDS.map(([k, word]) => ({ id: `pick-${k}`, label: word, checked: picks.includes(k), keepOpen: true, run: () => { picks = picks.includes(k) ? picks.filter((x) => x !== k) : [...picks, k]; log(`Pick ${word}`); } })), { id: 'pick-all', label: 'Pick anything', icon: 'M5 3l14 10-7 1-3 7z', reason: picks.length ? null : 'Already picking anything', run: () => { picks = []; log('Pick anything'); } }];
	}
	const CANDIDATES = ['End face of Extrude 1', 'Edge of Extrude 1', 'Side face 3 of Extrude 1', 'Body 1'];
	function itemsFor(kind: Kind): MenuItem[] {
		if (kind === 'face') {
			const candidates: MenuItem[] = CANDIDATES.map((name, i) => ({ id: `candidate-${i}`, label: name, icon: 'M4 7l8-4 8 4-8 4z', run: () => log(`Select ${name}`), preview: (on: boolean) => { lit = on ? name : 'nothing'; } }));
			return [...commands(['sketch-on', 'extrude', 'fillet-face-edges'], { extrude: 'E' }), { id: 'select-other', label: 'Select other', icon: commandById('select-other')?.icon, items: candidates }, ...commands(['measure', 'normal-to'])];
		}
		return [
			{ id: 'recent', label: 'Recent', icon: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 7v5l3 2', items: commands(['extrude', 'fillet', 'shell']) },
			{ id: 'views', label: 'Views', icon: commandById('view-iso')?.icon, items: commands(['view-iso', 'view-front', 'view-top', 'view-right', 'normal-to'], { 'view-iso': 'Ctrl+7', 'view-front': 'Ctrl+1', 'view-top': 'Ctrl+5', 'view-right': 'Ctrl+4' }) },
			...commands(['fit', 'planes'], { fit: 'F' }),
			{ id: 'pick-filter', label: picks.length ? `Pick filter: ${picks.length} kinds` : 'Pick filter', icon: commandById('pick-filter')?.icon, items: pickItems() },
			...commands(['search'], { search: 'W' })
		];
	}
	function open(x: number, y: number, kind: Kind = 'empty') { menu = { items: itemsFor(kind), at: { x, y }, label: kind === 'face' ? 'End face of Extrude 1 menu' : 'Menu' }; }
	let kind: Kind = 'empty';
	function onsurface(e: MouseEvent) { e.preventDefault(); open(e.clientX, e.clientY, kind); }
	onMount(() => {
		const q = new URLSearchParams(location.search);
		kind = q.get('kind') === 'face' ? 'face' : 'empty';
		const where = q.get('at');
		(window as unknown as { __icMenuHarness: unknown }).__icMenuHarness = { open, get lit() { return lit; }, get ran() { return ran; } };
		const x = where === 'right' ? window.innerWidth - 40 : 40, y = where === 'bottom' ? window.innerHeight - 60 : 120;
		open(x, y, kind);
		ready = true;
	});
</script>
<svelte:head><title>IdeaCAD right-click menu · Development</title></svelte:head>
<main class="ic-root" data-testid="ideacad-menu-harness" data-ready={ready}>
	<div class="surface" role="presentation" oncontextmenu={onsurface}></div>
	<aside class="log" aria-label="Harness log"><p data-testid="harness-lit">lit: {lit}</p><ol data-testid="harness-ran">{#each ran as r, i (i)}<li>{r}</li>{/each}</ol></aside>
	{#if menu}<ContextMenu items={menu.items} at={menu.at} label={menu.label} onclose={() => { menu = null; }} />{/if}
</main>
<style>
	:global(html), :global(body) { width: 100%; height: 100%; overflow: hidden; }
	main { position: fixed; inset: 0; background: var(--surface-0); color: var(--text-1); font-family: Rajdhani, sans-serif; z-index: 50; }
	.surface { position: absolute; inset: 0; }
	.log { position: absolute; left: 12px; bottom: 12px; max-width: 60%; font: 13px 'Share Tech Mono', monospace; color: var(--text-2); pointer-events: none; }
	.log p { margin: 0; }
	.log ol { margin: 0; padding-left: 18px; }
</style>
