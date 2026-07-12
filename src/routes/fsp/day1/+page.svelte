<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import FspDeck from '$lib/fsp/FspDeck.svelte';

	/**
	 * /fsp/day1 — the FSP Day 1 presentation deck. Public route (not in
	 * authedPrefixes); the presenter drives it full-screen. Slide 13 embeds the
	 * live Q&A feed, which reads fsp_questions under RLS — so the incoming
	 * questions populate only for a signed-in presenter (the intended use).
	 */
	let { data } = $props();
	const supabase = $derived(data.supabase as SupabaseClient);
</script>

<svelte:head>
	<title>FSP // Day 1</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<FspDeck {supabase} />
