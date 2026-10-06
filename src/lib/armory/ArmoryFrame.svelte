<script lang="ts">
	/**
	 * The frame every /armory page shares: the site header, the room wrapper,
	 * a breadcrumb, the page title. Armory is unlisted until the pilot, so
	 * nothing in the site's shared navigation points here; the crumbs are the
	 * way around inside it.
	 */
	import type { Snippet } from 'svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import './armory.css';

	let {
		title,
		crumbs = [],
		lead = null,
		children
	}: {
		title: string;
		crumbs?: Array<{ href: string; label: string }>;
		lead?: string | null;
		children: Snippet;
	} = $props();
</script>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="ar-btn quiet" href="/armory">Armory</a>
		<ProfileMenu />
	</div>
</div>

<main class="ar-root" data-testid="armory-root">
	{#if crumbs.length > 0}
		<nav class="ar-crumbs" aria-label="Where you are">
			{#each crumbs as crumb, i (crumb.href)}
				{#if i > 0}<span aria-hidden="true">/</span>{/if}
				<a href={crumb.href}>{crumb.label}</a>
			{/each}
		</nav>
	{/if}
	<h1 class="ar-title">{title}</h1>
	{#if lead}<p class="ar-lead">{lead}</p>{/if}
	{@render children()}
</main>
