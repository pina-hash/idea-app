<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import DeleteTournament from '$lib/tournaments/DeleteTournament.svelte';
	import { statusLabel, type Tournament } from '$lib/tournaments/tournaments';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const signedIn = $derived(!!data.claims);
	/** A host of this one, or any site admin. The RPC enforces the same rule. */
	const canDelete = (t: Tournament) => data.isAdmin || data.hostedIds.includes(t.id);
	const entryCount = (t: Tournament) =>
		data.entryRows.filter((e) => e.tournament_id === t.id).length;
	const rewardCount = (t: Tournament) => data.rewardCountById[t.id] ?? 0;
	const rewardCoins = (t: Tournament) => data.rewardCoinsById[t.id] ?? 0;
	const rewardEntries = (t: Tournament) => data.rewardEntriesById[t.id] ?? 0;
	const championName = (t: Tournament) =>
		t.champion_entry_id
			? (data.entryRows.find((e) => e.id === t.champion_entry_id)?.display_name ?? null)
			: null;
	const tournamentName = (id: string) =>
		data.tournaments.find((t) => t.id === id)?.name ?? 'a tournament';

	// Pending-invite responses (display name required to accept).
	let inviteNames = $state<Record<string, string>>({});
	let inviteBusy = $state<string | null>(null);
	let inviteError = $state('');

	async function respond(inviteId: string, accept: boolean) {
		inviteError = '';
		inviteBusy = inviteId;
		const { error } = await data.supabase.rpc('tournament_respond_invite', {
			p_invite_id: inviteId,
			p_accept: accept,
			p_display_name: inviteNames[inviteId]?.trim() || null
		});
		inviteBusy = null;
		if (error) {
			inviteError = error.message;
			return;
		}
		await invalidateAll();
	}

	// Deletion (0066, payout warning 0068). Per-row busy/error so one card's
	// failure never blanks another's control.
	let deleteBusy = $state<string | null>(null);
	let deleteErrors = $state<Record<string, string>>({});

	async function remove(id: string, confirmName: string, acknowledgePayoutLoss: boolean) {
		deleteErrors = { ...deleteErrors, [id]: '' };
		deleteBusy = id;
		const { error } = await data.supabase.rpc('tournament_delete', {
			p_tournament_id: id,
			p_confirm_name: confirmName || null,
			p_acknowledge_payout_loss: acknowledgePayoutLoss
		});
		deleteBusy = null;
		if (error) {
			deleteErrors = { ...deleteErrors, [id]: error.message };
			return;
		}
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>Tournaments // IDEA</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/">&lsaquo; Home</a>
		<ProfileMenu />
	</div>
</div>

<main class="tournaments-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Tournaments</div>
		<h1>Tournaments</h1>
		<p class="lead">
			Live double-elimination brackets, open to watch by anyone. Sign in to register or host.
		</p>
		{#if signedIn}
			<a class="btn" href="/tournaments/new">New tournament</a>
		{/if}
	</section>

	{#if data.myInvites.length}
		<section class="card invites">
			<h2>Your invites</h2>
			{#if inviteError}<p class="error">{inviteError}</p>{/if}
			{#each data.myInvites as inv (inv.id)}
				<div class="invite-row">
					<div class="invite-name">{tournamentName(inv.tournament_id)}</div>
					<input
						class="invite-input"
						type="text"
						maxlength="40"
						placeholder="Display name (shown publicly)"
						bind:value={inviteNames[inv.id]}
					/>
					<button
						class="btn"
						disabled={inviteBusy === inv.id || !inviteNames[inv.id]?.trim()}
						onclick={() => respond(inv.id, true)}
					>
						Accept
					</button>
					<button
						class="btn secondary"
						disabled={inviteBusy === inv.id}
						onclick={() => respond(inv.id, false)}
					>
						Decline
					</button>
				</div>
			{/each}
		</section>
	{/if}

	<section class="list">
		{#if !data.tournaments.length}
			<div class="card"><p>No tournaments yet.</p></div>
		{/if}
		{#each data.tournaments as t (t.id)}
			<!-- The card itself stays one big link; the delete control is a
			     SIBLING beneath it, never nested inside the anchor (a button in
			     an <a> is invalid markup and its clicks would navigate). -->
			<div class="t-row">
				<a class="card t-card" href="/tournaments/{t.id}">
					<div class="t-top">
						<h2>{t.name}</h2>
						<span
							class="status"
							class:live={t.status === 'live'}
							class:open={t.status === 'registration_open'}
						>
							{statusLabel(t.status)}
						</span>
					</div>
					{#if t.description}<p class="t-desc">{t.description}</p>{/if}
					<div class="t-meta">
						<span>{entryCount(t)} entr{entryCount(t) === 1 ? 'y' : 'ies'}</span>
						{#if championName(t)}
							<span class="champ">Champion: {championName(t)}</span>
						{/if}
						{#if data.hostedIds.includes(t.id)}
							<span class="host-tag">You host this</span>
						{/if}
					</div>
				</a>
				{#if canDelete(t)}
					<div class="t-admin">
						<DeleteTournament
							tournament={t}
							entryCount={entryCount(t)}
							rewardCount={rewardCount(t)}
							rewardCoins={rewardCoins(t)}
							rewardEntries={rewardEntries(t)}
							compact
							busy={deleteBusy === t.id}
							error={deleteErrors[t.id] ?? ''}
							ondelete={(name, ack) => remove(t.id, name, ack)}
						/>
					</div>
				{/if}
			</div>
		{/each}
	</section>

	<footer class="page-footer">
		<VersionBadge app="tournaments" />
	</footer>
</main>

<style>
	.tournaments-page {
		max-width: 60rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.hero {
		margin-bottom: 1.4rem;
	}
	.invites {
		margin-bottom: 1.2rem;
	}
	.invites h2 {
		margin-top: 0;
	}
	.invite-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		padding: 0.4rem 0;
	}
	.invite-name {
		font-weight: 700;
		min-width: 10rem;
	}
	.invite-input {
		flex: 1;
		min-width: 12rem;
		background: var(--bg0);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		padding: 0.4rem 0.55rem;
	}
	.error {
		color: var(--amber);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.t-row {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.t-admin {
		padding-left: 0.2rem;
	}
	.t-card {
		display: block;
		text-decoration: none;
		transition: border-color 120ms ease;
	}
	.t-card:hover {
		border-color: var(--green);
	}
	.t-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.8rem;
	}
	.t-top h2 {
		margin: 0;
	}
	.status {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--dim);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.2));
		border-radius: 999px;
		padding: 0.15rem 0.6rem;
		white-space: nowrap;
	}
	.status.live {
		color: var(--crimson);
		border-color: var(--crimson);
	}
	.status.open {
		color: var(--green);
		border-color: var(--green);
	}
	.t-desc {
		color: var(--dim);
		margin: 0.4rem 0 0;
	}
	.t-meta {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		margin-top: 0.6rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--cyan);
	}
	.champ {
		color: var(--gold);
	}
	.host-tag {
		color: var(--green);
	}
	.page-footer {
		margin-top: 2.5rem;
		display: flex;
		justify-content: center;
	}
</style>
