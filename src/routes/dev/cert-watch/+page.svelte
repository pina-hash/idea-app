<script lang="ts">
	/**
	 * /dev/cert-watch: the training player through the REAL component. The
	 * `real` view loads the IFrame API (and, under the harness, fails to, which
	 * is the state measured); the three fake views hand the component a
	 * `FakePlayer` whose clock runs at the chosen rate, so the bar, the
	 * check-in band, a missed check-in and the speed cap can be driven and
	 * measured with no network. Every `onsession` lands in the readout below
	 * its player, so what the certification page would post is readable here.
	 */
	import '$lib/certifications/cert.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import YouTubePlayer from '$lib/certifications/watch/YouTubePlayer.svelte';
	import { FakePlayer } from '$lib/certifications/watch/fake-player';
	import type { WatchSession } from '$lib/certifications/watch/tracker';
	import type { YTPlayerEvents } from '$lib/certifications/watch/youtube-api';

	let { data }: { data: { only: string | null } } = $props();
	const show = (state: string) => data.only === null || data.only === state;

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

	/* The fake players, one per view, kept where the controls can reach them. */
	let fakePlayer: FakePlayer | null = null;
	const factory = (options: { autoplay: boolean; keep?: boolean }) => (host: HTMLElement, events: YTPlayerEvents) => {
		const p = new FakePlayer({ duration: 600, events });
		p.attach(host);
		if (options.keep) fakePlayer = p;
		if (options.autoplay) setTimeout(() => p.playVideo(), 60);
		return p;
	};

	let sessions = $state<Record<string, WatchSession[]>>({ fake: [], checkin: [], missed: [] });
	const record = (view: string) => (s: WatchSession) => {
		sessions = { ...sessions, [view]: [...(sessions[view] ?? []), s] };
	};
	const last = (view: string) => sessions[view]?.[sessions[view].length - 1] ?? null;
</script>

<svelte:head><title>Certification watch tracker harness</title></svelte:head>

<main class="cert-root" data-cert-watch-hydrated={hydrated ? 'yes' : undefined}>
	<header class="cert-titlebar">
		<div>
			<p class="eyebrow cert-eyebrow">IDEA // Certifications // harness</p>
			<h1 class="cert-title">Training video tracker</h1>
		</div>
	</header>

	{#if show('real')}
		<section data-view="real" class="harness-view">
			<h2 class="cert-section-h">A real embed</h2>
			<p class="cert-help">Loads the YouTube IFrame API. Where the network is blocked (the browser-verify harness) this is the "did not load" state.</p>
			<YouTubePlayer videoId="dQw4w9WgXcQ" title="A real training video" itemKey="yt:dQw4w9WgXcQ" checkinTimeoutSeconds={60} apiTimeoutMs={8000} />
		</section>
	{/if}

	{#if show('fake')}
		<section data-view="fake" class="harness-view">
			<h2 class="cert-section-h">A fake player with saved progress</h2>
			<p class="cert-help">The server already holds 41% of this video. The controls drive the fake player the way a student would drive the real one.</p>
			<YouTubePlayer
				videoId="fakefakefak"
				title="A fake training video"
				itemKey="yt:fakefakefak"
				checkinTimeoutSeconds={60}
				priorCoverage={0.41}
				tickMs={250}
				createPlayer={factory({ autoplay: false, keep: true })}
				onsession={record('fake')}
			/>
			<div class="cert-actions harness-controls" data-testid="cert-watch-controls">
				<button type="button" class="btn cert-btn" onclick={() => fakePlayer?.playVideo()} data-testid="cert-watch-play">Play</button>
				<button type="button" class="btn cert-btn secondary" onclick={() => fakePlayer?.pauseVideo()} data-testid="cert-watch-pause">Pause</button>
				<button type="button" class="btn cert-btn secondary" onclick={() => fakePlayer?.seekTo((fakePlayer?.getCurrentTime() ?? 0) + 60, true)} data-testid="cert-watch-skip">Skip ahead 60 s</button>
				<button type="button" class="btn cert-btn secondary" onclick={() => fakePlayer?.chooseRate(2.5)} data-testid="cert-watch-fast">Choose 2.5x</button>
			</div>
			<pre class="harness-readout" data-testid="cert-watch-last-session">{last('fake') ? JSON.stringify(last('fake')) : 'No session reported yet.'}</pre>
		</section>
	{/if}

	{#if show('checkin')}
		<section data-view="checkin" class="harness-view">
			<h2 class="cert-section-h">A Continue check-in</h2>
			<p class="cert-help">Plays on its own and asks for Continue after two played seconds (the real schedule is 3 to 8 minutes).</p>
			<YouTubePlayer
				videoId="fakefakefa2"
				title="A fake training video that checks in"
				itemKey="yt:fakefakefa2"
				checkinTimeoutSeconds={60}
				tickMs={250}
				scheduleNext={(played) => played + 2}
				createPlayer={factory({ autoplay: true })}
				onsession={record('checkin')}
			/>
			<pre class="harness-readout" data-testid="cert-watch-checkin-session">{last('checkin') ? JSON.stringify(last('checkin')) : 'No session reported yet.'}</pre>
		</section>
	{/if}

	{#if show('missed')}
		<section data-view="missed" class="harness-view">
			<h2 class="cert-section-h">A missed check-in</h2>
			<p class="cert-help">The same, with a three-second timeout: the band changes its words and the clock stops counting until Continue is pressed.</p>
			<YouTubePlayer
				videoId="fakefakefa3"
				title="A fake training video whose check-in is missed"
				itemKey="yt:fakefakefa3"
				checkinTimeoutSeconds={3}
				tickMs={250}
				scheduleNext={(played) => played + 2}
				createPlayer={factory({ autoplay: true })}
				onsession={record('missed')}
			/>
			<pre class="harness-readout" data-testid="cert-watch-missed-session">{last('missed') ? JSON.stringify(last('missed')) : 'No session reported yet.'}</pre>
		</section>
	{/if}
</main>

<style>
	.harness-view {
		margin: 0 0 2.5rem;
		max-width: 52rem;
	}
	.harness-controls {
		margin: 0.75rem 0;
	}
	.harness-readout {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-2);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		margin: 0.5rem 0 0;
	}
</style>
