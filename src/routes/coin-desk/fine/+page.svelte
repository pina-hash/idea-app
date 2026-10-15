<script lang="ts">
	import { untrack } from 'svelte';
	import FineScreen from '$lib/coin-fine/FineScreen.svelte';
	import { readCoinFinePrefs } from '$lib/coin-fine/fine';
	import { createFineTransports } from '$lib/coin-fine/transports';
	import { supabaseProfileIo, writeProfileNamespace } from '$lib/preferences/profile-io';
	import type { PageData } from './$types';

	/**
	 * THE FINE SCREEN (IDEA Coin V2): the coin desk's phone-first area. It sits
	 * inside the coin desk's own layout, whose server load is the admin gate for
	 * the whole group (a non-admin, or a visitor with no session, gets 404), and
	 * this page's own server load asks the same question again first. Every RPC
	 * the screen calls is admin-only in the database regardless.
	 */
	let { data }: { data: PageData } = $props();

	/** One client for the session, captured once (the item page's convention). */
	// svelte-ignore state_referenced_locally
	const transports = createFineTransports(data.supabase);
	/** The class used last: a default for where to land, never an entry. */
	const lastSection = untrack(() => readCoinFinePrefs(data.userProfile?.preferences).lastSection);

	/**
	 * Remembered through the one read-first, merge-one-namespace writer, fire
	 * and forget: a failed preference write costs a re-pick next time and must
	 * never interrupt a fine.
	 */
	function remember(sectionId: string): void {
		const uid = data.claims?.sub;
		if (!uid) return;
		void writeProfileNamespace(supabaseProfileIo(data.supabase, uid), 'coinFine', {
			lastSection: sectionId
		});
	}
</script>

<svelte:head>
	<title>Fine // IDEA Coin Desk</title>
</svelte:head>

<div class="fp-main" data-testid="coin-desk-fine">
	<FineScreen {transports} {lastSection} onSectionUsed={remember} />
</div>

<style>
	.fp-main {
		min-width: 0;
		margin-top: var(--space-3, 0.75rem);
	}
</style>
