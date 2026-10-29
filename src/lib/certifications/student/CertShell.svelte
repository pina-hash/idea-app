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
	import AppSubNav from '$lib/shell/AppSubNav.svelte';
	import PageHeader from '$lib/shell/PageHeader.svelte';
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
	<!-- THE PORTAL'S PLACES ARE THE SITE'S ONE APP SUB-NAV (ledger 0468): the
	     four student pads, under the header rather than in it, then the page's
	     one header (eyebrow, title bar, meta line). -->
	<AppSubNav
		label="IDEA Certifications"
		testid="cert-tabs"
		items={STUDENT_TABS.map((tab) => ({ id: tab.id, label: tab.label, href: tab.href, current: current === tab.id }))}
	/>
	{#if crumbs.length > 0}
		<nav class="cert-crumbs" aria-label="Where you are">
			{#each crumbs as crumb, i (crumb.href)}
				{#if i > 0}<span aria-hidden="true">/</span>{/if}
				<a href={crumb.href}>{crumb.label}</a>
			{/each}
		</nav>
	{/if}
	<PageHeader {eyebrow} {title} meta={lead} />
	{@render children()}
</main>

<style>
	/* The bar's own layout: the mark and the keys (the places are the pads
	   under it, ledger 0468). Below 48rem the notifications key stacks its
	   word over its count so the row still fits. */
	.cert-header {
		row-gap: 0.5rem;
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
		.cert-notify-key {
			flex-direction: column;
			gap: 0.1rem;
			padding-inline: 0.7rem;
		}
	}
	@media (max-width: 479.98px) {
		.cert-notify-word {
			font-size: 0.7rem;
		}
	}
</style>
