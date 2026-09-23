<script lang="ts">
	/**
	 * THE DIMENSION PANEL: the numbers of the selected feature, or of the
	 * sketch open for editing, each a labelled input a student types into;
	 * and the numbers the selection MEASURES, each read-only and said so.
	 *
	 * DRIVING AND DRIVEN ARE DECIDED IN `dimensions/model.ts`, not here. This
	 * component reads `featureDimensions` / `sketchDimensions` for the inputs
	 * and `drivenDimensions` for the measured list, parses what was typed with
	 * `parseDimension`, and applies `{type:'set-feature', id, patch}` with the
	 * label "Set <label>", which is what the history row and Undo will say.
	 *
	 * A REFUSAL RENDERS WHERE THE STUDENT WAS WORKING. Text that is not a
	 * number goes to `api.error` as a sentence and nothing is applied. A
	 * number the kernel refuses is refused by the engine in the feature's own
	 * words (`refuseOwnFailure`: the command about a feature that then fails
	 * throws that feature's message and the document is put back), which
	 * `api.apply` shows where every other refusal shows, and the input keeps
	 * what was typed so it can be corrected. A feature broken by a change
	 * ABOVE it carries the sentence on its row, and the panel repeats it under
	 * the heading. A sketch value the solver cannot satisfy says so above the
	 * list and marks the rows the solver names (`trouble`) with the word
	 * "conflicts"; the solver does not always name one, and the sentence then
	 * promises no mark (measured: a 100 in diagonal on a 4×5 rectangle came
	 * back `unsatisfied` with `trouble` empty). NO INPUT CARRIES `min`,
	 * `max` OR `step`; the kernel's answer is the only refusal of a value.
	 *
	 * WHICH FEATURE: the open sketch when there is one; a selected feature,
	 * sketch or reference by its own id (a selected sketch lists its
	 * constraints, exactly as it does open); a selected body, face, edge or corner
	 * through the feature that created the body, so selecting an extruded box
	 * offers the extrude's distance. Read-only documents show the same numbers
	 * as text: absence of the input is the mechanism, not a flag on it.
	 */
	import type { WorkspaceApi } from './workspace-api';
	import { drivenDimensions, editText, featureDimensions, formatDimension, parseDimension, sketchDimensions, unitWord, type Dimension } from './dimensions/model';
	let { api }: { api: WorkspaceApi } = $props();
	const primary = $derived(api.selections[0] ?? null);
	const editingSketch = $derived(api.editingSketch ? (api.model.sketches.find((s) => s.feature === api.editingSketch) ?? null) : null);
	const featureId = $derived.by(() => {
		if (editingSketch) return editingSketch.feature;
		if (!primary) return null;
		if (primary.kind === 'feature' || primary.kind === 'sketch' || primary.kind === 'reference') return primary.id;
		return api.model.bodies.find((b) => b.id === primary.bodyId)?.createdBy ?? null;
	});
	const feature = $derived(featureId ? (api.manifest.features.find((f) => f.id === featureId) ?? null) : null);
	const row = $derived(featureId ? (api.model.features.find((f) => f.id === featureId) ?? null) : null);
	/* A sketch selected but not open shows its own numbers too: its constraints are the only numbers it has, and "no number to type" beside a sketch that carries a width was a sentence the viewport's labels contradicted. */
	const sketchShown = $derived(editingSketch ?? (feature?.type === 'sketch' ? (api.model.sketches.find((s) => s.feature === feature.id) ?? null) : null));
	const dimensions = $derived<Dimension[]>(sketchShown ? sketchDimensions(sketchShown) : feature ? featureDimensions(feature) : []);
	const measured = $derived(editingSketch ? [] : drivenDimensions(primary, api.model));
	const trouble = $derived(new Set(sketchShown?.solve.trouble ?? []));
	const unsatisfied = $derived(sketchShown?.solve.classification === 'unsatisfied');
	async function submit(d: Dimension, text: string) {
		const parsed = parseDimension(text, d.unit);
		if (!parsed.ok) { api.error(parsed.reason); return; }
		if (!featureId) return;
		await api.apply({ type: 'set-feature', id: featureId, patch: d.patch(parsed.value) }, `Set ${d.label}`);
	}
	const typed = (form: HTMLFormElement) => (form.elements.namedItem('value') as HTMLInputElement).value;
</script>
{#if feature || measured.length}
	<section class="dimensions panel" aria-label="Dimensions" data-testid="ideacad-dimension-panel">
		<h2>Dimensions{#if feature}<span>{feature.name}</span>{/if}</h2>
		{#if unsatisfied}<p class="refused" role="alert">{trouble.size ? 'Cannot be solved: a dimension marked "conflicts" asks for what the others rule out. Change one of them.' : 'Cannot be solved: these dimensions ask for what the sketch cannot do at once. Change one of them.'}</p>{/if}
		{#if row?.message}<p class={row.status === 'error' ? 'refused' : 'note'} role={row.status === 'error' ? 'alert' : 'status'} data-testid="ideacad-dimension-message">{row.message}</p>{/if}
		{#if dimensions.length}
			<ul class="driving">
				{#each dimensions as d (d.key)}
					<li class:trouble={trouble.has(d.key)} data-dimension={d.key}>
						{#if api.canWrite}
							<form onsubmit={(e) => { e.preventDefault(); void submit(d, typed(e.currentTarget)); }}>
								<label>
									<span class="words">{d.label}{#if d.detail}<small>{d.detail}</small>{/if}{#if trouble.has(d.key)}<em>conflicts</em>{/if}</span>
									<span class="field"><input name="value" autocomplete="off" spellcheck="false" value={editText(d.value)} /><span class="unit">{unitWord(d.unit)}</span></span>
								</label>
								<button type="submit" disabled={api.busy}>Set</button>
							</form>
						{:else}
							<div class="readonly"><span class="words">{d.label}{#if d.detail}<small>{d.detail}</small>{/if}</span><output>{formatDimension(d.value, d.unit)}</output></div>
						{/if}
					</li>
				{/each}
			</ul>
		{:else if feature}
			<p class="note">{feature.name} has no number to type. Its shape comes from what it was made on.</p>
		{/if}
		{#if measured.length}
			<dl class="measured">
				{#each measured as m (m.key)}<div><dt>{m.label} <span class="tag">measured</span></dt><dd>{formatDimension(m.value, m.unit)}</dd></div>{/each}
			</dl>
		{/if}
	</section>
{/if}
<style>
	.dimensions{display:grid;gap:8px}h2{margin:0;font-size:18px}h2 span{color:var(--text-2);font:12px 'Share Tech Mono',monospace;margin-left:6px}
	.note,.refused{margin:0;font-size:14px;line-height:1.4;color:var(--text-2)}.refused{color:var(--ic-fail-ink,var(--amber))}
	ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}li{border:1px solid transparent;border-radius:4px}li.trouble{border-color:var(--ic-warn,var(--amber))}
	form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:end}
	label{display:grid;gap:4px;min-width:0;font:600 14px Rajdhani,sans-serif;color:var(--text-2)}
	.words{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline}.words small{font:12px 'Share Tech Mono',monospace;color:var(--text-2)}.words em{font:12px 'Share Tech Mono',monospace;font-style:normal;color:var(--ic-warn,var(--amber))}
	/* `padding:0` is stated because the room gives a span inside a label 9.6px of vertical padding (measured: 63.2px tall around a 42px input). The 44px floor is the field's `min-height`, never a height. */
	.field{display:flex;align-items:center;min-width:0;min-height:44px;padding:0;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-0)}
	/* `width:0` with `flex:1 1 0` takes the box's own intrinsic width (about 150px for an input) out of the row's minimum, which in a 260px panel pushed the unit word past the panel's edge and under the Set button. */
	.field input{flex:1 1 0;width:0;min-width:0;min-height:42px;border:0;background:transparent;color:var(--text-1);padding:0 8px;font:16px 'Share Tech Mono',monospace}.field input:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}
	.unit{padding:0 8px;font:12px 'Share Tech Mono',monospace;color:var(--text-2)}
	button{min-height:44px;min-width:44px;padding:0 12px;border:1px solid var(--green);border-radius:4px;background:var(--surface-0);color:var(--green);font:600 16px Rajdhani,sans-serif;cursor:pointer}button:disabled{opacity:.4;cursor:default}
	.readonly{display:flex;justify-content:space-between;gap:8px;min-height:44px;align-items:center;padding:0 8px;font:600 14px Rajdhani,sans-serif;color:var(--text-2)}output{font:14px 'Share Tech Mono',monospace;color:var(--text-1)}
	dl{margin:0;display:grid;gap:4px;padding-top:6px;border-top:1px solid var(--hairline)}dl div{display:flex;justify-content:space-between;gap:8px;align-items:baseline}dt{font:600 14px Rajdhani,sans-serif;color:var(--text-2)}dd{margin:0;font:14px 'Share Tech Mono',monospace;color:var(--text-1)}.tag{font:11px 'Share Tech Mono',monospace;color:var(--ic-meta,var(--cyan))}
</style>
