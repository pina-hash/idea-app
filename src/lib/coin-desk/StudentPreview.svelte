<script lang="ts">
	import { untrack } from 'svelte';
	import CoinBalanceView from '$lib/coin-balance/CoinBalanceView.svelte';
	import ContractsView from '$lib/contracts/ContractsView.svelte';
	import type { DisplayTransaction, EatingPassStatus } from '$lib/coin-balance';
	import type { PublicContractRow } from '$lib/coin-desk/contracts';

	/**
	 * "Preview as student": the REAL student components, fed by the admin-read
	 * RPCs the admin already holds, under an unmissable persistent banner.
	 *
	 * Not impersonation -- see /coin-desk/preview/+page.server.ts for the full
	 * reasoning. The two things THIS file is responsible for are the banner
	 * (so nobody can mistake the screen for their own) and passing `readOnly`
	 * to ContractsView, which is what removes every claim control. The banner
	 * is `position: sticky` on purpose: it must still be on screen after the
	 * page has been scrolled.
	 *
	 * Factored out of the route (the CoinDeskTool / CoinBalanceView
	 * convention) so /dev/coin-preview mounts the IDENTICAL component against
	 * sample data -- there is no second copy of the banner or the readOnly
	 * wiring to drift.
	 */
	interface PreviewData {
		students: { email: string; name: string }[];
		email: string | null;
		displayName: string | null;
		configured: boolean;
		balance: number;
		physicalBalance: number;
		digitalBalance: number;
		transactions: DisplayTransaction[];
		categoryKinds: Record<string, string>;
		wageTier: number | null;
		eatingPass: EatingPassStatus;
		contracts: PublicContractRow[];
		myClaimIds: string[];
		loadError: string;
	}

	let { data }: { data: PreviewData } = $props();

	// Seeds from the URL and is the select's own state from then on -- picking
	// a different student navigates, which reloads the page anyway. untrack
	// states that "the starting point" is the whole intent (the
	// /coin-desk/students convention).
	let picked = $state(untrack(() => data.email ?? ''));

	function open(email: string) {
		if (!email) return;
		window.location.href = `/coin-desk/preview?student=${encodeURIComponent(email)}`;
	}
</script>

<svelte:head>
	<title>Preview as student // Coin Desk</title>
</svelte:head>

<div class="preview-banner" role="status">
	<span class="dot" aria-hidden="true"></span>
	<div class="text">
		<strong>Preview mode</strong>
		{#if data.email}
			You are looking at what <em>{data.displayName}</em> sees. This is a read-only view built
			from your own admin access — you are still signed in as yourself, and nothing on this page
			can log, claim, or change anything.
		{:else}
			Pick a student below to see their own view of the coin system. Read-only: you stay signed
			in as yourself throughout.
		{/if}
	</div>
	<a class="exit" href="/coin-desk/students">Exit preview</a>
</div>

<div class="preview-picker">
	<label for="preview-student">Student</label>
	<select
		id="preview-student"
		class="tap-44"
		bind:value={picked}
		onchange={() => open(picked)}
	>
		<option value="">Choose a student&hellip;</option>
		{#each data.students as s (s.email)}
			<option value={s.email}>{s.name}</option>
		{/each}
	</select>
	{#if data.loadError}<span class="err">{data.loadError}</span>{/if}
</div>

{#if data.email}
	<div class="preview-body">
		<CoinBalanceView
			configured={data.configured}
			email={data.email}
			displayName={data.displayName}
			balance={data.balance}
			physicalBalance={data.physicalBalance}
			digitalBalance={data.digitalBalance}
			transactions={data.transactions}
			categoryKinds={data.categoryKinds}
			wageTier={data.wageTier}
			eatingPass={data.eatingPass}
		/>
		<ContractsView
			configured={data.configured}
			email={data.email}
			initialContracts={data.contracts}
			initialMyClaimIds={data.myClaimIds}
			readOnly
		/>
	</div>
{:else}
	<p class="empty">No student selected.</p>
{/if}

<style>
	.preview-banner {
		position: sticky;
		top: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		gap: 0.9rem;
		padding: 0.7rem 1.1rem;
		background: color-mix(in srgb, var(--gold) 16%, var(--bg0));
		border-bottom: 2px solid var(--gold);
	}
	.dot {
		flex: 0 0 auto;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--gold);
	}
	.text {
		flex: 1 1 auto;
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--white);
	}
	.text strong {
		font-family: 'Share Tech Mono', monospace;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--gold);
		margin-right: 0.5rem;
	}
	.exit {
		flex: 0 0 auto;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--gold);
		border: 1px solid var(--gold);
		border-radius: 3px;
		padding: 0.35rem 0.7rem;
		text-decoration: none;
	}
	.exit:hover {
		background: color-mix(in srgb, var(--gold) 20%, transparent);
	}
	.preview-picker {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.9rem 1.1rem;
		flex-wrap: wrap;
	}
	.preview-picker label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--dim);
	}
	.preview-picker select {
		min-width: 0;
		max-width: 22rem;
		flex: 1 1 14rem;
	}
	.err {
		color: var(--crimson);
		font-size: 0.78rem;
	}
	.empty {
		padding: 2rem 1.1rem;
		color: var(--dim);
	}
	/* The two student views each draw their own full-page chrome, which is
	   the point -- an admin should see exactly the screens a student gets. */
	.preview-body {
		display: block;
	}
</style>
