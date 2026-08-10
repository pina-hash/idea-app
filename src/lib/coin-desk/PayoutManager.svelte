<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { onMount } from 'svelte';
	import {
		payoutCandidateLabel,
		payoutRefusalMessage,
		type CoinBulkPayoutResponse,
		type CoinPayoutCandidate,
		type CoinPayoutResult
	} from './payout';

	/**
	 * Every student with a positive balance, in one list, with a "Pay" per
	 * row and a "Pay All". Factored out of CoinDeskTool.svelte the same way
	 * SectionManager / RolesManager / ContractsManager are, so a dev harness
	 * can mount this against a fake ledger too.
	 *
	 * The list itself is a plain read of the coin_balances view (0070) --
	 * every admin already sees every row there (its RLS predicate is
	 * `student_email = current_user_email() or is_admin()`), so no new RPC
	 * is needed just to LIST candidates. Paying is different: both actions
	 * below call a migration 0079 RPC that re-reads the CURRENT balance
	 * server-side at the moment it writes, never the balance this list
	 * happened to show when it loaded -- see payout.ts.
	 */
	let { supabase, configured = true }: { supabase: SupabaseClient; configured?: boolean } = $props();

	let candidates = $state<CoinPayoutCandidate[]>([]);
	let listBusy = $state(false);
	let listError = $state('');

	async function loadCandidates() {
		listBusy = true;
		listError = '';
		const resp = await supabase
			.from('coin_balances')
			.select('student_email, balance, last_activity_at')
			.gt('balance', 0)
			.order('balance', { ascending: false });
		if (resp.error) {
			listBusy = false;
			listError = resp.error.message;
			return;
		}
		const rows = (resp.data ?? []) as {
			student_email: string;
			balance: number;
			last_activity_at: string | null;
		}[];
		const emails = rows.map((r) => r.student_email);

		// A shortcut for real names where one exists, the same "profiles only
		// has rows for students who have actually signed in" doctrine the
		// single-student lookup's typeahead already relies on -- a miss here
		// just falls back to the bare email below, never blocks the list.
		let names = new Map<string, { display_name: string | null; full_name: string | null }>();
		if (emails.length) {
			const presp = await supabase
				.from('profiles')
				.select('email, full_name, display_name')
				.in('email', emails);
			if (!presp.error) {
				for (const p of (presp.data ?? []) as {
					email: string;
					full_name: string | null;
					display_name: string | null;
				}[]) {
					names.set(p.email, { display_name: p.display_name, full_name: p.full_name });
				}
			}
		}

		candidates = rows.map((r) => ({
			student_email: r.student_email,
			balance: r.balance,
			last_activity_at: r.last_activity_at,
			display_name: names.get(r.student_email)?.display_name ?? null,
			full_name: names.get(r.student_email)?.full_name ?? null
		}));
		listBusy = false;
	}

	onMount(() => {
		if (configured) loadCandidates();
	});

	let note = $state('');
	let payingEmail = $state<string | null>(null);
	let payAllBusy = $state(false);
	let payError = $state('');
	let lastResponse = $state<CoinBulkPayoutResponse | null>(null);

	function noteOrNull(): string | null {
		return note.trim() || null;
	}

	async function payOne(email: string) {
		payingEmail = email;
		payError = '';
		lastResponse = null;
		const resp = await supabase.rpc('coin_payout_student', { p_email: email, p_note: noteOrNull() });
		payingEmail = null;
		if (resp.error) {
			payError = resp.error.message;
			return;
		}
		const r = resp.data as { ok: boolean; [k: string]: unknown };
		lastResponse = {
			ok: true,
			total: 1,
			succeeded: r.ok ? 1 : 0,
			refused: r.ok ? 0 : 1,
			results: [{ email, ...r } as CoinPayoutResult]
		};
		await loadCandidates();
	}

	/**
	 * ONE round trip to coin_bulk_payout (0079) -- not a client-side loop
	 * calling payOne() per row. That matters for exactly the race this
	 * feature exists to close: the RPC re-derives its own roster (every
	 * student with a positive balance RIGHT NOW) and re-reads each
	 * student's balance again immediately before writing, so it can never
	 * pay a stale amount even if a fine or award lands mid-run against a
	 * student further down the list. See 0079's migration header.
	 */
	async function payAll() {
		payAllBusy = true;
		payError = '';
		lastResponse = null;
		const resp = await supabase.rpc('coin_bulk_payout', { p_note: noteOrNull() });
		payAllBusy = false;
		if (resp.error) {
			payError = resp.error.message;
			return;
		}
		lastResponse = resp.data as CoinBulkPayoutResponse;
		await loadCandidates();
	}

	function when(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
	}
</script>

<section class="card payout-manager">
	<h2>Payout</h2>
	<p class="note">
		Every student with a positive balance, ready to convert to physical coins in one click --
		logged as the same "Coin Payout" category the single-student flow below already uses. Pay All
		re-derives the whole list and re-reads each balance server-side at the moment it writes, so a
		fine or award landed by another admin in between is always reflected in the amount actually
		paid, never a stale one.
	</p>

	{#if !configured}
		<p class="feedback error">
			Migration 0070 does not appear to be applied yet -- balances are unavailable.
		</p>
	{:else}
		{#if listError}<p class="feedback error">{listError}</p>{/if}
		{#if payError}<p class="feedback error">{payError}</p>{/if}

		<div class="field-row">
			<label for="payout-note">Note (optional, applies to every payout logged below)</label>
			<input
				id="payout-note"
				type="text"
				maxlength="500"
				placeholder="Coin payout"
				bind:value={note}
			/>
		</div>

		{#if listBusy && !candidates.length}
			<p class="note">Loading&hellip;</p>
		{:else if !candidates.length}
			<p class="note">No student currently has a positive balance.</p>
		{:else}
			<div class="rows payout-rows">
				{#each candidates as c (c.student_email)}
					<div class="row">
						<div class="who">
							<span class="email">{payoutCandidateLabel(c)}</span>
						</div>
						<div class="meta">
							<span class="since">
								{c.student_email}{c.last_activity_at ? ` · last activity ${when(c.last_activity_at)}` : ''}
							</span>
						</div>
						<div class="actions">
							<span class="balance">{c.balance}i&cent;</span>
							<button
								class="mini"
								disabled={payingEmail === c.student_email || payAllBusy}
								onclick={() => payOne(c.student_email)}
							>
								{payingEmail === c.student_email ? 'Paying…' : 'Pay'}
							</button>
						</div>
					</div>
				{/each}
			</div>

			<div class="btn-row">
				<button class="btn" disabled={payAllBusy || !!payingEmail} onclick={payAll}>
					{payAllBusy ? 'Paying all…' : `Pay all (${candidates.length})`}
				</button>
			</div>
		{/if}

		{#if lastResponse}
			<p class="feedback notice">
				Paid {lastResponse.succeeded} of {lastResponse.total}
				{lastResponse.refused ? `, ${lastResponse.refused} had nothing left to pay by the time they were reached` : ''}.
			</p>
			<div class="rows result-rows">
				{#each lastResponse.results as r (r.email)}
					<div class="row">
						<div class="who">
							<span class="email">{r.email}</span>
						</div>
						<div class="actions">
							{#if r.ok}
								<span class="txn-pos">
									{typeof r.amount === 'number' ? `${Math.abs(r.amount)}i¢ paid` : 'paid'}
								</span>
							{:else}
								<span class="txn-neg">{payoutRefusalMessage(r)}</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</section>

<style>
	.note {
		color: var(--dim);
		font-size: 0.9rem;
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
	.rows {
		display: flex;
		flex-direction: column;
	}
	.payout-rows {
		margin: 0.4rem 0 0.2rem;
		max-height: 22rem;
		overflow-y: auto;
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
	.since {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		color: var(--dim);
	}
	.actions {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.balance {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.95rem;
		color: var(--green);
	}
	.mini {
		background: none;
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		padding: 0.15rem 0.5rem;
		cursor: pointer;
	}
	.mini:hover:not(:disabled) {
		color: var(--white);
		border-color: var(--green);
	}
	.mini:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.txn-neg {
		color: var(--amber);
		font-family: 'Share Tech Mono', monospace;
	}
	.txn-pos {
		color: var(--green);
		font-family: 'Share Tech Mono', monospace;
	}
	.result-rows {
		margin-top: 0.2rem;
	}
	.btn-row {
		display: flex;
		gap: 0.85rem;
		flex-wrap: wrap;
		margin-top: 0.4rem;
	}
</style>
