<script lang="ts">
	import type { Snippet } from 'svelte';
	import { coinNumber, coins } from '$lib/coin-format';
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
	 *
	 * SPLIT PAYMENT (2.3, 0246). With a `split` prop the purchase also offers
	 * "Pay part in physical coins": the student says how many physical coins
	 * they will hand over, the rest is charged now, and the item is granted
	 * when the teacher confirms the coins. The checks are the same rule the
	 * database applies (`coin_buy_split`): not while in debt, a physical part
	 * above 0 and no more than the price, and the digital part affordable.
	 * Without the prop there is no split option at all.
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
		doneWords = null,
		split = null
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
		split?: {
			onsplit: (physical: number) => Promise<CoinBuyResult>;
			/** The balance is below zero, so no split is allowed. */
			inDebt: boolean;
			/** Why it cannot be bought at all, ignoring what it costs. */
			baseBlocked: string | null;
			/** What the student gets when the teacher confirms ("the Eating Pass"). */
			itemWords: string;
		} | null;
	} = $props();

	const uid = $props.id();
	let armed = $state(false);
	let busy = $state(false);
	let outcome = $state<{ ok: boolean; text: string } | null>(null);

	/* ---- split ---- */
	let splitOn = $state(false);
	let physicalText = $state('');
	const splitOffered = $derived(!!split && !split.inDebt && cost !== null && cost > 0);
	const physical = $derived.by(() => {
		const t = physicalText.trim();
		if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
		const n = Number(t);
		return cost !== null && n > 0 && n <= cost ? n : null;
	});
	const digital = $derived(cost !== null && physical !== null ? Math.round((cost - physical) * 100) / 100 : null);
	const splitting = $derived(splitOffered && splitOn);
	const splitBlocked = $derived.by(() => {
		if (!split || cost === null) return null;
		if (split.baseBlocked) return split.baseBlocked;
		if (split.inDebt) return coinBuyRefusalWords({ reason: 'in_debt' });
		if (!physicalText.trim()) return 'Enter how many physical coins you will hand over.';
		if (physical === null) return coinBuyRefusalWords({ reason: 'physical_part', price: cost });
		if (digital !== null && coinBalanceAfter(balance, digital) < 0) {
			return coinBuyRefusalWords({ reason: 'insufficient', balance, cost: digital });
		}
		return null;
	});
	const effBlocked = $derived(splitting ? splitBlocked : blocked);
	const effCost = $derived(splitting ? digital : cost);

	const unavailable = $derived(effBlocked !== null || effCost === null);
	const after = $derived(effCost === null ? null : coinBalanceAfter(balance, effCost));

	function arm() {
		if (unavailable || busy) return;
		outcome = null;
		armed = true;
	}

	async function confirm() {
		if (unavailable || busy || effCost === null) return;
		busy = true;
		const wasSplit = splitting;
		try {
			const r = wasSplit && split && physical !== null ? await split.onsplit(physical) : await onbuy();
			if (r.ok) {
				const paid = r.cost ?? effCost;
				let text: string;
				if (wasSplit) {
					const d = r.digital ?? digital ?? 0;
					const p = r.physical ?? physical ?? 0;
					text = `Sent. ${coins(d)} was taken from your balance now. Hand ${coins(p)} in physical coins to your teacher. You get ${split?.itemWords ?? 'it'} when they confirm. If they deny it, the ${coins(d)} comes back.`;
					splitOn = false;
					physicalText = '';
				} else {
					text = doneWords
						? doneWords(r)
						: `Done. You paid ${coins(paid)}.${r.balance !== undefined ? ` Your balance is now ${coins(r.balance)}.` : ''}`;
				}
				outcome = { ok: true, text };
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

	{#if split}
		{#if split.inDebt && cost !== null && cost > 0}
			<p class="cb-split-note" data-testid="split-in-debt">{coinBuyRefusalWords({ reason: 'in_debt' })}</p>
		{:else if splitOffered}
			<div class="cb-split" data-testid="split">
				<label class="cb-check">
					<input
						type="checkbox"
						bind:checked={splitOn}
						onchange={() => (armed = false)}
						data-testid="split-toggle"
					/>
					<span>Pay part in physical coins</span>
				</label>
				{#if splitOn}
					<p class="cb-split-help">
						The rest is charged from your balance now. Hand the physical coins to your teacher, and you get
						{split.itemWords} when they confirm. If they deny it, the part charged now comes back.
					</p>
					<label class="cb-field">
						<span>Physical coins you hand over</span>
						<input
							type="text"
							inputmode="decimal"
							autocomplete="off"
							placeholder="up to {coinNumber(cost ?? 0)}"
							bind:value={physicalText}
							oninput={() => (armed = false)}
							data-testid="split-physical"
						/>
					</label>
				{/if}
			</div>
		{/if}
	{/if}

	{#if cost !== null}
		<p class="cb-cost">
			{#if splitting}
				Price <strong>{coins(cost)}</strong>
				<span class="cb-sep" aria-hidden="true">/</span>
				Now from your balance <strong data-testid="buy-cost">{coins(digital ?? cost)}</strong>
				<span class="cb-sep" aria-hidden="true">/</span>
				Hand over <strong data-testid="split-hand">{coins(physical ?? 0)}</strong>
			{:else}
				Cost <strong data-testid="buy-cost">{coins(cost)}</strong>
			{/if}
			<span class="cb-sep" aria-hidden="true">/</span>
			Balance after <strong class:cb-neg={after !== null && after < 0} data-testid="buy-after">{coins(after ?? 0)}</strong>
		</p>
	{/if}

	{#if !armed}
		<button
			type="button"
			class="btn cb-key"
			aria-disabled={unavailable ? 'true' : undefined}
			aria-describedby={effBlocked ? `cb-why-${uid}` : undefined}
			data-testid="buy-arm"
			onclick={arm}>{splitting ? 'Pay part now, hand over the rest' : buyLabel}</button
		>
		{#if effBlocked}
			<p class="cb-why" id="cb-why-{uid}" data-testid="buy-blocked">{effBlocked}</p>
		{/if}
	{:else}
		<div class="cb-confirm" data-testid="buy-confirm-panel">
			{#if splitting}
				<p class="cb-confirm-text">
					You pay <strong>{coins(digital ?? 0)}</strong> now and hand <strong>{coins(physical ?? 0)}</strong> in
					physical coins to your teacher. Your balance goes from <strong>{coins(balance)}</strong> to
					<strong>{coins(after ?? 0)}</strong>.
				</p>
			{:else}
				<p class="cb-confirm-text">
					You pay <strong>{coins(cost ?? 0)}</strong>. Your balance goes from
					<strong>{coins(balance)}</strong> to <strong>{coins(after ?? 0)}</strong>.
				</p>
			{/if}
			<div class="cb-confirm-row">
				<button
					type="button"
					class="btn cb-key"
					aria-disabled={unavailable || busy ? 'true' : undefined}
					data-testid="buy-confirm"
					onclick={confirm}>{busy ? 'Buying...' : `Confirm, pay ${coins(effCost ?? 0)}`}</button
				>
				<button type="button" class="btn secondary cb-key" data-testid="buy-cancel" onclick={() => (armed = false)}
					>Cancel</button
				>
			</div>
			{#if effBlocked}
				<p class="cb-why">{effBlocked}</p>
			{/if}
		</div>
	{/if}

	<p class="cb-outcome" class:ok={outcome?.ok} class:no={outcome && !outcome.ok} role="status" data-testid="buy-outcome">
		{outcome?.text ?? ''}
	</p>
</section>

<style>
	/* A row of the list well its page puts it in (ledger 0468): no box of its
	   own inside the card. */
	.cb-buy {
		padding: 0.9rem 1rem;
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
	.cb-split {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		border-top: 1px solid var(--hairline);
		padding-top: 0.5rem;
	}
	.cb-split-note,
	.cb-split-help {
		margin: 0;
		font-size: 0.95rem;
		color: var(--text-1);
	}
	.cb-check {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		min-height: 44px;
		cursor: pointer;
		color: var(--text-1);
		align-self: flex-start;
	}
	.cb-check input {
		width: 1.25rem;
		height: 1.25rem;
		margin: 0;
		accent-color: var(--green);
	}
	.cb-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.cb-field input {
		min-height: 44px;
		font-family: var(--font-display);
		font-size: 1rem;
		letter-spacing: 0;
		text-transform: none;
		color: var(--text-1);
		background: var(--bg0);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
		padding: 0.4rem 0.6rem;
		max-width: 100%;
		min-width: 0;
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
