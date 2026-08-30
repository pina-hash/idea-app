<script lang="ts">
	/**
	 * One stock placement -- a stocked item type at a quantity, in this node.
	 * The schema keeps one row per (type, node); the form states that rule
	 * before the save by refusing a duplicate pick in its own problem list,
	 * with the database's unique constraint as the backstop it should be.
	 */
	import { onMount, untrack } from 'svelte';
	import { SaveState } from '$lib/save-state.svelte';
	import { EditBaseline } from '$lib/edit-baseline.svelte';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import {
		mapsPublishState,
		type MapsFormHandle,
		type MapsItemType,
		type MapsPending,
		type MapsStock
	} from './maps';
	import { mapsSaveObject, type MapsTransports } from './transports';
	import MapsPublishPanel from './MapsPublishPanel.svelte';

	let {
		stock,
		nodeId,
		itemTypes,
		nodeStock,
		pending,
		transports,
		onchanged,
		onclose,
		ondeleted,
		registerForm
	}: {
		/** null = place a type in this node. */
		stock: MapsStock | null;
		nodeId: string;
		itemTypes: MapsItemType[];
		/** Every stock row already in this node, for the duplicate pre-check. */
		nodeStock: MapsStock[];
		pending: MapsPending | null;
		transports: MapsTransports;
		onchanged: () => Promise<void>;
		onclose: () => void;
		/** Handed up: this form unmounts with the row, so the note lands on the node detail. */
		ondeleted: (message: string) => void;
		registerForm: (key: string, handle: MapsFormHandle | null) => void;
	} = $props();

	/* One-time seed; the shell remounts this form (keyed) per selection. */
	const { formKey, base } = untrack(() => ({
		formKey: `stock:${stock?.id ?? 'new'}`,
		base: (stock
			? pending
				? (pending.snapshot as Partial<MapsStock>)
				: stock
			: null) as Partial<MapsStock> | null
	}));

	let typeId = $state(base?.item_type_id ?? '');
	let qtyText = $state(base?.qty === undefined || base?.qty === null ? '' : String(base.qty));

	let actionBusy = $state(false);
	let actionProblem = $state<string | null>(null);
	let deleteArmed = $state(false);

	const signature = () => JSON.stringify([typeId, qtyText.trim()]);
	const baseline = new EditBaseline();
	baseline.seed(signature());

	const qty = $derived.by(() => {
		const trimmed = qtyText.trim();
		if (!/^\d+$/.test(trimmed)) return null;
		return Number(trimmed);
	});

	const problems = $derived.by(() => {
		const out: string[] = [];
		if (typeId === '') out.push('Pick the item type being placed here.');
		if (qty === null) out.push('Quantity must be a whole number, 0 or more.');
		if (
			typeId !== '' &&
			nodeStock.some((s) => s.item_type_id === typeId && s.id !== stock?.id)
		) {
			out.push('That type is already placed in this container. Edit the existing placement instead.');
		}
		return out;
	});

	const typeName = $derived(itemTypes.find((t) => t.id === typeId)?.name ?? 'this type');

	function content() {
		return { item_type_id: typeId, node_id: nodeId, qty: qty ?? 0 };
	}

	let publishNow = false;
	const save = new SaveState({
		autosave: false,
		fallbackMessage: 'That placement was not saved.',
		async save() {
			const result = await mapsSaveObject(transports, {
				table: 'maps_stock',
				row: stock,
				content: content(),
				publishNow
			});
			if (!result.ok) return result;
			baseline.advance(signature());
			const created = stock === null;
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

	async function discardPending() {
		if (!stock) return;
		actionBusy = true;
		actionProblem = null;
		try {
			const result = await transports.discardPending('maps_stock', stock.id);
			if (!result.ok) {
				actionProblem = result.message;
				return;
			}
			await onchanged();
			typeId = stock.item_type_id;
			qtyText = String(stock.qty);
			baseline.seed(signature());
		} finally {
			actionBusy = false;
		}
	}

	async function doDelete() {
		if (!stock) return;
		actionBusy = true;
		actionProblem = null;
		try {
			const result = await transports.deleteRow('maps_stock', stock.id);
			if (!result.ok) {
				actionProblem = result.message;
				return;
			}
			const message = `Removed the placement of ${typeName} here.`;
			await onchanged();
			ondeleted(message);
			onclose();
		} finally {
			actionBusy = false;
		}
	}

	onMount(() => {
		registerForm(formKey, {
			get label() {
				return stock ? `the stock placement of ${typeName}` : 'the new stock placement';
			},
			dirty: () => save.dirty,
			flush: async () => {
				if (save.dirty && problems.length === 0) await doSave(false);
			}
		});
		return () => registerForm(formKey, null);
	});
</script>

<div class="stock-form" data-testid="maps-stock-form">
	<div class="grid">
		<div class="field">
			<label for="{formKey}-type">Item type</label>
			<select id="{formKey}-type" bind:value={typeId} onchange={touch}>
				<option value="">Pick a type&hellip;</option>
				{#each itemTypes as t (t.id)}
					<option value={t.id}>{t.name}</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label for="{formKey}-qty">Quantity</label>
			<input
				id="{formKey}-qty"
				type="text"
				inputmode="numeric"
				bind:value={qtyText}
				oninput={touch}
				autocomplete="off"
			/>
		</div>
	</div>

	{#if problems.length > 0}
		<ul class="problems" role="alert">
			{#each problems as problem (problem)}<li>{problem}</li>{/each}
		</ul>
	{/if}

	<div class="actions">
		<button
			type="button"
			class="btn"
			aria-disabled={problems.length > 0}
			onclick={() => doSave(false)}
		>
			{stock === null ? 'Create draft' : stock.status === 'published' ? 'Save (not public yet)' : 'Save draft'}
		</button>
		<button
			type="button"
			class="btn secondary"
			aria-disabled={problems.length > 0}
			onclick={() => doSave(true)}
		>
			{stock === null ? 'Create & publish' : 'Save & publish'}
		</button>
		<button type="button" class="btn secondary" onclick={onclose}>Close</button>
		<SaveIndicator state={save} />
	</div>

	{#if stock}
		<MapsPublishPanel
			state={mapsPublishState(stock, pending)}
			objectWord="stock placement"
			publishedAt={stock.published_at}
			busy={actionBusy}
			problem={actionProblem}
			onpublish={() => doSave(true)}
			ondiscard={pending ? discardPending : null}
		/>
		<div class="danger">
			{#if !deleteArmed}
				<button type="button" class="btn secondary" onclick={() => (deleteArmed = true)}>
					Delete placement&hellip;
				</button>
			{:else}
				<p>
					Remove the placement of {typeName} here{stock.status === 'published'
						? ', which is currently public'
						: ''}? There is no undo.
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
	.stock-form {
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
		grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
		gap: 0.7rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}
	label {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
	}
	input,
	select {
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
