<script lang="ts">
	/**
	 * COMMAND SEARCH, near the pointer. Every command in the registry, filtered
	 * as the student types, each with its group and its keys, ranked by recent
	 * use. Enter runs the highlighted one, Escape closes, the arrows move, and a
	 * press on a row runs it. It is the same list the view menu is, narrowed to
	 * the View group (`group`), so there is one searchable list, not two.
	 *
	 * A command that cannot run right now is still listed, marked, with its
	 * reason on the row, and running it says why: a hidden command is one a
	 * student never learns exists.
	 */
	import { onMount, tick } from 'svelte';
	import { anchorPosition } from '$lib/shell/anchored';
	import { keyLabel, searchCommands, type Command, type CommandGroup } from './command-registry';
	let { commands, recent, keys, group, at, unavailable, onrun, onclose }: {
		commands: readonly Command[];
		recent: readonly string[];
		/** The keys each command answers to right now. */
		keys: Map<string, string[]>;
		group?: CommandGroup;
		/** The pointer, in client pixels, where the list opens beside. */
		at: { x: number; y: number };
		unavailable: (command: Command) => string | null;
		onrun: (command: Command) => void;
		onclose: () => void;
	} = $props();
	let query = $state(''), active = $state(0);
	let input: HTMLInputElement | undefined = $state(), panel: HTMLDivElement | undefined = $state(), list: HTMLUListElement | undefined = $state();
	/* Where it opened: below the pointer, or above it with its BOTTOM edge held there, so a list that shrinks as it is filtered stays beside the pointer. */
	let place = $state<{ left: number; top?: number; bottom?: number } | null>(null);
	const results = $derived(searchCommands(query, recent, commands, group));
	$effect(() => { void query; active = 0; });
	function run(command: Command | undefined) { if (command) onrun(command); }
	function key(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, results.length - 1); scrollActive(); }
		else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); scrollActive(); }
		else if (e.key === 'Home' && !query) { e.preventDefault(); active = 0; scrollActive(); }
		else if (e.key === 'End' && !query) { e.preventDefault(); active = Math.max(results.length - 1, 0); scrollActive(); }
		else if (e.key === 'Enter') { e.preventDefault(); run(results[active]); }
		else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onclose(); }
	}
	function scrollActive() { void tick().then(() => list?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'instant' })); }
	function outside(e: PointerEvent) { const t = e.target as Node | null; if (t && t.isConnected && !panel?.contains(t)) onclose(); }
	onMount(() => {
		const box = { left: at.x, right: at.x, top: at.y, bottom: at.y, width: 0, height: 0 };
		const r = panel?.getBoundingClientRect();
		const at_ = anchorPosition(box, { width: r?.width ?? 320, height: r?.height ?? 420 }, { width: window.innerWidth, height: window.innerHeight }, { prefer: 'below', align: 'start', gap: 10, margin: 8 });
		place = at_.side === 'above' ? { left: at_.left, bottom: Math.max(8, window.innerHeight - (at_.top + (r?.height ?? 420))) } : { left: at_.left, top: at_.top };
		/* Focus once it is visible: a hidden input cannot take focus, and the keys typed next are the query. */
		void tick().then(() => input?.focus());
		document.addEventListener('pointerdown', outside, true);
		return () => document.removeEventListener('pointerdown', outside, true);
	});
	const id = `ic-search-${Math.random().toString(36).slice(2, 8)}`;
</script>

<div class="command-search" bind:this={panel} data-testid="ideacad-command-search" role="dialog" aria-label={group ? `${group} menu` : 'Search commands'} style:left={place ? `${place.left}px` : undefined} style:top={place?.top !== undefined ? `${place.top}px` : undefined} style:bottom={place?.bottom !== undefined ? `${place.bottom}px` : undefined} style:visibility={place ? 'visible' : 'hidden'}>
	<input bind:this={input} bind:value={query} onkeydown={key} role="combobox" aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={results.length ? `${id}-${active}` : undefined} aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder={group ? group : 'Search commands'} aria-label={group ? `${group}: type to filter` : 'Search commands'} />
	<ul id={`${id}-list`} role="listbox" aria-label="Commands" bind:this={list}>
		{#each results as command, i (command.id)}
			{@const reason = unavailable(command)}
			<li id={`${id}-${i}`} role="option" aria-selected={i === active} aria-disabled={reason ? 'true' : undefined} data-index={i} data-command={command.id} class:active={i === active} onpointerdown={(e) => { e.preventDefault(); active = i; run(command); }} onpointermove={() => (active = i)}>
				<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={command.icon} /></svg>
				<span class="name">{command.name}{#if reason}<small>{reason}</small>{/if}</span>
				<span class="group">{command.group}</span>
				{#if keys.get(command.id)?.length}<kbd>{keyLabel(keys.get(command.id)![0])}</kbd>{/if}
			</li>
		{:else}
			<li class="none" role="presentation">No command matches</li>
		{/each}
	</ul>
</div>

<style>
	.command-search { position: fixed; z-index: 60; width: min(340px, calc(100vw - 16px)); max-height: min(430px, calc(100vh - 16px)); display: flex; flex-direction: column; background: var(--surface-1); border: 1px solid var(--boundary); border-radius: 8px; overflow: hidden; font-family: Rajdhani, sans-serif; color: var(--text-1); }
	input { font: 600 17px Rajdhani, sans-serif; color: var(--text-1); min-height: 44px; padding: 0 12px; background: var(--surface-2); border: 0; border-bottom: 1px solid var(--hairline); outline: none; }
	input:focus-visible { box-shadow: inset 0 0 0 2px var(--cyan); }
	ul { list-style: none; margin: 0; padding: 4px; overflow-y: auto; min-height: 0; }
	li { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto auto; align-items: center; gap: 10px; min-height: 44px; padding: 2px 10px; border-radius: 5px; cursor: pointer; color: var(--text-2); }
	li.active { background: color-mix(in srgb, var(--green) 12%, var(--surface-1)); color: var(--text-1); }
	li[aria-disabled='true'] .name { color: var(--text-2); }
	.name { font-weight: 600; font-size: 16px; color: var(--text-1); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.name small { margin-left: 8px; font-weight: 500; font-size: 13px; color: var(--text-2); }
	.group { font: 11px 'Share Tech Mono', monospace; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.04em; }
	kbd { font: 12px 'Share Tech Mono', monospace; color: var(--text-1); padding: 2px 6px; border: 1px solid var(--boundary); border-radius: 4px; background: var(--surface-2); }
	.none { display: block; padding: 12px; cursor: default; }
</style>
