<script lang="ts">
	/**
	 * THE MEASURE TOOL: the first two picks are measured through the engine
	 * (`api.request('measure', {a, b})`, `engine.measure`) and the answer is
	 * shown as a word, a number and a unit, with a witness line drawn between
	 * the two closest points through `api.guide` when the engine names them.
	 *
	 * One pick reads its own size: an edge's length, a face's area, a body's
	 * volume. Two picks read what is between them: corner to corner, corner to
	 * face or edge, body to body, and two flat faces (a distance when they are
	 * parallel, otherwise the angle between them). The engine decides which
	 * pairs it can answer and its refusal is shown where every other refusal
	 * shows; nothing here re-derives geometry.
	 *
	 * THE REQUEST IS INJECTED CODE AND RUNS UNTRACKED: the effect tracks the
	 * picks (the ids, so a re-projection with the same selection re-asks
	 * nothing) and hands them to `run` inside `untrack`, per the rule in
	 * `CLAUDE.md` about effects that call a transport.
	 */
	import { onDestroy, untrack } from 'svelte';
	import type { WorkspaceApi } from './workspace-api';
	import { selectionWords } from './mates/words';
	import type { Selection, Vec3 } from './types';
	let { api }: { api: WorkspaceApi } = $props();
	type Measurement = { kind: string; value: number; points?: [Vec3, Vec3] };
	const MEASURABLE: Selection['kind'][] = ['vertex', 'edge', 'face', 'body'];
	const WORDS: Record<string, { word: string; unit: string }> = { length: { word: 'Edge length', unit: ' in' }, area: { word: 'Face area', unit: ' in²' }, volume: { word: 'Body volume', unit: ' in³' }, distance: { word: 'Distance', unit: ' in' }, angle: { word: 'Angle', unit: '°' } };
	const GUIDE = '#a5ecff';
	const picks = $derived(api.selections.filter((s) => MEASURABLE.includes(s.kind)).slice(0, 2));
	const key = $derived(picks.map((p) => `${p.bodyId}/${p.kind}/${p.id}`).join(' + '));
	let result = $state<Measurement | null>(null), pending = $state(false);
	let current = '';
	/* A pick reads as the Mates panel reads it ("Body 1, hole wall"), never as a construction id (F034). */
	const describe = (s: Selection) => (s.kind === 'body' ? `${selectionWords({ model: api.model, manifest: api.manifest }, s)} (body)` : selectionWords({ model: api.model, manifest: api.manifest }, s));
	const shown = $derived(result ? `${Number(result.value.toFixed(4))}${WORDS[result.kind]?.unit ?? ''}` : '');
	$effect(() => {
		const k = key, list = picks;
		untrack(() => { void run(list, k); });
	});
	async function run(list: Selection[], k: string) {
		current = k; api.clearGuides(); result = null;
		if (!list.length) return;
		pending = true;
		try {
			const r = await api.request<Measurement>('measure', { a: list[0], b: list[1] });
			if (current !== k) return;
			result = r;
			if (r.points) api.guide(r.points, GUIDE);
		} catch (e) { if (current === k) api.error(e instanceof Error ? e.message : String(e)); }
		finally { if (current === k) pending = false; }
	}
	onDestroy(() => api.clearGuides());
</script>
<section class="measure panel" aria-label="Measure" data-testid="ideacad-measure-panel">
	<h2>Measure</h2>
	<ol class="picks" data-testid="ideacad-measure-picks">
		{#each picks as p, i (p.bodyId + '/' + p.kind + '/' + p.id)}<li><span class="ordinal">{i === 0 ? 'First' : 'Second'}</span> {describe(p)}</li>{/each}
		{#if !picks.length}<li class="empty">Nothing selected yet.</li>{/if}
	</ol>
	<output class="result" aria-live="polite" data-testid="ideacad-measure-result">
		{#if result}<span class="word">{WORDS[result.kind]?.word ?? result.kind}</span><span class="value">{shown}</span>{:else if pending}<span class="word">Measuring…</span>{:else if picks.length}<span class="word">No reading for this pair.</span>{/if}
	</output>
	{#if picks.length}<button type="button" onclick={() => api.select(null)} data-testid="ideacad-measure-clear">Clear picks</button>{/if}
</section>
<style>
	.measure{display:grid;gap:8px}h2{margin:0;font-size:18px}
	.picks{margin:0;padding:0;list-style:none;display:grid;gap:4px;font-size:14px;color:var(--text-1)}.picks .ordinal{font:12px 'Share Tech Mono',monospace;color:var(--text-2);margin-right:6px}.picks .empty{color:var(--text-2)}
	.result{display:grid;gap:2px;min-height:44px;padding:6px 8px;border:1px solid var(--hairline);border-radius:4px;background:var(--surface-0)}
	.result .word{font:600 14px Rajdhani,sans-serif;color:var(--text-2)}.result .value{font:20px 'Share Tech Mono',monospace;color:var(--text-1)}
	.measure button{min-height:44px;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:600 15px Rajdhani,sans-serif;cursor:pointer;padding:0 10px}
</style>
