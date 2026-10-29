<script lang="ts">
	import './market.css';
	import { untrack } from 'svelte';
	import { coins } from '$lib/coin-format';

	/**
	 * THE ECONOMY'S HEALTH, on the digest (ledger 0402, 0281): coins in
	 * circulation, this week's sinks (fees, purchases, fines) against its
	 * faucets (awards), and what sits in escrow and in stocks. Display only;
	 * section staff see their own students. A read that is missing or refused
	 * draws nothing.
	 */
	let { load }: { load: () => Promise<unknown> } = $props();

	interface Health {
		circulation: number;
		students_in_debt: number;
		faucets: number;
		sinks: { fees: number; purchases: number; fines: number };
		stock_pnl: number;
		escrow: number;
		stocks: { cost_basis: number; value: number };
		scope: string;
	}
	let h = $state<Health | null>(null);

	const n = (v: unknown) => {
		const x = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
		return Number.isFinite(x) ? x : 0;
	};
	$effect(() => {
		untrack(() =>
			load().then((raw) => {
				if (!raw || typeof raw !== 'object') return;
				const o = raw as Record<string, unknown>;
				const sinks = (o.sinks ?? {}) as Record<string, unknown>;
				const st = (o.stocks ?? {}) as Record<string, unknown>;
				h = {
					circulation: n(o.circulation),
					students_in_debt: n(o.students_in_debt),
					faucets: n(o.faucets),
					sinks: { fees: n(sinks.fees), purchases: n(sinks.purchases), fines: n(sinks.fines) },
					stock_pnl: n(o.stock_pnl),
					escrow: n(o.escrow),
					stocks: { cost_basis: n(st.cost_basis), value: n(st.value) },
					scope: String(o.scope ?? '')
				};
			})
		);
	});
	const sinkTotal = $derived(h ? h.sinks.fees + h.sinks.purchases + h.sinks.fines : 0);
</script>

{#if h}
	<section class="card mk-panel" aria-labelledby="eh-h" data-testid="economy-health">
		<header>
			<h2 id="eh-h">Economy health</h2>
			<span class="mk-sub">{h.scope === 'section' ? 'Your students, ' : ''}the last 7 days</span>
		</header>
		<dl class="eh-grid">
			<div><dt>In circulation</dt><dd>{coins(h.circulation)}</dd><span class="mk-note">{h.students_in_debt} in debt</span></div>
			<div><dt>Came in (awards)</dt><dd>{coins(h.faucets)}</dd></div>
			<div>
				<dt>Went out</dt><dd>{coins(sinkTotal)}</dd>
				<span class="mk-note">fees {coins(h.sinks.fees)}, purchases {coins(h.sinks.purchases)}, fines {coins(h.sinks.fines)}</span>
			</div>
			<div><dt>In escrow</dt><dd>{coins(h.escrow)}</dd></div>
			<div>
				<dt>In stocks</dt><dd>{coins(h.stocks.value)}</dd>
				<span class="mk-note">paid {coins(h.stocks.cost_basis)}; the house paid {coins(h.stock_pnl)} in gains this week</span>
			</div>
		</dl>
	</section>
{/if}

<style>
	.eh-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(10rem, 100%), 1fr));
		gap: 0.75rem;
		margin: 0;
	}
	.eh-grid > div {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.6rem 0.7rem;
		border-radius: var(--plate-r-small, 6px);
		border: 1px solid var(--plate-hair, var(--boundary));
		background: var(--plate-inset-top, var(--bg0));
	}
	.eh-grid dt {
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.eh-grid dd {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 1.25rem;
		color: var(--text-1);
	}
</style>
