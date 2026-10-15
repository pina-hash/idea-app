<script lang="ts">
	import './coin-page.css';
	import { coinNumber, coins } from '$lib/coin-format';
	import type { CoinPayoutHeld } from '$lib/coin-balance';
	import { coinWhen } from '$lib/coin-balance';
	import { coinDayLong, payoutRefusalWords, type CoinActionResult } from './extras';

	/**
	 * COINS OUT (2.4, 0246). A student asks for coins out of their own balance,
	 * up to the balance. The amount is held at once (it leaves what they can
	 * spend), and the teacher hands the coins over on payday. Cancel any time
	 * before payday gives the hold back.
	 *
	 * Asking is two presses, because it takes coins out of what can be spent.
	 * An omitted `request` removes the ask; an omitted `cancel` removes Cancel.
	 */
	let {
		balance,
		payout,
		payday,
		request = null,
		cancel = null,
		ondone = null
	}: {
		balance: number;
		payout: CoinPayoutHeld | null;
		payday: string | null;
		request?: ((coins: number) => Promise<CoinActionResult>) | null;
		cancel?: (() => Promise<CoinActionResult>) | null;
		ondone?: (() => void) | null;
	} = $props();

	let amountText = $state('');
	let armed = $state(false);
	let busy = $state(false);
	let outcome = $state<{ ok: boolean; text: string } | null>(null);

	const paydayWords = $derived(payday ? coinDayLong(payday) : null);
	const amount = $derived.by(() => {
		const t = amountText.trim();
		if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
		const n = Number(t);
		return n > 0 ? n : null;
	});
	const blocked = $derived.by(() => {
		if (payout) return null;
		if (balance <= 0) return `Your balance is ${coins(balance)}, so there is nothing to take out.`;
		if (!amountText.trim()) return 'Enter how many coins you want out.';
		if (amount === null) return payoutRefusalWords({ reason: 'coins' });
		if (amount > balance) return payoutRefusalWords({ reason: 'insufficient', data: { balance } });
		return null;
	});

	function arm() {
		if (blocked || busy) return;
		outcome = null;
		armed = true;
	}

	async function send() {
		if (!request || blocked || busy || amount === null) return;
		busy = true;
		try {
			const r = await request(amount);
			if (r.ok) {
				const day = typeof r.data.payday === 'string' ? coinDayLong(r.data.payday) : paydayWords;
				outcome = {
					ok: true,
					text: `Held. ${coins(amount)} will be handed to you on payday${day ? `, ${day}` : ''}.`
				};
				amountText = '';
				ondone?.();
			} else {
				outcome = { ok: false, text: payoutRefusalWords(r) };
			}
		} catch {
			outcome = { ok: false, text: payoutRefusalWords({ reason: 'error' }) };
		} finally {
			busy = false;
			armed = false;
		}
	}

	async function undo() {
		if (!cancel || busy) return;
		busy = true;
		try {
			const r = await cancel();
			outcome = r.ok
				? { ok: true, text: 'Cancelled. The coins are back in your balance.' }
				: { ok: false, text: payoutRefusalWords(r) };
			if (r.ok) ondone?.();
		} catch {
			outcome = { ok: false, text: payoutRefusalWords({ reason: 'error' }) };
		} finally {
			busy = false;
		}
	}
</script>

<section class="card cpx-card cpx-panel" aria-labelledby="cpx-h-payout" data-testid="coin-payout">
	<h2 id="cpx-h-payout">Coins out</h2>
	<p class="cpx-lead">
		Ask for coins out of your balance and your teacher hands them to you on payday, the first class day of the
		month{#if paydayWords}{' '}(next: <strong data-testid="payout-payday">{paydayWords}</strong>){/if}.
	</p>
	<ul class="cpx-limits">
		<li>The coins are held right away, so you cannot spend them meanwhile.</li>
		<li>Up to your balance, {coins(balance < 0 ? 0 : balance)} now.</li>
		<li>Cancel any time before payday and they come back.</li>
		<li>If you are absent on payday, they wait for the next one.</li>
	</ul>

	{#if payout}
		<div class="cpx-held" data-testid="payout-held">
			<p><span class="cpx-big">{coins(payout.coins)}</span> held for you.</p>
			<p>
				Handed out on payday{#if paydayWords}, <strong>{paydayWords}</strong>{/if}. Asked {coinWhen(payout.requested_at)}.
			</p>
			{#if cancel}
				<button
					type="button"
					class="btn secondary cpx-key"
					aria-disabled={busy ? 'true' : undefined}
					data-testid="payout-cancel"
					onclick={undo}>{busy ? 'Cancelling...' : 'Cancel, put them back'}</button
				>
			{/if}
		</div>
	{:else if request}
		<label class="cpx-field">
			<span>Coins you want out</span>
			<input
				type="text"
				inputmode="decimal"
				autocomplete="off"
				placeholder="up to {coinNumber(balance < 0 ? 0 : balance)}"
				bind:value={amountText}
				oninput={() => (armed = false)}
				data-testid="payout-amount"
			/>
		</label>
		{#if !armed}
			<button
				type="button"
				class="btn cpx-key"
				aria-disabled={blocked ? 'true' : undefined}
				data-testid="payout-arm"
				onclick={arm}>Ask for coins out</button
			>
			{#if blocked}<p class="cpx-why" data-testid="payout-blocked">{blocked}</p>{/if}
		{:else}
			<div class="cpx-confirm" data-testid="payout-confirm-panel">
				<p>
					<strong>{coins(amount ?? 0)}</strong> leaves your balance now, from {coins(balance)} to
					{coins(Math.round((balance - (amount ?? 0)) * 100) / 100)}, and is handed to you on payday.
				</p>
				<div class="cpx-row">
					<button
						type="button"
						class="btn cpx-key"
						aria-disabled={busy ? 'true' : undefined}
						data-testid="payout-confirm"
						onclick={send}>{busy ? 'Asking...' : `Confirm, hold ${coins(amount ?? 0)}`}</button
					>
					<button type="button" class="btn secondary cpx-key" onclick={() => (armed = false)}>Cancel</button>
				</div>
			</div>
		{/if}
	{/if}
	<p class="cpx-outcome" class:ok={outcome?.ok} class:no={outcome && !outcome.ok} role="status" data-testid="payout-outcome">
		{outcome?.text ?? ''}
	</p>
</section>
