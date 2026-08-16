<script lang="ts">
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import CoinTransactionRows from '$lib/coin-balance/CoinTransactionRows.svelte';
	import { coins } from '$lib/coin-format';
	import type { DisplayTransaction, EatingPassStatus } from '$lib/coin-balance';

	/**
	 * The real read-only view, factored out of /coin-balance so a dev harness
	 * can mount the SAME component against sample data (the CoinDeskTool
	 * convention) -- everything below is presentation only, no gating logic
	 * and no Supabase client at all: this page has no write path, so unlike
	 * CoinDeskTool it needs nothing beyond the props the server load already
	 * resolved.
	 */
	let {
		configured = true,
		email,
		displayName,
		balance,
		physicalBalance = 0,
		digitalBalance = 0,
		transactions,
		categoryKinds = {},
		wageTier,
		eatingPass
	}: {
		configured?: boolean;
		email: string | null;
		displayName: string | null;
		/** The TOTAL: physical coins in hand plus digital balance. */
		balance: number;
		physicalBalance?: number;
		digitalBalance?: number;
		transactions: DisplayTransaction[];
		/** coin_categories.kind by id -- see CoinTransactionRows. */
		categoryKinds?: Record<string, string>;
		wageTier: number | null;
		eatingPass: EatingPassStatus;
	} = $props();

</script>

<svelte:head>
	<title>My Coin Balance // IDEA</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/">&lsaquo; Home</a>
		<ProfileMenu />
	</div>
</div>

<main class="coin-balance-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Coin Balance</div>
		<h1>My Coin Balance</h1>
		<p class="lead">
			Your own IDEA Coin standing: current balance, wage tier, Eating Pass status, and every
			transaction on your account, read straight from the real Supabase ledger (migration 0070).
			This page is read-only -- coins are logged by an admin at <strong>Coin Desk</strong>.
		</p>
	</section>

	{#if !configured}
		<section class="card">
			<p class="feedback error">
				The IDEA Coin ledger is not available yet -- migration 0070 does not appear to be applied.
				Check back later.
			</p>
		</section>
	{:else}
		<section class="card">
			<h2>Summary</h2>
			<div class="coin-summary">
				<div class="coin-balance" class:negative={balance < 0}>{coins(balance)}</div>
				<div class="medium-split">
					<span class="split-cell" class:negative={physicalBalance < 0}>
						<span class="split-label">physical coins</span>
						<span class="split-value">{coins(physicalBalance)}</span>
					</span>
					<span class="split-cell" class:negative={digitalBalance < 0}>
						<span class="split-label">digital</span>
						<span class="split-value">{coins(digitalBalance)}</span>
					</span>
				</div>
				<div class="coin-meta">
					{#if displayName || email}
						<span>{displayName ?? email}</span>
					{/if}
					<span>wage tier {wageTier ?? 1}</span>
					<span>
						eating pass:
						{#if eatingPass.active}
							active
							{#if eatingPass.strikes > 0}
								<span class="strike-chip"
									>{eatingPass.strikes} strike{eatingPass.strikes === 1 ? '' : 's'}</span
								>
							{/if}
						{:else}
							none
						{/if}
					</span>
				</div>
			</div>
		</section>

		<section class="card">
			<h2>Transaction history</h2>
			<CoinTransactionRows
				{transactions}
				kinds={categoryKinds}
				emptyMessage="No transactions yet. Once an admin logs a fine, award, or purchase against your account, it will show up here."
			/>
		</section>
	{/if}

	<footer class="page-footer">
		<VersionBadge app="coins" />
	</footer>
</main>

<style>
	.coin-balance-page {
		max-width: 52rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.coin-balance-page > .card {
		margin-bottom: 1.1rem;
	}
	.coin-balance-page h2 {
		margin-top: 0;
	}
	.lead strong {
		color: var(--white);
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
	.coin-summary {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		flex-wrap: wrap;
		margin: 0.2rem 0 0.2rem;
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
		align-items: center;
		gap: 0.8rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim);
	}
	.medium-split {
		display: flex;
		gap: 0.9rem;
		flex-wrap: wrap;
	}
	.split-cell {
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
	}
	.split-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--dim);
	}
	.split-value {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.95rem;
		color: var(--cyan);
	}
	.split-cell.negative .split-value {
		color: var(--amber);
	}
	.strike-chip {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		color: var(--amber);
		border: 1px solid var(--amber);
		border-radius: 999px;
		padding: 0.05rem 0.45rem;
		margin-left: 0.3rem;
	}
	.page-footer {
		margin-top: 2rem;
		display: flex;
		justify-content: center;
	}
</style>
