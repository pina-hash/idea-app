<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import MatchDetail from '$lib/tournaments/MatchDetail.svelte';
	import type { PageData } from './$types';

	/**
	 * Public match detail route: the load (session-blind) and the realtime
	 * subscription. Everything visual lives in MatchDetail so the dev harness
	 * drives the identical component with no backend (the TvStage pattern).
	 */
	let { data }: { data: PageData } = $props();

	const t = $derived(data.tournament);

	// Live like every other tournament surface: a match anyone is watching can
	// be started, finished or corrected while they watch.
	onMount(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const kick = () => {
			clearTimeout(timer);
			timer = setTimeout(() => invalidateAll(), 200);
		};
		let channel = data.supabase.channel(`tournament-match-${t.id}`);
		for (const table of [
			'tournament_bracket_matches',
			'tournament_qual_matches',
			'tournament_match_games',
			'tournament_reward_ledger'
		]) {
			channel = channel.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table, filter: `tournament_id=eq.${t.id}` },
				kick
			);
		}
		channel.subscribe();
		return () => {
			clearTimeout(timer);
			data.supabase.removeChannel(channel);
		};
	});
</script>

<svelte:head>
	<title>Match · {t.name} // Tournaments // IDEA</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/tournaments/{t.id}">&lsaquo; {t.name}</a>
		<ProfileMenu />
	</div>
</div>

<main class="match-route">
	<MatchDetail
		tournament={t}
		kind={data.kind}
		match={data.match}
		qualMatch={data.qualMatch}
		qualPool={data.qualPool}
		entries={data.entries}
		styles={data.entryStyles}
		events={data.events}
		games={data.games}
		siblings={data.siblings}
		ledger={data.ledger}
	/>
	<footer class="page-footer">
		<a class="back" href="/tournaments/{t.id}">Back to the bracket</a>
		<VersionBadge app="tournaments" />
	</footer>
</main>

<style>
	.match-route {
		max-width: 52rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.page-footer {
		margin-top: 1.6rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.back {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim);
	}
</style>
