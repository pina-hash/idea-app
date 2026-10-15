<script lang="ts">
	import ReviewPanel from '$lib/certifications/desk/ReviewPanel.svelte';
	import { formFor } from '$lib/certifications/desk/desk';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

{#if data.unavailable || !data.submission || !data.attempt || !data.student}
	<p class="cert-notice cert-notice-quiet" data-testid="cert-not-available">
		<span class="cert-notice-glyph" aria-hidden="true">i</span>
		<span>This part of IDEA Certifications is not available yet.</span>
	</p>
{:else}
	<ReviewPanel
		submission={data.submission}
		student={data.student}
		certification={data.attempt.certification}
		spec={data.spec}
		checkout={data.checkout}
		result={formFor(form, 'decide')}
	/>
{/if}
