<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { coins } from '$lib/coin-format';
	import { cents, coinRefusalWords, num, type CoinRefusal } from './v2';

	/**
	 * DEBT PAYMENT (IDEA Coin V2): physical coins a student hands over to pay
	 * down a negative balance, credited to the one balance as a `debt_payment`
	 * row. Mounted only while the balance is below zero.
	 *
	 * Since 0239 there is ONE balance, and it is digital: physical coins are
	 * untracked cash, so handing some back is how a student in debt gets back
	 * to zero. The call names no medium; the server writes digital.
	 *
	 * Writes through the same coin_log_transaction RPC every other variable
	 * category uses (0081 gave debt payment its own category id).
	 */
	let {
		supabase,
		email,
		balance,
		onLogged
	}: {
		supabase: SupabaseClient;
		email: string;
		/** The one balance. The panel renders only while it is negative. */
		balance: number | string;
		onLogged: () => void | Promise<void>;
	} = $props();

	const debt = $derived(Math.max(0, -num(balance)));

	let amountInput = $state<string | number>('');
	let noteText = $state('Debt payment');
	let busy = $state(false);
	let error = $state('');
	let notice = $state('');

	// Pre-fills from the debt on a new student; once the admin edits the
	// amount, a refresh triggered by something else must not clobber it.
	let seededForEmail = $state('');
	let amountTouched = $state(false);
	$effect(() => {
		if (email !== seededForEmail) {
			seededForEmail = email;
			amountTouched = false;
			error = '';
			notice = '';
		}
	});
	$effect(() => {
		if (!amountTouched) amountInput = debt > 0 ? String(debt) : '';
	});

	const amountValue = $derived(Number(amountInput));
	const canSubmit = $derived(
		!busy && String(amountInput).trim() !== '' && Number.isFinite(amountValue) && amountValue > 0 && !!noteText.trim()
	);

	async function submit() {
		if (!canSubmit) return;
		error = '';
		notice = '';
		busy = true;
		let resp: { data: unknown; error: { message: string } | null };
		try {
			resp = await supabase.rpc('coin_log_transaction', {
				p_email: email,
				p_category_id: 'debt_payment',
				p_amount: cents(amountValue),
				p_quantity: null,
				p_note: noteText.trim()
			});
		} finally {
			busy = false;
		}
		if (resp.error) {
			error = resp.error.message;
			return;
		}
		const r = resp.data as CoinRefusal & { ok: boolean; amount?: number | string };
		if (!r.ok) {
			error = coinRefusalWords(r);
			return;
		}
		notice = `Logged ${coins(num(r.amount ?? amountValue))} of physical coins handed over. The balance is now ${coins(num(r.balance))}.`;
		amountTouched = false;
		await onLogged();
	}
</script>

{#if debt > 0}
	<section class="card debt-payment-panel" data-testid="cd-debt-panel">
		<h2>Debt payment</h2>
		<p class="debt-line">
			<span class="debt-entry">
				Balance <span class="debt-amount">{coins(num(balance))}</span>
			</span>
		</p>
		{#if error}<p class="feedback error">{error}</p>{/if}
		{#if notice}<p class="feedback notice">{notice}</p>{/if}

		<div class="field-row-group">
			<div class="field-row">
				<label for="debt-amount-input">Physical coins handed over</label>
				<input
					id="debt-amount-input"
					type="number"
					min="0.01"
					step="0.01"
					bind:value={amountInput}
					oninput={() => (amountTouched = true)}
				/>
				<p class="hint">
					Filled in with what brings the balance back to zero. A smaller payment or one that leaves a
					little positive balance are both fine.
				</p>
			</div>
			<div class="field-row">
				<label for="debt-note-input">Note</label>
				<input id="debt-note-input" type="text" maxlength="500" bind:value={noteText} />
			</div>
		</div>

		<div class="btn-row">
			<button class="btn" disabled={!canSubmit} onclick={submit}>
				{busy ? 'Logging…' : 'Log debt payment'}
			</button>
		</div>
	</section>
{/if}

<style>
	.debt-payment-panel {
		border-color: var(--amber);
	}
	.debt-line {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		font-family: 'Rajdhani', sans-serif;
		font-size: 1rem;
		color: var(--white);
		margin: 0 0 0.6rem;
	}
	.debt-entry {
		display: inline-flex;
		align-items: baseline;
		gap: 0.3rem;
	}
	.debt-amount {
		font-family: 'Share Tech Mono', monospace;
		font-size: 1.2rem;
		color: var(--amber);
	}
	.feedback {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		padding: 0.45rem 0.7rem;
		border-radius: 5px;
		margin-bottom: 0.8rem;
	}
	.feedback.error {
		color: var(--amber);
		border: 1px solid var(--amber);
	}
	.feedback.notice {
		color: var(--green);
		border: 1px solid var(--line);
	}
	.field-row-group {
		display: flex;
		gap: 0.8rem;
		flex-wrap: wrap;
	}
	.field-row-group .field-row {
		flex: 1;
		min-width: 12rem;
	}
	.field-row {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-bottom: 0.8rem;
	}
	.field-row label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--green);
	}
	.field-row input {
		min-height: 44px;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 1rem;
		padding: 0.45rem 0.6rem;
	}
	.field-row input:focus {
		outline: 2px solid var(--cyan);
		outline-offset: 1px;
	}
	.hint {
		color: var(--dim);
		font-size: 0.75rem;
		margin: 0;
	}
	.btn-row {
		display: flex;
		gap: 0.85rem;
		flex-wrap: wrap;
		margin-top: 0.4rem;
	}
</style>
