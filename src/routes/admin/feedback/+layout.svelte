<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import FeedbackSourcesNav from '$lib/feedback/FeedbackSourcesNav.svelte';

	let { children }: { children: Snippet } = $props();
</script>

<!--
	THE PORTAL'S OWN CHROME (report R03), once for the whole feedback area. The
	console reads reports from every surface on the site, so it sits in the admin
	area with the header every other /admin page carries, the site plate the root
	layout puts on /admin, and the report control the root layout mounts. The way
	back is the admin console's Feedback panel, where the queue's new-report count
	is. Below it, the three places feedback arrives from (2026-10-07): the site,
	and the Armory app's notes and incidents.
-->
<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/dashboard#panel-feedback">&lsaquo; Admin console</a>
		<ProfileMenu />
	</div>
</div>

<FeedbackSourcesNav pathname={page.url.pathname} />

{@render children()}
