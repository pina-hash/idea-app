<script lang="ts">
	import { page } from '$app/state';
	import CertNotice from '$lib/certifications/student/CertNotice.svelte';
	import NotificationsList from '$lib/certifications/student/NotificationsList.svelte';
	import { createActionPost } from '$lib/certifications/student/action-post';
	import { CERT_UNAVAILABLE_SENTENCE } from '$lib/certifications/student/shell';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	/* `createActionPost` invalidates every load after a landed write, which is
	   what moves the badge in the profile menu and the shell's key. */
	const post = page.data.supabase ? createActionPost() : null;
</script>

{#if data.unavailable}
	<CertNotice tone="quiet" title="Not available yet." testId="cert-unavailable">{CERT_UNAVAILABLE_SENTENCE}</CertNotice>
{:else}
	{#if form && !form.ok}
		<CertNotice tone="bad" testId="cert-form-refusal">{form.message}</CertNotice>
	{/if}
	<NotificationsList rows={data.rows} {post} />
{/if}
