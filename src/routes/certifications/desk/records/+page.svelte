<script lang="ts">
	import RecordsPanel from '$lib/certifications/desk/RecordsPanel.svelte';
	import { PORTAL_NAME } from '$lib/certifications/copy';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Records, {PORTAL_NAME}</title></svelte:head>

<header class="cert-titlebar">
	<div>
		<p class="eyebrow cert-eyebrow">IDEA // Certifications</p>
		<h1 class="cert-title plate-title">Records</h1>
	</div>
</header>

{#if data.unavailable}
	<p class="cert-notice cert-notice-quiet" data-testid="cert-not-available">
		<span class="cert-notice-glyph" aria-hidden="true">i</span>
		<span>This part of IDEA Certifications is not available yet.</span>
	</p>
{:else}
	<RecordsPanel awards={data.awards} />
{/if}
