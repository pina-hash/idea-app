<script lang="ts">
	/**
	 * REFERENCE GEOMETRY: create planes, axes and points from the current
	 * selection or by construction, and list the ones the document has.
	 *
	 * THIS COMPONENT IS THE REFERENCE-GEOMETRY SURFACE'S TO REPLACE. The spine
	 * version offers the three constructions that need no selection -- an
	 * offset datum plane, a datum axis and a point by coordinates -- so the
	 * engine's reference features are reachable from the first commit.
	 */
	import type { WorkspaceApi } from './workspace-api';
	let { api }: { api: WorkspaceApi } = $props();
	let datum = $state<'XY' | 'XZ' | 'YZ'>('XY'), offset = $state('1'), axis = $state<'X' | 'Y' | 'Z'>('Z'), coords = $state('0, 0, 0');
	const number = (v: string) => { const n = Number(v); if (!Number.isFinite(n)) throw Error('Enter a finite number.'); return n; };
	async function plane() { try { await api.apply({ type: 'add-feature', feature: { id: '', name: '', type: 'plane', definition: { kind: 'offset', from: { kind: 'datum', datum }, offset: number(offset) } } }, 'Add plane'); } catch (e) { api.error(e instanceof Error ? e.message : String(e)); } }
	async function addAxis() { try { await api.apply({ type: 'add-feature', feature: { id: '', name: '', type: 'axis', definition: { kind: 'datum', axis } } }, 'Add axis'); } catch (e) { api.error(e instanceof Error ? e.message : String(e)); } }
	async function point() { try { const p = coords.split(',').map((s) => number(s.trim())); if (p.length !== 3) throw Error('Enter x, y, z.'); await api.apply({ type: 'add-feature', feature: { id: '', name: '', type: 'point', definition: { kind: 'coordinates', point: p as [number, number, number] } } }, 'Add point'); } catch (e) { api.error(e instanceof Error ? e.message : String(e)); } }
</script>
<section class="reference panel" aria-label="Reference geometry" data-testid="ideacad-reference-panel">
	<h2>Reference geometry</h2>
	<form onsubmit={(e) => { e.preventDefault(); void plane(); }}><label>Plane offset from<select bind:value={datum}><option>XY</option><option>XZ</option><option>YZ</option></select></label><label>Offset (in)<input inputmode="decimal" bind:value={offset} /></label><button disabled={!api.canWrite || api.busy}>Add plane</button></form>
	<form onsubmit={(e) => { e.preventDefault(); void addAxis(); }}><label>Axis along<select bind:value={axis}><option>X</option><option>Y</option><option>Z</option></select></label><button disabled={!api.canWrite || api.busy}>Add axis</button></form>
	<form onsubmit={(e) => { e.preventDefault(); void point(); }}><label>Point at x, y, z (in)<input bind:value={coords} /></label><button disabled={!api.canWrite || api.busy}>Add point</button></form>
	{#if api.model.references.length}<ul>{#each api.model.references as ref (ref.feature)}<li><button class:selected={api.selections.some((s) => s.id === ref.feature)} onclick={() => api.select({ bodyId: '', kind: 'reference', id: ref.feature })}>{ref.kind === 'plane' ? '▱' : ref.kind === 'axis' ? '│' : '·'} {ref.name}</button></li>{/each}</ul>{/if}
</section>
<style>
	.reference{display:grid;gap:10px}h2{margin:0;font-size:18px}form{display:grid;gap:6px;padding-bottom:8px;border-bottom:1px solid var(--boundary)}label{display:grid;gap:4px;font:600 14px Rajdhani,sans-serif;color:var(--text-2)}input,select,button{min-height:44px;width:100%;box-sizing:border-box;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:16px Rajdhani,sans-serif;padding:0 8px}button{cursor:pointer;color:var(--green);border-color:var(--green)}button:disabled{opacity:.4}ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}li button{text-align:left;color:var(--text-1);border-color:transparent}li button.selected{border-color:var(--green);color:var(--green)}
</style>
