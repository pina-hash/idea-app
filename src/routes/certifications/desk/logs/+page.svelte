<script lang="ts">
	import LogsPanel from '$lib/certifications/desk/LogsPanel.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

{#if data.unavailable}
	<p class="cert-notice cert-notice-quiet" data-testid="cert-not-available">
		<span class="cert-notice-glyph" aria-hidden="true">i</span>
		<span>This part of IDEA Certifications is not available yet.</span>
	</p>
{:else}
	<LogsPanel sync={data.sync} audit={data.audit} errors={data.errors} events={data.events} isAdmin={data.isAdmin} today={data.today} />
{/if}
