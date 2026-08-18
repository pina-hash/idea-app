<script lang="ts">
	import LogView from '$lib/coin-desk/LogView.svelte';
	import { untrack } from 'svelte';
	import { readCoinDeskPrefs, type CoinDeskPrefs } from '$lib/coin-desk';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * `profiles.preferences` rides `userProfile` from the ROOT layout, which
	 * already loads it for every page (the AppLauncher reads its own namespace
	 * out of the same object). So the coin desk's default mode and default
	 * medium cost no query of their own -- only a parser.
	 */
	let prefs = $state<CoinDeskPrefs>(
		untrack(() => readCoinDeskPrefs(data.userProfile?.preferences))
	);

	/**
	 * THE WHOLE-BLOB SPREAD-MERGE, the same write every other namespace uses:
	 * read what is there, replace one key, write it all back. A targeted jsonb
	 * update would be the way a sibling namespace gets clobbered.
	 *
	 * Fire and forget, and silent. This is a preference, not the transaction:
	 * a failed write costs the operator a re-pick next session and must never
	 * interrupt, block, or annotate the thing they are actually doing.
	 */
	async function savePrefs(next: CoinDeskPrefs) {
		prefs = next;
		const uid = data.claims?.sub;
		if (!uid) return;
		const merged = { ...(data.userProfile?.preferences ?? {}), coinDesk: next };
		await data.supabase.from('profiles').update({ preferences: merged }).eq('id', uid);
	}
</script>

<svelte:head>
	<title>Coin Desk // IDEA</title>
</svelte:head>

<LogView
	categories={data.categories}
	supabase={data.supabase}
	configured={data.configured}
	sections={data.sections}
	sectionsConfigured={data.sectionsConfigured}
	{prefs}
	onPrefs={savePrefs}
/>
