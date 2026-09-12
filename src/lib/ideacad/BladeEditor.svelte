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
		moveFeature,
		panelFor,
		profilePolyline,
		removeStation,
		setFeatures,
		setStations
	} from './ui/feature-model';
	import { UNDO_DEPTH, UndoStack, undoKeyFor } from './ui/undo';
	import { IDEACAD_WRITE_REFUSED, type IdeacadEditorWrites } from './mount';

	let {
		tree = DEFAULT_BLADE_TREE,
		config = DEFAULT_BLADE_CONFIG,
		conceptName = 'Concept 1',
		readOnly = false,
		openCompare = false,
		concepts: seedConcepts = undefined,
		activeConceptId = null,
		prediction = null,
		commitConceptCard = undefined,
		setPrediction = undefined,
		writes = undefined,
		saveLabel = undefined,
		onFrame = undefined,
		onViewportReady = undefined
	}: {
		tree?: BladeTree;
		config?: BladeConfig;
		conceptName?: string;
		readOnly?: boolean;
		openCompare?: boolean;
		concepts?: { id: string; name: string; features: BladeTree; committed?: boolean }[];
		/** Which seeded concept opens active. Without it the FIRST card opens, so
		 *  a document whose active concept is not first could only be seeded by
		 *  reordering the strip -- which is a student's own ordering and not the
		 *  mount's to rewrite. */
		activeConceptId?: string | null;
		/** A prediction ALREADY RECORDED for this document. Its presence is what
		 *  puts the recorded line on screen instead of the form -- a form that
		 *  asked again would make a student predict twice about one document, and
		 *  the second answer would overwrite the one they are being taught by. It
		 *  GATES NOTHING; see the prediction block below. */
		prediction?: { conceptId: string; rationale: string; at?: string | null } | null;
		commitConceptCard?: (conceptId: string) => Promise<unknown>;
		setPrediction?: (conceptId: string, rationale: string) => Promise<unknown>;
		/** THE DOCUMENT'S WRITE PATH. Handed in by the classroom item page and by
		 *  nothing else; its ABSENCE is what makes this a local working copy that
		 *  persists nothing, which is exactly what the dev harness wants and what
		 *  the real page had until ledger 0178. See `mount.ts`. */
		writes?: IdeacadEditorWrites | null;
		/** The store's own phase in words. Replaces the local indicator entirely
		 *  when supplied: two sources for one line is how a surface comes to read
		 *  "Saved" over a write that failed. */
		saveLabel?: string | null;
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
	let activeId = $state(
		untrack(() => {
			const seeded = activeConceptId && seedConcepts?.some((c) => c.id === activeConceptId) ? activeConceptId : null;
			return seeded ?? seedConcepts?.[0]?.id ?? 'c1';
		})
	);
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
	/**
	 * THERE IS NO PREDICTION GATE, ON MR. PINA'S DECISION OF 2026-09-12
	 * (`docs/decisions/entries/26-*`). Rotational inertia and radius of gyration
	 * render from the first frame, in the Rules rail and in every compare column,
	 * with nothing hidden and no prediction required. His reasoning: IDEA100 is a
	 * rotation class, there is no time to teach the mathematics behind rotational
	 * inertia, and visible numbers help students build maximally competitive
	 * designs.
	 *
	 * THE PREDICTION ITSELF STAYS, AND `recorded` IS NOT A LOCK. A student still
	 * says which concept they think spins longest and why, and
	 * `ideacad_set_prediction` still stores it; `recorded` decides only whether
	 * the FORM or the RECORDED LINE is on screen, so nobody is asked twice about
	 * one document and no second answer overwrites the first.
	 *
	 * DO NOT REINTRODUCE A LOCK KEYED ON THIS FLAG. Ledger 0160 fixed a
	 * one-keystroke leak in the gate and ledger 0171 fixed it opening on the
	 * press rather than on the write; both were correct against their prompts,
	 * and the prompts predated his answer.
	 */
	let recorded = $state(untrack(() => !!prediction));
	let recording = $state(false);
	let predictionRefusal = $state('');
	let renaming = $state(false);
	let renameTo = $state('');
	let armedDelete = $state('');
	/* SEEDED FROM THE ACTIVE CONCEPT, NEVER FROM `concepts[0]`. With
	   `activeConceptId` pointing anywhere but the first card, seeding index 0
	   opens the editor showing one concept's geometry under another's name. */
	const seedFeatures = () => {
		const start = untrack(() => concepts.find((c) => c.id === activeId) ?? concepts[0]);
		return structuredClone($state.snapshot(start.features) as BladeTree);
	};
	let accepted = $state(seedFeatures());
	let draft = $state(seedFeatures());
	let saved = $state('Saved');
	/** The last refused write, if any. One line for every write path: a student
	 *  needs to know a change did not land, not which RPC it was. */
	let writeRefusal = $state('');
	/** The store's phase wins whenever a store is there to have one. */
	const savedLine = $derived(saveLabel ?? saved);
	/** Run one document write, and keep the refusal where the student is working.
	 *  The local copy is NEVER rolled back: what is on screen is the student's
	 *  work, and taking it away because the network said no loses the thing the
	 *  message is telling them to retry. */
	async function persist<T>(run: () => Promise<T>): Promise<T | null> {
		try {
			const out = await run();
			writeRefusal = '';
			return out;
		} catch {
			writeRefusal = IDEACAD_WRITE_REFUSED;
			return null;
		}
	}
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
	const canPredict = $derived(!!predicted && rationale.trim().length > 0);

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
	/**
	 * THE ACTIVE CONCEPT'S FEATURES, INTO THE LIST AND INTO THE AUTOSAVE. Every
	 * path that changes the working copy already came through here -- Accept,
	 * undo, redo, and every concept switch -- so this is the ONE place the edit
	 * enters `store.edit`, and there is no second throttle beside the store's
	 * own 750ms: `edit` is synchronous by contract and the debounce is the
	 * store's. A surface with no `writes` keeps exactly the local behaviour it
	 * has always had.
	 */
	function writeActive() {
		const i = concepts.findIndex((c) => c.id === activeId);
		if (i < 0) return;
		const features = clone(draft);
		concepts[i] = { ...concepts[i], features };
		if (!writes || readOnly) return;
		try {
			writes.edit(features);
			writeRefusal = '';
		} catch {
			writeRefusal = IDEACAD_WRITE_REFUSED;
		}
	}
	function load(id: string) {
		writeActive();
		// The selection is local and immediate; the write follows it. A refusal
		// leaves the two disagreeing until the next reload, where the server's
		// answer wins -- which is the honest outcome and is said out loud.
		if (writes && !readOnly) void persist(() => writes.activate(id));
		loadLocal(id);
	}
	/** The selection half of `load`, with no `setActive` behind it, for the paths
	 *  where the database has already chosen (create, and delete's own answer). */
	function loadLocal(id: string) {
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
	/**
	 * A CONCEPT IS CREATED BY THE DATABASE WHEN THERE IS ONE, AND THE ID COMES
	 * BACK FROM IT. `nextId` mints `c2`, `c3` and so on, which is right for a
	 * surface persisting nothing and wrong the moment one is: every other write
	 * is keyed on the concept id, so a locally invented one would address a row
	 * that does not exist. The card is appended only AFTER the row lands.
	 */
	async function add(name: string, features: BladeTree) {
		writeActive();
		if (!writes || readOnly) {
			const id = nextId();
			concepts = [...concepts, { id, name, features, committed: false }];
			load(id);
			return;
		}
		const row = await persist(() => writes.create(name, features));
		if (!row) return;
		concepts = [...concepts, { id: row.id, name: row.name, features, committed: false }];
		// `ideacad_new_concept` activates the row it wrote, so the selection is
		// already the server's; `load` must not send a second `setActive` for it.
		loadLocal(row.id);
	}
	function newConcept() {
		void add(`Concept ${concepts.length + 1}`, clone(cfg.defaultFeatures));
	}
	function duplicate() {
		void add(`${active.name} copy`, clone(active.features));
	}
	function startRename() {
		renameTo = active.name;
		renaming = true;
	}
	async function commitRename() {
		const name = renameTo.trim();
		const id = activeId;
		renaming = false;
		if (!name) return;
		if (writes && !readOnly && !(await persist(() => writes.rename(id, name).then(() => true)))) return;
		const i = concepts.findIndex((c) => c.id === id);
		if (i >= 0) concepts[i] = { ...concepts[i], name };
	}
	// The last concept is never deletable: a document with no concept has nothing to load.
	/** `ideacad_delete_concept` refuses the last one itself and names the concept
	 *  it selected next, so the local list follows the database rather than
	 *  guessing -- the guess (`rest[0]`) is right only while the strip's order and
	 *  the stored `position` agree, and reordering is exactly what breaks that. */
	async function removeConcept() {
		if (concepts.length < 2) return;
		const id = activeId;
		if (writes && !readOnly) {
			const out = await persist(() => writes.remove(id));
			if (!out) return;
			const rest = concepts.filter((c) => c.id !== id);
			concepts = rest;
			armedDelete = '';
			loadLocal(rest.some((c) => c.id === out.activeConceptId) ? out.activeConceptId : rest[0].id);
			return;
		}
		const rest = concepts.filter((c) => c.id !== id);
		concepts = rest;
		armedDelete = '';
		load(rest[0].id);
	}
	/** The strip's order is the student's; it changes no geometry and no number.
	 *  `0201` stores a 1-BASED `position` and `ideacad_open_document` orders by
	 *  it, so a swap is two writes and the indices are offset by one. */
	async function moveConcept(direction: -1 | 1) {
		const from = concepts.findIndex((c) => c.id === activeId);
		const to = from + direction;
		if (from < 0 || to < 0 || to >= concepts.length) return;
		const moved = concepts[from];
		const displaced = concepts[to];
		if (writes && !readOnly) {
			const ok = await persist(async () => {
				await writes.reposition(moved.id, to + 1);
				await writes.reposition(displaced.id, from + 1);
				return true;
			});
			if (!ok) return;
		}
		const next = [...concepts];
		next[from] = displaced;
		next[to] = moved;
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
	 * The recorded line replaces the form on the WRITE, not on the press. A
	 * refusal leaves the form standing with what was typed still in it, because a
	 * student told their prediction was recorded when it was not has had the one
	 * thing this collects thrown away. The physics is on screen either way now,
	 * so a refusal costs the record and nothing else.
	 */
	async function record() {
		if (!canPredict || recording) return;
		recording = true;
		predictionRefusal = '';
		try {
			await setPrediction?.(predicted, rationale.trim());
			recorded = true;
		} catch {
			predictionRefusal = 'Your prediction did not save. Try Record prediction again.';
		} finally {
			recording = false;
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
			<div class="save" aria-live="polite">{savedLine}</div>
		</div>
		<!-- INSIDE THE HEADER, ON ITS OWN WRAPPED LINE. `.ideacad` is a three-row
		     grid (header, stage, concept strip); a fourth child would take an
		     implicit row and steal height from the viewport. The header already
		     wraps, so `flex-basis: 100%` puts this under the indicator it belongs
		     to at every width. -->
		{#if writeRefusal}
			<p class="refusal write" role="status">{writeRefusal}</p>
		{/if}
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
			<!-- ONE CONFIRM PAIR ON SCREEN AT A TIME. The PropertyManager carries its
			     own green check and red X, which is where SolidWorks puts them and
			     what 0145 PART 5 asks for; rendering this pair beside it put TWO
			     Accepts on a 1440px screen, measured, with nothing saying which
			     one a student should press. They are the same two functions, so
			     the answer is which one is visible, not which one exists. -->
			{#if !readOnly && !editing}
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
			<!-- THE PHYSICS IS HERE, FROM THE FIRST FRAME, and that is decision 26's
			     answer rather than a convenience. Rotational inertia and radius of
			     gyration used to live behind the prediction gate in the compare
			     sheet; Mr. Pina's call of 2026-09-12 is that they are always
			     visible, because IDEA100 is a rotation class with no room to teach
			     the mathematics and a student building for the competition needs
			     the number they are competing on.

			     `result.rules.slice(0, 4)` ABOVE DROPS THE FIFTH RULE
			     (`engagement`) DELIBERATELY. Decision 26 recorded that as a
			     measured defect; it is not one -- engagement is not being enforced
			     this rotation, and `evaluate` still returns it, so a rail that
			     printed PASS/FAIL on it would be quoting a limit nobody is
			     holding students to. Widening the slice is a decision, not a
			     one-character fix. -->
			<div class="metric"><span>Rotational inertia</span><strong>{result.inertiaGcm2.toFixed(1)} g·cm²</strong></div>
			<div class="metric"><span>Radius of gyration</span><strong>{result.radiusOfGyrationCm.toFixed(2)} cm</strong></div>
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
			{#if !recorded}
				<p>Which of your concepts spins longest? Pick one and say why.</p>
				<select value={predicted} onchange={(e) => (predicted = e.currentTarget.value)} aria-label="Pick a concept">
					<option value="">Pick a concept</option>
					{#each concepts as concept (concept.id)}<option value={concept.id}>{concept.name}</option>{/each}
				</select>
				<input bind:value={rationale} placeholder="Say why" aria-label="Say why" />
				<button aria-disabled={!canPredict || recording} onclick={record}>Record prediction</button>
				{#if predictionRefusal}
					<p class="refusal" role="status">{predictionRefusal}</p>
				{:else if !canPredict}
					<p class="note">Pick a concept and say why to record your prediction.</p>
				{:else}
					<p class="note">Your prediction is recorded once and cannot be changed afterwards.</p>
				{/if}
			{:else}
				<p class="said">
					Prediction: {predictedName}. {rationale || prediction?.rationale}
					{#if prediction?.at}<i>&nbsp;recorded {prediction.at}</i>{/if}
				</p>
			{/if}
			<!-- ONE COLUMN PER CONCEPT, AND NOTHING IN IT IS LOCKED. Decision 26 is
			     answered: the comparative physics reads beside the rules for every
			     concept whether or not a prediction has been made. -->
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
							<dl>
								<dt>I</dt>
								<dd>{column.reading.e.inertiaGcm2.toFixed(1)} g·cm²</dd>
								<dt>k</dt>
								<dd>{column.reading.e.radiusOfGyrationCm.toFixed(2)} cm</dd>
								<dt>COM</dt>
								<dd>{column.reading.e.comHeightIn.toFixed(2)} in</dd>
							</dl>
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
	.notice {
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
	.refusal.write {
		flex-basis: 100%;
		margin: 0;
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
