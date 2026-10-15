<script lang="ts">
	import AwardPanel from '$lib/certifications/desk/AwardPanel.svelte';
	import { PORTAL_NAME } from '$lib/certifications/copy';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>{data.title}, {PORTAL_NAME}</title></svelte:head>

{#if data.unavailable || !data.attempt || !data.student}
	<p class="cert-notice cert-notice-quiet" data-testid="cert-not-available">
		<span class="cert-notice-glyph" aria-hidden="true">i</span>
		<span>This part of IDEA Certifications is not available yet.</span>
	</p>
{:else}
	<AwardPanel attempt={data.attempt} student={data.student} record={data.record} refusal={data.refusal} callerEmail={data.callerEmail} />
{/if}
