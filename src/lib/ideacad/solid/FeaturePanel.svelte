<script lang="ts">
	/**
	 * THE FEATURE OPTIONS PANEL: what a blend or a feature tool needs beyond a
	 * drag -- multi-edge selection, tangent propagation, a variable end radius,
	 * the second chamfer distance or an angle, the hole standard and fit,
	 * per-face shell thickness -- and the features that have no drag at all
	 * (draft, sweep, loft), which are built here from the selection and sent
	 * through `api.apply`.
	 *
	 * TWO WAYS OUT, ONE SET OF OPTIONS. Every option box is mirrored into
	 * `features/options.ts` as it changes, so a DRAG in the viewport (which
	 * builds the feature in `SolidWorkspace.svelte`'s `commandFor` through
	 * `withOptions`) and the TYPED button here produce the same feature; the
	 * button is also how a value is entered exactly, which a drag cannot do.
	 *
	 * NOTHING IS CLAMPED. A box is a text field with a decimal keyboard and no
	 * min, max or step; a value goes to the feature as typed and what the
	 * kernel refuses is the feature row's sentence, or the workspace's message
	 * strip when the feature is the one being added. The one refusal made here
	 * is that a number IS one, in the executor's own words.
	 *
	 * The tool is read as a STRING so that a tool the palette does not list
	 * yet (`draft`, `sweep`, `loft`) opens the same section the moment it does;
	 * until then those live under "More features" beside the blend tools.
	 */
	import type { WorkspaceApi } from './workspace-api';
	import type { AxisRef, EdgeRef, FaceRef, Feature, PlaneRef, Selection } from './types';
	import { refFromSelection } from './naming';
	import { featureOptions, holeFeatureAt, withOptions } from './features/options';
	import { HOLE_FIT_WORDS, HOLE_STANDARDS, describeHole, type HoleFit } from './features/holes';
	let { api }: { api: WorkspaceApi } = $props();
	const BLEND_TOOLS = ['fillet', 'chamfer', 'shell', 'hole'];
	const EXTRA_KINDS = ['draft', 'sweep', 'loft', 'rib'] as const;
	type Extra = (typeof EXTRA_KINDS)[number];
	const WORDS: Record<string, string> = { fillet: 'Fillet', chamfer: 'Chamfer', shell: 'Shell', hole: 'Hole', draft: 'Draft', sweep: 'Sweep', loft: 'Loft', rib: 'Rib' };
	const tool = $derived(api.tool as string);
	let extra = $state<Extra>('draft'), moreOpen = $state(false);
	const mode = $derived<string | null>(BLEND_TOOLS.includes(tool) || (EXTRA_KINDS as readonly string[]).includes(tool) ? tool : moreOpen ? extra : null);
	const edges = $derived(api.selections.filter((s) => s.kind === 'edge'));
	const faces = $derived(api.selections.filter((s) => s.kind === 'face'));
	const sketches = $derived(api.selections.filter((s) => s.kind === 'sketch'));
	/* A control renders whenever the document is writable and is DISABLED while the workspace is busy, so a press mid-replay is refused visibly rather than the button vanishing. */
	const editable = $derived(api.canWrite);
	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
	/* Option boxes. Strings, so a half-typed value is never coerced; mirrored into the store below. A select is one-way `value` plus `onchange` rather than `bind:value`: the binding reads the chosen option through `:checked`, which the DOM test harness cannot answer, and a real browser reads the same value either way. */
	let radius = $state('0.25'), propagate = $state(featureOptions.fillet.propagate), variableEnd = $state(featureOptions.fillet.variableEnd === null ? '' : String(featureOptions.fillet.variableEnd)), law = $state<'linear' | 'scurve'>(featureOptions.fillet.law);
	let distance = $state('0.1'), distance2 = $state(featureOptions.chamfer.distance2 === null ? '' : String(featureOptions.chamfer.distance2)), chamferAngle = $state(featureOptions.chamfer.angle === null ? '' : String(featureOptions.chamfer.angle)), chamferPropagate = $state(featureOptions.chamfer.propagate);
	let thickness = $state('0.1'), wallThickness = $state('0.2'), walls = $state<{ face: FaceRef; body: string; thickness: number }[]>(featureOptions.shell.faceThickness.map((t) => ({ face: t.face, body: t.face.body, thickness: t.thickness })));
	let standard = $state(featureOptions.hole.standard), fit = $state<HoleFit>(featureOptions.hole.fit), diameter = $state(featureOptions.hole.diameter === null ? '' : String(featureOptions.hole.diameter)), through = $state(featureOptions.hole.depth === 'through'), depth = $state(typeof featureOptions.hole.depth === 'number' ? String(featureOptions.hole.depth) : '0.5');
	let draftAngle = $state('3'), pull = $state<'X' | 'Y' | 'Z' | 'reference'>('Z'), neutral = $state<'XY' | 'XZ' | 'YZ' | 'reference'>('XY');
	let operation = $state<'new' | 'add' | 'cut'>('new'), smooth = $state(false);
	/** `Number('')` is 0, which is a number nobody typed; an empty box is not a number. */
	const number = (v: string) => (v.trim() === '' ? NaN : Number(v.trim()));
	/** An empty box means "not set"; anything else goes through as typed, and a non-number is the executor's refusal, not this panel's. */
	const optional = (v: string) => (v.trim() === '' ? null : Number(v.trim()));
	$effect(() => {
		featureOptions.fillet.propagate = propagate; featureOptions.fillet.variableEnd = optional(variableEnd); featureOptions.fillet.law = law;
		featureOptions.chamfer.propagate = chamferPropagate; featureOptions.chamfer.distance2 = optional(distance2); featureOptions.chamfer.angle = optional(chamferAngle);
		featureOptions.shell.faceThickness = walls.map((w) => ({ face: w.face, thickness: w.thickness }));
		featureOptions.hole.standard = standard; featureOptions.hole.fit = fit; featureOptions.hole.diameter = optional(diameter); featureOptions.hole.depth = through ? 'through' : number(depth);
	});
	const holeWords = $derived(describeHole(standard, fit, optional(diameter) ?? undefined));
	const refAxis = $derived(api.selections.find((s) => s.kind === 'reference' && api.model.references.find((r) => r.feature === s.id)?.kind === 'axis'));
	const refPlane = $derived(api.selections.find((s) => s.kind === 'reference' && api.model.references.find((r) => r.feature === s.id)?.kind === 'plane'));
	const bodyName = (id: string) => api.model.bodies.find((b) => b.id === id)?.name ?? id;
	const sketchName = (id: string) => api.model.sketches.find((s) => s.feature === id)?.name ?? id;
	const refuse = (e: unknown) => api.error(e instanceof Error ? e.message : String(e));
	function ref(s: Selection) { const body = api.model.bodies.find((b) => b.id === s.bodyId); if (!body) throw Error('Select something on a body.'); return refFromSelection(s, body); }
	/** Omit distributed over the feature union, so each member keeps its own discriminated fields. */
	type FeatureInput = Feature extends infer F ? (F extends Feature ? Omit<F, 'id' | 'name'> : never) : never;
	async function send(feature: FeatureInput, label: string) {
		try { await api.apply({ type: 'add-feature', feature: { id: '', name: '', ...feature } as Feature }, label); } catch (e) { refuse(e); }
	}
	/** A selected face becomes its edges, so a whole rim rounds or bevels at once. */
	function faceEdges() {
		const picked = faces.map((s) => ({ s, face: api.model.bodies.find((b) => b.id === s.bodyId)?.faces.find((f) => f.id === s.id) }));
		const ids = picked.flatMap(({ s, face }) => (face?.edges ?? []).map((id) => ({ bodyId: s.bodyId, kind: 'edge' as const, id })));
		if (!ids.length) { api.error('Select a face to take its edges.'); return; }
		api.select(null);
		for (const e of ids) api.select(e, true);
	}
	async function fillet() {
		const r = number(radius); if (!Number.isFinite(r)) { api.error('Enter a radius in inches, like 0.25.'); return; }
		if (!edges.length) { api.error('Select an edge to round. Shift-click adds more; a selected face gives all its edges.'); return; }
		try { await send(withOptions({ type: 'fillet', edges: edges.map((s) => ref(s) as EdgeRef), radius: r }), 'Fillet'); } catch (e) { refuse(e); }
	}
	async function chamfer() {
		const d = number(distance); if (!Number.isFinite(d)) { api.error('Enter a distance in inches, like 0.1.'); return; }
		if (!edges.length) { api.error('Select an edge to bevel. Shift-click adds more; a selected face gives all its edges.'); return; }
		try { await send(withOptions({ type: 'chamfer', edges: edges.map((s) => ref(s) as EdgeRef), distance: d }), 'Chamfer'); } catch (e) { refuse(e); }
	}
	function addWall() {
		const t = number(wallThickness); if (!Number.isFinite(t)) { api.error('Enter a wall thickness in inches, like 0.2.'); return; }
		if (faces.length !== 1) { api.error('Select one face to give its wall a thickness.'); return; }
		try { const face = ref(faces[0]) as FaceRef; walls = [...walls.filter((w) => !(w.face.body === face.body && w.face.name === face.name)), { face, body: faces[0].bodyId, thickness: t }]; api.select(null); } catch (e) { refuse(e); }
	}
	async function shell() {
		const t = number(thickness); if (!Number.isFinite(t)) { api.error('Enter a wall thickness in inches, like 0.1.'); return; }
		const bodyId = faces[0]?.bodyId ?? walls[0]?.body ?? api.selections.find((s) => s.bodyId)?.bodyId;
		if (!bodyId) { api.error('Select a face to open, or a body to hollow closed.'); return; }
		try { await send(withOptions({ type: 'shell', body: bodyId, thickness: t, openFaces: faces.map((s) => ref(s) as FaceRef) }), 'Shell'); } catch (e) { refuse(e); }
	}
	async function drill() {
		if (faces.length !== 1) { api.error('Select one face to drill.'); return; }
		const body = api.model.bodies.find((b) => b.id === faces[0].bodyId), face = body?.faces.find((f) => f.id === faces[0].id);
		if (!body || !face) { api.error('That face is no longer on the model. Select it again.'); return; }
		try { await send(holeFeatureAt(body, face, face.center), 'Drill hole'); } catch (e) { refuse(e); }
	}
	async function draft() {
		const a = number(draftAngle); if (!Number.isFinite(a)) { api.error('Enter a draft angle in degrees, like 3.'); return; }
		if (!faces.length) { api.error('Select the flat faces to draft.'); return; }
		const pullRef: AxisRef = pull === 'reference' ? (refAxis ? { kind: 'reference', feature: refAxis.id } : (api.error('Select a reference axis for the pull direction, or pick X, Y or Z.'), null)!) : { kind: 'datum', axis: pull };
		if (!pullRef) return;
		const neutralRef: PlaneRef = neutral === 'reference' ? (refPlane ? { kind: 'reference', feature: refPlane.id } : (api.error('Select a reference plane as the neutral plane, or pick XY, XZ or YZ.'), null)!) : { kind: 'datum', datum: neutral };
		if (!neutralRef) return;
		try { await send({ type: 'draft', faces: faces.map((s) => ref(s) as FaceRef), angle: a, pull: pullRef, neutral: neutralRef }, 'Draft'); } catch (e) { refuse(e); }
	}
	function target(): string | undefined {
		if (operation === 'new') return undefined;
		const id = api.selections.find((s) => s.bodyId && s.kind !== 'sketch')?.bodyId;
		if (!id) throw Error(`Shift-click a face or a body to ${operation === 'cut' ? 'cut' : 'add to'}, or choose New body.`);
		return id;
	}
	async function sweep() {
		if (!sketches.length) { api.error('Select the profile sketch first, then shift-click the path: an open sketch of lines and arcs, or edges of the model.'); return; }
		try {
			const path: string | EdgeRef[] = sketches[1] ? sketches[1].id : edges.map((s) => ref(s) as EdgeRef);
			if (typeof path !== 'string' && !path.length) throw Error('Shift-click the path: a second, open sketch, or edges of the model.');
			await send({ type: 'sweep', profile: sketches[0].id, path, operation, target: target() }, 'Sweep');
		} catch (e) { refuse(e); }
	}
	async function loft() {
		if (sketches.length < 2) { api.error('Select the first profile sketch, then shift-click each next one in order.'); return; }
		try { await send({ type: 'loft', profiles: sketches.map((s) => s.id), ...(smooth ? { smooth: true } : {}), operation, target: target() }, 'Loft'); } catch (e) { refuse(e); }
	}
</script>
{#if mode}
	<section class="feature panel" aria-label="Feature options" data-testid="ideacad-feature-panel" data-mode={mode}>
		<h2>{WORDS[mode]}</h2>
		{#if mode === 'fillet' || mode === 'chamfer'}
			<p class="picks" data-testid="ideacad-feature-picks">{plural(edges.length, 'edge')} selected. Shift-click adds more; drag any selected edge to size them together, or type a value below.</p>
			{#if faces.length}<button type="button" class="wide" onclick={faceEdges} data-testid="ideacad-feature-face-edges">Use the {plural(faces.length, 'face')}' edges instead</button>{/if}
			{#if mode === 'fillet'}
				<label>Radius (in)<input inputmode="decimal" bind:value={radius} data-testid="ideacad-fillet-radius" /></label>
				<label class="toggle"><input type="checkbox" bind:checked={propagate} data-testid="ideacad-fillet-propagate" /><span>Propagate along tangent edges <small>a selected edge carries the round on around every edge it meets smoothly</small></span></label>
				<label>Variable radius: end value (in) <small>leave empty for a constant radius</small><input inputmode="decimal" bind:value={variableEnd} data-testid="ideacad-fillet-variable-end" /></label>
				{#if variableEnd.trim() !== ''}<label>Radius law<select value={law} onchange={(e) => (law = e.currentTarget.value as 'linear' | 'scurve')} data-testid="ideacad-fillet-law"><option value="linear">Linear</option><option value="scurve">S-curve</option></select></label>{/if}
				{#if editable}<button type="button" class="wide primary" disabled={api.busy} onclick={() => void fillet()} data-testid="ideacad-fillet-apply">Round {plural(edges.length, 'edge')} at {radius.trim() || '?'} in</button>{/if}
			{:else}
				<label>Distance (in)<input inputmode="decimal" bind:value={distance} data-testid="ideacad-chamfer-distance" /></label>
				<label>Second distance (in) <small>empty means equal; ignored when an angle is set</small><input inputmode="decimal" bind:value={distance2} data-testid="ideacad-chamfer-distance2" /></label>
				<label>Angle (°) <small>empty means two distances; set, the second leg is distance × tan(angle)</small><input inputmode="decimal" bind:value={chamferAngle} data-testid="ideacad-chamfer-angle" /></label>
				<label class="toggle"><input type="checkbox" bind:checked={chamferPropagate} data-testid="ideacad-chamfer-propagate" /><span>Propagate along tangent edges <small>a selected edge carries the bevel on around every edge it meets smoothly</small></span></label>
				{#if editable}<button type="button" class="wide primary" disabled={api.busy} onclick={() => void chamfer()} data-testid="ideacad-chamfer-apply">Bevel {plural(edges.length, 'edge')} at {distance.trim() || '?'} in</button>{/if}
			{/if}
		{:else if mode === 'shell'}
			<p class="picks" data-testid="ideacad-feature-picks">{plural(faces.length, 'open face')} selected. Shift-click adds more; drag a selected face to set the wall, or type it below.</p>
			<label>Wall thickness (in)<input inputmode="decimal" bind:value={thickness} data-testid="ideacad-shell-thickness" /></label>
			<h3>Walls with their own thickness</h3>
			<label>Thickness for the selected face (in)<input inputmode="decimal" bind:value={wallThickness} data-testid="ideacad-shell-wall-thickness" /></label>
			{#if editable}<button type="button" class="wide" disabled={api.busy} onclick={addWall} data-testid="ideacad-shell-add-wall">Give the selected face this thickness</button>{/if}
			{#if walls.length}
				<ul class="walls" data-testid="ideacad-shell-walls">
					{#each walls as w (w.face.body + '/' + w.face.name)}
						<li><span>{bodyName(w.body)}, {w.face.name}: {w.thickness} in</span>{#if editable}<button type="button" disabled={api.busy} onclick={() => (walls = walls.filter((x) => x !== w))}>Remove</button>{/if}</li>
					{/each}
				</ul>
				<p class="note">Flat faces only; a wall listed here is not an open face.</p>
			{/if}
			{#if editable}<button type="button" class="wide primary" disabled={api.busy} onclick={() => void shell()} data-testid="ideacad-shell-apply">Shell at {thickness.trim() || '?'} in, {plural(faces.length, 'face')} open</button>{/if}
		{:else if mode === 'hole'}
			<p class="picks" data-testid="ideacad-feature-picks">{faces.length === 1 ? 'One face selected.' : `${plural(faces.length, 'face')} selected.`} Press on a flat face and drag a little to drill where you pressed, or drill at the selected face's center below.</p>
			<label>Size<select value={standard} onchange={(e) => (standard = e.currentTarget.value)} data-testid="ideacad-hole-standard">{#each HOLE_STANDARDS as s (s.id)}<option value={s.id}>{s.label}</option>{/each}</select></label>
			<fieldset class="fits" data-testid="ideacad-hole-fit"><legend>Fit</legend>
				{#each Object.entries(HOLE_FIT_WORDS) as [id, w] (id)}<label class="toggle"><input type="radio" name="ideacad-hole-fit" value={id} bind:group={fit} /><span>{w.word} <small>{w.sentence}</small></span></label>{/each}
			</fieldset>
			{#if fit === 'custom'}<label>Diameter (in)<input inputmode="decimal" bind:value={diameter} data-testid="ideacad-hole-diameter" /></label>{/if}
			<p class="readout" data-testid="ideacad-hole-words">Drills {holeWords}</p>
			<label class="toggle"><input type="checkbox" bind:checked={through} data-testid="ideacad-hole-through" /><span>Through all</span></label>
			{#if !through}<label>Depth (in)<input inputmode="decimal" bind:value={depth} data-testid="ideacad-hole-depth" /></label>{/if}
			{#if editable}<button type="button" class="wide primary" disabled={api.busy} onclick={() => void drill()} data-testid="ideacad-hole-apply">Drill at the face center</button>{/if}
		{:else if mode === 'draft'}
			<p class="picks" data-testid="ideacad-feature-picks">{plural(faces.length, 'flat face')} selected to draft. Shift-click adds more.</p>
			<label>Angle (°) <small>positive tilts a face outward along the pull; negative inward</small><input inputmode="decimal" bind:value={draftAngle} data-testid="ideacad-draft-angle" /></label>
			<label>Pull direction<select value={pull} onchange={(e) => (pull = e.currentTarget.value as typeof pull)} data-testid="ideacad-draft-pull"><option value="X">X axis</option><option value="Y">Y axis</option><option value="Z">Z axis</option><option value="reference">Selected reference axis</option></select></label>
			<label>Neutral plane <small>where the faces stay put</small><select value={neutral} onchange={(e) => (neutral = e.currentTarget.value as typeof neutral)} data-testid="ideacad-draft-neutral"><option value="XY">XY</option><option value="XZ">XZ</option><option value="YZ">YZ</option><option value="reference">Selected reference plane</option></select></label>
			{#if editable}<button type="button" class="wide primary" disabled={api.busy} onclick={() => void draft()} data-testid="ideacad-draft-apply">Draft {plural(faces.length, 'face')} at {draftAngle.trim() || '?'}°</button>{/if}
		{:else if mode === 'sweep' || mode === 'loft'}
			<p class="picks" data-testid="ideacad-feature-picks">{#if mode === 'sweep'}Profile: {sketches[0] ? sketchName(sketches[0].id) : 'none'}. Path: {sketches[1] ? sketchName(sketches[1].id) : edges.length ? plural(edges.length, 'model edge') : 'none'}. Select the profile sketch, then shift-click the path.{:else}{plural(sketches.length, 'profile')} selected{sketches.length ? `: ${sketches.map((s) => sketchName(s.id)).join(', ')}` : ''}. Select the first, then shift-click each next one in order.{/if}</p>
			{#if mode === 'loft'}<label class="toggle"><input type="checkbox" bind:checked={smooth} data-testid="ideacad-loft-smooth" /><span>Smooth <small>a curved surface through three or more profiles; off is ruled</small></span></label>{/if}
			<label>Result<select value={operation} onchange={(e) => (operation = e.currentTarget.value as typeof operation)} data-testid="ideacad-feature-operation"><option value="new">New body</option><option value="add">Add to the selected body</option><option value="cut">Cut from the selected body</option></select></label>
			{#if editable}<button type="button" class="wide primary" disabled={api.busy} onclick={() => void (mode === 'sweep' ? sweep() : loft())} data-testid="ideacad-{mode}-apply">{mode === 'sweep' ? 'Sweep the profile along the path' : `Loft ${plural(sketches.length, 'profile')}`}</button>{/if}
		{:else if mode === 'rib'}
			<p class="note" data-testid="ideacad-feature-picks">Rib is not built in this build: the kernel cannot extend an open sketch to the body. Draw the rib as a closed shape and extrude it instead.</p>
		{/if}
		<button type="button" class="more" aria-expanded={moreOpen} aria-controls="ideacad-feature-more" onclick={() => (moreOpen = !moreOpen)} data-testid="ideacad-feature-more">{moreOpen ? '▾' : '▸'} More features</button>
		<div id="ideacad-feature-more" class="extra" hidden={!moreOpen}>
			{#each EXTRA_KINDS as kind (kind)}<label class="toggle"><input type="radio" name="ideacad-feature-extra" value={kind} bind:group={extra} /><span>{WORDS[kind]}</span></label>{/each}
		</div>
	</section>
{/if}
<style>
	.feature{display:grid;gap:6px}h2{margin:0;font-size:18px}h3{margin:4px 0 0;font:600 15px Rajdhani,sans-serif;color:var(--text-1);border-bottom:1px solid var(--boundary);padding-bottom:4px}
	.picks,.note,.readout{margin:0;color:var(--text-2);font-size:14px;line-height:1.4}.readout{color:var(--text-1);font:14px 'Share Tech Mono',monospace}
	label{display:grid;gap:4px;font:600 14px Rajdhani,sans-serif;color:var(--text-2)}label small{font-weight:400;font-size:12px}
	input,select{min-height:44px;width:100%;box-sizing:border-box;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:16px Rajdhani,sans-serif;padding:0 8px}
	.toggle{display:flex;align-items:center;gap:8px;min-height:44px;color:var(--text-1);cursor:pointer}.toggle input{width:20px;height:20px;min-height:0;margin:0;flex-shrink:0}.toggle small{display:block;font-size:12px;color:var(--text-2);font-weight:400}
	.fits{margin:0;padding:0 8px 4px;border:1px solid var(--boundary);border-radius:4px;display:grid}.fits legend{font:600 14px Rajdhani,sans-serif;color:var(--text-2);padding:0 4px}
	.feature button{min-height:44px;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:600 15px Rajdhani,sans-serif;cursor:pointer;padding:0 10px}
	.feature button.wide{width:100%}.feature button.primary{border-color:var(--green);color:var(--green)}.feature button:disabled{opacity:.4;cursor:default}
	.walls{list-style:none;margin:0;padding:0;display:grid;gap:4px}.walls li{display:flex;justify-content:space-between;align-items:center;gap:8px;min-height:44px;font-size:14px;color:var(--text-1)}
	.more{text-align:left;background:transparent;border-color:transparent;color:var(--text-2)}.more[aria-expanded="true"]{color:var(--text-1)}
	.extra{display:grid}.extra[hidden]{display:none}
</style>
