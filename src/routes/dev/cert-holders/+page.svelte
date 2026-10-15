<script lang="ts">
	/** /dev/cert-holders: the holders board through the REAL `HoldersBoard`, by certification, by person, and empty. */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import '$lib/certifications/cert.css';
	import CertShell from '$lib/certifications/student/CertShell.svelte';
	import HoldersBoard from '$lib/certifications/student/HoldersBoard.svelte';
	import { HOLDERS_SENTENCE } from '$lib/certifications/copy';
	import { HOLDERS } from '../cert-certification/fixtures';

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

	const STATES = ['by-cert', 'by-person', 'empty'] as const;
	type State = (typeof STATES)[number];
	const EMPTY = { by_certification: [], by_person: [] };
	const single = $derived(STATES.find((s) => s === data.state) ?? null);
</script>

{#snippet board(s: State)}
	<HoldersBoard holders={s === 'empty' ? EMPTY : HOLDERS} initialView={s === 'by-person' ? 'person' : 'certification'} />
{/snippet}

<div data-cert-holders-hydrated={hydrated ? 'yes' : undefined}>
	<CertShell title="Holders" lead={HOLDERS_SENTENCE}>
		{#if single}
			{@render board(single)}
		{:else}
			{#each STATES as s (s)}
				<section data-view={s} style="margin-bottom: 3rem">
					<p class="cert-crumbs">State: {s}</p>
					{@render board(s)}
				</section>
			{/each}
		{/if}
	</CertShell>
</div>
