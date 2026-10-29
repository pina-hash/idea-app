<script lang="ts">
	import StatusChip from '$lib/ui/StatusChip.svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { coins } from '$lib/coin-format';
	import { payRaisePreview, threeDPrintingPreview, type CoinCategory } from '$lib/coin-desk';
	import {
		callV2,
		cashPurchaseRefusal,
		cents,
		NOT_CASH_PURCHASABLE,
		num,
		V2_UNAVAILABLE,
		type CoinRefusal
	} from './v2';

	/**
	 * ONE STUDENT'S STANDING AND THE TWO V2 ADMIN ACTIONS THAT ARE NOT A LOG
	 * ENTRY, mounted wherever the desk shows one student (the Log area's
	 * student and the Students area's lookup).
	 *
	 *   - Eating Pass and its strikes, read from the lookup.
	 *   - No shop today (0240's coin_no_shop_set), a toggle. A Shop Safety fine
	 *     sets it on its own; this is the admin's hand on it.
	 *   - A purchase paid in physical coins (coin_record_cash_purchase): the
	 *     student hands over coins for something, the purchase is recorded in
	 *     their history and the balance does not move. Refused while the
	 *     balance is negative, because coins in hand pay a debt first.
	 *
	 * `noShopToday` undefined means the lookup came from a database without
	 * V2, which cannot tell; the row then says so rather than guessing "no".
	 */
	let {
		supabase,
		email,
		balance,
		wageTier,
		eatingPassActive,
		eatingPassStrikes,
		noShopToday,
		categories,
		onChanged
	}: {
		supabase: SupabaseClient;
		email: string;
		balance: number | string;
		wageTier: number;
		eatingPassActive: boolean;
		eatingPassStrikes: number;
		noShopToday?: boolean;
		/** Every category the page holds; the purchase ones are picked out here. */
		categories: CoinCategory[];
		onChanged: () => void | Promise<void>;
	} = $props();

	const purchaseCategories = $derived(
		categories.filter(
			(c) => c.kind === 'purchase' && c.active !== false && !NOT_CASH_PURCHASABLE.has(c.id)
		)
	);

	let shopBusy = $state(false);
	let shopError = $state('');

	async function setNoShop(on: boolean) {
		shopBusy = true;
		shopError = '';
		const r = await callV2<{ ok: boolean; reason?: string }>(supabase, 'coin_no_shop_set', {
			p_email: email,
			p_on: on
		});
		shopBusy = false;
		if (r.kind === 'missing') shopError = V2_UNAVAILABLE;
		else if (r.kind === 'error') shopError = r.message;
		else if (!r.data?.ok) shopError = 'That change was refused.';
		else await onChanged();
	}

	let categoryId = $state('');
	let quantity = $state<string | number>('');
	let note = $state('');
	let buyBusy = $state(false);
	let buyError = $state('');
	let buyNotice = $state('');

	const cat = $derived(purchaseCategories.find((c) => c.id === categoryId) ?? null);

	/** What the quantity box means for this category, or null when it needs none. */
	const quantityLabel = $derived.by<string | null>(() => {
		if (!cat) return null;
		if (cat.id === 'three_d_printing') return 'Weight in grams (the slicer reading)';
		if (cat.id === 'pay_raise') return null;
		if (cat.pricing_model === 'per_unit') return `How many (${cat.unit_label ?? 'units'})`;
		if (cat.pricing_model === 'variable' || cat.pricing_model === 'range') return 'Price in coins';
		return null;
	});

	const qty = $derived(Number(quantity));
	const qtyOk = $derived(String(quantity).trim() !== '' && Number.isFinite(qty) && qty > 0);

	/** A preview only: the server prices it. */
	const preview = $derived.by<number | null>(() => {
		if (!cat) return null;
		if (cat.id === 'pay_raise') return payRaisePreview(wageTier);
		if (cat.id === 'three_d_printing') return qtyOk ? threeDPrintingPreview(qty, 0, false).total : null;
		if (cat.pricing_model === 'flat') return num(cat.amount);
		if (cat.pricing_model === 'per_unit') return qtyOk ? cents(num(cat.amount) * qty) : null;
		return qtyOk ? cents(qty) : null;
	});

	const canBuy = $derived(!!cat && !buyBusy && (quantityLabel === null || qtyOk));

	async function recordPurchase() {
		if (!cat || !canBuy) return;
		buyBusy = true;
		buyError = '';
		buyNotice = '';
		const r = await callV2<CoinRefusal & { ok: boolean; price?: number | string }>(
			supabase,
			'coin_record_cash_purchase',
			{
				p_email: email,
				p_category_id: cat.id,
				p_quantity: quantityLabel === null ? null : cents(qty),
				p_note: note.trim() || null
			}
		);
		buyBusy = false;
		if (r.kind === 'missing') {
			buyError = V2_UNAVAILABLE;
			return;
		}
		if (r.kind === 'error') {
			buyError = r.message;
			return;
		}
		if (!r.data?.ok) {
			buyError = cashPurchaseRefusal(r.data ?? {});
			return;
		}
		buyNotice = `Recorded ${cat.name}, paid with ${coins(num(r.data.price))} in physical coins. The balance did not change.`;
		categoryId = '';
		quantity = '';
		note = '';
		await onChanged();
	}
</script>

<div class="tools" data-testid="cd-student-tools">
	<dl class="status">
		<div>
			<dt>Eating Pass</dt>
			<dd data-testid="cd-eating-pass">
				{#if eatingPassActive}
					Held, {eatingPassStrikes} strike{eatingPassStrikes === 1 ? '' : 's'} (a third cancels it)
				{:else}
					Not held
				{/if}
			</dd>
		</div>
		<div>
			<dt>Shop today</dt>
			<dd class="shop" data-testid="cd-no-shop">
				{#if noShopToday === undefined}
					<span class="cdx-note">{V2_UNAVAILABLE}</span>
				{:else}
					{#if noShopToday}
						<StatusChip tone="warn" label="No shop today" />
					{:else}
						<StatusChip tone="ok" label="Allowed" />
					{/if}
					<button
						type="button"
						class="btn secondary cdx-small"
						data-testid="cd-no-shop-toggle"
						disabled={shopBusy}
						onclick={() => setNoShop(!noShopToday)}
					>
						{noShopToday ? 'Let back in the shop today' : 'Keep out of the shop today'}
					</button>
				{/if}
			</dd>
		</div>
	</dl>
	{#if shopError}<p class="cdx-feedback error">{shopError}</p>{/if}

	<fieldset class="buy" data-testid="cd-cash-purchase">
		<legend>Record a purchase paid in coins</legend>
		<p class="cdx-note">
			For physical coins handed over for something. The purchase goes in the history and the balance
			does not move. While the balance is below zero, coins pay the debt first.
		</p>
		{#if buyError}<p class="cdx-feedback error" data-testid="cd-cash-error">{buyError}</p>{/if}
		{#if buyNotice}<p class="cdx-feedback notice">{buyNotice}</p>{/if}
		<div class="cdx-row">
			<label class="cdx-field">
				<span>Purchase</span>
				<select
					class="cdx-select"
					bind:value={categoryId}
					onchange={() => {
						quantity = '';
						buyError = '';
					}}
				>
					<option value="">Choose a purchase</option>
					{#each purchaseCategories as c (c.id)}
						<option value={c.id}>{c.name}</option>
					{/each}
				</select>
			</label>
			{#if quantityLabel}
				<label class="cdx-field">
					<span>{quantityLabel}</span>
					<input class="cdx-input" type="number" min="0.01" step="0.01" bind:value={quantity} />
				</label>
			{/if}
			<label class="cdx-field grow">
				<span>Note (optional)</span>
				<input class="cdx-input" type="text" maxlength="300" bind:value={note} />
			</label>
			<button
				type="button"
				class="btn"
				data-testid="cd-cash-submit"
				disabled={!canBuy}
				onclick={recordPurchase}
			>
				{buyBusy ? 'Recording…' : 'Record purchase'}
			</button>
		</div>
		{#if cat && preview !== null}
			<p class="cdx-note">Price: about {coins(preview)} (the server prices it).</p>
		{/if}
		{#if num(balance) < 0}
			<p class="cdx-note">The balance is {coins(num(balance))}, so a purchase will be refused. Log the coins as a debt payment instead.</p>
		{/if}
	</fieldset>
</div>

<style>
	.tools {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-top: 0.4rem;
	}
	.status {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem 1.6rem;
		margin: 0;
	}
	.status div {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}
	dt {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
	}
	dd {
		margin: 0;
		color: var(--white);
	}
	.shop {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.buy {
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 0.5rem 0.8rem 0.7rem;
		margin: 0;
		min-width: 0;
	}
	legend {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--green);
		padding: 0 0.3rem;
	}
	.grow {
		flex: 1 1 12rem;
	}
</style>
