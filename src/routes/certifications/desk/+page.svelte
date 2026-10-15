<script lang="ts">
	import DeskQueue from '$lib/certifications/desk/DeskQueue.svelte';
	import Telemetry from '$lib/certifications/desk/Telemetry.svelte';
	import TelemetryTiles from '$lib/certifications/desk/TelemetryTiles.svelte';
	import { PORTAL_NAME } from '$lib/certifications/copy';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Desk, {PORTAL_NAME}</title></svelte:head>

<header class="cert-titlebar">
	<div>
		<p class="eyebrow cert-eyebrow">IDEA // Certifications</p>
		<h1 class="cert-title plate-title">Desk</h1>
	</div>
</header>

{#if data.deskUnavailable}
	<p class="cert-notice cert-notice-quiet" data-testid="cert-not-available">
		<span class="cert-notice-glyph" aria-hidden="true">i</span>
		<span>This part of IDEA Certifications is not available yet.</span>
	</p>
{:else}
	<DeskQueue desk={data.desk} />
	<TelemetryTiles desk={data.desk} telemetry={data.telemetry} />
	{#if data.telemetryUnavailable}
		<p class="cert-notice cert-notice-quiet" data-testid="cert-telemetry-not-available">
			<span class="cert-notice-glyph" aria-hidden="true">i</span>
			<span>Telemetry is not available yet.</span>
		</p>
	{:else}
		<Telemetry telemetry={data.telemetry} />
	{/if}
{/if}
