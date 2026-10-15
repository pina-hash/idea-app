<script lang="ts">
	/** /dev/cert-me: My certifications through the REAL `MyCertifications`, full or empty. */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import '$lib/certifications/cert.css';
	import CertShell from '$lib/certifications/student/CertShell.svelte';
	import MyCertifications from '$lib/certifications/student/MyCertifications.svelte';
	import { ME } from '../cert-certification/fixtures';

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

	const me = $derived(data.state === 'empty' ? { attempts: [], awards: [], notifications_unread: 0 } : ME);
</script>

<div data-cert-me-hydrated={hydrated ? 'yes' : undefined}>
	<CertShell title="My certifications" lead="What you have earned, what you are working on, and your history. Every award here resolves to a live, signed record you can print or verify.">
		<MyCertifications {me} />
	</CertShell>
</div>
