<script lang="ts">
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import type FeedbackBox from './FeedbackBox.svelte';
	import FeedbackTrigger from './FeedbackTrigger.svelte';
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
		feedbackConsoleHref,
		feedbackExclusion,
		FEEDBACK_PROMPT,
		REPORT_LABEL,
		type BuildStamp
	} from './context';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { holdDeployReload } from '$lib/shell/deploy-safety';
	import { stepInstallPopupAside } from '$lib/install-app';
	import { provideSiteFeedbackOpener } from './opener';

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
	 * THREE PLACES IT CAN BE MOUNTED:
	 * - `place="shell"` (the default) is the root layout's: the button in the
	 *   bottom-right corner of every page, the same place everywhere (ledger
	 *   0396), minus the few rooms the exclusion registry names. It is also the
	 *   window every other way in opens (`openSiteFeedback`, the error card's
	 *   "Tell us what happened").
	 * - `place="relocated"` draws the button inline, in a host's own layout. No
	 *   production surface uses it since ledger 0396 (the classroom header, the
	 *   Armory header, the deck bar, the projector strip and the error card all
	 *   took the corner button back); `/dev/feedback` mounts several windows side
	 *   by side with it, which the corner could not hold.
	 * - `place="embed"` is `/feedback/embed` (ledger 0396): the window alone,
	 *   with no button of its own, opened by `openWindow()` on behalf of a legacy page
	 *   whose real `FeedbackTrigger` was server-rendered into its bytes. It
	 *   reports the box closing through `onClose`, which is what hides the
	 *   frame. The button and the box are therefore the same two components on
	 *   every surface that has either; see `$lib/feedback/embed.ts`.
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
		label = REPORT_LABEL,
		dictation = undefined,
		micLevel = undefined,
		consoleHref = undefined,
		onClose = undefined,
		onstate = undefined,
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
		place?: 'shell' | 'relocated' | 'embed';
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
		/** Handed straight to the box, the same three ways: the loudness meter. */
		micLevel?: import('./dictation').MicMeter | null;
		/**
		 * THE CONSOLE LINK IN THE BOX'S HEADER (report R15). `undefined`, what
		 * every real mount passes, DERIVES it: an admin gets
		 * `FEEDBACK_CONSOLE_PATH` anywhere but the console itself, from the
		 * `isAdmin` the root layout already puts in `page.data`, so no mount
		 * site threads anything and the classroom header's docked control gets
		 * it with no edit. `null` refuses it; a string is used as given, which
		 * is how a harness shows the admin arrangement with no session.
		 */
		consoleHref?: string | null;
		/** Called after the box closes, however it closed. The embed hides its frame on it. */
		onClose?: () => void;
		/**
		 * The window's life, for the embed: `opened` once the box is on screen,
		 * `failed` when its code could not load. Nothing else listens.
		 */
		onstate?: (state: 'opened' | 'failed') => void;
		/** Injectable clock, so a harness can pin the captured timestamp. */
		now?: () => number;
	} = $props();

	const excluded = $derived(
		place === 'shell' ? feedbackExclusion(routeId, { hasError: status !== null }) : null
	);

	/** The button. The embed has none: its button is on the page that framed it. */
	const shown = $derived(!!submit && !excluded && place !== 'embed');
	/** Whether this mount can open a box at all, button or not. */
	const live = $derived(!!submit && !excluded);

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

	const consoleLink = $derived(
		consoleHref !== undefined
			? consoleHref
			: feedbackConsoleHref((page.data as { isAdmin?: unknown })?.isAdmin, pathname)
	);

	let open = $state(false);

	/**
	 * AN OPEN REPORT HOLDS OFF A DEPLOY RELOAD ($lib/shell/deploy-safety): the
	 * back button while somebody is typing one must not take the new version of
	 * the site by reloading and throwing the report away. Open is the signal,
	 * rather than open with something typed, because what is typed lives in the
	 * box, and a hold is cheap -- it only postpones the upgrade to the next
	 * navigation. It does not ask on unload; closing a tab with an empty box
	 * open is not a loss worth a question.
	 */
	$effect(() => {
		if (!open) return;
		return holdDeployReload('a feedback box is open');
	});

	/**
	 * THE PHONE INSTALL POP-UP STEPS ASIDE WHILE THE WINDOW IS OPEN, and comes
	 * back when it closes, unanswered, as it does after the Install app key's
	 * card (`$lib/install-app`). It floats at 1000 over everything, so it was
	 * drawn over this window's shade and its controls: Cancel and Send on an
	 * iPad, the contact field on an iPhone (integration review, ledger 0396).
	 * `open` is the one tracked read. The call is UNTRACKED because it tells
	 * the pop-up synchronously, and the pop-up's own handler reads its state,
	 * which would otherwise become this effect's dependency.
	 */
	$effect(() => {
		if (!open) return;
		return untrack(() => stepInstallPopupAside());
	});

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

	/**
	 * THE OTHER WAYS IN (ledger 0396). The button's own window is the one every
	 * other entry point opens, so a surface that wants a second way in calls
	 * `openSiteFeedback()` instead of mounting a second window with its own
	 * captured context. Only a mount with a button registers: the embed's
	 * window is opened by the page that framed it, never by this page.
	 */
	$effect(() => {
		if (!shown) return;
		return provideSiteFeedbackOpener(() => openBox());
	});

	$effect(() => {
		// The mount-time fetch. `live` is the one tracked read, so a surface
		// with no control asks for nothing; nothing injected is called, and
		// `preload` touches only this component's own state. A macrotask, not
		// a microtask, so hydration's own flush finishes first.
		if (!live) return;
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

	/**
	 * What the page that framed the embed said about itself at the press: its
	 * live path and, on the Ledger, which tab is showing. Empty everywhere else.
	 */
	let opener = $state<{ pathname: string | null; tab: string | null }>({ pathname: null, tab: null });

	/**
	 * OPEN THE WINDOW FROM OUTSIDE (the embed's open message). Exactly what a
	 * press on the button does, plus the opener's live path and tab, which only
	 * the framing page can know.
	 */
	export function openWindow(context: { pathname?: string | null; tab?: string | null } = {}) {
		opener = { pathname: context.pathname ?? null, tab: context.tab ?? null };
		openBox();
	}

	/** Close it from outside (the framing page heard Escape itself). */
	export function closeWindow() {
		if (!open) return;
		closeBox();
	}

	/**
	 * WHERE FOCUS GOES BACK TO (ledger 0396). A dialog hands focus back to what
	 * opened it: the corner button after a press, the error card's "Tell us what
	 * happened" after that, and the page is never left with focus on `<body>`
	 * at the top of the document. Captured at OPEN, before the box takes focus.
	 * The embed returns nothing here: its frame is hidden on close, and the
	 * page that framed it puts focus back on its own button.
	 */
	let returnTo: HTMLElement | null = null;
	let trigger = $state<ReturnType<typeof FeedbackTrigger> | null>(null);

	function closeBox() {
		open = false;
		onClose?.();
		if (place === 'embed' || typeof document === 'undefined') return;
		const back = returnTo;
		returnTo = null;
		// After the box has unmounted, so nothing inside it takes focus back.
		queueMicrotask(() => {
			if (back && back.isConnected && back !== document.body) back.focus({ preventScroll: true });
			else trigger?.focus();
		});
	}

	function openBox() {
		if (place !== 'embed' && typeof document !== 'undefined') {
			const active = document.activeElement;
			returnTo = active instanceof HTMLElement && active !== document.body ? active : null;
		}
		void preload().then(() => {
			if (loadFailed) onstate?.('failed');
		});
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
			pathname: opener.pathname ?? pathname,
			role,
			sectionId,
			viewport,
			userAgent,
			at: new Date(now()).toISOString(),
			build,
			status,
			errorMessage,
			errorId,
			tab: opener.tab
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

	/**
	 * THE BOX IS ON SCREEN. Said once per open, from the host's mount, and on a
	 * microtask so the embed's handler (a `postMessage`) runs outside any
	 * tracking context: it is caller-supplied code.
	 */
	function announceOpened(node: HTMLElement) {
		queueMicrotask(() => onstate?.('opened'));
		/*
		 * TAB STAYS IN THE BOX WHILE IT IS OPEN (ledger 0396). The box is a modal
		 * dialog (`aria-modal`), so Tab past its last control comes back to its
		 * first, and Shift+Tab the other way, rather than walking into the page
		 * under the shade. Bound on this host, which the focused control's
		 * keydown bubbles through before the box's own window handler sees it.
		 */
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return;
			const box = node.querySelector<HTMLElement>('.fb-box');
			if (!box) return;
			const items = Array.from(
				box.querySelectorAll<HTMLElement>(
					'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
				)
			).filter((el) => el.getClientRects().length > 0 && !el.closest('[inert]'));
			if (items.length === 0) {
				e.preventDefault();
				box.focus();
				return;
			}
			const first = items[0];
			const last = items[items.length - 1];
			const active = document.activeElement;
			const inside = active instanceof HTMLElement && box.contains(active) && active !== box;
			if (e.shiftKey && (!inside || active === first)) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && (!inside || active === last)) {
				e.preventDefault();
				first.focus();
			}
		};
		node.addEventListener('keydown', onKey);
		return { destroy: () => node.removeEventListener('keydown', onKey) };
	}

	const noteFor = $derived(
		status === null
			? anonymous
				? `${FEEDBACK_PROMPT} You are not signed in, so this report carries no name. The page you are on, your browser and the build are attached automatically.`
				: `${FEEDBACK_PROMPT} The page you are on, your role, your browser and the build are attached automatically.`
			: anonymous
				? `This page failed with a ${status}. You are not signed in, so this report carries no name. The status, the route, your browser and the build are attached automatically, so say what you were trying to do.`
				: `This page failed with a ${status}. The status, the route, your browser and the build are attached automatically, so say what you were trying to do.`
	);
</script>

{#if shown}
	<FeedbackTrigger
		bind:this={trigger}
		place={place === 'relocated' ? 'relocated' : 'shell'}
		{label}
		error={status !== null}
		{loadFailed}
		pending={open && !Box && !loadFailed}
		onopen={openBox}
		onpreload={preload}
	/>
{/if}

{#if open && submit && Box}
	<div class="sfb-host" use:announceOpened>
		<Box
			app={appForRouteId(routeId, pathname)}
			context={contextOf({ routeId, pathname })}
			meta={captured}
			{submit}
			askContact={anonymous}
			uploadScreenshot={attach}
			screenshotNote={attachNote}
			{dictation}
			{micLevel}
			offerHorizon
			consoleHref={consoleLink}
			onClose={closeBox}
			title={status === null ? REPORT_LABEL : `Report this ${status}`}
			note={noteFor}
		/>
	</div>
{/if}

<style>
	/* THE BUTTON'S OWN RULES LIVE IN `FeedbackTrigger.svelte` (ledger 0396),
	   so the Coin Ledger and an assignment handout, which server-render that
	   component into the bytes they serve, are drawn by the same stylesheet as
	   every Svelte page. What stays here is the box's theme. */

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

	   THE BOX MATCHES THE ROOM IT OPENS IN (report 35, 2026-09-25: on /frc
	   "the report a problem pop-up should exactly match the color scheme of
	   the page"). The shell's mount is a SIBLING of every room's wrapper, not
	   a descendant, so a room's re-pointed tokens (`.frc-root`'s paper,
	   `.fg-root`'s forge) can never reach it by inheritance -- which is why
	   the GAUNTLET case above works (it mounts INSIDE `.gt-root`) and the
	   FRC one never did. So every value here reads a ROOM HOOK first, with
	   the site token as the fallback (the `--disc-accent` / `--body-link`
	   mechanism), and a room that is not the site theme declares the hooks
	   on `body:has(.<room>)` in its own stylesheet, where `body` is the
	   common ancestor. The hooks are:
	     --fb-room-bg, --fb-room-bg-deep, --fb-room-field   the grounds
	     --fb-room-shade                                    the veil
	     --fb-room-ink, --fb-room-ink-muted                 text, 4.5:1
	     --fb-room-edge                                     control edges, 3:1
	     --fb-room-accent                                   primary action
	     --fb-room-focus                                    the focus ring, 3:1
	     --fb-room-danger, --fb-room-live                   refusal, open mic
	     --fb-room-ok, --fb-room-info, --fb-room-warn,
	     --fb-room-error                                    the save line
	     --fb-room-lift                                     the box's drop
	   NO TYPEFACE HOOK, AND THERE MUST NOT BE ONE (ledger 0396, review round
	   4). The box always sets the site's own faces, so it has the home box's
	   metrics, its height and its keys in the same place in every room: FRC's
	   Roboto and FSP's system stack, handed in through a font hook, made the
	   box 869px of content in an 826px box at 1440x900 and put SEND below its
	   edge. A room changes the box's colours, never its type.
	   A room sets only what differs; the rest falls through to the site
	   theme. An in-scope room (the classroom, the notebook, the home page)
	   sets none, so the box follows the site theme there -- Space White
	   included. Every value a room declares is measured in its own file.
	*/
	.sfb-host :global(.fb-scrim) {
		--fb-bg: var(--fb-room-bg, var(--bg1));
		--fb-bg-deep: var(--fb-room-bg-deep, var(--bg0));
		--fb-shade: var(--fb-room-shade, color-mix(in srgb, var(--bg0) 82%, transparent));
		--fb-ink: var(--fb-room-ink, var(--white));
		--fb-ink-dim: var(--fb-room-ink-muted, var(--text-2));
		--fb-ink-faint: var(--fb-room-ink-muted, var(--text-2));
		--fb-line: var(--fb-room-edge, var(--boundary));
		--fb-line-strong: var(--fb-room-edge, var(--boundary));
		--fb-accent: var(--fb-room-accent, var(--green));
		/* The FULL accent on the primary edge and the selected chip, not the
		   component's 45% / 55% tints: measured, the tints of this green read
		   2.37:1 and 2.83:1 against --bg2, and a control's outer edge owes 3:1.
		   `.btn` in the shell draws its edge in --green for the same reason. */
		--fb-accent-edge: var(--fb-room-accent, var(--green));
		--fb-accent-edge-on: var(--fb-room-accent, var(--green));
		--fb-danger: var(--fb-room-danger, var(--amber));
		/* An open microphone is live/rec, which is what --crimson is reserved
		   for; it paints a dot and an edge beside the word STOP, never a word. */
		--fb-live: var(--fb-room-live, var(--crimson));
		--fb-field: var(--fb-room-field, var(--bg2));
		--fb-chip: var(--fb-room-field, var(--bg2));
		--fb-control: var(--fb-room-field, var(--bg2));
		--fb-font: var(--font-display);
		--fb-font-mono: var(--font-mono);
		/* THE SITE'S FOCUS RING ON EVERY KEY AND FIELD IN THE BOX (review round
		   3): the global `:focus-visible` rule's 2px of `--focus-ring` at a 2px
		   offset, which the box's own `outline: none` used to cancel. A room
		   hands in its own ring colour through `--fb-room-focus`. */
		--fb-focus-ring: 2px solid var(--fb-room-focus, var(--focus-ring, #5abda8));
		/* THE SAVE INDICATOR INSIDE THE BOX reads its own four hooks with the
		   raw semantic tokens as fallback, and those are tuned for a dark
		   plate: on a light room's paper "Unsaved changes" in --amber is about
		   3:1. So the box hands them the room's measured inks when a room has
		   them, and the same raw tokens when it does not -- which is exactly
		   what the indicator read before. */
		--save-ok: var(--fb-room-ok, var(--green));
		--save-info: var(--fb-room-info, var(--cyan));
		--save-warn: var(--fb-room-warn, var(--amber));
		/* NOT --crimson, and the same call `--fb-danger` makes above: the
		   "Not saved" line sits on the box's plate, where --crimson measured
		   4.14:1 on the portal theme against --amber's 4.90, and --crimson is
		   reserved for live and rec. The word and the "!" mark carry the state;
		   the hue only has to be readable. */
		--save-error: var(--fb-room-error, var(--amber));
	}

	/*
	   GAUNTLET'S ROOM HOOKS, AND WHY THEY ARE DECLARED HERE (ledger 0396).

	   GAUNTLET is not an exception to the one feedback window (Mr. Pina): its
	   button floats at the bottom right like the home page's, drawn by the root
	   layout's mount, which is a SIBLING of `.gt-root` -- so the VIEWPORT's
	   re-pointed tokens (`--green`, `--bg0/1/2`, its fonts), which reached the
	   box for free while it was relocated INSIDE `.gt-root`, no longer reach
	   it. The room therefore declares the hooks on `body:has(.gt-root)`, the
	   common ancestor, the way FRC, FSP, the Foundry and the Tournaments do in
	   their own stylesheets. GAUNTLET's own stylesheet is its design system and
	   this bundle does not edit it, so the block lives with the component it
	   styles. Every value is a VIEWPORT token's literal (viewport.css), named
	   beside it. No typeface is declared: the VIEWPORT's `--font-body` and
	   `--font-data` are the site's Rajdhani and Share Tech Mono, which the box
	   sets in every room anyway.

	   Measured, WCAG 2.x relative luminance, against the box's three grounds
	   (panel #0a1014 / void #04070a / panel-2 #0e161b):
	     ink     #e8fff0   18.22 / 19.23 / 17.40   (--white)
	     muted   #5f8a78    4.92 /  5.19 /  4.69   (--dim)
	     edge    #5f8a78    4.92 /  5.19 /  4.69   (bar 3.0)
	     accent  #00ff41   14.02 / 14.79 / 13.38   (--green)
	     refusal #ff3355    5.34 /  5.63 /  5.10   (--crimson: GAUNTLET reserves
	                                                it for live, rec and ERROR, and a
	                                                refusal is an error state)
	     info    #00f0ff   (--cyan, the knowledge family; well above 4.5)
	     focus   #c8ff00   16.19 / 17.08 / 15.45   (--lime: `.gt-root :focus-visible`
	                                                draws its ring in it)
	   The warning line keeps the site's amber (#d08030, 5.93 on panel-2):
	   GAUNTLET's two other warm tones are reserved for a run state.
	*/
	:global(body:has(.gt-root)) {
		--fb-room-bg: #0a1014; /* --panel */
		--fb-room-bg-deep: #04070a; /* --void */
		--fb-room-field: #0e161b; /* --panel-2 */
		--fb-room-shade: rgba(4, 7, 10, 0.82); /* --void, as a veil */
		--fb-room-ink: #e8fff0; /* --white */
		--fb-room-ink-muted: #5f8a78; /* --dim */
		--fb-room-edge: #5f8a78; /* --dim, a control's outer edge */
		--fb-room-accent: #00ff41; /* --green */
		--fb-room-focus: #c8ff00; /* --lime, the VIEWPORT's own focus ring */
		--fb-room-danger: #ff3355; /* --crimson */
		--fb-room-live: #ff3355; /* --crimson */
		--fb-room-ok: #00ff41; /* --green */
		--fb-room-info: #00f0ff; /* --cyan */
		--fb-room-error: #ff3355; /* --crimson */
		--fb-room-lift: 0 6px 18px rgba(0, 0, 0, 0.55);
	}
	/* GAUNTLET DRAWS ITS OWN CURSOR, and hides the native one only inside
	   `.gt-root` (viewport.css, `.gt-cursor-on`). The button and the box sit
	   outside that root, so without this the crosshair and the native arrow
	   were both drawn over them. The same rule, reaching the window that floats
	   over the room; while the crosshair is off, the native cursor is untouched. */
	:global(body:has(.gt-root.gt-cursor-on) :is(.sfb, .sfb *, .fb-scrim, .fb-scrim *)) {
		cursor: none !important;
	}
</style>
