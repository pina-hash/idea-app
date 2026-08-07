<script lang="ts">
	import CoinBalanceView from '$lib/coin-balance/CoinBalanceView.svelte';
	import {
		eatingPassStatus,
		sumBalance,
		withCategoryNames,
		type CoinBalanceTransaction
	} from '$lib/coin-balance';

	/**
	 * Dev harness: mounts the REAL CoinBalanceView, with its balance/strike
	 * numbers run through the REAL pure helpers (coin-balance.ts) over sample
	 * rows shaped exactly like a coin_transactions select -- so this exercises
	 * the same derivation +page.server.ts runs, not hand-picked totals. No
	 * Supabase or auth needed.
	 *
	 * Scenarios:
	 *  - "populated" -- a normal history: fines, awards, an active Eating Pass
	 *    with 1 strike, a Pay Raise (tier 2), a Balance Correction.
	 *  - "revoked pass" -- 3 strikes auto-revoked the pass (coin_log_transaction's
	 *    own rule): eating_pass_active reads false, but eating_pass_strikes
	 *    still reads 3 -- the strike count is "since the last PURCHASE", not
	 *    "since the pass was last active", exactly like the real SQL function.
	 *  - "empty" -- no transactions yet: the clear empty state, not a blank
	 *    page or an error.
	 *  - "not configured" -- migration 0070 not applied: the fail-soft card.
	 */
	const CATEGORIES = [
		{ id: 'weekly_wage', name: 'Weekly Wage' },
		{ id: 'above_and_beyond', name: 'Above and Beyond' },
		{ id: 'shop_safety_violation', name: 'Shop Safety Violation' },
		{ id: 'eating_pass', name: 'Eating Pass' },
		{ id: 'eating_violation', name: 'Eating Violation' },
		{ id: 'eating_pass_revoked', name: 'Eating Pass Revoked (system)' },
		{ id: 'correct_answer_in_class', name: 'Correct Answer in Class' },
		{ id: 'pay_raise', name: 'Pay Raise' },
		{ id: 'balance_correction', name: 'Balance Correction / Refund' }
	];

	function tx(
		id: string,
		category_id: string,
		amount: number,
		created_at: string,
		note: string | null = null,
		meta: Record<string, unknown> | null = null
	): CoinBalanceTransaction {
		return { id, category_id, amount, quantity: null, note, created_at, meta };
	}

	const POPULATED: CoinBalanceTransaction[] = [
		tx('9', 'balance_correction', 10, '2026-08-06T15:00:00Z', 'Legacy Sheets balance carried over'),
		tx('8', 'pay_raise', -40, '2026-08-05T18:20:00Z'),
		tx('7', 'eating_violation', -5, '2026-08-05T12:05:00Z', null, { strike: true }),
		tx('6', 'eating_pass', -150, '2026-08-04T09:00:00Z'),
		tx('5', 'correct_answer_in_class', 1, '2026-08-03T14:10:00Z'),
		tx('4', 'above_and_beyond', 2, '2026-08-01T16:45:00Z', 'Helped a classmate debug their code'),
		tx('3', 'shop_safety_violation', -12, '2026-07-30T11:15:00Z', 'No safety glasses at the bandsaw'),
		tx('2', 'weekly_wage', 1, '2026-07-28T08:00:00Z'),
		tx('1', 'weekly_wage', 1, '2026-07-21T08:00:00Z')
	];

	const REVOKED: CoinBalanceTransaction[] = [
		tx('6', 'eating_pass_revoked', 0, '2026-08-06T13:00:00Z', 'Automatically revoked: third strike'),
		tx('5', 'eating_violation', -5, '2026-08-06T12:50:00Z', null, { strike: true }),
		tx('4', 'eating_violation', -5, '2026-08-05T12:10:00Z', null, { strike: true }),
		tx('3', 'eating_violation', -5, '2026-08-03T12:00:00Z', null, { strike: true }),
		tx('2', 'eating_pass', -150, '2026-08-01T09:00:00Z'),
		tx('1', 'weekly_wage', 1, '2026-07-28T08:00:00Z')
	];

	type Scenario = 'populated' | 'revoked' | 'empty' | 'unconfigured';
	let scenario = $state<Scenario>('populated');

	const rows = $derived(
		scenario === 'populated' ? POPULATED : scenario === 'revoked' ? REVOKED : []
	);
	const configured = $derived(scenario !== 'unconfigured');
	const displayTx = $derived(withCategoryNames(rows, CATEGORIES));
	const balance = $derived(sumBalance(rows));
	const eatingPass = $derived(eatingPassStatus(rows));
	const wageTier = $derived(scenario === 'populated' ? 2 : 1);
</script>

<div class="dev-toolbar">
	<label>
		Scenario
		<select bind:value={scenario}>
			<option value="populated">Populated</option>
			<option value="revoked">Eating Pass revoked (3 strikes)</option>
			<option value="empty">Empty (no transactions)</option>
			<option value="unconfigured">Not configured (0070 unapplied)</option>
		</select>
	</label>
</div>

{#key scenario}
	<CoinBalanceView
		{configured}
		email="student@boscotech.net"
		displayName="Test Student"
		{balance}
		transactions={displayTx}
		{wageTier}
		{eatingPass}
	/>
{/key}

<style>
	.dev-toolbar {
		position: fixed;
		top: 0.5rem;
		right: 0.5rem;
		z-index: 20;
		background: var(--bg1);
		border: 1px solid var(--line-strong);
		border-radius: 6px;
		padding: 0.4rem 0.7rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--white);
	}
	.dev-toolbar label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		cursor: pointer;
	}
</style>
