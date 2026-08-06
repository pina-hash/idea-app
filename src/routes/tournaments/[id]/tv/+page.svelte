<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import TvStage from '$lib/tournaments/TvStage.svelte';
	import { styleMap } from '$lib/tournaments/entry-styles';
	import type { PageData } from './$types';

	/**
	 * TV mode route: the load (public, session-blind) and the realtime
	 * subscription. Everything visual lives in TvStage so the dev harness can
	 * drive the identical component with no backend.
	 */
	let { data }: { data: PageData } = $props();

	const t = $derived(data.tournament);
	const styles = $derived(styleMap(data.entryStyles));
	const shareUrl = $derived(`${page.url.origin}/tournaments/${t.id}`);

	// The same channel shape the public live view uses -- no polling anywhere.
	onMount(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const kick = () => {
			clearTimeout(timer);
			timer = setTimeout(() => invalidateAll(), 150);
		};
		let channel = data.supabase.channel(`tournament-tv-${t.id}`);
		for (const table of [
			'tournament_entries',
			'tournament_bracket_matches',
			'tournament_match_games',
			'tournament_entry_styles'
		]) {
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
</script>

<svelte:head>
	<title>{t.name} · TV // Tournaments // IDEA</title>
</svelte:head>

<TvStage
	tournament={t}
	entries={data.entries}
	{styles}
	matches={data.bracketMatches}
	games={data.games}
	{shareUrl}
/>
