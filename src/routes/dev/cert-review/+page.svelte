<script lang="ts">
	/** /dev/cert-review: the real `ReviewPanel` over one fixture submission per `?state=`. */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import ReviewPanel from '$lib/certifications/desk/ReviewPanel.svelte';
	import '$lib/certifications/cert.css';
	import '$lib/certifications/desk/desk.css';
	import { ANA, BEN, CHECKOUT_SUBMISSION, DECIDED_SUBMISSION, GUIDED_SUBMISSION, MILL, PACKAGE_MILL, PICTURE_SRC } from '../cert-desk/fixtures';

	let { data }: { data: { state: 'guided' | 'checkout-video' | 'decided' } } = $props();

	const submission = $derived(data.state === 'guided' ? GUIDED_SUBMISSION : data.state === 'checkout-video' ? CHECKOUT_SUBMISSION : DECIDED_SUBMISSION);
	const student = $derived(data.state === 'guided' ? ANA : BEN);
	const spec = $derived(data.state === 'guided' ? PACKAGE_MILL.guided_project : data.state === 'decided' ? PACKAGE_MILL.autonomous_project : null);
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

<main class="cert-root harness" data-testid="cert-review-harness" data-state={data.state} data-cert-review-hydrated={hydrated ? 'yes' : 'no'}>
	{#key data.state}
		<ReviewPanel {submission} {student} certification={MILL} {spec} checkout={PACKAGE_MILL.checkout} evidenceSrc={() => PICTURE_SRC} action="#" />
	{/key}
</main>
