<script lang="ts">
	/**
	 * One item type -- the searchable vocabulary of spec 5.1. Aliases and tags
	 * are chip inputs (ChipListInput) because they are the fields a search
	 * lives on and their entry is meant to be pleasant, not an afterthought.
	 *
	 * Placements are listed here read-only, with a jump to the container each
	 * lives in: a stock row's HOME surface is its node's detail, so this list
	 * navigates rather than growing a second copy of the placement form.
	 */
	import { onMount, untrack } from 'svelte';
	import { SaveState } from '$lib/save-state.svelte';
	import { EditBaseline } from '$lib/edit-baseline.svelte';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import {
		blankToNull,
		mapsItemLabel,
		mapsNodePath,
		mapsPublishState,
		pendingFor,
		type MapsEditorData,
		type MapsFormHandle,
		type MapsItemType,
		type MapsPending
	} from './maps';
	import { mapsSaveObject, type MapsTransports } from './transports';
	import MapsPublishPanel from './MapsPublishPanel.svelte';
	import MapsStatusChip from './MapsStatusChip.svelte';
	import ChipListInput from './ChipListInput.svelte';

	let {
		itemType,
		data,
		transports,
		onchanged,
		onselectnode,
		onselecttype,
		ondeleted,
		registerForm
	}: {
		/** null = create a new item type. */
		itemType: MapsItemType | null;
		data: MapsEditorData;
		transports: MapsTransports;
		onchanged: () => Promise<void>;
		onselectnode: (id: string) => void;
		onselecttype: (id: string) => void;
		/** Handed up: the delete removes this pane, so the note lands on the list. */
		ondeleted: (message: string) => void;
		registerForm: (key: string, handle: MapsFormHandle | null) => void;
	} = $props();

	/* One-time seed; the shell remounts this detail (keyed) per selection. */
	const { formKey, pending, base } = untrack(() => {
		const staged: MapsPending | null = itemType
			? pendingFor(data.pending, 'maps_item_types', itemType.id)
			: null;
		const editBase: Partial<MapsItemType> | null = itemType
			? staged
				? (staged.snapshot as Partial<MapsItemType>)
				: itemType
			: null;
		return { formKey: `type:${itemType?.id ?? 'new'}`, pending: staged, base: editBase };
	});

	let name = $state(base?.name ?? '');
	let aliases = $state<string[]>([...(base?.aliases ?? [])]);
	let tags = $state<string[]>([...(base?.tags ?? [])]);
	let category = $state(base?.category ?? '');
	let brand = $state(base?.brand ?? '');
	let model = $state(base?.model ?? '');
	let partNumber = $state(base?.part_number ?? '');
	let description = $state(base?.description ?? '');

	let actionBusy = $state(false);
	let actionProblem = $state<string | null>(null);
	let deleteArmed = $state(false);

	const signature = () =>
		JSON.stringify([
			name.trim(),
			aliases,
			tags,
			category.trim(),
			brand.trim(),
			model.trim(),
			partNumber.trim(),
			description.trim()
		]);
	const baseline = new EditBaseline();
	baseline.seed(signature());

	const problems = $derived.by(() => {
		const out: string[] = [];
		if (name.trim() === '') out.push('Give this item type a canonical name.');
		if (name.trim().length > 200) out.push('The name is longer than 200 characters.');
		if (description.length > 4000) out.push('The description is longer than 4000 characters.');
		return out;
	});

	function content() {
		return {
			name: name.trim(),
			aliases,
			tags,
			category: blankToNull(category),
			brand: blankToNull(brand),
			model: blankToNull(model),
			part_number: blankToNull(partNumber),
			description: blankToNull(description)
		};
	}

	let publishNow = false;
	const save = new SaveState({
		autosave: false,
		fallbackMessage: 'This item type was not saved.',
		async save() {
			const result = await mapsSaveObject(transports, {
				table: 'maps_item_types',
				row: itemType,
				content: content(),
				publishNow
			});
			if (!result.ok) return result;
			baseline.advance(signature());
			const created = itemType === null;
			await onchanged();
			if (created) onselecttype(result.data.id);
			return { ok: true };
		}
	});
	$effect(() => save.attach());

	function touch() {
		if (baseline.changed(signature())) save.markDirty();
	}

	function setAliases(next: string[]) {
		aliases = next;
		touch();
	}
	function setTags(next: string[]) {
		tags = next;
		touch();
	}

	async function doSave(publish: boolean) {
		if (problems.length > 0) return;
		publishNow = publish;
		save.markDirty();
		await save.saveNow();
	}

	async function discardPending() {
		if (!itemType) return;
		actionBusy = true;
		actionProblem = null;
		try {
			const result = await transports.discardPending('maps_item_types', itemType.id);
			if (!result.ok) {
				actionProblem = result.message;
				return;
			}
			await onchanged();
			name = itemType.name;
			aliases = [...itemType.aliases];
			tags = [...itemType.tags];
			category = itemType.category ?? '';
			brand = itemType.brand ?? '';
			model = itemType.model ?? '';
			partNumber = itemType.part_number ?? '';
			description = itemType.description ?? '';
			baseline.seed(signature());
		} finally {
			actionBusy = false;
		}
	}

	const typeItems = $derived(
		itemType ? data.items.filter((i) => i.item_type_id === itemType.id) : []
	);
	const typeStock = $derived(
		itemType ? data.stock.filter((s) => s.item_type_id === itemType.id) : []
	);
	const deletable = $derived(typeItems.length === 0 && typeStock.length === 0);

	async function doDelete() {
		if (!itemType) return;
		actionBusy = true;
		actionProblem = null;
		try {
			const result = await transports.deleteRow('maps_item_types', itemType.id);
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

	const label = $derived(
		itemType ? `the item type "${itemType.name}"` : 'the new item type'
	);

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

<div class="type-detail" data-testid="maps-type-detail">
	<header class="detail-head">
		{#if itemType}
			<div class="head-row">
				<h2>{itemType.name}</h2>
				<MapsStatusChip state={mapsPublishState(itemType, pending)} />
			</div>
		{:else}
			<h2>New item type</h2>
		{/if}
	</header>

	{#if pending}
		<p class="pending-strip" data-testid="maps-pending-strip">
			These fields show the <strong>staged pending edit</strong>. The public map still shows the
			previously published version until you publish.
		</p>
	{/if}

	<div class="form-grid">
		<div class="field wide">
			<label for="{formKey}-name">Canonical name</label>
			<input id="{formKey}-name" type="text" bind:value={name} oninput={touch} autocomplete="off" />
		</div>
		<div class="field wide">
			<ChipListInput
				id="{formKey}-aliases"
				label="Aliases"
				values={aliases}
				placeholder="Type an alias, press Enter"
				hint="Every other name people call this thing. Searches match these as strongly as the name."
				onchange={setAliases}
			/>
		</div>
		<div class="field wide">
			<ChipListInput
				id="{formKey}-tags"
				label="Tags"
				values={tags}
				placeholder="Type a tag, press Enter"
				hint={'What it is for, so "thing that cuts aluminum" still finds it.'}
				onchange={setTags}
			/>
		</div>
		<div class="field">
			<label for="{formKey}-category">Category</label>
			<input id="{formKey}-category" type="text" bind:value={category} oninput={touch} autocomplete="off" />
		</div>
		<div class="field">
			<label for="{formKey}-brand">Brand</label>
			<input id="{formKey}-brand" type="text" bind:value={brand} oninput={touch} autocomplete="off" />
		</div>
		<div class="field">
			<label for="{formKey}-model">Model</label>
			<input id="{formKey}-model" type="text" bind:value={model} oninput={touch} autocomplete="off" />
		</div>
		<div class="field">
			<label for="{formKey}-part">Part number</label>
			<input id="{formKey}-part" type="text" bind:value={partNumber} oninput={touch} autocomplete="off" />
		</div>
		<div class="field wide">
			<label for="{formKey}-description">Description</label>
			<textarea id="{formKey}-description" rows="3" bind:value={description} oninput={touch}></textarea>
		</div>
	</div>

	{#if problems.length > 0}
		<ul class="problems" role="alert">
			{#each problems as problem (problem)}<li>{problem}</li>{/each}
		</ul>
	{/if}

	<div class="actions">
		<button type="button" class="btn" aria-disabled={problems.length > 0} onclick={() => doSave(false)}>
			{itemType === null ? 'Create draft' : itemType.status === 'published' ? 'Save (not public yet)' : 'Save draft'}
		</button>
		<button type="button" class="btn secondary" aria-disabled={problems.length > 0} onclick={() => doSave(true)}>
			{itemType === null ? 'Create & publish' : 'Save & publish'}
		</button>
		<SaveIndicator state={save} />
	</div>

	{#if itemType}
		<MapsPublishPanel
			state={mapsPublishState(itemType, pending)}
			objectWord="item type"
			publishedAt={itemType.published_at}
			busy={actionBusy}
			problem={actionProblem}
			onpublish={() => doSave(true)}
			ondiscard={pending ? discardPending : null}
		/>

		<section class="placements" data-testid="maps-type-placements">
			<h3>Where it lives</h3>
			{#if typeStock.length === 0 && typeItems.length === 0}
				<p class="hint">Nothing placed yet. Place stock or add items from a container's own page.</p>
			{:else}
				<ul class="content-list">
					{#each typeStock as s (s.id)}
						<li class="content-row">
							<span class="content-name">
								{mapsNodePath(data.nodes, s.node_id)}
								<span class="qty">&times;{s.qty}</span>
							</span>
							<MapsStatusChip state={mapsPublishState(s, pendingFor(data.pending, 'maps_stock', s.id))} />
							<button type="button" class="btn secondary row-btn" onclick={() => onselectnode(s.node_id)}>
								Open container
							</button>
						</li>
					{/each}
					{#each typeItems as i (i.id)}
						<li class="content-row">
							<span class="content-name">
								{mapsItemLabel(i, data.itemTypes)} &mdash; {mapsNodePath(data.nodes, i.node_id)}
							</span>
							<MapsStatusChip state={mapsPublishState(i, pendingFor(data.pending, 'maps_items', i.id))} />
							<button type="button" class="btn secondary row-btn" onclick={() => onselectnode(i.node_id)}>
								Open container
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="danger" data-testid="maps-type-delete">
			<h3>Delete</h3>
			{#if !deletable}
				<p class="hint">
					This type cannot be deleted while it is in use: {typeItems.length}
					item{typeItems.length === 1 ? '' : 's'} and {typeStock.length} stock
					placement{typeStock.length === 1 ? '' : 's'} reference it. Remove those first.
				</p>
			{:else if !deleteArmed}
				<button type="button" class="btn secondary" onclick={() => (deleteArmed = true)}>
					Delete item type&hellip;
				</button>
			{:else}
				<p>
					Delete {label}{itemType.status === 'published' ? ', which is currently public' : ''}?
					Its aliases, tags and revision history go with it. There is no undo.
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
	.type-detail {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-width: 0;
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
		grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
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
	}
	.hint {
		margin: 0;
		font-size: 0.78rem;
		color: var(--text-2, var(--dim));
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
	.actions {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.placements,
	.danger {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		border-top: 1px solid var(--line);
		padding-top: 0.8rem;
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
	.confirm-row {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
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
