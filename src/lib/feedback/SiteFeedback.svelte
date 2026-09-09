<script lang="ts">
	import { page } from '$app/state';
	import type FeedbackBox from './FeedbackBox.svelte';
	import {
		probeFeedbackCapabilities,
		type FeedbackCapabilities,
		type FeedbackEntry,
		type FeedbackResult
	} from './feedback';
	import type { uploadFeedbackScreenshot, ScreenshotUpload } from './screenshot';
	import {
		appForRouteId,
		captureMeta,
		contextOf,
		feedbackExclusion,
		type BuildStamp
	} from './context';
	import type { SupabaseClient } from '@supabase/supabase-js';

	/**
	 * THE ONE REPORT AFFORDANCE, mounted once in the root layout.
	 *
	 * COVERAGE COMES FROM THE SHELL. There are no layout resets in this repo, so
	 * the root layout wraps every page route: mounting here is the only way to
	 * get coverage a route added next month INHERITS rather than has to
	 * remember. A per-page mount is the rejected alternative, and
	 * tests/feedback-coverage.test.ts reddens if this moves back to one.
	 *
	 * CONTEXT IS CAPTURED, NEVER TYPED. Route, path, role, section, viewport,
	 * clock time and the build identifier are read off the page when the box
	 * opens. A field somebody has to fill in is a field that arrives empty, and
	 * the one thing a person reporting a problem reliably forgets is where they
	 * were when it happened.
	 *
	 * PRESENTATION + TRANSPORT IN, INTENT OUT. It fetches nothing. `submit` null
	 * (a harness with no session, or a surface with nothing to write through)
	 * REMOVES the control entirely rather than rendering one that cannot write:
	 * absence is the mechanism.
	 *
	 * SIGNED OUT IS NO LONGER ONE OF THOSE CASES, and the sign-in page is the
	 * whole reason. The person who most needs to file a report is the one whose
	 * sign-in is broken, and until now they were the one person who could not:
	 * `feedbackWriter` returned null with no session and the control vanished on
	 * exactly the page where it mattered. A signed-out visitor now gets the same
	 * control, writing through the anonymous route instead of the table, plus
	 * ONE extra field -- an optional way to be reached, which a signed-in
	 * reporter does not need because their report already carries an account.
	 *
	 * TWO PLACES IT CAN BE MOUNTED:
	 * - `place="shell"` (the default) applies the exclusion registry, so a deck
	 *   stage or a GAUNTLET viewport gets nothing floating over it.
	 * - `place="relocated"` is what those excluded surfaces mount in their OWN
	 *   chrome, plus the error boundary. An exclusion relocates the control; it
	 *   never deletes it.
	 */
	let {
		routeId,
		pathname,
		role = null,
		sectionId = null,
		build,
		submit = null,
		anonymous = false,
		place = 'shell',
		supabase = null,
		userId = null,
		uploadScreenshot = null,
		status = null,
		errorMessage = null,
		errorId = null,
		label = 'Report a problem',
		dictation = undefined,
		now = () => Date.now()
	}: {
		routeId: string | null;
		pathname: string;
		role?: string | null;
		sectionId?: string | null;
		build: BuildStamp;
		/**
		 * The write. Null removes the control. Handed in so the dev harness runs
		 * the identical component against an in-memory sink.
		 */
		submit?: ((entry: FeedbackEntry) => Promise<FeedbackResult>) | null;
		/**
		 * Whether this report will arrive with no account behind it. It changes
		 * TWO things and nothing else: the box offers an optional contact field,
		 * and the note says what "anonymous" actually means here rather than
		 * leaving somebody to guess whether they have been identified.
		 *
		 * A SEPARATE SIGNAL FROM `submit`, deliberately. Which transport is in
		 * play is the layout's business; what the person is told about their own
		 * report is not something to infer from a function reference.
		 */
		anonymous?: boolean;
		place?: 'shell' | 'relocated';
		/**
		 * WHAT A SCREENSHOT NEEDS, AND WHY IT IS READ OFF `page.data` RATHER THAN
		 * PASSED IN.
		 *
		 * This component is mounted in five places, four of which are outside the
		 * feedback subsystem (the root layout, the error boundary, the GAUNTLET
		 * layout and the deck route). Requiring each of them to thread a client
		 * would mean the attach control appearing on whichever of them somebody
		 * remembered -- the exact per-page-coverage failure the shell mount exists
		 * to end. So the default is the client the root layout already puts in
		 * `page.data`, read the way `ProfileMenu` reads `userProfile` from
		 * `$app/state`, and every existing mount inherits the control unchanged.
		 *
		 * BOTH ARE OVERRIDABLE, so a dev harness can hand in its own pair (or
		 * none) without a session, and so a surface that must not offer an attach
		 * can say so by handing in a null `uploadScreenshot` below.
		 *
		 * `submit` IS DELIBERATELY NOT DERIVED FROM THESE. Which transport writes
		 * the report is still the mounting layout's decision, unchanged; this pair
		 * answers a narrower question -- can these bytes reach the bucket -- and
		 * conflating the two is how a box would start writing through a path its
		 * host did not choose.
		 */
		supabase?: SupabaseClient | null;
		userId?: string | null;
		/**
		 * The screenshot transport, overriding the one built from the pair above.
		 * Null with a client present still gets the built one; pass a function to
		 * replace it, which is what a harness does.
		 */
		uploadScreenshot?: ((file: File) => Promise<ScreenshotUpload>) | null;
		/** The error boundary fills these in; nothing else does. */
		status?: number | null;
		errorMessage?: string | null;
		errorId?: string | null;
		label?: string;
		/** Handed straight to the box: a stand-in speech constructor for a
		 * harness, `null` to refuse dictation, `undefined` to ask the browser. */
		dictation?: import('./dictation').SpeechRecognitionCtor | null;
		/** Injectable clock, so a harness can pin the captured timestamp. */
		now?: () => number;
	} = $props();

	const excluded = $derived(
		place === 'shell' ? feedbackExclusion(routeId, { hasError: status !== null }) : null
	);

	const shown = $derived(!!submit && !excluded);

	/**
	 * THE CLIENT AND THE VIEWER, resolved once: the prop when a caller passed
	 * one, otherwise what the root layout put in `page.data`. `page.data.claims`
	 * is what every other surface reads the signed-in subject from.
	 */
	const client = $derived(
		supabase ?? ((page.data as { supabase?: SupabaseClient | null })?.supabase ?? null)
	);
	const viewer = $derived(
		userId ?? ((page.data as { claims?: { sub?: string } })?.claims?.sub ?? null)
	);

	let open = $state(false);

	/**
	 * THE BOX IS NOT IN THE SHELL CHUNK, AND THE CLICK MUST NOT WAIT FOR IT.
	 *
	 * This component is mounted once in the root layout, so everything it
	 * imports statically ships on EVERY route. Ledger 0107's loading audit
	 * measured `FeedbackBox` (and `uploadFeedbackScreenshot` beside it) at
	 * about a quarter of the shell for a panel that renders only behind
	 * `{#if open}`. So both are `import()`ed, and the type-only imports above
	 * are what keep the props typed without pulling the modules in.
	 *
	 * THE TRADE IS A FETCH ON THE CLICK PATH, AND IT IS PAID BEFORE THE CLICK.
	 * The chunk is requested the first time any of these happens, whichever
	 * comes first:
	 *   * the component MOUNTS -- one macrotask after hydration, which is the
	 *     earliest the shell can ask for anything without being on the path
	 *     to interactivity. The bytes still arrive on every page load; what
	 *     moved is WHEN: after the page is interactive rather than before it.
	 *     An IDLE callback was the first shape and was measured out (prompt
	 *     0111): on a throttled link a click landing in the first second
	 *     after hydration waited a median 640ms for the chunk against 97ms
	 *     on the static import, because idle had not come yet. Asking at
	 *     mount shrinks that window to the fetch itself, in flight.
	 *   * the pointer ENTERS the trigger, it gains FOCUS, or the pointer goes
	 *     DOWN on it -- redundant while the mount-time fetch succeeded, and the
	 *     retry when it did not: a failed fetch forgets itself, and the next
	 *     hover or tab asks again before the click does.
	 * None of this runs on the server, and none of it runs twice.
	 *
	 * IF THE CHUNK IS NOT THERE WHEN THE CLICK LANDS, the click still does
	 * everything it did: the meta is captured at the press (the viewport, the
	 * clock, the route as they were), `open` is set, and the box mounts the
	 * moment the module resolves. A fetch that FAILS (offline, a deploy that
	 * rotated the hashes under an open tab) is said out loud beside the
	 * trigger and the next press tries again, because a report control that
	 * does nothing on the one day the network is broken is the worst possible
	 * version of this control.
	 */
	type BoxModule = { default: typeof FeedbackBox };
	type ShotModule = { uploadFeedbackScreenshot: typeof uploadFeedbackScreenshot };
	let Box = $state<typeof FeedbackBox | null>(null);
	let uploader = $state<typeof uploadFeedbackScreenshot | null>(null);
	let loadFailed = $state(false);
	let loading: Promise<void> | null = null;

	function preload(): Promise<void> {
		if (loading) return loading;
		loading = Promise.all([
			import('./FeedbackBox.svelte') as Promise<BoxModule>,
			import('./screenshot') as Promise<ShotModule>
		]).then(
			([box, shot]) => {
				Box = box.default;
				uploader = shot.uploadFeedbackScreenshot;
				loadFailed = false;
			},
			() => {
				// Forget the attempt so the next press tries again, and say so.
				loading = null;
				loadFailed = true;
			}
		);
		return loading;
	}

	$effect(() => {
		// The mount-time fetch. `shown` is the one tracked read, so a surface
		// with no control asks for nothing; nothing injected is called, and
		// `preload` touches only this component's own state. A macrotask, not
		// a microtask, so hydration's own flush finishes first.
		if (!shown) return;
		const id = setTimeout(() => void preload(), 0);
		return () => clearTimeout(id);
	});

	/**
	 * WHAT THE BACKEND IN FRONT OF US CAN TAKE (0170), probed ONCE PER OPEN.
	 *
	 * Migrations here are applied by hand, so a deployment before 0170 is a real
	 * state, and an attach control offered against it would upload bytes and
	 * then fail the row insert on a column PostgREST does not know -- which is
	 * the report lost, on the one surface that exists to catch lost things. The
	 * honest starting value is BOTH FALSE: "cannot tell" never reads as "yes".
	 */
	let capabilities = $state<FeedbackCapabilities>({ tried: false, screenshot: false });
	let probed = $state(false);
	/** Captured at OPEN, not at render: the viewport and the user agent are what
	 * they were looking at when they decided something was wrong. */
	let captured = $state<Record<string, unknown>>({});

	function openBox() {
		void preload();
		const viewport =
			typeof window === 'undefined'
				? null
				: { w: window.innerWidth, h: window.innerHeight };
		const userAgent = typeof navigator === 'undefined' ? null : navigator.userAgent;
		// PROBED FROM THE HANDLER, NEVER FROM AN `$effect`. An effect that calls a
		// caller-supplied client takes a dependency on whatever that client
		// touches reactively, which is `effect_update_depth_exceeded` on mount in
		// the general case; a click handler has no tracking context at all.
		probed = false;
		// ONLY WHERE THE ANSWER COULD BE YES. With no client or no viewer the
		// attach control is refused locally and for a local reason, so asking the
		// backend would be a round trip whose answer changes nothing.
		if (client && viewer) {
			void probeFeedbackCapabilities(client).then((caps) => {
				capabilities = caps;
				probed = true;
			});
		}
		captured = captureMeta({
			routeId,
			pathname,
			role,
			sectionId,
			viewport,
			userAgent,
			at: new Date(now()).toISOString(),
			build,
			status,
			errorMessage,
			errorId
		});
		open = true;
	}

	/**
	 * THE SCREENSHOT TRANSPORT, or nothing. Three conditions, and each one has a
	 * sentence of its own below rather than a shared shrug:
	 *   * a caller-supplied transport always wins (the harness);
	 *   * otherwise a client AND a viewer, because the object key is the
	 *     viewer's own folder and the storage policy compares it to auth.uid();
	 *   * and the probe having actually said yes.
	 */
	const attach = $derived.by(() => {
		if (uploadScreenshot) return uploadScreenshot;
		if (!client || !viewer || !capabilities.screenshot) return null;
		// The transport rides the same lazy chunk as the box; the box is never
		// on screen before it, so a null here is never what a person sees.
		const up = uploader;
		if (!up) return null;
		const c = client;
		const uid = viewer;
		return (file: File) => up(c, uid, file);
	});

	/**
	 * WHY THERE IS NO ATTACH CONTROL, when there is none. A control that is
	 * absent for a reason says the reason: on a form where a screenshot is
	 * offered to everybody else, its silent absence reads as a bug.
	 *
	 * NOTHING IS SAID WHILE THE PROBE IS STILL OUT. "Cannot tell" is not a
	 * sentence worth putting on screen for the few hundred milliseconds it lasts,
	 * and a note that appears and then vanishes is worse than one that never did.
	 */
	const attachNote = $derived.by(() => {
		if (attach) return null;
		// BEING SIGNED OUT IS NOT A QUESTION FOR THE BACKEND, so this answer does
		// not wait on the probe. It used to, and the browser pass caught it: the
		// sentence rendered NOWHERE on a surface with no session, because the
		// probe against an unreachable origin never resolved -- so the one case
		// this note exists for was the one case it was missing from.
		if (!client || !viewer)
			return 'Signing in lets you attach a screenshot. Reports without one are read just the same.';
		// The other case genuinely is a question for the backend, and nothing is
		// said while the answer is still out: a note that appears and then
		// vanishes is worse than one that never did.
		if (!probed) return null;
		return 'Attaching a screenshot is not switched on for this deployment yet.';
	});

	const noteFor = $derived(
		status === null
			? anonymous
				? 'Something confusing, broken, or missing? You are not signed in, so this report carries no name. The page you are on, your browser and the build are attached automatically.'
				: 'Something confusing, broken, or missing? The page you are on, your role, your browser and the build are attached automatically.'
			: anonymous
				? `This page failed with a ${status}. You are not signed in, so this report carries no name. The status, the route, your browser and the build are attached automatically, so say what you were trying to do.`
				: `This page failed with a ${status}. The status, the route, your browser and the build are attached automatically, so say what you were trying to do.`
	);
</script>

{#if shown}
	<div class="sfb sfb-{place}">
		<button
			type="button"
			class="sfb-trigger"
			class:sfb-trigger-error={status !== null}
			onclick={openBox}
			onpointerenter={preload}
			onpointerdown={preload}
			onfocus={preload}
		>
			<span class="sfb-glyph" aria-hidden="true">
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.7"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M12 3l9 16H3z" />
					<path d="M12 9v4" />
					<path d="M12 16.5v.01" />
				</svg>
			</span>
			<span class="sfb-word">{label}</span>
		</button>
		{#if loadFailed}
			<!-- Said beside the control, not swallowed: the one thing worse than a
			     report window that will not open is one that will not say so. -->
			<p class="sfb-load-failed" role="alert">
				The report window did not load. Check the connection and press it again.
			</p>
		{/if}
	</div>
{/if}

{#if open && submit && Box}
	<div class="sfb-host">
		<Box
			app={appForRouteId(routeId, pathname)}
			context={contextOf({ routeId, pathname })}
			meta={captured}
			{submit}
			askContact={anonymous}
			uploadScreenshot={attach}
			screenshotNote={attachNote}
			{dictation}
			onClose={() => (open = false)}
			title={status === null ? 'Report a problem' : `Report this ${status}`}
			note={noteFor}
		/>
	</div>
{/if}

<style>
	.sfb-shell {
		position: fixed;
		right: max(0.75rem, env(safe-area-inset-right, 0px));
		bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
		/* Below the box's own scrim (120) and below the install prompt (1000),
		   above ordinary page content (1). */
		z-index: 90;
	}
	.sfb-relocated {
		display: inline-flex;
	}

	.sfb-trigger {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		/* 44px, the tap-target floor. */
		min-height: 44px;
		min-width: 44px;
		padding: 0 0.9rem;
		appearance: none;
		background: var(--surface-2, #0d1a12);
		border: 1px solid var(--hairline, rgba(140, 220, 160, 0.22));
		border-radius: 999px;
		color: var(--text-2, #9fb8a6);
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.7rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
	}
	.sfb-relocated .sfb-trigger {
		box-shadow: none;
	}
	.sfb-trigger:hover,
	.sfb-trigger:focus-visible {
		color: var(--text-1, #dff3e3);
		border-color: var(--green, #3ddc84);
		outline: none;
	}
	.sfb-trigger-error {
		/* An error page is the one place this is the primary action. */
		color: var(--text-1, #dff3e3);
		border-color: var(--green, #3ddc84);
	}
	.sfb-glyph {
		display: grid;
		place-items: center;
		width: 0.95rem;
		height: 0.95rem;
	}
	.sfb-glyph svg {
		width: 100%;
		height: 100%;
	}
	/* Colour is never the only signal, and a tooltip is not discoverable: the
	   word rides beside the glyph at every width. */
	.sfb-word {
		white-space: nowrap;
	}

	@media (prefers-reduced-motion: no-preference) {
		.sfb-trigger {
			transition:
				color 140ms ease,
				border-color 140ms ease;
		}
	}

	.sfb-load-failed {
		margin: 0.4rem 0 0;
		max-width: 16rem;
		color: var(--amber, #d08030);
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.68rem;
		line-height: 1.4;
	}
	.sfb-shell .sfb-load-failed {
		/* Above the floating pill, which sits at the bottom edge: the pill
		   stays where it was and the sentence takes no space it could push. */
		position: absolute;
		right: 0;
		bottom: calc(100% + 0.4rem);
		text-align: right;
	}

	/* A control that cannot be pressed on paper is ink. */
	@media print {
		.sfb {
			display: none !important;
		}
	}

	/*
	   THE IDEA THEME FOR THE REPORT WINDOW, and the reason it is written ON THE
	   SCRIM rather than on this host.

	   This block used to declare the same tokens on `.sfb-host` itself, and it
	   never painted anything: `FeedbackBox` declares every `--fb-*` token on
	   `.fb-scrim`, a DESCENDANT, and a descendant's own declaration beats an
	   inherited one. So the box wore its neutral blue defaults on every portal
	   surface while this file said it was handing the portal's tokens down --
	   "it is blue currently and looks kinda out of place" (Mr. Pina, prompt
	   0111). `:global(.fb-scrim)` under this host is the component's own
	   documented override shape, the one GREENLINE has used all along.

	   EVERY VALUE IS A DESIGN-SYSTEM TOKEN READ BY NAME, NEVER A LITERAL, which
	   is what makes one block right in more than one room. Mounted in the shell
	   it reads `src/lib/design-system/colors.css`; mounted in the GAUNTLET
	   footer it sits inside `.gt-root`, which re-points `--green`, `--bg0/1/2`
	   and both font tokens, so the same box comes out in the VIEWPORT's neon on
	   graphite with no GAUNTLET branch anywhere. A site theme (`data-theme`)
	   moves it the same way.

	   THE INKS ARE THE MEASURED ONES, not the obvious ones (prompt 0111, all
	   three grounds of the box, portal / matrix / GAUNTLET):
	     * secondary copy is `--text-2` (worst 5.51:1 on --bg2), because `--dim`
	       is the register's own dim token and fails at 4.24 on --bg2, which is
	       exactly the ground a placeholder sits on;
	     * the danger tone is `--amber` (worst 4.60), because `--crimson` reads
	       3.88 on --bg2 and is reserved for live/rec status anyway;
	     * every line is `--boundary` (worst 3.21 against a 3:1 non-text floor):
	       the box has ONE token for a control's edge and a divider, and a
	       control's outer edge is what the load-bearing token exists for.
	   GREENLINE is untouched by construction: it mounts `FeedbackBox` itself,
	   under its own `.gp-feedback :global(.fb-scrim)` override, and every new
	   hook defaults to the literal the component painted before.
	*/
	.sfb-host :global(.fb-scrim) {
		--fb-bg: var(--bg1);
		--fb-bg-deep: var(--bg0);
		--fb-shade: color-mix(in srgb, var(--bg0) 82%, transparent);
		--fb-ink: var(--white);
		--fb-ink-dim: var(--text-2);
		--fb-ink-faint: var(--text-2);
		--fb-line: var(--boundary);
		--fb-line-strong: var(--boundary);
		--fb-accent: var(--green);
		/* The FULL accent on the primary edge and the selected chip, not the
		   component's 45% / 55% tints: measured, the tints of this green read
		   2.37:1 and 2.83:1 against --bg2, and a control's outer edge owes 3:1.
		   `.btn` in the shell draws its edge in --green for the same reason. */
		--fb-accent-edge: var(--green);
		--fb-accent-edge-on: var(--green);
		--fb-danger: var(--amber);
		/* An open microphone is live/rec, which is what --crimson is reserved
		   for; it paints a dot and an edge beside the word STOP, never a word. */
		--fb-live: var(--crimson);
		--fb-field: var(--bg2);
		--fb-chip: var(--bg2);
		--fb-control: var(--bg2);
		--fb-font: var(--font-display);
		--fb-font-mono: var(--font-mono);
	}
</style>
