<script lang="ts">
	import type { Snippet } from 'svelte';
	import { coins } from '$lib/coin-format';
	import { coinBalanceAfter, coinBuyRefusalWords, type CoinBuyResult } from '$lib/coin-balance';

	/**
	 * ONE PURCHASE, IN TWO PRESSES. The first press shows what it costs and what
	 * the balance will be afterwards; only the second spends anything.
	 *
	 * The page decides whether the purchase can go through (`blocked`, a
	 * sentence) from the same rule the database applies, so a student is told
	 * why BEFORE pressing rather than after. The button is `aria-disabled`,
	 * never `disabled`, so it still explains itself, and its handler refuses on
	 * the same predicate. The database is still the boundary: a refusal it
	 * returns is shown in words exactly as a local one is.
	 *
	 * The outcome line is always mounted (a live region announces only a region
	 * it was already watching) and survives the reload the parent runs after a
	 * purchase, because nothing here resets on a prop change.
	 */
	let {
		testId,
		title,
		buyLabel,
		cost,
		balance,
		blocked = null,
		children,
		onbuy,
		ondone = null,
		doneWords = null
	}: {
		testId: string;
		title: string;
		buyLabel: string;
		/** Null while the inputs do not yet name a purchase. */
		cost: number | null;
		balance: number;
		/** Why this cannot be bought right now, in words; null when it can. */
		blocked?: string | null;
		children?: Snippet;
		onbuy: () => Promise<CoinBuyResult>;
		ondone?: (() => void) | null;
		doneWords?: ((r: CoinBuyResult & { ok: true }) => string) | null;
	} = $props();

	const uid = $props.id();
	let armed = $state(false);
	let busy = $state(false);
	let outcome = $state<{ ok: boolean; text: string } | null>(null);

	const unavailable = $derived(blocked !== null || cost === null);
	const after = $derived(cost === null ? null : coinBalanceAfter(balance, cost));

	function arm() {
		if (unavailable || busy) return;
		outcome = null;
		armed = true;
	}

	async function confirm() {
		if (unavailable || busy || cost === null) return;
		busy = true;
		try {
			const r = await onbuy();
			if (r.ok) {
				const paid = r.cost ?? cost;
				outcome = {
					ok: true,
					text: doneWords
						? doneWords(r)
						: `Done. You paid ${coins(paid)}.${r.balance !== undefined ? ` Your balance is now ${coins(r.balance)}.` : ''}`
				};
				armed = false;
				ondone?.();
			} else {
				outcome = { ok: false, text: coinBuyRefusalWords(r) };
				armed = false;
			}
		} catch {
			outcome = { ok: false, text: coinBuyRefusalWords({ reason: 'error' }) };
			armed = false;
		} finally {
			busy = false;
		}
	}
</script>

<section class="cb-buy" data-testid={testId} aria-labelledby="cb-h-{uid}">
	<h3 id="cb-h-{uid}" class="cb-title">{title}</h3>
	{#if children}<div class="cb-body">{@render children()}</div>{/if}

	{#if cost !== null}
		<p class="cb-cost">
			Cost <strong data-testid="buy-cost">{coins(cost)}</strong>
			<span class="cb-sep" aria-hidden="true">/</span>
			Balance after <strong class:cb-neg={after !== null && after < 0} data-testid="buy-after">{coins(after ?? 0)}</strong>
		</p>
	{/if}

	{#if !armed}
		<button
			type="button"
			class="btn cb-key"
			aria-disabled={unavailable ? 'true' : undefined}
			aria-describedby={blocked ? `cb-why-${uid}` : undefined}
			data-testid="buy-arm"
			onclick={arm}>{buyLabel}</button
		>
		{#if blocked}
			<p class="cb-why" id="cb-why-{uid}" data-testid="buy-blocked">{blocked}</p>
		{/if}
	{:else}
		<div class="cb-confirm" data-testid="buy-confirm-panel">
			<p class="cb-confirm-text">
				You pay <strong>{coins(cost ?? 0)}</strong>. Your balance goes from
				<strong>{coins(balance)}</strong> to <strong>{coins(after ?? 0)}</strong>.
			</p>
			<div class="cb-confirm-row">
				<button
					type="button"
					class="btn cb-key"
					aria-disabled={unavailable || busy ? 'true' : undefined}
					data-testid="buy-confirm"
					onclick={confirm}>{busy ? 'Buying...' : `Confirm, pay ${coins(cost ?? 0)}`}</button
				>
				<button type="button" class="btn secondary cb-key" data-testid="buy-cancel" onclick={() => (armed = false)}
					>Cancel</button
				>
			</div>
			{#if blocked}
				<p class="cb-why">{blocked}</p>
			{/if}
		</div>
	{/if}

	<p class="cb-outcome" class:ok={outcome?.ok} class:no={outcome && !outcome.ok} role="status" data-testid="buy-outcome">
		{outcome?.text ?? ''}
	</p>
</section>

<style>
	.cb-buy {
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 8px);
		padding: 0.9rem 1rem;
		background: var(--bg2);
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		min-width: 0;
	}
	.cb-title {
		margin: 0;
		font-size: 1.1rem;
		color: var(--text-1);
	}
	.cb-title::before {
		content: none;
	}
	.cb-body {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		color: var(--text-1);
	}
	.cb-cost {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--text-2);
	}
	.cb-cost strong {
		color: var(--text-1);
		font-weight: 400;
	}
	.cb-cost strong.cb-neg {
		color: var(--amber);
	}
	.cb-sep {
		margin: 0 0.4rem;
	}
	.cb-key {
		align-self: flex-start;
		justify-content: center;
	}
	.cb-key[aria-disabled='true'] {
		color: var(--text-2);
		border-color: var(--boundary);
		cursor: not-allowed;
	}
	.cb-key[aria-disabled='true']:hover {
		background: transparent;
		box-shadow: none;
		color: var(--text-2);
	}
	.cb-why {
		margin: 0;
		font-size: 0.95rem;
		color: var(--amber);
	}
	.cb-confirm {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		border-left: 3px solid var(--green);
		padding-left: 0.75rem;
	}
	.cb-confirm-text {
		margin: 0;
		color: var(--text-1);
	}
	.cb-confirm-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.cb-outcome {
		margin: 0;
		min-height: 0;
		font-size: 0.95rem;
	}
	.cb-outcome.ok {
		color: var(--green);
	}
	.cb-outcome.no {
		color: var(--amber);
	}
</style>
