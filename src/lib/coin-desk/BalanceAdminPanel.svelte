<script lang="ts">
	import { onMount } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { coins, COIN_SYMBOL } from '$lib/coin-format';
	import type { CoinCategory } from '$lib/coin-desk';
	import DeskHistory from './DeskHistory.svelte';
	import DebtPaymentPanel from './DebtPaymentPanel.svelte';
	import StudentCoinTools from './StudentCoinTools.svelte';
	import { cents, coinRefusalWords, num, reverseTransaction, type CoinRefusal, type DeskTxn } from './v2';

	/**
	 * ONE STUDENT BY EMAIL: the balance, the history with Undo, a signed
	 * adjustment, and the V2 student tools (Eating Pass, no shop today, a
	 * purchase paid in coins). Works for an email that has never signed in:
	 * every RPC here keys on the address alone.
	 *
	 * IDEA Coin V2 (0239): ONE balance, the digital sum. A negative balance is
	 * the debt and is shown as the balance; the debt payment panel opens under
	 * it while it is below zero.
	 *
	 * `initialEmail` opens a student on mount, which is how the debt list's
	 * links land here (`/coin-desk/students?student=...`).
	 */
	let {
		supabase,
		categoryKinds = {},
		categories = [],
		initialEmail = ''
	}: {
		supabase: SupabaseClient;
		/**
		 * category id -> coin_categories.kind, from the page's own load. Without
		 * it every non-payout row reads as an adjustment (see coinTxnType).
		 */
		categoryKinds?: Record<string, string>;
		/** Every category, for the purchase picker in the student tools. */
		categories?: CoinCategory[];
		initialEmail?: string;
	} = $props();

	interface CoinLookup {
		email: string;
		balance: number | string;
		wage_tier: number;
		eating_pass_active: boolean;
		eating_pass_strikes: number;
		/** V2 only; absent on an older database. */
		no_shop_today?: boolean;
		recent_transactions: DeskTxn[];
	}

	let coinEmail = $state('');
	let busy = $state(false);
	let errorMsg = $state('');
	let notice = $state('');
	let lookup = $state<CoinLookup | null>(null);
	let adjustAmount = $state<string | number>('');
	let adjustNote = $state('');

	async function runLookup(refresh = false) {
		const target = (refresh && lookup ? lookup.email : coinEmail).trim().toLowerCase();
		if (!target) return;
		errorMsg = '';
		if (!refresh) notice = '';
		busy = true;
		const resp = await supabase.rpc('coin_admin_lookup', { p_email: target });
		busy = false;
		if (resp.error) {
			errorMsg = resp.error.message;
			lookup = null;
			return;
		}
		lookup = resp.data as CoinLookup;
	}

	onMount(() => {
		if (initialEmail) {
			coinEmail = initialEmail;
			void runLookup();
		}
	});

	const adjustValue = $derived(Number(adjustAmount));

	async function applyAdjustment() {
		if (!lookup || !canAdjust) return;
		const target = lookup.email;
		errorMsg = '';
		notice = '';
		busy = true;
		const resp = await supabase.rpc('coin_admin_adjust_balance', {
			p_email: target,
			p_amount: cents(adjustValue),
			p_note: adjustNote.trim()
		});
		busy = false;
		if (resp.error) {
			errorMsg = resp.error.message;
			return;
		}
		const r = resp.data as CoinRefusal & { ok: boolean };
		if (!r.ok) {
			errorMsg = coinRefusalWords(r);
			return;
		}
		notice = `Applied ${adjustValue > 0 ? '+' : ''}${coins(cents(adjustValue))} to ${target}. The balance is now ${coins(num(r.balance))}.`;
		adjustAmount = '';
		adjustNote = '';
		// Refresh WITHOUT clearing the confirmation above.
		await runLookup(true);
	}

	const canAdjust = $derived(
		!busy &&
			String(adjustAmount).trim() !== '' &&
			Number.isFinite(adjustValue) &&
			adjustValue !== 0 &&
			!!adjustNote.trim()
	);
</script>

<section class="card">
	<h2>One student</h2>
	<p class="note">
		Look up a student's balance and history by email, whether or not they have signed in yet. There
		is one balance; below zero is debt. Undo cancels one row with a reversing row, so the history
		keeps both.
	</p>
	{#if errorMsg}<p class="feedback error">{errorMsg}</p>{/if}
	{#if notice}<p class="feedback notice">{notice}</p>{/if}
	<div class="add-row">
		<input
			type="email"
			placeholder="student@boscotech.net"
			aria-label="Student email"
			data-testid="cd-balance-email"
			bind:value={coinEmail}
			onkeydown={(e) => {
				if (e.key === 'Enter') runLookup();
			}}
		/>
		<button class="btn secondary" disabled={busy || !coinEmail.trim()} onclick={() => runLookup()}>
			Look up
		</button>
	</div>

	{#if lookup}
		<div class="coin-summary">
			<div class="coin-balance" class:negative={num(lookup.balance) < 0} data-testid="cd-balance">
				{coins(num(lookup.balance))}
			</div>
			<div class="coin-meta">
				<span>{lookup.email}</span>
				<span>wage tier {lookup.wage_tier}</span>
				{#if num(lookup.balance) < 0}<span class="debt-word">in debt</span>{/if}
			</div>
		</div>

		<StudentCoinTools
			{supabase}
			email={lookup.email}
			balance={lookup.balance}
			wageTier={lookup.wage_tier}
			eatingPassActive={lookup.eating_pass_active}
			eatingPassStrikes={lookup.eating_pass_strikes}
			noShopToday={lookup.no_shop_today}
			{categories}
			onChanged={() => runLookup(true)}
		/>

		{#if num(lookup.balance) < 0}
			<DebtPaymentPanel
				{supabase}
				email={lookup.email}
				balance={lookup.balance}
				onLogged={() => runLookup(true)}
			/>
		{/if}

		<h3>Adjust the balance</h3>
		<div class="add-row">
			<input
				type="number"
				step="0.01"
				placeholder="+/- {COIN_SYMBOL}"
				aria-label="Adjustment amount"
				bind:value={adjustAmount}
			/>
			<input
				type="text"
				maxlength="500"
				placeholder="Reason (required)"
				aria-label="Reason"
				bind:value={adjustNote}
			/>
			<button class="btn" disabled={!canAdjust} onclick={applyAdjustment}>Apply adjustment</button>
		</div>

		<h3>History</h3>
		<DeskHistory
			transactions={lookup.recent_transactions}
			kinds={categoryKinds}
			reverse={(id) => reverseTransaction(supabase, id)}
			onReversed={() => runLookup(true)}
		/>
	{/if}
</section>

<style>
	h2 {
		margin-top: 0;
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
	.note {
		color: var(--dim);
		font-size: 0.9rem;
	}
	.add-row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: 0.6rem;
	}
	.add-row input {
		min-height: 44px;
		flex: 1;
		min-width: 12rem;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		padding: 0.4rem 0.55rem;
	}
	.coin-summary {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		flex-wrap: wrap;
		margin: 0.6rem 0 0.8rem;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--line);
		border-radius: 6px;
	}
	.coin-balance {
		font-family: 'Share Tech Mono', monospace;
		font-size: 1.4rem;
		color: var(--green);
	}
	.coin-balance.negative {
		color: var(--amber);
	}
	h3 {
		font-size: 0.95rem;
		margin: 1rem 0 0.4rem;
	}
	.debt-word {
		color: var(--amber);
	}
	.coin-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim);
	}
</style>
