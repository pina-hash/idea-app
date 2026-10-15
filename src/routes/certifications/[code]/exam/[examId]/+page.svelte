<script lang="ts">
	/**
	 * THE EXAM PAGE (ledger 0391, surface e): `ExamRunner` over a transport
	 * built on the caller's own browser client. The portal layout supplies the
	 * room (`.cert-root`, `cert.css`, the header); this page adds nothing to it
	 * but the runner. Every write the runner makes is a browser RPC on
	 * `page.data.supabase`, the client the root layout created, so `auth.uid()`
	 * inside `cert_exam_*` is the student's own.
	 */
	import { page } from '$app/state';
	import ExamRunner from '$lib/certifications/exam/ExamRunner.svelte';
	import { examTransportFrom, type ExamTransport } from '$lib/certifications/exam/exam-client';
	import { certHref } from '$lib/certifications/nav';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const transport = $derived.by((): ExamTransport | null => {
		const supabase = page.data.supabase;
		if (!supabase) return null;
		return examTransportFrom(async (fn, args) => {
			const { data: answer, error } = await supabase.rpc(fn, args);
			return { data: answer ?? null, error: error ? { message: error.message, code: error.code } : null };
		});
	});
</script>

{#if transport}
	<ExamRunner
		examId={data.examId}
		{transport}
		topicNames={data.topicNames}
		backHref={certHref(data.code)}
		backLabel="Back to {data.certName ?? data.code}"
	/>
{:else}
	<div class="cert-notice" role="status">
		<span class="cert-notice-glyph" aria-hidden="true">!</span>
		<div>The exam needs a signed-in session. Sign in and open this address again.</div>
	</div>
{/if}
