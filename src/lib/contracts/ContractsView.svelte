<script lang="ts">
	import { onMount } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import {
		CONTRACT_STATUS_LABELS,
		claimRefusalMessage,
		type PublicContractRow
	} from '$lib/coin-desk/contracts';

	/**
	 * The real interactive tool, factored out of /contracts so a dev harness
	 * can mount the SAME component against a fake ledger (the CoinDeskTool /
	 * RolesManager convention). Unlike CoinBalanceView (pure read, no
	 * Supabase client at all) this page has ONE write path -- self-claim --
	 * so it takes `supabase` the same way CoinDeskTool does, and re-reads
	 * after a successful claim rather than trusting a client-side guess at
	 * the new state.
	 *
	 * Reads run the /coin-balance way: coin_contracts and coin_contract_status
	 * are broadly readable to any signed-in user (0077), so browsing is a
	 * direct table/view select with no RPC; coin_contract_claims is scoped by
	 * its own RLS to the caller's own rows, so "contracts I'm on" is the same
	 * kind of no-filter-needed read /coin-balance's history is.
	 */
	let {
		supabase,
		configured = true,
		email,
		initialContracts = [],
		initialMyClaimIds = []
	}: {
		supabase: SupabaseClient;
		configured?: boolean;
		email: string | null;
		initialContracts?: PublicContractRow[];
		initialMyClaimIds?: string[];
	} = $props();

	let contracts = $state<PublicContractRow[]>(initialContracts);
	let myClaimIds = $state<Set<string>>(new Set(initialMyClaimIds));
	let loadError = $state('');
	let refreshing = $state(false);

	async function refresh() {
		refreshing = true;
		const [contractsResp, statusResp, claimsResp] = await Promise.all([
			supabase
				.from('coin_contracts')
				.select('id, title, description, payout_amount, max_contractors, section_id, created_by, created_at, completed_at, cancelled_at')
				.order('created_at', { ascending: false }),
			supabase.from('coin_contract_status').select('id, claimed_count, status'),
			// No .eq('student_email', ...) filter -- RLS already scopes this to
			// the caller's own rows (the /coin-balance doctrine).
			supabase.from('coin_contract_claims').select('contract_id')
		]);
		refreshing = false;
		if (contractsResp.error || statusResp.error || claimsResp.error) {
			loadError = (contractsResp.error ?? statusResp.error ?? claimsResp.error)?.message ?? 'Failed to load.';
			return;
		}
		const statusById = new Map(
			(statusResp.data as { id: string; claimed_count: number; status: PublicContractRow['status'] }[]).map(
				(s) => [s.id, s]
			)
		);
		contracts = (contractsResp.data as Omit<PublicContractRow, 'claimed_count' | 'status'>[]).map((c) => {
			const s = statusById.get(c.id);
			return { ...c, claimed_count: s?.claimed_count ?? 0, status: s?.status ?? 'open' };
		});
		myClaimIds = new Set((claimsResp.data as { contract_id: string }[]).map((c) => c.contract_id));
	}

	// The server load already seeds `initialContracts`/`initialMyClaimIds` for
	// the real page's first paint, but this component must also work standalone
	// (the dev harness mounts it with no props at all) -- so it always
	// re-validates on mount rather than trusting only what it was handed. On
	// the real page this is a cheap redundant refetch, not a correctness gap.
	onMount(() => {
		refresh();
	});

	const myContracts = $derived(contracts.filter((c) => myClaimIds.has(c.id)));
	const openContracts = $derived(
		contracts.filter((c) => (c.status === 'open' || c.status === 'full') && !myClaimIds.has(c.id))
	);

	let claimBusy = $state<Record<string, boolean>>({});
	let claimFeedback = $state<Record<string, { ok: boolean; message: string }>>({});

	async function claimContract(id: string) {
		claimBusy = { ...claimBusy, [id]: true };
		const { [id]: _cleared, ...rest } = claimFeedback;
		claimFeedback = rest;
		const resp = await supabase.rpc('coin_contract_self_claim', { p_contract_id: id });
		claimBusy = { ...claimBusy, [id]: false };
		if (resp.error) {
			claimFeedback = { ...claimFeedback, [id]: { ok: false, message: resp.error.message } };
			return;
		}
		const r = resp.data as { ok: boolean; reason?: string; max_contractors?: number; claimed_count?: number };
		if (!r.ok) {
			claimFeedback = { ...claimFeedback, [id]: { ok: false, message: claimRefusalMessage(r) } };
			await refresh(); // the contract may have just filled or closed under us -- show the real state
			return;
		}
		claimFeedback = { ...claimFeedback, [id]: { ok: true, message: 'Claimed! It now shows under "Contracts you\'re on".' } };
		await refresh();
	}

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
	}
</script>

<svelte:head>
	<title>Contracts // IDEA</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/coin-balance">My Coin Balance</a>
		<a class="btn secondary" href="/">&lsaquo; Home</a>
		<ProfileMenu />
	</div>
</div>

<main class="contracts-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Contracts</div>
		<h1>Contracts</h1>
		<p class="lead">
			Posted jobs any student can claim, up to however many contractors it allows. Once claimed
			work is done, an admin completes the contract and splits the payout evenly across everyone
			who claimed it -- an ordinary Contract Completion award on your account.
		</p>
	</section>

	{#if !configured}
		<section class="card">
			<p class="feedback error">
				Contracts are not available yet -- migration 0077 does not appear to be applied. Check
				back later.
			</p>
		</section>
	{:else}
		{#if loadError}<p class="feedback error">{loadError}</p>{/if}

		<section class="card">
			<h2>Contracts you're on</h2>
			{#if myContracts.length}
				<div class="rows contract-rows">
					{#each myContracts as c (c.id)}
						<div class="row">
							<div class="who">
								<span class="title">{c.title}</span>
								<span class={`tag status-tag status-${c.status}`}>{CONTRACT_STATUS_LABELS[c.status]}</span>
							</div>
							<div class="meta">
								<span class="since">
									{c.payout_amount}i&cent; total &middot; {c.claimed_count}/{c.max_contractors} claimed
									&middot; claimed {when(c.created_at)}
								</span>
								{#if c.description}<span class="note-text">{c.description}</span>{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="note empty-state">
					You haven't claimed any contracts yet. Browse the open ones below.
				</p>
			{/if}
		</section>

		<section class="card">
			<h2>Open contracts</h2>
			<p class="note">
				{email ? `Claiming as ${email}.` : ''} Claiming is first-come, first-served -- a contract
				stops accepting claims the moment it reaches its max contractors.
			</p>
			{#if refreshing}<p class="note small">Refreshing&hellip;</p>{/if}
			{#if openContracts.length}
				<div class="rows contract-rows">
					{#each openContracts as c (c.id)}
						{@const feedback = claimFeedback[c.id]}
						{@const full = c.status === 'full'}
						<div class="row">
							<div class="who">
								<span class="title">{c.title}</span>
								{#if full}<span class="tag status-tag status-full">Full</span>{/if}
							</div>
							<div class="meta">
								<span class="since">
									{c.payout_amount}i&cent; total &middot; {c.claimed_count}/{c.max_contractors} claimed
								</span>
								{#if c.description}<span class="note-text">{c.description}</span>{/if}
								{#if feedback}
									<span class={feedback.ok ? 'txn-pos' : 'txn-neg'}>{feedback.message}</span>
								{/if}
							</div>
							<div class="actions">
								<button
									class="btn secondary"
									disabled={full || claimBusy[c.id]}
									onclick={() => claimContract(c.id)}
								>
									{claimBusy[c.id] ? 'Claiming…' : full ? 'Full' : 'Claim'}
								</button>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="note empty-state">No open contracts right now. Check back later.</p>
			{/if}
		</section>
	{/if}

	<footer class="page-footer">
		<VersionBadge app="coins" />
	</footer>
</main>

<style>
	.contracts-page {
		max-width: 52rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.contracts-page > .card {
		margin-bottom: 1.1rem;
	}
	.contracts-page h2 {
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
	.note {
		color: var(--dim);
		font-size: 0.9rem;
	}
	.note.small {
		font-size: 0.78rem;
	}
	.empty-state {
		padding: 0.6rem 0;
	}
	.rows {
		display: flex;
		flex-direction: column;
	}
	.contract-rows {
		margin-top: 0.2rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
		padding: 0.6rem 0;
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
	.title {
		font-weight: 700;
		color: var(--white);
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
		flex: 1;
	}
	.note-text {
		font-size: 0.85rem;
		color: var(--dim);
	}
	.since {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		color: var(--dim);
	}
	.tag {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
		border: 1px solid currentColor;
	}
	.status-tag.status-open {
		color: var(--green);
	}
	.status-tag.status-full {
		color: var(--cyan);
	}
	.status-tag.status-completed {
		color: var(--gold);
	}
	.status-tag.status-cancelled {
		color: var(--amber);
	}
	.actions {
		margin-left: auto;
	}
	.txn-neg {
		color: var(--amber);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
	}
	.txn-pos {
		color: var(--green);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
	}
	.page-footer {
		margin-top: 2rem;
		display: flex;
		justify-content: center;
	}
</style>
