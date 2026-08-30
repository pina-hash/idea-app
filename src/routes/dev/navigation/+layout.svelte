<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { navigating } from '$app/state';
	import { NAV_INDICATOR_DELAY_MS } from '$lib/pending';

	let { children } = $props();

	/**
	 * THE PROBE LIVES IN THE LAYOUT BECAUSE IT OUTLIVES THE NAVIGATIONS IT
	 * MEASURES. A layout component is not remounted when a child route changes
	 * (CLAUDE.md), so this survives the round trip to `[delay]` and back, which
	 * a probe written on the page could not: the page is exactly what a
	 * navigation unmounts.
	 *
	 * Results also go on `window` in a plain object -- deliberately NOT `$state`
	 * -- because the harness reads them with `page.evaluate` after the run, and
	 * a reactive value read from outside Svelte is one more thing that can be
	 * mid-flush when it is read.
	 */
	type Observation = {
		/** The `[delay]` the target load slept for. */
		requestedDelayMs: number;
		/** Wall time from the `goto` call to `navigating.to` going null again. */
		navigationMs: number;
		/** Did the indicator's TRACK ever paint during this navigation? */
		indicatorSeen: boolean;
		/** ms from the `goto` call to the first frame the track was in the DOM. */
		firstSeenMs: number | null;
	};

	const results: {
		/** Set synchronously by the click, so a press is observable at once. */
		started: boolean;
		done: boolean;
		gateMs: number;
		observations: Observation[];
		/** What the harness asserts: one word per navigation, in order. */
		summary: string[];
		error: string | null;
	} = {
		started: false,
		done: false,
		gateMs: NAV_INDICATOR_DELAY_MS,
		observations: [],
		summary: [],
		error: null
	};

	/**
	 * RE-ENTRANCY GUARD, and it is here because a run without it produced a
	 * wrong answer that looked like a real finding.
	 *
	 * `clickUntil` repeats its click until the predicate holds. With the
	 * predicate on `done`, the second click landed 900ms into a probe that takes
	 * about 2.5s, so TWO probes ran concurrently -- and the second one's FAST
	 * navigation sampled the indicator the first one's SLOW navigation was still
	 * painting. The report read `["indicator","indicator"]`: the gate looking
	 * broken in exactly the direction that matters, entirely from overlapping
	 * runs. The spec now presses once and waits (`started` then `done`), and
	 * this guard makes a stray second press a no-op rather than a corruption.
	 */
	let running = false;

	const TRACK = '[data-nav-progress="nav-progress"] .nav-prog-track';

	/**
	 * Watch one real navigation from the moment `goto` is called until
	 * `navigating.to` is null again, sampling the DOM for the indicator's track.
	 *
	 * SAMPLING ON A TIMEOUT AND NOT `requestAnimationFrame`. CLAUDE.md's rule is
	 * general -- schedule on rAF-OR-TIMEOUT, never rAF alone -- and it bites
	 * here specifically: a harness run is headless and a throttled window never
	 * ticks rAF, which would make every observation come back `indicatorSeen:
	 * false` and read as the indicator being broken.
	 */
	async function watch(delayMs: number): Promise<Observation> {
		const startedAt = performance.now();
		let firstSeenAt: number | null = null;
		let settled = false;
		const nav = goto(`/dev/navigation/${delayMs}`).then(() => {
			settled = true;
		});
		// Sample until the navigation resolves, then one more time, so a bar
		// that only appears on the very last frame is still counted.
		for (;;) {
			if (document.querySelector(TRACK) && firstSeenAt === null) {
				firstSeenAt = performance.now();
			}
			if (settled) break;
			if (performance.now() - startedAt > 8000) break; // never hang the run
			await new Promise((r) => setTimeout(r, 8));
		}
		await nav;
		return {
			requestedDelayMs: delayMs,
			navigationMs: Math.round(performance.now() - startedAt),
			indicatorSeen: firstSeenAt !== null,
			firstSeenMs: firstSeenAt === null ? null : Math.round(firstSeenAt - startedAt)
		};
	}

	async function runProbe() {
		if (running) return;
		running = true;
		results.started = true;
		results.done = false;
		results.observations = [];
		results.summary = [];
		results.error = null;
		try {
			/*
			 * TWO NAVIGATIONS, ONE ON EACH SIDE OF THE GATE, and the numbers are
			 * chosen against the gate rather than being round:
			 *
			 *   0ms    -- a client load with nothing to wait for. This is the
			 *             "completes instantly" case, and the indicator drawing
			 *             here would be the flash-on-every-click defect.
			 *   1200ms -- comfortably past the gate, and in the range the
			 *             classroom item page's five sequential load waves reach
			 *             on school wifi, which is the case this exists for.
			 *
			 * A THIRD, JUST UNDER THE GATE, is deliberately not here: a
			 * navigation timed to land within a few ms of the threshold is a
			 * flake generator, and the property under test is monotone -- if
			 * 0ms draws nothing and 1200ms draws, the gate is doing its job.
			 */
			results.observations.push(await watch(0));
			await goto('/dev/navigation');
			results.observations.push(await watch(1200));
			await goto('/dev/navigation');
			results.summary = results.observations.map((o) =>
				o.indicatorSeen ? 'indicator' : 'silent'
			);
		} catch (e) {
			results.error = e instanceof Error ? e.message : String(e);
		} finally {
			results.done = true;
			running = false;
		}
	}

	onMount(() => {
		(window as unknown as Record<string, unknown>).__navProbe = results;
		(window as unknown as Record<string, unknown>).__runNavProbe = runProbe;
		return () => {
			delete (window as unknown as Record<string, unknown>).__navProbe;
			delete (window as unknown as Record<string, unknown>).__runNavProbe;
		};
	});
</script>

<div class="nav-harness">
	<header class="h-bar">
		<span class="h-title">dev // navigation indicator + pending primitive</span>
		<span class="h-gate" data-testid="probe-gate">gate {results.gateMs}ms</span>
		<button
			type="button"
			class="btn"
			data-testid="run-nav-probe"
			onclick={() => void runProbe()}
		>
			Run the navigation probe
		</button>
		<span class="h-live" data-testid="probe-live"
			>{navigating.to ? 'navigating' : 'idle'}</span
		>
	</header>
	{@render children()}
</div>

<style>
	.nav-harness {
		min-height: 100vh;
		background: var(--bg0);
	}
	.h-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--boundary);
	}
	.h-title,
	.h-gate,
	.h-live {
		font-family: var(--font-mono);
		font-size: 0.76rem;
		letter-spacing: 0.04em;
		color: var(--text-2);
	}
	.h-title {
		color: var(--text-1);
	}
</style>
