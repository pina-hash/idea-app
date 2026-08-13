<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { MEDIUM_LABELS, type CoinMedium } from '$lib/coin-desk';

	/**
	 * Dedicated debt-payment logging, distinct from the generic category
	 * dropdown below (which also lists "Debt Payment" as an ordinary option --
	 * this panel is a shortcut, not the only door). Mounted in LogView.svelte
	 * right under the student summary card, and ONLY while the looked-up
	 * student's balance is negative -- a student with no debt has nothing
	 * for this panel to do, so it stays out of the way entirely rather than
	 * rendering a disabled or empty state.
	 *
	 * Writes through the SAME 0070 coin_log_transaction RPC every other
	 * 'variable' category already uses (see 0081's migration header for why
	 * "debt_payment" is its own category id rather than reusing Physical
	 * Coin Submission) -- no new RPC, no re-derived enforcement.
	 */
	let {
		supabase,
		email,
		physicalBalance,
		digitalBalance,
		onLogged
	}: {
		supabase: SupabaseClient;
		email: string;
		physicalBalance: number;
		digitalBalance: number;
		onLogged: () => void | Promise<void>;
	} = $props();

	/**
	 * DEBT IS PER MEDIUM SINCE 0096, and so is paying it off. A student can
	 * be in digital debt while holding physical coins (or the reverse), and
	 * the lockout only blocks purchases on the balance that is actually
	 * negative -- so a payment has to say which one it is clearing, or it
	 * would credit the healthy balance and leave the lockout in place.
	 *
	 * The panel offers whichever media are actually in debt, and preselects
	 * the deeper one when both are.
	 */
	const physicalDebt = $derived(Math.max(0, -physicalBalance));
	const digitalDebt = $derived(Math.max(0, -digitalBalance));
	const inDebt = $derived(
		(physicalDebt > 0 ? (['physical'] as CoinMedium[]) : []).concat(
			digitalDebt > 0 ? (['digital'] as CoinMedium[]) : []
		)
	);

	let medium = $state<CoinMedium>('physical');
	const debt = $derived(medium === 'physical' ? physicalDebt : digitalDebt);

	let amountInput = $state('');
	let noteText = $state('Debt payment');
	let busy = $state(false);
	let error = $state('');
	let notice = $state('');

	// Pre-fills from the current debt, but only on a genuinely NEW student
	// (or the very first render) -- once an admin starts editing the amount,
	// a balance refresh triggered by something else must never clobber it.
	let seededForEmail = $state('');
	$effect(() => {
		if (email !== seededForEmail) {
			seededForEmail = email;
			// Preselect the deeper debt, which is the one an admin most likely
			// has in front of them.
			const pick: CoinMedium = digitalDebt > physicalDebt ? 'digital' : 'physical';
			medium = inDebt.includes(pick) ? pick : (inDebt[0] ?? 'physical');
			amountInput = '';
			error = '';
			notice = '';
		}
	});

	// The amount follows the selected medium's debt until the admin edits it.
	let amountTouched = $state(false);
	$effect(() => {
		const owed = medium === 'physical' ? physicalDebt : digitalDebt;
		if (!amountTouched) amountInput = owed > 0 ? String(owed) : '';
	});

	function chooseMedium(m: CoinMedium) {
		medium = m;
		amountTouched = false;
	}

	function num(v: string): number {
		return Number(v);
	}

	const canSubmit = $derived(
		!busy && Number.isFinite(num(amountInput)) && num(amountInput) > 0 && !!noteText.trim()
	);

	async function submit() {
		if (!canSubmit) return;
		error = '';
		notice = '';
		busy = true;
		const resp = await supabase.rpc('coin_log_transaction', {
			p_email: email,
			p_category_id: 'debt_payment',
			p_amount: Math.round(num(amountInput)),
			p_quantity: null,
			p_note: noteText.trim(),
			// Credits the balance that is actually in debt. Getting this wrong
			// would top up the healthy balance and leave the lockout in place.
			p_medium: medium
		});
		busy = false;
		if (resp.error) {
			error = resp.error.message;
			return;
		}
		const r = resp.data as {
			ok: boolean;
			reason?: string;
			amount?: number;
			physical_balance?: number;
			digital_balance?: number;
		};
		if (!r.ok) {
			error = r.reason ? `Refused: ${r.reason}` : 'Refused by the server.';
			return;
		}
		const now = medium === 'physical' ? r.physical_balance : r.digital_balance;
		notice = `Logged +${r.amount}i¢ against the ${medium} balance. It now reads ${now}i¢.`;
		amountTouched = false;
		await onLogged();
	}
</script>

{#if inDebt.length}
	<section class="card debt-payment-panel">
		<h2>Debt payment</h2>
		<p class="debt-line">
			{#each inDebt as m (m)}
				<span class="debt-entry">
					Owes <span class="debt-amount">{m === 'physical' ? physicalDebt : digitalDebt}i&cent;</span>
					{MEDIUM_LABELS[m].toLowerCase()}
				</span>
			{/each}
		</p>
		{#if error}<p class="feedback error">{error}</p>{/if}
		{#if notice}<p class="feedback notice">{notice}</p>{/if}

		{#if inDebt.length > 1}
			<div class="field-row">
				<span class="field-label">Which debt</span>
				<div class="medium-toggle">
					{#each inDebt as m (m)}
						<button type="button" class:active={medium === m} onclick={() => chooseMedium(m)}>
							{MEDIUM_LABELS[m]}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<div class="field-row-group">
			<div class="field-row">
				<label for="debt-amount-input">
					Payment amount (i&cent;, {MEDIUM_LABELS[medium].toLowerCase()})
				</label>
				<input
					id="debt-amount-input"
					type="number"
					min="1"
					step="1"
					bind:value={amountInput}
					oninput={() => (amountTouched = true)}
				/>
				<p class="hint">
					Pre-filled from the current {medium} debt, but editable -- a partial payment or one that
					overpays (leaving a small positive balance) are both fine, not errors. It credits the
					{medium} balance only; the other one is untouched.
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
	.field-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--green);
	}
	.medium-toggle {
		display: flex;
		gap: 0.4rem;
	}
	.medium-toggle button {
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		padding: 0.3rem 0.8rem;
		cursor: pointer;
	}
	.medium-toggle button.active {
		color: var(--bg0);
		background: var(--amber);
		border-color: var(--amber);
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
