<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import BracketView from '$lib/tournaments/BracketView.svelte';
	import PoolsView from '$lib/tournaments/PoolsView.svelte';
	import EntryChip from '$lib/tournaments/EntryChip.svelte';
	import MatchAlerts from '$lib/tournaments/MatchAlerts.svelte';
	import RewardsPanel from '$lib/tournaments/RewardsPanel.svelte';
	import TournamentQr from '$lib/tournaments/TournamentQr.svelte';
	import { entryMap, parseConfig, statusLabel } from '$lib/tournaments/tournaments';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const t = $derived(data.tournament);
	const config = $derived(parseConfig(t.config));
	const entries = $derived(entryMap(data.entries));
	const signedIn = $derived(!!data.claims);
	const champion = $derived(
		t.champion_entry_id ? (entries[t.champion_entry_id] ?? null) : null
	);

	// Live updates for everyone, signed-out spectators included: subscribe to
	// every tournament-scoped table and refetch (debounced) on any event.
	onMount(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const kick = () => {
			clearTimeout(timer);
			timer = setTimeout(() => invalidateAll(), 150);
		};
		const filtered = [
			'tournament_entries',
			'tournament_qual_pools',
			'tournament_qual_matches',
			'tournament_bracket_matches',
			'tournament_match_games',
			'tournament_reward_rules',
			'tournament_reward_ledger'
		];
		let channel = data.supabase.channel(`tournament-${t.id}`);
		for (const table of filtered) {
			channel = channel.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table, filter: `tournament_id=eq.${t.id}` },
				kick
			);
		}
		channel = channel.on(
			'postgres_changes',
			{ event: '*', schema: 'public', table: 'tournaments', filter: `id=eq.${t.id}` },
			kick
		);
		channel.subscribe();
		return () => {
			clearTimeout(timer);
			data.supabase.removeChannel(channel);
		};
	});

	// Self-registration (also used for invite acceptance).
	let regName = $state('');
	let regDescription = $state('');
	let regFile = $state<FileList | null>(null);
	let regBusy = $state(false);
	let regError = $state('');

	async function uploadThumb(): Promise<string | null> {
		const file = regFile?.[0];
		if (!file || !data.claims) return null;
		const ext = (file.name.split('.').pop() || 'png').toLowerCase();
		const path = `${data.claims.sub}/${crypto.randomUUID()}.${ext}`;
		const { error } = await data.supabase.storage.from('tournament-thumbs').upload(path, file);
		if (error) throw new Error(`Thumbnail upload failed: ${error.message}`);
		return data.supabase.storage.from('tournament-thumbs').getPublicUrl(path).data.publicUrl;
	}

	async function register() {
		regError = '';
		if (!regName.trim()) {
			regError = 'Pick a display name.';
			return;
		}
		regBusy = true;
		try {
			const thumb = await uploadThumb();
			if (data.myInvite) {
				const { error } = await data.supabase.rpc('tournament_respond_invite', {
					p_invite_id: data.myInvite.id,
					p_accept: true,
					p_display_name: regName.trim(),
					p_description: regDescription.trim(),
					p_thumbnail_url: thumb
				});
				if (error) throw new Error(error.message);
			} else {
				const { error } = await data.supabase.rpc('tournament_register_entry', {
					p_tournament_id: t.id,
					p_display_name: regName.trim(),
					p_description: regDescription.trim(),
					p_thumbnail_url: thumb
				});
				if (error) throw new Error(error.message);
			}
			await invalidateAll();
		} catch (e) {
			regError = e instanceof Error ? e.message : String(e);
		} finally {
			regBusy = false;
		}
	}

	async function declineInvite() {
		if (!data.myInvite) return;
		regBusy = true;
		await data.supabase.rpc('tournament_respond_invite', {
			p_invite_id: data.myInvite.id,
			p_accept: false
		});
		regBusy = false;
		await invalidateAll();
	}

	// The page's own canonical URL (origin + path, no query), for the QR.
	const shareUrl = $derived(`${page.url.origin}/tournaments/${t.id}`);

	const regOpen = $derived(t.status === 'registration_open');
	const canRegister = $derived(
		signedIn &&
			!data.myEntry &&
			(regOpen || (!!data.myInvite && (regOpen || t.status === 'seeding')))
	);
</script>

<svelte:head>
	<title>{t.name} // Tournaments // IDEA</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/tournaments">&lsaquo; Tournaments</a>
		<ProfileMenu />
	</div>
</div>

<main class="t-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Tournaments</div>
		<div class="title-row">
			<h1>{t.name}</h1>
			<span class="status" class:live={t.status === 'live'} class:open={t.status === 'registration_open'}>
				{#if t.status === 'live'}<span class="live-dot" aria-hidden="true"></span>{/if}
				{statusLabel(t.status)}
			</span>
		</div>
		{#if t.description}<p class="lead">{t.description}</p>{/if}
		{#if data.isHost}
			<a class="btn" href="/tournaments/{t.id}/host">Host console</a>
		{/if}
	</section>

	{#if champion}
		<section class="card champion-banner">
			<span class="champ-label">Champion</span>
			<EntryChip entry={champion} winner />
		</section>
	{/if}

	{#if regOpen}
		<section class="card qr-section">
			<TournamentQr url={shareUrl} name={t.name} />
		</section>
	{/if}

	{#if signedIn && data.myEntry && t.status !== 'complete'}
		<MatchAlerts supabase={data.supabase} />
	{/if}

	{#if canRegister}
		<section class="card register">
			<h2>{data.myInvite ? 'You are invited' : 'Register'}</h2>
			<p class="note">
				Your public identity in this tournament is the display name and picture you choose here.
			</p>
			{#if regError}<p class="error">{regError}</p>{/if}
			<div class="reg-form">
				<input type="text" maxlength="40" placeholder="Display name" bind:value={regName} />
				<input
					type="text"
					maxlength="200"
					placeholder="Short description (optional)"
					bind:value={regDescription}
				/>
				<label class="file-label">
					<span>Thumbnail (optional)</span>
					<input type="file" accept="image/*" bind:files={regFile} />
				</label>
				<div class="btn-row">
					<button class="btn" onclick={register} disabled={regBusy || !regName.trim()}>
						{data.myInvite ? 'Accept & register' : 'Register'}
					</button>
					{#if data.myInvite}
						<button class="btn secondary" onclick={declineInvite} disabled={regBusy}>
							Decline invite
						</button>
					{/if}
				</div>
			</div>
		</section>
	{:else if regOpen && !signedIn}
		<section class="card register">
			<h2>Registration is open</h2>
			<p class="note">Sign in from the <a href="/">home page</a> to register an entry.</p>
		</section>
	{:else if data.myEntry}
		<section class="card register slim">
			<span class="note">Registered as</span>
			<EntryChip entry={data.myEntry} />
		</section>
	{/if}

	{#if data.bracketMatches.length}
		<section class="block">
			<h2 class="block-title">Bracket</h2>
			<BracketView
				matches={data.bracketMatches}
				{entries}
				games={data.games}
				championId={t.champion_entry_id}
			/>
		</section>
	{/if}

	{#if config.quals_enabled && data.pools.length}
		<section class="block">
			<h2 class="block-title">Qualifying pools</h2>
			<PoolsView
				pools={data.pools}
				matches={data.qualMatches}
				{entries}
				scoreEntry={config.score_entry}
			/>
		</section>
	{/if}

	{#if data.rewardRules.length || data.rewardLedger.length}
		<section class="block">
			<h2 class="block-title">Rewards</h2>
			<RewardsPanel rules={data.rewardRules} ledger={data.rewardLedger} {entries} />
		</section>
	{/if}

	<section class="block">
		<h2 class="block-title">Entries ({data.entries.length})</h2>
		{#if data.entries.length}
			<div class="entrants">
				{#each data.entries as e (e.id)}
					<div class="entrant card">
						<EntryChip entry={e} seed={t.status === 'live' || t.status === 'complete' || t.status === 'seeding' ? e.seed : null} />
						{#if e.description}<p class="entrant-desc">{e.description}</p>{/if}
					</div>
				{/each}
			</div>
		{:else}
			<p class="note">No entries yet.</p>
		{/if}
	</section>

	<footer class="page-footer">
		<VersionBadge app="tournaments" />
	</footer>
</main>

<style>
	.t-page {
		max-width: 72rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.title-row {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		flex-wrap: wrap;
	}
	.title-row h1 {
		margin: 0;
	}
	.status {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--dim);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.2));
		border-radius: 999px;
		padding: 0.2rem 0.7rem;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.status.live {
		color: var(--crimson);
		border-color: var(--crimson);
	}
	.status.open {
		color: var(--green);
		border-color: var(--green);
	}
	.live-dot {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: var(--crimson);
		animation: pulse 1.2s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.3;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.live-dot {
			animation: none;
		}
	}
	.qr-section {
		margin-bottom: 1.1rem;
	}
	.champion-banner {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		border-color: var(--gold);
		margin-bottom: 1.1rem;
	}
	.champ-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--gold);
	}
	.register {
		margin-bottom: 1.1rem;
	}
	.register h2 {
		margin-top: 0;
	}
	.register.slim {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}
	.note {
		color: var(--dim);
		font-size: 0.9rem;
	}
	.error {
		color: var(--amber);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
	}
	.reg-form {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		max-width: 26rem;
	}
	.reg-form input[type='text'] {
		background: var(--bg0);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		padding: 0.45rem 0.6rem;
	}
	.file-label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		color: var(--dim);
	}
	.block {
		margin-top: 1.6rem;
	}
	.block-title {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--green);
	}
	.entrants {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 0.8rem;
	}
	.entrant {
		padding: 0.7rem 0.85rem;
	}
	.entrant-desc {
		margin: 0.4rem 0 0;
		color: var(--dim);
		font-size: 0.85rem;
	}
	.page-footer {
		margin-top: 2.5rem;
		display: flex;
		justify-content: center;
	}
</style>
