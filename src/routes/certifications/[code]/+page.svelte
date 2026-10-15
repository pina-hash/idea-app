<script lang="ts">
	/**
	 * The certification page route (ledger 0391): the REAL `CertificationPage`
	 * over this route's load and three transports built on the browser client:
	 * form actions (`createActionPost`), browser RPCs (`rpcFrom`) and the
	 * evidence uploader. A refusal from a native (no script) post arrives as
	 * `form` and is handed to the page as the section it belongs to.
	 */
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import CertificationPage from '$lib/certifications/student/CertificationPage.svelte';
	import CertNotice from '$lib/certifications/student/CertNotice.svelte';
	import { createActionPost } from '$lib/certifications/student/action-post';
	import { rpcFrom } from '$lib/certifications/student/actions';
	import { createEvidenceUploader } from '$lib/certifications/student/evidence-upload';
	import { CERT_UNAVAILABLE_SENTENCE } from '$lib/certifications/student/shell';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const supabase = page.data.supabase;
	const post = supabase ? createActionPost() : null;
	const rpc = rpcFrom(supabase);
	const makeUploader = supabase ? (attemptId: string) => createEvidenceUploader(supabase, attemptId) : null;

	const refusal = $derived(form && !form.ok ? { section: form.section, message: form.message } : null);
	const topRefusal = $derived(refusal && (refusal.section === 'checklist' || refusal.section === 'catalog') ? refusal.message : null);
</script>

{#if data.unavailable || !data.cert}
	<CertNotice tone="quiet" title="Not available yet." testId="cert-unavailable">{CERT_UNAVAILABLE_SENTENCE}</CertNotice>
{:else}
	{#if topRefusal}
		<CertNotice tone="bad" testId="cert-form-refusal">{topRefusal}</CertNotice>
	{/if}
	<CertificationPage cert={data.cert} settings={data.settings} {post} {rpc} {makeUploader} {refusal} onchanged={() => void invalidateAll()} />
{/if}
