<script lang="ts">
	/**
	 * MATES: fit two parts together by what the moving part should DO (a
	 * joint: hinge, slider, cylindrical, planar, fixed) or by one geometric mate,
	 * list what holds each part and how much freedom it has left, and set a
	 * distance or angle exactly.
	 *
	 * A joint is its geometric mates added as ONE command (`batch`, one undo,
	 * one history label); `mates/joints.ts` reads the picks as pairs, fills the
	 * joint's slots, and refuses a set of picks in words BEFORE anything is
	 * added -- a pair of shapes that cannot pair, two picks on one part, or a
	 * set whose freedom (the solver's own Jacobian) is not the joint's promise.
	 * A single mate is checked the same way against the solver's pairing rule.
	 * The Add control stays focusable and says why when it cannot add
	 * (`aria-disabled`, never `disabled`). Every refusal goes through
	 * `api.error`. Read-only is structural: with `canWrite` false no form, no
	 * Delete and no Fix control is rendered at all.
	 *
	 * Names are readable (`mates/words.ts`): a face is its part and its role in
	 * the feature that made it ("Plate, hole wall"), never a stored id.
	 */
	import type { WorkspaceApi } from './workspace-api';
	import type { BodyProjection, JointKind, MateKind, MateProjection, SolidCommand } from './types';
	import { MATE_KINDS, MATE_WORDS } from './features/mate';
	import { newFeatureId } from './features';
	import { residualUnit } from './mates/constraints';
	import { describeFreedom, type Freedom } from './mates/freedom';
	import { freedomFromProjection, mateTrouble } from './mates/solve';
	import { JOINTS, JOINT_KINDS, SHAPE_WORDS, mateFit, planJoint, selectionRef, type JointSlot, type PairShape } from './mates/joints';
	import { refWords, selectionWords } from './mates/words';
	let { api }: { api: WorkspaceApi } = $props();
	const uid = $props.id(), reasonId = `mate-reason-${uid}`;
	type Mode = JointKind | 'mate';
	let mode = $state<Mode>('hinge'), kind = $state<MateKind>('coincident'), value = $state('0'), flip = $state(false);
	let edits = $state<Record<string, string>>({});
	const MATEABLE = ['face', 'edge', 'vertex', 'reference'];
	const ctx = $derived({ model: api.model, manifest: api.manifest });
	const all = $derived(api.selections.filter((s) => MATEABLE.includes(s.kind)));
	const picks = $derived(all.slice(0, 2));
	const takesValue = (k: MateKind) => k === 'distance' || k === 'angle';
	const bodyName = (id: string | null) => (id ? api.model.bodies.find((b) => b.id === id)?.name ?? 'A body' : 'A reference');
	const featureOf = (id: string) => api.manifest.features.find((f) => f.id === id) as { name?: string; joint?: JointKind; group?: string; flip?: boolean } | undefined;
	const plan = $derived(mode === 'mate' ? null : planJoint(ctx, mode, all.slice(0, 6)));
	const typed = $derived.by(() => { const t = value.trim(), n = Number(t); return t && Number.isFinite(n) ? n : null; });
	/* Which single mate kinds these two picks can take, in the solver's own words. */
	const kindFit = $derived(mode === 'mate' && picks.length === 2 ? Object.fromEntries(MATE_KINDS.map((k) => [k, mateFit(ctx, k, picks[0], picks[1], takesValue(k) ? typed ?? 0 : undefined, flip)])) as Record<MateKind, string | null> : null);
	/* The cue for what a joint still wants, pair by pair: "Pick a round face on each part, then a flat face on each part." */
	const THING: Record<PairShape, string> = { round: 'a round face', flat: 'a flat face', line: 'a straight edge' };
	function wanted(slots: readonly JointSlot[]): string {
		const parts: string[] = [];
		for (let i = 0; i < slots.length; i += 2) { const filled = [slots[i], slots[i + 1]].filter((x) => x?.pick).length; if (filled < 2) parts.push(`${THING[slots[i].shape]} on ${filled ? 'the other part' : 'each part'}`); }
		return `Pick ${parts.join(', then ')}.`;
	}
	const blocked = $derived.by((): string | null => {
		if (mode !== 'mate') return plan!.reason ?? (plan!.ready ? null : wanted(plan!.slots));
		if (picks.length < 2) return picks.length ? 'Pick one on the part that moves.' : 'Pick one on each part.';
		if (takesValue(kind) && typed === null) return kind === 'distance' ? 'Enter a distance in inches, like 0.25.' : 'Enter an angle in degrees, like 45.';
		return kindFit?.[kind] ?? null;
	});
	const reasonShown = $derived(mode === 'mate' ? (picks.length === 2 ? blocked : null) : plan!.reason);
	const refuse = (e: unknown) => api.error(e instanceof Error ? e.message : String(e));
	const addWord = $derived(mode === 'mate' ? `Add ${MATE_WORDS[kind].toLowerCase()} mate` : `Add ${JOINTS[mode].word.toLowerCase()}`);
	async function create() {
		try {
			if (blocked) throw Error(blocked);
			if (mode === 'mate') {
				const [a, b] = picks, v = takesValue(kind) ? typed! : undefined;
				await api.apply({ type: 'add-feature', feature: { id: '', name: '', type: 'mate', kind, a: selectionRef(api.model, a), b: selectionRef(api.model, b), ...(v !== undefined ? { value: v } : {}), ...(flip ? { flip: true } : {}) } }, `Add ${kind} mate`);
				return;
			}
			const spec = JOINTS[mode], ids = plan!.mates.map(() => newFeatureId());
			const groups = new Set(api.manifest.features.filter((f) => f.type === 'mate' && (f as { joint?: string }).joint === mode).map((f) => (f as { group?: string }).group ?? f.id));
			const name = `${spec.word} ${groups.size + 1}`, pairWord = (k: MateKind) => (k === 'concentric' ? 'round' : 'flat');
			const commands: SolidCommand[] = plan!.mates.map((m, i) => ({ type: 'add-feature', feature: { id: ids[i], name: plan!.mates.length > 1 ? `${name} ${pairWord(m.kind)}${plan!.mates.filter((x, j) => j < i && x.kind === m.kind).length ? ` ${i + 1}` : ''}` : name, type: 'mate', kind: m.kind, a: m.a, b: m.b, joint: mode as JointKind, group: ids[0] } }));
			await api.apply({ type: 'batch', commands }, `Add ${spec.word.toLowerCase()}`);
		} catch (e) { refuse(e); }
	}
	interface Entry { id: string; joint: JointKind | null; name: string; mates: MateProjection[] }
	const entries = $derived.by(() => {
		const out: Entry[] = [], byGroup = new Map<string, Entry>();
		for (const m of api.model.mates) {
			const f = featureOf(m.feature), joint = f?.joint && JOINTS[f.joint] ? f.joint : null, key = joint ? f?.group ?? m.feature : m.feature;
			const found = byGroup.get(key);
			if (found) { found.mates.push(m); continue; }
			const entry: Entry = { id: key, joint, name: joint ? (f?.name ?? '').replace(/ (round|flat)( \d+)?$/, '') || JOINTS[joint].word : f?.name ?? 'Mate', mates: [m] };
			byGroup.set(key, entry); out.push(entry);
		}
		return out;
	});
	type Status = { word: string; tone: 'ok' | 'warn' | 'fail'; glyph: string };
	const GLYPH = { ok: 'M5 12l5 5 9-10', warn: 'M12 4l9 16H3zM12 10v4M12 17v.5', fail: 'M6 6l12 12M18 6L6 18', lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z', free: 'M12 3v18M3 12h18M7 7l-4 5 4 5M17 7l4 5-4 5', part: 'M4 12h16M12 4v16' };
	function mateStatus(m: MateProjection): Status {
		if (m.status === 'ok') return { word: 'Solved', tone: 'ok', glyph: GLYPH.ok };
		const t = mateTrouble(m.message);
		return t === 'redundant' ? { word: 'Redundant', tone: 'warn', glyph: GLYPH.warn } : t === 'conflict' ? { word: 'Conflict', tone: 'fail', glyph: GLYPH.fail } : { word: 'Not solved', tone: 'fail', glyph: GLYPH.fail };
	}
	const entryStatus = (e: Entry): Status => { const each = e.mates.map(mateStatus); return each.find((s) => s.tone === 'fail') ?? each.find((s) => s.tone === 'warn') ?? each[0]; };
	const freedoms = $derived(freedomFromProjection(api.model));
	const freedomOf = (b: BodyProjection): Freedom | undefined => b.freedom ?? freedoms.get(b.id);
	const mated = $derived(api.model.bodies.filter((b) => b.dof !== undefined || b.fixed || freedoms.has(b.id)));
	function bodyStatus(b: BodyProjection): Status {
		const f = freedomOf(b);
		if (b.fixed) return { word: 'Fixed', tone: 'ok', glyph: GLYPH.lock };
		if (!f || f.ground || f.dof === 6) return { word: 'Floating', tone: 'warn', glyph: GLYPH.free };
		if (f.dof === 0) return { word: 'Placed', tone: 'ok', glyph: GLYPH.ok };
		return { word: `${f.dof} free`, tone: 'ok', glyph: GLYPH.part };
	}
	const offBy = (m: MateProjection) => { if (m.residual === undefined || !Number.isFinite(m.residual)) return null; const unit = residualUnit(m.kind); const n = m.residual < 1e-7 ? 0 : Number(m.residual.toPrecision(3)); return unit === 'deg' ? `${n} degrees` : `${n} in`; };
	const number = (text: string, k: MateKind) => { const t = text.trim(), n = Number(t); if (!t || !Number.isFinite(n)) throw Error(k === 'distance' ? 'Enter a distance in inches, like 0.25.' : 'Enter an angle in degrees, like 45.'); return n; };
	async function remove(e: Entry) {
		try {
			if (e.mates.length === 1) await api.apply({ type: 'remove-feature', id: e.mates[0].feature }, e.joint ? `Delete ${JOINTS[e.joint].word.toLowerCase()}` : 'Delete mate');
			else await api.apply({ type: 'batch', commands: e.mates.map((m) => ({ type: 'remove-feature', id: m.feature })) }, `Delete ${e.joint ? JOINTS[e.joint].word.toLowerCase() : 'mates'}`);
		} catch (err) { refuse(err); }
	}
	async function setValue(m: MateProjection) { try { await api.apply({ type: 'set-feature', id: m.feature, patch: { value: number(edits[m.feature] ?? String(m.value ?? ''), m.kind) } }, `Set ${m.kind}`); } catch (e) { refuse(e); } }
	async function setFlip(m: MateProjection, next: boolean) { try { await api.apply({ type: 'set-feature', id: m.feature, patch: { flip: next || undefined } }, next ? 'Flip mate' : 'Unflip mate'); } catch (e) { refuse(e); } }
	async function fix(body: BodyProjection, fixed: boolean) { try { await api.apply({ type: 'metadata', bodyId: body.id, fixed }, fixed ? 'Fix body in place' : 'Unfix body'); } catch (e) { refuse(e); } }
	const firstEmpty = $derived(plan ? plan.slots.findIndex((s) => !s.pick) : picks.length < 2 ? picks.length : -1);
</script>
{#snippet glyph(path: string)}<svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>{/snippet}
<section class="mates panel" aria-label="Mates" data-testid="ideacad-mate-panel">
	<h2>Mates <span>{api.model.mates.length}</span></h2>
	{#if api.canWrite}
		<form class="create" onsubmit={(e) => { e.preventDefault(); void create(); }}>
			<fieldset class="modes" data-testid="ideacad-mate-joint"><legend>Joint</legend>
				{#each JOINT_KINDS as j (j)}<label class="tile" data-joint={j}><input type="radio" name="mate-mode" value={j} bind:group={mode} />{@render glyph(JOINTS[j].glyph)}<span class="t"><b>{JOINTS[j].word}</b><small>{JOINTS[j].dof} free</small></span></label>{/each}
				<label class="tile" data-joint="mate"><input type="radio" name="mate-mode" value="mate" bind:group={mode} />{@render glyph('M3 8h8v8H3zM13 8h8v8h-8zM11 12h2')}<span class="t"><b>One mate</b><small>any</small></span></label>
			</fieldset>
			{#if mode === 'mate'}
				<fieldset class="kinds" data-testid="ideacad-mate-kind"><legend>Kind</legend>{#each MATE_KINDS as k (k)}<label class="check kind-option" class:unfit={!!kindFit?.[k]}><input type="radio" name="mate-kind" value={k} bind:group={kind} /> {MATE_WORDS[k]}</label>{/each}</fieldset>
				{#if takesValue(kind)}<label class="value">{kind === 'distance' ? 'Distance (in)' : 'Angle (degrees)'}<input type="text" inputmode="decimal" bind:value data-testid="ideacad-mate-value" /></label>{/if}
				<ol class="slots" data-testid="ideacad-mate-picks">
					{#each ['Stays', 'Moves'] as role, i (role)}<li class:filled={!!picks[i]} class:next={i === firstEmpty}><span class="shape">{role}</span><span class="who">{picks[i] ? selectionWords(ctx, picks[i]) : 'Pick'}</span></li>{/each}
				</ol>
				<label class="check"><input type="checkbox" bind:checked={flip} /> Flip</label>
			{:else if plan}
				<ol class="slots" data-testid="ideacad-mate-picks">
					{#each plan.slots as slot, i (i)}<li class:filled={!!slot.pick} class:next={i === firstEmpty}><span class="shape">{SHAPE_WORDS[slot.shape]}</span><span class="who">{slot.words ?? 'Pick'}</span></li>{/each}
				</ol>
				{#if plan.stays !== null || plan.moves !== null}<p class="roles">{bodyName(plan.stays)} stays{#if plan.moves !== null}, {bodyName(plan.moves)} moves{/if}</p>{/if}
				{#if plan.ready && plan.sentence}<p class="result" data-testid="ideacad-mate-result">{plan.sentence}</p>{/if}
			{/if}
			{#if reasonShown}<p class="reason" id={reasonId} role="status" data-testid="ideacad-mate-reason">{@render glyph(GLYPH.warn)}<span>{reasonShown}</span></p>{/if}
			<button type="submit" class="add" aria-disabled={blocked || api.busy ? 'true' : undefined} aria-describedby={reasonShown ? reasonId : undefined} data-testid="ideacad-mate-add">{addWord}</button>
		</form>
	{/if}
	{#if !api.model.mates.length}<p class="note">No mates yet</p>{/if}
	{#if mated.length}
		<ul class="bodies" aria-label="Freedom left per body">
			{#each mated as body (body.id)}
				{@const s = bodyStatus(body)}
				<li data-body={body.id}>
					<p class="state {s.tone}" data-testid="ideacad-body-state">{@render glyph(s.glyph)}<span>{s.word}</span></p>
					<p class="freedom">{describeFreedom(body.name, freedomOf(body), body.fixed)}</p>
					{#if api.canWrite}<label class="check"><input type="checkbox" checked={!!body.fixed} disabled={api.busy} onchange={(e) => void fix(body, e.currentTarget.checked)} /> Fix in place</label>{/if}
				</li>
			{/each}
		</ul>
	{/if}
	<ul class="list">
		{#each entries as entry (entry.id)}
			{@const s = entryStatus(entry)}
			<li class={s.tone} data-mate={entry.mates[0].feature} data-joint={entry.joint ?? undefined}>
				<div class="head"><strong>{entry.name}</strong><span class="kind">{entry.joint ? `${JOINTS[entry.joint].word}, ${JOINTS[entry.joint].dof} free` : MATE_WORDS[entry.mates[0].kind]}</span><span class="status {s.tone}">{@render glyph(s.glyph)}{s.word}</span></div>
				{#each entry.mates as mate (mate.feature)}
					<p class="sides">{#if entry.joint}<span class="sub">{`${MATE_WORDS[mate.kind]}: `}</span>{/if}{refWords(ctx, mate.a)} to {refWords(ctx, mate.b)}</p>
					{#if offBy(mate) !== null && (mate.status !== 'ok' || !entry.joint)}<p class="residual">Off by {offBy(mate)}</p>{/if}
					{#if mate.message}<p class="message" role="status">{mate.message}</p>{/if}
				{/each}
				{#if api.canWrite}
					<div class="actions">
						{#if !entry.joint && takesValue(entry.mates[0].kind)}{@const mate = entry.mates[0]}<form class="set" onsubmit={(e) => { e.preventDefault(); void setValue(mate); }}><label>{mate.kind === 'distance' ? 'Distance (in)' : 'Angle (degrees)'}<input type="text" inputmode="decimal" value={edits[mate.feature] ?? String(mate.value ?? '')} oninput={(e) => { edits[mate.feature] = e.currentTarget.value; }} /></label><button type="submit" disabled={api.busy}>Set</button></form>{/if}
						{#if !entry.joint}{@const mate = entry.mates[0]}<label class="check"><input type="checkbox" checked={!!featureOf(mate.feature)?.flip} disabled={api.busy} onchange={(e) => void setFlip(mate, e.currentTarget.checked)} /> Flip</label>{/if}
						<button type="button" class="delete" disabled={api.busy} onclick={() => void remove(entry)}>Delete</button>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
</section>
<style>
	.mates{display:grid;gap:10px;min-width:0}h2{margin:0;font-size:18px}h2 span{color:var(--text-2);font:12px var(--font-mono,'Share Tech Mono',monospace);margin-left:6px}
	.note,p{margin:0;color:var(--text-2);font-size:14px;line-height:1.35;overflow-wrap:anywhere;min-width:0}
	form.create{display:grid;gap:6px;padding-bottom:8px;border-bottom:1px solid var(--hairline);min-width:0}
	label{display:grid;gap:4px;font:600 14px var(--font-display,Rajdhani,sans-serif);color:var(--text-2);min-width:0}
	label.check{display:flex;align-items:center;gap:8px;min-height:44px;color:var(--text-1);cursor:pointer}label.check input{width:22px;height:22px;min-height:0;margin:0;padding:0;flex:none}
	fieldset{margin:0;min-width:0;border:1px solid var(--hairline);border-radius:4px}legend{padding:0 4px;font:600 14px var(--font-display,Rajdhani,sans-serif);color:var(--text-2)}
	fieldset.modes{padding:2px 6px 6px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}
	.tile{position:relative;display:flex;align-items:center;gap:6px;min-height:44px;padding:2px 6px 2px 8px;border:1px solid var(--boundary);border-radius:4px;color:var(--text-1);cursor:pointer;box-sizing:border-box}
	.tile input{position:absolute;opacity:0;width:1px;height:1px;margin:0;min-height:0;pointer-events:none}
	.tile svg{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
	.tile .t{display:grid;min-width:0;line-height:1.1}.tile b{font:600 15px var(--font-display,Rajdhani,sans-serif);overflow-wrap:anywhere}.tile small{font:12px var(--font-mono,'Share Tech Mono',monospace);color:var(--text-2)}
	.tile:has(input:checked){border-color:var(--green);box-shadow:inset 4px 0 0 var(--green);background:var(--surface-2)}.tile:has(input:checked) b{color:var(--green)}
	.tile:has(input:focus-visible){outline:2px solid var(--green);outline-offset:1px}
	fieldset.kinds{padding:0 6px 4px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 6px}.kind-option.unfit{color:var(--text-2);text-decoration:line-through;text-decoration-thickness:1px}
	ol.slots{list-style:none;margin:0;padding:0;display:grid;gap:4px;min-width:0}
	.slots li{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:32px;padding:2px 8px;border:1px dashed var(--hairline);border-radius:4px}
	.slots li.filled{border-style:solid;border-color:var(--boundary)}.slots li.next{border-color:var(--green)}
	.slots .shape{font:12px var(--font-mono,'Share Tech Mono',monospace);color:var(--text-2);text-transform:uppercase}.slots .who{color:var(--text-1);font-size:14px;overflow-wrap:anywhere;min-width:0}.slots li:not(.filled) .who{color:var(--text-2)}
	.roles{font-size:13px}.result{color:var(--text-1)}
	.reason{display:grid;grid-template-columns:16px minmax(0,1fr);gap:6px;align-items:start;color:var(--text-1)}.reason svg{width:16px;height:16px;margin-top:2px;fill:none;stroke:var(--ic-warn,var(--amber));stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
	label.value input,form.set input,button{min-height:44px;width:100%;box-sizing:border-box;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:16px var(--font-display,Rajdhani,sans-serif);padding:0 10px}
	button{cursor:pointer;color:var(--green);border-color:var(--green)}button:disabled,button[aria-disabled='true']{opacity:.55;cursor:default}
	ul{list-style:none;margin:0;padding:0;display:grid;gap:6px;min-width:0}
	.bodies li{display:grid;gap:2px;padding:6px 8px;border:1px dashed var(--hairline);border-radius:4px;min-width:0}.freedom{color:var(--text-1)}
	.state,.status{display:inline-flex;align-items:center;gap:4px;font:600 12px var(--font-mono,'Share Tech Mono',monospace)}
	.state svg,.status svg{width:14px;height:14px;flex:none;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
	.ok{color:var(--green)}.warn{color:var(--ic-warn,var(--amber))}.fail{color:var(--ic-fail-ink,#e07474)}
	.list li{display:grid;gap:4px;padding:6px 8px;border:1px solid var(--boundary);border-radius:4px;min-width:0;color:inherit}.list li.fail{border-color:var(--ic-fail-ink,#e07474)}.list li.warn{border-color:var(--ic-warn,var(--amber))}
	.head{display:flex;align-items:baseline;gap:4px 8px;flex-wrap:wrap;min-width:0}.head strong{color:var(--text-1);overflow-wrap:anywhere}.kind{color:var(--text-2);font:12px var(--font-mono,'Share Tech Mono',monospace)}
	.head .status{margin-left:auto}
	.sides{color:var(--text-1)}.sub{font:12px var(--font-mono,'Share Tech Mono',monospace);color:var(--text-2)}
	.message{color:var(--ic-fail-ink,#e07474)}.residual{font:12px var(--font-mono,'Share Tech Mono',monospace)}
	.actions{display:grid;gap:6px;min-width:0}form.set{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:end;min-width:0}form.set button{width:auto;padding:0 14px}
	button.delete{color:var(--ic-fail-ink,#e07474);border-color:var(--boundary)}
</style>
