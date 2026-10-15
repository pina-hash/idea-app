<script lang="ts">
	/**
	 * /dev/cert-certification: the certification page in every state, through
	 * the REAL `CertificationPage` (checklist, kit, forms, exam section) over
	 * `fixtures.ts`. Transports are in memory: `post` answers every action ok
	 * after a beat (and refuses a seat request with no sitting so the exam
	 * section's refusal renders), `rpc` answers a watch report with 47%
	 * coverage and a lesson completion, and the uploader lands any file after a
	 * beat except one whose name says `refuse`, which is refused for size so
	 * the uploader's own refusal row renders. Each stacked state carries its
	 * own anchor prefix (`kit-<state>`) so two pages never share an id.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import '$lib/certifications/cert.css';
	import CertShell from '$lib/certifications/student/CertShell.svelte';
	import CertificationPage from '$lib/certifications/student/CertificationPage.svelte';
	import type { CertActionPost, CertRpc } from '$lib/certifications/student/actions';
	import type { EvidenceUploader } from '$lib/certifications/student/evidence-upload';
	import { ATTEMPT_ID, certFor, PAGE_STATES, SETTINGS, type PageState } from './fixtures';

	let { data }: { data: { state: string | null } } = $props();

	let hydrated = $state(false);
	onMount(() => (hydrated = true));

	const themeParam = page.url.searchParams.get('theme');
	$effect(() => {
		if (themeParam !== 'space-white' && themeParam !== 'matrix') return;
		const el = document.documentElement;
		const apply = () => el.setAttribute('data-theme', themeParam);
		apply();
		const t = setTimeout(apply, 0);
		return () => {
			clearTimeout(t);
			el.removeAttribute('data-theme');
		};
	});

	const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
	let log = $state<string[]>([]);

	const post: CertActionPost = async (action, fields) => {
		await delay(150);
		log = [...log, `${action} ${JSON.stringify(fields)}`];
		if (action === 'requestSeat' && !fields.sitting_id) {
			return { ok: false, message: 'You already have a seat request open. Cancel it before asking for another.', reason: 'seat_open' };
		}
		return { ok: true };
	};
	const rpc: CertRpc = async (fn, args) => {
		await delay(120);
		log = [...log, `${fn} ${JSON.stringify(args ?? {})}`];
		if (fn === 'cert_watch_report') return { data: { ok: true, covered_seconds: 300, coverage: 0.47, complete: false, training_done: false }, error: null };
		if (fn === 'cert_lesson_complete') return { data: { ok: true, training_done: false }, error: null };
		return { data: { ok: true }, error: null };
	};
	const makeUploader = (attemptId: string): EvidenceUploader => async (file) => {
		await delay(200);
		if (/refuse/i.test(file.name)) {
			return { ok: false, message: 'That file is 61.0 MB, and the limit is 50 MB. Nothing about retrying will change that: split it, zip it, or link to it instead.', retryable: false };
		}
		return { ok: true, file: { path: `${attemptId}/${crypto.randomUUID()}.jpg`, name: file.name, size: file.size } };
	};
	void ATTEMPT_ID;

	const single = $derived(PAGE_STATES.find((s) => s === data.state) ?? null);
	const title = (s: PageState) => `${certFor(s).name}`;
</script>

<div data-cert-certification-hydrated={hydrated ? 'yes' : undefined}>
	{#if single}
		<CertShell title={title(single)} eyebrow="IDEA // Certifications // MILL-1" lead={certFor(single).definition} crumbs={[{ href: '/dev/cert-catalog', label: 'Certifications' }]}>
			<CertificationPage cert={certFor(single)} settings={SETTINGS} anchorPrefix="kit" {post} {rpc} {makeUploader} onchanged={() => (log = [...log, 'onchanged'])} />
		</CertShell>
	{:else}
		<CertShell title="Certification page harness" lead="Every state, stacked. Add ?state=<name> for one state in its real frame.">
			{#each PAGE_STATES as s (s)}
				<section data-view={s} style="margin-bottom: 3rem">
					<p class="cert-crumbs">State: {s}</p>
					<CertificationPage cert={certFor(s)} settings={SETTINGS} anchorPrefix={`kit-${s}`} {post} {rpc} {makeUploader} onchanged={() => (log = [...log, `onchanged ${s}`])} />
				</section>
			{/each}
		</CertShell>
	{/if}
	<ol class="cert-harness-log" data-testid="cert-harness-log" aria-label="What the harness recorded">
		{#each log as line, i (i)}<li>{line}</li>{/each}
	</ol>
</div>

<style>
	.cert-harness-log {
		margin: 0 auto 2rem;
		max-width: 60rem;
		padding: 0 1rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2);
	}
</style>
