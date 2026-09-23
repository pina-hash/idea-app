<script lang="ts">
	/**
	 * THE SECTION VIEW: pick a plane -- a datum, a reference plane in the
	 * document, or the selected flat face -- give it an offset and a flip, and
	 * `api.clip(plane)` cuts everything on the plane's normal side away. Off
	 * puts the whole model back, and so does closing the panel.
	 *
	 * The clip is a VIEW, not a feature: nothing is written to the document,
	 * and the plane is recomputed from the projection each time it renders, so
	 * a section through a face follows that face when the model changes.
	 *
	 * `api.clip` is injected code and is called inside `untrack`; the effect
	 * tracks only the resolved plane and the on/off state.
	 */
	import { onDestroy, untrack } from 'svelte';
	import type { WorkspaceApi } from './workspace-api';
	import type { ResolvedPlane, Vec3 } from './types';
	import { datumPlane, planeFromNormal } from './sketch/model';
	let { api }: { api: WorkspaceApi } = $props();
	let source = $state<string>('XY'), offset = $state('0'), flip = $state(false), on = $state(false);
	const number = (v: string) => (v.trim() === '' ? NaN : Number(v.trim()));
	const planes = $derived(api.model.references.filter((r) => r.kind === 'plane'));
	const face = $derived.by(() => { const s = api.selections.find((x) => x.kind === 'face'); if (!s) return null; const f = api.model.bodies.find((b) => b.id === s.bodyId)?.faces.find((x) => x.id === s.id); return f && f.kind === 'plane' ? f : null; });
	const base = $derived.by((): ResolvedPlane | null => {
		if (source === 'XY' || source === 'XZ' || source === 'YZ') return datumPlane(source);
		if (source === 'face') return face ? planeFromNormal(face.normal, face.center) : null;
		const r = planes.find((p) => `ref:${p.feature}` === source);
		return r && r.normal && r.u && r.v ? { origin: r.origin, u: r.u, v: r.v, normal: r.normal } : null;
	});
	const scale = (a: Vec3, n: number): Vec3 => [a[0] * n, a[1] * n, a[2] * n];
	const plane = $derived.by((): ResolvedPlane | null => {
		const d = number(offset); if (!base || !Number.isFinite(d)) return null;
		const origin: Vec3 = [base.origin[0] + base.normal[0] * d, base.origin[1] + base.normal[1] * d, base.origin[2] + base.normal[2] * d];
		return flip ? { origin, u: base.u, v: scale(base.v, -1), normal: scale(base.normal, -1) } : { ...base, origin };
	});
	const why = $derived(source === 'face' && !face ? 'Select a flat face to section through.' : !Number.isFinite(number(offset)) ? 'Enter an offset in inches, like 0.5.' : base ? '' : 'That reference plane is no longer in the document.');
	$effect(() => { const p = on ? plane : null; untrack(() => api.clip(p)); });
	function start() { if (!plane) { api.error(why); return; } on = true; }
	function lookAt() { if (!plane) { api.error(why); return; } api.lookAt(plane); }
	onDestroy(() => api.clip(null));
</script>
<section class="section panel" aria-label="Section view" data-testid="ideacad-section-panel">
	<h2>Section view</h2>
	<label>Plane<select value={source} onchange={(e) => (source = e.currentTarget.value)} data-testid="ideacad-section-source">
		<option value="XY">XY datum</option><option value="XZ">XZ datum</option><option value="YZ">YZ datum</option>
		{#each planes as p (p.feature)}<option value={`ref:${p.feature}`}>{p.name} (reference)</option>{/each}
		<option value="face">Selected flat face{face ? `: ${face.id}` : ''}</option>
	</select></label>
	<label>Offset (in)<input inputmode="decimal" bind:value={offset} data-testid="ideacad-section-offset" /></label>
	<label class="toggle"><input type="checkbox" bind:checked={flip} data-testid="ideacad-section-flip" /><span>Flip side</span></label>
	<p class="state" data-testid="ideacad-section-state" role="status">{on ? (plane ? 'Sectioned.' : `Section paused: ${why}`) : 'Off.'}</p>
	<div class="actions">
		{#if on}<button type="button" class="primary" aria-pressed="true" onclick={() => (on = false)} data-testid="ideacad-section-off">Off</button>{:else}<button type="button" class="primary" aria-pressed="false" onclick={start} data-testid="ideacad-section-on">Section</button>{/if}
		<button type="button" onclick={lookAt} data-testid="ideacad-section-look">Look at</button>
	</div>
</section>
<style>
	.section{display:grid;gap:8px}h2{margin:0;font-size:18px}
	.state{margin:0;line-height:1.4;font:14px 'Share Tech Mono',monospace;color:var(--text-1)}
	label{display:grid;gap:4px;font:600 14px Rajdhani,sans-serif;color:var(--text-2)}label small{font-weight:400;font-size:12px}
	input,select{min-height:44px;width:100%;box-sizing:border-box;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:16px Rajdhani,sans-serif;padding:0 8px}
	.toggle{display:flex;align-items:center;gap:8px;min-height:44px;color:var(--text-1);cursor:pointer}.toggle input{width:20px;height:20px;min-height:0;margin:0;flex-shrink:0}
	.actions{display:flex;gap:4px}.section .actions button{flex:1;min-height:44px;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:600 15px Rajdhani,sans-serif;cursor:pointer}
	.section .actions button.primary{border-color:var(--green);color:var(--green)}
</style>
