<script lang="ts">
	import { coins } from '$lib/coin-format';
	import Glyph from './Glyph.svelte';
	import { ORDER_STATUS_WORDS, orderNextStep, type MarketRules, type Order } from './market';
	import type { MarketTransports } from './transports';

	/**
	 * ONE TRADE, from the side of the person looking: where the coins are
	 * (three steps: held, done, paid), the one next thing to do, and the
	 * controls the database says this side may use (the order's `can_*`
	 * flags, never a second spelling of the rule). A dispute asks for words; a
	 * review is offered once a trade is paid out.
	 */
	let {
		order,
		rules,
		transports,
		ondone
	}: { order: Order; rules: MarketRules; transports: MarketTransports; ondone: (message: string) => void } = $props();

	let busy = $state(false);
	let said = $state<{ ok: boolean; text: string } | null>(null);
	let disputing = $state(false);
	let reason = $state('');
	let reviewing = $state(false);
	// The form opens on the review already written, so an edit starts from it.
	const startStars = () => order.my_review?.stars ?? 5;
	const startBody = () => order.my_review?.body ?? '';
	let stars = $state(startStars());
	let body = $state(startBody());

	const status = $derived(ORDER_STATUS_WORDS[order.status]);
	const steps = $derived.by(() => {
		const s = order.status;
		const stopped = s === 'refunded' || s === 'split' || s === 'disputed';
		return [
			{ label: 'Held', state: 'done' },
			{
				label: 'Done',
				state: s === 'held' ? 'now' : stopped && !order.delivered_at ? 'stop' : 'done'
			},
			{
				label: s === 'refunded' ? 'Refunded' : s === 'split' ? 'Split' : s === 'disputed' ? 'Disputed' : 'Paid',
				state: s === 'released' ? 'done' : s === 'delivered' ? 'now' : stopped ? 'stop' : ''
			}
		];
	});

	async function act(action: 'deliver' | 'cancel' | 'confirm' | 'dispute') {
		if (!transports.orderAct || busy) return;
		if (action === 'dispute' && reason.trim().length < 3) {
			said = { ok: false, text: 'Say in a few words what went wrong.' };
			return;
		}
		busy = true;
		const r = await transports.orderAct(order.id, action, action === 'dispute' ? reason.trim() : undefined);
		busy = false;
		if (r.ok) {
			disputing = false;
			ondone(
				action === 'deliver'
					? 'Marked done. They confirm, or it pays out on its own.'
					: action === 'cancel'
						? 'Cancelled. Their coins went back to them.'
						: action === 'confirm'
							? 'Confirmed. The coins went to the seller.'
							: 'Disputed. Staff will decide.'
			);
		} else said = { ok: false, text: r.words };
	}

	async function review(e: SubmitEvent) {
		e.preventDefault();
		if (!transports.review || busy) return;
		if (body.trim().length < rules.review_min_chars) {
			said = { ok: false, text: `Write at least ${rules.review_min_chars} characters.` };
			return;
		}
		busy = true;
		const r = await transports.review(order.id, stars, body.trim());
		busy = false;
		if (r.ok) {
			reviewing = false;
			ondone('Review saved.');
		} else said = { ok: false, text: r.words };
	}
</script>

<li class="mk-trade" data-testid="mk-trade" data-status={order.status} data-side={order.side}>
	<div class="mk-trade-head">
		<span class="mk-trade-title">{order.title}</span>
		<span class="mk-row">
			<span class="mk-price">{coins(order.amount)}</span>
			<span class="mk-chip {status.tone}" data-testid="mk-trade-status">{status.label}</span>
		</span>
	</div>
	<span class="mk-note">
		<Glyph name={order.side === 'payer' ? 'shop' : 'offer'} size={13} />
		{order.side === 'payer' ? 'You pay' : 'You are paid by'}
		{order.other.name}
	</span>
	<ol class="mk-steps" aria-label="Where the coins are">
		{#each steps as st (st.label)}
			<li class="mk-step {st.state}">{st.label}</li>
		{/each}
	</ol>
	<p class="mk-body" data-testid="mk-trade-next">{orderNextStep(order)}</p>
	{#if order.status === 'disputed' && order.dispute_reason}
		<p class="mk-note">Dispute: {order.dispute_reason}</p>
	{/if}
	{#if order.resolution_note && order.status !== 'released'}
		<p class="mk-note">Staff: {order.resolution_note}</p>
	{/if}

	{#if transports.orderAct}
		<div class="mk-row">
			{#if order.can_deliver}
				<button type="button" class="btn mk-key" disabled={busy} onclick={() => act('deliver')} data-testid="mk-deliver">Mark it done</button>
			{/if}
			{#if order.can_confirm}
				<button type="button" class="btn mk-key" disabled={busy} onclick={() => act('confirm')} data-testid="mk-confirm">I got it: pay them</button>
			{/if}
			{#if order.can_cancel}
				<button type="button" class="btn secondary mk-key" disabled={busy} onclick={() => act('cancel')} data-testid="mk-cancel">Cancel and refund</button>
			{/if}
			{#if order.can_dispute && !disputing}
				<button type="button" class="btn secondary mk-key" onclick={() => (disputing = true)} data-testid="mk-dispute-open">Something is wrong</button>
			{/if}
		</div>
		{#if disputing}
			<div class="mk-confirm">
				<label class="mk-field">
					What went wrong
					<textarea maxlength="500" bind:value={reason} data-testid="mk-dispute-reason"></textarea>
				</label>
				<div class="mk-row">
					<button type="button" class="btn mk-key" disabled={busy} onclick={() => act('dispute')} data-testid="mk-dispute-send">Send to staff</button>
					<button type="button" class="btn secondary mk-key" onclick={() => (disputing = false)}>Never mind</button>
				</div>
				<p class="mk-note">The coins stay held until staff decide.</p>
			</div>
		{/if}
	{/if}

	{#if order.can_review && transports.review}
		{#if !reviewing}
			<button type="button" class="btn secondary mk-key" onclick={() => (reviewing = true)} data-testid="mk-review-open">
				{order.my_review ? 'Change your review' : `Review ${order.other.name}`}
			</button>
		{:else}
			<form class="mk-confirm" onsubmit={review} data-testid="mk-review-form">
				<div class="mk-star-pick" role="radiogroup" aria-label="Stars">
					{#each [1, 2, 3, 4, 5] as i (i)}
						<button
							type="button"
							role="radio"
							aria-checked={stars === i}
							aria-label={`${i} star${i === 1 ? '' : 's'}`}
							class:on={i <= stars}
							onclick={() => (stars = i)}
							data-testid="mk-star-{i}"><Glyph name="star" size={22} fill={i <= stars} /></button
						>
					{/each}
				</div>
				<label class="mk-field">
					Your review ({rules.review_min_chars} characters at least)
					<textarea maxlength="1000" bind:value={body} data-testid="mk-review-body"></textarea>
				</label>
				<div class="mk-row">
					<button type="submit" class="btn mk-key" disabled={busy} data-testid="mk-review-send">Save review</button>
					<button type="button" class="btn secondary mk-key" onclick={() => (reviewing = false)}>Not now</button>
					<span class="mk-note">{body.trim().length} characters. You can change it for {rules.review_edit_hours} hours.</span>
				</div>
			</form>
		{/if}
	{:else if order.my_review}
		<p class="mk-note">Your review: {order.my_review.stars} of 5{order.my_review.removed ? ' (removed by staff)' : ''}.</p>
	{/if}
	{#if said}<p class={said.ok ? 'mk-ok' : 'mk-why'} role="status">{said.text}</p>{/if}
</li>
