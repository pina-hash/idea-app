<script lang="ts">
	/**
	 * /dev/cert-certificate: the printable certificate in every state, through
	 * the REAL `CertificatePage` (the same component the route mounts), inside
	 * the portal's own `CertShell`. The QR codes are real, drawn by the server
	 * load with the same `qrSvgDataUrl` the route uses.
	 *
	 * `?theme=space-white|matrix` forces the site theme the way /dev/armory
	 * does: the sheet is paper and does not follow it, which is the thing the
	 * Space White spec measures; the chrome around it does.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import '$lib/certifications/cert.css';
	import CertificatePage from '$lib/certifications/certificate/CertificatePage.svelte';
	import CertShell from '$lib/certifications/student/CertShell.svelte';
	import { CERT_EYEBROW } from '$lib/certifications/student/shell';
	import type { CertificateJson } from '$lib/certifications/types';
	import type { CertificateState } from './fixtures';

	let {
		data
	}: {
		data: {
			state: CertificateState | null;
			views: { state: CertificateState; record: CertificateJson; verifyUrl: string; qrSrc: string }[];
			markSrc: string;
			markSrcset: string;
		};
	} = $props();

	let hydrated = $state(false);
	onMount(() => (hydrated = true));

	const themeParam = page.url.searchParams.get('theme');
	$effect(() => {
		if (themeParam !== 'space-white' && themeParam !== 'matrix') return;
		const el = document.documentElement;
		const apply = () => el.setAttribute('data-theme', themeParam);
		apply();
		const t = setTimeout(apply, 0);
		return () => {
			clearTimeout(t);
			el.removeAttribute('data-theme');
		};
	});

	const single = $derived(data.state ? (data.views.find((v) => v.state === data.state) ?? null) : null);
	const eyebrow = $derived(single ? `${CERT_EYEBROW} // ${single.record.code}` : CERT_EYEBROW);
</script>

<div data-cert-certificate-hydrated={hydrated ? 'yes' : undefined} data-testid="cert-certificate-harness">
	<CertShell title="Certificate" {eyebrow} crumbs={[{ href: '/certifications', label: 'Certifications' }, { href: '/certifications/me', label: 'My certifications' }]}>
		{#if single}
			<CertificatePage record={single.record} qrSrc={single.qrSrc} verifyUrl={single.verifyUrl} markSrc={data.markSrc} markSrcset={data.markSrcset} />
		{:else}
			{#each data.views as view (view.state)}
				<section data-view={view.state} style="margin-bottom: 3rem">
					<p class="cert-crumbs">State: {view.state}</p>
					<CertificatePage record={view.record} qrSrc={view.qrSrc} verifyUrl={view.verifyUrl} markSrc={data.markSrc} markSrcset={data.markSrcset} />
				</section>
			{/each}
		{/if}
	</CertShell>
</div>
