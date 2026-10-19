<script lang="ts">
	/**
	 * THE PORTAL'S LAYOUT (ledger 0391): the room stylesheet, `CertShell`
	 * around every page, and for a signed-out visitor on any path but the
	 * public verify page, the sign-in panel in place of the page (the Armory's
	 * shape: sign in, come back to the same address).
	 *
	 * The page's title, eyebrow, lead and crumbs are read off `page.data.shell`,
	 * which each page's load returns, because the shell is mounted once here
	 * and a page cannot pass it props.
	 */
	import type { Snippet } from 'svelte';
	import '$lib/certifications/cert.css';
	import { page } from '$app/state';
	import { CERT_PATHS, isDeskPath } from '$lib/certifications/nav';
	import { PORTAL_NAME } from '$lib/certifications/copy';
	import CertShell from '$lib/certifications/student/CertShell.svelte';
	import CertSignIn from '$lib/certifications/student/CertSignIn.svelte';
	import { shellOf } from '$lib/certifications/student/shell';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const shell = $derived(shellOf(page.data as Record<string, unknown>));
	const pathname = $derived(page.url.pathname);
	const isVerify = $derived(pathname === CERT_PATHS.verify || pathname.startsWith(`${CERT_PATHS.verify}/`));
	const needsSignIn = $derived(!data.signedIn && !isVerify);
	const docTitle = $derived(shell.title === PORTAL_NAME ? PORTAL_NAME : `${shell.title} · ${PORTAL_NAME}`);

	/** The site's normal Google sign-in, coming back to this page, query string included. */
	async function signIn() {
		const supabase = page.data.supabase;
		if (!supabase || typeof window === 'undefined') return;
		const next = window.location.pathname + window.location.search;
		await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
				queryParams: { prompt: 'select_account' }
			}
		});
	}
</script>

<svelte:head><title>{docTitle}</title></svelte:head>

<CertShell title={shell.title} eyebrow={shell.eyebrow} lead={shell.lead} crumbs={shell.crumbs} isCertifier={data.isCertifier} console={isDeskPath(pathname)}>
	{#if needsSignIn}
		<CertSignIn onSignIn={page.data.supabase ? signIn : null} />
	{:else}
		{@render children()}
	{/if}
</CertShell>
