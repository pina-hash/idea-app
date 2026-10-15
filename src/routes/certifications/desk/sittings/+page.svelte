<script lang="ts">
	import SittingsPanel from '$lib/certifications/desk/SittingsPanel.svelte';
	import { formFor } from '$lib/certifications/desk/desk';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

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
