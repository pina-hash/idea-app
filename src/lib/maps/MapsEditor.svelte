<script lang="ts">
	/**
	 * THE WHOLE EDITOR SCREEN, mounted identically by `/maps/edit` and by the
	 * dev harness -- the route owns the load and the transports, this owns the
	 * arrangement. Master-detail through the ONE shared split (ClassSplit):
	 * the navigation pane holds the node tree and the item-type vocabulary,
	 * the detail pane holds the selected object's editor, and nothing selected
	 * gives the tree the full measure.
	 *
	 * UNSAVED WORK NEVER DISCARDS SILENTLY, in either direction a person can
	 * move. Mounted forms register a {dirty, flush} handle here; switching
	 * selection FLUSHES first and asks only about what a flush could not land,
	 * and route navigation goes through the ONE guard (guardSaveNavigation) --
	 * whose own save() is that same flush -- so there is exactly one
	 * beforeNavigate on the page.
	 */
	import '$lib/shell/split.css';
	import { untrack } from 'svelte';
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import { SaveState } from '$lib/save-state.svelte';
	import { guardSaveNavigation } from '$lib/save-guard.svelte';
	import {
		MAPS_KIND_LABELS,
		mapsAllowedChildKinds,
		mapsNestingSentence,
		mapsPublishState,
		pendingFor,
		type MapsEditorData,
		type MapsFormHandle,
		type MapsSelection
	} from './maps';
	import type { MapsTransports } from './transports';
	import {
		MAPS_ADMIN_SCOPE,
		mapsCaps,
		type MapsEditorScope
	} from './grants';
	import { mapsNodePath } from './maps';
	import NodeTree from './NodeTree.svelte';
	import NodeDetail from './NodeDetail.svelte';
	import ItemTypeDetail from './ItemTypeDetail.svelte';
	import MapsStatusChip from './MapsStatusChip.svelte';

	let {
		initial,
		transports,
		initialSelection = null,
		scope = MAPS_ADMIN_SCOPE
	}: {
		initial: MapsEditorData;
		transports: MapsTransports;
		/** What opens selected -- the harness and tests use it to land on a state. */
		initialSelection?: MapsSelection | null;
		/**
		 * WHO IS LOOKING (0172). Defaults to a site admin, so every mount that
		 * existed before granted editors is byte-identical without passing
		 * one. A granted editor gets the containers they hold and nothing
		 * else; publishing is removed by the transports rather than by this.
		 */
		scope?: MapsEditorScope;
	} = $props();

	// The load's payload seeds the editor once; every later change flows
	// through transports.reload(). Deliberate capture, so: untrack.
	let data = $state<MapsEditorData>(untrack(() => initial));

	/* RESOLVED ONCE, AGAINST THE CURRENT NODES, and handed down. Every surface
	   below reads this rather than re-deriving a rule of its own -- three
	   spellings of "may I edit this" is three things that stop agreeing, and
	   the SQL already holds the fourth (which is the one that decides). */
	const caps = $derived(mapsCaps(data.nodes, scope));

	/* The tree shows what the caller may see. For an admin `visibleNodeIds` is
	   null -- NO LIMIT, which is not the same thing as an empty set, and
	   conflating the two hands an admin an empty editor. */
	const visibleNodes = $derived(
		caps.visibleNodeIds === null
			? data.nodes
			: data.nodes.filter((n) => caps.visibleNodeIds?.has(n.id))
	);

	/* What a granted editor holds, in the words they will recognise: the
	   containment path, never a uuid. `mapsNodePath` is the ONE implementation
	   of that -- 0172 deliberately projects `node_id` and no path for exactly
	   this reason. */
	const grantedPaths = $derived(
		scope.admin
			? []
			: scope.grants
					.map((g) => mapsNodePath(data.nodes, g.node_id))
					.filter((p) => p !== '')
					.sort()
	);
	let loadProblem = $state<string | null>(null);
	let listNotice = $state<string | null>(null);

	type Selection = MapsSelection;

	let section = $state<'places' | 'types'>(
		untrack(() => (initialSelection?.kind === 'type' || initialSelection?.kind === 'new-type' ? 'types' : 'places'))
	);
	let selection = $state<Selection | null>(untrack(() => initialSelection));
	let pendingSwitch = $state<{ next: Selection | null; labels: string[] } | null>(null);

	// --- The form registry: what is mounted and what it still owes ----------

	const handles: Record<string, MapsFormHandle> = {};
	function registerForm(key: string, handle: MapsFormHandle | null) {
		if (handle) handles[key] = handle;
		else delete handles[key];
	}
	function dirtyHandles(): MapsFormHandle[] {
		return Object.values(handles).filter((h) => h.dirty());
	}

	const guardState = new SaveState({
		autosave: false,
		fallbackMessage: 'Some map edits are not saved.',
		async save() {
			for (const h of dirtyHandles()) await h.flush();
			return { ok: true };
		}
	});
	$effect(() => guardState.attach());
	guardSaveNavigation(guardState, {
		warning: 'You have unsaved map edits. Leaving now loses them.',
		alsoUnsaved: () => {
			const dirty = dirtyHandles();
			if (dirty.length === 0) return null;
			return `You have unsaved changes on ${dirty.map((h) => h.label).join(' and ')}. Leaving now loses them.`;
		}
	});

	async function refresh() {
		const result = await transports.reload();
		if (result.ok) {
			data = result.data;
			loadProblem = null;
		} else {
			loadProblem = `The last change saved, but re-reading the map failed: ${result.message}`;
		}
	}

	/** Flush first; ask only about what the flush could not land. */
	async function attemptSelect(next: Selection | null) {
		listNotice = null;
		const dirty = dirtyHandles();
		if (dirty.length > 0) {
			for (const h of dirty) await h.flush();
		}
		const still = dirtyHandles();
		if (still.length > 0) {
			pendingSwitch = { next, labels: still.map((h) => h.label) };
			return;
		}
		pendingSwitch = null;
		selection = next;
	}

	function discardAndSwitch() {
		if (!pendingSwitch) return;
		selection = pendingSwitch.next;
		pendingSwitch = null;
	}

	// --- Resolve the selection against the CURRENT data, never a snapshot ---

	const selectedNode = $derived.by(() => {
		const s = selection;
		if (!s || s.kind !== 'node') return null;
		return data.nodes.find((n) => n.id === s.id) ?? null;
	});
	const selectedType = $derived.by(() => {
		const s = selection;
		if (!s || s.kind !== 'type') return null;
		return data.itemTypes.find((t) => t.id === s.id) ?? null;
	});
	const hasDetail = $derived.by(() => {
		const s = selection;
		if (!s) return false;
		if (s.kind === 'node') return selectedNode !== null;
		if (s.kind === 'type') return selectedType !== null;
		return true;
	});
	const selectionKey = $derived.by(() => {
		const s = selection;
		if (!s) return 'none';
		if (s.kind === 'node') return `node:${s.id}`;
		if (s.kind === 'type') return `type:${s.id}`;
		if (s.kind === 'new-node') return `new-node:${s.parentId ?? 'root'}:${s.presetKind ?? ''}`;
		return 'new-type';
	});

	const sortedTypes = $derived(
		data.itemTypes.slice().sort((a, b) => a.name.localeCompare(b.name))
	);

	function onDeleted(message: string) {
		listNotice = message;
		selection = null;
	}
</script>

<div class="mp-root" data-testid="maps-editor" data-scope={caps.admin ? 'admin' : 'granted'}>
	{#if loadProblem}
		<p class="load-problem" role="alert">{loadProblem}</p>
	{/if}

	{#if !caps.admin}
		<!-- A GRANTED EDITOR IS TOLD WHAT THEY HOLD, BY PATH AND BEFORE THEY
		     TOUCH ANYTHING. A surface that simply showed them less would read
		     as a broken map; naming the containers turns an absence into a
		     rule they can act on. -->
		<p class="scope-note" data-testid="maps-scope-note">
			{#if grantedPaths.length > 0}
				You can edit drafts in {#each grantedPaths as path, i (path)}{#if i > 0}{i ===
							grantedPaths.length - 1
								? ' and '
								: ', '}{/if}<strong>{path}</strong>{/each} and anything inside them.
				Publishing, and any change to something already on the public map, is a site admin.
			{:else}
				You have not been given any containers to edit yet. Ask a site admin.
			{/if}
		</p>
	{/if}

	<ClassSplit {hasDetail} narrow="swap" scroll="page" detailWidth="roomy">
		{#snippet nav()}
			<nav class="maps-nav" aria-label="Map contents">
				<div class="section-tabs" role="tablist" aria-label="Places or item types">
					<button
						type="button"
						class="tab"
						aria-pressed={section === 'places'}
						onclick={() => (section = 'places')}
					>
						Places
					</button>
					<button
						type="button"
						class="tab"
						aria-pressed={section === 'types'}
						onclick={() => (section = 'types')}
					>
						Item types
					</button>
				</div>

				{#if listNotice}
					<p class="list-notice" role="status" data-testid="maps-list-notice">{listNotice}</p>
				{/if}

				{#if section === 'places'}
					<NodeTree
						nodes={visibleNodes}
						pending={data.pending}
						selectedId={selectedNode?.id ?? null}
						onselect={(id) => attemptSelect({ kind: 'node', id })}
					/>
					{#if caps.canAddChild(null)}
						<div class="add-root" data-testid="maps-add-root">
							<p class="hint">{mapsNestingSentence(null)}</p>
							<div class="add-row">
								{#each mapsAllowedChildKinds(null) as k (k)}
									<button
										type="button"
										class="btn secondary"
										onclick={() =>
											attemptSelect({ kind: 'new-node', parentId: null, presetKind: k })}
									>
										Add {MAPS_KIND_LABELS[k].toLowerCase()}
									</button>
								{/each}
							</div>
						</div>
					{/if}
				{:else}
					<ul class="type-list" data-testid="maps-type-list">
						{#each sortedTypes as t (t.id)}
							<li>
								<button
									type="button"
									class="type-row"
									class:selected={selectedType?.id === t.id}
									aria-current={selectedType?.id === t.id ? 'true' : undefined}
									onclick={() => attemptSelect({ kind: 'type', id: t.id })}
								>
									<span class="type-name">{t.name}</span>
									<MapsStatusChip
										state={mapsPublishState(t, pendingFor(data.pending, 'maps_item_types', t.id))}
									/>
								</button>
							</li>
						{/each}
					</ul>
					{#if sortedTypes.length === 0}
						<p class="hint">No item types yet. The searchable vocabulary starts here.</p>
					{/if}
					{#if caps.canCreateItemType()}
						<div class="add-root">
							<button type="button" class="btn secondary" onclick={() => attemptSelect({ kind: 'new-type' })}>
								New item type
							</button>
						</div>
					{/if}
				{/if}
			</nav>
		{/snippet}

		{#if pendingSwitch}
			<div class="switch-confirm" role="alertdialog" aria-label="Unsaved changes">
				<p>
					Your changes on {pendingSwitch.labels.join(' and ')} could not be saved. Switching now
					discards them.
				</p>
				<div class="confirm-row">
					<button type="button" class="btn" onclick={() => (pendingSwitch = null)}>
						Keep editing
					</button>
					<button type="button" class="btn secondary" onclick={discardAndSwitch}>
						Discard and switch
					</button>
				</div>
			</div>
		{/if}

		{#key selectionKey}
			{#if selection?.kind === 'node' && selectedNode}
				<NodeDetail
					node={selectedNode}
					{data}
					{transports}
					onchanged={refresh}
					onselectnode={(id) => attemptSelect({ kind: 'node', id })}
					onaddchild={(parentId, presetKind) =>
						attemptSelect({ kind: 'new-node', parentId, presetKind })}
					ondeleted={onDeleted}
					{registerForm}
					{caps}
				/>
			{:else if selection?.kind === 'new-node'}
				<NodeDetail
					node={null}
					parentId={selection.parentId}
					presetKind={selection.presetKind}
					{data}
					{transports}
					onchanged={refresh}
					onselectnode={(id) => attemptSelect({ kind: 'node', id })}
					onaddchild={(parentId, presetKind) =>
						attemptSelect({ kind: 'new-node', parentId, presetKind })}
					ondeleted={onDeleted}
					{registerForm}
					{caps}
				/>
			{:else if selection?.kind === 'type' && selectedType}
				<ItemTypeDetail
					itemType={selectedType}
					{data}
					{transports}
					onchanged={refresh}
					onselectnode={(id) => {
						section = 'places';
						attemptSelect({ kind: 'node', id });
					}}
					onselecttype={(id) => attemptSelect({ kind: 'type', id })}
					ondeleted={onDeleted}
					{registerForm}
					{caps}
				/>
			{:else if selection?.kind === 'new-type'}
				<ItemTypeDetail
					itemType={null}
					{data}
					{transports}
					onchanged={refresh}
					onselectnode={(id) => {
						section = 'places';
						attemptSelect({ kind: 'node', id });
					}}
					onselecttype={(id) => attemptSelect({ kind: 'type', id })}
					ondeleted={onDeleted}
					{registerForm}
					{caps}
				/>
			{/if}
		{/key}
	</ClassSplit>
</div>

<style>
	.scope-note {
		margin: 0 0 0.7rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
		background: var(--bg2);
		font-size: 0.88rem;
		color: var(--white);
	}
	.mp-root {
		/* THE MAPS ACCENT SLOT. Spec section 10 leaves the maps identity to a
		   Claude Design pass; until that lands, every place the identity accent
		   would go reads THIS one property, which resolves to a neutral from
		   the design system (--gear, sage structural metal). The design pass
		   fills in one line here and nothing else moves. */
		--maps-accent: var(--gear);
		color: var(--white);
	}
	.load-problem {
		margin: 0 0 0.8rem;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--crimson);
		border-radius: var(--radius-control, 6px);
		color: var(--crimson);
		font-size: 0.88rem;
	}
	.maps-nav {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		min-width: 0;
	}
	.section-tabs {
		display: flex;
		gap: 0.4rem;
	}
	.tab {
		flex: 1 1 0;
		min-height: 44px;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--white);
		background: transparent;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
		cursor: pointer;
	}
	.tab[aria-pressed='true'] {
		border-color: var(--maps-accent, var(--boundary));
		background: var(--bg2);
		color: var(--green);
	}
	.tab:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
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
	.hint {
		margin: 0;
		font-size: 0.78rem;
		color: var(--text-2, var(--dim));
	}
	.add-root {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		border-top: 1px solid var(--line);
		padding-top: 0.7rem;
	}
	.add-row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.type-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.type-row {
		width: 100%;
		min-height: 44px;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.35rem 0.6rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-control, 6px);
		color: var(--white);
		font-family: var(--font-display);
		font-size: 0.95rem;
		text-align: left;
		cursor: pointer;
	}
	.type-row:hover {
		background: var(--bg2);
	}
	.type-row:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}
	.type-row.selected {
		background: var(--bg2);
		border-color: var(--maps-accent, var(--boundary));
	}
	.type-name {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.switch-confirm {
		margin-bottom: 0.8rem;
		padding: 0.8rem;
		border: 1px solid var(--amber);
		border-radius: var(--radius-control, 6px);
		background: var(--bg2);
	}
	.switch-confirm p {
		margin: 0 0 0.6rem;
		font-size: 0.9rem;
	}
	.confirm-row {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
</style>
