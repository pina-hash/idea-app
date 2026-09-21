<script lang="ts">
	/**
	 * THE DESIGN TREE. Every feature in order, its status as a glyph AND a
	 * word, its one-line summary, its sentence on its own row when it has one,
	 * and the controls to select, rename, reorder, suppress, delete and edit
	 * it. `FeatureParams` sits beneath the list for the selected feature.
	 *
	 * SELECTING A ROW SELECTS THE GEOMETRY IT MADE AND THE FEATURE ITSELF
	 * (`rowSelections`), so the viewport lights the body while the tree marks
	 * the row and the form shows the numbers.
	 *
	 * EVERY REFUSAL IS THE REDUCER'S OWN SENTENCE, before or after the press.
	 * Up, Down and Delete are `aria-disabled` rather than `disabled` when the
	 * reducer would refuse them, so a press still explains itself through
	 * `api.error`, and the reasons are written under the controls. A drop
	 * outside the legal range goes the same way. Nothing here restates
	 * `reorderRange` or the dependents rule; `tree/rows.ts` asks the reducer.
	 *
	 * THE DELETE KEY IS ANSWERED HERE AND STOPPED. The workspace's own window
	 * handler deletes the SELECTION, which for a tree row is the feature plus
	 * every body it made, and a body whose creating feature is being removed is
	 * a reference the replay then cannot find. The tree removes the feature and
	 * stops the event from reaching the window.
	 */
	import { tick } from 'svelte';
	import FeatureParams from './FeatureParams.svelte';
	import { TYPE_LABELS } from './features';
	import { STATUS_WORDS, deleteRefusal, dropAllowed, dropIndex, moveOptions, refusalFor, rowSelections, selectedFeatureId, type MoveOption } from './tree/rows';
	import type { WorkspaceApi } from './workspace-api';
	import type { FeatureRow, SolidCommand } from './types';
	let { api }: { api: WorkspaceApi } = $props();
	const rows = $derived(api.model.features);
	const selectedId = $derived(selectedFeatureId(api.selections, rows));
	const selectedRow = $derived(rows.find((r) => r.id === selectedId) ?? null);
	/* Roving focus: one row is tabbable and the arrow keys move it. It follows the selection unless the keyboard moved it. */
	let focusedId = $state<string | null>(null);
	const focusId = $derived(rows.some((r) => r.id === focusedId) ? focusedId : (selectedId ?? rows[0]?.id ?? null));
	const editable = $derived(api.canWrite && !api.busy);
	const moves = $derived(selectedId && api.canWrite ? moveOptions(api.manifest, selectedId) : null);
	const removal = $derived(selectedId && api.canWrite ? deleteRefusal(api.manifest, selectedId) : null);
	/* The reducer's reasons, written under the controls they disable. An end-of-tree boundary is visible from the row's position and is not repeated. */
	const reasons = $derived([moves?.up.to !== null && moves?.up.refusal ? `Up: ${moves.up.refusal}` : '', moves?.down.to !== null && moves?.down.refusal ? `Down: ${moves.down.refusal}` : '', removal ? `Delete: ${removal}` : ''].filter(Boolean));
	let paramsOpen = $state(true);
	let renaming = $state<string | null>(null), renameValue = $state('');
	let dragging = $state<string | null>(null), dropAt = $state<{ id: string; before: boolean; to: number; allowed: boolean } | null>(null);
	let listEl = $state<HTMLOListElement>(), paramsEl = $state<HTMLElement>();
	async function run(command: SolidCommand, label: string) {
		try { await api.apply(command, label); } catch (error) { api.error(error instanceof Error ? error.message : String(error)); }
	}
	/** A press the reducer would refuse says so where every refusal shows, and sends nothing. */
	async function attempt(command: SolidCommand, label: string, refusal: string | null = refusalFor(api.manifest, command)) {
		if (refusal) { api.error(refusal); return; }
		await run(command, label);
	}
	function pick(row: FeatureRow) { rowSelections(row).forEach((s, i) => api.select(s, i > 0)); focusedId = row.id; }
	function move(row: FeatureRow, option: MoveOption) {
		if (option.to === null) { api.error(option.refusal ?? ''); return; }
		void attempt({ type: 'move-feature', id: row.id, to: option.to }, `Move ${row.name}`, option.refusal);
	}
	function remove(row: FeatureRow) { void attempt({ type: 'remove-feature', id: row.id }, `Delete ${row.name}`); }
	function suppress(row: FeatureRow) { void run({ type: 'suppress-feature', id: row.id, suppressed: !row.suppressed }, `${row.suppressed ? 'Unsuppress' : 'Suppress'} ${row.name}`); }
	function startRename(row: FeatureRow) {
		renaming = row.id; renameValue = row.name;
		void tick().then(() => (listEl?.querySelector(`[data-row="${row.id}"] input.rename`) as HTMLInputElement | null)?.select());
	}
	function finishRename(row: FeatureRow, commit: boolean) {
		if (renaming !== row.id) return;
		const name = renameValue.trim(); renaming = null;
		if (commit && name && name !== row.name) void attempt({ type: 'rename-feature', id: row.id, name }, `Rename ${row.name}`);
		void focusRow(row.id);
	}
	async function focusRow(id: string) { await tick(); (listEl?.querySelector(`[data-row="${id}"] .row`) as HTMLElement | null)?.focus(); }
	async function openParams() {
		paramsOpen = true; await tick();
		(paramsEl?.querySelector('input:not([disabled]),select:not([disabled])') as HTMLElement | null)?.focus();
	}
	function keydown(e: KeyboardEvent) {
		const index = rows.findIndex((r) => r.id === focusId), row = rows[index];
		const go = (next: FeatureRow | undefined) => { if (next) { pick(next); void focusRow(next.id); } };
		if (e.key === 'ArrowDown') go(rows[index + 1]);
		else if (e.key === 'ArrowUp') go(rows[index - 1]);
		else if (e.key === 'Home') go(rows[0]);
		else if (e.key === 'End') go(rows[rows.length - 1]);
		else if (e.key === 'Enter') { if (row) { pick(row); void openParams(); } }
		else if (e.key === 'Delete' || e.key === 'Backspace') { if (row && api.canWrite) remove(row); }
		else return;
		e.preventDefault(); e.stopPropagation();
	}
	const keys = { onkeydown: keydown };
	/* HTML5 drag. The reducer decides; the affordance reads `reorderRange` through `dropAllowed` so a refused target is marked before the drop lands. */
	function dragStart(row: FeatureRow, e: DragEvent) {
		if (!editable) { e.preventDefault(); return; }
		dragging = row.id; e.dataTransfer?.setData('text/plain', row.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}
	function dragOver(row: FeatureRow, index: number, e: DragEvent) {
		if (!dragging) return;
		e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		const from = rows.findIndex((r) => r.id === dragging), rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		/* Above the row's midline inserts before it; without a laid-out box (a test), a row above the source is "before" and one below is "after". */
		const before = rect.height > 0 ? e.clientY < rect.top + rect.height / 2 : index < from;
		if (dropAt?.id === row.id && dropAt.before === before) return;
		const to = dropIndex(from, index, before);
		dropAt = { id: row.id, before, to, allowed: dropAllowed(api.manifest, dragging, to) };
	}
	function drop(row: FeatureRow, e: DragEvent) {
		e.preventDefault();
		const id = dragging, at = dropAt; dragging = null; dropAt = null;
		if (!id || !at || at.id !== row.id) return;
		const from = rows.findIndex((r) => r.id === id);
		if (from < 0 || at.to === from) return;
		void attempt({ type: 'move-feature', id, to: at.to }, `Move ${rows[from].name}`);
	}
	function dragEnd() { dragging = null; dropAt = null; }
</script>
<section class="tree" aria-label="Design tree" data-testid="ideacad-feature-tree">
	<h2>Features <span class="count">{rows.length}</span></h2>
	{#if !rows.length}<p class="empty">Draw a shape to start the tree.</p>{/if}
	<ol bind:this={listEl} aria-label="Features in order">
		{#each rows as row, index (row.id)}
			{@const status = STATUS_WORDS[row.status]}
			{@const selected = row.id === selectedId}
			{@const editing = api.editingSketch === row.id}
			<li class={row.status} class:selected class:editing class:dragging={dragging === row.id} class:drop-before={dropAt?.id === row.id && dropAt.before} class:drop-after={dropAt?.id === row.id && !dropAt.before} class:drop-refused={dropAt?.id === row.id && !dropAt.allowed} data-row={row.id}>
				<div class="line">
					{#if renaming === row.id}
						<input class="rename" aria-label={`New name for ${row.name}`} bind:value={renameValue} maxlength="60" onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); finishRename(row, true); } else if (e.key === 'Escape') { e.preventDefault(); finishRename(row, false); } e.stopPropagation(); }} onblur={() => finishRename(row, true)} />
					{:else}
						<button class="row" type="button" tabindex={row.id === focusId ? 0 : -1} aria-pressed={selected} draggable={editable} {...keys} onclick={() => pick(row)} ondblclick={() => { if (editable) startRename(row); }} ondragstart={(e) => dragStart(row, e)} ondragover={(e) => dragOver(row, index, e)} ondrop={(e) => drop(row, e)} ondragend={dragEnd}>
							<span class="name">{row.name}</span>
							<span class="summary">{row.summary}</span>
							<span class="status"><span class="glyph" aria-hidden="true">{status.glyph}</span>{status.word}</span>
							<span class="kind">{TYPE_LABELS[row.type]}{#if editing}<span class="editing-word">Editing</span>{/if}</span>
						</button>
					{/if}
					{#if row.type === 'sketch'}<button class="edit-sketch" type="button" class:active={editing} aria-pressed={editing} {...keys} onclick={() => api.editSketch(editing ? null : row.id)}>{editing ? 'Close sketch' : 'Edit sketch'}</button>{/if}
				</div>
				{#if row.message}<p class="message" role={row.status === 'error' ? 'alert' : 'status'}>{row.message}</p>{/if}
				{#if selected && api.canWrite && moves}
					<div class="actions" role="group" aria-label={`${row.name} actions`}>
						<button type="button" aria-disabled={!!moves.up.refusal} disabled={api.busy} {...keys} onclick={() => move(row, moves.up)}>▲ Up</button>
						<button type="button" aria-disabled={!!moves.down.refusal} disabled={api.busy} {...keys} onclick={() => move(row, moves.down)}>▼ Down</button>
						<button type="button" disabled={api.busy} {...keys} onclick={() => suppress(row)}>{row.suppressed ? 'Unsuppress' : 'Suppress'}</button>
						<button type="button" aria-disabled={!!removal} disabled={api.busy} {...keys} onclick={() => remove(row)}>Delete</button>
						<button type="button" disabled={api.busy} {...keys} onclick={() => startRename(row)}>Rename</button>
						<button type="button" aria-expanded={paramsOpen} aria-controls="ideacad-feature-params" {...keys} onclick={() => { paramsOpen = !paramsOpen; if (paramsOpen) void openParams(); }}>Parameters</button>
					</div>
					{#if reasons.length}<p class="why">{#each reasons as reason (reason)}<span>{reason}</span>{/each}</p>{/if}
				{/if}
			</li>
		{/each}
	</ol>
	{#if selectedRow && paramsOpen}<div class="params-host" id="ideacad-feature-params" bind:this={paramsEl}><FeatureParams {api} featureId={selectedRow.id} /></div>{/if}
</section>
<style>
	.tree{display:flex;flex-direction:column;min-height:0;height:100%;font-family:Rajdhani,sans-serif;color:var(--text-1)}h2{margin:0;padding:8px 10px;font-size:17px;border-bottom:1px solid var(--boundary);flex-shrink:0}h2 .count{color:var(--text-2);font:12px 'Share Tech Mono',monospace;margin-left:6px}.empty{margin:0;padding:12px 10px;color:var(--text-2);font-size:14px}
	ol{list-style:none;margin:0;padding:4px;overflow:auto;min-height:0;flex:1 1 auto}li{border-radius:4px;border-top:2px solid transparent;border-bottom:2px solid transparent;position:relative}li.selected{background:var(--green-tint,color-mix(in srgb,var(--green) 12%,var(--surface-1)))}li.editing{box-shadow:inset var(--ic-rail,3px) 0 0 var(--green)}li.dragging{opacity:.5}li.drop-before{border-top-color:var(--green)}li.drop-after{border-bottom-color:var(--green)}li.drop-refused.drop-before{border-top-color:var(--ic-fail-ink,#e07474)}li.drop-refused.drop-after{border-bottom-color:var(--ic-fail-ink,#e07474)}
	.line{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px;align-items:stretch}
	.row{min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;column-gap:8px;row-gap:2px;align-items:center;min-height:44px;padding:5px 8px;background:transparent;border:1px solid transparent;border-radius:4px;color:inherit;font:600 15px Rajdhani,sans-serif;text-align:left;cursor:pointer}/* A SELECTED ROW IS A SELECTION, NOT A MODE THAT IS ON. `.ic-root button[aria-pressed='true']` (ideacad.css) fills a pressed TOOL with the accent and dark ink; on a tree row the fill is overridden by the hover ground and the dark ink stayed, measured 1.27:1 on hover. The row keeps the list's own ink over the li's green tint. */.row[aria-pressed="true"]{background:transparent;color:inherit;border-color:transparent}.row:hover{background:var(--surface-2)}.row:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}
	.name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2}.summary{color:var(--text-2);font:12px 'Share Tech Mono',monospace;white-space:nowrap}.status{display:inline-flex;gap:4px;align-items:center;font:11px 'Share Tech Mono',monospace;letter-spacing:.05em;text-transform:uppercase;color:var(--green)}.kind{justify-self:end;font:11px 'Share Tech Mono',monospace;color:var(--text-2);white-space:nowrap}.editing-word{margin-left:6px;color:var(--green)}
	li.error .status{color:var(--ic-fail-ink,#e07474)}li.warning .status{color:var(--ic-warn,var(--amber))}li.suppressed .status,li.suppressed .name{color:var(--text-2)}
	.edit-sketch,.actions button{min-height:44px;min-width:44px;padding:0 10px;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:600 13px Rajdhani,sans-serif;cursor:pointer;white-space:nowrap}.edit-sketch{align-self:stretch}.edit-sketch.active{border-color:var(--green);color:var(--green)}.actions button:hover,.edit-sketch:hover{background:var(--surface-2)}.actions button:focus-visible,.edit-sketch:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}.actions button[aria-disabled="true"]{opacity:.5;border-style:dashed}.actions button:disabled{opacity:.4;cursor:default}
	.actions{display:flex;flex-wrap:wrap;gap:4px;padding:4px 6px 6px}.why{margin:0 8px 8px;display:grid;gap:4px;font-size:12px;line-height:1.4;color:var(--text-2)}
	.message{margin:0 8px 8px 8px;font-size:13px;line-height:1.4;color:var(--text-2)}li.error .message{color:var(--ic-fail-ink,#e07474)}li.warning .message{color:var(--ic-warn,var(--amber))}
	.rename{min-height:44px;width:100%;min-width:0;box-sizing:border-box;padding:0 8px;border:1px solid var(--green);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:600 15px Rajdhani,sans-serif}
	.params-host{flex:0 1 auto;max-height:55%;overflow:auto;border-top:1px solid var(--boundary);background:var(--surface-1)}
</style>
