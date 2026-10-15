<script lang="ts">
	/** /dev/cert-telemetry: the real tiles and charts over fixtures. */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Telemetry from '$lib/certifications/desk/Telemetry.svelte';
	import TelemetryTiles from '$lib/certifications/desk/TelemetryTiles.svelte';
	import '$lib/certifications/cert.css';
	import '$lib/certifications/desk/desk.css';
	import { DESK_BUSY, DESK_EMPTY, TELEMETRY_DATA, TELEMETRY_EMPTY } from '../cert-desk/fixtures';

	let { data }: { data: { state: 'empty' | 'data' } } = $props();
	const desk = $derived(data.state === 'data' ? DESK_BUSY : DESK_EMPTY);
	const telemetry = $derived(data.state === 'data' ? TELEMETRY_DATA : TELEMETRY_EMPTY);
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

<main class="cert-root harness" data-testid="cert-telemetry-harness" data-state={data.state} data-cert-telemetry-hydrated={hydrated ? 'yes' : 'no'}>
	<header class="cert-titlebar"><div><p class="eyebrow cert-eyebrow">IDEA // Certifications</p><h1 class="cert-title plate-title">Telemetry</h1></div></header>
	<TelemetryTiles {desk} {telemetry} />
	<Telemetry {telemetry} />
</main>
