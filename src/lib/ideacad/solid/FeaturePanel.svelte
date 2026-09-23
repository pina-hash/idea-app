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
	 * THE BLEND SECTION IS LABELS, VALUES AND ONE-CLICK WAYS FORWARD, NO PROSE.
	 * One pick grows into an edge set (tangent chain, the face's loop, the
	 * feature's edges, every edge, the outside or inside edges), each lit in
	 * the viewport while the pointer is over it (`features/blends.ts` computes
	 * them from the projection, no worker call). A refused round keeps the
	 * value the student typed; its row's sentence says what went wrong and a
	 * button applies the way forward the kernel search found (the largest size
	 * that fits, adding the edges to the earlier round they meet, the whole
	 * tangent chain). Variable radius sits behind a disclosure, closed.
	 *
	 * STICKY SIZES. The radius and distance boxes start at the last size used
	 * (kept in `featureOptions`, which the workspace saves with the student's
	 * preferences), and follow a round made or resized anywhere else: a drag,
	 * a typed number, a fix pressed. A box reading 0.25 beside a 0.2 round is
	 * the panel disagreeing with the model.
	 *
	 * A control that cannot act says why rather than going dead: while the
	 * workspace is busy it is `aria-disabled` and a press names the reason.
	 *
	 * The tool is read as a STRING so that a tool the palette does not list
	 * yet (`draft`, `sweep`, `loft`) opens the same section the moment it does;
	 * until then those live under "More features" beside the blend tools.
	 */
	import { untrack } from 'svelte';
	import { dev } from '$app/environment';
	import Disclosure from '$lib/Disclosure.svelte';
	import type { WorkspaceApi } from './workspace-api';
	import type { AxisRef, EdgeRef, FaceRef, Feature, FeatureFix, FeatureRow, PlaneRef, Selection } from './types';
	import { refFromSelection } from './naming';
	import { featureOptions, holeFeatureAt, withOptions } from './features/options';
	import { HOLE_FIT_WORDS, HOLE_STANDARDS, describeHole, type HoleFit } from './features/holes';
	import { edgeKey, edgeSet, edgeShape, facesByEdge, featureOfName, sizeFixFromSentence, type EdgeSetKind } from './features/blends';
	let { api }: { api: WorkspaceApi } = $props();
	const BLEND_TOOLS = ['fillet', 'chamfer', 'shell', 'hole'];
	const EXTRA_KINDS = ['draft', 'sweep', 'loft', 'rib'] as const;
	type Extra = (typeof EXTRA_KINDS)[number];
	const WORDS: Record<string, string> = { fillet: 'Fillet', chamfer: 'Chamfer', shell: 'Shell', hole: 'Hole', draft: 'Draft', sweep: 'Sweep', loft: 'Loft', rib: 'Rib' };
	/** The edge sets one pick grows into, in the order a student reaches for them. All comes before Feature and Outside, so on a one-feature box, where the three are the same edges, the plainest word is the one offered. */
	const GROW: { kind: EdgeSetKind; word: string; title: string }[] = [
		{ kind: 'chain', word: 'Chain', title: 'Tangent chain' }, { kind: 'loop', word: 'Loop', title: 'Around the face' }, { kind: 'body', word: 'All', title: 'Every edge of the body' },
		{ kind: 'feature', word: 'Feature', title: 'Every edge of this feature' }, { kind: 'convex', word: 'Outside', title: 'Outside (convex) edges' }, { kind: 'concave', word: 'Inside', title: 'Inside (concave) edges' }
	];
	const BUSY = 'Wait for the model to finish updating.';
	const tool = $derived(api.tool as string);
	let extra = $state<Extra>('draft'), moreOpen = $state(false);
	const mode = $derived<string | null>(BLEND_TOOLS.includes(tool) || (EXTRA_KINDS as readonly string[]).includes(tool) ? tool : moreOpen ? extra : null);
	const edges = $derived(api.selections.filter((s) => s.kind === 'edge'));
	const faces = $derived(api.selections.filter((s) => s.kind === 'face'));
	const sketches = $derived(api.selections.filter((s) => s.kind === 'sketch'));
	/* A control renders whenever the document is writable; while the workspace is busy it is aria-disabled and a press says why, so it neither vanishes nor goes dead. */
	const editable = $derived(api.canWrite);
	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
	/* Option boxes. Strings, so a half-typed value is never coerced; mirrored into the store below. A select is one-way `value` plus `onchange` rather than `bind:value`: the binding reads the chosen option through `:checked`, which the DOM test harness cannot answer, and a real browser reads the same value either way. */
	let radius = $state(String(featureOptions.fillet.radius ?? 0.25)), propagate = $state(featureOptions.fillet.propagate), variableEnd = $state(featureOptions.fillet.variableEnd === null ? '' : String(featureOptions.fillet.variableEnd)), law = $state<'linear' | 'scurve'>(featureOptions.fillet.law);
	let distance = $state(String(featureOptions.chamfer.distance ?? 0.1)), distance2 = $state(featureOptions.chamfer.distance2 === null ? '' : String(featureOptions.chamfer.distance2)), chamferAngle = $state(featureOptions.chamfer.angle === null ? '' : String(featureOptions.chamfer.angle)), chamferPropagate = $state(featureOptions.chamfer.propagate);
	let thickness = $state('0.1'), wallThickness = $state('0.2'), walls = $state<{ face: FaceRef; body: string; thickness: number }[]>(featureOptions.shell.faceThickness.map((t) => ({ face: t.face, body: t.face.body, thickness: t.thickness })));
	let standard = $state(featureOptions.hole.standard), fit = $state<HoleFit>(featureOptions.hole.fit), diameter = $state(featureOptions.hole.diameter === null ? '' : String(featureOptions.hole.diameter)), through = $state(featureOptions.hole.depth === 'through'), depth = $state(typeof featureOptions.hole.depth === 'number' ? String(featureOptions.hole.depth) : '0.5');
	let draftAngle = $state('3'), pull = $state<'X' | 'Y' | 'Z' | 'reference'>('Z'), neutral = $state<'XY' | 'XZ' | 'YZ' | 'reference'>('XY');
	let operation = $state<'new' | 'add' | 'cut'>('new'), smooth = $state(false), beforeShell = $state(false);
	/** `Number('')` is 0, which is a number nobody typed; an empty box is not a number. */
	const number = (v: string) => (v.trim() === '' ? NaN : Number(v.trim()));
	/** An empty box means "not set"; anything else goes through as typed, and a non-number is the executor's refusal, not this panel's. */
	const optional = (v: string) => (v.trim() === '' ? null : Number(v.trim()));
	/** A size worth keeping as the next default: any finite number, as typed. */
	const sticky = (v: string) => { const n = number(v); return Number.isFinite(n) ? n : undefined; };
	$effect(() => {
		featureOptions.fillet.propagate = propagate; featureOptions.fillet.variableEnd = optional(variableEnd); featureOptions.fillet.law = law;
		const r = sticky(radius); if (r === undefined) delete featureOptions.fillet.radius; else featureOptions.fillet.radius = r;
		featureOptions.chamfer.propagate = chamferPropagate; featureOptions.chamfer.distance2 = optional(distance2); featureOptions.chamfer.angle = optional(chamferAngle);
		const d = sticky(distance); if (d === undefined) delete featureOptions.chamfer.distance; else featureOptions.chamfer.distance = d;
		featureOptions.shell.faceThickness = walls.map((w) => ({ face: w.face, thickness: w.thickness }));
		featureOptions.hole.standard = standard; featureOptions.hole.fit = fit; featureOptions.hole.diameter = optional(diameter); featureOptions.hole.depth = through ? 'through' : number(depth);
	});
	/* The boxes follow a round or bevel made or resized anywhere: a drag, a typed number, a fix. The first reading only learns what is there, so opening a document keeps the student's own last size. */
	let known: Map<string, number> | null = null;
	$effect(() => {
		const features = api.manifest.features;
		untrack(() => {
			const next = new Map<string, number>();
			for (const f of features) {
				if (f.type !== 'fillet' && f.type !== 'chamfer') continue;
				const size = f.type === 'fillet' ? f.radius : f.distance;
				next.set(f.id, size);
				if (known && known.get(f.id) !== size && Number.isFinite(size)) { if (f.type === 'fillet') radius = String(size); else distance = String(size); }
			}
			known = next;
		});
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
	async function send(feature: FeatureInput, label: string, at?: number) {
		try { await api.apply({ type: 'add-feature', feature: { id: '', name: '', ...feature } as Feature, ...(at !== undefined ? { at } : {}) }, label); } catch (e) { refuse(e); }
	}

	/* ---------------------------------------------------------------- blends */
	/** The pick a set grows from: the last edge picked, else the last face; and its body. */
	const seed = $derived(edges.at(-1) ?? faces.at(-1));
	const seedBody = $derived(seed ? api.model.bodies.find((b) => b.id === seed.bodyId) : undefined);
	const beside = $derived(seedBody ? facesByEdge(seedBody) : null);
	/**
	 * Each set's edges and how many it would ADD. An edge with no corner (the
	 * one beside a round) is never in a set, since it cannot be rounded; a set
	 * that adds nothing, or holds exactly what an earlier set holds, is not
	 * offered, so the row carries no dead buttons.
	 */
	const sets = $derived.by(() => {
		if (!seed || !seedBody) return [];
		const body = seedBody, picked = new Set(edges.filter((s) => s.bodyId === body.id).map((s) => s.id)), shape = new Map<string, boolean>();
		const sharp = (id: string) => { if (!shape.has(id)) { const e = body.edges.find((x) => x.id === id); shape.set(id, !!e && edgeShape(body, e, beside ?? undefined) !== 'smooth'); } return shape.get(id)!; };
		const from = seed.kind === 'edge' ? { edge: seed.id } : { face: seed.id, feature: featureOfName(seed.id) };
		const seen = new Set<string>(), out: { kind: EdgeSetKind; word: string; title: string; ids: string[]; adds: number }[] = [];
		for (const g of GROW) {
			if (seed.kind !== 'edge' && (g.kind === 'chain' || g.kind === 'loop')) continue;
			const ids = edgeSet(body, g.kind, from).filter(sharp), key = [...ids].sort().join(','), adds = ids.filter((id) => !picked.has(id)).length;
			if (!adds || seen.has(key)) continue;
			seen.add(key); out.push({ ...g, ids, adds });
		}
		return out;
	});
	function preview(ids: string[] | null) { if (!seedBody || !ids) { api.hover?.(null); return; } const body = seedBody.id; api.hover?.(ids.map((id) => ({ bodyId: body, kind: 'edge', id }))); }
	/** Add a set to the picks. `select(s, true)` TOGGLES, so an edge already picked is skipped rather than dropped, and a picked face is dropped because its edges are what a round takes. */
	function grow(ids: string[]) {
		if (!seedBody) return;
		const body = seedBody.id, picked = new Set(edges.filter((s) => s.bodyId === body).map((s) => s.id));
		if (!edges.length) api.select(null);
		else for (const f of faces) api.select(f, true);
		for (const id of ids) if (!picked.has(id)) api.select({ bodyId: body, kind: 'edge', id }, true);
		api.hover?.(null);
	}
	/** A selected face becomes its edges, so a whole rim rounds or bevels at once. An edge that is already smooth (beside a round) has no corner, so it is left out and the count says so. */
	let leftOut = $state(0);
	function faceEdges() {
		let skipped = 0;
		const ids = faces.flatMap((s) => {
			const body = api.model.bodies.find((b) => b.id === s.bodyId), face = body?.faces.find((f) => f.id === s.id);
			return (face?.edges ?? []).filter((id) => { const e = body?.edges.find((x) => x.id === id); const keep = !e || !body || edgeShape(body, e) !== 'smooth'; if (!keep) skipped++; return keep; }).map((id) => ({ bodyId: s.bodyId, kind: 'edge' as const, id }));
		});
		if (!ids.length) { api.error(skipped ? 'Every edge of that face is already smooth, so there is no corner to round.' : 'Select a face to take its edges.'); return; }
		api.select(null);
		for (const e of ids) api.select(e, true);
		leftOut = skipped;
	}
	$effect(() => { if (!faces.length && !edges.length) leftOut = 0; });
	/** A shell already on the picked body, made after every face beside the picked edges, so the round can go in ahead of it and be shelled with the rest, which keeps the walls even. */
	const shellAhead = $derived.by(() => {
		if (!seedBody || !beside || !edges.length) return null;
		const features = api.manifest.features;
		const last = features.map((f, i) => ({ f, i })).filter(({ f }) => f.type === 'shell' && f.body === seedBody.id && !f.suppressed).at(-1);
		if (!last) return null;
		const madeBefore = (name: string) => { const i = features.findIndex((f) => f.id === featureOfName(name)); return i >= 0 && i < last.i; };
		const ok = edges.every((s) => { const around = beside.get(s.id) ?? []; return around.length > 0 && around.every((face) => madeBefore(face.id)); });
		return ok ? { name: last.f.name, at: last.i } : null;
	});
	$effect(() => { if (!shellAhead) beforeShell = false; });
	const at = () => (beforeShell && shellAhead ? shellAhead.at : undefined);
	async function fillet() {
		if (api.busy) { api.error(BUSY); return; }
		const r = number(radius); if (!Number.isFinite(r)) { api.error('Enter a radius in inches, like 0.25.'); return; }
		if (!edges.length) { api.error('Select an edge to round. Shift-click adds more; a selected face gives all its edges.'); return; }
		try { await send(withOptions({ type: 'fillet', edges: edges.map((s) => ref(s) as EdgeRef), radius: r }), 'Fillet', at()); } catch (e) { refuse(e); }
	}
	async function chamfer() {
		if (api.busy) { api.error(BUSY); return; }
		const d = number(distance); if (!Number.isFinite(d)) { api.error('Enter a distance in inches, like 0.1.'); return; }
		if (!edges.length) { api.error('Select an edge to bevel. Shift-click adds more; a selected face gives all its edges.'); return; }
		try { await send(withOptions({ type: 'chamfer', edges: edges.map((s) => ref(s) as EdgeRef), distance: d }), 'Chamfer', at()); } catch (e) { refuse(e); }
	}
	/** Refused rounds and bevels, each with its way forward: the row's own help, or the size read back out of its sentence until the engine carries help onto the row. */
	const refused = $derived(api.model.features.filter((r) => (r.type === 'fillet' || r.type === 'chamfer') && r.status === 'error').map((row) => ({ row, help: row.help ?? { fix: sizeFixFromSentence(row, api.manifest.features.find((f) => f.id === row.id)) ?? undefined } })));
	/** Light the edges a refusal is about, as the projection names them now. */
	function showWhere(where: Selection[] | undefined) {
		const out: Selection[] = [];
		for (const w of where ?? []) { const e = api.model.bodies.find((b) => b.id === w.bodyId)?.edges.find((x) => edgeKey(x.id) === edgeKey(w.id)); if (e) out.push({ ...w, id: e.id }); }
		api.hover?.(out.length ? out : null);
	}
	/** Press a fix: its commands in order, each an ordinary edit with its own undo. A command the workspace refuses leaves the document as it was, and the rest are not sent. */
	async function pressFix(row: FeatureRow, fix: FeatureFix) {
		if (api.busy) { api.error(BUSY); return; }
		for (const command of fix.commands) {
			const before = JSON.stringify(api.manifest.features);
			await api.apply(command, command.type === 'remove-feature' ? `Delete ${row.name}` : fix.label);
			if (JSON.stringify(api.manifest.features) === before) return;
		}
		api.hover?.(null);
	}
	/* ------------------------------------------------------------ the others */
	function addWall() {
		if (api.busy) { api.error(BUSY); return; }
		const t = number(wallThickness); if (!Number.isFinite(t)) { api.error('Enter a wall thickness in inches, like 0.2.'); return; }
		if (faces.length !== 1) { api.error('Select one face to give its wall a thickness.'); return; }
		try { const face = ref(faces[0]) as FaceRef; walls = [...walls.filter((w) => !(w.face.body === face.body && w.face.name === face.name)), { face, body: faces[0].bodyId, thickness: t }]; api.select(null); } catch (e) { refuse(e); }
	}
	async function shell() {
		if (api.busy) { api.error(BUSY); return; }
		const t = number(thickness); if (!Number.isFinite(t)) { api.error('Enter a wall thickness in inches, like 0.1.'); return; }
		const bodyId = faces[0]?.bodyId ?? walls[0]?.body ?? api.selections.find((s) => s.bodyId)?.bodyId;
		if (!bodyId) { api.error('Select a face to open, or a body to hollow closed.'); return; }
		try { await send(withOptions({ type: 'shell', body: bodyId, thickness: t, openFaces: faces.map((s) => ref(s) as FaceRef) }), 'Shell'); } catch (e) { refuse(e); }
	}
	async function drill() {
		if (api.busy) { api.error(BUSY); return; }
		if (faces.length !== 1) { api.error('Select one face to drill.'); return; }
		const body = api.model.bodies.find((b) => b.id === faces[0].bodyId), face = body?.faces.find((f) => f.id === faces[0].id);
		if (!body || !face) { api.error('That face is no longer on the model. Select it again.'); return; }
		try { await send(holeFeatureAt(body, face, face.center), 'Drill hole'); } catch (e) { refuse(e); }
	}
	async function draft() {
		if (api.busy) { api.error(BUSY); return; }
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
		if (api.busy) { api.error(BUSY); return; }
		if (!sketches.length) { api.error('Select the profile sketch first, then shift-click the path: an open sketch of lines and arcs, or edges of the model.'); return; }
		try {
			const path: string | EdgeRef[] = sketches[1] ? sketches[1].id : edges.map((s) => ref(s) as EdgeRef);
			if (typeof path !== 'string' && !path.length) throw Error('Shift-click the path: a second, open sketch, or edges of the model.');
			await send({ type: 'sweep', profile: sketches[0].id, path, operation, target: target() }, 'Sweep');
		} catch (e) { refuse(e); }
	}
	async function loft() {
		if (api.busy) { api.error(BUSY); return; }
		if (sketches.length < 2) { api.error('Select the first profile sketch, then shift-click each next one in order.'); return; }
		try { await send({ type: 'loft', profiles: sketches.map((s) => s.id), ...(smooth ? { smooth: true } : {}), operation, target: target() }, 'Loft'); } catch (e) { refuse(e); }
	}
</script>
{#if mode}
	<section class="feature panel" aria-label="Feature options" data-testid="ideacad-feature-panel" data-mode={mode}>
		<h2>{WORDS[mode]}</h2>
		{#if mode === 'fillet' || mode === 'chamfer'}
			<p class="picks" data-testid="ideacad-feature-picks"><span class="count">{plural(edges.length, 'edge')}</span>{#if edges.length && edges.every((s) => s.bodyId === edges[0].bodyId)}<span class="on">{bodyName(edges[0].bodyId)}</span>{/if}{#if leftOut}<span class="cue" data-testid="ideacad-feature-left-out">{leftOut} smooth left out</span>{/if}</p>
			{#if faces.length && !edges.length}<button type="button" class="wide" onclick={faceEdges} data-testid="ideacad-feature-face-edges">Edges of {plural(faces.length, 'face')}</button>{/if}
			{#if sets.length}
				<div class="grow" role="group" aria-label="Add edges" data-testid="ideacad-edge-sets">
					{#each sets as g (g.kind)}<button type="button" title={g.title} onpointerenter={() => preview(g.ids)} onpointerleave={() => preview(null)} onfocus={() => preview(g.ids)} onblur={() => preview(null)} onclick={() => grow(g.ids)} data-testid="ideacad-edge-set-{g.kind}">{g.word}<span class="n">+{g.adds}</span></button>{/each}
				</div>
			{/if}
			{#if mode === 'fillet'}
				<label class="size">Radius<span class="field"><input inputmode="decimal" bind:value={radius} data-testid="ideacad-fillet-radius" /><span class="unit">in</span></span></label>
				<label class="toggle"><input type="checkbox" bind:checked={propagate} data-testid="ideacad-fillet-propagate" /><span>Tangent chain</span></label>
				<div class="rigor"><Disclosure label="Variable radius" collapseWhen={true} scope="ideacad-fillet-variable" testId="ideacad-fillet-variable">
					<label class="size">End radius<span class="field"><input inputmode="decimal" bind:value={variableEnd} data-testid="ideacad-fillet-variable-end" /><span class="unit">in</span></span></label>
					{#if variableEnd.trim() !== ''}<label class="size">Law<select value={law} onchange={(e) => (law = e.currentTarget.value as 'linear' | 'scurve')} data-testid="ideacad-fillet-law"><option value="linear">Linear</option><option value="scurve">S-curve</option></select></label>{/if}
				</Disclosure></div>
			{:else}
				<label class="size">Distance<span class="field"><input inputmode="decimal" bind:value={distance} data-testid="ideacad-chamfer-distance" /><span class="unit">in</span></span></label>
				<label class="size">Second<span class="field"><input inputmode="decimal" bind:value={distance2} placeholder="same" data-testid="ideacad-chamfer-distance2" /><span class="unit">in</span></span></label>
				<label class="size">Angle<span class="field"><input inputmode="decimal" bind:value={chamferAngle} placeholder="none" data-testid="ideacad-chamfer-angle" /><span class="unit">°</span></span></label>
				<label class="toggle"><input type="checkbox" bind:checked={chamferPropagate} data-testid="ideacad-chamfer-propagate" /><span>Tangent chain</span></label>
			{/if}
			{#if shellAhead}<label class="toggle cue-toggle"><input type="checkbox" bind:checked={beforeShell} data-testid="ideacad-blend-before-shell" /><span>Before {shellAhead.name}, for even walls</span></label>{/if}
			{#if editable}
				{#if mode === 'fillet'}<button type="button" class="wide primary" aria-disabled={api.busy} onclick={() => void fillet()} data-testid="ideacad-fillet-apply">Round {plural(edges.length, 'edge')} at {radius.trim() || '?'} in</button>
				{:else}<button type="button" class="wide primary" aria-disabled={api.busy} onclick={() => void chamfer()} data-testid="ideacad-chamfer-apply">Bevel {plural(edges.length, 'edge')} at {distance.trim() || '?'} in</button>{/if}
			{/if}
			{#each refused as { row, help } (row.id)}
				<div class="refusal" role="group" aria-label={row.name} data-testid="ideacad-blend-refusal" data-row={row.id} onpointerenter={() => showWhere(help.where)} onpointerleave={() => api.hover?.(null)}>
					<p class="who"><span aria-hidden="true">⚠</span> {row.name}</p>
					<p>{row.message}</p>
					{#if help.fix && editable}{@const fix = help.fix}<button type="button" class="wide primary" aria-disabled={api.busy} onclick={() => void pressFix(row, fix)} onfocus={() => showWhere(help.where)} onblur={() => api.hover?.(null)} data-testid="ideacad-blend-fix">{fix.label}</button>{/if}
					{#if help.more?.length && editable}<div class="others">{#each help.more as other (other.label)}<button type="button" class="wide" aria-disabled={api.busy} onclick={() => void pressFix(row, other)} data-testid="ideacad-blend-fix-other">{other.label}</button>{/each}</div>{/if}
					{#if dev && help.detail}<code class="detail" data-testid="ideacad-blend-detail">{help.detail}</code>{/if}
				</div>
			{/each}
		{:else if mode === 'shell'}
			<p class="picks" data-testid="ideacad-feature-picks"><span class="count">{plural(faces.length, 'open face')}</span></p>
			<label class="size">Wall<span class="field"><input inputmode="decimal" bind:value={thickness} data-testid="ideacad-shell-thickness" /><span class="unit">in</span></span></label>
			<h3>Own walls</h3>
			<label class="size">Selected face<span class="field"><input inputmode="decimal" bind:value={wallThickness} data-testid="ideacad-shell-wall-thickness" /><span class="unit">in</span></span></label>
			{#if editable}<button type="button" class="wide" aria-disabled={api.busy} onclick={addWall} data-testid="ideacad-shell-add-wall">Set this face's wall</button>{/if}
			{#if walls.length}
				<ul class="walls" data-testid="ideacad-shell-walls">
					{#each walls as w (w.face.body + '/' + w.face.name)}
						<li><span>{bodyName(w.body)}, {w.face.name}: {w.thickness} in</span>{#if editable}<button type="button" aria-disabled={api.busy} onclick={() => { if (api.busy) { api.error(BUSY); return; } walls = walls.filter((x) => x !== w); }}>Remove</button>{/if}</li>
					{/each}
				</ul>
			{/if}
			{#if editable}<button type="button" class="wide primary" aria-disabled={api.busy} onclick={() => void shell()} data-testid="ideacad-shell-apply">Shell at {thickness.trim() || '?'} in, {plural(faces.length, 'face')} open</button>{/if}
		{:else if mode === 'hole'}
			<p class="picks" data-testid="ideacad-feature-picks"><span class="count">{plural(faces.length, 'face')}</span></p>
			<label class="size">Size<select value={standard} onchange={(e) => (standard = e.currentTarget.value)} data-testid="ideacad-hole-standard">{#each HOLE_STANDARDS as s (s.id)}<option value={s.id}>{s.label}</option>{/each}</select></label>
			<fieldset class="fits" data-testid="ideacad-hole-fit"><legend>Fit</legend>
				{#each Object.entries(HOLE_FIT_WORDS) as [id, w] (id)}<label class="toggle" title={w.sentence}><input type="radio" name="ideacad-hole-fit" value={id} bind:group={fit} /><span>{w.word}</span></label>{/each}
			</fieldset>
			{#if fit === 'custom'}<label class="size">Diameter<span class="field"><input inputmode="decimal" bind:value={diameter} data-testid="ideacad-hole-diameter" /><span class="unit">in</span></span></label>{/if}
			<p class="readout" data-testid="ideacad-hole-words">Drills {holeWords}</p>
			<label class="toggle"><input type="checkbox" bind:checked={through} data-testid="ideacad-hole-through" /><span>Through all</span></label>
			{#if !through}<label class="size">Depth<span class="field"><input inputmode="decimal" bind:value={depth} data-testid="ideacad-hole-depth" /><span class="unit">in</span></span></label>{/if}
			{#if editable}<button type="button" class="wide primary" aria-disabled={api.busy} onclick={() => void drill()} data-testid="ideacad-hole-apply">Drill at the face center</button>{/if}
		{:else if mode === 'draft'}
			<p class="picks" data-testid="ideacad-feature-picks"><span class="count">{plural(faces.length, 'flat face')}</span></p>
			<label class="size">Angle<span class="field"><input inputmode="decimal" bind:value={draftAngle} data-testid="ideacad-draft-angle" /><span class="unit">°</span></span></label>
			<label>Pull direction<select value={pull} onchange={(e) => (pull = e.currentTarget.value as typeof pull)} data-testid="ideacad-draft-pull"><option value="X">X axis</option><option value="Y">Y axis</option><option value="Z">Z axis</option><option value="reference">Selected reference axis</option></select></label>
			<label>Neutral plane<select value={neutral} onchange={(e) => (neutral = e.currentTarget.value as typeof neutral)} data-testid="ideacad-draft-neutral"><option value="XY">XY</option><option value="XZ">XZ</option><option value="YZ">YZ</option><option value="reference">Selected reference plane</option></select></label>
			{#if editable}<button type="button" class="wide primary" aria-disabled={api.busy} onclick={() => void draft()} data-testid="ideacad-draft-apply">Draft {plural(faces.length, 'face')} at {draftAngle.trim() || '?'}°</button>{/if}
		{:else if mode === 'sweep' || mode === 'loft'}
			<p class="picks" data-testid="ideacad-feature-picks">{#if mode === 'sweep'}<span class="count">Profile: {sketches[0] ? sketchName(sketches[0].id) : 'none'}</span><span class="count">Path: {sketches[1] ? sketchName(sketches[1].id) : edges.length ? plural(edges.length, 'model edge') : 'none'}</span>{:else}<span class="count">{plural(sketches.length, 'profile')}{sketches.length ? `: ${sketches.map((s) => sketchName(s.id)).join(', ')}` : ''}</span>{/if}</p>
			{#if mode === 'loft'}<label class="toggle"><input type="checkbox" bind:checked={smooth} data-testid="ideacad-loft-smooth" /><span>Smooth</span></label>{/if}
			<label>Result<select value={operation} onchange={(e) => (operation = e.currentTarget.value as typeof operation)} data-testid="ideacad-feature-operation"><option value="new">New body</option><option value="add">Add to the selected body</option><option value="cut">Cut from the selected body</option></select></label>
			{#if editable}<button type="button" class="wide primary" aria-disabled={api.busy} onclick={() => void (mode === 'sweep' ? sweep() : loft())} data-testid="ideacad-{mode}-apply">{mode === 'sweep' ? 'Sweep the profile along the path' : `Loft ${plural(sketches.length, 'profile')}`}</button>{/if}
		{:else if mode === 'rib'}
			<p class="note" data-testid="ideacad-feature-picks">Rib is not built in this build: the kernel cannot extend an open sketch to the body. Draw the rib as a closed shape and extrude it instead.</p>
		{/if}
		<button type="button" class="more" aria-expanded={moreOpen} aria-controls="ideacad-feature-more" onclick={() => (moreOpen = !moreOpen)} data-testid="ideacad-feature-more">{moreOpen ? '▾' : '▸'} More features</button>
		<div id="ideacad-feature-more" class="extra" hidden={!moreOpen}>
			{#if moreOpen}{#each EXTRA_KINDS as kind (kind)}<label class="toggle"><input type="radio" name="ideacad-feature-extra" value={kind} bind:group={extra} /><span>{WORDS[kind]}</span></label>{/each}{/if}
		</div>
	</section>
{/if}
<style>
	.feature{display:grid;gap:6px}h2{margin:0;font-size:18px}h3{margin:4px 0 0;font:600 15px Rajdhani,sans-serif;color:var(--text-1);border-bottom:1px solid var(--hairline);padding-bottom:4px}
	.picks,.note,.readout{margin:0;color:var(--text-2);font-size:14px;line-height:1.4}.readout{color:var(--text-1);font:14px 'Share Tech Mono',monospace}
	.picks{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px}.picks .count{color:var(--text-1);font:600 15px Rajdhani,sans-serif}.picks .on{font:13px 'Share Tech Mono',monospace}.picks .cue{font-size:13px}
	label{display:grid;gap:4px;font:600 14px Rajdhani,sans-serif;color:var(--text-2)}
	input,select{min-height:44px;width:100%;box-sizing:border-box;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:16px Rajdhani,sans-serif;padding:0 8px}
	/* A size row: the word, then the box with its unit beside it, on one line, so a column of sizes reads as a list of values. */
	.size{grid-template-columns:minmax(0,1fr) minmax(0,9.5rem);align-items:center;gap:8px}.field{display:flex;align-items:center;gap:6px;min-width:0}.field input{flex:1;min-width:0}.unit{font:13px 'Share Tech Mono',monospace;color:var(--text-2);min-width:1.4em}
	.toggle{display:flex;align-items:center;gap:8px;min-height:44px;color:var(--text-1);cursor:pointer}.toggle input{width:20px;height:20px;min-height:0;min-width:0;margin:0;flex-shrink:0}
	.cue-toggle span{font-weight:500;color:var(--text-2)}
	.fits{margin:0;padding:0 8px 4px;border:1px solid var(--hairline);border-radius:4px;display:grid}.fits legend{font:600 14px Rajdhani,sans-serif;color:var(--text-2);padding:0 4px}
	.feature button{min-height:44px;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:600 15px Rajdhani,sans-serif;cursor:pointer;padding:0 10px}
	.feature button.wide{width:100%}.feature button.primary{border-color:var(--green);color:var(--green)}.feature button[aria-disabled='true']{opacity:.5;cursor:not-allowed}
	/* The edge sets: up to three to a row and filling it, each a word and what it adds, so the row reads as a picture of the choices rather than a menu. */
	.grow{display:grid;grid-template-columns:repeat(auto-fit,minmax(70px,1fr));gap:6px}.feature .grow button{display:flex;align-items:center;justify-content:center;gap:4px;padding:0 6px;font-size:14px;min-width:0}.grow .n{font:12px 'Share Tech Mono',monospace;color:var(--text-2)}
	.rigor :global(.disc-trigger){padding:6px 10px;font-size:13px}.rigor :global(.disc-body[data-open='true']){display:grid;gap:6px;padding-top:6px}
	.refusal{display:grid;gap:6px;padding:8px;border:1px solid var(--boundary);border-left:3px solid var(--amber);border-radius:4px;background:var(--surface-0)}.refusal p{margin:0;color:var(--text-1);font-size:14px;line-height:1.4}.refusal .who{font:600 14px Rajdhani,sans-serif;color:var(--amber)}
	.others{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:6px}
	.detail{display:block;font:11px 'Share Tech Mono',monospace;color:var(--text-2);overflow-wrap:anywhere}
	.walls{list-style:none;margin:0;padding:0;display:grid;gap:4px}.walls li{display:flex;justify-content:space-between;align-items:center;gap:8px;min-height:44px;font-size:14px;color:var(--text-1)}
	.more{text-align:left;background:transparent;border-color:transparent;color:var(--text-2)}.more[aria-expanded="true"]{color:var(--text-1)}
	.extra{display:grid}.extra[hidden]{display:none}
</style>
