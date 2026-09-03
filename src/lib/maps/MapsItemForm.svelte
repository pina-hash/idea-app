<script lang="ts">
	/**
	 * One unique item -- create or edit, inside its container node's detail
	 * pane. A typeless item must carry its own name (0161's named-or-typed
	 * rule), and the form states that before the save can be pressed rather
	 * than relaying a constraint violation after.
	 *
	 * A PUBLISHED item's edit is STAGED (mapsSaveObject), so the panel below
	 * the fields is what says whether the public is seeing this content yet.
	 */
	import { onMount, untrack } from 'svelte';
	import { SaveState } from '$lib/save-state.svelte';
	import { EditBaseline } from '$lib/edit-baseline.svelte';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import {
		blankToNull,
		mapsItemLabel,
		mapsPublishState,
		type MapsFormHandle,
		type MapsItem,
		type MapsItemType,
		type MapsPending
	} from './maps';
	import { mapsSaveObject, type MapsTransports } from './transports';
	import MapsPublishPanel from './MapsPublishPanel.svelte';
	import { MAPS_GRANT_REFUSAL } from './grants';

	let {
		item,
		nodeId,
		itemTypes,
		pending,
		transports,
		onchanged,
		onclose,
		ondeleted,
		registerForm,
		canEdit = true
	}: {
		/** null = create a new item in this node. */
		item: MapsItem | null;
		nodeId: string;
		itemTypes: MapsItemType[];
		pending: MapsPending | null;
		transports: MapsTransports;
		onchanged: () => Promise<void>;
		onclose: () => void;
		/** Handed up: this form unmounts with the row, so the note lands on the node detail. */
		ondeleted: (message: string) => void;
		registerForm: (key: string, handle: MapsFormHandle | null) => void;
		/**
		 * False for a granted editor looking at something outside what they
		 * hold, or at something already public. The WRITE controls go; the
		 * fields stay readable, because "you may not change this" and "you may
		 * not see this" are different answers and the second one is the
		 * database's, not this component's.
		 */
		canEdit?: boolean;
	} = $props();

	/** Only an admin publishes (0172). Absence removes the control. */
	const canPublish = $derived(transports.publish !== undefined);

	/* The one-time seed. This form edits a SNAPSHOT of the row it opened on --
	   the shell remounts it (keyed) per selection -- so the captures are
	   deliberate, and untrack says so the way the coin desk's pref seed does. */
	const { formKey, base } = untrack(() => {
		const editBase: Partial<MapsItem> | null = item
			? pending
				? (pending.snapshot as Partial<MapsItem>)
				: item
			: null;
		return { formKey: `item:${item?.id ?? 'new'}`, base: editBase };
	});

	let typeId = $state(base?.item_type_id ?? '');
	let name = $state(base?.name ?? '');
	let serial = $state(base?.serial ?? '');
	let notes = $state(base?.notes ?? '');

	let actionBusy = $state(false);
	let actionProblem = $state<string | null>(null);
	let deleteArmed = $state(false);

	const signature = () => JSON.stringify([typeId, name.trim(), serial.trim(), notes.trim()]);
	const baseline = new EditBaseline();
	baseline.seed(signature());

	const problems = $derived.by(() => {
		const out: string[] = [];
		if (typeId === '' && name.trim() === '') {
			out.push('A unique item needs an item type, or its own name, or both.');
		}
		if (name.trim().length > 200) out.push('The name is longer than 200 characters.');
		if (notes.length > 4000) out.push('Notes are longer than 4000 characters.');
		return out;
	});

	function content() {
		return {
			item_type_id: typeId === '' ? null : typeId,
			node_id: nodeId,
			name: blankToNull(name),
			serial: blankToNull(serial),
			notes: blankToNull(notes)
		};
	}

	let publishNow = false;
	const save = new SaveState({
		autosave: false,
		fallbackMessage: 'That item was not saved.',
		async save() {
			const result = await mapsSaveObject(transports, {
				table: 'maps_items',
				row: item,
				content: content(),
				publishNow
			});
			if (!result.ok) return result;
			baseline.advance(signature());
			const created = item === null;
			await onchanged();
			if (created) onclose();
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

	async function publishStaged() {
		await doSave(true);
	}

	async function discardPending() {
		if (!item) return;
		actionBusy = true;
		actionProblem = null;
		try {
			const result = await transports.discardPending('maps_items', item.id);
			if (!result.ok) {
				actionProblem = result.message;
				return;
			}
			await onchanged();
			// Back to the live row's content: the staged edit is gone.
			typeId = item.item_type_id ?? '';
			name = item.name ?? '';
			serial = item.serial ?? '';
			notes = item.notes ?? '';
			baseline.seed(signature());
		} finally {
			actionBusy = false;
		}
	}

	async function doDelete() {
		if (!item) return;
		actionBusy = true;
		actionProblem = null;
		try {
			const result = await transports.deleteRow('maps_items', item.id);
			if (!result.ok) {
				actionProblem = result.message;
				return;
			}
			const message = `Deleted ${label}.`;
			await onchanged();
			ondeleted(message);
			onclose();
		} finally {
			actionBusy = false;
		}
	}

	const label = $derived(
		item ? `the item "${mapsItemLabel(item, itemTypes)}"` : 'the new item'
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

<div class="item-form" data-testid="maps-item-form">
	<div class="grid">
		<div class="field">
			<label for="{formKey}-type">Item type</label>
			<select id="{formKey}-type" bind:value={typeId} onchange={touch}>
				<option value="">No type (one-off item)</option>
				{#each itemTypes as t (t.id)}
					<option value={t.id}>{t.name}</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label for="{formKey}-name">Own name {typeId === '' ? '(required without a type)' : '(optional)'}</label>
			<input id="{formKey}-name" type="text" bind:value={name} oninput={touch} autocomplete="off" />
		</div>
		<div class="field">
			<label for="{formKey}-serial">Serial</label>
			<input id="{formKey}-serial" type="text" bind:value={serial} oninput={touch} autocomplete="off" />
		</div>
		<div class="field wide">
			<label for="{formKey}-notes">Condition notes</label>
			<textarea id="{formKey}-notes" rows="2" bind:value={notes} oninput={touch}></textarea>
		</div>
	</div>

	{#if problems.length > 0}
		<ul class="problems" role="alert">
			{#each problems as problem (problem)}<li>{problem}</li>{/each}
		</ul>
	{/if}

	<div class="actions">
		{#if canEdit}
			<button
				type="button"
				class="btn"
				aria-disabled={problems.length > 0}
				onclick={() => doSave(false)}
			>
				{item === null ? 'Create draft' : item.status === 'published' ? 'Save (not public yet)' : 'Save draft'}
			</button>
			{#if canPublish}
				<button
					type="button"
					class="btn secondary"
					aria-disabled={problems.length > 0}
					onclick={() => doSave(true)}
				>
					{item === null ? 'Create & publish' : 'Save & publish'}
				</button>
			{/if}
		{/if}
		<button type="button" class="btn secondary" onclick={onclose}>Close</button>
		<SaveIndicator state={save} />
	</div>
	{#if !canEdit}
				<p class="grant-note" data-testid="maps-readonly-note">{MAPS_GRANT_REFUSAL}</p>
	{/if}

	{#if item}
		<MapsPublishPanel
			state={mapsPublishState(item, pending)}
			objectWord="item"
			publishedAt={item.published_at}
			busy={actionBusy}
			problem={actionProblem}
			onpublish={canPublish ? publishStaged : null}
			ondiscard={pending ? discardPending : null}
		/>
		<div class="danger">
			{#if !canEdit}
				<p class="grant-note">Deleting this is a site admin.</p>
			{:else if !deleteArmed}
				<button type="button" class="btn secondary" onclick={() => (deleteArmed = true)}>
					Delete item&hellip;
				</button>
			{:else}
				<p>
					Delete {label}{item.status === 'published' ? ', which is currently public' : ''}? Its
					history goes with it. There is no undo.
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
		</div>
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
	.item-form {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
		padding: 0.8rem;
		background: var(--bg1);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
		gap: 0.7rem;
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
	}
	.problems {
		margin: 0;
		padding-left: 1.1rem;
		color: var(--crimson);
		font-size: 0.85rem;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.danger {
		border-top: 1px solid var(--line);
		padding-top: 0.6rem;
	}
	.danger p {
		margin: 0 0 0.5rem;
		font-size: 0.88rem;
		color: var(--white);
	}
	.confirm-row {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.danger-btn {
		color: var(--crimson);
		border-color: var(--crimson);
	}
</style>
