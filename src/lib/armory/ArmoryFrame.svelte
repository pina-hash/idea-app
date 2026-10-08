<script lang="ts">
	/**
	 * The frame every /armory page shares: the site header, the room wrapper,
	 * a breadcrumb, the page title. Armory is an app on the home launcher since
	 * ledger 0366, and the header's Set up key is the way to the guided setup
	 * from anywhere inside it.
	 *
	 * THE ROOM WEARS THE CLASSROOM'S PLATE PIECES (Mr. Pina's report of
	 * 2026-10-07, "the same design scheme that's used for IDEA Classroom"): the
	 * title is the plate's title bar between two hazard blocks (`.plate-title`)
	 * under the shared `.eyebrow`, which the plate sets in label caps.
	 *
	 * THE REPORT CONTROL IS DOCKED HERE (decision of 2026-10-07). The floating
	 * pill sat over Armory's own controls (the filter keys at 375, the Add
	 * people box at the foot of a 1440 window), so `/armory` is an exclusion in
	 * `$lib/feedback/context.ts` and this header mounts `SiteFeedback` at
	 * `place="relocated"` with the props ClassroomShell gives it. A relocation,
	 * never a deletion: every Armory page still reports its own defects.
	 *
	 * THE HEADER OUTRANKS `main`, AND THAT IS THE FIX FOR THE PROFILE MENU
	 * BEING COVERED (Mr. Pina's report of 2026-10-06). `src/app.css` gives
	 * `main` and `.app-header` both `position: relative; z-index: 1`, and `main`
	 * comes later, so it won the tie and painted over the profile panel the
	 * header drops below itself (CLAUDE.md, "A masthead dropdown needs the
	 * header to outrank `main`"). `.ar-header` raises the header to 2.
	 */
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { version as buildId } from '$app/environment';
	import { deploy } from 'virtual:site-versions';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import SiteFeedback from '$lib/feedback/SiteFeedback.svelte';
	import { feedbackIsAnonymous, feedbackWriter } from '$lib/feedback/feedback';
	import { describeBuild, REPORT_LABEL_SHORT } from '$lib/feedback/context';
	import './armory.css';

	let {
		title,
		crumbs = [],
		lead = null,
		eyebrow = 'IDEA // Armory',
		actions = null,
		children
	}: {
		title: string;
		crumbs?: Array<{ href: string; label: string }>;
		lead?: string | null;
		/** The label over the title bar. */
		eyebrow?: string;
		/** Controls beside the title. */
		actions?: Snippet | null;
		children: Snippet;
	} = $props();

	const feedbackBuild = describeBuild(deploy, buildId);
	const feedbackSubmit = $derived(feedbackWriter(page.data.supabase, page.data.claims?.sub));
	const feedbackAnonymous = $derived(feedbackIsAnonymous(page.data.supabase, page.data.claims?.sub));
</script>

<div class="app-header ar-header" data-testid="armory-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary ar-btn" href="/armory">Armory</a>
		<a class="btn secondary ar-btn" href="/armory/start">Set up</a>
		{#if feedbackSubmit}
			<span class="ar-report" data-testid="armory-report">
				<SiteFeedback
					place="relocated"
					label={REPORT_LABEL_SHORT}
					routeId={page.route.id}
					pathname={page.url.pathname}
					role={page.data.userProfile?.role ?? null}
					sectionId={null}
					build={feedbackBuild}
					submit={feedbackSubmit}
					anonymous={feedbackAnonymous}
				/>
			</span>
		{/if}
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
	<p class="eyebrow ar-eyebrow">{eyebrow}</p>
	<div class="ar-titlebar">
		<h1 class="ar-title plate-title">{title}</h1>
		{#if actions}<div class="ar-title-actions">{@render actions()}</div>{/if}
	</div>
	{#if lead}<p class="ar-lead">{lead}</p>{/if}
	{@render children()}
</main>
