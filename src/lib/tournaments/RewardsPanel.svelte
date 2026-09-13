<script lang="ts">
	/**
	 * Public reward display: the configured rules, per-entry totals, and the
	 * full permanent ledger. Presentation only (props in, nothing out), so the
	 * dev harness mounts it against simulated data -- and it renders for
	 * signed-out spectators exactly like the bracket does.
	 *
	 * AWARDS, NOT ROWS (0192). A team entry's win is one ledger row per
	 * registrant, each for the full amount; read row by row a team of two
	 * would show twice the figure it was promised and twice the payouts.
	 * `rewardAwards` folds the rows of one award back together, so the
	 * standings figure is what EACH registrant holds and the history is one
	 * line per award, with `× n` and an `each` chip saying how many people it
	 * reached. A pre-0192 ledger folds to exactly what it showed before.
	 *
	 * AND THE FIGURES ARE COINS (0212). Every amount carries `COIN_SYMBOL`
	 * through `signedCoins`, because they are IDEA Coins and since 0212 they
	 * genuinely move: `_tournament_award` mints a `competition_winnings` row on
	 * the winner's digital balance. Before 0212 this panel said "Payout history"
	 * over bare gold numbers while nothing had been paid, and rendered `+40`
	 * where `DeleteTournament.svelte` rendered the same total with the symbol --
	 * `tests/coin-symbol.test.ts` could not see the mismatch, because its
	 * `COIN_SOURCES` list did not name this file. It does now.
	 *
	 * AN UNPAID ROW SAYS SO. A reward reaches no balance when the registrant is
	 * an unlinked walk-up with no account, or when `competition_winnings` was
	 * retired at award time. That is a real state and not an error, and the
	 * student is owed the coins by hand -- so it is marked IN WORDS rather than
	 * left looking identical to a paid one. A ledger from a deployment without
	 * 0212 carries no such column and is marked NOTHING: cannot-tell is not
	 * unpaid, and `rewardUnpaid` is the one place that distinction is made.
	 */
	import EntryChip from './EntryChip.svelte';
	import { signedCoins } from '../coin-format';
	import {
		rewardAwards,
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
	const history = $derived([...rewardAwards(ledger)].sort((a, b) => b.firstId - a.firstId));
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
					<strong>{signedCoins(r.amount)}</strong>
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
					{#if t.recipients > 1}
						<span class="each">each · {t.recipients} registrants</span>
					{/if}
					{#if t.unpaid > 0}
						<span class="unpaid" title="Not yet on a coin balance">
							{t.unpaid} not paid
						</span>
					{/if}
					<span class="total-amount">{signedCoins(t.total)}</span>
				</div>
			{/each}
		</div>

		<div class="history card">
			<h3>Payout history</h3>
			{#each history as row (row.firstId)}
				<div class="ledger-row">
					<span class="ledger-entry">
						<EntryChip entry={entries[row.entryId] ?? null} />
					</span>
					<span class="ledger-reason">{row.reason}</span>
					<span class="ledger-when">{when(row.awardedAt)}</span>
					{#if row.unpaid > 0}
						<span class="unpaid">
							{row.unpaid === row.recipients ? 'not paid' : `${row.unpaid} not paid`}
						</span>
					{/if}
					<span class="ledger-amount"
						>{signedCoins(row.amount)}{#if row.recipients > 1}<span class="times">
								× {row.recipients}</span
							>{/if}</span
					>
				</div>
			{/each}
		</div>
	{:else if orderedRules.length}
		<p class="note">
			No payouts yet. Rewards land here as matches are won, and are paid onto the winner's IDEA
			Coin balance.
		</p>
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
	/* THE NAME IS THE ONE THING THAT MAY NOT BE SQUEEZED OUT.
	   Every qualifier on these rows -- the award count, the `each` chip, the
	   `not paid` mark, the amount -- is `flex: none`, and `EntryChip` carries
	   `min-width: 0` so that it is the only thing left that CAN shrink. At
	   375px that made it shrink to its thumbnail: measured on the 8-entry
	   harness with a team entry, the Kilowatt row rendered a 14.6px chip with
	   the name at ZERO WIDTH -- an initial and nothing else, on the surface
	   that announces what that student won. Only rows carrying the `each` chip
	   were affected, and at 1440 none were, so it read as fine on a desk.
	   Adding the `not paid` mark put a fourth competitor on the same row.

	   So the row WRAPS and the chip keeps a floor. The qualifiers drop to a
	   second line rather than eating the identity, which is the same call the
	   notebook grid's sticky header makes: a name being covered is a
	   correctness defect, not a cosmetic one. */
	.total-row,
	.ledger-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.35rem 0.8rem;
		padding: 0.32rem 0;
		border-bottom: 1px solid var(--line, rgba(0, 255, 65, 0.08));
		min-width: 0;
	}
	/* THE FLOOR IS ON THE STANDINGS ROW ONLY, and that is a measurement rather
	   than a preference. The standings row is where the squeeze happens: its
	   qualifiers (`N awards`, the `each` chip) are wide and unconditional, and
	   it is six rows, so a wrap costs almost nothing. A HISTORY row already fit
	   on one line at 375 with its name whole, and putting the same floor there
	   wrapped all sixteen of them -- doubling the length of the list to fix a
	   defect it did not have. `flex-wrap` stays on both as the safety valve;
	   without a floor it only engages when the content genuinely cannot fit. */
	.total-row :global(.entry-chip) {
		min-width: 6.5rem;
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
	/* The "each" chip: the same dim mono as the award count, because it
	   qualifies the figure beside it rather than competing with it. */
	.each {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--dim, #7a8a7a);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.2));
		border-radius: 999px;
		padding: 0.1rem 0.5rem;
		flex: none;
		white-space: nowrap;
	}
	.times {
		color: var(--dim, #7a8a7a);
		font-size: 0.85em;
	}
	/* A reward that reached no balance. Amber, because it is an outstanding
	   thing to do rather than an error -- and the WORD carries it, never the
	   hue alone. */
	.unpaid {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.04em;
		color: var(--amber, #ffb020);
		border: 1px solid var(--amber, #ffb020);
		border-radius: 999px;
		padding: 0.1rem 0.5rem;
		flex: none;
		white-space: nowrap;
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
