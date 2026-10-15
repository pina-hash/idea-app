<script lang="ts">
	import { page } from '$app/state';
	import CatalogGrid from '$lib/certifications/student/CatalogGrid.svelte';
	import CertNotice from '$lib/certifications/student/CertNotice.svelte';
	import { createActionPost } from '$lib/certifications/student/action-post';
	import { CERT_UNAVAILABLE_SENTENCE } from '$lib/certifications/student/shell';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const post = page.data.supabase ? createActionPost() : null;
</script>

{#if data.unavailable}
	<CertNotice tone="quiet" title="Not available yet." testId="cert-unavailable">{CERT_UNAVAILABLE_SENTENCE}</CertNotice>
{:else}
	{#if form && !form.ok}
		<!-- The no-script path: a refusal from a native post, rendered where the catalog is. -->
		<CertNotice tone="bad" testId="cert-form-refusal">{form.message}</CertNotice>
	{/if}
	<CatalogGrid items={data.items} serials={data.serials} {post} />
{/if}
