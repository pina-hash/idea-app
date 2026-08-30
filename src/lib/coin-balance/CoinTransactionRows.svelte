<script lang="ts">
	import {
		coinAmountDisplay,
		coinMediumNote,
		coinTxnType,
		collapseCoinTransfers,
		COIN_TXN_TYPE_LABELS,
		type CoinDisplayRow
	} from '$lib/coin-format';
	import CoinTypeGlyph from '$lib/coin-desk/CoinTypeGlyph.svelte';

	/**
	 * One student's transaction history, rendered.
	 *
	 * THE ONE COPY. The student balance page, the Coin Desk log and the admin
	 * balance panel each carried their own near-identical version of this
	 * block, and all three had the same two defects: a balance correction was
	 * styled exactly like an ordinary award or fine, and a payout's two linked
	 * rows rendered as two unrelated entries with opposite signs. Fixing that
	 * in three places is how it comes back in one of them; they mount this
	 * instead.
	 *
	 * Presentation only -- no transport, no Supabase, no write path of any
	 * kind. Every rule it applies (which type a row is, how an amount reads,
	 * how a transfer collapses) lives in $lib/coin-format, shared with nothing
	 * else that could drift from it.
	 *
	 * MEDIUMS ARE NEVER CONFLATED. Every ordinary row carries the medium it
	 * moved; a withdrawal carries the arrow between the two. There is no row
	 * here that shows a figure with no medium at all.
	 */
	let {
		transactions,
		kinds = {},
		showActor = false,
		emptyMessage = 'No transactions logged yet for this email.'
	}: {
		transactions: CoinDisplayRow[];
		/**
		 * `coin_categories.kind` by category id, from the list the host page
		 * already loads. Absent, every non-payout row reads as an adjustment --
		 * see `coinTxnType` for why that is the safe direction rather than a
		 * silent guess at "award".
		 */
		kinds?: Record<string, string>;
		/** The admin surfaces show who logged it; a student's own page does not. */
		showActor?: boolean;
		emptyMessage?: string;
	} = $props();

	// Collapsed ONCE, at the top, so everything below renders the merged view.
	const rows = $derived(collapseCoinTransfers(transactions));

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
	}
</script>

{#if rows.length}
	<div class="rows coin-rows">
		{#each rows as t (t.id)}
			{@const type = coinTxnType(t, kinds[t.category_id])}
			{@const amount = coinAmountDisplay(t.amount, type)}
			{@const note = coinMediumNote(t)}
			<div class="row" data-testid="coin-row">
				<div class="who">
					<span class="reason">{t.isTransfer ? 'Withdrawal' : t.category_name}</span>
					<!-- GLYPH, TONE AND WORD, the same three signals the category
					     picker carries, from the same module -- so a fine reads as a
					     fine in the list you choose it from and in the history it
					     lands in. The word is never dropped: the glyph is
					     `aria-hidden` and decorative by construction. -->
					<span class="type-chip {type}" data-testid="type-chip">
						<CoinTypeGlyph {type} size={12} />
						{t.isTransfer ? 'Withdrawal' : COIN_TXN_TYPE_LABELS[type]}
					</span>
				</div>
				<div class="meta">
					{#if t.note}<span class="note-text">{t.note}</span>{/if}
					<span class="since">
						{#if showActor && t.actor_email}by {t.actor_email} &middot; {/if}{when(t.created_at)}
					</span>
				</div>
				<div class="actions">
					{#if note}
						<span class="medium-chip" class:arrow={t.isTransfer} data-testid="medium-chip">
							{note}
						</span>
					{/if}
					<span class="amount {amount.tone}" data-testid="amount">{amount.text}</span>
				</div>
			</div>
		{/each}
	</div>
{:else}
	<p class="note empty-state">{emptyMessage}</p>
{/if}

<style>
	.rows {
		display: flex;
		flex-direction: column;
	}
	.coin-rows {
		margin-top: 0.2rem;
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
		flex-wrap: wrap;
		min-width: 14rem;
	}
	.reason {
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
		font-family: var(--font-mono);
		font-size: 0.65rem;
		color: var(--dim);
	}
	.actions {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	/* The type is named as well as coloured. A correction that reads only as a
	   violet number still depends on someone knowing what violet means here. */
	.type-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-family: var(--font-mono);
		font-size: 0.55rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		white-space: nowrap;
		border: 1px solid var(--line);
		border-radius: 3px;
		padding: 0.05rem 0.3rem;
		color: var(--dim);
	}
	/* THE THREE THAT USED TO HAVE NO TONE AT ALL. A fine, an award and a
	   purchase all fell through to --dim, so the one distinction a reader
	   scanning a history actually wants was the one the chip did not draw.
	   Every token below is in its documented role: --green success, --amber
	   warning, --gold the secondary brass accent. --crimson is deliberately
	   NOT here for a fine -- it is reserved for LIVE/REC/error and never for
	   identity, which is the same call src/app.css's feed flags made. */
	.type-chip.award {
		color: var(--green);
		border-color: color-mix(in srgb, var(--green) 40%, transparent);
		background: color-mix(in srgb, var(--green) 6%, transparent);
	}
	.type-chip.fine {
		color: var(--amber);
		border-color: color-mix(in srgb, var(--amber) 40%, transparent);
		background: color-mix(in srgb, var(--amber) 6%, transparent);
	}
	.type-chip.purchase {
		color: var(--gold);
		border-color: color-mix(in srgb, var(--gold) 40%, transparent);
		background: color-mix(in srgb, var(--gold) 6%, transparent);
	}
	/* The WORD takes the ink, the EDGE keeps the accent -- see --violet-ink in
	   $lib/design-system/colors.css. Raw --violet measured 2.45:1 here. */
	.type-chip.adjustment {
		color: var(--violet-ink);
		border-color: var(--violet);
		background: color-mix(in srgb, var(--violet) 8%, transparent);
	}
	.type-chip.payout {
		color: var(--cyan);
		border-color: var(--cyan);
		background: color-mix(in srgb, var(--cyan) 6%, transparent);
	}

	.medium-chip {
		font-family: var(--font-mono);
		font-size: 0.58rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--dim);
		border: 1px solid var(--line);
		border-radius: 3px;
		padding: 0.05rem 0.3rem;
		white-space: nowrap;
	}
	/* A withdrawal's chip carries BOTH media, so it is the one that must not
	   read as a single medium. */
	.medium-chip.arrow {
		color: var(--cyan);
		border-color: var(--cyan);
	}

	.amount {
		font-family: var(--font-mono);
	}
	.amount.positive {
		color: var(--green);
	}
	.amount.negative,
	.amount.purchase {
		color: var(--amber);
	}
	/* An adjustment is neither an award nor a fine whatever its sign, so it is
	   neither green nor amber -- the same violet the Ledger gives it. */
	.amount.adjustment {
		color: var(--violet-ink);
	}
	/* A transfer gained and lost nothing, so it carries no sign and none of
	   the colours that imply one. */
	.amount.transfer {
		color: var(--cyan);
	}

	@media (max-width: 32rem) {
		.who {
			min-width: 0;
		}
		.actions {
			margin-left: 0;
		}
	}
</style>
