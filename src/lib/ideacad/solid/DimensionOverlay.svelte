<script lang="ts">
	/**
	 * THE NUMBERS IN THE VIEWPORT. Every driving dimension of the sketch open
	 * for editing, or of the selected feature (and of the sketch that feature
	 * was made from), drawn beside the geometry it controls as a button that
	 * shows the value in the student's display unit. A press (or Enter) turns
	 * the button into a box in place with the number selected; Enter sets it
	 * exactly as the Dimensions panel does, and Escape puts it back.
	 *
	 * WHAT AND WHERE ARE DECIDED ELSEWHERE, AND BOTH ARE PURE. `dimensions/model.ts`
	 * says which numbers are driving and what a typed one patches;
	 * `dimensions/anchors.ts` says where each sits, in world inches;
	 * `dimensions/labels.ts` says what a label reads and how labels are moved
	 * apart. This component projects, measures and renders.
	 *
	 * A MEASURED VALUE (an edge's length) is drawn in gray with the word
	 * "measured" and is not a control: a driven number cannot be typed, and a
	 * box that refused every value would be a control whose only answer is no.
	 * A read-only document shows its numbers the same way.
	 *
	 * THE LABELS FOLLOW THE CAMERA. There is no camera event on the workspace
	 * today, so the overlay re-projects on a frame-or-timeout loop while it has
	 * anything to show (a frame alone never ticks in a hidden tab), and only
	 * rewrites the screen when a label actually moved. A workspace that offers
	 * `onCameraChange` is listened to instead. While the pointer drags on the
	 * model the labels are hidden: the drag's own readout owns the pointer.
	 */
	import { onMount, untrack } from 'svelte';
	import type { WorkspaceApi } from './workspace-api';
	import { drivenDimensions, featureDimensions, sketchDimensions, type Dimension, type Measured } from './dimensions/model';
	import { featureAnchors, measuredAnchors, sketchAnchors, type DimensionAnchor } from './dimensions/anchors';
	import { labelEditText, labelTarget, labelText, readLabel, spreadLabels, type DisplayUnit, type LabelBox } from './dimensions/labels';
	import type { Feature, SketchProjection, Vec3 } from './types';

	/** Members a workspace may offer the overlay; both optional, so a fake workspace in a test needs neither. */
	type OverlayApi = WorkspaceApi & { onCameraChange?(listener: () => void): () => void; readonly dragging?: boolean };
	/** The chrome drawn over the model that a label must not sit under, as a selector inside the overlay's own parent (the workspace's work area). */
	const CHROME = ':scope > .panels > *, :scope > .tools, :scope > .top-bar .right-tools, :scope > .top-bar .view-tools > *, :scope > .export-menu, :scope > .error, :scope > .triad-slot, :scope > .empty-slot > *';
	let { api, hidden = false, avoid = CHROME }: { api: WorkspaceApi; hidden?: boolean; avoid?: string } = $props();
	const host = $derived(api as OverlayApi);

	/** How far a witness line stands off the geometry, in pixels. */
	const GAP_PX = 14;
	/** Past this many pixels of pointer travel on the model, a press is a drag and the labels step aside. */
	const DRAG_PX = 4;
	/** One number to draw: what it is, which feature it patches, and whether it may be typed. */
	interface Item { id: string; feature: string; dim: Dimension | Measured; group: string; driving: boolean; word: string }
	/** One number placed on screen. */
	interface Placed { id: string; x: number; y: number; w: number; h: number; ax: number; ay: number; lines: string[]; text: string }

	const display = $derived<DisplayUnit>(api.prefs?.units.display === 'mm' ? 'mm' : 'in');
	const primary = $derived(api.selections[0] ?? null);
	const openSketch = $derived(api.editingSketch ? (api.model.sketches.find((s) => s.feature === api.editingSketch) ?? null) : null);
	/** The feature whose numbers show: the one selected, or the one that made the selected body, face, edge or corner. The Dimensions panel answers the same question the same way. */
	const selectedFeature = $derived.by((): Feature | null => {
		if (openSketch || !primary) return null;
		const id = primary.kind === 'feature' || primary.kind === 'sketch' || primary.kind === 'reference' ? primary.id : (api.model.bodies.find((b) => b.id === primary.bodyId)?.createdBy ?? null);
		return id ? (api.manifest.features.find((f) => f.id === id) ?? null) : null;
	});
	/** A feature made from a sketch also shows the sketch's numbers, so selecting a box offers its width, its height and its depth together. */
	const sourceSketch = $derived.by((): SketchProjection | null => {
		const f = selectedFeature; if (!f) return null;
		const id = f.type === 'sketch' ? f.id : 'sketch' in f && typeof f.sketch === 'string' ? f.sketch : null;
		return id ? (api.model.sketches.find((s) => s.feature === id) ?? null) : null;
	});
	const sketchShown = $derived(openSketch ?? sourceSketch);
	const featureShown = $derived(selectedFeature && selectedFeature.type !== 'sketch' ? selectedFeature : null);
	const items = $derived.by((): Item[] => {
		const out: Item[] = [], canWrite = api.canWrite;
		if (sketchShown) for (const d of sketchDimensions(sketchShown)) out.push({ id: `${sketchShown.feature}:${d.key}`, feature: sketchShown.feature, dim: d, group: 'sketch', driving: canWrite, word: d.label });
		if (featureShown) for (const d of featureDimensions(featureShown)) out.push({ id: `${featureShown.id}:${d.key}`, feature: featureShown.id, dim: d, group: 'feature', driving: canWrite, word: d.label });
		if (!openSketch) { const keys = new Set(measuredAnchors(primary, api.model).map((a) => a.key)); for (const m of drivenDimensions(primary, api.model)) if (keys.has(m.key)) out.push({ id: `measured:${m.key}`, feature: '', dim: m, group: 'measured', driving: false, word: m.label }); }
		return out;
	});

	let root: HTMLDivElement | undefined = $state();
	let placed = $state.raw<Placed[]>([]);
	let editing = $state<{ id: string; text: string } | null>(null);
	let pending = $state<string | null>(null);
	let dragging = $state(false);
	const labelEls = new Map<string, HTMLElement>();
	/** Anchors by item id, recomputed when the model, the selection or the zoom changes; read by a commit for the label's factor. */
	let anchors = new Map<string, DimensionAnchor>();
	let anchorKey = '', lastSignature = '', lastCamera = '', lastFull = 0;
	/** How often a full pass runs while nothing on screen moves. */
	const STILL_MS = 250;

	/** Pixels per inch near the model: the longest projected world axis, which for an orthographic camera is the scale of the screen plane. */
	function scale(project: (p: Vec3) => { x: number; y: number }): { ppi: number; view: string } {
		const o = project([0, 0, 0]);
		let best = 1e-6, view = '';
		for (const axis of [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as Vec3[]) { const p = project(axis), dx = p.x - o.x, dy = p.y - o.y; best = Math.max(best, Math.hypot(dx, dy)); view += `${Math.round(Math.atan2(dy, dx) * 20)},${Math.round(Math.hypot(dx, dy) / 4)};`; }
		/* `view` changes when the camera turns, so a feature's number moves to the side the viewer now sees. */
		return { ppi: best, view };
	}
	/** What a label's box measures once drawn, or an estimate from its text before it is. */
	const sizeOf = (id: string, text: string) => { const el = labelEls.get(id); return el && el.offsetWidth ? { w: el.offsetWidth, h: el.offsetHeight || 44 } : { w: 20 + 9 * text.length, h: 44 }; };
	/** One pass: project the anchors, place the labels, and write the screen only if something moved. */
	function layout() {
		const list = items, element = root;
		if (!element || !list.length) { if (placed.length) placed = []; return; }
		const project = (p: Vec3) => api.project(p);
		const { ppi, view } = scale(project), gap = GAP_PX / ppi, rect = element.getBoundingClientRect();
		const key = `${ppi.toFixed(3)}|${view}|${list.map((i) => i.id).join(',')}|${sketchShown?.feature ?? ''}|${featureShown?.id ?? ''}`;
		/* A still camera over an unchanged model places nothing new: the full pass then runs only every few frames, to follow a panel opening or a label's width settling, and a moving camera gets every frame. */
		const origin = project([0, 0, 0]), camera = `${key}|${origin.x.toFixed(1)},${origin.y.toFixed(1)}|${rect.left.toFixed(1)},${rect.top.toFixed(1)},${rect.width.toFixed(1)}x${rect.height.toFixed(1)}`, now = performance.now();
		if (camera === lastCamera && anchors.size && now - lastFull < STILL_MS) return;
		lastCamera = camera; lastFull = now;
		if (key !== anchorKey || anchors.size === 0) {
			const next = new Map<string, DimensionAnchor>();
			if (sketchShown) for (const a of sketchAnchors(sketchShown, gap)) next.set(`${sketchShown.feature}:${a.key}`, a);
			if (featureShown) for (const a of featureAnchors(featureShown, api.model, gap, project)) next.set(`${featureShown.id}:${a.key}`, a);
			for (const a of measuredAnchors(primary, api.model)) next.set(`measured:${a.key}`, a);
			anchors = next; anchorKey = key;
		}
		const toLocal = (p: Vec3) => { const s = project(p); return { x: s.x - rect.left, y: s.y - rect.top }; };
		const boxes: (LabelBox & { item: Item; anchor: DimensionAnchor; point: { x: number; y: number }; text: string })[] = [];
		for (const item of list) {
			const anchor = anchors.get(item.id); if (!anchor) continue;
			const point = toLocal(anchor.at);
			/* A number whose geometry is off screen is not drawn pinned to the edge with a leader to nowhere. */
			if (point.x < -8 || point.y < -8 || point.x > rect.width + 8 || point.y > rect.height + 8 || !Number.isFinite(point.x + point.y)) continue;
			const ahead = Math.hypot(...anchor.away) > 0 ? toLocal([anchor.at[0] + anchor.away[0] * gap, anchor.at[1] + anchor.away[1] * gap, anchor.at[2] + anchor.away[2] * gap]) : null;
			const target = labelTarget(point, ahead);
			const text = labelText(item.dim.value, item.dim.unit, display, anchor.prefix, anchor.factor ?? 1);
			const size = sizeOf(item.id, text);
			boxes.push({ id: item.id, x: target.x, y: target.y, w: size.w, h: size.h, item, anchor, point, text });
		}
		const obstacles: LabelBox[] = [];
		let chrome: Iterable<Element> = [];
		/* A selector the page cannot answer costs the avoidance, never the labels. */
		try { chrome = element.parentElement?.querySelectorAll(avoid) ?? []; } catch { chrome = []; }
		for (const el of chrome) {
			const r = el.getBoundingClientRect();
			if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') obstacles.push({ id: '', x: r.left - rect.left + r.width / 2, y: r.top - rect.top + r.height / 2, w: r.width, h: r.height });
		}
		const spread = spreadLabels(boxes, { left: 4, top: 4, right: rect.width - 4, bottom: rect.height - 4 }, undefined, obstacles);
		const next: Placed[] = spread.map((b, i) => {
			const src = boxes[i];
			const lines = src.anchor.lines.map((line) => line.map((p) => { const s = toLocal(p); return `${s.x.toFixed(1)},${s.y.toFixed(1)}`; }).join(' '));
			return { id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, ax: src.point.x, ay: src.point.y, lines, text: src.text };
		});
		const signature = next.map((p) => `${p.id}@${p.x.toFixed(1)},${p.y.toFixed(1)},${p.w},${p.text},${p.lines.join(';')}`).join('|');
		if (signature !== lastSignature) { lastSignature = signature; placed = next; }
	}
	/** Frame-or-timeout: a hidden or throttled tab never ticks a frame, so a timeout stands in. */
	function soon(run: () => void, ms = 120) {
		let done = false; const once = () => { if (done) return; done = true; cancelAnimationFrame(frame); clearTimeout(timer); run(); };
		const frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(once) : 0, timer = setTimeout(once, ms);
		return () => { done = true; if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame); clearTimeout(timer); };
	}
	/* The loop runs while there is anything to show. The inputs are read TRACKED so a new selection or model restarts it; the calls into the workspace (`project`, `onCameraChange`) are untracked, because they are the workspace's code. */
	$effect(() => {
		const count = items.length; void display; void api.model; void root;
		/* Whatever changed, the anchors are recomputed on the next pass: a new width moves its witness lines even when the list of numbers is the same. */
		anchorKey = ''; lastCamera = '';
		if (!count || !root) { placed = []; lastSignature = ''; return; }
		let stop = () => {}, alive = true;
		const subscribe = host.onCameraChange;
		if (subscribe) {
			const off = untrack(() => subscribe(() => { stop(); stop = soon(() => { if (alive) layout(); }); }));
			stop = soon(() => { if (alive) layout(); });
			return () => { alive = false; stop(); off(); };
		}
		const tick = () => { if (!alive) return; layout(); stop = soon(tick); };
		stop = soon(tick, 16);
		return () => { alive = false; stop(); };
	});
	/* A drag on the model hides the labels until the press ends. A press on a label, a panel or a tool is not a drag on the model. */
	onMount(() => {
		let press: { x: number; y: number } | null = null;
		const onDown = (e: PointerEvent) => {
			const target = e.target as Element | null, area = root?.parentElement;
			if (e.button !== 0 || !area || !target || !area.contains(target) || root?.contains(target) || target.closest?.('button,input,select,textarea,a,.panel,.panels,[role=menu],[role=dialog]')) return;
			press = { x: e.clientX, y: e.clientY };
		};
		const onMove = (e: PointerEvent) => { if (press && !dragging && Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_PX) dragging = true; };
		const onUp = () => { press = null; dragging = false; };
		window.addEventListener('pointerdown', onDown, true); window.addEventListener('pointermove', onMove, true); window.addEventListener('pointerup', onUp, true); window.addEventListener('pointercancel', onUp, true);
		return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('pointermove', onMove, true); window.removeEventListener('pointerup', onUp, true); window.removeEventListener('pointercancel', onUp, true); };
	});
	const shown = $derived(!hidden && !dragging && !host.dragging);

	/* ------------------------------------------------------------ editing */
	function open(item: Item) {
		if (!item.driving) return;
		const anchor = anchors.get(item.id), dim = item.dim as Dimension;
		editing = { id: item.id, text: labelEditText(dim.value, dim.unit, display, anchor?.factor ?? 1) };
	}
	/** The box opens focused holding the number, all of it selected, so typing replaces it. The value is written here rather than bound, so the selection is made over the number and never over an empty box. */
	function focusBox(node: HTMLInputElement, text: string) { node.value = text; node.focus(); node.setSelectionRange(0, text.length); }
	const idle = async () => { for (let i = 0; i < 200 && api.busy; i++) await new Promise((r) => setTimeout(r, 50)); };
	async function commit(item: Item, text: string) {
		const anchor = anchors.get(item.id), dim = item.dim as Dimension;
		const parsed = readLabel(text, dim.unit, display, anchor?.factor ?? 1);
		/* Not a number: the sentence goes where every refusal goes, and the box keeps what was typed so it can be corrected. */
		if (!parsed.ok) { api.error(parsed.reason); return; }
		pending = item.id;
		try {
			/* A value typed while the model is still rebuilding waits for it; `apply` would otherwise drop it without a word. */
			await idle();
			await api.apply({ type: 'set-feature', id: item.feature, patch: dim.patch(parsed.value) }, `Set ${anchor?.factor === 2 ? item.word.replace(/^Radius/, 'Diameter') : item.word}`);
			/* A value the engine refused leaves the document as it was, and the workspace has already said why; the box stays open with what was typed, so it can be corrected. */
			const now = items.find((i) => i.id === item.id)?.dim.value;
			const landed = now !== undefined && Math.abs(now - parsed.value) <= 1e-9 * Math.max(1, Math.abs(parsed.value));
			if (landed && editing?.id === item.id) editing = null;
		} finally { pending = null; }
	}
	function cancel() { editing = null; }
	function keydown(e: KeyboardEvent, item: Item) {
		if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); const id = item.id; queueMicrotask(() => labelEls.get(id)?.focus()); }
	}
	/** Each label's element, so its drawn width places it on the next pass. */
	function register(node: HTMLElement, id: string) { labelEls.set(id, node); return { destroy() { if (labelEls.get(id) === node) labelEls.delete(id); } }; }
	const itemById = $derived(new Map(items.map((i) => [i.id, i])));
	const stroke = (id: string) => (itemById.get(id)?.group === 'measured' ? 'measured' : 'driving');
</script>

<div class="dim-overlay" bind:this={root} class:hidden={!shown} data-testid="ideacad-dimension-overlay" aria-hidden={shown ? undefined : 'true'}>
	{#if shown && placed.length}
		<svg class="dim-lines" aria-hidden="true">
			{#each placed as p (p.id)}
				<g class={stroke(p.id)}>
					{#each p.lines as line, i (i)}<polyline points={line} />{/each}
					<line class="leader" x1={p.ax} y1={p.ay} x2={p.x} y2={p.y} />
					<circle cx={p.ax} cy={p.ay} r="2.5" />
				</g>
			{/each}
		</svg>
		{#each placed as p (p.id)}
			{@const item = itemById.get(p.id)}
			{#if item}
				<div class="dim-slot" class:passive={!item.driving} style:left={`${p.x}px`} style:top={`${p.y}px`}>
					{#if editing?.id === p.id && item.driving}
						<form class="dim-edit" onsubmit={(e) => { e.preventDefault(); if (editing) void commit(item, editing.text); }}>
							<input use:focusBox={editing.text} oninput={(e) => { if (editing) editing.text = e.currentTarget.value; }} aria-label={`${item.word}, ${display === 'mm' && item.dim.unit === 'in' ? 'millimeters' : item.dim.unit === 'in' ? 'inches' : item.dim.unit === 'deg' ? 'degrees' : item.dim.unit === 'count' ? 'copies' : 'ratio'}`} autocomplete="off" spellcheck="false" onkeydown={(e) => keydown(e, item)} onblur={() => { if (pending !== p.id) cancel(); }} data-dimension-input={p.id} />
						</form>
					{:else if item.driving}
						<button type="button" class="dim-label" use:register={p.id} aria-label={`${item.word} ${p.text}`} aria-busy={pending === p.id ? 'true' : undefined} data-dimension-label={p.id} onclick={() => open(item)}>{p.text}</button>
					{:else}
						<span class="dim-label driven" use:register={p.id} data-dimension-label={p.id}>{p.text}{#if item.group === 'measured'}<small>measured</small>{/if}</span>
					{/if}
				</div>
			{/if}
		{/each}
	{/if}
</div>

<style>
	/* Above the model, below every panel and toolbar: only the labels take the pointer, so a press anywhere else still reaches the model. */
	.dim-overlay{position:absolute;inset:0;z-index:4;pointer-events:none;overflow:hidden}
	.dim-overlay.hidden{visibility:hidden}
	.dim-lines{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
	.dim-lines polyline,.dim-lines line{fill:none;stroke-width:1.25;vector-effect:non-scaling-stroke}
	.dim-lines .driving polyline,.dim-lines .driving line{stroke:var(--cyan)}.dim-lines .driving circle{fill:var(--cyan)}
	.dim-lines .measured polyline,.dim-lines .measured line{stroke:var(--text-2);stroke-dasharray:4 3}.dim-lines .measured circle{fill:var(--text-2)}
	.dim-lines .leader{opacity:.8}
	/* The label is centred on its place; a fixed size in pixels, so it reads the same at every zoom. */
	.dim-slot{position:absolute;transform:translate(-50%,-50%);pointer-events:auto}.dim-slot.passive{pointer-events:none}
	.dim-label{display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;min-height:44px;min-width:44px;padding:0 10px;margin:0;white-space:nowrap;border:1px solid var(--cyan);border-radius:5px;background:color-mix(in srgb,var(--surface-1) 92%,transparent);color:var(--text-1);font:15px var(--font-mono,'Share Tech Mono',monospace);box-shadow:none;cursor:pointer}
	button.dim-label:hover{border-color:var(--green);background:var(--surface-2)}
	button.dim-label:focus-visible{outline:2px solid var(--green);outline-offset:1px}
	button.dim-label[aria-busy='true']{border-style:dashed}
	.dim-label.driven{cursor:default;border-style:dashed;border-color:var(--boundary);color:var(--text-2);pointer-events:none}
	.dim-label small{font:12px var(--font-mono,'Share Tech Mono',monospace);color:var(--text-2)}
	.dim-edit{display:flex;margin:0}
	.dim-edit input{box-sizing:border-box;width:128px;min-height:44px;padding:0 10px;border:1px solid var(--green);border-radius:5px;background:var(--surface-0);color:var(--text-1);font:16px var(--font-mono,'Share Tech Mono',monospace);box-shadow:none}
	.dim-edit input:focus-visible{outline:2px solid var(--green);outline-offset:1px}
</style>
