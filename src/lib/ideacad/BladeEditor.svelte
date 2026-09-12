<script lang="ts">
	import { untrack } from 'svelte';
	import { evaluate } from './blade/evaluate';
	import { DEFAULT_BLADE_CONFIG, DEFAULT_BLADE_TREE, type BladeConfig } from './blade/materials';
	import type { BladeTree } from './blade/tree';
	import { validateBladeTree } from './blade/validate';
	import { bladeConfigShaped } from './config';
	import Viewport from './viewport/Viewport.svelte';
	import type { ViewportProbe } from './viewport/camera-rig';
	import { typingInto } from './viewport/controls';
	import ConceptStrip, { type ConceptCard } from './ui/ConceptStrip.svelte';
	import FeatureTree from './ui/FeatureTree.svelte';
	import PropertyManager from './ui/PropertyManager.svelte';
	import {
		addStation,
		applyField,
		applyStation,
		featureLabel,
		moveFeature,
		panelFor,
		profilePolyline,
		removeStation,
		setFeatures,
		setStations
	} from './ui/feature-model';
	import { UNDO_DEPTH, UndoStack, undoKeyFor } from './ui/undo';

	let {
		tree = DEFAULT_BLADE_TREE,
		config = DEFAULT_BLADE_CONFIG,
		conceptName = 'Concept 1',
		readOnly = false,
		openCompare = false,
		concepts: seedConcepts = undefined,
		prediction = null,
		commitConceptCard = undefined,
		setPrediction = undefined,
		onFrame = undefined,
		onViewportReady = undefined
	}: {
		tree?: BladeTree;
		config?: BladeConfig;
		conceptName?: string;
		readOnly?: boolean;
		openCompare?: boolean;
		concepts?: { id: string; name: string; features: BladeTree; committed?: boolean }[];
		/** A prediction ALREADY RECORDED for this document. Its presence is what
		 *  unlocks the comparative physics on a later visit -- a gate that asked
		 *  again would make a student predict twice about one document, and the
		 *  second answer would overwrite the one they are being taught by. */
		prediction?: { conceptId: string; rationale: string; at?: string | null } | null;
		commitConceptCard?: (conceptId: string) => Promise<unknown>;
		setPrediction?: (conceptId: string, rationale: string) => Promise<unknown>;
		onFrame?: (ms: number) => void;
		onViewportReady?: (probe: ViewportProbe) => void;
	} = $props();

	// The concept list is the document. `draft` is the working copy of the ACTIVE concept and
	// `accepted` is what Accept last committed to it, so Cancel has something to revert to.
	let concepts = $state<ConceptCard[]>(
		untrack(
			() =>
				seedConcepts?.map((c) => ({
					id: c.id,
					name: c.name,
					features: structuredClone(c.features),
					committed: c.committed ?? false
				})) ?? [{ id: 'c1', name: conceptName, features: structuredClone(tree), committed: false }]
		)
	);
	let activeId = $state(untrack(() => seedConcepts?.[0]?.id ?? 'c1'));
	const active = $derived(concepts.find((c) => c.id === activeId) ?? concepts[0]);
	function clone(t: BladeTree): BladeTree {
		return structuredClone($state.snapshot(t) as BladeTree);
	}
	let selected = $state('body-revolve');
	/** The left pane shows the tree, or the PropertyManager for `selected` while
	 *  Edit Feature is open. One pane, two states -- never both, which is what
	 *  0145 PART 5 means by "replaced in place". */
	let editing = $state(false);
	let moveRefusal = $state<string | null>(null);
	let compare = $state(untrack(() => openCompare));
	let rationale = $state(untrack(() => prediction?.rationale ?? ''));
	let predicted = $state(untrack(() => prediction?.conceptId ?? ''));
	// The prediction gate is PEDAGOGICAL, not a security boundary: it exists so a student
	// commits to an answer before the comparative physics is shown. Nothing behind it is
	// secret, and `revealed` is deliberately a separate flag from the rationale field --
	// keyed on the field itself, the physics unlocked on the first keystroke.
	//
	// IT IS SET ONLY AFTER THE WRITE COMES BACK. Set before the await, a rejected
	// `ideacad_set_prediction` left the physics on screen with nothing recorded, so
	// the one thing the gate exists to collect was the one thing that did not survive.
	let revealed = $state(untrack(() => !!prediction));
	let revealing = $state(false);
	let predictionRefusal = $state('');
	let renaming = $state(false);
	let renameTo = $state('');
	let armedDelete = $state('');
	let accepted = $state(untrack(() => structuredClone($state.snapshot(concepts[0].features) as BladeTree)));
	let draft = $state(untrack(() => structuredClone($state.snapshot(concepts[0].features) as BladeTree)));
	let saved = $state('Saved');
	/**
	 * Undo and redo over ACCEPTED edits, 50 deep. The stack is a plain object in
	 * `$state` so a push does not re-render anything by itself; `historyTick` is
	 * what the two controls read, because `canUndo` on a non-reactive class is a
	 * getter Svelte has no way to know moved.
	 */
	const history = new UndoStack<BladeTree>(UNDO_DEPTH, (t) => structuredClone($state.snapshot(t) as BladeTree));
	let historyTick = $state(0);
	const canUndo = $derived(historyTick >= 0 && history.canUndo);
	const canRedo = $derived(historyTick >= 0 && history.canRedo);
	// A config arrives from the document row on the real page, so the component
	// boundary is where an unusable one has to be caught. It is NAMED rather than
	// swapped silently: a rail quoting limits from a config nobody asked for is
	// worse than a rail saying which limits it is quoting.
	const configOk = $derived(bladeConfigShaped(config));
	const cfg = $derived(configOk ? config : DEFAULT_BLADE_CONFIG);
	let viewport = $state<{
		zoomToFit(): void;
		previousView(): void;
		standardView(n: 'Front' | 'Back' | 'Left' | 'Right' | 'Top' | 'Bottom' | 'Isometric'): void;
		cycleDisplayStyle(): void;
		toggleProjection(): void;
		currentStyle(): string;
		currentProjection(): string;
	} | null>(null);
	let orienting = $state(false);
	const STANDARD = ['Front', 'Back', 'Left', 'Right', 'Top', 'Bottom', 'Isometric'] as const;
	const result = $derived(evaluate(draft, cfg));
	const problems = $derived(validateBladeTree(draft, cfg));
	const dirty = $derived(JSON.stringify($state.snapshot(draft)) !== JSON.stringify($state.snapshot(accepted)));
	/** A station row edits the body, so the panel it opens is the body's. */
	const panelId = $derived(selected.startsWith('station-') ? 'body-revolve' : selected);
	const panel = $derived(panelFor(draft, panelId, cfg));
	const featureIndex = $derived(draft.features.findIndex((f) => f.id === panelId));
	const canReveal = $derived(!!predicted && rationale.trim().length > 0);

	function accept() {
		if (readOnly || !dirty) return;
		history.push(accepted);
		historyTick++;
		accepted = clone(draft);
		writeActive();
		moveRefusal = null;
		saved = 'Unsaved';
	}
	function cancel() {
		draft = clone(accepted);
		moveRefusal = null;
	}
	/** Undo and redo restore BOTH copies: a restore that moved `accepted` and left
	 *  the preview alone would leave the viewport showing a tree the document no
	 *  longer holds, with the confirm pair armed against a diff nobody made. */
	function restore(to: BladeTree | null) {
		if (!to) return;
		accepted = structuredClone(to);
		draft = structuredClone(to);
		writeActive();
		historyTick++;
		saved = 'Unsaved';
	}
	function undo() {
		if (readOnly) return;
		restore(history.undo(clone(accepted)));
	}
	function redo() {
		if (readOnly) return;
		restore(history.redo(clone(accepted)));
	}
	/**
	 * The console's own keystrokes. `defaultPrevented` is the discriminator
	 * against the viewport, which binds `Ctrl+Z` (zoom) and `Ctrl+Shift+Z`
	 * (previous view) on its OWN element and calls `preventDefault` -- so a
	 * keystroke that was aimed at the graphics area has already been claimed by
	 * the time it bubbles here, and one press never does two jobs.
	 */
	function consoleKey(e: KeyboardEvent) {
		if (e.defaultPrevented) return;
		/* Escape closes the PropertyManager and reverts its preview, and it is
		   handled HERE rather than on the panel because Escape is not a typing key
		   and the panel is not always where focus sits. */
		if (e.key === 'Escape' && editing) {
			e.preventDefault();
			cancel();
			editing = false;
			return;
		}
		if (readOnly) return;
		if (typingInto(document.activeElement)) return;
		const which = undoKeyFor(e);
		if (!which) return;
		e.preventDefault();
		if (which === 'undo') undo();
		else redo();
	}
	function writeActive() {
		const i = concepts.findIndex((c) => c.id === activeId);
		if (i >= 0) concepts[i] = { ...concepts[i], features: clone(draft) };
	}
	function load(id: string) {
		writeActive();
		activeId = id;
		const c = concepts.find((x) => x.id === id);
		if (!c) return;
		accepted = clone(c.features);
		draft = clone(c.features);
		armedDelete = '';
		renaming = false;
		editing = false;
		moveRefusal = null;
		// A history that followed a load would let one undo rewrite a concept the
		// student is no longer looking at.
		history.clear();
		historyTick++;
	}
	function nextId() {
		let n = concepts.length + 1;
		while (concepts.some((c) => c.id === `c${n}`)) n++;
		return `c${n}`;
	}
	function newConcept() {
		writeActive();
		const id = nextId();
		concepts = [...concepts, { id, name: `Concept ${concepts.length + 1}`, features: clone(cfg.defaultFeatures), committed: false }];
		load(id);
	}
	function duplicate() {
		writeActive();
		const id = nextId();
		concepts = [...concepts, { id, name: `${active.name} copy`, features: clone(active.features), committed: false }];
		load(id);
	}
	function startRename() {
		renameTo = active.name;
		renaming = true;
	}
	function commitRename() {
		const name = renameTo.trim();
		if (name) {
			const i = concepts.findIndex((c) => c.id === activeId);
			if (i >= 0) concepts[i] = { ...concepts[i], name };
		}
		renaming = false;
	}
	// The last concept is never deletable: a document with no concept has nothing to load.
	function removeConcept() {
		if (concepts.length < 2) return;
		const rest = concepts.filter((c) => c.id !== activeId);
		concepts = rest;
		armedDelete = '';
		load(rest[0].id);
	}
	/** The strip's order is the student's; it changes no geometry and no number. */
	function moveConcept(direction: -1 | 1) {
		const from = concepts.findIndex((c) => c.id === activeId);
		const to = from + direction;
		if (from < 0 || to < 0 || to >= concepts.length) return;
		const next = [...concepts];
		next[from] = concepts[to];
		next[to] = concepts[from];
		concepts = next;
	}
	/**
	 * Every PropertyManager edit lands on the DRAFT, which is the live preview;
	 * nothing here touches `accepted`, so Cancel is always a real way back.
	 *
	 * EVERY ONE OF THEM IS HANDED A SNAPSHOT, NEVER THE RUNE. `feature-model.ts`
	 * is pure and clones what it is given with `structuredClone`, which throws
	 * `DataCloneError` on a `$state` proxy -- so the boundary is here, where the
	 * proxy is, rather than inside a module that would then need to know Svelte
	 * exists. `panelFor` is the deliberate exception: it only READS, and it is
	 * read inside a `$derived` that has to track the proxy to re-run at all.
	 */
	function snap(): BladeTree {
		return $state.snapshot(draft) as BladeTree;
	}
	function field(key: string, value: number | string) {
		draft = applyField(snap(), panelId, key, value);
	}
	function station(index: number, axis: 'r' | 'z', value: number) {
		draft = applyStation(snap(), index, axis, value);
	}
	function stationsOf(t: BladeTree) {
		const body = t.features.find((f) => f.type === 'revolve');
		return body && body.type === 'revolve' ? body.stations : [];
	}
	function addRow(index: number) {
		const plain = snap();
		draft = setStations(plain, addStation(stationsOf(plain), index));
	}
	function removeRow(index: number) {
		const plain = snap();
		draft = setStations(plain, removeStation(stationsOf(plain), index));
	}
	function move(direction: -1 | 1) {
		const plain = snap();
		const out = moveFeature(plain.features, panelId, direction);
		moveRefusal = out.refusal;
		if (!out.refusal) draft = setFeatures(plain, out.features);
	}
	async function commit() {
		if (!commitConceptCard) return;
		await commitConceptCard(activeId);
		const i = concepts.findIndex((c) => c.id === activeId);
		if (i >= 0) concepts[i] = { ...concepts[i], committed: true };
	}
	/**
	 * The gate opens on the WRITE, not on the press. A refusal keeps it closed and
	 * says so, because a student who saw the physics after a failed save has been
	 * taught the lesson and had the evidence of it thrown away.
	 */
	async function reveal() {
		if (!canReveal || revealing) return;
		revealing = true;
		predictionRefusal = '';
		try {
			await setPrediction?.(predicted, rationale.trim());
			revealed = true;
		} catch {
			predictionRefusal = 'Your prediction did not save, so the physics stays closed. Try Reveal again.';
		} finally {
			revealing = false;
		}
	}
	/** Each concept's own numbers, for the compare columns. `evaluate` throws on a
	 *  malformed tree, so one broken concept must not blank the surface. */
	function readingOf(c: ConceptCard) {
		try {
			const e = evaluate(c.features, cfg);
			return { ok: true as const, e, points: profilePolyline(e.geometry.stations, 46, 34, 3).points };
		} catch {
			return { ok: false as const, e: null, points: '' };
		}
	}
	const columns = $derived(concepts.map((c) => ({ concept: c, reading: readingOf(c) })));
	const predictedName = $derived(concepts.find((c) => c.id === predicted)?.name ?? predicted);
</script>

<svelte:document onkeydown={consoleKey} />

<div class="ideacad" data-testid="ideacad-editor">
	<header>
		<div><span class="eyebrow">IDEACAD / BLADE</span><h2>{active.name}</h2></div>
		<div class="hgroup">
			{#if !readOnly}
				<button class="hist" aria-disabled={!canUndo} title="Undo (Ctrl+Z)" onclick={undo}>Undo</button>
				<button class="hist" aria-disabled={!canRedo} title="Redo (Ctrl+Y)" onclick={redo}>Redo</button>
			{/if}
			<div class="save" aria-live="polite">{saved}</div>
		</div>
	</header>
	<div class="stage">
		<aside class="tree" aria-label={editing && panel ? 'PropertyManager' : 'FeatureManager'}>
			{#if editing && panel}
				<PropertyManager
					{panel}
					{dirty}
					{readOnly}
					canMoveUp={featureIndex > 0}
					canMoveDown={featureIndex >= 0 && featureIndex < draft.features.length - 1}
					refusal={moveRefusal}
					onfield={field}
					onstation={station}
					onaddstation={addRow}
					onremovestation={removeRow}
					onmove={move}
					onaccept={accept}
					oncancel={cancel}
					onclose={() => (editing = false)}
				/>
			{:else}
				<FeatureTree
					tree={draft}
					{problems}
					{selected}
					{readOnly}
					onselect={(id) => (selected = id)}
					onedit={(id) => {
						selected = id;
						editing = true;
					}}
				/>
				<p class="hint">Double-click a row, or press Enter on it, to edit {featureLabel(panelId)}.</p>
			{/if}
		</aside>
		<section class="viewport" aria-label="3D viewport">
			<nav aria-label="View toolbar">
				<button title="Zoom to fit (F)" onclick={() => viewport?.zoomToFit()}>Fit</button>
				<button title="Previous view (Ctrl+Shift+Z)" onclick={() => viewport?.previousView()}>Previous</button>
				<button
					title="View orientation (Ctrl+1 to Ctrl+7)"
					aria-expanded={orienting}
					aria-controls="ideacad-orientation"
					onclick={() => (orienting = !orienting)}>Orientation</button
				>
				<button title="Display style" onclick={() => viewport?.cycleDisplayStyle()}>Edges</button>
				<button title="Perspective" onclick={() => viewport?.toggleProjection()}>Perspective</button>
			</nav>
			{#if orienting}
				<ul class="orient" id="ideacad-orientation" aria-label="Standard views">
					{#each STANDARD as view, i}
						<li>
							<button
								onclick={() => {
									viewport?.standardView(view);
									orienting = false;
								}}>{view}<small>Ctrl+{i + 1}</small></button
							>
						</li>
					{/each}
				</ul>
			{/if}
			<Viewport bind:this={viewport} evaluation={result} rotation={draft.rotation} {onFrame} onReady={onViewportReady} />
			{#if !readOnly}
				<footer>
					<button class="accept" onclick={accept} aria-disabled={!dirty}>✓ <span>Accept</span></button>
					<button class="cancel" onclick={cancel} aria-disabled={!dirty}>× <span>Cancel</span></button>
				</footer>
			{/if}
		</section>
		<aside class="readouts">
			<h3>Rules</h3>
			{#each result.rules.slice(0, 4) as rule}
				<div class="metric">
					<span>{rule.label}</span><strong>{rule.id === 'mass' ? `${rule.value.toFixed(0)} g` : `${rule.value.toFixed(2)} in`}</strong
					><b class:fail={!rule.pass}>{rule.pass ? 'PASS' : 'FAIL'}</b>
				</div>
			{/each}
			<div class="metric"><span>Center of mass</span><strong>{result.comHeightIn.toFixed(2)} in</strong></div>
			{#if !configOk}<p class="notice">CONFIG UNREADABLE, SHOWING DEFAULT LIMITS</p>{/if}
			{#if result.unverifiedStandardParts}<p class="notice">UNVERIFIED STANDARD PARTS</p>{/if}
		</aside>
	</div>
	<ConceptStrip
		{concepts}
		{activeId}
		config={cfg}
		{readOnly}
		{renaming}
		bind:renameTo
		armed={armedDelete}
		canCommit={!!commitConceptCard}
		onload={load}
		onnew={newConcept}
		onduplicate={duplicate}
		onstartrename={startRename}
		oncommitrename={commitRename}
		oncancelrename={() => (renaming = false)}
		onarm={(id) => (armedDelete = id)}
		ondelete={removeConcept}
		onmove={moveConcept}
		oncompare={() => (compare = !compare)}
		oncommit={commit}
	/>
	{#if compare}
		<section class="compare" aria-label="Compare concepts">
			<h3>Compare concepts</h3>
			{#if !revealed}
				<p>Which of your concepts spins longest? Pick one and say why.</p>
				<select value={predicted} onchange={(e) => (predicted = e.currentTarget.value)} aria-label="Pick a concept">
					<option value="">Pick a concept</option>
					{#each concepts as concept (concept.id)}<option value={concept.id}>{concept.name}</option>{/each}
				</select>
				<input bind:value={rationale} placeholder="Say why" aria-label="Say why" />
				<button aria-disabled={!canReveal || revealing} onclick={reveal}>Reveal physics</button>
				{#if predictionRefusal}
					<p class="refusal" role="status">{predictionRefusal}</p>
				{:else if !canReveal}
					<p class="note">Pick a concept and say why before the physics is revealed.</p>
				{:else}
					<p class="note">Reveal records your prediction, then unlocks the physics for every concept.</p>
				{/if}
			{:else}
				<p class="said">
					Prediction: {predictedName}. {rationale || prediction?.rationale}{#if prediction?.at}
						<i>{prediction.at}</i>{/if}
				</p>
			{/if}
			<!-- ONE COLUMN PER CONCEPT, and the physics is the only locked part of
			     it. Decision 26's default is to lock comparative physics ONLY:
			     diameter, height, hex extension and mass stay visible, because a
			     student needs them to build a legal concept at all. -->
			<div class="cols">
				{#each columns as column (column.concept.id)}
					<article class:active={column.concept.id === activeId}>
						<svg class="thumb" viewBox="0 0 46 34" width="46" height="34" aria-hidden="true"
							><polyline points={column.reading.points} /></svg
						>
						<h4>{column.concept.name}</h4>
						{#if column.reading.ok && column.reading.e}
							<ul>
								{#each column.reading.e.rules.slice(0, 4) as rule}
									<li>
										<span>{rule.label}</span>
										<strong>{rule.id === 'mass' ? `${rule.value.toFixed(0)} g` : `${rule.value.toFixed(2)} in`}</strong>
										<b class:fail={!rule.pass}>{rule.pass ? 'PASS' : 'FAIL'}</b>
									</li>
								{/each}
							</ul>
							{#if revealed}
								<dl>
									<dt>I</dt>
									<dd>{column.reading.e.inertiaGcm2.toFixed(1)} g·cm²</dd>
									<dt>k</dt>
									<dd>{column.reading.e.radiusOfGyrationCm.toFixed(2)} cm</dd>
									<dt>COM</dt>
									<dd>{column.reading.e.comHeightIn.toFixed(2)} in</dd>
								</dl>
							{/if}
						{:else}
							<p class="broken">This concept cannot be rebuilt.</p>
						{/if}
					</article>
				{/each}
			</div>
			<button class="close" onclick={() => (compare = false)}>Close</button>
		</section>
	{/if}
</div>

<style>
	:global(body) {
		margin: 0;
	}
	.ideacad {
		--tree-width: 300px;
		--rail-width: 280px;
		position: relative;
		height: min(760px, calc(100vh - 2rem));
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		background: var(--surface-0);
		color: var(--text-1);
		font-family: Rajdhani, sans-serif;
		border: 1px solid var(--boundary);
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--boundary);
	}
	.hgroup {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	h2,
	h3 {
		font-family: 'Chakra Petch', sans-serif;
		margin: 0.15rem 0;
	}
	h2::before {
		content: none;
	}
	.eyebrow,
	.save,
	.metric span,
	.notice,
	.hint {
		font: 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
	}
	.stage {
		display: grid;
		grid-template-columns: var(--tree-width) minmax(0, 1fr) var(--rail-width);
		min-width: 0;
		min-height: 0;
	}
	aside {
		overflow: auto;
		background: var(--surface-1);
		padding: 1rem;
	}
	.tree {
		border-right: 1px solid var(--boundary);
	}
	button,
	input,
	select {
		min-height: 44px;
		min-width: 44px;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		font: inherit;
	}
	button:focus-visible,
	input:focus-visible,
	select:focus-visible {
		outline: 3px solid var(--focus-ring);
		outline-offset: 2px;
	}
	button[aria-disabled='true'] {
		color: var(--text-2);
		border-color: var(--hairline);
	}
	.hist {
		padding: 0 0.7rem;
	}
	.hint {
		margin: 0.75rem 0 0;
		line-height: 1.5;
		color: var(--text-2);
	}
	.notice {
		color: var(--copper);
	}
	.viewport {
		position: relative;
		overflow: hidden;
		min-height: 360px;
		background: var(--surface-0);
	}
	.viewport nav {
		position: absolute;
		top: 0.75rem;
		left: 0.75rem;
		right: 0.75rem;
		z-index: 2;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.25rem;
	}
	.viewport nav button {
		padding: 0 0.7rem;
		flex: 0 0 auto;
	}
	.orient {
		position: absolute;
		top: 4rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 4;
		margin: 0;
		padding: 0.4rem;
		list-style: none;
		display: grid;
		gap: 0.25rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		box-shadow: var(--bevel-raised);
		max-height: calc(100% - 5rem);
		overflow: auto;
	}
	.orient button {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		width: 100%;
		padding: 0 0.7rem;
		text-align: left;
	}
	.orient small {
		color: var(--text-2);
		font: 12px 'Share Tech Mono', monospace;
		align-self: center;
	}
	.readouts {
		border-left: 1px solid var(--boundary);
	}
	.metric {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.35rem;
		padding: 0.7rem 0;
		border-bottom: 1px solid var(--hairline);
	}
	.metric b {
		grid-column: 1/-1;
		color: var(--green);
		font-family: 'Share Tech Mono';
	}
	.metric b.fail {
		color: var(--crimson);
	}
	footer {
		position: absolute;
		right: 1rem;
		bottom: 1rem;
		display: flex;
		gap: 0.5rem;
		z-index: 2;
	}
	footer button {
		padding: 0 0.9rem;
	}
	.accept {
		border-color: var(--green);
	}
	.cancel {
		border-color: var(--crimson);
	}
	.compare::before {
		content: '';
		position: fixed;
		inset: 0;
		background: rgb(0 0 0/0.45);
		z-index: -1;
	}
	.compare {
		position: absolute;
		inset: 5rem 10% auto;
		max-height: calc(100% - 10rem);
		overflow: auto;
		z-index: 3;
		padding: 1.5rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		box-shadow: var(--bevel-raised);
	}
	.compare input,
	.compare select,
	.compare button {
		margin: 0.3rem;
		padding: 0 0.7rem;
	}
	.cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(190px, 100%), 1fr));
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.cols article {
		min-width: 0;
		padding: 0.6rem;
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
	}
	.cols article.active {
		border-color: var(--green);
	}
	.cols h4 {
		margin: 0.3rem 0 0.5rem;
		font-family: 'Chakra Petch', sans-serif;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cols ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.cols li {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 0.35rem;
		padding: 0.2rem 0;
		font: 12px 'Share Tech Mono', monospace;
		color: var(--text-2);
	}
	.cols li strong {
		color: var(--text-1);
	}
	.cols li b {
		color: var(--green);
	}
	.cols li b.fail {
		color: var(--crimson);
	}
	.cols dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.2rem 0.5rem;
		margin: 0.5rem 0 0;
		padding-top: 0.5rem;
		border-top: 1px solid var(--boundary);
		font: 12px 'Share Tech Mono', monospace;
	}
	.cols dt {
		color: var(--text-2);
	}
	.cols dd {
		margin: 0;
	}
	.thumb {
		background: var(--surface-0);
		border: 1px solid var(--hairline);
		border-radius: 2px;
	}
	.thumb polyline {
		fill: none;
		stroke: var(--green);
		stroke-width: 2;
	}
	.note,
	.refusal,
	.broken,
	.said i {
		font: 12px 'Share Tech Mono', monospace;
		color: var(--text-2);
	}
	.refusal {
		color: var(--amber);
	}
	.said i {
		font-style: normal;
	}
	@media (max-width: 1023px) {
		.ideacad {
			height: auto;
			min-height: 100vh;
		}
		.ideacad aside {
			overflow: visible;
		}
		.ideacad footer {
			position: static;
			padding: 0.75rem 1rem;
		}
		.ideacad .stage {
			display: flex;
			flex-direction: column;
		}
		.viewport {
			order: 0;
			min-height: 360px;
		}
		.readouts {
			order: 1;
			border-left: 0;
			border-top: 1px solid var(--boundary);
		}
		.tree {
			order: 2;
			border-right: 0;
			border-top: 1px solid var(--boundary);
		}
		.compare {
			position: fixed;
			inset: auto 0 0;
		}
		.viewport nav {
			max-width: 100%;
			overflow: auto;
		}
	}
</style>
