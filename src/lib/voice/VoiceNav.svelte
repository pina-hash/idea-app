<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import {
		Dictation,
		dictationConstructor,
		dictationLang,
		type SpeechRecognitionCtor
	} from '$lib/feedback/dictation';
	import {
		VOICE_ACTIONS,
		VOICE_IDLE_MS,
		VOICE_IDLE_NOTE,
		VOICE_PRIVACY_NOTE,
		VOICE_SHORT_NOTE,
		VOICE_UNSUPPORTED_NOTE,
		matchUtterance,
		missNote,
		voiceDestinations,
		type VoiceAction,
		type VoiceDestination
	} from './commands';

	/**
	 * VOICE NAVIGATION, MOUNTED ONCE IN THE ROOT LAYOUT.
	 *
	 * COVERAGE COMES FROM THE SHELL, the same argument `SiteFeedback` and
	 * `NavigationProgress` already rest on: there are no layout resets anywhere
	 * in `src/routes`, so the root layout wraps every page route and a route
	 * added next month INHERITS this instead of having to remember it.
	 *
	 * IT IS OFF UNTIL SOMEBODY PRESSES START, AND THAT IS STRUCTURAL RATHER
	 * THAN A DEFAULT. No recogniser is constructed at mount, so no microphone
	 * permission is requested at mount: the browser's own prompt appears on the
	 * first press and never before it. Nothing is persisted either -- there is
	 * no preference, no `localStorage` key and no session flag -- so a reload
	 * is off, every time, and "is this site listening to me" has one answer a
	 * person can check by looking at the control.
	 *
	 * ONE ACTIVATION IS ONE COMMAND. The session stops the moment an utterance
	 * MATCHES, before the navigation is even asked for, so the microphone is
	 * closed while the next page is still loading. A MISS does not stop it --
	 * a student who was misheard must be able to say the word again without
	 * hunting for the button -- and `VOICE_IDLE_MS` bounds that case at twenty
	 * seconds. Between the two, the longest the microphone is open without
	 * somebody deliberately holding it there is one phrase plus a pause.
	 *
	 * NO AUDIO AND NO TRANSCRIPT LEAVES THE BROWSER. That is not a rule this
	 * component follows, it is a property of what it is made of:
	 * `$lib/feedback/dictation.ts` drives the browser's own
	 * `SpeechRecognition`, which hands text back in-process, and the ONLY thing
	 * this file does with that text is compare it against a table in
	 * `./commands.ts` and set a string on screen. There is no fetch, no RPC,
	 * no Supabase client and no logging anywhere in this component or in either
	 * module it imports.
	 *
	 * ABSENCE IS THE MECHANISM, TWICE OVER. A browser with no
	 * `SpeechRecognition` (Firefox, and every third-party browser on an iPad)
	 * renders NOTHING -- not a disabled button, not a tooltip -- which is the
	 * rule `dictation.ts` states for its own control. And `navigate` is an
	 * injected transport: a harness hands in one that records instead of
	 * moving, and the real mount hands in the browser's own.
	 */

	let {
		/** Signed in? Decides whether the auth-only destinations are sayable. */
		signedIn = false,
		/** Site admin? Decides whether the admin destinations are sayable. */
		isAdmin = false,
		/**
		 * THE SURFACE OWNS ITS VIEWPORT, so nothing floats over it. Handed in
		 * from the layout as `feedbackExclusion(routeId) !== null` -- the ONE
		 * registry that already answers "may anything float here", rather than a
		 * second list of games and decks that would stop agreeing with it.
		 *
		 * UNLIKE THE REPORT CONTROL, VOICE DOES NOT RELOCATE. Every surface must
		 * be able to report a defect, so an exclusion there moves the control
		 * into that surface's own chrome. Navigation is a convenience: a
		 * projected deck, a race and a timed CAD run are each a thing a person
		 * is deliberately inside, and the way out of them is the way in.
		 */
		suppressed = false,
		/**
		 * HOW A DESTINATION IS REACHED. Default (from the layout) is a full
		 * navigation rather than SvelteKit's `goto`, and that is two decisions
		 * at once: `goto` cannot reach `/coins/index.html` or `/vanguard/`,
		 * which are server endpoints rather than page routes and are two of the
		 * sixteen destinations an admin can say; and a document navigation GUARANTEES the
		 * microphone is gone, because the whole page is.
		 */
		navigate = (href: string) => {
			window.location.assign(href);
		},
		/**
		 * Injected for the harness: a stub recogniser with no microphone behind
		 * it, or an EXPLICIT `null` meaning "this browser has none".
		 *
		 * THE DEFAULT IS `undefined`, NOT `null`, AND THAT IS NOT A STYLE
		 * CHOICE. It was `null`, read through `recognizer ?? dictationConstructor()`,
		 * which makes an explicit `null` indistinguishable from an absent prop --
		 * so a harness asking for the no-support state got the REAL browser
		 * constructor back and rendered a control that would open a real
		 * microphone on a page whose whole point is that it cannot. Measured in
		 * Chromium, where `webkitSpeechRecognition` exists; INVISIBLE in
		 * happy-dom, where it does not, so the mount test asserting this passed
		 * for the wrong reason until a real browser ran the same page. Its
		 * positive control is a planted constructor on `window`.
		 */
		recognizer = undefined as SpeechRecognitionCtor | null | undefined,
		/** Injected for the harness so a spec can open the panel without a click. */
		startOpen = false,
		/**
		 * WHERE THE CONTROL SITS, and this exists for one reason: the harness.
		 *
		 * `shell` (the default, and the only value any real page uses) docks it
		 * to the bottom-left corner. `inline` renders it in the flow where it
		 * was mounted and is what `/dev/voice` passes -- that route mounts a
		 * SECOND instance with a stubbed recogniser, and this component is
		 * ALREADY on that page through the root layout, so two docked copies
		 * would sit exactly on top of each other with the shell's (real,
		 * microphone-opening) one on top. Same shape and same reason as
		 * `SiteFeedback`'s own `place` prop.
		 *
		 * Nothing but the positioning differs: the control, the panel, the
		 * vocabulary and every control's box are identical, which is what keeps
		 * the harness's measurements the shipping ones.
		 */
		place = 'shell' as 'shell' | 'inline' | 'header'
	}: {
		signedIn?: boolean;
		isAdmin?: boolean;
		suppressed?: boolean;
		navigate?: (href: string) => void;
		recognizer?: SpeechRecognitionCtor | null | undefined;
		startOpen?: boolean;
		place?: 'shell' | 'inline' | 'header';
	} = $props();

	/**
	 * THE FEATURE TEST RUNS ONCE, AT MODULE-INSTANCE LEVEL, and `recognizer`
	 * wins when it is handed in. `dictationConstructor()` is the ONE
	 * implementation of "does this browser have it" in the repo and reads
	 * `window` itself, so this is a read and not a second test. The test is
	 * `!== undefined` rather than `??`, so an explicit `null` means NONE rather
	 * than "go and ask the browser" -- see the prop's own note.
	 */
	const ctor: SpeechRecognitionCtor | null = $derived(
		recognizer !== undefined ? recognizer : dictationConstructor()
	);
	const supported = $derived(ctor !== null);

	/* SEEDED ONCE, DELIBERATELY. `startOpen` is a harness hook, not a
	   controlled prop: reading it bare here is the `state_referenced_locally`
	   warning, and `untrack` is how "I mean the initial value" is spelled
	   rather than silenced. */
	let open = $state(untrack(() => startOpen));
	let listening = $state(false);
	let heardNote = $state('');
	let matchedNote = $state('');
	let errorNote = $state('');
	let interim = $state('');

	const destinations = $derived(voiceDestinations({ signedIn, isAdmin }));

	let session: Dictation | null = null;
	let idleTimer: ReturnType<typeof setTimeout> | null = null;

	const clearIdle = () => {
		if (idleTimer !== null) {
			clearTimeout(idleTimer);
			idleTimer = null;
		}
	};

	/**
	 * THE IDLE CAP IS RE-ARMED ON EVERY UTTERANCE, HEARD OR NOT. It bounds
	 * "open with nothing understood", not "open"; a person who is actively
	 * being misheard is still using it, and cutting them off mid-retry is the
	 * failure the retry path exists to avoid.
	 */
	const armIdle = () => {
		clearIdle();
		idleTimer = setTimeout(() => {
			idleTimer = null;
			if (!listening) return;
			stop();
			errorNote = VOICE_IDLE_NOTE;
		}, VOICE_IDLE_MS);
	};

	const stop = () => {
		clearIdle();
		interim = '';
		session?.stop();
	};

	/**
	 * A MATCH ENDS THE SESSION FIRST AND ACTS SECOND, in that order and
	 * deliberately. `destroy()` drops the recogniser outright rather than
	 * asking it to finish the sentence in flight, because the sentence in
	 * flight is the one that was just acted on; and doing it before `navigate`
	 * means a transport that navigates synchronously cannot leave a live
	 * recogniser behind on a page that is already unloading.
	 */
	const act = (match: ReturnType<typeof matchUtterance>) => {
		if (match.kind === 'none') {
			heardNote = missNote(match.heard);
			matchedNote = '';
			open = true;
			armIdle();
			return;
		}

		clearIdle();
		interim = '';
		session?.destroy();
		session = null;
		listening = false;
		heardNote = '';

		if (match.kind === 'go') {
			matchedNote = `Going to ${match.destination.label}.`;
			navigate(match.destination.href);
			return;
		}
		matchedNote = `${match.action.label}.`;
		runAction(match.action);
	};

	/**
	 * THE FOUR PAGE ACTIONS. `help` opens the list rather than navigating
	 * anywhere, and `stop` has already happened by the time this runs -- the
	 * session was ended above, which is why this arm does nothing but let the
	 * acknowledgement stand.
	 *
	 * The two scrolls pass `behavior: 'instant'` because `src/app.css` sets a
	 * GLOBAL `scroll-behavior: smooth`, and a smooth scroll to the bottom of a
	 * long page is several seconds of motion in answer to two words. Behind
	 * the reduced-motion check for the same reason everything else that moves
	 * is; instant is what `reduce` would have produced anyway, so the branch
	 * only ever removes motion.
	 */
	const runAction = (action: VoiceAction) => {
		if (action.id === 'help') {
			open = true;
			return;
		}
		if (action.id === 'stop') return;
		if (typeof window === 'undefined') return;
		if (action.id === 'back') {
			window.history.back();
			return;
		}
		const top = action.id === 'top' ? 0 : document.documentElement.scrollHeight;
		window.scrollTo({ top, behavior: 'instant' as ScrollBehavior });
	};

	const start = () => {
		if (!ctor || listening) return;
		errorNote = '';
		matchedNote = '';
		heardNote = '';
		open = true;
		session = new Dictation(
			ctor,
			{
				/* A committed sentence is one utterance: match it, act or refuse. */
				onFinal: (text) => act(matchUtterance(text, destinations)),
				/* Shown, never matched. The live preview is what tells a person the
				   microphone is actually hearing something; committing to a word the
				   service has not finished changing its mind about is how a half-said
				   phrase navigates. */
				onInterim: (text) => {
					interim = text;
					if (text) armIdle();
				},
				onListening: (on) => {
					listening = on;
					if (on) armIdle();
					else {
						clearIdle();
						interim = '';
					}
				},
				/* Already in the person's words -- `dictationErrorMessage` covers
				   every code the specification names -- so it is rendered verbatim. */
				onError: (message) => {
					errorNote = message;
				}
			},
			dictationLang()
		);
		session.start();
	};

	onDestroy(() => {
		clearIdle();
		session?.destroy();
		session = null;
	});

	const shown = $derived(supported && !suppressed);
</script>

{#if shown}
	<div class="vnav vnav-{place}">
		<div class="vnav-row">
			<button
				type="button"
				class="vnav-trigger tap-44"
				class:vnav-live={listening}
				aria-expanded={open}
				aria-controls="vnav-panel"
				onclick={() => (open = !open)}
			>
				<span class="vnav-glyph" aria-hidden="true">
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.7"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<rect x="9" y="3" width="6" height="11" rx="3" />
						<path d="M5 11a7 7 0 0 0 14 0" />
						<path d="M12 18v3" />
					</svg>
				</span>
				<!-- The word rides the glyph: colour is never the only signal, and a
				     microphone outline on its own says nothing about whether it is on. -->
				<span class="vnav-word">{listening ? 'Listening' : 'Voice'}</span>
			</button>
		</div>

		{#if open}
			<div class="vnav-panel" id="vnav-panel">
				<div class="vnav-head">
					<strong class="vnav-title">Voice navigation</strong>
					<button type="button" class="vnav-close tap-44" onclick={() => (open = false)}>
						Close
					</button>
				</div>

				<!-- SAID BEFORE THE MICROPHONE IS EVER ASKED FOR. The Start control is
				     below this paragraph on purpose: a person reads what it does, then
				     presses it. -->
				<p class="vnav-note">{VOICE_PRIVACY_NOTE}</p>

				<div class="vnav-controls">
					{#if listening}
						<button type="button" class="vnav-stop tap-44" onclick={stop}>Stop listening</button>
					{:else}
						<button type="button" class="vnav-start tap-44" onclick={start}>Start listening</button>
					{/if}
					<!-- A STATE READOUT THAT IS ALWAYS A WORD. The dot beside it is
					     decoration; the sentence is the signal. -->
					<span class="vnav-state" class:vnav-state-live={listening}>
						<span class="vnav-dot" aria-hidden="true"></span>
						{listening ? 'Microphone open' : 'Microphone off'}
					</span>
				</div>

				<!-- ONE LIVE REGION, ALWAYS MOUNTED, ONLY ITS TEXT MOVING. Several
				     screen readers announce only a `role="status"` they were already
				     observing, so the region exists from the first frame and the
				     branches below it fill it. -->
				<p class="vnav-live-region" role="status" aria-live="polite">
					{matchedNote || errorNote || heardNote || (interim ? `Hearing: ${interim}` : '')}
				</p>

				{#if interim}
					<p class="vnav-interim"><span class="vnav-interim-label">Hearing</span> {interim}</p>
				{/if}

				<div class="vnav-lists">
					<div class="vnav-list">
						<span class="vnav-list-head">Say one of these to go there</span>
						<ul>
							{#each destinations as d (d.id)}
								<li>
									<span class="vnav-phrase">{d.phrases[0]}</span>
									<span class="vnav-dest">{d.label}</span>
								</li>
							{/each}
						</ul>
					</div>
					<div class="vnav-list">
						<span class="vnav-list-head">On the page you are on</span>
						<ul>
							{#each VOICE_ACTIONS as a (a.id)}
								<li>
									<span class="vnav-phrase">{a.phrases[0]}</span>
									<span class="vnav-dest">{a.label}</span>
								</li>
							{/each}
						</ul>
					</div>
				</div>

				<p class="vnav-foot">
					{VOICE_SHORT_NOTE} You can also start a phrase with "go to" or "open".
				</p>
			</div>
		{/if}
	</div>
{/if}

<!--
	THE UNSUPPORTED SENTENCE HAS NO MOUNT HERE, AND THAT IS THE POINT. It is
	exported from `./commands.ts` for the surface that deliberately ASKS what
	the answer was -- the harness at `/dev/voice` -- never rendered as a
	disabled control on a real page. A control that cannot work is not shown.
-->

<style>
	/* BOTTOM LEFT, because the report control is bottom right at the same
	   z-index (90) and two docked controls in one corner is one of them covering
	   the other. Below the install prompt (1000) and below the report box's own
	   scrim (120), above ordinary page content (1). */
	.vnav-shell {
		position: fixed;
		left: max(0.75rem, env(safe-area-inset-left, 0px));
		bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
		z-index: 90;
	}
	.vnav-inline {
		position: relative;
	}
	/* INLINE, THE PANEL IS BOUNDED BY ITS CONTAINER RATHER THAN BY THE
	   VIEWPORT. Docked it starts 12px from the left edge, so `100vw - 1.5rem`
	   lands exactly inside; mounted in a padded column it starts wherever that
	   column does, and the same width then runs past the right edge --
	   measured 9px of horizontal overflow at 375px on `/dev/voice`. A harness
	   that reports an overflow its own placement created is a harness reporting
	   on itself. */
	.vnav-inline .vnav-panel {
		max-width: 100%;
	}
	/* DOCKED IN A MASTHEAD (ledger 0297): the classroom's own chrome carries
	   the control on every classroom and notebook page, so nothing floats over
	   a row's checkbox, a grip or a Return button. The trigger sits in the
	   header's row and the panel drops BELOW it, anchored to the trigger's
	   right edge -- the header is at the top of the page, so the shell's
	   upward-opening column would open off-screen. */
	.vnav-header {
		position: relative;
		flex-direction: column;
	}
	.vnav-header .vnav-panel {
		position: absolute;
		top: calc(100% + 0.35rem);
		right: 0;
		z-index: 40;
		width: min(28rem, calc(100vw - 1.5rem));
	}

	.vnav {
		display: flex;
		/* The panel opens ABOVE the trigger, so the column REVERSES: the trigger
		   is first in the DOM (it is what a tab order should reach first) and
		   stays pinned to the corner it was pressed in. */
		flex-direction: column-reverse;
		align-items: flex-start;
		gap: 0.4rem;
		/* Never wider than the viewport minus both gutters, which is what keeps a
		   375px screen free of a horizontal scrollbar. */
		max-width: calc(100vw - 1.5rem);
	}

	.vnav-row {
		display: flex;
	}

	.vnav-trigger {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		min-height: 44px;
		min-width: 44px;
		padding: 0 0.9rem;
		appearance: none;
		background: var(--surface-2, #0d1a12);
		color: var(--text-2, #c7d3c7);
		border: 1px solid var(--boundary, #4c5a4c);
		border-radius: 3px;
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.vnav-trigger:hover {
		color: var(--green, #8fe08a);
		border-color: var(--green, #8fe08a);
	}
	/* LISTENING IS THREE SIGNALS, NOT A COLOUR: the word changes to
	   "Listening", the border goes solid green, and the dot in the panel
	   animates. Any one of them alone would be the colour-only failure. */
	.vnav-live {
		color: var(--green, #8fe08a);
		border-color: var(--green, #8fe08a);
	}
	.vnav-glyph {
		display: inline-flex;
		width: 16px;
		height: 16px;
	}
	.vnav-glyph svg {
		width: 100%;
		height: 100%;
	}

	.vnav-panel {
		width: min(28rem, calc(100vw - 1.5rem));
		max-height: min(70vh, 32rem);
		overflow: auto;
		background: var(--surface-1, #121a12);
		border: 1px solid var(--boundary, #4c5a4c);
		border-radius: 3px;
		padding: 0.85rem;
		color: var(--text-1, #e4ece4);
		font-family: var(--font-display, 'Rajdhani', sans-serif);
		font-size: 0.85rem;
		line-height: 1.45;
	}

	.vnav-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	.vnav-title {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--green, #8fe08a);
	}
	.vnav-close,
	.vnav-start,
	.vnav-stop {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		padding: 0 0.8rem;
		appearance: none;
		background: none;
		border: 1px solid var(--boundary, #4c5a4c);
		border-radius: 3px;
		color: var(--text-2, #c7d3c7);
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.7rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.vnav-start {
		color: var(--green, #8fe08a);
		border-color: var(--green, #8fe08a);
	}
	.vnav-stop {
		color: var(--amber, #d8b25c);
		border-color: var(--amber, #d8b25c);
	}

	.vnav-note {
		margin: 0 0 0.6rem;
		color: var(--text-2, #c7d3c7);
		font-size: 0.8rem;
	}

	.vnav-controls {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-bottom: 0.5rem;
	}
	.vnav-state {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2, #c7d3c7);
	}
	.vnav-state-live {
		color: var(--green, #8fe08a);
	}
	.vnav-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: currentColor;
		/* Nothing is hidden in a base state: at rest the dot is fully painted and
		   untransformed, which is exactly what `reduce` leaves behind. */
		opacity: 1;
	}
	@media (prefers-reduced-motion: no-preference) {
		.vnav-state-live .vnav-dot {
			animation: vnav-pulse 1.4s ease-in-out infinite;
		}
	}
	@keyframes vnav-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.35;
		}
	}

	.vnav-live-region {
		margin: 0 0 0.4rem;
		min-height: 0;
		color: var(--text-1, #e4ece4);
		font-size: 0.82rem;
	}
	.vnav-interim {
		margin: 0 0 0.5rem;
		color: var(--text-2, #c7d3c7);
		font-size: 0.8rem;
	}
	.vnav-interim-label {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.65rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan, #93d6c8);
		margin-right: 0.35rem;
	}

	.vnav-lists {
		display: grid;
		gap: 0.75rem;
	}
	@media (min-width: 30rem) {
		.vnav-lists {
			grid-template-columns: 1fr 1fr;
		}
	}
	.vnav-list ul {
		list-style: none;
		margin: 0.3rem 0 0;
		padding: 0;
	}
	.vnav-list li {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.15rem 0;
		/* An item's automatic minimum is its min-content, so without this a long
		   destination name pushes the panel wider than the viewport. */
		min-width: 0;
	}
	.vnav-list-head {
		display: block;
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--cyan, #93d6c8);
	}
	.vnav-phrase {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.74rem;
		color: var(--text-1, #e4ece4);
		min-width: 0;
	}
	.vnav-dest {
		font-size: 0.74rem;
		color: var(--text-2, #c7d3c7);
		text-align: right;
		min-width: 0;
	}

	.vnav-foot {
		margin: 0.6rem 0 0;
		color: var(--text-2, #c7d3c7);
		font-size: 0.74rem;
	}
</style>
