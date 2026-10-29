<script lang="ts">
	import AdminSubNav from '$lib/shell/AdminSubNav.svelte';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import FeedbackSourcesNav from '$lib/feedback/FeedbackSourcesNav.svelte';
	import { FEEDBACK_SOURCES } from '$lib/feedback/armory-reports';

	let { children }: { children: Snippet } = $props();

	/**
	 * THE FOUR PLACES FEEDBACK ARRIVES FROM (ledger 0401): the site, the Armory
	 * app's notes and incidents (FeedbackSourcesNav, over FEEDBACK_SOURCES, the
	 * one list of those three), and the connector's gaps, the things asked of
	 * Claude that the site cannot do yet. FeedbackSourcesNav lights one of its
	 * three for any path, so on the connector's own page this layout draws the
	 * four keys itself with Connector lit; on the other three it mounts that
	 * component and puts the Connector key beside it in the same row. The day
	 * the list in $lib/feedback learns the fourth, both become that component.
	 */
	const CONNECTOR = { id: 'connector', label: 'Connector', href: '/admin/feedback/connector' } as const;
	const onConnector = $derived(page.url.pathname.replace(/\/+$/, '').endsWith('/admin/feedback/connector'));
</script>

<!--
	THE PORTAL'S OWN CHROME (report R03), once for the whole feedback area. The
	console reads reports from every surface on the site, so it sits in the admin
	area with the header every other /admin page carries, the site plate the root
	layout puts on /admin, and the report control the root layout mounts. The way
	back is the admin console's Feedback panel, where the queue's new-report count
	is. Below it, the places feedback arrives from.
-->
<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/dashboard#panel-feedback">&lsaquo; Admin console</a>
		<ProfileMenu />
	</div>
</div>
<AdminSubNav current="feedback" />

<div class="fsn-row">
	{#if onConnector}
		<nav class="fsn" aria-label="Feedback sources" data-testid="feedback-sources">
			{#each FEEDBACK_SOURCES as source (source.id)}
				<a class="btn secondary fsn-key" href={source.href} data-testid="feedback-source-{source.id}">{source.label}</a>
			{/each}
			<a class="btn secondary fsn-key on" href={CONNECTOR.href} aria-current="page" data-testid="feedback-source-connector">{CONNECTOR.label}</a>
		</nav>
	{:else}
		<FeedbackSourcesNav pathname={page.url.pathname} />
		<a class="btn secondary fsn-key" href={CONNECTOR.href} data-testid="feedback-source-connector">{CONNECTOR.label}</a>
	{/if}
</div>

{@render children()}

<style>
	/* One row for the keys, whichever branch drew them: the shared strip's own
	   centring and bottom margin move to this row. */
	.fsn-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		max-width: var(--cr-measure, var(--measure-form));
		margin: 0 auto var(--space-3, 0.75rem);
		padding: 0 var(--cr-gutter, 1.2rem);
		box-sizing: border-box;
	}
	.fsn-row :global(.fsn) {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		max-width: none;
		margin: 0;
		padding: 0;
	}
	/* 44px, the floor every key on these pages holds. */
	.fsn-key {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		min-width: 44px;
		box-sizing: border-box;
	}
</style>
