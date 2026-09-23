<script lang="ts">
	import { page } from '$app/state';
	import { version as buildId } from '$app/environment';
	import { deploy } from 'virtual:site-versions';
	import ProjectorView from '$lib/classroom/live-class/ProjectorView.svelte';
	import SiteFeedback from '$lib/feedback/SiteFeedback.svelte';
	import { feedbackIsAnonymous, feedbackWriter } from '$lib/feedback/feedback';
	import { describeBuild } from '$lib/feedback/context';
	import type { PageData } from './$types';

	/**
	 * THE CLASS PROJECTOR VIEW, RESET TO THE ROOT LAYOUT.
	 *
	 * `@` is the one layout reset in the app, and it resets to ROOT on purpose:
	 * the root layout still wraps this page, so the theme (Space White applies
	 * under /classroom), deploy safety and the navigation indicator are all
	 * inherited exactly as every other page inherits them. What it drops is the
	 * classroom's masthead, trail and tabs -- chrome the class should not see on
	 * the wall -- and, as important, the two classroom layout LOADS, which carry a
	 * manager's private payload this page must never hold.
	 *
	 * THE REPORT CONTROL IS RELOCATED, NOT DELETED (the deck's arrangement): this
	 * route is in the feedback exclusion registry as `projector`, so nothing
	 * floats over the wall, and the control lives in the view's own strip, which
	 * exists only outside full screen.
	 */
	let { data }: { data: PageData } = $props();

	const build = describeBuild(deploy, buildId);
	const submit = $derived(feedbackWriter(data.supabase, data.claims?.sub));
	const anonymous = $derived(feedbackIsAnonymous(data.supabase, data.claims?.sub));
</script>

<ProjectorView classLabel={data.classLabel} viewer={data.claims?.sub ?? 'signed-out'} sectionId={data.sectionId}>
	{#snippet controls()}
		<SiteFeedback
			place="relocated"
			routeId={page.route.id}
			pathname={page.url.pathname}
			role={data.userProfile?.role ?? null}
			sectionId={page.params.sectionId ?? null}
			{build}
			{submit}
			{anonymous}
			label="Report"
		/>
	{/snippet}
</ProjectorView>
