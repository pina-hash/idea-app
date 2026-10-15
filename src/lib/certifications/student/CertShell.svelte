<script lang="ts">
	/**
	 * THE PORTAL'S OWN CHROME (ledger 0391, DECISIONS D14), the Armory frame's
	 * shape: the IDEA mark, the four student tabs, a Desk key for a certifier,
	 * the notifications key with its unread count, and the `ProfileMenu`, over
	 * the site plate; then the page's eyebrow, title bar and lead. It is not a
	 * page inside the classroom shell, per the spec.
	 *
	 * STICKY, AND IT OUTRANKS `main`: `cert.css` pins `.app-header.cert-header`
	 * with an opaque ground and `z-index: 2`, so the dropdowns the header drops
	 * paint over the page and an anchored section lands below the bar
	 * (`scroll-margin-top` on every `[id]` in the room).
	 *
	 * The notifications count is the root layout's own `certUnread` (a number,
	 * or null for "cannot tell", which draws no count): nothing here fetches.
	 * `isCertifier` is the certifications layout's answer to
	 * `cert_is_certifier`, handed in as a prop so a harness can set it.
	 */
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import { CERT_PATHS, STUDENT_TABS, studentTabFor } from '$lib/certifications/nav';
	import { CERT_EYEBROW, type CertCrumb } from './shell';

	let {
		title,
		eyebrow = CERT_EYEBROW,
		lead = null,
		crumbs = [],
		isCertifier = false,
		console: isConsole = false,
		children
	}: {
		title: string;
		eyebrow?: string;
		lead?: string | null;
		crumbs?: CertCrumb[];
		isCertifier?: boolean;
		/** A desk console takes the whole window (`cert.css`'s `.cert-console`). */
		console?: boolean;
		children: Snippet;
	} = $props();

	const current = $derived(studentTabFor(page.url.pathname));
	const unread = $derived.by(() => {
		const n = (page.data as { certUnread?: unknown }).certUnread;
		return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
	});
	const unreadWords = $derived(unread > 99 ? '99+' : String(unread));
</script>

<div class="app-header cert-header" data-testid="cert-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<nav class="cert-tabs cert-nav" aria-label="IDEA Certifications" data-testid="cert-tabs">
		{#each STUDENT_TABS as tab (tab.id)}
			<a class="cert-tab" href={tab.href} aria-current={current === tab.id ? 'page' : undefined} data-tab={tab.id}>{tab.label}</a>
		{/each}
	</nav>
	<div class="header-right cert-header-right">
		{#if isCertifier}
			<a class="btn secondary cert-btn" href={CERT_PATHS.desk} data-testid="cert-desk-key">Desk</a>
		{/if}
		<a
			class="btn secondary cert-btn cert-notify-key"
			href={CERT_PATHS.notifications}
			data-testid="cert-notifications-key"
			aria-label={unread > 0 ? `Notifications, ${unreadWords} new` : 'Notifications'}
		>
			<span class="cert-notify-word">Notifications</span>
			{#if unread > 0}
				<span class="cert-readout is-ok cert-notify-count" data-testid="cert-unread-count">{unreadWords} new</span>
			{/if}
		</a>
		<ProfileMenu />
	</div>
</div>

<main class="cert-root" class:cert-console={isConsole} data-testid="cert-root">
	{#if crumbs.length > 0}
		<nav class="cert-crumbs" aria-label="Where you are">
			{#each crumbs as crumb, i (crumb.href)}
				{#if i > 0}<span aria-hidden="true">/</span>{/if}
				<a href={crumb.href}>{crumb.label}</a>
			{/each}
		</nav>
	{/if}
	<p class="eyebrow cert-eyebrow">{eyebrow}</p>
	<div class="cert-titlebar">
		<h1 class="cert-title plate-title">{title}</h1>
	</div>
	{#if lead}<p class="cert-lead">{lead}</p>{/if}
	{@render children()}
</main>

<style>
	/* The bar's own layout: mark, tabs, keys. The tabs take the middle and wrap;
	   below 48rem the keys drop under the mark and the tabs take a full line,
	   two to a line at a phone's width (cert.css sizes the pads). */
	.cert-header {
		row-gap: 0.5rem;
	}
	.cert-nav {
		margin: 0;
		flex: 1 1 auto;
		min-width: 0;
	}
	.cert-header-right {
		gap: 0.6rem;
	}
	.cert-notify-key {
		gap: 0.45rem;
	}
	.cert-notify-count {
		min-height: 1.4rem;
		padding: 0 0.45rem;
	}
	@media (max-width: 47.98rem) {
		.cert-nav {
			order: 3;
			flex-basis: 100%;
		}
		.cert-notify-key {
			flex-direction: column;
			gap: 0.1rem;
			padding-inline: 0.7rem;
		}
	}
	@media (max-width: 479.98px) {
		.cert-nav {
			display: grid;
			grid-template-columns: 1fr 1fr;
		}
		.cert-nav :global(.cert-tab) {
			justify-content: center;
			min-width: 0;
		}
		.cert-notify-word {
			font-size: 0.7rem;
		}
	}
</style>
