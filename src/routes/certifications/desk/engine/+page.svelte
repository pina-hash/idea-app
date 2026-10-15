<script lang="ts">
	import EngineList from '$lib/certifications/desk/EngineList.svelte';
	import { formFor } from '$lib/certifications/desk/desk';
	import { PORTAL_NAME } from '$lib/certifications/copy';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Engine, {PORTAL_NAME}</title></svelte:head>

<header class="cert-titlebar">
	<div>
		<p class="eyebrow cert-eyebrow">IDEA // Certifications</p>
		<h1 class="cert-title plate-title">Engine</h1>
	</div>
</header>

{#if data.unavailable}
	<p class="cert-notice cert-notice-quiet" data-testid="cert-not-available">
		<span class="cert-notice-glyph" aria-hidden="true">i</span>
		<span>This part of IDEA Certifications is not available yet.</span>
	</p>
{:else}
	<EngineList rows={data.rows} isAdmin={data.isAdmin} settings={data.settings} createResult={formFor(form, 'create')} settingsResult={formFor(form, 'settings')} />
{/if}
