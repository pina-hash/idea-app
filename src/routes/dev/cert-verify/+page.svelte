<script lang="ts">
	/**
	 * /dev/cert-verify: the public verify page in every state, through the REAL
	 * `VerifyPage`. The view is handed in directly (the route decides it on the
	 * server from `cert_verify` and the signature check); a harness has no
	 * database, so each state is the view the route would have built.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import '$lib/certifications/cert.css';
	import CertShell from '$lib/certifications/student/CertShell.svelte';
	import VerifyPage from '$lib/certifications/student/VerifyPage.svelte';
	import type { VerifyView } from '$lib/certifications/student/verify';
	import { VERIFY_RECORD } from '../cert-certification/fixtures';

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

	const SERIAL = VERIFY_RECORD.signed_payload.serial;
	const STATES = ['valid', 'suspended', 'revoked', 'expired', 'none', 'limited', 'idle'] as const;
	type State = (typeof STATES)[number];
	function viewOf(s: State): VerifyView {
		switch (s) {
			case 'valid':
				return { state: 'valid', serial: SERIAL, typed: 'idea 7k3q m9xd 2htr w4pb', record: VERIFY_RECORD };
			case 'suspended':
				return { state: 'suspended', serial: SERIAL, typed: SERIAL, record: { ...VERIFY_RECORD, status: 'suspended' } };
			case 'revoked':
				return { state: 'revoked', serial: SERIAL, typed: SERIAL, record: { ...VERIFY_RECORD, status: 'revoked' } };
			case 'expired':
				return { state: 'expired', serial: SERIAL, typed: SERIAL, record: { ...VERIFY_RECORD, code: 'SAFE-1', name: 'Shop Safety', category: 'Safety', status: 'expired', expires_at: '2026-08-17T07:00:00Z' } };
			case 'none':
				return { state: 'none', serial: 'IDEA-AAAA-BBBB-CCCC-DDDD', typed: 'IDEA-AAAA-BBBB-CCCC-DDDD', record: null };
			case 'limited':
				return { state: 'limited', serial: SERIAL, typed: SERIAL, record: null };
			case 'idle':
				return { state: 'idle', serial: null, typed: '', record: null };
		}
	}
	const single = $derived(STATES.find((s) => s === data.state) ?? null);
</script>

<div data-cert-verify-hydrated={hydrated ? 'yes' : undefined}>
	<CertShell title="Verify a certificate" lead="Every IDEA certificate carries a serial and a QR code. Type the serial and this page reads the live, signed record. It shows that one certificate and nothing else.">
		{#if single}
			<VerifyPage view={viewOf(single)} />
		{:else}
			{#each STATES as s (s)}
				<section data-view={s} style="margin-bottom: 3rem">
					<p class="cert-crumbs">State: {s}</p>
					<VerifyPage view={viewOf(s)} />
				</section>
			{/each}
		{/if}
	</CertShell>
</div>
