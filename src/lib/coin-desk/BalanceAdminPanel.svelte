<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';

	/**
	 * Balance lookup + signed adjustment by email, MOVED here from /admin
	 * when /coin-desk became a route group -- the RPCs are unchanged
	 * (coin_admin_lookup / coin_admin_adjust_balance, both 0070), only the
	 * surface moved, so every coin tool lives in one place.
	 *
	 * This is the "attach a balance to an email regardless of login status"
	 * tool from docs/coin-economy Part 8: both RPCs work purely off the email
	 * string, with no requirement that the account has ever signed in, which
	 * is also how a legacy Sheets balance gets its opening entry (a single
	 * adjustment for whatever the old balance was, no conversion math).
	 *
	 * Deliberately its own card rather than folded into the Log area's
	 * lookup: that flow is "log something new against this student", this one
	 * is "correct what is already there", and the adjustment is a different,
	 * rarer action with a required reason.
	 */
	let { supabase }: { supabase: SupabaseClient } = $props();

	interface CoinTxn {
		id: string;
		category_id: string;
		category_name: string;
		amount: number;
		quantity: number | null;
		note: string | null;
		actor_email: string;
		created_at: string;
	}
	interface CoinLookup {
		email: string;
		balance: number;
		wage_tier: number;
		eating_pass_active: boolean;
		eating_pass_strikes: number;
		recent_transactions: CoinTxn[];
	}

	let coinEmail = $state('');
	let busy = $state(false);
	let errorMsg = $state('');
	let notice = $state('');
	let lookup = $state<CoinLookup | null>(null);
	let adjustAmount = $state('');
	let adjustNote = $state('');

	async function runLookup(refresh = false) {
		const target = coinEmail.trim().toLowerCase();
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

	async function applyAdjustment() {
		const target = coinEmail.trim().toLowerCase();
		const amt = Number(adjustAmount);
		if (!target || !Number.isFinite(amt) || amt === 0 || !adjustNote.trim()) return;
		errorMsg = '';
		notice = '';
		busy = true;
		const resp = await supabase.rpc('coin_admin_adjust_balance', {
			p_email: target,
			p_amount: Math.round(amt),
			p_note: adjustNote.trim()
		});
		busy = false;
		if (resp.error) {
			errorMsg = resp.error.message;
			return;
		}
		const r = resp.data as { ok: boolean; reason?: string; balance?: number };
		if (!r.ok) {
			errorMsg =
				r.reason === 'debt'
					? `Balance is negative (${r.balance}i¢); adjustments still apply.`
					: (r.reason ?? 'Adjustment refused.');
			return;
		}
		notice = `Applied ${amt > 0 ? '+' : ''}${Math.round(amt)}i¢ to ${target}. New balance: ${r.balance}i¢.`;
		adjustAmount = '';
		adjustNote = '';
		// Refresh, WITHOUT clearing the confirmation above -- the coin-desk
		// runLookup(refresh) convention (a success message that vanishes on
		// the same tick reads as nothing having happened).
		await runLookup(true);
	}

	const canAdjust = $derived(
		!busy &&
			Number.isFinite(Number(adjustAmount)) &&
			Number(adjustAmount) !== 0 &&
			!!adjustNote.trim()
	);

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
	}
</script>

<section class="card">
	<h2>Balances &amp; adjustments</h2>
	<p class="note">
		Look up or adjust a student's coin balance by email, whether or not they have signed in yet. The
		balance is derived from the transaction ledger (migration 0070); this does not touch the old
		Sheets-based ledger or coin-entry.html.
	</p>
	{#if errorMsg}<p class="feedback error">{errorMsg}</p>{/if}
	{#if notice}<p class="feedback notice">{notice}</p>{/if}
	<div class="add-row">
		<input
			type="email"
			placeholder="student@boscotech.net"
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
			<div class="coin-balance" class:negative={lookup.balance < 0}>{lookup.balance}i¢</div>
			<div class="coin-meta">
				<span>{lookup.email}</span>
				<span>wage tier {lookup.wage_tier}</span>
				<span>
					eating pass:
					{lookup.eating_pass_active
						? `active (${lookup.eating_pass_strikes} strike${lookup.eating_pass_strikes === 1 ? '' : 's'})`
						: 'none'}
				</span>
			</div>
		</div>

		<div class="add-row">
			<input type="number" step="1" placeholder="+/- i¢" bind:value={adjustAmount} />
			<input type="text" maxlength="500" placeholder="Reason (required)" bind:value={adjustNote} />
			<button class="btn" disabled={!canAdjust} onclick={applyAdjustment}>Apply adjustment</button>
		</div>

		{#if lookup.recent_transactions.length}
			<div class="rows coin-rows">
				{#each lookup.recent_transactions as t (t.id)}
					<div class="row">
						<div class="who">
							<span class="email">{t.category_name}</span>
						</div>
						<div class="meta">
							{#if t.note}<span class="note-text">{t.note}</span>{/if}
							<span class="since">by {t.actor_email} &middot; {when(t.created_at)}</span>
						</div>
						<div class="actions">
							<span class:txn-neg={t.amount < 0} class:txn-pos={t.amount > 0}>
								{t.amount > 0 ? '+' : ''}{t.amount}i¢
							</span>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<p class="note">No transactions logged yet for this email.</p>
		{/if}
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
	.coin-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim);
	}
	.rows {
		display: flex;
		flex-direction: column;
	}
	.coin-rows {
		margin-top: 0.6rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--line);
	}
	.row:last-child {
		border-bottom: none;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 14rem;
	}
	.email {
		font-weight: 700;
		color: var(--white);
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.note-text {
		font-size: 0.85rem;
		color: var(--dim);
	}
	.since {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		color: var(--dim);
	}
	.actions {
		margin-left: auto;
	}
	.txn-neg {
		color: var(--amber);
		font-family: 'Share Tech Mono', monospace;
	}
	.txn-pos {
		color: var(--green);
		font-family: 'Share Tech Mono', monospace;
	}
</style>
