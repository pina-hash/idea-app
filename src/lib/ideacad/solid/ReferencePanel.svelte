<script lang="ts">
	/**
	 * REFERENCE GEOMETRY: create planes, axes and points from the current
	 * selection or by construction, and list the ones the document has.
	 *
	 * THE PANEL DECIDES NOTHING. `referenceOffers` (features/reference.ts) is
	 * handed the projection, the selection and this panel's own inputs and
	 * answers every construction the panel lists, each either ready (the
	 * feature to add, and the sentence naming what it makes) or not (the reason).
	 * A button shows that sentence; a ready one sends the feature through
	 * `api.apply`, and a press on one that is not ready shows the reason where
	 * every other refusal shows. So the words on the button and the feature it
	 * sends come from one place and cannot drift apart.
	 *
	 * NOTHING IS CLAMPED. A typed offset, angle or coordinate goes to the
	 * feature as typed; what the kernel refuses is the feature row's sentence.
	 * The one thing judged here is that a number IS one, in the executor's own
	 * words, so a button never reads "NaN".
	 *
	 * NAMES ARE THE REDUCER'S ("Plane 1") AND ARE RENAMED IN THE DESIGN TREE;
	 * this panel offers no second rename.
	 */
	import type { WorkspaceApi } from './workspace-api';
	import type { FeatureRow, ReferenceProjection, ResolvedPlane, Vec3 } from './types';
	import { REFERENCE_TYPES } from './features';
	import { referenceOffers, type Datum, type DatumAxis, type ReferenceOffer } from './features/reference';
	import { DATUM_NAMES, datumPlanesShown, setDatumPlanesShown } from './viewport/reference-layer';
	/* A datum is named as the viewport's plane label names it (Top, Front, Right), never by its axis pair. */
	const DATUM_ORDER = ['XY', 'XZ', 'YZ'] as const;
	let { api }: { api: WorkspaceApi } = $props();
	let datum = $state<Datum>('XY'), axis = $state<DatumAxis>('Z'), offset = $state('1'), angle = $state('45'), coords = $state('0, 0, 0');
	let showDatum = $state(datumPlanesShown()), sectioned = $state<string | null>(null);
	/* The offers that cannot be made yet fold away until asked for: each still says why on a press, and a ready one is never folded. */
	let folded = $state({ selection: true, construction: true });
	const uid = $props.id();
	const GLYPH: Record<string, string> = { plane: '▱', axis: '│', point: '·' };
	/** `Number('')` is 0, which is a number nobody typed; an empty field is not a number. */
	const number = (v: string) => (v.trim() === '' ? NaN : Number(v.trim()));
	const coordinates = (v: string): Vec3 => { const p = v.split(',').map(number); return p.length === 3 ? (p as Vec3) : [NaN, NaN, NaN]; };
	const offers = $derived(referenceOffers(api.model, api.selections, { datum, axis, offset: number(offset), angle: number(angle), coordinates: coordinates(coords) }));
	const fromSelection = $derived(offers.filter((o) => o.group === 'selection'));
	const byConstruction = $derived(offers.filter((o) => o.group === 'construction'));
	const readyCount = (list: ReferenceOffer[]) => list.filter((o) => o.feature).length;
	/** Every reference feature in the document with its row: a lost one still has a row and a sentence, though no projection to draw. */
	const rows = $derived(api.model.features.filter((f) => REFERENCE_TYPES.includes(f.type)).map((row: FeatureRow) => ({ row, ref: api.model.references.find((r) => r.feature === row.id) ?? null, selected: api.selections.some((s) => s.kind === 'reference' && s.id === row.id) })));
	const planeOf = (ref: ReferenceProjection): ResolvedPlane => ({ origin: ref.origin, u: ref.u!, v: ref.v!, normal: ref.normal! });
	async function make(o: ReferenceOffer) {
		if (!o.feature) { api.error(o.sentence); return; }
		try { await api.apply({ type: 'add-feature', feature: o.feature }, `Add ${o.title.toLowerCase()}`); }
		catch (e) { api.error(e instanceof Error ? e.message : String(e)); }
	}
	function toggleDatum(on: boolean) { showDatum = on; setDatumPlanesShown(on); }
	function section(ref: ReferenceProjection) {
		if (sectioned === ref.feature) { sectioned = null; api.clip(null); }
		else { sectioned = ref.feature; api.clip(planeOf(ref)); }
	}
</script>
<section class="reference panel" aria-label="Reference geometry" data-testid="ideacad-reference-panel">
	<h2>Reference geometry</h2>

	{#snippet offerList(list: ReferenceOffer[], key: 'selection' | 'construction')}
		{@const waiting = list.length - readyCount(list)}
		<ul class="offers" class:folded={folded[key]} id={`${uid}-${key}`}>
			{#each list as o (o.id)}
				<li class:waiting={!o.feature}><button type="button" class="offer" class:ready={!!o.feature} aria-disabled={!o.feature} disabled={!api.canWrite || api.busy} data-offer={o.id} onclick={() => void make(o)}><span class="title"><span class="glyph" aria-hidden="true">{GLYPH[o.kind]}</span> {o.title}</span><span class="sentence">{o.sentence}</span></button></li>
			{/each}
		</ul>
		{#if waiting}<button type="button" class="fold" aria-expanded={!folded[key]} aria-controls={`${uid}-${key}`} data-testid={`ideacad-reference-fold-${key}`} onclick={() => (folded[key] = !folded[key])}><span class="caret" aria-hidden="true">{folded[key] ? '▸' : '▾'}</span>{folded[key] ? 'Show' : 'Hide'} {waiting} not ready</button>{/if}
	{/snippet}

	<h3>From the selection <span class="count" data-testid="ideacad-reference-ready-selection">{readyCount(fromSelection)} of {fromSelection.length} ready</span></h3>
	{@render offerList(fromSelection, 'selection')}

	<h3>By construction <span class="count" data-testid="ideacad-reference-ready-construction">{readyCount(byConstruction)} of {byConstruction.length} ready</span></h3>
	<div class="inputs">
		<label><span class="cap">Plane</span><select bind:value={datum} data-testid="ideacad-reference-datum">{#each DATUM_ORDER as d (d)}<option value={d}>{DATUM_NAMES[d]} plane</option>{/each}</select></label>
		<label><span class="cap">Axis</span><select bind:value={axis} data-testid="ideacad-reference-axis"><option>X</option><option>Y</option><option>Z</option></select></label>
		<label><span class="cap">Offset <small>in</small></span><input inputmode="decimal" bind:value={offset} data-testid="ideacad-reference-offset" /></label>
		<label><span class="cap">Angle <small>°</small></span><input inputmode="decimal" bind:value={angle} data-testid="ideacad-reference-angle" /></label>
		<label class="wide"><span class="cap">Point x, y, z <small>in</small></span><input bind:value={coords} data-testid="ideacad-reference-coordinates" /></label>
	</div>
	{@render offerList(byConstruction, 'construction')}

	<label class="toggle"><input type="checkbox" checked={showDatum} onchange={(e) => toggleDatum(e.currentTarget.checked)} data-testid="ideacad-reference-datum-planes" /><span>Show datum planes</span></label>

	<h3>In this document <span class="count">{rows.length}</span></h3>
	{#if rows.length}
		<ul class="list" data-testid="ideacad-reference-list">
			{#each rows as r (r.row.id)}
				<li class:error={r.row.status === 'error'} data-reference={r.row.id}>
					<button type="button" class="row" class:selected={r.selected} aria-pressed={r.selected} onclick={(e) => api.select({ bodyId: '', kind: 'reference', id: r.row.id }, e.shiftKey)}><span class="name"><span class="glyph" aria-hidden="true">{GLYPH[r.row.type]}</span> {r.row.name}</span><span class="meta">{r.selected ? 'selected' : r.row.status === 'error' ? 'lost' : r.row.status === 'suppressed' ? 'suppressed' : r.row.type}</span></button>
					{#if r.row.message}<p class="message" role={r.row.status === 'error' ? 'alert' : 'status'}>{r.row.message}</p>{/if}
					{#if r.ref?.kind === 'plane'}<div class="row-actions"><button type="button" onclick={() => api.lookAt(planeOf(r.ref!))}>Look at</button><button type="button" aria-pressed={sectioned === r.ref.feature} onclick={() => section(r.ref!)}>{sectioned === r.ref.feature ? 'End section' : 'Section'}</button></div>{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
<style>
	.reference{display:grid;gap:8px}
	h2{margin:0;font-size:18px}
	h3{margin:6px 0 0;display:flex;justify-content:space-between;align-items:baseline;font:600 15px Rajdhani,sans-serif;color:var(--text-1);border-bottom:1px solid var(--hairline);padding-bottom:4px}
	.reference h3 .count{font:12px 'Share Tech Mono',monospace;color:var(--text-2)}
	.offers,.list{list-style:none;margin:0;padding:0;display:grid;gap:4px}
	.inputs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.inputs .wide{grid-column:span 2}
	.offers.folded li.waiting{display:none}.offers.folded:not(:has(li:not(.waiting))){display:none}
	.reference .fold{display:flex;align-items:center;gap:6px;min-height:44px;width:100%;box-sizing:border-box;padding:4px 8px;border:1px dashed var(--boundary);border-radius:4px;background:transparent;color:var(--text-2);font:15px Rajdhani,sans-serif;cursor:pointer;text-align:left}
	.caret{width:1em}
	label{display:grid;gap:2px;font:600 14px Rajdhani,sans-serif;color:var(--text-2)}.cap{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cap small{font-weight:400}
	input,select{min-height:44px;width:100%;box-sizing:border-box;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:16px Rajdhani,sans-serif;padding:0 8px}
	.reference .offer{display:grid;gap:2px;width:100%;min-height:44px;box-sizing:border-box;text-align:left;padding:6px 8px;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:16px Rajdhani,sans-serif;cursor:pointer}
	.reference .offer.ready{border-color:var(--green)}
	.reference .offer .title{font-weight:600;font-size:16px;color:var(--text-1)}
	.reference .offer.ready .title{color:var(--green)}
	.reference .offer .sentence{font-size:13px;color:var(--text-2);line-height:1.35}
	.reference .offer[aria-disabled="true"]{cursor:not-allowed;background:transparent}
	.reference .offer:disabled{opacity:.4;cursor:default}
	.glyph{display:inline-block;width:1em;text-align:center}
	.toggle{display:flex;align-items:center;gap:8px;min-height:44px;color:var(--text-1);cursor:pointer}
	.toggle input{width:20px;height:20px;min-height:0;margin:0;flex-shrink:0}
	.reference .row{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;min-height:44px;box-sizing:border-box;text-align:left;padding:4px 8px;border:1px solid transparent;border-radius:4px;background:transparent;color:var(--text-1);font:16px Rajdhani,sans-serif;cursor:pointer}
	.reference .row.selected{border-color:var(--green);color:var(--green)}
	.reference .row .meta{font:12px 'Share Tech Mono',monospace;color:var(--text-2)}
	.reference .row.selected .meta{color:var(--green)}
	.list li.error .row{color:var(--ic-fail-ink,#e07474)}
	.message{margin:0 8px 4px;font-size:13px;line-height:1.4;color:var(--text-2)}
	.list li.error .message{color:var(--ic-fail-ink,#e07474)}
	.row-actions{display:flex;gap:4px;padding:0 8px 4px}
	.reference .row-actions button{flex:1;min-height:44px;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:15px Rajdhani,sans-serif;cursor:pointer}
	.reference .row-actions button[aria-pressed="true"]{border-color:var(--green);color:var(--green)}
</style>
