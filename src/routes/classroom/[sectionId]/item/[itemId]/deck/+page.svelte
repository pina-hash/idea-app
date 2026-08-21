<script lang="ts">
	import { page } from '$app/state';
	import { version as buildId } from '$app/environment';
	import { deploy } from 'virtual:site-versions';
	import DeckViewer from '$lib/classroom/DeckViewer.svelte';
	import SiteFeedback from '$lib/feedback/SiteFeedback.svelte';
	import { feedbackWriter } from '$lib/feedback/feedback';
	import { describeBuild } from '$lib/feedback/context';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * THE DECK EXCLUSION, RELOCATED. This route is in the shell's exclusion
	 * registry (category `deck`) because the stage is projected onto a wall and a
	 * floating control over it ends up in the photograph of the lesson. It is not
	 * DROPPED though: the viewer takes it as a `controls` snippet and renders it
	 * in the bar it already owns, so a teacher whose deck will not advance can
	 * still say so from the surface it went wrong on.
	 */
	const build = describeBuild(deploy, buildId);
	const submit = $derived(feedbackWriter(data.supabase, data.claims?.sub));
</script>

<DeckViewer deck={data.deck} backHref={data.backHref} backLabel="Back to the item">
	{#snippet controls()}
		<SiteFeedback
			place="relocated"
			routeId={page.route.id}
			pathname={page.url.pathname}
			role={data.userProfile?.role ?? null}
			sectionId={page.params.sectionId ?? null}
			{build}
			{submit}
			label="Report"
		/>
	{/snippet}
</DeckViewer>
