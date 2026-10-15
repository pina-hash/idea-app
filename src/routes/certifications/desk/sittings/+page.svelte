<script lang="ts">
	import SittingsPanel from '$lib/certifications/desk/SittingsPanel.svelte';
	import { formFor } from '$lib/certifications/desk/desk';
	import { PORTAL_NAME } from '$lib/certifications/copy';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Sittings, {PORTAL_NAME}</title></svelte:head>

<header class="cert-titlebar">
	<div>
		<p class="eyebrow cert-eyebrow">IDEA // Certifications</p>
		<h1 class="cert-title plate-title">Sittings</h1>
	</div>
</header>

{#if data.unavailable}
	<p class="cert-notice cert-notice-quiet" data-testid="cert-not-available">
		<span class="cert-notice-glyph" aria-hidden="true">i</span>
		<span>This part of IDEA Certifications is not available yet.</span>
	</p>
{:else}
	<SittingsPanel
		sittings={data.sittings}
		requests={data.requests}
		seats={data.seats}
		settings={data.settings}
		isAdmin={data.isAdmin}
		certifications={data.certifications}
		postResult={formFor(form, 'post')}
		cancelResult={formFor(form, 'cancel')}
		decideResult={formFor(form, 'decide')}
		releaseResult={formFor(form, 'release')}
	/>
{/if}
