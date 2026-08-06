<script lang="ts">
	/**
	 * Public reward display: the configured rules, per-entry totals, and the
	 * full permanent ledger. Presentation only (props in, nothing out), so the
	 * dev harness mounts it against simulated data -- and it renders for
	 * signed-out spectators exactly like the bracket does.
	 */
	import EntryChip from './EntryChip.svelte';
	import {
		rewardRuleLabel,
		rewardTotals,
		type RewardLedgerRow,
		type RewardRule,
		type TournamentEntry
	} from './tournaments';

	let {
		rules = [],
		ledger = [],
		entries = {}
	}: {
		rules?: RewardRule[];
		ledger?: RewardLedgerRow[];
		entries?: Record<string, TournamentEntry>;
	} = $props();

	const totals = $derived(rewardTotals(ledger));
	const history = $derived(
		[...ledger].sort((a, b) => b.id - a.id)
	);
	const ruleOrder: Record<string, number> = { win: 0, round_reached: 1, placement: 2 };
	const orderedRules = $derived(
		[...rules].sort(
			(a, b) =>
				(ruleOrder[a.trigger_type] ?? 9) - (ruleOrder[b.trigger_type] ?? 9) ||
				(a.trigger_value ?? 0) - (b.trigger_value ?? 0)
		)
	);

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime())
			? ''
			: d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	}
</script>

<div class="rewards">
	{#if orderedRules.length}
		<div class="rule-chips">
			{#each orderedRules as r (r.id)}
				<span class="rule-chip">
					{rewardRuleLabel(r)}
					<strong>+{r.amount}</strong>
				</span>
			{/each}
		</div>
	{/if}

	{#if totals.length}
		<div class="totals card">
			<h3>Standings</h3>
			{#each totals as t (t.entryId)}
				<div class="total-row">
					<EntryChip entry={entries[t.entryId] ?? null} />
					<span class="award-count">
						{t.awards} award{t.awards === 1 ? '' : 's'}
					</span>
					<span class="total-amount">+{t.total}</span>
				</div>
			{/each}
		</div>

		<div class="history card">
			<h3>Payout history</h3>
			{#each history as row (row.id)}
				<div class="ledger-row">
					<span class="ledger-entry">
						<EntryChip entry={entries[row.entry_id] ?? null} />
					</span>
					<span class="ledger-reason">{row.reason}</span>
					<span class="ledger-when">{when(row.awarded_at)}</span>
					<span class="ledger-amount">+{row.amount}</span>
				</div>
			{/each}
		</div>
	{:else if orderedRules.length}
		<p class="note">No payouts yet — rewards land here as matches are won.</p>
	{/if}
</div>

<style>
	.rewards {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.rule-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}
	.rule-chip {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		color: var(--dim, #7a8a7a);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.2));
		border-radius: 999px;
		padding: 0.2rem 0.7rem;
		display: inline-flex;
		gap: 0.45rem;
		align-items: baseline;
	}
	.rule-chip strong {
		color: var(--gold, #c8ff00);
	}
	.card h3 {
		margin: 0 0 0.5rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--cyan, #00f0ff);
	}
	.total-row,
	.ledger-row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		padding: 0.32rem 0;
		border-bottom: 1px solid var(--line, rgba(0, 255, 65, 0.08));
		min-width: 0;
	}
	.total-row:last-child,
	.ledger-row:last-child {
		border-bottom: none;
	}
	.award-count {
		margin-left: auto;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--dim, #7a8a7a);
		flex: none;
	}
	.total-amount,
	.ledger-amount {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.95rem;
		color: var(--gold, #c8ff00);
		flex: none;
		min-width: 3.2rem;
		text-align: right;
	}
	.ledger-amount {
		margin-left: 0;
		font-size: 0.8rem;
	}
	.ledger-entry {
		flex: none;
		max-width: 12rem;
	}
	.ledger-reason {
		color: var(--white, #e8ffe8);
		font-size: 0.88rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ledger-when {
		margin-left: auto;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		color: var(--dim, #7a8a7a);
		flex: none;
	}
	.note {
		color: var(--dim, #7a8a7a);
		font-size: 0.9rem;
		margin: 0;
	}
</style>
