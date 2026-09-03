<script lang="ts">
	/**
	 * One spatial container -- create or edit. This is where the schema's rules
	 * are surfaced BEFORE the action instead of relayed as errors after it:
	 *
	 *  - the KIND picker offers only kinds legal under the chosen parent AND
	 *    over the node's existing children (mirroring `_maps_node_tree_ok`'s
	 *    two checks), with the ladder stated in words beside it;
	 *  - the PARENT picker lists only containers whose kind may hold this one;
	 *  - a COMPARTMENT gets no plan-geometry fields at all -- the schema gives
	 *    it none -- and the elevation fields it does get say what they are;
	 *  - the DELETE control is replaced by a sentence naming the real counts
	 *    while children or contents remain, because the database would refuse
	 *    and a control whose only outcome is a refusal must not be offered.
	 *
	 * Geometry is TYPED INCHES (spec 7): text inputs parsed by the registry,
	 * never number inputs (the bind:value coercion trap). The PLAN CANVAS
	 * beneath them is a positioning instrument for those same fields, never a
	 * second store of the value: it renders what they hold and writes a
	 * position back into them, so "the typed value wins" needs no
	 * reconciliation because there is only one value. It can move a shape and
	 * it cannot resize one. A UNIT additionally carries the front elevation of
	 * its compartments (spec 7), which is the same rule one dimension over:
	 * the drawn stack is a rendering of the typed heights and nothing in it is
	 * draggable.
	 */
	import { onMount, untrack } from 'svelte';
	import { SaveState } from '$lib/save-state.svelte';
	import { EditBaseline } from '$lib/edit-baseline.svelte';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import {
		MAPS_KIND_LABELS,
		blankToNull,
		formatInches,
		mapsAllowedChildKinds,
		mapsAllowedKinds,
		mapsItemLabel,
		mapsKindPairOk,
		mapsNestingSentence,
		mapsNodePath,
		mapsPublishState,
		mapsSubtreePublishPlan,
		parseInches,
		parsePolygonText,
		pendingFor,
		polygonText,
		type MapsEditorData,
		type MapsFormHandle,
		type MapsKind,
		type MapsNode,
		type MapsOutline,
		type MapsPublishStep
	} from './maps';
	import { mapsSaveObject, type MapsTransports } from './transports';
	import MapsPublishPanel from './MapsPublishPanel.svelte';
	import { MAPS_GRANT_REFUSAL, type MapsCaps } from './grants';
	import MapsStatusChip from './MapsStatusChip.svelte';
	import MapsItemForm from './MapsItemForm.svelte';
	import MapsStockForm from './MapsStockForm.svelte';
	import PlanCanvas from './PlanCanvas.svelte';
	import UnitElevation from './UnitElevation.svelte';

	let {
		node,
		parentId = null,
		presetKind = null,
		data,
		transports,
		onchanged,
		onselectnode,
		onaddchild,
		ondeleted,
		registerForm,
		caps
	}: {
		/** null = create a new node under `parentId`. */
		node: MapsNode | null;
		parentId?: string | null;
		presetKind?: MapsKind | null;
		data: MapsEditorData;
		transports: MapsTransports;
		onchanged: () => Promise<void>;
		onselectnode: (id: string) => void;
		onaddchild: (parentId: string | null, presetKind: MapsKind) => void;
		/**
		 * The delete acknowledgement, handed UP: the pane this form lives in is
		 * what the delete just removed, so the note renders on the surface that
		 * is on screen afterwards (the list), never here.
		 */
		ondeleted: (message: string) => void;
		registerForm: (key: string, handle: MapsFormHandle | null) => void;
		/** What the viewer may do. The editor resolves it once and hands it down. */
		caps: MapsCaps;
	} = $props();

	/* THE THREE THINGS A GRANTED EDITOR MAY NOT DO, each read from the one
	   resolved caps object rather than re-derived here: change something
	   outside what they hold, change something already public, and publish.
	   0172 is the boundary -- these decide only whether a control that would
	   be refused is offered at all. */
	const canEditThis = $derived(
		node === null ? caps.canAddChild(parentId) : caps.canEditNode(node)
	);
	const canPublish = $derived(transports.publish !== undefined);

	/* The one-time seed: this form edits a SNAPSHOT of what it opened on (the
	   staged pending edit when one exists, else the row), and the shell
	   remounts it (keyed) per selection -- so the init-value captures are
	   deliberate, and untrack says so. */
	const { formKey, pending, base, initialParent, initialKind, initialOutline } = untrack(() => {
		const staged = node ? pendingFor(data.pending, 'maps_nodes', node.id) : null;
		const editBase: Partial<MapsNode> | null = node
			? staged
				? (staged.snapshot as Partial<MapsNode>)
				: node
			: null;
		const parent0 = node ? (editBase?.parent_id ?? null) : parentId;
		const kind0: MapsKind =
			(editBase?.kind as MapsKind | undefined) ??
			presetKind ??
			mapsAllowedChildKinds(
				parent0 ? (data.nodes.find((n) => n.id === parent0)?.kind ?? null) : null
			)[0] ??
			'building';
		return {
			formKey: `node:${node?.id ?? 'new'}`,
			pending: staged,
			base: editBase,
			initialParent: parent0,
			initialKind: kind0,
			initialOutline: (editBase?.outline ?? null) as MapsOutline | null
		};
	});

	let kind = $state<MapsKind>(initialKind);
	let parentSel = $state(initialParent ?? '');
	let name = $state(base?.name ?? '');
	let subtype = $state(base?.subtype ?? '');
	let description = $state(base?.description ?? '');
	let outlineKind = $state<'none' | 'rect' | 'polygon'>(initialOutline?.kind ?? 'none');
	let rectW = $state(initialOutline?.kind === 'rect' ? String(initialOutline.w) : '');
	let rectH = $state(initialOutline?.kind === 'rect' ? String(initialOutline.h) : '');
	let polyText = $state(initialOutline?.kind === 'polygon' ? polygonText(initialOutline.points) : '');
	let posX = $state(formatInches(base?.position_x_in ?? null));
	let posY = $state(formatInches(base?.position_y_in ?? null));
	let rotation = $state(formatInches(base?.rotation_deg ?? null));
	let elevOrder = $state(base?.elevation_order == null ? '' : String(base.elevation_order));
	let elevH = $state(formatInches(base?.elevation_h_in ?? null));
	let elevW = $state(formatInches(base?.elevation_w_in ?? null));

	let actionBusy = $state(false);
	let actionProblem = $state<string | null>(null);
	let deleteArmed = $state(false);
	/** A sub-row's delete acknowledgement: this pane survives the delete, the row does not. */
	let contentsNotice = $state<string | null>(null);
	let openContent = $state<
		{ kind: 'item'; id: string } | { kind: 'stock'; id: string } | 'new-item' | 'new-stock' | null
	>(null);

	const signature = () =>
		JSON.stringify([
			kind,
			parentSel,
			name.trim(),
			subtype.trim(),
			description.trim(),
			outlineKind,
			rectW.trim(),
			rectH.trim(),
			polyText.trim(),
			posX.trim(),
			posY.trim(),
			rotation.trim(),
			elevOrder.trim(),
			elevH.trim(),
			elevW.trim()
		]);
	const baseline = new EditBaseline();
	baseline.seed(signature());

	// --- The constraint, ahead of the action -------------------------------

	const parentNode = $derived(
		parentSel === '' ? null : (data.nodes.find((n) => n.id === parentSel) ?? null)
	);
	const parentKind = $derived(parentNode?.kind ?? null);
	const childKinds = $derived(
		node ? data.nodes.filter((n) => n.parent_id === node.id).map((n) => n.kind) : []
	);
	const allowedKinds = $derived(mapsAllowedKinds(parentKind, childKinds));
	const isCompartment = $derived(kind === 'compartment');

	/* The outline as the TYPED fields read RIGHT NOW -- what the plan canvas
	   draws. Derived from the same three inputs `content()` builds its outline
	   from, so the drawing and the saved row cannot disagree about the shape;
	   a half-typed rectangle simply has no outline to draw yet. */
	const liveOutline = $derived.by<MapsOutline | null>(() => {
		if (isCompartment) return null;
		if (outlineKind === 'rect') {
			const w = parseInches(rectW);
			const h = parseInches(rectH);
			if (w.kind !== 'value' || h.kind !== 'value' || w.value <= 0 || h.value <= 0) return null;
			return { kind: 'rect', w: w.value, h: h.value };
		}
		if (outlineKind === 'polygon') {
			const parsed = parsePolygonText(polyText);
			return parsed.ok ? { kind: 'polygon', points: parsed.points } : null;
		}
		return null;
	});
	const liveX = $derived(isCompartment ? null : inchesOrNull(posX));
	const liveY = $derived(isCompartment ? null : inchesOrNull(posY));
	const liveRotation = $derived(isCompartment ? null : inchesOrNull(rotation));

	/**
	 * A placement lands in the TYPED FIELDS and nowhere else -- the canvas has
	 * no store of its own to write to. `formatInches` is what the fields hold
	 * for every other value, so a dragged number and a typed one are the same
	 * kind of string in the same box.
	 */
	function acceptPlacement(next: { x: number; y: number }) {
		posX = formatInches(next.x);
		posY = formatInches(next.y);
		touch();
	}

	/**
	 * Legal parents for the kind currently PICKED in the form (which may differ
	 * from the stored one mid-edit). The ladder makes a descendant
	 * unrepresentable as a parent -- a legal parent's kind is always strictly
	 * higher -- so excluding self is the only identity check needed.
	 */
	const legalParents = $derived(
		data.nodes
			.filter((n) => n.id !== node?.id && mapsKindPairOk(n.kind, kind))
			.slice()
			.sort((a, b) => a.name.localeCompare(b.name))
	);
	const rootLegal = $derived(mapsAllowedChildKinds(null).includes(kind));

	const nodeItems = $derived(node ? data.items.filter((i) => i.node_id === node.id) : []);
	const nodeStock = $derived(node ? data.stock.filter((s) => s.node_id === node.id) : []);
	const childCount = $derived(childKinds.length);
	const deletable = $derived(childCount === 0 && nodeItems.length === 0 && nodeStock.length === 0);

	const problems = $derived.by(() => {
		const out: string[] = [];
		if (name.trim() === '') out.push('Give this container a name.');
		if (name.trim().length > 200) out.push('The name is longer than 200 characters.');
		if (description.length > 4000) out.push('The description is longer than 4000 characters.');
		if (!allowedKinds.includes(kind)) {
			out.push(
				parentKind === null
					? `A ${MAPS_KIND_LABELS[kind].toLowerCase()} cannot sit at the top level. ${mapsNestingSentence(null)}`
					: `A ${MAPS_KIND_LABELS[kind].toLowerCase()} cannot sit inside a ${MAPS_KIND_LABELS[parentKind].toLowerCase()}. ${mapsNestingSentence(parentKind)}`
			);
		}
		if (parentSel === '' && !rootLegal) {
			out.push(`Pick a container for this ${MAPS_KIND_LABELS[kind].toLowerCase()}. ${mapsNestingSentence(null)}`);
		}
		if (!isCompartment) {
			if (outlineKind === 'rect') {
				const w = parseInches(rectW);
				const h = parseInches(rectH);
				if (w.kind !== 'value' || w.value <= 0 || h.kind !== 'value' || h.value <= 0) {
					out.push('A rectangle outline needs a width and a height in inches, both above zero.');
				}
			} else if (outlineKind === 'polygon') {
				const parsed = parsePolygonText(polyText);
				if (!parsed.ok) out.push(parsed.problem);
			}
			const x = parseInches(posX);
			const y = parseInches(posY);
			if (x.kind === 'bad') out.push('Position X must be a number of inches.');
			if (y.kind === 'bad') out.push('Position Y must be a number of inches.');
			if ((x.kind === 'empty') !== (y.kind === 'empty')) {
				out.push('Position needs both X and Y, or neither.');
			}
			if (rotation.trim() !== '' && parseInches(rotation).kind !== 'value') {
				out.push('Rotation must be a number of degrees.');
			}
		} else {
			if (elevOrder.trim() !== '' && !/^-?\d+$/.test(elevOrder.trim())) {
				out.push('Elevation slot must be a whole number (1 is the top).');
			}
			for (const [label, value] of [
				['height', elevH],
				['width', elevW]
			] as const) {
				if (value.trim() === '') continue;
				const parsed = parseInches(value);
				if (parsed.kind !== 'value' || parsed.value <= 0) {
					out.push(`Elevation ${label} must be a number of inches above zero.`);
				}
			}
		}
		return out;
	});

	function inchesOrNull(text: string): number | null {
		const parsed = parseInches(text);
		return parsed.kind === 'value' ? parsed.value : null;
	}

	function content() {
		const outline: MapsOutline | null = isCompartment
			? null
			: outlineKind === 'rect'
				? { kind: 'rect', w: inchesOrNull(rectW) ?? 0, h: inchesOrNull(rectH) ?? 0 }
				: outlineKind === 'polygon'
					? (() => {
							const parsed = parsePolygonText(polyText);
							return parsed.ok ? { kind: 'polygon' as const, points: parsed.points } : null;
						})()
					: null;
		return {
			parent_id: parentSel === '' ? null : parentSel,
			kind,
			name: name.trim(),
			subtype: isCompartment ? blankToNull(subtype) : null,
			description: blankToNull(description),
			outline,
			position_x_in: isCompartment ? null : inchesOrNull(posX),
			position_y_in: isCompartment ? null : inchesOrNull(posY),
			rotation_deg: isCompartment ? null : inchesOrNull(rotation),
			elevation_order: isCompartment && /^-?\d+$/.test(elevOrder.trim()) ? Number(elevOrder.trim()) : null,
			elevation_h_in: isCompartment ? inchesOrNull(elevH) : null,
			elevation_w_in: isCompartment ? inchesOrNull(elevW) : null
		};
	}

	let publishNow = false;
	const save = new SaveState({
		autosave: false,
		fallbackMessage: 'This container was not saved.',
		async save() {
			const result = await mapsSaveObject(transports, {
				table: 'maps_nodes',
				row: node,
				content: content(),
				publishNow
			});
			if (!result.ok) return result;
			baseline.advance(signature());
			const created = node === null;
			await onchanged();
			if (created) onselectnode(result.data.id);
			return { ok: true };
		}
	});
	$effect(() => save.attach());

	function touch() {
		if (baseline.changed(signature())) save.markDirty();
	}

	async function doSave(publish: boolean) {
		if (problems.length > 0) return;
		publishNow = publish;
		save.markDirty();
		await save.saveNow();
	}

	async function discardPending() {
		if (!node) return;
		actionBusy = true;
		actionProblem = null;
		try {
			const result = await transports.discardPending('maps_nodes', node.id);
			if (!result.ok) {
				actionProblem = result.message;
				return;
			}
			await onchanged();
			// Back to the live row's own content.
			kind = node.kind;
			parentSel = node.parent_id ?? '';
			name = node.name;
			subtype = node.subtype ?? '';
			description = node.description ?? '';
			const live = node.outline;
			outlineKind = live?.kind ?? 'none';
			rectW = live?.kind === 'rect' ? String(live.w) : '';
			rectH = live?.kind === 'rect' ? String(live.h) : '';
			polyText = live?.kind === 'polygon' ? polygonText(live.points) : '';
			posX = formatInches(node.position_x_in);
			posY = formatInches(node.position_y_in);
			rotation = formatInches(node.rotation_deg);
			elevOrder = node.elevation_order == null ? '' : String(node.elevation_order);
			elevH = formatInches(node.elevation_h_in);
			elevW = formatInches(node.elevation_w_in);
			baseline.seed(signature());
		} finally {
			actionBusy = false;
		}
	}

	async function doDelete() {
		if (!node) return;
		actionBusy = true;
		actionProblem = null;
		try {
			const result = await transports.deleteRow('maps_nodes', node.id);
			if (!result.ok) {
				actionProblem = result.message;
				return;
			}
			const message = `Deleted ${label}.`;
			await onchanged();
			ondeleted(message);
		} finally {
			actionBusy = false;
		}
	}

	// --- Subtree publish ----------------------------------------------------

	let subtreeArmed = $state(false);
	let subtreeBusy = $state(false);
	let subtreeReport = $state<{
		total: number;
		succeeded: number;
		failures: { label: string; message: string }[];
	} | null>(null);

	const subtreePlan = $derived<MapsPublishStep[]>(
		node ? mapsSubtreePublishPlan(data, node.id) : []
	);
	const planCounts = $derived.by(() => {
		const count = (table: string) => subtreePlan.filter((s) => s.table === table).length;
		return {
			nodes: count('maps_nodes'),
			items: count('maps_items'),
			stock: count('maps_stock'),
			types: count('maps_item_types')
		};
	});

	async function publishSubtree() {
		const publishOne = transports.publish;
		if (!node || subtreePlan.length === 0 || !publishOne) return;
		subtreeBusy = true;
		subtreeReport = null;
		try {
			// Per-object maps_publish, composed -- 0161's header names this as the
			// editor's job, and each object is atomic on its own. A failure stops
			// nothing: the rest still publish, and every failure is named.
			const failures: { label: string; message: string }[] = [];
			let succeeded = 0;
			const plan = subtreePlan;
			for (const step of plan) {
				const result = await publishOne(step.table, step.id);
				if (result.ok) succeeded += 1;
				else failures.push({ label: step.label, message: result.message });
			}
			subtreeReport = { total: plan.length, succeeded, failures };
			subtreeArmed = false;
			await onchanged();
		} finally {
			subtreeBusy = false;
		}
	}

	const label = $derived(node ? `the container "${node.name}"` : 'the new container');

	onMount(() => {
		registerForm(formKey, {
			get label() {
				return label;
			},
			dirty: () => save.dirty,
			flush: async () => {
				if (save.dirty && problems.length === 0) await doSave(false);
			}
		});
		return () => registerForm(formKey, null);
	});
</script>

<div class="node-detail" data-testid="maps-node-detail">
	<header class="detail-head">
		{#if node}
			<p class="crumb">{mapsNodePath(data.nodes, node.id)}</p>
			<div class="head-row">
				<h2>{node.name}</h2>
				<MapsStatusChip state={mapsPublishState(node, pending)} />
			</div>
		{:else}
			<h2>
				New container
				{#if parentNode}inside {parentNode.name}{:else}at the top level{/if}
			</h2>
		{/if}
	</header>

	{#if pending}
		<p class="pending-strip" data-testid="maps-pending-strip">
			These fields show the <strong>staged pending edit</strong>. The public map still shows the
			previously published version until you publish.
		</p>
	{/if}

	<div class="form-grid">
		<div class="field">
			<label for="{formKey}-kind">Kind</label>
			{#if allowedKinds.length > 1}
				<select id="{formKey}-kind" bind:value={kind} onchange={touch}>
					{#each allowedKinds as k (k)}
						<option value={k}>{MAPS_KIND_LABELS[k]}</option>
					{/each}
				</select>
			{:else}
				<p class="fixed-value" id="{formKey}-kind">{MAPS_KIND_LABELS[kind]}</p>
			{/if}
			<p class="hint kind-hint">
				{#if node && childCount > 0}
					Kinds that could not hold what is already inside are not offered.
				{:else}
					{mapsNestingSentence(parentKind)}
				{/if}
			</p>
		</div>

		<div class="field">
			<label for="{formKey}-parent">Inside</label>
			<select id="{formKey}-parent" bind:value={parentSel} onchange={touch}>
				{#if rootLegal}
					<option value="">Top level (no container)</option>
				{/if}
				{#each legalParents as p (p.id)}
					<option value={p.id}>{mapsNodePath(data.nodes, p.id)}</option>
				{/each}
			</select>
			<p class="hint">Only containers whose kind may hold a {MAPS_KIND_LABELS[kind].toLowerCase()} are listed.</p>
		</div>

		<div class="field">
			<label for="{formKey}-name">Name</label>
			<input id="{formKey}-name" type="text" bind:value={name} oninput={touch} autocomplete="off" />
		</div>

		{#if isCompartment}
			<div class="field">
				<label for="{formKey}-subtype">Compartment type</label>
				<input
					id="{formKey}-subtype"
					type="text"
					bind:value={subtype}
					oninput={touch}
					placeholder="drawer, shelf level, bin&hellip;"
					autocomplete="off"
				/>
			</div>
		{/if}

		<div class="field wide">
			<label for="{formKey}-description">Description</label>
			<textarea id="{formKey}-description" rows="2" bind:value={description} oninput={touch}></textarea>
		</div>
	</div>

	{#if isCompartment}
		<section class="geometry" data-testid="maps-elevation-fields">
			<h3>Front elevation slot</h3>
			<p class="hint">
				Compartments carry no plan geometry. They appear in the unit's front elevation: a slot
				order (1 is the top) and typed inches for the opening.
			</p>
			<div class="inch-row">
				<div class="field">
					<label for="{formKey}-elev-order">Slot order</label>
					<input id="{formKey}-elev-order" type="text" inputmode="numeric" bind:value={elevOrder} oninput={touch} autocomplete="off" />
				</div>
				<div class="field">
					<label for="{formKey}-elev-h">Height (in)</label>
					<input id="{formKey}-elev-h" type="text" inputmode="decimal" bind:value={elevH} oninput={touch} autocomplete="off" />
				</div>
				<div class="field">
					<label for="{formKey}-elev-w">Width (in)</label>
					<input id="{formKey}-elev-w" type="text" inputmode="decimal" bind:value={elevW} oninput={touch} autocomplete="off" />
				</div>
			</div>
		</section>
	{:else}
		<section class="geometry" data-testid="maps-geometry-fields">
			<h3>Geometry, typed inches</h3>
			<p class="hint">
				All numbers are inches in the parent's frame, from the SolidWorks numbers. Accuracy comes
				from what you type here; drawing and dragging are a later bundle.
			</p>
			<div class="field">
				<label for="{formKey}-outline">Outline</label>
				<select id="{formKey}-outline" bind:value={outlineKind} onchange={touch}>
					<option value="none">No outline yet</option>
					<option value="rect">Rectangle</option>
					<option value="polygon">Polygon</option>
				</select>
			</div>
			{#if outlineKind === 'rect'}
				<div class="inch-row">
					<div class="field">
						<label for="{formKey}-rect-w">Width (in)</label>
						<input id="{formKey}-rect-w" type="text" inputmode="decimal" bind:value={rectW} oninput={touch} autocomplete="off" />
					</div>
					<div class="field">
						<label for="{formKey}-rect-h">Depth (in)</label>
						<input id="{formKey}-rect-h" type="text" inputmode="decimal" bind:value={rectH} oninput={touch} autocomplete="off" />
					</div>
				</div>
			{:else if outlineKind === 'polygon'}
				<div class="field">
					<label for="{formKey}-poly">Corner points, one "x, y" pair per line</label>
					<textarea id="{formKey}-poly" rows="4" bind:value={polyText} oninput={touch} placeholder={'0, 0\n120, 0\n120, 96'}></textarea>
				</div>
			{/if}
			<div class="inch-row">
				<div class="field">
					<label for="{formKey}-pos-x">Position X (in)</label>
					<input id="{formKey}-pos-x" type="text" inputmode="decimal" bind:value={posX} oninput={touch} autocomplete="off" />
				</div>
				<div class="field">
					<label for="{formKey}-pos-y">Position Y (in)</label>
					<input id="{formKey}-pos-y" type="text" inputmode="decimal" bind:value={posY} oninput={touch} autocomplete="off" />
				</div>
				<div class="field">
					<label for="{formKey}-rot">Rotation (deg)</label>
					<input id="{formKey}-rot" type="text" inputmode="decimal" bind:value={rotation} oninput={touch} autocomplete="off" />
				</div>
			</div>

			<PlanCanvas
				selfId={node?.id ?? null}
				selfName={name.trim() === '' ? 'This shape' : name.trim()}
				parent={parentNode}
				outline={liveOutline}
				rotationDeg={liveRotation}
				x={liveX}
				y={liveY}
				{data}
				onplace={acceptPlacement}
			/>
		</section>
	{/if}

	{#if node && kind === 'unit'}
		<UnitElevation
			unit={node}
			{data}
			{transports}
			{onchanged}
			{onselectnode}
			onaddchild={(parentId, presetKind) => onaddchild(parentId, presetKind)}
			{registerForm}
		/>
	{/if}

	{#if problems.length > 0}
		<ul class="problems" role="alert" data-testid="maps-node-problems">
			{#each problems as problem (problem)}<li>{problem}</li>{/each}
		</ul>
	{/if}

	<div class="actions">
		{#if canEditThis}
			<button type="button" class="btn" aria-disabled={problems.length > 0} onclick={() => doSave(false)}>
				{node === null ? 'Create draft' : node.status === 'published' ? 'Save (not public yet)' : 'Save draft'}
			</button>
			{#if canPublish}
				<button type="button" class="btn secondary" aria-disabled={problems.length > 0} onclick={() => doSave(true)}>
					{node === null ? 'Create & publish' : 'Save & publish'}
				</button>
			{/if}
		{/if}
		<SaveIndicator state={save} />
	</div>
	{#if !canEditThis}
		<p class="grant-note" data-testid="maps-readonly-note">{MAPS_GRANT_REFUSAL}</p>
	{/if}

	{#if node}
		<MapsPublishPanel
			state={mapsPublishState(node, pending)}
			objectWord="container"
			publishedAt={node.published_at}
			busy={actionBusy}
			problem={actionProblem}
			onpublish={canPublish ? () => doSave(true) : null}
			ondiscard={pending ? discardPending : null}
		/>

		{#if canPublish && subtreePlan.length > 0}
			<section class="subtree" data-testid="maps-subtree-publish">
				<h3>Publish this subtree</h3>
				{#if !subtreeArmed}
					<p class="hint">
						{subtreePlan.length} unpublished change{subtreePlan.length === 1 ? '' : 's'} sit in or
						under this container.
					</p>
					<button type="button" class="btn secondary" onclick={() => (subtreeArmed = true)} disabled={subtreeBusy}>
						Publish subtree&hellip;
					</button>
				{:else}
					<p>
						Publish {planCounts.nodes} container{planCounts.nodes === 1 ? '' : 's'},
						{planCounts.items} item{planCounts.items === 1 ? '' : 's'},
						{planCounts.stock} stock placement{planCounts.stock === 1 ? '' : 's'}
						{#if planCounts.types > 0}
							and {planCounts.types} item type{planCounts.types === 1 ? '' : 's'} they reference
						{/if}? Everything published becomes public immediately.
					</p>
					<div class="confirm-row">
						<button type="button" class="btn" onclick={publishSubtree} disabled={subtreeBusy}>
							{subtreeBusy ? 'Publishing…' : `Publish ${subtreePlan.length} object${subtreePlan.length === 1 ? '' : 's'}`}
						</button>
						<button type="button" class="btn secondary" onclick={() => (subtreeArmed = false)} disabled={subtreeBusy}>
							Not now
						</button>
					</div>
				{/if}
			</section>
		{/if}
		{#if subtreeReport}
			<div class="subtree-report" role="status">
				<p>
					Published {subtreeReport.succeeded} of {subtreeReport.total}.
					{#if subtreeReport.failures.length === 0}Everything in the subtree is public.{/if}
				</p>
				{#if subtreeReport.failures.length > 0}
					<ul class="problems">
						{#each subtreeReport.failures as f (f.label + f.message)}
							<li>{f.label}: {f.message}</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		{#if caps.canEditAt(node.id)}
			<section class="add-child" data-testid="maps-add-child">
				<h3>Add inside this {MAPS_KIND_LABELS[node.kind].toLowerCase()}</h3>
				<p class="hint">{mapsNestingSentence(node.kind)}</p>
				<div class="confirm-row">
					{#each mapsAllowedChildKinds(node.kind) as k (k)}
						<button type="button" class="btn secondary" onclick={() => onaddchild(node.id, k)}>
							Add {MAPS_KIND_LABELS[k].toLowerCase()}
						</button>
					{/each}
				</div>
			</section>
		{/if}

		<section class="contents" data-testid="maps-node-contents">
			{#if contentsNotice}
				<p class="list-notice" role="status">{contentsNotice}</p>
			{/if}
			<h3>Items in here</h3>
			{#if nodeItems.length === 0}
				<p class="hint">No unique items placed in this container yet.</p>
			{/if}
			<ul class="content-list">
				{#each nodeItems as item (item.id)}
					<li>
						{#if openContent && typeof openContent === 'object' && openContent.kind === 'item' && openContent.id === item.id}
							{#key item.id}
								<MapsItemForm
									{item}
									nodeId={node.id}
									itemTypes={data.itemTypes}
									pending={pendingFor(data.pending, 'maps_items', item.id)}
									{transports}
									{onchanged}
									onclose={() => (openContent = null)}
									ondeleted={(m) => (contentsNotice = m)}
									{registerForm}
									canEdit={caps.canEditContent(node.id, item.status)}
								/>
							{/key}
						{:else}
							<div class="content-row">
								<span class="content-name">{mapsItemLabel(item, data.itemTypes)}</span>
								<MapsStatusChip
									state={mapsPublishState(item, pendingFor(data.pending, 'maps_items', item.id))}
								/>
								<button
									type="button"
									class="btn secondary row-btn"
									onclick={() => (openContent = { kind: 'item', id: item.id })}
								>
									Edit
								</button>
							</div>
						{/if}
					</li>
				{/each}
				{#if openContent === 'new-item'}
					<li>
						<MapsItemForm
							item={null}
							nodeId={node.id}
							itemTypes={data.itemTypes}
							pending={null}
							{transports}
							{onchanged}
							onclose={() => (openContent = null)}
							ondeleted={(m) => (contentsNotice = m)}
							{registerForm}
							canEdit={caps.canEditAt(node.id)}
						/>
					</li>
				{/if}
			</ul>
			{#if caps.canEditAt(node.id) && openContent !== 'new-item'}
				<button type="button" class="btn secondary" onclick={() => (openContent = 'new-item')}>
					Add unique item
				</button>
			{/if}

			<h3>Stock in here</h3>
			{#if nodeStock.length === 0}
				<p class="hint">No stocked types placed in this container yet.</p>
			{/if}
			<ul class="content-list">
				{#each nodeStock as s (s.id)}
					<li>
						{#if openContent && typeof openContent === 'object' && openContent.kind === 'stock' && openContent.id === s.id}
							{#key s.id}
								<MapsStockForm
									stock={s}
									nodeId={node.id}
									itemTypes={data.itemTypes}
									{nodeStock}
									canEdit={caps.canEditContent(node.id, s.status)}
									pending={pendingFor(data.pending, 'maps_stock', s.id)}
									{transports}
									{onchanged}
									onclose={() => (openContent = null)}
									ondeleted={(m) => (contentsNotice = m)}
									{registerForm}
								/>
							{/key}
						{:else}
							<div class="content-row">
								<span class="content-name">
									{data.itemTypes.find((t) => t.id === s.item_type_id)?.name ?? 'Unknown type'}
									<span class="qty">&times;{s.qty}</span>
								</span>
								<MapsStatusChip
									state={mapsPublishState(s, pendingFor(data.pending, 'maps_stock', s.id))}
								/>
								<button
									type="button"
									class="btn secondary row-btn"
									onclick={() => (openContent = { kind: 'stock', id: s.id })}
								>
									Edit
								</button>
							</div>
						{/if}
					</li>
				{/each}
				{#if openContent === 'new-stock'}
					<li>
						<MapsStockForm
							stock={null}
							nodeId={node.id}
							itemTypes={data.itemTypes}
							{nodeStock}
							pending={null}
							{transports}
							{onchanged}
							onclose={() => (openContent = null)}
							ondeleted={(m) => (contentsNotice = m)}
							{registerForm}
							canEdit={caps.canEditAt(node.id)}
						/>
					</li>
				{/if}
			</ul>
			{#if caps.canEditAt(node.id) && openContent !== 'new-stock'}
				<button type="button" class="btn secondary" onclick={() => (openContent = 'new-stock')}>
					Add stock placement
				</button>
			{/if}
		</section>

		<section class="danger" data-testid="maps-node-delete">
			<h3>Delete</h3>
			{#if !canEditThis}
				<p class="hint">
					{node.status === 'published'
						? 'This is on the public map. Deleting it is a site admin.'
						: 'This container is outside what you have been given. Deleting it is a site admin.'}
				</p>
			{:else if !deletable}
				<p class="hint">
					This container cannot be deleted while things live in it:
					{childCount} child container{childCount === 1 ? '' : 's'}, {nodeItems.length}
					item{nodeItems.length === 1 ? '' : 's'}, {nodeStock.length} stock
					placement{nodeStock.length === 1 ? '' : 's'}. Move or delete those first.
				</p>
			{:else if !deleteArmed}
				<button type="button" class="btn secondary" onclick={() => (deleteArmed = true)}>
					Delete container&hellip;
				</button>
			{:else}
				<p>
					Delete {label}{node.status === 'published' ? ', which is currently public' : ''}? Its
					revision history goes with it. There is no undo.
				</p>
				<div class="confirm-row">
					<button type="button" class="btn danger-btn" onclick={doDelete} disabled={actionBusy}>
						Delete permanently
					</button>
					<button type="button" class="btn secondary" onclick={() => (deleteArmed = false)}>
						Keep it
					</button>
				</div>
			{/if}
			{#if actionProblem}
				<p class="problems-line" role="alert">{actionProblem}</p>
			{/if}
		</section>
	{/if}
</div>

<style>
	.grant-note {
		margin: 0;
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
		background: var(--bg2);
		font-size: 0.85rem;
		color: var(--text-2, var(--white));
	}
	.node-detail {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-width: 0;
	}
	.detail-head .crumb {
		margin: 0 0 0.2rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		color: var(--cyan);
	}
	.head-row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		flex-wrap: wrap;
	}
	h2 {
		margin: 0;
		font-size: 1.3rem;
	}
	h3 {
		margin: 0 0 0.4rem;
		font-size: 0.95rem;
	}
	.pending-strip {
		margin: 0;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--amber);
		border-radius: var(--radius-control, 6px);
		background: var(--bg2);
		color: var(--white);
		font-size: 0.88rem;
	}
	.form-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
		gap: 0.8rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}
	.field.wide {
		grid-column: 1 / -1;
	}
	label {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
	}
	input,
	select,
	textarea {
		/* width + min-width beat the input's intrinsic size: without them a
		   text input's ~20-char default width overflows a 375px viewport by
		   14px (measured by browser-verify before this rule existed). */
		width: 100%;
		min-width: 0;
		min-height: 44px;
		background: var(--bg2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
		color: var(--white);
		font-family: var(--font-display);
		font-size: 0.95rem;
		padding: 0.45rem 0.6rem;
	}
	textarea {
		resize: vertical;
		min-height: 3.4rem;
	}
	.fixed-value {
		margin: 0;
		min-height: 44px;
		display: flex;
		align-items: center;
		padding: 0.45rem 0.6rem;
		border: 1px dashed var(--line);
		border-radius: var(--radius-control, 6px);
		color: var(--white);
	}
	.hint {
		margin: 0;
		font-size: 0.78rem;
		color: var(--text-2, var(--dim));
	}
	.geometry,
	.subtree,
	.add-child,
	.contents,
	.danger {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		border-top: 1px solid var(--line);
		padding-top: 0.8rem;
	}
	.inch-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(8.5rem, 100%), 1fr));
		gap: 0.7rem;
	}
	.problems {
		margin: 0;
		padding-left: 1.1rem;
		color: var(--crimson);
		font-size: 0.85rem;
	}
	.problems-line {
		margin: 0;
		color: var(--crimson);
		font-size: 0.85rem;
	}
	.list-notice {
		margin: 0;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
		background: var(--bg2);
		color: var(--white);
		font-size: 0.85rem;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.confirm-row {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.content-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.content-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-control, 6px);
		padding: 0.35rem 0.35rem 0.35rem 0.7rem;
		background: var(--bg1);
	}
	.content-name {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--white);
	}
	.qty {
		color: var(--cyan);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		margin-left: 0.3rem;
	}
	.row-btn {
		padding: 0.5rem 0.9rem;
	}
	.subtree-report p {
		margin: 0 0 0.3rem;
		color: var(--white);
		font-size: 0.88rem;
	}
	.danger p {
		margin: 0 0 0.5rem;
		font-size: 0.88rem;
		color: var(--white);
	}
	.danger-btn {
		color: var(--crimson);
		border-color: var(--crimson);
	}
</style>
