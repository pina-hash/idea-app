<script lang="ts">
	/**
	 * THE DESIGN TREE, SHAPED LIKE SOLIDWORKS' FEATUREMANAGER. At the top the
	 * reference geometry every part has (Front, Top and Right planes and the
	 * Origin, `tree/references.ts`), each with an eye; under it the features in
	 * build order, each consumed sketch NESTED under the feature made from it
	 * (`nestRows`), collapsed until opened. `FeatureParams` sits beneath the
	 * list for the selected feature.
	 *
	 * A QUIET ROW IS AN ICON AND A NAME. The status glyph and its word appear
	 * only when a row is not OK, and the kernel's sentence sits on the row when
	 * it has one. Everything a row can do lives in ONE menu, opened from the
	 * "⋯" control on the selected row or by a right-click on any row; the
	 * browser's own menu never opens here.
	 *
	 * SELECTING A ROW SELECTS THE GEOMETRY IT MADE AND THE FEATURE ITSELF
	 * (`rowSelections`). Hovering a row asks the workspace to light that
	 * geometry, and geometry the workspace says the pointer is over lights its
	 * row, when the workspace offers either (`tree/api.ts`).
	 *
	 * RENAMING IS IN PLACE: F2, a second press on the name of an already
	 * selected row after a pause (SolidWorks' slow double-click), or the menu.
	 * Enter and a blur commit, Escape cancels. A fast double-click EDITS: a
	 * sketch opens for editing, any other feature puts focus in its first
	 * parameter.
	 *
	 * EVERY REFUSAL IS THE REDUCER'S OWN SENTENCE, before or after the press. A
	 * refused menu entry is shown `aria-disabled` with its reason under it, a
	 * drop outside the legal range is marked before it lands, and a node that
	 * moves carries its nested sketches in steps the reducer checks first
	 * (`planNodeMove`). Nothing here restates `reorderRange` or the dependents
	 * rule.
	 *
	 * THE ROLLBACK BAR IS DRAWN ONLY WHEN THE WORKSPACE CAN ROLL BACK, and its
	 * position is workspace state: it never enters the manifest, so dragging it
	 * is never a history row or a save.
	 *
	 * THE DELETE KEY IS ANSWERED HERE AND STOPPED. The workspace's own window
	 * handler deletes the SELECTION, which for a tree row is the feature plus
	 * every body it made, and a body whose creating feature is being removed is
	 * a reference the replay then cannot find. The tree removes the feature and
	 * stops the event from reaching the window.
	 */
	import { onMount, tick, untrack } from 'svelte';
	import FeatureParams from './FeatureParams.svelte';
	import RowMenu from './tree/RowMenu.svelte';
	import RollbackBar from './tree/RollbackBar.svelte';
	import { TYPE_LABELS, newFeatureId } from './features';
	import { STATUS_WORDS, SLOW_RENAME_MS, deleteRefusal, nestRows, nodeMembers, nodeMoveOptions, planNodeMove, refusalFor, rollbackIndexAt, rollbackPosition, rolledBack, rowForSelection, rowSelections, selectedFeatureId, visibleRows, type NodeMove, type TreeNode } from './tree/rows';
	import { REFERENCE_ROWS, onPlanesChange, planesVisible, setPlanesVisible, type ReferenceRow } from './tree/references';
	import { TREE_ICONS, featureIcon } from './tree/icons';
	import { treeApi, type TreeMenuItem, type TreeMenuRequest } from './tree/api';
	import type { WorkspaceApi } from './workspace-api';
	import type { FeatureRow, SolidCommand } from './types';
	let { api }: { api: WorkspaceApi } = $props();
	const tree = $derived(treeApi(api));
	const rows = $derived(api.model.features);
	const nodes = $derived(nestRows(rows, api.manifest.features));
	const parentOf = $derived(new Map(nodes.flatMap((n) => n.children.map((c) => [c.id, n.row.id] as const))));
	const nesting = $derived(nodes.some((n) => n.children.length > 0));
	const selectedId = $derived(selectedFeatureId(api.selections, rows));
	const selectedRow = $derived(rows.find((r) => r.id === selectedId) ?? null);
	const editable = $derived(api.canWrite && !api.busy);
	/* Collapsed by default, like SolidWorks. A row opened or closed by hand keeps that; a nested row that becomes selected opens its parent once. */
	let expanded = $state<Record<string, boolean>>({});
	const isOpen = (id: string) => expanded[id] ?? false;
	const visible = $derived(visibleRows(nodes, isOpen));
	/* Roving focus over every row a reader can see, references first. A reference's focus key is `ref:<key>`. */
	let focusedKey = $state<string | null>(null);
	const keys = $derived([...REFERENCE_ROWS.map((r) => `ref:${r.key}`), ...visible.map((r) => r.id)]);
	const focusKey = $derived(focusedKey && keys.includes(focusedKey) ? focusedKey : (selectedId && keys.includes(selectedId) ? selectedId : (keys[0] ?? null)));
	let menu = $state<TreeMenuRequest | null>(null), menuTrigger: HTMLElement | null = null;
	let renaming = $state<string | null>(null), renameValue = $state('');
	let renameTimer: ReturnType<typeof setTimeout> | null = null;
	let dragging = $state<string | null>(null), dropAt = $state<{ id: string; before: boolean; plan: NodeMove } | null>(null);
	let barPreview = $state<number | null>(null), barLocal = $state<number | null>(null);
	let linked = $state<string | null>(null);
	let planesVersion = $state(0);
	let listEl = $state<HTMLOListElement>(), paramsEl = $state<HTMLElement>(), sectionEl = $state<HTMLElement>();
	/* The parameter form folds to its heading and stays folded across selections until opened again; "Edit parameters" and Enter open it. */
	let paramsOpen = $state(true);
	const planesOn = $derived.by(() => { void planesVersion; return planesVisible(api.model); });
	const canRollback = $derived(typeof tree.rollback === 'function');
	const barIndex = $derived(tree.rollbackIndex !== undefined ? tree.rollbackIndex : barLocal);
	const barPosition = $derived(rollbackPosition(nodes, barIndex));
	const barText = $derived(barPosition >= nodes.length ? 'Everything is built' : `Rolled back before ${nodes[barPosition].row.name}`);
	/** A pattern row draws its own mode; every other row its type's drawing. */
	function rowIcon(row: FeatureRow) {
		const f = row.type === 'pattern' ? api.manifest.features.find((x) => x.id === row.id) : undefined;
		return featureIcon(row.type, f && f.type === 'pattern' ? f.mode : undefined);
	}

	onMount(() => onPlanesChange(() => { planesVersion++; }));
	/* What the pointer is over in the viewport lights its row, when the workspace says. Track the transport, untrack the call. */
	$effect(() => {
		const subscribe = tree.onHover;
		if (typeof subscribe !== 'function') return;
		const off = untrack(() => subscribe.call(api, (hovered) => { linked = rowForSelection(hovered, api.model.features); }));
		return () => { if (typeof off === 'function') off(); linked = null; };
	});
	/* A nested row that becomes selected opens its parent, once, and the selected row scrolls into view, as SolidWorks does for a pick in the viewport. */
	let revealed: string | null = null;
	$effect(() => {
		const id = selectedId, parent = id ? parentOf.get(id) : undefined;
		if (id === revealed) return;
		revealed = id;
		untrack(() => { if (parent && expanded[parent] === undefined) expanded[parent] = true; });
		if (id) void tick().then(() => (listEl?.querySelector(`[data-row="${id}"] > .line`) as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' }));
	});

	async function run(command: SolidCommand, label: string) {
		try { await api.apply(command, label); } catch (error) { api.error(error instanceof Error ? error.message : String(error)); }
	}
	/** A press the reducer would refuse says so where every refusal shows, and sends nothing. */
	async function attempt(command: SolidCommand, label: string, refusal: string | null = refusalFor(api.manifest, command)) {
		if (refusal) { api.error(refusal); return; }
		await run(command, label);
	}
	/** Every step of a node move, in order, stopping at the first that does not land. */
	async function steps(plan: NodeMove, label: string) {
		if (plan.refusal || !plan.commands) { api.error(plan.refusal ?? ''); return; }
		for (const command of plan.commands) {
			const before = api.manifest.features.map((f) => f.id).join();
			await run(command, label);
			if (api.manifest.features.map((f) => f.id).join() === before) return;
		}
	}
	function pick(row: FeatureRow) { rowSelections(row).forEach((s, i) => api.select(s, i > 0)); focusedKey = row.id; }
	function pickRef(ref: ReferenceRow) { api.select(ref.selection); focusedKey = `ref:${ref.key}`; }
	const refSelected = (ref: ReferenceRow) => api.selections.some((s) => s.kind === 'reference' && s.id === ref.selection.id);
	function toggle(id: string) { expanded[id] = !isOpen(id); }
	function remove(row: FeatureRow) { void attempt({ type: 'remove-feature', id: row.id }, `Delete ${row.name}`); }
	function suppress(row: FeatureRow) { void run({ type: 'suppress-feature', id: row.id, suppressed: !row.suppressed }, `${row.suppressed ? 'Unsuppress' : 'Suppress'} ${row.name}`); }
	function moveNode(row: FeatureRow, plan: NodeMove) { void steps(plan, `Move ${row.name}`); }
	function editRow(row: FeatureRow) { if (row.type === 'sketch') api.editSketch(api.editingSketch === row.id ? null : row.id); else void openParams(); }
	async function sketchOn(ref: ReferenceRow) {
		if (!ref.datum) return;
		const id = newFeatureId();
		await run({ type: 'add-feature', feature: { id, name: '', type: 'sketch', plane: { kind: 'datum', datum: ref.datum }, entities: [], constraints: [] } }, `Sketch on ${ref.name}`);
		if (api.model.features.some((f) => f.id === id)) api.editSketch(id);
	}

	/* RENAME. */
	function cancelSlowRename() { if (renameTimer) { clearTimeout(renameTimer); renameTimer = null; } }
	function startRename(row: FeatureRow) {
		cancelSlowRename();
		if (!editable) return;
		renaming = row.id; renameValue = row.name;
		void tick().then(() => (listEl?.querySelector(`[data-row="${row.id}"] > .line input.rename`) as HTMLInputElement | null)?.select());
	}
	function finishRename(row: FeatureRow, commit: boolean) {
		if (renaming !== row.id) return;
		const name = renameValue.trim();
		if (commit && name && name !== row.name) {
			const command: SolidCommand = { type: 'rename-feature', id: row.id, name }, refusal = refusalFor(api.manifest, command);
			if (refusal) { api.error(refusal); return; }
			renaming = null; void run(command, `Rename ${row.name}`);
		} else renaming = null;
		void focusKeyed(row.id);
	}
	/** A second press on the NAME of a row that was already selected renames it after a pause, unless it turns out to be a double-click. */
	function rowClick(row: FeatureRow, e: MouseEvent) {
		const wasSelected = row.id === selectedId;
		cancelSlowRename();
		pick(row);
		if (wasSelected && e.detail <= 1 && (e.target as HTMLElement | null)?.closest?.('.name')) renameTimer = setTimeout(() => { renameTimer = null; startRename(row); }, SLOW_RENAME_MS);
	}
	function rowDoubleClick(row: FeatureRow) { cancelSlowRename(); if (row.type === 'sketch' && !api.canWrite) return; editRow(row); }

	async function focusKeyed(key: string) {
		await tick();
		const selector = key.startsWith('ref:') ? `[data-ref="${key.slice(4)}"] button.row` : `[data-row="${key}"] > .line button.row`;
		(sectionEl?.querySelector(selector) as HTMLElement | null)?.focus();
	}
	async function openParams() {
		paramsOpen = true;
		await tick();
		(paramsEl?.querySelector('input:not([disabled]),select:not([disabled])') as HTMLElement | null)?.focus();
	}

	/* THE MENU. One list of entries per row, from the "⋯" control and from a right-click. */
	const REBUILDING = 'The model is rebuilding.';
	function menuFor(row: FeatureRow): TreeMenuItem[] {
		const items: TreeMenuItem[] = [];
		const busy = api.busy ? REBUILDING : null;
		items.push({ id: 'params', label: api.canWrite ? 'Edit parameters' : 'Parameters', icon: 'M4 6h10M4 12h16M4 18h7M17 3v6M11 15v6', run: () => { pick(row); void openParams(); } });
		if (!api.canWrite) return items;
		if (row.type === 'sketch') items.push({ id: 'edit-sketch', label: api.editingSketch === row.id ? 'Close sketch' : 'Edit sketch', icon: TREE_ICONS.sketch, refusal: api.editingSketch === row.id ? null : busy, run: () => editRow(row) });
		items.push({ id: 'rename', label: 'Rename', icon: 'M4 20h4L19 9l-4-4L4 16z', refusal: busy, run: () => { pick(row); startRename(row); } });
		items.push({ id: 'suppress', label: row.suppressed ? 'Unsuppress' : 'Suppress', icon: row.suppressed ? TREE_ICONS.eye : TREE_ICONS.eyeClosed, refusal: busy, run: () => suppress(row) });
		if (!parentOf.has(row.id)) {
			const moves = nodeMoveOptions(api.manifest, nodes, row.id);
			items.push({ id: 'up', label: 'Move up', icon: 'M12 19V5m-6 6 6-6 6 6', refusal: moves.up.refusal ?? busy, run: () => moveNode(row, moves.up) });
			items.push({ id: 'down', label: 'Move down', icon: 'M12 5v14m-6-6 6 6 6-6', refusal: moves.down.refusal ?? busy, run: () => moveNode(row, moves.down) });
		}
		items.push({ id: 'delete', label: 'Delete', icon: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', refusal: deleteRefusal(api.manifest, row.id) ?? busy, run: () => remove(row) });
		return items;
	}
	function menuForRef(ref: ReferenceRow): TreeMenuItem[] {
		const items: TreeMenuItem[] = [];
		if (ref.datum && api.canWrite) items.push({ id: 'sketch', label: 'Sketch', icon: TREE_ICONS.sketch, refusal: api.busy ? REBUILDING : null, run: () => void sketchOn(ref) });
		items.push({ id: 'planes', label: planesOn ? 'Hide planes' : 'Show planes', icon: planesOn ? TREE_ICONS.eyeClosed : TREE_ICONS.eye, run: () => setPlanesVisible(!planesOn) });
		return items;
	}
	function openMenu(label: string, items: TreeMenuItem[], x: number, y: number, trigger: HTMLElement | null) {
		menuTrigger = trigger;
		const request: TreeMenuRequest = { label, x, y, items, returnFocus: trigger };
		if (typeof tree.contextMenu === 'function') { tree.contextMenu(request); return; }
		menu = request;
	}
	function closeMenu(restore: boolean) { menu = null; if (restore) menuTrigger?.focus(); menuTrigger = null; }
	/** Where a menu opens: at the pointer for a right-click, under the control otherwise. */
	function menuPoint(e: MouseEvent | KeyboardEvent, trigger: HTMLElement) {
		if (e.type === 'contextmenu' && 'clientX' in e && (e.clientX || e.clientY)) return { x: e.clientX, y: e.clientY };
		const box = trigger.getBoundingClientRect();
		return { x: box.right, y: box.bottom };
	}
	function rowMenu(row: FeatureRow, e: MouseEvent | KeyboardEvent, trigger: HTMLElement) {
		e.preventDefault(); e.stopPropagation(); cancelSlowRename();
		if (row.id !== selectedId) pick(row);
		const at = menuPoint(e, trigger);
		openMenu(`${row.name} actions`, menuFor(row), at.x, at.y, trigger);
	}
	function refMenu(ref: ReferenceRow, e: MouseEvent | KeyboardEvent, trigger: HTMLElement) {
		e.preventDefault(); e.stopPropagation();
		if (!refSelected(ref)) pickRef(ref);
		const at = menuPoint(e, trigger);
		openMenu(`${ref.name} actions`, menuForRef(ref), at.x, at.y, trigger);
	}

	/* KEYS, over every visible row. */
	function keydown(e: KeyboardEvent) {
		const at = keys.indexOf(focusKey ?? ''), key = keys[at];
		const row = key && !key.startsWith('ref:') ? rows.find((r) => r.id === key) : undefined;
		const ref = key?.startsWith('ref:') ? REFERENCE_ROWS.find((r) => `ref:${r.key}` === key) : undefined;
		const go = (next: string | undefined) => {
			if (!next) return;
			if (next.startsWith('ref:')) { const r = REFERENCE_ROWS.find((x) => `ref:${x.key}` === next); if (r) pickRef(r); }
			else { const r = rows.find((x) => x.id === next); if (r) pick(r); }
			void focusKeyed(next);
		};
		const parent = row ? parentOf.get(row.id) : undefined;
		const node = row ? nodes.find((n) => n.row.id === row.id) : undefined;
		if (e.key === 'ArrowDown') go(keys[at + 1]);
		else if (e.key === 'ArrowUp') go(keys[at - 1]);
		else if (e.key === 'Home') go(keys[0]);
		else if (e.key === 'End') go(keys[keys.length - 1]);
		else if (e.key === 'ArrowRight' && node?.children.length) { if (!isOpen(node.row.id)) toggle(node.row.id); else go(node.children[0].id); }
		else if (e.key === 'ArrowLeft' && (parent || (node?.children.length && isOpen(node.row.id)))) { if (parent) go(parent); else toggle(node!.row.id); }
		else if (e.key === 'Enter') { if (row) { pick(row); void openParams(); } else if (ref) pickRef(ref); }
		else if (e.key === 'F2') { if (row && editable) { pick(row); startRename(row); } }
		else if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') { if (row) rowMenu(row, e, e.currentTarget as HTMLElement); else if (ref) refMenu(ref, e, e.currentTarget as HTMLElement); return; }
		else if (e.key === 'Delete' || e.key === 'Backspace') { if (row && api.canWrite) remove(row); }
		else return;
		e.preventDefault(); e.stopPropagation();
	}

	/* HOVER, to the workspace. */
	function hoverRow(row: FeatureRow | null) { tree.hover?.(row ? rowSelections(row) : null); }
	function hoverRef(ref: ReferenceRow | null) { tree.hover?.(ref ? [ref.selection] : null); }

	/* DRAG A NODE. The reducer decides; the affordance asks `planNodeMove` so a refused target is marked before the drop lands. */
	function dragStart(node: TreeNode, e: DragEvent) {
		if (!editable) { e.preventDefault(); return; }
		cancelSlowRename();
		dragging = node.row.id; e.dataTransfer?.setData('text/plain', node.row.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}
	function dragOver(target: TreeNode, position: number, e: DragEvent) {
		if (!dragging) return;
		e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		const from = nodes.findIndex((n) => n.row.id === dragging), line = (e.currentTarget as HTMLElement).querySelector(':scope > .line')?.getBoundingClientRect();
		/* Above the row's own line's midline inserts before it; without a laid-out box (a test), a node above the source is "before" and one below is "after". */
		const before = line && line.height > 0 ? e.clientY < line.top + line.height / 2 : position < from;
		if (dropAt?.id === target.row.id && dropAt.before === before) return;
		const source = nodes[from];
		const plan: NodeMove = !source || source.row.id === target.row.id ? { commands: [], refusal: null } : planNodeMove(api.manifest, nodeMembers(source), nodeMembers(target), before ? 'before' : 'after');
		dropAt = { id: target.row.id, before, plan };
	}
	function drop(target: TreeNode, e: DragEvent) {
		e.preventDefault();
		const id = dragging, at = dropAt; dragging = null; dropAt = null;
		if (!id || !at || at.id !== target.row.id) return;
		if (at.plan.commands && !at.plan.commands.length && !at.plan.refusal) return;
		void steps(at.plan, `Move ${rows.find((r) => r.id === id)?.name ?? 'feature'}`);
	}
	function dragEnd() { dragging = null; dropAt = null; }

	/* THE ROLLBACK BAR. */
	function locate(clientY: number): number {
		const lines = [...(listEl?.querySelectorAll(':scope > li > .line') ?? [])].map((l) => l.getBoundingClientRect());
		return lines.filter((r) => r.top + r.height / 2 < clientY).length;
	}
	async function setBar(position: number) {
		const index = rollbackIndexAt(nodes, position);
		barLocal = index;
		try { await tree.rollback?.(index); } catch (error) { api.error(error instanceof Error ? error.message : String(error)); }
		await tick();
		(sectionEl?.querySelector('[data-testid="ideacad-rollback-bar"]') as HTMLElement | null)?.focus();
	}
</script>
{#snippet icon(d: string)}<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path {d} /></svg>{/snippet}
{#snippet bar()}<RollbackBar position={barPosition} count={nodes.length} valueText={barText} {locate} onpreview={(p) => (barPreview = p)} onset={(p) => void setBar(p)} />{/snippet}
{#snippet line(row: FeatureRow, node: TreeNode | null)}
	{@const status = STATUS_WORDS[row.status]}
	{@const selected = row.id === selectedId}
	{@const editing = api.editingSketch === row.id}
	{@const open = !!node && isOpen(row.id)}
	<div class="line">
		{#if node?.children.length}<button class="caret" type="button" tabindex="-1" aria-expanded={open} aria-controls={`ideacad-tree-children-${row.id}`} aria-label={`${open ? 'Collapse' : 'Expand'} ${row.name}`} onclick={() => toggle(row.id)}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg></button>{:else if nesting}<span class="lead" class:branch={!node} aria-hidden="true"></span>{/if}
		{#if renaming === row.id}
			<input class="rename" aria-label={`New name for ${row.name}`} bind:value={renameValue} onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); finishRename(row, true); } else if (e.key === 'Escape') { e.preventDefault(); finishRename(row, false); } e.stopPropagation(); }} onblur={() => finishRename(row, true)} />
		{:else}
			<button class="row" type="button" tabindex={row.id === focusKey ? 0 : -1} aria-pressed={selected} draggable={editable && !!node} onkeydown={keydown} onclick={(e) => rowClick(row, e)} ondblclick={() => rowDoubleClick(row)} oncontextmenu={(e) => rowMenu(row, e, e.currentTarget as HTMLElement)} onpointerenter={() => hoverRow(row)} onpointerleave={() => hoverRow(null)} ondragstart={(e) => { if (node) dragStart(node, e); else e.preventDefault(); }} ondragend={dragEnd}>
				{@render icon(rowIcon(row))}
				<span class="name">{row.name}</span>
				<span class="summary">{row.summary}</span>
				{#if row.status !== 'ok'}<span class="status"><span class="glyph" aria-hidden="true">{status.glyph}</span>{status.word}</span>{/if}
				{#if editing}<span class="editing-word">Editing</span>{/if}
				<span class="sr-only">{TYPE_LABELS[row.type]}{rolledBack(row, barIndex) ? ', rolled back' : ''}</span>
			</button>
		{/if}
		{#if selected && api.canWrite && renaming !== row.id}<button class="row-more" type="button" aria-haspopup="menu" aria-expanded={!!menu} aria-label={`${row.name} actions`} onclick={(e) => rowMenu(row, e, e.currentTarget as HTMLElement)}>⋯</button>{/if}
	</div>
	{#if row.message}<p class="message" role={row.status === 'error' ? 'alert' : 'status'}>{row.message}</p>{/if}
{/snippet}
<section class="tree" aria-label="Design tree" data-testid="ideacad-feature-tree" bind:this={sectionEl}>
	<h2>Features <span class="count">{rows.length}</span></h2>
	<div class="scroll">
		<ul class="refs" aria-label="Reference geometry">
			{#each REFERENCE_ROWS as ref (ref.key)}
				{@const selected = refSelected(ref)}
				<li class:selected class:linked={linked === ref.selection.id} data-ref={ref.key}>
					<div class="line">
						{#if nesting}<span class="lead" aria-hidden="true"></span>{/if}
						<button class="row" type="button" tabindex={`ref:${ref.key}` === focusKey ? 0 : -1} aria-pressed={selected} onkeydown={keydown} onclick={() => pickRef(ref)} oncontextmenu={(e) => refMenu(ref, e, e.currentTarget as HTMLElement)} onpointerenter={() => hoverRef(ref)} onpointerleave={() => hoverRef(null)}>
							{@render icon(ref.datum ? TREE_ICONS.plane : TREE_ICONS.origin)}
							<span class="name">{ref.name}</span>
						</button>
						<button class="eye" type="button" aria-pressed={planesOn} aria-label={planesOn ? 'Hide planes' : 'Show planes'} onclick={() => setPlanesVisible(!planesOn)}>{@render icon(planesOn ? TREE_ICONS.eye : TREE_ICONS.eyeClosed)}</button>
					</div>
				</li>
			{/each}
		</ul>
		<ol bind:this={listEl} aria-label="Features in order">
			{#each nodes as node, position (node.row.id)}
				{@const row = node.row}
				<li class={row.status} class:selected={row.id === selectedId} class:editing={api.editingSketch === row.id} class:linked={linked === row.id || (!isOpen(row.id) && node.children.some((c) => c.id === linked))} class:rolled-back={rolledBack(row, barIndex)} class:dragging={dragging === row.id} class:drop-before={dropAt?.id === row.id && dropAt.before} class:drop-after={dropAt?.id === row.id && !dropAt.before} class:drop-refused={dropAt?.id === row.id && !!dropAt.plan.refusal} class:bar-before={barPreview === position} class:bar-after={barPreview === nodes.length && position === nodes.length - 1} data-row={row.id} ondragover={(e) => dragOver(node, position, e)} ondrop={(e) => drop(node, e)}>
					{#if canRollback && barPosition === 0 && position === 0}{@render bar()}{/if}
					{@render line(row, node)}
					{#if node.children.length}
						<ol class="children" id={`ideacad-tree-children-${row.id}`} hidden={!isOpen(row.id)} aria-label={`${row.name} is made from`}>
							{#each node.children as child (child.id)}
								<li class={child.status} class:selected={child.id === selectedId} class:editing={api.editingSketch === child.id} class:linked={linked === child.id && isOpen(row.id)} class:rolled-back={rolledBack(child, barIndex)} data-row={child.id}>
									{@render line(child, null)}
								</li>
							{/each}
						</ol>
					{/if}
					{#if canRollback && barPosition === position + 1}{@render bar()}{/if}
				</li>
			{/each}
		</ol>
		{#if canRollback && !nodes.length}{@render bar()}{/if}
	</div>
	{#if selectedRow}<div class="params-host" id="ideacad-feature-params" bind:this={paramsEl}><FeatureParams {api} featureId={selectedRow.id} bind:open={paramsOpen} /></div>{/if}
	{#if menu}<RowMenu request={menu} onclose={closeMenu} onrefused={(reason) => api.error(reason)} />{/if}
</section>
<style>
	.tree{display:flex;flex-direction:column;min-height:0;height:100%;font-family:Rajdhani,sans-serif;color:var(--text-1)}h2{margin:0;padding:8px 10px;font-size:17px;border-bottom:1px solid var(--hairline);flex-shrink:0}h2 .count{color:var(--text-2);font:12px 'Share Tech Mono',monospace;margin-left:6px}
	.scroll{overflow:auto;min-height:0;flex:1 1 auto;padding:4px}
	ul,ol{list-style:none;margin:0;padding:0}/* A folded list is not rendered, and says so to every descendant: `hidden` alone leaves a row's own computed style reading visible. */ol.children[hidden]{visibility:hidden}.refs{padding-bottom:4px;margin-bottom:4px;border-bottom:1px solid var(--hairline)}
	li{border-radius:4px;position:relative}li.selected>.line{background:var(--green-tint,color-mix(in srgb,var(--green) 12%,var(--surface-1)))}li.editing>.line{box-shadow:inset var(--ic-rail,3px) 0 0 var(--green)}li.linked>.line{box-shadow:inset var(--ic-rail,3px) 0 0 var(--cyan);background:var(--surface-2)}li.dragging{opacity:.5}
	/* WHERE A DROP OR THE BAR WILL LAND: a line drawn over the edge between two rows, so marking it moves nothing. */
	li.drop-before::before,li.drop-after::after,li.bar-before::before,li.bar-after::after{content:'';position:absolute;left:0;right:0;height:3px;border-radius:2px;background:var(--green);pointer-events:none;z-index:1}li.drop-before::before,li.bar-before::before{top:-2px}li.drop-after::after,li.bar-after::after{bottom:-2px}li.drop-refused::before,li.drop-refused::after{background:var(--ic-fail-ink,#e07474)}li.bar-before::before,li.bar-after::after{background:var(--cyan)}
	li.rolled-back>.line .icon,li.rolled-back>.line .name,li.rolled-back>.line .summary{opacity:.55}li.rolled-back>.line .name{font-style:italic}
	.line{display:flex;align-items:stretch;gap:2px;min-width:0;border-radius:4px}
	.lead,.caret{flex:0 0 44px;width:44px;min-height:44px}.lead.branch{position:relative}.lead.branch::before{content:'';position:absolute;left:21px;top:0;height:50%;width:22px;border-left:1px solid var(--text-3);border-bottom:1px solid var(--text-3);border-bottom-left-radius:4px}
	.caret{display:grid;place-items:center;padding:0;border:1px solid transparent;border-radius:4px;background:transparent;box-shadow:none;color:var(--text-2);cursor:pointer}.caret[aria-expanded="true"] svg{transform:rotate(90deg)}.caret:hover{background:var(--surface-2);color:var(--text-1);border-color:transparent}.caret:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}
	@media(prefers-reduced-motion:no-preference){.caret svg{transition:transform .12s ease}}
	.row{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:8px;min-height:44px;padding:4px 8px;box-sizing:border-box;background:transparent;border:1px solid transparent;border-radius:4px;box-shadow:none;color:inherit;font:600 15px Rajdhani,sans-serif;text-align:left;cursor:pointer}li li .row{padding-left:4px}/* A SELECTED ROW IS A SELECTION, NOT A MODE THAT IS ON. `.ic-root button[aria-pressed='true']` (ideacad.css) fills a pressed TOOL with the accent and dark ink; on a tree row the fill is overridden by the hover ground and the dark ink stayed, measured 1.27:1 on hover. The row keeps the list's own ink over the li's green tint. */.row[aria-pressed="true"]{background:transparent;color:inherit;border-color:transparent}.row:hover{background:var(--surface-2);border-color:transparent}.row:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}
	.icon{flex-shrink:0;color:var(--text-2)}li.selected>.line .icon{color:var(--green)}/* The selected row's numbers are in the form under the list, so its summary gives the name the room. */li.selected>.line .summary{display:none}
	/* THE NAME OUTLASTS THE NUMBER: the summary gives way first, down to nothing, and only then does the name ellipsize, never below a few letters. A status word never gives way. */.name{flex:1 1 auto;min-width:2.6em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2}.summary{flex:0 1000 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;color:var(--text-2);font:12px 'Share Tech Mono',monospace;white-space:nowrap}.status{flex-shrink:0;display:inline-flex;gap:4px;align-items:center;font:11px 'Share Tech Mono',monospace;letter-spacing:.05em;text-transform:uppercase}.editing-word{flex-shrink:0;font:11px 'Share Tech Mono',monospace;letter-spacing:.05em;text-transform:uppercase;color:var(--green)}
	li.error>.line .status{color:var(--ic-fail-ink,#e07474)}li.warning>.line .status{color:var(--ic-warn,var(--amber))}li.suppressed>.line .status,li.suppressed>.line .name{color:var(--text-2)}
	.row-more,.eye{flex:0 0 44px;width:44px;min-height:44px;display:grid;place-items:center;padding:0;border:1px solid transparent;border-radius:4px;background:transparent;box-shadow:none;color:var(--text-2);font:700 18px Rajdhani,sans-serif;cursor:pointer}.row-more:hover,.eye:hover{background:var(--surface-2);color:var(--text-1);border-color:transparent}.row-more:focus-visible,.eye:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}.row-more{color:var(--text-1);border-color:var(--boundary)}.eye[aria-pressed="false"]{color:var(--text-3)}.eye[aria-pressed="true"]{background:transparent;color:var(--text-2);border-color:transparent}
	.message{margin:0 8px 8px 8px;font-size:13px;line-height:1.4;color:var(--text-2)}li.error>.message{color:var(--ic-fail-ink,#e07474)}li.warning>.message{color:var(--ic-warn,var(--amber))}
	.rename{flex:1 1 auto;min-height:44px;width:100%;min-width:0;box-sizing:border-box;padding:0 8px;border:1px solid var(--green);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:600 15px Rajdhani,sans-serif}
	.sr-only{position:absolute;left:0;top:0;width:1px;height:1px;margin:0;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
	.params-host{flex:0 1 auto;max-height:45%;overflow:auto;border-top:1px solid var(--hairline);background:var(--surface-1)}
</style>
