<script lang="ts">
	/**
	 * LAUNCH, RUN, STOP -- the one place a published bundle is started and the
	 * one place it is torn down.
	 *
	 * `AppFrame` owns the sandbox attribute and nothing else; this owns the
	 * lifecycle around it. Both the gallery and the review queue mount THIS, so
	 * "the reviewer sees the same running app the student sees" is true because
	 * it is the same component rather than because two components were written
	 * to match.
	 *
	 * THE STOP CONTROL UNMOUNTS THE FRAME. It does not navigate it to `about:blank`,
	 * it does not hide it, and it does not ask the bundle to stop. `{#if running}`
	 * removes the <iframe> element, which destroys the child browsing context
	 * outright -- and that is the only thing that works against the case it
	 * exists for.
	 *
	 * THE CASE IT EXISTS FOR IS AN INFINITE LOOP, and review catches that
	 * unreliably. A `while (true) {}` in a bundle wedges its own event loop; a
	 * reviewer who approved it did not necessarily reach the code path that
	 * spins. Without a stop control the viewer's only way out is closing the
	 * tab, which on a school machine also loses whatever else they had open.
	 *
	 * WHY REMOVING THE ELEMENT WORKS AGAINST A WEDGED BUNDLE, MEASURED RATHER THAN
	 * ASSUMED -- and the measurement is narrower than the comfortable version of
	 * this claim. Driven in real Chrome against a fixture bundle that reports a
	 * 200ms heartbeat and then runs `while (true) {}`:
	 *
	 *   the child's heartbeat        stops dead      (it really is wedged)
	 *   the parent's setTimeout(100) fires at 995ms  (~10x late, but it FIRES)
	 *   the parent's rAF             never fired in 3s
	 *   the click, then the frame    gone within 250ms of the press
	 *
	 * So the parent is DEGRADED, not unaffected: a cross-site sandboxed frame
	 * still shares enough of the rendering pipeline that the parent's animation
	 * frames stop arriving. What survives is the TASK QUEUE, which is all the
	 * stop control needs -- a click handler and a synchronous state change, which
	 * Svelte flushes on a microtask.
	 *
	 * THAT IS THE CONSTRAINT ON HOW THIS IS BUILT, and it is why there is no
	 * transition, no animation and no rAF anywhere on this path: a teardown
	 * scheduled on an animation frame would never run in exactly the case it
	 * exists for, and would look like a dead button.
	 *
	 * RE-LAUNCHING MINTS A FRESH TOKEN rather than reusing the last src. A token
	 * lives thirty minutes and an app can be withdrawn inside that window, so a
	 * remembered URL is a URL that may have stopped being allowed. It costs one
	 * round trip on a deliberate press.
	 */
	import AppFrame from './AppFrame.svelte';
	import type { FoundryGalleryTransports, FoundryLaunch } from './transports.ts';

	let {
		appId,
		versionId,
		title,
		transports = {},
		height = '70vh',
		/**
		 * What the frame is showing, in words, above the stop control. The review
		 * queue says which version is running because it is deciding about a
		 * version rather than about an app.
		 */
		runningLabel = '',
		/** `eager` for a single-app surface; see AppFrame for why it is a prop. */
		loading = 'eager'
	}: {
		appId: string;
		versionId: string;
		title: string;
		transports?: FoundryGalleryTransports;
		height?: string;
		runningLabel?: string;
		loading?: 'lazy' | 'eager';
	} = $props();

	let launch = $state<FoundryLaunch | null>(null);
	let starting = $state(false);
	let problem = $state<string | null>(null);

	/**
	 * A CHANGE OF SUBJECT STOPS WHATEVER IS RUNNING. Selecting another app while
	 * one is open must not leave the previous bundle live behind the new page --
	 * it would keep running, keep its timers, and keep whatever audio it started.
	 *
	 * Keyed on the ids rather than on a mount, because both surfaces keep this
	 * component mounted and swap what it is pointed at.
	 */
	$effect(() => {
		// Read them so the effect re-runs when either moves; the teardown is the
		// whole body.
		void appId;
		void versionId;
		launch = null;
		problem = null;
	});

	async function start() {
		if (!transports.launch || starting) return;
		starting = true;
		problem = null;
		try {
			const result = await transports.launch({ appId, versionId });
			if (!result.ok) {
				problem = result.message;
				return;
			}
			launch = { src: result.src, versionId: result.versionId, expiresInSeconds: result.expiresInSeconds };
		} catch (err) {
			// A transport that throws is still a refusal the viewer has to read.
			problem = err instanceof Error ? err.message : 'That app could not be started.';
		} finally {
			starting = false;
		}
	}

	function stop() {
		launch = null;
	}

	const minutes = $derived(
		launch ? Math.max(1, Math.round(launch.expiresInSeconds / 60)) : 0
	);
</script>

<!--
	`data-version` NAMES WHAT THIS STAGE WOULD RUN, before anything is running.
	The review queue and the gallery point the same component at different
	versions -- the submitted one and the published one -- and until a launch
	happens there is nothing on screen that says which. It is the hook a test
	reads to prove the queue is deciding about the submission rather than about
	the live build, and it is what a screenshot of a review session carries.
-->
<div class="fdy-stage" data-version={versionId} data-app={appId}>
	{#if launch}
		<div class="fdy-stage-bar">
			<span class="fdy-running" aria-live="polite">
				<span class="fdy-dot" aria-hidden="true"></span>
				{runningLabel || 'Running'}
			</span>
			<span class="fdy-stage-note">Closes itself after {minutes} minutes.</span>
			<!--
				A REAL BUTTON WITH A WORD ON IT, not a glyph and not a corner X. It is
				the control a viewer reaches for when an app has stopped responding,
				which is the worst possible moment to be guessing at an icon.
			-->
			<button type="button" class="btn fdy-stop tap-44" onclick={stop}>Stop app</button>
		</div>
		<AppFrame src={launch.src} {title} {height} {loading} />
	{:else}
		<div class="fdy-stage-idle">
			{#if transports.launch}
				<button type="button" class="btn fdy-launch tap-44" onclick={start} disabled={starting}>
					{starting ? 'Starting...' : 'Launch app'}
				</button>
				<p class="fdy-stage-note">
					It opens in a sandbox on a separate address, so it cannot reach anything of yours.
				</p>
			{:else}
				<!--
					ABSENCE IS THE MECHANISM. No launch transport, no control -- and the
					surface says why rather than rendering a button that cannot work.
				-->
				<p class="fdy-stage-note">This app cannot be started from here.</p>
			{/if}
			{#if problem}
				<p class="fdy-stage-problem" role="alert">{problem}</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.fdy-stage {
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
		min-width: 0;
	}

	.fdy-stage-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2, 0.5rem);
	}

	.fdy-running {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--text-1, var(--white));
	}

	/* Colour is never the only signal: the word "Running" is beside it. */
	.fdy-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--green);
	}

	.fdy-stage-note {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2, var(--dim));
	}

	.fdy-stage-problem {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--crimson);
	}

	.fdy-stop {
		margin-left: auto;
	}

	.fdy-stage-idle {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2, 0.5rem);
		padding: var(--space-4, 1rem);
		border: 1px dashed var(--boundary);
		border-radius: var(--radius-md, 8px);
	}

	.fdy-launch {
		border-color: var(--green);
		color: var(--green);
	}
</style>
