<script lang="ts">
	/**
	 * `/certifications/certificate/[serial]` (ledger 0391, surface f): the
	 * printable certificate, inside the portal's shell (the layout mounts
	 * `CertShell` around every page). The page is `CertificatePage`, the same
	 * component `/dev/cert-certificate` mounts over a fixture.
	 */
	import CertificatePage from '$lib/certifications/certificate/CertificatePage.svelte';
	import CertNotice from '$lib/certifications/student/CertNotice.svelte';
	import { CERT_UNAVAILABLE_SENTENCE } from '$lib/certifications/student/shell';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

{#if data.unavailable || !data.record}
	<CertNotice tone="quiet" title="Not available yet." testId="cert-unavailable">{CERT_UNAVAILABLE_SENTENCE}</CertNotice>
{:else}
	<CertificatePage record={data.record} qrSrc={data.qrSrc} verifyUrl={data.verifyUrl} markSrc={data.markSrc} markSrcset={data.markSrcset} />
{/if}
