<script lang="ts">
	/**
	 * THE SKETCH EDITOR PANEL: the tools, the selection, the constraints and
	 * the closed regions of the sketch open for editing, its solve status in
	 * words, and Done.
	 *
	 * EVERY EDIT IS `api.apply({type:'set-feature', id, patch:{entities,
	 * constraints}}, label)` AND NOTHING ELSE. The pure module
	 * (`sketch/editor.ts`) builds the next entity list from the SOLVED
	 * entities the projection carries, so the stored coordinates follow the
	 * solver and a moved point is where the student left it; the engine
	 * re-solves on the replay the patch causes. Edits are applied one after
	 * another through a promise chain, because `api.apply` drops a command
	 * that arrives while a replay is running and a dropped trim is a trim the
	 * student watched not happen.
	 *
	 * POINTER INPUT arrives through `api.setSketchPointer`, installed on mount
	 * and removed on destroy, in the plane's own (u, v). Every press is
	 * consumed while a sketch is open, so the workspace's drag-to-draw tools
	 * never start a SECOND sketch under the one being edited. Tolerances are
	 * pixels turned into inches through `api.project` on two lifted points, so
	 * a pick feels the same at every zoom.
	 *
	 * THE EDITING LOOK IS DRAWN THROUGH `api.guide`: cleared and rebuilt from
	 * `editingGuides` whenever the sketch, the selection, the hover or a
	 * drawing in progress changes. The effect tracks those inputs and calls
	 * the injected `api` untracked, as CLAUDE.md requires of an effect that
	 * calls caller-supplied code.
	 *
	 * NOTHING IS CLAMPED. The polygon side count, the fillet radius, a
	 * dimension value and an extrude distance are typed as any number; what
	 * cannot be built is refused by a sentence through `api.error`, in the
	 * words of whichever layer refused it (the panel for a side count under
	 * three, the geometry for a fillet the lines cannot hold, the solver for
	 * a dimension the sketch cannot satisfy, the kernel for an extrude).
	 *
	 * Delete and Backspace are swallowed at the window while a sketch is
	 * open, selection or none: the workspace's own Delete removes the
	 * SELECTED FEATURE, which while editing is the sketch itself.
	 */
	import { onDestroy, onMount, untrack } from 'svelte';
	import type { WorkspaceApi } from './workspace-api';
	import type { FeatureOf, ResolvedPlane, SketchProjection } from './types';
	import { SketchSession, constraintLabel, constraintOffers, entityLabel, type Commit, type ConstraintOffer, type SessionContext, type SessionResult, type SketchTool } from './sketch/editor';
	import { inconsistentArcs, lift } from './sketch/model';
	import { editingGuides } from './viewport/sketch-layer';
	import { drawingSettings, polygonSidesOk, POLYGON_SIDES_REFUSAL } from './viewport/drawing';

	let { api }: { api: WorkspaceApi } = $props();
	const sketch = $derived(api.model.sketches.find((s) => s.feature === api.editingSketch) ?? null);
	const consumers = $derived(api.manifest.features.filter((f): f is FeatureOf<'extrude'> => f.type === 'extrude' && f.sketch === api.editingSketch));
	const words: Record<string, string> = { solved: 'Fully defined', underConstrained: 'Under defined', redundant: 'Over defined', unsatisfied: 'Cannot be solved', unsolved: 'Not solved' };
	const TOOLS: { id: SketchTool; word: string; hint: string; write: boolean }[] = [
		{ id: 'select', word: 'Select', hint: 'Click to select. Drag a point or an entity to move it; drop a point on another point to join them.', write: false },
		{ id: 'line', word: 'Line', hint: 'Click each corner. Click the first point to close, or press Enter to stop.', write: true },
		{ id: 'rectangle', word: 'Rectangle', hint: 'Drag from one corner to the opposite corner.', write: true },
		{ id: 'circle', word: 'Circle', hint: 'Drag from the center out to the radius.', write: true },
		{ id: 'arc', word: 'Arc', hint: 'Click the center, then the start, then swing round to where it ends. Hold Shift for the long way round.', write: true },
		{ id: 'polygon', word: 'Polygon', hint: 'Drag from the center to the first corner.', write: true },
		{ id: 'trim', word: 'Trim', hint: 'Click the part of a line, arc or circle to remove, between where it crosses others.', write: true },
		{ id: 'extend', word: 'Extend', hint: 'Click a line near the end to run on to the next entity.', write: true },
		{ id: 'fillet', word: 'Fillet', hint: 'Click a corner point, or two lines one after the other, to round the corner.', write: true }
	];
	const session = new SketchSession();
	/* Mirrors of the session for the template; the session is the state, these are what it reads as. */
	let tool = $state<SketchTool>('select'), selected = $state<string[]>([]), hovered = $state<string | null>(null), drawingNote = $state('');
	let published = '';
	let tick = $state(0);
	let sidesText = $state(String(drawingSettings.polygonSides)), filletText = $state('0.25'), extrudeText = $state('1');
	let chosenRegions = $state<string[]>([]);
	let chain: Promise<void> = Promise.resolve();
	const live = $derived(sketch ? selected.filter((id) => sketch.entities.some((e) => e.id === id)) : []);
	const offers = $derived<ConstraintOffer[]>(sketch && api.canWrite ? constraintOffers(sketch.entities, live) : []);
	const trouble = $derived(new Set(sketch?.solve.trouble ?? []));
	const activeTool = $derived(TOOLS.find((t) => t.id === tool) ?? TOOLS[0]);
	/* A hover id can outlive its entity by one commit (a fillet removes the corner under the pointer), so the note names only what is still there. */
	const hoverNote = $derived(sketch && hovered && sketch.entities.some((e) => e.id === hovered) ? `${entityLabel(sketch.entities, hovered)} under the pointer` : '');
	/**
	 * AN ARC WHOSE ENDS SIT AT DIFFERENT DISTANCES FROM ITS CENTER, SAID OUT
	 * LOUD WHERE THE STUDENT IS WORKING. The arc TOOL can no longer make one,
	 * but dragging an arc's end point in Select still can, and what happens
	 * next is otherwise unreadable: the extrude refuses in the kernel's words
	 * (`edge vertices do not agree with its authoritative curve trim`), and
	 * adding any constraint anywhere in the sketch makes the solver pull the
	 * end back onto the radius, moving whatever shares that point with it.
	 *
	 * IT IS A NOTICE AND NEVER A REFUSAL, deliberately. The same check at the
	 * document boundary -- `validateFeature`, which gates BOTH the save and
	 * the open -- would stop a sketch already carrying one from opening at
	 * all, which takes a sketch the student can still repair by hand and makes
	 * it unreachable. See the ledger entry for the measurements.
	 */
	const brokenArcs = $derived(sketch ? inconsistentArcs(sketch.entities) : []);
	const arcNotice = $derived(brokenArcs.length ? `${brokenArcs.length === 1 ? `${entityLabel(sketch!.entities, brokenArcs[0])} has` : `${brokenArcs.length} arcs have`} ends at different distances from the center, so ${brokenArcs.length === 1 ? 'it cannot' : 'they cannot'} be built. Drag an end back onto the arc, or delete ${brokenArcs.length === 1 ? 'it' : 'them'} and draw again.` : '');

	/** Pixels per sketch inch right now, from two lifted points: the one conversion every tolerance uses. */
	function pixelsPerInch(plane: ResolvedPlane) { const a = api.project(lift(plane, [0, 0])), b = api.project(lift(plane, [1, 0])); return Math.max(1e-6, Math.hypot(b.x - a.x, b.y - a.y)); }
	function context(s: SketchProjection | null = sketch, shift = false): SessionContext | null {
		if (!s) return null;
		const px = pixelsPerInch(s.plane);
		return { entities: s.entities, constraints: s.constraints, tolerance: 8 / px, snapRadius: 12 / px, polygonSides: drawingSettings.polygonSides, filletRadius: Number(filletText), shift, canWrite: api.canWrite };
	}
	/** Applies in order, and waits out a replay another panel started rather than letting `api.apply` drop the command. */
	function commit(c: Commit) {
		const id = api.editingSketch; if (!id) return;
		chain = chain.then(async () => { for (let i = 0; i < 200 && api.busy; i++) await new Promise((r) => setTimeout(r, 25)); await api.apply({ type: 'set-feature', id, patch: { entities: c.sketch.entities, constraints: c.sketch.constraints } }, c.label); }).catch(() => {});
	}
	function sync() {
		tool = session.tool; selected = [...session.selected]; hovered = session.hovered;
		drawingNote = session.tool === 'line' && session.anchorCount ? `${session.anchorCount} point${session.anchorCount === 1 ? '' : 's'} placed. Click the first point to close, or press Enter to stop.` : session.tool === 'arc' && session.anchorCount ? (session.anchorCount === 1 ? 'Center placed. Click where the arc starts.' : 'Start placed. Swing round to where it ends. Hold Shift for the long way round.') : session.pendingFillet && sketch ? `${entityLabel(sketch.entities, session.pendingFillet)} picked. Click the line it meets.` : '';
		tick++;
		const id = api.editingSketch, key = session.selected.join(','); if (!id || key === published) return;
		published = key;
		if (!session.selected.length) api.select({ bodyId: '', kind: 'sketch', id });
		else session.selected.forEach((entity, i) => api.select({ bodyId: '', kind: 'sketch-entity', id: `${id}/${entity}` }, i > 0));
	}
	function settle(result: SessionResult) {
		if (result.error) api.error(result.error);
		if (result.commit) commit(result.commit);
		if (result.changed || result.commit) sync();
	}
	function pointer(event: 'down' | 'move' | 'up', at: [number, number], e: PointerEvent): boolean {
		const ctx = context(sketch, e.shiftKey); if (!ctx) return false;
		settle(event === 'down' ? session.down(at, ctx) : event === 'move' ? session.move(at, ctx) : session.up(at, ctx));
		return true;
	}
	function keydown(e: KeyboardEvent) {
		/* The target is the window itself when a key is dispatched there, and the window has no `closest`. */
		const target = e.target as { closest?: (selector: string) => Element | null } | null;
		if (!sketch || target?.closest?.('input,textarea,select,[contenteditable=true]')) return;
		const key = e.key === 'Escape' ? 'Escape' : e.key === 'Enter' ? 'Enter' : e.key === 'Delete' || e.key === 'Backspace' ? 'Delete' : null;
		if (!key) return;
		const ctx = context(); if (!ctx) return;
		const result = session.key(key, ctx);
		if (key === 'Delete' || result.changed || result.commit || result.error) { e.preventDefault(); e.stopImmediatePropagation(); }
		settle(result);
		/* An Escape with nothing to cancel reaches the viewport, whose own cancel clears the guide group; redraw so the editing marks do not vanish with it. */
		if (key === 'Escape' && !result.changed) sync();
	}
	function setTool(next: SketchTool) { session.setTool(next); sync(); }
	function redraw(s: SketchProjection | null, sel: string[], hov: string | null) {
		api.clearGuides();
		if (!s) return;
		const ctx = context(s); if (!ctx) return;
		const size = 7 / pixelsPerInch(s.plane);
		for (const g of editingGuides(s, { selected: sel, hovered: hov, size, preview: session.preview(ctx) })) api.guide(g.points, g.color);
	}
	function deleteSelected() { const ctx = context(); if (ctx) settle(session.key('Delete', ctx)); }
	function setSides(text: string) {
		sidesText = text;
		const n = Number(text.trim());
		if (!polygonSidesOk(n)) { api.error(POLYGON_SIDES_REFUSAL); return; }
		drawingSettings.polygonSides = n;
	}
	function addConstraint(offer: ConstraintOffer, text?: string) {
		const s = sketch; if (!s) return;
		let value: number | undefined;
		if (offer.value !== undefined) { value = Number((text ?? '').trim()); if (text === undefined || text.trim() === '' || !Number.isFinite(value)) { api.error(`Enter a number for ${offer.label.toLowerCase()}.`); return; } }
		commit({ label: `Add ${offer.label.toLowerCase()}`, sketch: { entities: [...s.entities], constraints: [...s.constraints, ...offer.build(value)] } });
	}
	function removeConstraint(id: string) { const s = sketch; if (!s) return; commit({ label: 'Remove constraint', sketch: { entities: [...s.entities], constraints: s.constraints.filter((c) => c.id !== id) } }); }
	function setConstraintValue(id: string, text: string) {
		const s = sketch; if (!s) return;
		const value = Number(text.trim()); if (text.trim() === '' || !Number.isFinite(value)) { api.error('Enter a number for the dimension.'); return; }
		commit({ label: 'Set dimension', sketch: { entities: [...s.entities], constraints: s.constraints.map((c) => (c.id === id && 'value' in c ? { ...c, value } : c)) } });
	}
	const regionArea = (area: number) => `${area.toFixed(3)} in²`;
	async function extrudeChosen() {
		const s = sketch; if (!s) return;
		const distance = Number(extrudeText.trim());
		if (extrudeText.trim() === '' || !Number.isFinite(distance)) { api.error('Enter a finite extrude distance in inches.'); return; }
		const regions = chosenRegions.filter((id) => s.regions.some((r) => r.id === id));
		if (!regions.length) { api.error('Tick at least one closed region to extrude.'); return; }
		const support = s.planeRef.kind === 'face' ? s.planeRef.face.body : undefined, all = regions.length === s.regions.length;
		api.editSketch(null);
		await api.apply({ type: 'add-feature', feature: { id: '', name: '', type: 'extrude', sketch: s.feature, distance, operation: support ? (distance < 0 ? 'cut' : 'add') : 'new', ...(support ? { target: support } : {}), ...(all ? {} : { regions }) } }, all ? 'Extrude' : `Extrude ${regions.length} of ${s.regions.length} regions`);
	}
	function toggleConsumerRegion(f: FeatureOf<'extrude'>, region: string, on: boolean) {
		const s = sketch; if (!s) return;
		const all = s.regions.map((r) => r.id), current = f.regions ?? all;
		const next = on ? all.filter((id) => current.includes(id) || id === region) : current.filter((id) => id !== region);
		void api.apply({ type: 'set-feature', id: f.id, patch: { regions: next.length === all.length ? undefined : next } }, `Set ${f.name} regions`);
	}
	const usesRegion = (f: FeatureOf<'extrude'>, region: string) => !f.regions || f.regions.includes(region);
	const numberText = (form: HTMLFormElement) => (form.elements.namedItem('value') as HTMLInputElement).value;

	/**
	 * SHIFT MOVES THE PREVIEW, so it has to reach the session outside a pointer
	 * event. `context()` defaults `shift` to false because the redraw effect
	 * has no event to read it from, so without this the arc preview would show
	 * the short way round until the pointer moved and then commit the long one
	 * -- a smaller copy of the preview/commit disagreement this bundle exists
	 * to remove. `setModifier` answers whether anything on screen actually
	 * changes, so every other key costs no redraw.
	 */
	function modifier(e: KeyboardEvent) { if (e.key === 'Shift' && sketch && session.setModifier(e.type === 'keydown')) sync(); }

	onMount(() => {
		api.setSketchPointer(pointer);
		window.addEventListener('keydown', keydown, { capture: true });
		window.addEventListener('keydown', modifier);
		window.addEventListener('keyup', modifier);
		return () => { window.removeEventListener('keydown', keydown, { capture: true }); window.removeEventListener('keydown', modifier); window.removeEventListener('keyup', modifier); };
	});
	onDestroy(() => { api.setSketchPointer(null); api.clearGuides(); });
	/* The editing look follows the sketch, the selection, the hover and every session change; the workspace's tool joins because its Escape/setTool clears the guides. */
	$effect(() => { const s = sketch, sel = selected, hov = hovered; void tick; void api.tool; untrack(() => redraw(s, sel, hov)); });
	/* A drawing tool chosen in the workspace's palette while a sketch is open draws INSIDE the sketch. */
	$effect(() => { const t = api.tool; if (t === 'rectangle' || t === 'circle' || t === 'line' || t === 'polygon' || t === 'arc') untrack(() => setTool(t)); });
</script>
<section class="sketch-editor panel" aria-label="Sketch editor" data-testid="ideacad-sketch-editor">
	<!-- Done sits in the head row, not at the foot: a tall panel's foot scrolls under the workspace's floating report control (measured at 1440: the click was intercepted), and the one control every student needs must never need a scroll. -->
	<div class="head"><h2>{sketch?.name ?? 'Sketch'}</h2><button type="button" class="done" onclick={() => { const id = api.editingSketch; api.editSketch(null); if (id) api.select({ bodyId: '', kind: 'sketch', id }); }}>Done</button></div>
	{#if sketch}
		<p class="status" role="status" data-testid="ideacad-sketch-status">{words[sketch.solve.classification] ?? sketch.solve.classification}{sketch.solve.dof ? ` · ${sketch.solve.dof} free` : ''}</p>
		<p class="count">{sketch.entities.filter((e) => e.type !== 'point').length} entities · {sketch.constraints.length} constraints · {sketch.regions.length} closed {sketch.regions.length === 1 ? 'region' : 'regions'}</p>
		{#if arcNotice}<p class="arc-notice" role="status" data-testid="ideacad-sketch-arc-notice">{arcNotice}</p>{/if}
		<div class="tools" role="group" aria-label="Sketch tools">
			{#each TOOLS.filter((t) => api.canWrite || !t.write) as t (t.id)}<button type="button" class="tool" class:active={tool === t.id} aria-pressed={tool === t.id} onclick={() => setTool(t.id)}>{t.word}</button>{/each}
		</div>
		<p class="hint" data-testid="ideacad-sketch-hint">{drawingNote || hoverNote || activeTool.hint}</p>
		{#if api.canWrite}
			<div class="settings">
				<label><span>Polygon sides</span><input name="sides" inputmode="numeric" autocomplete="off" value={sidesText} onchange={(e) => setSides(e.currentTarget.value)} /></label>
				<label><span>Fillet radius (in)</span><input name="fillet" inputmode="decimal" autocomplete="off" bind:value={filletText} /></label>
			</div>
		{/if}
		{#if live.length}
			<div class="selection" data-testid="ideacad-sketch-selection">
				<p>{live.map((id) => entityLabel(sketch.entities, id)).join(', ')} selected</p>
				{#if api.canWrite}
					<button type="button" onclick={deleteSelected}>Delete</button>
					{#each offers as offer (offer.key)}
						{#if offer.value === undefined}<button type="button" onclick={() => addConstraint(offer)}>{offer.label}</button>
						{:else}<form class="offer" onsubmit={(e) => { e.preventDefault(); addConstraint(offer, numberText(e.currentTarget)); }}><label><span>{offer.label} ({offer.unit})</span><input name="value" inputmode="decimal" autocomplete="off" value={Number(offer.value.toPrecision(6))} /></label><button type="submit">Set</button></form>{/if}
					{/each}
				{/if}
			</div>
		{/if}
		{#if sketch.constraints.length}
			<ul class="constraints" aria-label="Constraints">
				{#each sketch.constraints as c (c.id)}
					{@const label = constraintLabel(sketch.entities, c)}
					<li class:trouble={trouble.has(c.id)} data-constraint={c.id}>
						<span class="words">{label.word} <small>{label.names}</small>{#if trouble.has(c.id)}<em>conflicts</em>{/if}</span>
						{#if label.value !== undefined && api.canWrite}<form class="value" onsubmit={(e) => { e.preventDefault(); setConstraintValue(c.id, numberText(e.currentTarget)); }}><input name="value" inputmode="decimal" autocomplete="off" aria-label={`${label.word} value`} value={Number(label.value.toPrecision(6))} /><span class="unit">{label.unit}</span><button type="submit">Set</button></form>
						{:else if label.value !== undefined}<output>{Number(label.value.toPrecision(6))} {label.unit}</output>{/if}
						{#if api.canWrite}<button type="button" onclick={() => removeConstraint(c.id)}>Remove</button>{/if}
					</li>
				{/each}
			</ul>
		{/if}
		{#if sketch.regions.length}
			<div class="regions" data-testid="ideacad-sketch-regions">
				<h3>Closed regions</h3>
				{#each sketch.regions as r, i (r.id)}
					<label class="region"><input type="checkbox" value={r.id} bind:group={chosenRegions} disabled={!api.canWrite} /><span>Region {i + 1}</span><small>{regionArea(r.area)}</small></label>
				{/each}
				{#if api.canWrite}
					<form class="extrude" onsubmit={(e) => { e.preventDefault(); void extrudeChosen(); }}><label><span>Extrude distance (in)</span><input name="value" inputmode="decimal" autocomplete="off" bind:value={extrudeText} /></label><button type="submit">Extrude ticked</button></form>
					{#each consumers as f (f.id)}
						<div class="consumer"><span>{f.name} uses</span>{#each sketch.regions as r, i (r.id)}<label><input type="checkbox" checked={usesRegion(f, r.id)} onchange={(e) => toggleConsumerRegion(f, r.id, e.currentTarget.checked)} /><span>Region {i + 1}</span></label>{/each}</div>
					{/each}
				{/if}
			</div>
		{/if}
	{:else}
		<p class="count">This sketch is not in the model right now. It may be suppressed, or a feature above it failed.</p>
	{/if}
</section>
<style>
	.sketch-editor{display:grid;gap:8px}.head{display:flex;justify-content:space-between;align-items:center;gap:8px}h2{margin:0;font-size:18px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}h3{margin:0;font-size:15px;color:var(--text-2)}.status,.count,.hint{margin:0;color:var(--text-2);font-size:14px;line-height:1.35}.arc-notice{margin:0;color:var(--amber);font-size:14px;line-height:1.35}
	.tools{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}
	button{min-height:44px;min-width:44px;padding:0 10px;border:1px solid var(--boundary);border-radius:5px;background:var(--surface-0);color:var(--text-1);font:600 15px Rajdhani,sans-serif;cursor:pointer}button:hover{background:var(--surface-2)}button:focus-visible,input:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}
	button.tool.active{border-color:var(--green);color:var(--green);background:color-mix(in srgb,var(--green) 12%,var(--surface-1))}
	.done{border-color:var(--green);color:var(--green);font-size:16px}
	.settings,.selection,.regions{display:grid;gap:6px;padding-top:6px;border-top:1px solid var(--hairline)}.selection p{margin:0;font-size:14px;color:var(--text-2)}
	label{display:grid;gap:3px;font:600 13px Rajdhani,sans-serif;color:var(--text-2);min-width:0}
	input:not([type=checkbox]){min-height:44px;width:100%;min-width:0;padding:0 8px;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:15px 'Share Tech Mono',monospace}
	.offer,.value,.extrude{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:end}.value{grid-template-columns:minmax(0,1fr) auto auto;align-items:center}.value .unit{font:12px 'Share Tech Mono',monospace;color:var(--text-2)}
	.constraints{list-style:none;margin:0;padding:6px 0 0;display:grid;gap:6px;border-top:1px solid var(--hairline)}.constraints li{display:grid;gap:4px;padding:4px;border:1px solid transparent;border-radius:4px}.constraints li.trouble{border-color:var(--amber)}.words{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline;font:600 14px Rajdhani,sans-serif}.words small{font:12px 'Share Tech Mono',monospace;color:var(--text-2)}.words em{font:12px 'Share Tech Mono',monospace;font-style:normal;color:var(--amber)}output{font:14px 'Share Tech Mono',monospace}
	.region,.consumer label{display:flex;align-items:center;gap:8px;min-height:44px;cursor:pointer}.region input,.consumer input{width:22px;height:22px;margin:0;accent-color:var(--green)}.region small{margin-left:auto;font:12px 'Share Tech Mono',monospace;color:var(--text-2)}
	.consumer{display:grid;gap:2px;font:600 13px Rajdhani,sans-serif;color:var(--text-2)}
</style>
