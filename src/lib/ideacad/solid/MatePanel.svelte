<script lang="ts">
	/**
	 * MATES: create one between two selected entities, list the document's
	 * mates with their status, set a distance or angle exactly, and say in
	 * words what freedom each mated body has left.
	 *
	 * The first pick STAYS and the second MOVES to it, because that is the
	 * solver's rule (`mates/solve.ts`) and a student should know it before
	 * pressing Add. Every refusal goes through `api.error`, where every other
	 * refusal shows; nothing here pre-empts the solver -- a value is any finite
	 * number, and a mate the solver cannot hold is reported on its own row with
	 * the solver's sentence. Read-only is structural: with `canWrite` false no
	 * form, no Delete and no Fix control is rendered at all.
	 *
	 * The freedom sentence prefers the engine's own projection of the solver's
	 * report (`body.freedom`, requested); until that lands it is read off the
	 * projection through the same `chooseMover` / `freedomOf` the solver uses.
	 */
	import type { WorkspaceApi } from './workspace-api';
	import type { BodyProjection, EntityRef, MateKind, MateProjection, Selection } from './types';
	import { MATE_KINDS, MATE_WORDS } from './features/mate';
	import { residualUnit } from './mates/constraints';
	import { describeFreedom, type Freedom } from './mates/freedom';
	import { freedomFromProjection } from './mates/solve';
	import { refFromSelection } from './naming';
	let { api }: { api: WorkspaceApi } = $props();
	let kind = $state<MateKind>('coincident'), value = $state('0'), flip = $state(false);
	let edits = $state<Record<string, string>>({});
	const MATEABLE: Selection['kind'][] = ['face', 'edge', 'vertex', 'reference'];
	const picks = $derived(api.selections.filter((s) => MATEABLE.includes(s.kind)).slice(0, 2));
	const takesValue = (k: MateKind) => k === 'distance' || k === 'angle';
	const bodyName = (id: string) => api.model.bodies.find((b) => b.id === id)?.name ?? id;
	const referenceName = (id: string) => api.model.references.find((r) => r.feature === id)?.name ?? id;
	const mateName = (feature: string) => api.manifest.features.find((f) => f.id === feature)?.name ?? feature;
	const word = (k: Selection['kind'] | EntityRef['kind']) => (k === 'vertex' ? 'corner' : k);
	const describeSelection = (s: Selection) => (s.kind === 'reference' ? `${referenceName(s.id)} (reference)` : `${bodyName(s.bodyId)}, ${s.id} (${word(s.kind)})`);
	const describeRef = (r: EntityRef) => (r.kind === 'reference' ? referenceName(r.feature) : r.kind === 'body' ? bodyName(r.body) : r.kind === 'sketch-entity' ? `${r.feature}/${r.entity}` : r.kind === 'face' ? `${bodyName(r.body)} ${r.name}` : `${bodyName(r.body)} ${word(r.kind)} ${r.faces.join('|')}`);
	const freedoms = $derived(freedomFromProjection(api.model));
	const freedomOf = (b: BodyProjection): Freedom | undefined => (b as BodyProjection & { freedom?: Freedom }).freedom ?? freedoms.get(b.id);
	const mated = $derived(api.model.bodies.filter((b) => b.dof !== undefined || b.fixed || freedoms.has(b.id)));
	const offBy = (m: MateProjection) => { if (m.residual === undefined || !Number.isFinite(m.residual)) return null; const unit = residualUnit(m.kind); const n = m.residual < 1e-7 ? 0 : Number(m.residual.toPrecision(3)); return unit === 'deg' ? `${n} degrees` : `${n} in`; };
	const number = (text: string, k: MateKind) => { const t = text.trim(), n = Number(t); if (!t || !Number.isFinite(n)) throw Error(k === 'distance' ? 'Enter a distance in inches, like 0.25.' : 'Enter an angle in degrees, like 45.'); return n; };
	const refuse = (e: unknown) => api.error(e instanceof Error ? e.message : String(e));
	function toRef(s: Selection): EntityRef {
		if (s.kind === 'reference') return { kind: 'reference', feature: s.id };
		const body = api.model.bodies.find((b) => b.id === s.bodyId); if (!body) throw Error('Select something on a body.');
		return { kind: s.kind as 'face' | 'edge' | 'vertex', ...refFromSelection(s, body) } as EntityRef;
	}
	async function create() {
		try {
			if (picks.length < 2) throw Error('Select a face, edge or corner on one body, then shift-click one on another body. The first pick stays; the second moves to it.');
			const [a, b] = picks;
			if (a.bodyId && a.bodyId === b.bodyId) throw Error(`Mate two different bodies. Both picks are on ${bodyName(a.bodyId)}.`);
			if (!a.bodyId && !b.bodyId) throw Error('Pick at least one face, edge or corner on a body. Two references cannot move.');
			const v = takesValue(kind) ? number(value, kind) : undefined;
			await api.apply({ type: 'add-feature', feature: { id: '', name: '', type: 'mate', kind, a: toRef(a), b: toRef(b), ...(v !== undefined ? { value: v } : {}), ...(flip ? { flip: true } : {}) } }, `Add ${kind} mate`);
		} catch (e) { refuse(e); }
	}
	async function remove(m: MateProjection) { try { await api.apply({ type: 'remove-feature', id: m.feature }, 'Delete mate'); } catch (e) { refuse(e); } }
	async function setValue(m: MateProjection) { try { await api.apply({ type: 'set-feature', id: m.feature, patch: { value: number(edits[m.feature] ?? String(m.value ?? ''), m.kind) } }, `Set ${m.kind}`); } catch (e) { refuse(e); } }
	async function setFlip(m: MateProjection, next: boolean) { try { await api.apply({ type: 'set-feature', id: m.feature, patch: { flip: next || undefined } }, next ? 'Flip mate' : 'Unflip mate'); } catch (e) { refuse(e); } }
	async function fix(body: BodyProjection, fixed: boolean) { try { await api.apply({ type: 'metadata', bodyId: body.id, fixed }, fixed ? 'Fix body in place' : 'Unfix body'); } catch (e) { refuse(e); } }
	const flipped = (m: MateProjection) => !!(api.manifest.features.find((f) => f.id === m.feature) as { flip?: boolean } | undefined)?.flip;
</script>
<section class="mates panel" aria-label="Mates" data-testid="ideacad-mate-panel">
	<h2>Mates <span>{api.model.mates.length}</span></h2>
	{#if api.canWrite}
		<form class="create" onsubmit={(e) => { e.preventDefault(); void create(); }}>
			<p class="picks" data-testid="ideacad-mate-picks">{#if picks.length >= 2}First (stays): {describeSelection(picks[0])}. Second (moves): {describeSelection(picks[1])}.{:else}Select a face, edge or corner on one body, then shift-click one on another body. The first pick stays; the second moves to it.{/if}</p>
			<fieldset class="kinds" data-testid="ideacad-mate-kind"><legend>Kind</legend>{#each MATE_KINDS as k (k)}<label class="check kind-option"><input type="radio" name="mate-kind" value={k} bind:group={kind} /> {MATE_WORDS[k]}</label>{/each}</fieldset>
			{#if takesValue(kind)}<label>{kind === 'distance' ? 'Distance (in)' : 'Angle (degrees)'}<input type="text" inputmode="decimal" bind:value data-testid="ideacad-mate-value" /></label>{/if}
			<label class="check"><input type="checkbox" bind:checked={flip} /> Flip</label>
			<button type="submit" disabled={api.busy} data-testid="ideacad-mate-add">Add {MATE_WORDS[kind].toLowerCase()} mate</button>
		</form>
	{/if}
	{#if !api.model.mates.length}<p class="note">No mates yet. A mate fits two bodies together and keeps them there when either changes.</p>{/if}
	{#if mated.length}
		<ul class="bodies" aria-label="Freedom left per body">
			{#each mated as body (body.id)}
				<li data-body={body.id}>
					<p class="freedom">{describeFreedom(body.name, freedomOf(body), body.fixed)}</p>
					{#if api.canWrite}<label class="check"><input type="checkbox" checked={!!body.fixed} disabled={api.busy} onchange={(e) => void fix(body, e.currentTarget.checked)} /> Fix in place</label>{/if}
				</li>
			{/each}
		</ul>
	{/if}
	<ul class="list">
		{#each api.model.mates as mate (mate.feature)}
			<li class={mate.status} data-mate={mate.feature}>
				<div class="head"><strong>{mateName(mate.feature)}</strong><span class="kind">{MATE_WORDS[mate.kind]}</span><span class="status">{mate.status === 'ok' ? 'Holds' : 'Not solved'}</span></div>
				<p class="sides">{describeRef(mate.a)} to {describeRef(mate.b)}</p>
				{#if offBy(mate) !== null}<p class="residual">Off by {offBy(mate)}</p>{/if}
				{#if mate.message}<p class="message" role="status">{mate.message}</p>{/if}
				{#if api.canWrite}
					<div class="actions">
						{#if takesValue(mate.kind)}<form class="set" onsubmit={(e) => { e.preventDefault(); void setValue(mate); }}><label>{mate.kind === 'distance' ? 'Distance (in)' : 'Angle (degrees)'}<input type="text" inputmode="decimal" value={edits[mate.feature] ?? String(mate.value ?? '')} oninput={(e) => { edits[mate.feature] = e.currentTarget.value; }} /></label><button type="submit" disabled={api.busy}>Set</button></form>{/if}
						<label class="check"><input type="checkbox" checked={flipped(mate)} disabled={api.busy} onchange={(e) => void setFlip(mate, e.currentTarget.checked)} /> Flip</label>
						<button type="button" class="delete" disabled={api.busy} onclick={() => void remove(mate)}>Delete</button>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
</section>
<style>
	.mates{display:grid;gap:10px}h2{margin:0;font-size:18px}h2 span{color:var(--text-2);font:12px var(--font-mono,'Share Tech Mono',monospace);margin-left:6px}
	.note,p{margin:0;color:var(--text-2);font-size:14px;line-height:1.4}
	form.create{display:grid;gap:6px;padding-bottom:8px;border-bottom:1px solid var(--boundary)}
	label{display:grid;gap:4px;font:600 14px var(--font-display,Rajdhani,sans-serif);color:var(--text-2)}
	label.check{display:flex;align-items:center;gap:8px;min-height:44px;color:var(--text-1);cursor:pointer}label.check input{width:22px;height:22px;min-height:0;margin:0;padding:0;flex:none}
	fieldset.kinds{margin:0;padding:0 8px 4px;border:1px solid var(--boundary);border-radius:4px;display:grid;grid-template-columns:1fr 1fr;gap:0 8px}fieldset.kinds legend{padding:0 4px;font:600 14px var(--font-display,Rajdhani,sans-serif);color:var(--text-2)}
	input,button{min-height:44px;width:100%;box-sizing:border-box;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:16px var(--font-display,Rajdhani,sans-serif);padding:0 8px}
	button{cursor:pointer;color:var(--green);border-color:var(--green)}button:disabled{opacity:.4;cursor:default}
	ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
	.bodies li{display:grid;gap:2px;padding:6px 8px;border:1px dashed var(--boundary);border-radius:4px}.freedom{color:var(--text-1)}
	.list li{display:grid;gap:4px;padding:6px 8px;border:1px solid var(--boundary);border-radius:4px}.list li.error{border-color:var(--ic-warn,var(--amber))}
	.head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.head strong{color:var(--text-1)}.kind{color:var(--text-2);font:12px var(--font-mono,'Share Tech Mono',monospace)}
	.status{margin-left:auto;font:600 12px var(--font-mono,'Share Tech Mono',monospace);color:var(--green)}li.error .status{color:var(--ic-warn,var(--amber))}
	.message{color:var(--ic-fail-ink,#e07474)}.residual{font:12px var(--font-mono,'Share Tech Mono',monospace)}
	.actions{display:grid;gap:6px}form.set{display:grid;grid-template-columns:1fr auto;gap:6px;align-items:end}form.set button{width:auto;padding:0 14px}
	button.delete{color:var(--ic-fail-ink,#e07474);border-color:var(--boundary)}
</style>
