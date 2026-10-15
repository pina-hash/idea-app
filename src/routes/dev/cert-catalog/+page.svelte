<script lang="ts">
	/**
	 * /dev/cert-catalog: the catalog in every state, through the REAL
	 * components. `?state=empty|full|locked` shows one; no query stacks all
	 * three under `[data-view]`. `?theme=space-white|matrix` forces the site
	 * theme the way /dev/armory does: a harness holds no session, so the theme
	 * root decides "none" here and the attribute is the only way to measure a
	 * twin. The in-memory `post` refuses LATHE-1 so the card's refusal renders.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import '$lib/certifications/cert.css';
	import CertShell from '$lib/certifications/student/CertShell.svelte';
	import CatalogGrid from '$lib/certifications/student/CatalogGrid.svelte';
	import type { CertActionPost } from '$lib/certifications/student/actions';
	import { CATALOG, CATALOG_LOCKED, SERIALS } from '../cert-certification/fixtures';

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

	const STATES = ['empty', 'full', 'locked'] as const;
	type State = (typeof STATES)[number];
	const itemsOf = (s: State) => (s === 'empty' ? [] : s === 'locked' ? CATALOG_LOCKED : CATALOG);
	const serialsOf = (s: State) => (s === 'full' ? SERIALS : {});

	const post: CertActionPost = async (action, fields) => {
		await new Promise((r) => setTimeout(r, 150));
		if (action === 'start' && fields.code === 'LATHE-1') {
			return { ok: false, message: 'Shop Safety expired on August 17, 2026. Retake SAFE-1 first, then start this one.', reason: 'locked' };
		}
		return { ok: true };
	};

	const single = $derived(STATES.find((s) => s === data.state) ?? null);
</script>

<div data-cert-catalog-hydrated={hydrated ? 'yes' : undefined}>
	<CertShell title="Certifications" lead="Proof that you can do it alone. Every published certification, grouped by category." isCertifier={single === 'full' || single === null}>
		{#if single}
			<CatalogGrid items={itemsOf(single)} serials={serialsOf(single)} {post} />
		{:else}
			{#each STATES as s (s)}
				<section data-view={s} style="margin-bottom: 3rem">
					<p class="cert-crumbs">State: {s}</p>
					<CatalogGrid items={itemsOf(s)} serials={serialsOf(s)} {post} />
				</section>
			{/each}
		{/if}
	</CertShell>
</div>
