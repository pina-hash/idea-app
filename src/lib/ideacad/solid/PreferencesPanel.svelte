<script lang="ts">
	/**
	 * THE STUDENT'S OWN SETTINGS, one group at a time: the planes and the
	 * corner triad, the quick toolbar and its order, every shortcut, the snaps,
	 * hint timing, and the display unit. Every group has its own Reset. It
	 * writes only through the store it is handed, which validates each value
	 * and saves it to wherever this student's preferences live, so there is no
	 * Save button and nothing here can put the modeler in a state it cannot
	 * draw.
	 */
	import { onMount } from 'svelte';
	import { COMMANDS, COMMAND_GROUPS, effectiveShortcuts, keyFromEvent, keyLabel, shortcutConflict, TOOL_COMMANDS } from './command-registry';
	import type { PreferenceGroup, PreferenceStore, SolidPreferences } from './preferences';
	import type { Tool } from './viewport';
	let { store, prefs, onclose }: { store: PreferenceStore; prefs: SolidPreferences; onclose: () => void } = $props();
	const GROUPS = [
		{ id: 'view', label: 'View' },
		{ id: 'toolbar', label: 'Toolbar' },
		{ id: 'shortcuts', label: 'Shortcuts' },
		{ id: 'snaps', label: 'Snaps' },
		{ id: 'hints', label: 'Hints' },
		{ id: 'units', label: 'Units' }
	] as const satisfies readonly { id: PreferenceGroup; label: string }[];
	let group = $state<(typeof GROUPS)[number]['id']>('view');
	let recording = $state<string | null>(null), refusal = $state(''), filter = $state('');
	const keys = $derived(effectiveShortcuts(prefs.shortcuts));
	const quick = $derived(prefs.toolbar.quick);
	const toolRows = $derived([...quick.map((id) => TOOL_COMMANDS.find((c) => c.tool === id)!).filter(Boolean), ...TOOL_COMMANDS.filter((c) => !quick.includes(c.tool))]);
	const shortcutRows = $derived.by(() => {
		const f = filter.trim().toLowerCase();
		return COMMANDS.filter((c) => !f || c.name.toLowerCase().includes(f) || c.group.toLowerCase().includes(f)).sort((a, b) => COMMAND_GROUPS.indexOf(a.group) - COMMAND_GROUPS.indexOf(b.group));
	});
	function setQuick(next: Tool[]) { store.set('toolbar', { quick: next }); }
	function toggleQuick(id: Tool, on: boolean) { setQuick(on ? [...quick.filter((q) => q !== id), id] : quick.filter((q) => q !== id)); }
	function moveQuick(id: Tool, by: -1 | 1) { const i = quick.indexOf(id), j = i + by; if (i < 0 || j < 0 || j >= quick.length) return; const next = [...quick]; [next[i], next[j]] = [next[j], next[i]]; setQuick(next); }
	function setKey(id: string, key: string | null) {
		refusal = '';
		if (key !== null) { const why = shortcutConflict(id, key, prefs.shortcuts); if (why) { refusal = why; return; } }
		store.set('shortcuts', { ...prefs.shortcuts, [id]: key });
	}
	function resetKey(id: string) { refusal = ''; const next = { ...prefs.shortcuts }; delete next[id]; store.set('shortcuts', next); }
	/* While a shortcut is being recorded the next key is the answer: it is taken before the workspace's shortcut layer sees it, and Escape stops recording without changing anything. */
	function capture(e: KeyboardEvent) {
		if (!recording) return;
		if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
		e.preventDefault(); e.stopImmediatePropagation();
		const id = recording; recording = null;
		if (e.key === 'Escape') return;
		const key = keyFromEvent(e);
		if (key) setKey(id, key);
	}
	onMount(() => { window.addEventListener('keydown', capture, { capture: true }); return () => window.removeEventListener('keydown', capture, { capture: true }); });
	function choose(id: (typeof GROUPS)[number]['id']) { group = id; refusal = ''; recording = null; }
	/* The groups are one tab stop; the arrows, Home and End move between them, as a tab list does. */
	function tabKey(e: KeyboardEvent) {
		const i = GROUPS.findIndex((g) => g.id === group);
		const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % GROUPS.length : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + GROUPS.length) % GROUPS.length : e.key === 'Home' ? 0 : e.key === 'End' ? GROUPS.length - 1 : -1;
		if (next < 0) return;
		const list = e.currentTarget as HTMLElement;
		e.preventDefault(); choose(GROUPS[next].id);
		queueMicrotask(() => list.querySelector<HTMLButtonElement>(`[data-group="${GROUPS[next].id}"]`)?.focus());
	}
	function reset(g: PreferenceGroup) { refusal = ''; recording = null; store.reset(g); }
	const delayText = (ms: number) => String(ms);
	function setDelay(text: string) { const n = Number(text.trim()); if (text.trim() === '' || !Number.isFinite(n) || n < 0) { refusal = 'Enter a delay of 0 ms or more.'; return; } refusal = ''; store.set('hints', { ...prefs.hints, tooltipDelayMs: n }); }
</script>

<aside class="panel prefs-panel" aria-label="Preferences" data-testid="ideacad-preferences">
	<div class="head"><h2>Preferences</h2><button type="button" class="close" onclick={onclose}>Close</button></div>
	<div class="groups" role="tablist" aria-label="Preference groups" tabindex="-1" onkeydown={tabKey}>
		{#each GROUPS as g (g.id)}<button type="button" role="tab" data-group={g.id} aria-selected={group === g.id} tabindex={group === g.id ? 0 : -1} class:current={group === g.id} onclick={() => choose(g.id)}>{g.label}</button>{/each}
	</div>
	<div class="body" role="tabpanel">
		{#if group === 'view'}
			<fieldset>
				<legend>Planes</legend>
				{#each [['auto', 'Until the first solid'], ['always', 'Always'], ['never', 'Never']] as [mode, word] (mode)}
					<label class="row"><input type="radio" name="ic-planes" checked={prefs.view.planes === mode} onchange={() => store.set('view', { ...prefs.view, planes: mode as SolidPreferences['view']['planes'] })} />{word}</label>
				{/each}
			</fieldset>
			<fieldset>
				<legend>Display</legend>
				{#each [['shaded-edges', 'Shaded with edges'], ['shaded', 'Shaded'], ['hidden-lines', 'Hidden lines visible'], ['wireframe', 'Wireframe']] as [mode, word] (mode)}
					<label class="row"><input type="radio" name="ic-display" checked={prefs.view.mode === mode} onchange={() => store.set('view', { ...prefs.view, mode: mode as SolidPreferences['view']['mode'] })} />{word}</label>
				{/each}
			</fieldset>
			<label class="row"><input type="checkbox" checked={prefs.view.triad} onchange={(e) => store.set('view', { ...prefs.view, triad: e.currentTarget.checked })} />Corner triad</label>
			<button type="button" class="reset" onclick={() => reset('view')}>Reset view</button>
		{:else if group === 'toolbar'}
			<ul class="list" aria-label="Quick tools">
				{#each toolRows as c (c.id)}
					{@const on = quick.includes(c.tool)}
					<li class="row tool-row">
						<label><input type="checkbox" checked={on} onchange={(e) => toggleQuick(c.tool, e.currentTarget.checked)} /><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={c.icon} /></svg>{c.name}</label>
						{#if on}<button type="button" class="small" aria-label={`Move ${c.name} up`} aria-disabled={quick.indexOf(c.tool) === 0 ? 'true' : undefined} onclick={() => moveQuick(c.tool, -1)}>Up</button><button type="button" class="small" aria-label={`Move ${c.name} down`} aria-disabled={quick.indexOf(c.tool) === quick.length - 1 ? 'true' : undefined} onclick={() => moveQuick(c.tool, 1)}>Down</button>{/if}
					</li>
				{/each}
			</ul>
			<button type="button" class="reset" onclick={() => reset('toolbar')}>Reset toolbar</button>
		{:else if group === 'shortcuts'}
			<label class="filter"><span>Find</span><input type="search" bind:value={filter} autocomplete="off" /></label>
			{#if refusal}<p class="refusal" role="alert">{refusal}</p>{/if}
			<ul class="list" aria-label="Shortcuts">
				{#each shortcutRows as c (c.id)}
					{@const current = keys.byCommand.get(c.id) ?? []}
					<li class="row key-row" data-command={c.id}>
						<span class="name">{c.name}</span>
						<button type="button" class="key" class:recording={recording === c.id} aria-label={recording === c.id ? `Press a key for ${c.name}` : `${c.name} shortcut: ${current.length ? keyLabel(current[0]) : 'none'}. Change`} onclick={() => { refusal = ''; recording = recording === c.id ? null : c.id; }}>{recording === c.id ? 'Press a key' : current.length ? keyLabel(current[0]) : 'None'}</button>
						{#if current.length}<button type="button" class="small" aria-label={`Clear ${c.name} shortcut`} onclick={() => setKey(c.id, null)}>Clear</button>{:else if c.id in prefs.shortcuts}<button type="button" class="small" aria-label={`Put back ${c.name} default shortcut`} onclick={() => resetKey(c.id)}>Default</button>{/if}
					</li>
				{/each}
			</ul>
			<button type="button" class="reset" onclick={() => reset('shortcuts')}>Reset shortcuts</button>
		{:else if group === 'snaps'}
			<label class="row"><input type="checkbox" checked={prefs.snaps.references} onchange={(e) => store.set('snaps', { ...prefs.snaps, references: e.currentTarget.checked })} />Snap to planes, axes, points</label>
			<label class="row"><input type="checkbox" checked={prefs.snaps.bodies} onchange={(e) => store.set('snaps', { ...prefs.snaps, bodies: e.currentTarget.checked })} />Snap to other bodies</label>
			<label class="row"><input type="checkbox" checked={prefs.snaps.angles} onchange={(e) => store.set('snaps', { ...prefs.snaps, angles: e.currentTarget.checked })} />Turn in 15° steps</label>
			<button type="button" class="reset" onclick={() => reset('snaps')}>Reset snaps</button>
		{:else if group === 'hints'}
			<label class="field"><span>Tooltip delay</span><input type="text" inputmode="decimal" value={delayText(prefs.hints.tooltipDelayMs)} onchange={(e) => setDelay(e.currentTarget.value)} /><span class="unit">ms</span></label>
			{#if refusal}<p class="refusal" role="alert">{refusal}</p>{/if}
			{#if prefs.hints.retired.length}<button type="button" class="wide" onclick={() => store.set('hints', { ...prefs.hints, retired: [] })}>Bring back {prefs.hints.retired.length} hidden {prefs.hints.retired.length === 1 ? 'hint' : 'hints'}</button>{/if}
			<button type="button" class="reset" onclick={() => reset('hints')}>Reset hints</button>
		{:else if group === 'units'}
			<fieldset>
				<legend>Show lengths in</legend>
				<label class="row"><input type="radio" name="ic-units" checked={prefs.units.display === 'in'} onchange={() => store.set('units', { display: 'in' })} />Inches</label>
				<label class="row"><input type="radio" name="ic-units" checked={prefs.units.display === 'mm'} onchange={() => store.set('units', { display: 'mm' })} />Millimeters</label>
			</fieldset>
			<button type="button" class="reset" onclick={() => reset('units')}>Reset units</button>
		{/if}
	</div>
</aside>

<style>
	.prefs-panel { display: flex; flex-direction: column; flex-shrink: 0; }
	.head { display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid var(--hairline); margin-bottom: 8px; }
	h2 { margin: 0; font-size: 20px; padding: 5px 4px; }
	button, input { font: 600 16px Rajdhani, sans-serif; color: var(--text-1); min-height: 44px; min-width: 44px; border-radius: 5px; }
	button { padding: 0 12px; border: 1px solid transparent; background: transparent; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
	button:hover { background: var(--surface-2); }
	button:focus-visible, input:focus-visible { outline: 2px solid var(--cyan); outline-offset: -2px; }
	button[aria-disabled='true'] { color: var(--text-2); }
	.groups { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; margin-bottom: 8px; }
	.groups button { padding: 0 6px; border-color: var(--hairline); font-size: 15px; }
	.groups button.current { background: color-mix(in srgb, var(--green) 12%, var(--surface-1)); border-color: var(--green); color: var(--green); }
	.body { display: flex; flex-direction: column; gap: 4px; min-height: 0; }
	fieldset { margin: 0; padding: 0; border: 0; display: flex; flex-direction: column; }
	legend { font: 13px 'Share Tech Mono', monospace; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.04em; padding: 6px 4px 2px; }
	.row { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 6px; font-size: 16px; }
	label.row, .tool-row label { cursor: pointer; }
	input[type='radio'], input[type='checkbox'] { min-height: 20px; min-width: 20px; width: 20px; height: 20px; margin: 0; accent-color: var(--green); flex-shrink: 0; }
	.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
	.tool-row { padding: 0 0 0 6px; gap: 2px; }
	.tool-row label { flex: 1; display: flex; align-items: center; gap: 10px; min-height: 44px; min-width: 0; }
	.small { padding: 0 8px; font-size: 14px; color: var(--text-2); }
	.small:hover { color: var(--text-1); }
	.key-row { padding: 0 0 0 6px; gap: 4px; }
	.key-row .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.key { min-width: 64px; padding: 0 8px; font: 13px 'Share Tech Mono', monospace; border: 1px solid var(--boundary); background: var(--surface-2); }
	.key.recording { border-color: var(--green); color: var(--green); }
	.filter, .field { display: flex; align-items: center; gap: 8px; padding: 0 6px; }
	.filter span, .field span { font-size: 15px; color: var(--text-2); }
	.filter input, .field input { flex: 1; min-width: 0; padding: 0 8px; background: var(--surface-2); border: 1px solid var(--boundary); }
	.field input { max-width: 90px; }
	.field .unit { font: 13px 'Share Tech Mono', monospace; }
	.refusal { margin: 4px 6px; font-size: 15px; color: var(--ic-warn, var(--amber)); }
	.reset { align-self: flex-start; margin-top: 6px; border-color: var(--boundary); }
	.wide { align-self: stretch; justify-content: flex-start; border-color: var(--boundary); }
	.close { border-color: var(--boundary); }
</style>
