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
	 * The list itself is a plain read of the coin_balances view (0070, three
	 * columns since 0096) -- every admin already sees every row there (its RLS
	 * predicate is `student_email = current_user_email() or is_admin()`), so
	 * no new RPC is needed just to LIST candidates. Paying is different: both
	 * actions below call a migration 0079/0096 RPC that re-reads the CURRENT
	 * digital balance server-side at the moment it writes, never the balance
	 * this list happened to show when it loaded -- see payout.ts.
	 *
	 * THE LIST IS FILTERED ON digital_balance, NOT balance. Since 0096 a
	 * payout is a digital -> physical TRANSFER, so a student whose whole
	 * positive total is physical has nothing to convert and must not appear
	 * here -- filtering on the total would offer to "pay" coins already in
	 * their hand.
	 */
	let { supabase, configured = true }: { supabase: SupabaseClient; configured?: boolean } = $props();

	let candidates = $state<CoinPayoutCandidate[]>([]);
	let listBusy = $state(false);
	let listError = $state('');
	/**
	 * Per-row partial amount. Empty = pay the full digital balance.
	 *
	 * Typed `string | number` because `bind:value` on `<input type="number">`
	 * COERCES to a number -- the trap this codebase has now hit three times
	 * (ReviewConsole's unit field, ClassroomManage's points field). Typing it
	 * as `string` compiles fine and then throws at runtime on `.trim()`,
	 * which leaves the Pay button stuck on "Paying…" with no visible error.
	 */
	let partialAmounts = $state<Record<string, string | number>>({});

	async function loadCandidates() {
		listBusy = true;
		listError = '';
		const resp = await supabase
			.from('coin_balances')
			.select('student_email, balance, physical_balance, digital_balance, last_activity_at')
			.gt('digital_balance', 0)
			.order('digital_balance', { ascending: false });
		if (resp.error) {
			listBusy = false;
			listError = resp.error.message;
			return;
		}
		const rows = (resp.data ?? []) as {
			student_email: string;
			balance: number;
			physical_balance: number;
			digital_balance: number;
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
			physical_balance: r.physical_balance,
			digital_balance: r.digital_balance,
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

	/**
	 * A blank amount box means the FULL digital balance -- p_amount stays null
	 * and the RPC resolves it from the ledger itself, which is the pre-0096
	 * behaviour and the one that cannot go stale. A typed amount is a partial
	 * withdrawal; the server still refuses anything above what is actually
	 * digital at the moment it writes.
	 */
	function partialFor(email: string): number | null {
		const raw = String(partialAmounts[email] ?? '').trim();
		if (!raw) return null;
		const n = Number(raw);
		return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
	}

	async function payOne(email: string) {
		payingEmail = email;
		payError = '';
		lastResponse = null;
		let resp: { data: unknown; error: { message: string } | null };
		try {
			resp = await supabase.rpc('coin_payout_student', {
				p_email: email,
				p_note: noteOrNull(),
				p_amount: partialFor(email)
			});
		} catch (e) {
			// Never leave the row stuck on "Paying…" with nothing on screen.
			payingEmail = null;
			payError = e instanceof Error ? e.message : String(e);
			return;
		}
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
		partialAmounts[email] = '';
		await loadCandidates();
	}

	/**
	 * ONE round trip to coin_bulk_payout (0079) -- not a client-side loop
	 * calling payOne() per row. That matters for exactly the race this
	 * feature exists to close: the RPC re-derives its own roster (every
	 * student with a positive DIGITAL balance RIGHT NOW) and re-reads each
	 * student's digital balance again immediately before writing, so it can
	 * never pay a stale amount even if a fine or award lands mid-run against
	 * a student further down the list. Pay All is always a FULL payout per
	 * student; a partial one is a per-row decision, so it lives on the row.
	 * See 0079's and 0096's migration headers.
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
		partialAmounts = {};
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
		Every student with a positive DIGITAL balance, ready to convert to physical coins. A payout is
		a transfer, not a drain: it debits digital and credits physical by the same amount, so the
		student's total does not change -- the coins changed form. Leave an amount blank to pay the
		whole digital balance, or type one for a partial withdrawal. Pay All re-derives the whole list
		and re-reads each digital balance server-side at the moment it writes, so a fine or award
		landed by another admin in between is always reflected in the amount actually paid, never a
		stale one.
	</p>
	<p class="note">
		This is the ONLY path between the two balances, and it runs one way. There is no deposit from
		physical back into digital.
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
			<p class="note">No student currently has a positive digital balance to convert.</p>
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
							<span class="since">
								holds {c.physical_balance}i¢ physical &middot; total {c.balance}i¢
							</span>
						</div>
						<div class="actions">
							<span class="balance">{c.digital_balance}i¢</span>
							<input
								class="partial"
								type="number"
								min="1"
								max={c.digital_balance}
								step="1"
								placeholder="all"
								aria-label="Partial payout amount for {c.student_email}"
								bind:value={partialAmounts[c.student_email]}
							/>
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
									{r.partial ? ' (partial)' : ''}
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
	.partial {
		width: 5rem;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		padding: 0.2rem 0.35rem;
	}
	.partial:focus {
		outline: 2px solid var(--cyan);
		outline-offset: 1px;
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
