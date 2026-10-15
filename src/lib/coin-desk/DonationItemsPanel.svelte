<script lang="ts">
	import { onMount } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { coins } from '$lib/coin-format';
	import { COIN_UPLOAD_BUCKET, uploadCoinPhoto } from '$lib/coin-balance/uploads';
	import { callV2, num, V2_UNAVAILABLE } from './v2';
	import {
		donationDraft,
		donationParams,
		donationProblem,
		donationRefusal,
		type DonationDraft,
		type DonationItem
	} from './settings-session-two';

	/**
	 * THE DONATION WANT LIST (0245): what students may donate for coins, at
	 * what rate each. coin_donation_items_list reads it (an admin also sees the
	 * inactive items) and coin_donation_item_save writes one item, new or
	 * changed. Nothing is deleted: an item is switched off. An empty rate is
	 * "Other": the amount is set when the claim is approved.
	 *
	 * A PHOTO goes through the coin page's own upload path
	 * (`uploadCoinPhoto`, `$lib/coin-balance/uploads`) into the admin's own
	 * folder of the private `coin-uploads` bucket, `<uid>/<uuid>.<ext>`, so the
	 * size ceiling, the type rule and the path shape are written once. A
	 * missing `userId` removes the photo control: there is no folder to
	 * upload into.
	 */
	let { supabase, userId = null }: { supabase: SupabaseClient; userId?: string | null } = $props();

	let items = $state<DonationItem[]>([]);
	let phase = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');
	let message = $state('');
	let photoUrls = $state<Record<string, string>>({});

	async function load() {
		const r = await callV2<DonationItem[]>(supabase, 'coin_donation_items_list');
		if (r.kind !== 'ok') {
			if (phase !== 'ready') {
				phase = r.kind;
				message = r.kind === 'error' ? r.message : V2_UNAVAILABLE;
			}
			return;
		}
		items = r.data ?? [];
		phase = 'ready';
		void signPhotos(items.map((i) => i.photo_path).filter((p): p is string => !!p));
	}

	async function signPhotos(paths: string[]) {
		const missing = paths.filter((p) => !photoUrls[p]);
		if (!missing.length) return;
		try {
			const r = await supabase.storage.from(COIN_UPLOAD_BUCKET).createSignedUrls(missing, 600);
			const next = { ...photoUrls };
			for (const row of r.data ?? []) if (row.path && row.signedUrl) next[row.path] = row.signedUrl;
			photoUrls = next;
		} catch {
			// No picture, the words still say what the item is.
		}
	}

	onMount(() => {
		void load();
	});

	// One draft per item being edited, plus the new item's.
	let drafts = $state<Record<string, DonationDraft>>({});
	let said = $state<Record<string, { ok: boolean; text: string }>>({});
	let busy = $state<Record<string, boolean>>({});

	function draftOf(id: string, item: DonationItem | null): DonationDraft {
		return drafts[id] ?? donationDraft(item);
	}
	function edit(id: string, item: DonationItem | null, patch: Partial<DonationDraft>) {
		drafts = { ...drafts, [id]: { ...draftOf(id, item), ...patch } };
	}

	async function choosePhoto(id: string, item: DonationItem | null, e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || !userId) return;
		busy = { ...busy, [id]: true };
		const r = await uploadCoinPhoto(supabase, userId, file);
		busy = { ...busy, [id]: false };
		if (!r.ok) {
			said = { ...said, [id]: { ok: false, text: r.words } };
			return;
		}
		edit(id, item, { photoPath: r.path });
		said = { ...said, [id]: { ok: true, text: 'Photo uploaded. Save the item to use it.' } };
		void signPhotos([r.path]);
	}

	async function saveItem(id: string, item: DonationItem | null) {
		const d = draftOf(id, item);
		const problem = donationProblem(d);
		if (problem) {
			said = { ...said, [id]: { ok: false, text: problem } };
			return;
		}
		busy = { ...busy, [id]: true };
		const r = await callV2<{ ok: boolean; reason?: string }>(
			supabase,
			'coin_donation_item_save',
			donationParams(item ? item.id : null, d)
		);
		busy = { ...busy, [id]: false };
		if (r.kind !== 'ok') {
			said = { ...said, [id]: { ok: false, text: r.kind === 'error' ? r.message : V2_UNAVAILABLE } };
			return;
		}
		if (!r.data?.ok) {
			said = { ...said, [id]: { ok: false, text: donationRefusal(r.data?.reason) } };
			return;
		}
		said = { ...said, [id]: { ok: true, text: item ? `Saved ${d.name.trim()}.` : `Added ${d.name.trim()}.` } };
		const next = { ...drafts };
		delete next[id];
		drafts = next;
		await load();
	}

	function rateWords(i: DonationItem): string {
		return i.rate == null ? 'Other: set at approval' : `${coins(num(i.rate))} each`;
	}
</script>

{#snippet itemForm(id: string, item: DonationItem | null)}
	{@const d = draftOf(id, item)}
	<div class="cdx-row">
		<label class="cdx-field grow">
			<span>Item</span>
			<input
				class="cdx-input"
				type="text"
				maxlength="120"
				value={d.name}
				oninput={(e) => edit(id, item, { name: e.currentTarget.value })}
			/>
		</label>
		<label class="cdx-field">
			<span>Coins each (empty: Other)</span>
			<input
				class="cdx-input"
				type="number"
				min="0"
				max="1000"
				step="0.01"
				value={d.rate}
				oninput={(e) => edit(id, item, { rate: e.currentTarget.value })}
			/>
		</label>
		<label class="cdx-field">
			<span>Order</span>
			<input
				class="cdx-input order"
				type="number"
				step="1"
				value={d.sortOrder}
				oninput={(e) => edit(id, item, { sortOrder: e.currentTarget.value })}
			/>
		</label>
		<label class="check">
			<input type="checkbox" checked={d.active} onchange={(e) => edit(id, item, { active: e.currentTarget.checked })} />
			<span>On the list</span>
		</label>
	</div>
	<div class="cdx-row">
		{#if d.photoPath && photoUrls[d.photoPath]}
			<img class="thumb" src={photoUrls[d.photoPath]} alt="Photo of {d.name || 'the item'}" />
		{/if}
		{#if userId}
			<label class="btn secondary file-btn">
				{d.photoPath ? 'Change photo' : 'Add a photo (optional)'}
				<input class="sr-only" type="file" onchange={(e) => choosePhoto(id, item, e)} />
			</label>
		{/if}
		{#if d.photoPath}
			<button type="button" class="btn secondary cdx-small" onclick={() => edit(id, item, { photoPath: null })}>
				No photo
			</button>
		{/if}
		<button
			type="button"
			class="btn"
			data-testid="cd-donation-save"
			aria-disabled={busy[id]}
			onclick={() => saveItem(id, item)}
		>
			{item ? 'Save item' : 'Add to the want list'}
		</button>
	</div>
	{#if said[id]}<p class="cdx-feedback {said[id].ok ? 'notice' : 'error'}">{said[id].text}</p>{/if}
{/snippet}

<section class="card" id="cd-set-donations-list" data-testid="cd-set-donation-items">
	<h2>Donation want list</h2>
	<p class="cdx-note">
		What students may donate, and what each item pays. A student claims a donation on their coin page
		with a photo, and it waits in the Queue. Nothing is deleted: untick "On the list" to take an item
		off.
	</p>
	{#if phase === 'loading'}
		<p class="cdx-note">Loading…</p>
	{:else if phase !== 'ready'}
		<p class="cdx-feedback error">{message}</p>
	{:else}
		{#if items.length}
			<ul class="items">
				{#each items as i (i.id)}
					<li class="item" class:off={!i.active} data-testid="cd-donation-item">
						<div class="item-head">
							<span class="name">{i.name}</span>
							<span class="cdx-chip">{rateWords(i)}</span>
							{#if !i.active}<span class="cdx-chip warn">Off the list</span>{/if}
						</div>
						{@render itemForm(i.id, i)}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="cdx-note">The list is empty.</p>
		{/if}
		<h3>Add an item</h3>
		{@render itemForm('new', null)}
	{/if}
</section>

<style>
	h2 {
		margin-top: 0;
	}
	h3 {
		font-size: 0.95rem;
		margin: 1rem 0 0.3rem;
	}
	.items {
		list-style: none;
		margin: 0.4rem 0;
		padding: 0;
	}
	.item {
		border-bottom: 1px solid var(--line);
		padding: 0.4rem 0;
	}
	.item-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.name {
		font-weight: 700;
		color: var(--white);
	}
	.item.off .name {
		color: var(--text-2, var(--dim));
	}
	.grow {
		flex: 1 1 14rem;
	}
	.order {
		width: 5rem;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
		color: var(--white);
	}
	.check input {
		width: 1.1rem;
		height: 1.1rem;
		accent-color: var(--green);
	}
	.thumb {
		width: 5rem;
		height: 5rem;
		object-fit: contain;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
	}
	.file-btn {
		display: inline-flex;
		align-items: center;
		cursor: pointer;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
