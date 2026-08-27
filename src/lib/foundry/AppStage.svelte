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
	 * THE SRC IS DERIVED, NOT FETCHED, AND THERE IS NO ROUND TRIP HERE ANY MORE.
	 * Launching used to call a transport that minted a signed thirty-minute
	 * token against a proxy of ours. There is no token and no mint: the src is
	 * `foundryBundleUrl(appsOrigin, appId, versionId)` and nothing else, and
	 * pressing Launch is a synchronous state change -- which is also the only
	 * kind of work the wedged-bundle measurement above proves still runs.
	 *
	 * FULL SCREEN IS THE SAME CONSTRAINT AS STOP, ONE STEP FURTHER.
	 *
	 * In the gallery a bundle runs in a frame, in a detail pane, in a two-pane
	 * split, in the portal shell -- so it gets what is left after three layers of
	 * chrome, and an app with a fixed playfield has to be zoomed out to be
	 * usable. This control hands it the viewport without moving it anywhere: the
	 * <iframe> is never unmounted and its src is never rewritten, so the running
	 * app keeps its state across the transition. Anything that swapped the frame
	 * would restart every app anybody maximised.
	 *
	 * NATIVE WHERE IT EXISTS, A FIXED OVERLAY WHERE IT DOES NOT, AND THE OVERLAY
	 * IS THE FLOOR RATHER THAN THE FALLBACK. The class goes on FIRST, then the
	 * Fullscreen API is asked -- so a browser that refuses (iOS Safari has no
	 * element fullscreen at all, and every engine refuses a request made without
	 * a user gesture) still ends up with the app filling the viewport, and both
	 * paths produce the same layout because they are the same class. There is no
	 * async gap in which nothing has happened.
	 *
	 * NO rAF ANYWHERE ON THIS PATH, FOR THE REASON THE STOP CONTROL DOCUMENTS: a
	 * wedged bundle stops the parent's animation frames arriving while leaving
	 * its task queue alive. Every transition here is a synchronous state change
	 * and a class, which is all a click handler needs.
	 *
	 * ESCAPE IS TWO DIFFERENT MECHANISMS AND ONLY ONE OF THEM IS OURS. In native
	 * full screen the browser handles Escape above the document, so it works even
	 * with focus inside the bundle. The overlay's Escape is a keydown listener on
	 * the window, which a focused cross-origin frame never delivers to us -- so on
	 * that path the VISIBLE control is the guarantee and Escape is a convenience.
	 * That is why the bar stays on screen rather than fading out, and why Stop app
	 * stays beside it: an app can still wedge, and unmounting the frame is still
	 * the only way out of that.
	 *
	 * ABSENCE IS STILL THE MECHANISM; WHAT IS ABSENT IS THE URL. A deployment
	 * with no apps origin, or an app with no version to point at, gives `null`
	 * from that builder, and this renders no launch control at all rather than a
	 * button that opens `about:blank`.
	 *
	 * THIS IS ALSO WHERE A PLAY IS RECORDED, AND IT HAS TO BE, BECAUSE THE APP
	 * CANNOT REPORT.
	 *
	 * A published bundle runs in a sandboxed cross-origin frame with no session
	 * and no channel back to us. There is no postMessage contract and there must
	 * not be one -- asking a student's own code to report its own usage would
	 * make every figure a figure the measured party writes. So the app is never
	 * asked, and the only thing that knows a play happened is the component that
	 * mounted the frame. That is this one: Launch is a session start, Stop is
	 * its end, a change of subject is an end, and a teardown is an end.
	 *
	 * A HEARTBEAT RATHER THAN A ROW PER BEAT. `recordPlay` opens ONE row and
	 * `pingPlay` extends it, so a session is a row and not a stream, and a
	 * student mashing Launch resumes the row they already have -- the database's
	 * own resume window decides that, not this file. Duration is measured to the
	 * last beat, which is what makes the NORMAL ending, the tab closing where
	 * nothing fires at all, a measurement accurate to within one interval rather
	 * than a zero.
	 *
	 * IT BEATS ONLY WHILE THE PAGE IS VISIBLE. A tab left open overnight would
	 * otherwise book the night as play time. Going hidden sends a last beat and
	 * stops; coming back sends one, and a beat the database refuses as STALE
	 * opens a fresh session instead of extending an old one across the gap.
	 *
	 * NOTHING ON THIS PATH CAN REACH THE VIEWER. Every call is wrapped, every
	 * refusal is silent, and none of the state here renders -- because
	 * instrumentation must never be able to affect the thing it measures, and
	 * the thing being measured is a student's app starting. The reason there is
	 * no rAF on the stop path applies here too: this is all task-queue work.
	 *
	 * AND IT ONLY RUNS WHERE A TRANSPORT WAS HANDED IN. The review queue
	 * supplies none, so a reviewer running a submitted build records nothing --
	 * absence is the mechanism, and the database refuses that same case again on
	 * its own.
	 */
	import { untrack } from 'svelte';

	import { env } from '$env/dynamic/public';

	import AppFrame from './AppFrame.svelte';
	import { foundryBundleUrl } from './bundle-url.ts';
	import { FOUNDRY_PLAY_HEARTBEAT_MS } from './telemetry.ts';
	import type { FoundryGalleryTransports } from './transports.ts';

	let {
		appId,
		versionId,
		title,
		/**
		 * THE ONE ENVIRONMENT READ ON THIS PATH. Bundles are served from the APPS
		 * ORIGIN, a second domain on this same Vercel project, and that string is
		 * the same for every viewer and every app. Threading it through the route,
		 * the gallery and the detail view would be four files to say one thing,
		 * and this component would still not be fetching anything.
		 *
		 * UNSET RENDERS NO LAUNCH CONTROL, WHICH IS THE STRICT DIRECTION ON
		 * PURPOSE. Falling back to the current origin would serve bundles off the
		 * MAIN host -- the one carrying the portal's session cookies -- and it
		 * would do it silently, which is the one failure nobody would notice. A
		 * missing launch button is a bug report on the first day.
		 *
		 * It stays overridable so the pure builder can be pointed elsewhere from
		 * a harness without the component reaching for a different mechanism.
		 */
		appsOrigin = env.PUBLIC_FOUNDRY_APPS_ORIGIN ?? '',
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
		appsOrigin?: string;
		transports?: FoundryGalleryTransports;
		height?: string;
		runningLabel?: string;
		loading?: 'lazy' | 'eager';
	} = $props();

	/** The frame src, or null when this app cannot be pointed at anything. */
	const src = $derived(foundryBundleUrl(appsOrigin, appId, versionId));

	let running = $state(false);

	/**
	 * THE ELEMENT THAT GOES FULL SCREEN, which is this stage and not the frame.
	 * The bar has to come with it -- Stop app is the only way out of a wedged
	 * bundle, and a full-screen frame with the stop control left behind on the
	 * page underneath is exactly the trap the control exists to avoid.
	 */
	let stage = $state<HTMLElement | null>(null);

	/** The class is on. True whether the browser granted native full screen or not. */
	let full = $state(false);

	/**
	 * The browser put us in the top layer, as opposed to us drawing a fixed
	 * overlay. It changes only the WORDS -- the hint under the bar says which
	 * Escape a viewer has -- never the layout, which is one class either way.
	 */
	let native = $state(false);


	/* ------------------------------------------------------------ telemetry
	 *
	 * NONE OF THIS IS `$state`, ON PURPOSE. Nothing here renders, so a reactive
	 * cell would buy a dependency and cost the risk of an effect that reads what
	 * it writes -- and an instrumentation bug that spins a component is exactly
	 * the class of failure "must never affect the thing it measures" is about.
	 * Plain `let` cannot be read by the renderer and cannot be tracked.
	 */

	/** The open session's id, or null when nothing is being recorded. */
	let playId: string | null = null;
	/** The heartbeat handle. `setInterval`, never rAF: see the header. */
	let beat: ReturnType<typeof setInterval> | null = null;

	function stopBeat() {
		if (beat !== null) {
			clearInterval(beat);
			beat = null;
		}
	}

	function startBeat() {
		stopBeat();
		if (typeof window === 'undefined') return;
		beat = setInterval(() => void heartbeat(), FOUNDRY_PLAY_HEARTBEAT_MS);
	}

	/**
	 * OPEN A SESSION. The database decides whether this is a new row or a resume
	 * of one already open, which is what makes mashing Launch cheap; this side
	 * only has to ask.
	 *
	 * THE SUBJECT IS RE-CHECKED ON THE WAY BACK. A viewer who picks another app
	 * while this is in flight must not have the previous app's session attached
	 * to the new one, which is the same staleness guard the inspector's file
	 * read uses.
	 */
	async function beginPlay() {
		const record = transports.recordPlay;
		if (!record) return;
		const forApp = appId;
		const forVersion = versionId;
		try {
			const r = await record(forApp, forVersion);
			if (!r.ok) return;
			if (!running || appId !== forApp || versionId !== forVersion) return;
			playId = r.playId;
			startBeat();
		} catch {
			// Silent, always. A telemetry failure is not the viewer's problem and
			// must not become their error message.
		}
	}

	/**
	 * SAY THE APP IS STILL RUNNING. Also the clean end: the beat sent as the
	 * frame comes down is what makes a stopped session's duration exact.
	 *
	 * `stale` IS THE ONE ANSWER THIS ACTS ON. It means the row aged out of the
	 * database's resume window while the tab was hidden, so the gap must not be
	 * booked: the old row keeps the duration it had earned and a fresh session
	 * starts from now.
	 */
	async function heartbeat() {
		const ping = transports.pingPlay;
		const id = playId;
		if (!ping || !id) return;
		try {
			const r = await ping(id);
			if (playId !== id) return;
			if (r.ok) return;
			playId = null;
			stopBeat();
			if (r.stale && running) void beginPlay();
		} catch {
			// Silent.
		}
	}

	/**
	 * CLOSE THE SESSION. Best effort by construction -- a page being torn down
	 * may not finish the request, and that is precisely the case the duration is
	 * measured to `last_seen_at` for: the worst outcome is one heartbeat
	 * interval of play time uncounted, never a session recorded as zero.
	 */
	function endPlay() {
		stopBeat();
		const ping = transports.pingPlay;
		const id = playId;
		playId = null;
		if (!ping || !id) return;
		try {
			void ping(id).catch(() => {});
		} catch {
			// Silent.
		}
	}

	/**
	 * VISIBILITY, WHICH IS WHAT KEEPS AN ABANDONED TAB OUT OF THE FIGURES.
	 *
	 * Beating while hidden would book a tab left open overnight as eight hours
	 * of play. So going hidden sends a last beat and stops the timer, and coming
	 * back sends one -- which the database refuses if the row has aged out,
	 * opening a fresh session rather than extending the old one across the gap.
	 *
	 * `pagehide` IS THE CLOSEST THING TO A TAB CLOSING THAT FIRES AT ALL, and it
	 * is best effort: the ping may not complete. That is the accepted cost, and
	 * the reason duration is pinned to the last beat rather than to a clean end.
	 *
	 * The listeners read `running` and `playId` when they FIRE, not when this
	 * effect runs, so nothing here is tracked and the effect sets up once.
	 * `addEventListener` rather than a Svelte binding, because these are
	 * document- and window-level events.
	 */
	$effect(() => {
		if (typeof document === 'undefined') return;
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') {
				stopBeat();
				void heartbeat();
				return;
			}
			if (!running) return;
			if (playId) {
				startBeat();
				void heartbeat();
			} else {
				void beginPlay();
			}
		};
		const onPageHide = () => endPlay();
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('pagehide', onPageHide);
		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('pagehide', onPageHide);
		};
	});

	/**
	 * THE COMPONENT GOING AWAY IS AN ENDING TOO, and it is a common one: the
	 * gallery keys its detail pane on the slug, so moving between apps destroys
	 * this instance outright. No dependencies, so the body runs once and the
	 * cleanup runs on destroy.
	 */
	$effect(() => () => endPlay());

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
		running = false;
		leaveFull();
		// UNTRACKED. `endPlay` reads the transports object and calls into it, and
		// a tracked read of anything it touches would make this effect depend on
		// state it also moves. The ids above are the only dependencies this
		// effect is meant to have.
		untrack(() => endPlay());
	});

	function start() {
		if (!src) return;
		running = true;
		// AFTER the state change, never before it: pressing Launch has to put the
		// frame on screen whatever the recording does, and this call is allowed
		// to do nothing at all.
		void beginPlay();
	}

	function stop() {
		running = false;
		// Full screen is a state of the STAGE, and the stage is about to be empty.
		// Leaving it on would hand the viewer a black viewport with a Launch
		// button in the corner of it.
		leaveFull();
		endPlay();
	}

	/**
	 * ENTER. The class first, the API second, and the order is the whole design:
	 * a refused or unsupported request then costs nothing rather than leaving the
	 * press with no visible effect.
	 */
	function enterFull() {
		full = true;
		native = false;
		const el = stage;
		if (!el || typeof el.requestFullscreen !== 'function') return;
		// The promise is awaited only to learn WHICH path we are on. A rejection
		// is an ordinary outcome (no gesture, a policy, an engine without it), not
		// an error to report: the overlay is already up.
		el.requestFullscreen().then(
			() => {
				native = true;
			},
			() => {
				native = false;
			}
		);
	}

	/** LEAVE, from the control, from Stop, or from a change of subject. */
	function leaveFull() {
		full = false;
		native = false;
		if (typeof document !== 'undefined' && document.fullscreenElement) {
			void document.exitFullscreen().catch(() => {});
		}
	}

	/**
	 * THE BROWSER'S OWN EXIT, WHICH IS NOT A CLICK ON ANYTHING OF OURS: Escape,
	 * the F11 key, a tab switch, or a page the engine decided to take out of the
	 * top layer. Without this the class stays on and the app sits in a fixed
	 * overlay the viewer has no way to read as full screen.
	 *
	 * `addEventListener`, not a Svelte binding: this is a document-level event
	 * and the escape hatch has to keep working on an element that may have been
	 * moved into the top layer.
	 */
	$effect(() => {
		if (typeof document === 'undefined') return;
		const onChange = () => {
			if (native && !document.fullscreenElement) {
				full = false;
				native = false;
			}
		};
		const onKey = (e: KeyboardEvent) => {
			// Native full screen handles its own Escape above the document; this is
			// only for the overlay path, and only reaches us when focus is OUTSIDE
			// the bundle's frame.
			if (e.key === 'Escape' && full && !native) leaveFull();
		};
		document.addEventListener('fullscreenchange', onChange);
		window.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('fullscreenchange', onChange);
			window.removeEventListener('keydown', onKey);
		};
	});

</script>

<!--
	`data-version` NAMES WHAT THIS STAGE WOULD RUN, before anything is running.
	The review queue and the gallery point the same component at different
	versions -- the submitted one and the published one -- and until a launch
	happens there is nothing on screen that says which. It is the hook a test
	reads to prove the queue is deciding about the submission rather than about
	the live build, and it is what a screenshot of a review session carries.
-->
<div
	class="fdy-stage"
	class:is-full={full}
	data-version={versionId}
	data-app={appId}
	data-full={full ? (native ? 'native' : 'overlay') : 'no'}
	bind:this={stage}
>
	{#if running && src}
		<div class="fdy-stage-bar">
			<span class="fdy-running" aria-live="polite">
				<span class="fdy-dot" aria-hidden="true"></span>
				{runningLabel || 'Running'}
			</span>
			<!--
				TWO REAL BUTTONS WITH WORDS ON THEM, not glyphs and not a corner X.
				One of them is the control a viewer reaches for when an app has
				stopped responding, which is the worst possible moment to be guessing
				at an icon, and the other has to be findable from inside a viewport
				that holds nothing else.

				FULL SCREEN COMES FIRST AND STOP KEEPS THE END OF THE ROW. Stop is
				where it has always been, at the far edge, so the control that matters
				in an emergency does not move because a second one was added beside
				it.
			-->
			<button type="button" class="btn fdy-full tap-44" onclick={full ? leaveFull : enterFull}>
				{full ? 'Exit full screen' : 'Full screen'}
			</button>
			<button type="button" class="btn fdy-stop tap-44" onclick={stop}>Stop app</button>
		</div>
		{#if full}
			<!--
				WHICH ESCAPE THIS VIEWER ACTUALLY HAS. In native full screen the
				browser handles the key above the document, so it works with focus
				anywhere including inside the bundle. On the overlay path the key is
				ours, and a focused cross-origin frame never delivers it -- so the
				sentence says the button, not the key, and does not promise something
				that will not happen.
			-->
			<p class="fdy-stage-note" data-testid="fullscreen-hint">
				{native
					? 'Press Escape or use Exit full screen to come back.'
					: 'Use Exit full screen to come back. Escape works when the app does not have focus.'}
			</p>
		{/if}
		<AppFrame {src} {title} {height} {loading} fill={full} />
	{:else}
		<div class="fdy-stage-idle">
			{#if src}
				<button type="button" class="btn fdy-launch tap-44" onclick={start}>Launch app</button>
				<p class="fdy-stage-note">
					It opens in a sandbox on a separate address, so it cannot reach anything of yours.
				</p>
			{:else}
				<!--
					ABSENCE IS THE MECHANISM. Nothing to point a frame at, no control --
					and the surface says so rather than rendering a button that cannot work.
				-->
				<p class="fdy-stage-note">This app cannot be started from here.</p>
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

	/*
		THE FULL-VIEWPORT STATE, WRITTEN ONCE FOR BOTH PATHS.

		A native request promotes this element to the top layer, where the UA
		already sizes it to the viewport; the overlay path has to do it itself.
		Stating `position: fixed; inset: 0` covers the second and is harmless to
		the first, which is what makes the two look identical rather than merely
		similar -- and identical is the point: a viewer must not be able to tell
		which path they got except by which Escape works.

		THE BACKGROUND IS EXPLICIT. Native full screen paints a black `::backdrop`
		BEHIND the element and nothing on it, and the overlay has the whole page
		showing through, so both need this. `--bg0` rather than black, because a
		bundle that does not paint its own corners should show the portal's plate
		and not a colour from nowhere.

		NO TRANSITION, per the constraint the stop control documents: a wedged
		bundle stops this document's animation frames, so anything eased here
		would appear to hang in exactly the case somebody is trying to escape.
	*/
	.fdy-stage.is-full {
		position: fixed;
		inset: 0;
		/*
			Above the masthead, which sits at `z-index: 1` in the same stacking
			context as `main`. This is the only thing in the app that deliberately
			covers the whole page, so it does not have to negotiate with anything
			else for a number.
		*/
		z-index: 100;
		background: var(--bg0);
		/*
			NO PADDING AND NO GAP ON THE STAGE ITSELF. Measured at 375: the stage's
			own 8px padding and 8px gap were 24px of the 812 the viewport has, in
			the one state whose entire purpose is room. The bar keeps its own inset
			so the controls are not flush against the edge; the frame takes
			everything else.
		*/
		padding: 0;
		gap: 0;
	}

	.fdy-stage.is-full .fdy-stage-bar,
	.fdy-stage.is-full .fdy-stage-note {
		padding: 0 var(--space-2, 0.5rem);
	}

	.fdy-stage.is-full .fdy-stage-bar {
		padding-top: var(--space-2, 0.5rem);
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

	/* Both controls sit at the far end of the bar, with the running label taking
	   the slack, so the row reads the same with one button or two. */
	.fdy-full {
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
