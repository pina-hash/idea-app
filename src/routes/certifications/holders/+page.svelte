<script lang="ts">
	import CertNotice from '$lib/certifications/student/CertNotice.svelte';
	import HoldersBoard from '$lib/certifications/student/HoldersBoard.svelte';
	import { CERT_UNAVAILABLE_SENTENCE } from '$lib/certifications/student/shell';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

{#if data.unavailable}
	<CertNotice tone="quiet" title="Not available yet." testId="cert-unavailable">{CERT_UNAVAILABLE_SENTENCE}</CertNotice>
{:else}
	<HoldersBoard holders={data.holders} />
{/if}
