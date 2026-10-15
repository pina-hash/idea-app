<script lang="ts">
	import AuthorityGrid from '$lib/certifications/desk/AuthorityGrid.svelte';
	import { formFor } from '$lib/certifications/desk/desk';
	import { PORTAL_NAME } from '$lib/certifications/copy';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const result = $derived(formFor(form, 'grant') ?? formFor(form, 'revoke'));
</script>

<svelte:head><title>Authority, {PORTAL_NAME}</title></svelte:head>

<header class="cert-titlebar">
	<div>
		<p class="eyebrow cert-eyebrow">IDEA // Certifications</p>
		<h1 class="cert-title plate-title">Authority</h1>
	</div>
</header>

{#if data.unavailable}
	<p class="cert-notice cert-notice-quiet" data-testid="cert-not-available">
		<span class="cert-notice-glyph" aria-hidden="true">i</span>
		<span>This part of IDEA Certifications is not available yet.</span>
	</p>
{:else}
	<AuthorityGrid grants={data.grants} certifications={data.certifications} {result} />
{/if}
