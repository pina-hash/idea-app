<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import EntryDetail from '$lib/tournaments/EntryDetail.svelte';
	import type { PageData } from './$types';

	/**
	 * Public entry detail route: the load (session-blind) and the realtime
	 * subscription. Everything visual lives in EntryDetail so the dev harness
	 * drives the identical component with no backend (the TvStage pattern).
	 */
	let { data }: { data: PageData } = $props();

	const t = $derived(data.tournament);

	onMount(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const kick = () => {
			clearTimeout(timer);
			timer = setTimeout(() => invalidateAll(), 200);
		};
		let channel = data.supabase.channel(`tournament-entry-${data.entry.id}`);
		for (const table of [
			'tournament_bracket_matches',
			'tournament_qual_matches',
			'tournament_match_games',
			'tournament_reward_ledger',
			'tournament_entry_styles'
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
	<title>{data.entry.display_name} · {t.name} // Tournaments // IDEA</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/tournaments/{t.id}">&lsaquo; {t.name}</a>
		<ProfileMenu />
	</div>
</div>

<main class="entry-route">
	<EntryDetail
		tournament={t}
		entry={data.entry}
		entries={data.entries}
		styles={data.entryStyles}
		bracketMatches={data.bracketMatches}
		qualMatches={data.qualMatches}
		pools={data.pools}
		games={data.games}
		ledger={data.ledger}
	/>
	<footer class="page-footer">
		<a class="back" href="/tournaments/{t.id}">Back to the bracket</a>
		<VersionBadge app="tournaments" />
	</footer>
</main>

<style>
	.entry-route {
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
