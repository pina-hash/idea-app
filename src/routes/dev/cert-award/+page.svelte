<script lang="ts">
	/** /dev/cert-award: the real `AwardPanel` over one fixture attempt per `?state=`, with an in-memory award transport. */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import AwardPanel from '$lib/certifications/desk/AwardPanel.svelte';
	import { CERT_SIGNING_UNSET_MESSAGE } from '$lib/certifications/copy';
	import { certificateHref } from '$lib/certifications/nav';
	import type { AwardAnswer } from '$lib/certifications/desk/desk';
	import '$lib/certifications/cert.css';
	import '$lib/certifications/desk/desk.css';
	import { ATTEMPT_IN_PROGRESS, ATTEMPT_READY, AWARD_RECORD, BEN, ANA, PINA } from '../cert-desk/fixtures';

	type State = 'locked' | 'ready' | 'confirm' | 'refused-unsigned' | 'refused-self';
	let { data }: { data: { state: State } } = $props();

	const locked = $derived(data.state === 'locked');
	const attempt = $derived(locked ? ATTEMPT_IN_PROGRESS : ATTEMPT_READY);
	const student = $derived(locked ? ANA : BEN);
	const record = $derived(locked ? null : AWARD_RECORD);
	const refusal = $derived(locked ? { reason: 'incomplete', message: 'Not every required part is checked.' } : null);
	const callerEmail = $derived(data.state === 'refused-self' ? BEN.email : PINA.email);
	const openOnMount = $derived(data.state === 'confirm' || data.state === 'refused-unsigned');
	const initialProblem = $derived(data.state === 'refused-unsigned' ? CERT_SIGNING_UNSET_MESSAGE : null);

	let awards = $state<string[]>([]);
	async function award(attemptId: string): Promise<AwardAnswer> {
		awards = [...awards, attemptId];
		if (data.state === 'refused-unsigned') return { ok: false, message: CERT_SIGNING_UNSET_MESSAGE };
		return { ok: true, certificate_href: certificateHref('IDEA-7K3Q-M9XD-2HTR-W4PB') };
	}

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
</script>

<main class="cert-root harness" data-testid="cert-award-harness" data-state={data.state} data-awards={awards.length} data-cert-award-hydrated={hydrated ? 'yes' : 'no'}>
	{#key data.state}
		<AwardPanel {attempt} {student} {record} {refusal} {callerEmail} {openOnMount} {initialProblem} {award} />
	{/key}
</main>
