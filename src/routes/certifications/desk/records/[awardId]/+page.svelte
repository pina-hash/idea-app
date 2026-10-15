<script lang="ts">
	import RecordDetail from '$lib/certifications/desk/RecordDetail.svelte';
	import { formFor } from '$lib/certifications/desk/desk';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

{#if data.unavailable || !data.award}
	<p class="cert-notice cert-notice-quiet" data-testid="cert-not-available">
		<span class="cert-notice-glyph" aria-hidden="true">i</span>
		<span>This part of IDEA Certifications is not available yet.</span>
	</p>
{:else}
	<RecordDetail award={data.award} isAdmin={data.isAdmin} actionResult={formFor(form, 'action')} />
{/if}
