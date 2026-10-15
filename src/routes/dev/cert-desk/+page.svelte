<script lang="ts">
	/**
	 * /dev/cert-desk: the desk's tab strip and search (the real desk layout
	 * component), the queue, the tiles and the telemetry, over fixtures.
	 * `?theme=space-white|matrix` forces the site theme the way /dev/armory
	 * does, because a harness holds no session and the attribute is the only
	 * way to measure a twin. '/dev/cert-' is in SITE_PLATE_DEV_PREFIXES, so
	 * the plate paints every panel and key here as it does on the desk.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import DeskLayout from '../../certifications/desk/+layout.svelte';
	import DeskQueue from '$lib/certifications/desk/DeskQueue.svelte';
	import Telemetry from '$lib/certifications/desk/Telemetry.svelte';
	import TelemetryTiles from '$lib/certifications/desk/TelemetryTiles.svelte';
	import { peopleFromDesk } from '$lib/certifications/desk/desk';
	import '$lib/certifications/cert.css';
	import { DESK_BUSY, DESK_EMPTY, TELEMETRY_DATA, TELEMETRY_EMPTY } from './fixtures';

	let { data }: { data: { state: 'empty' | 'busy' } } = $props();

	const desk = $derived(data.state === 'busy' ? DESK_BUSY : DESK_EMPTY);
	const telemetry = $derived(data.state === 'busy' ? TELEMETRY_DATA : TELEMETRY_EMPTY);
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

<main class="cert-root harness" data-testid="cert-desk-harness" data-state={data.state} data-cert-desk-hydrated={hydrated ? 'yes' : 'no'}>
	<DeskLayout data={{ isAdmin: true, people: peopleFromDesk(desk) }}>
		<header class="cert-titlebar">
			<div>
				<p class="eyebrow cert-eyebrow">IDEA // Certifications</p>
				<h1 class="cert-title plate-title">Desk</h1>
			</div>
		</header>
		<DeskQueue {desk} />
		<TelemetryTiles {desk} {telemetry} />
		<Telemetry {telemetry} />
	</DeskLayout>
</main>
