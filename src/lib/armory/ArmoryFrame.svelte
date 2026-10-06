<script lang="ts">
	/**
	 * The frame every /armory page shares: the site header, the room wrapper,
	 * a breadcrumb, the page title. Armory is an app on the home launcher since
	 * ledger 0366, and the header's Set up key is the way to the guided setup
	 * from anywhere inside it.
	 *
	 * THE HEADER OUTRANKS `main`, AND THAT IS THE FIX FOR THE PROFILE MENU
	 * BEING COVERED (Mr. Pina's report of 2026-10-06). `src/app.css` gives
	 * `main` and `.app-header` both `position: relative; z-index: 1`, and `main`
	 * comes later, so it won the tie and painted over the profile panel the
	 * header drops below itself (CLAUDE.md, "A masthead dropdown needs the
	 * header to outrank `main`"). `.ar-header` raises the header to 2.
	 */
	import type { Snippet } from 'svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import './armory.css';

	let {
		title,
		crumbs = [],
		lead = null,
		actions = null,
		children
	}: {
		title: string;
		crumbs?: Array<{ href: string; label: string }>;
		lead?: string | null;
		/** Controls beside the title (a mentor's Rename and Archive). */
		actions?: Snippet | null;
		children: Snippet;
	} = $props();
</script>

<div class="app-header ar-header" data-testid="armory-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary ar-btn" href="/armory">Armory</a>
		<a class="btn secondary ar-btn" href="/armory/start">Set up</a>
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
	<div class="ar-titlebar">
		<h1 class="ar-title">{title}</h1>
		{#if actions}<div class="ar-title-actions">{@render actions()}</div>{/if}
	</div>
	{#if lead}<p class="ar-lead">{lead}</p>{/if}
	{@render children()}
</main>
