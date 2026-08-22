<script lang="ts">
	import FeedbackBox from './FeedbackBox.svelte';
	import type { FeedbackEntry, FeedbackResult } from './feedback';
	import {
		appForRouteId,
		captureMeta,
		contextOf,
		feedbackExclusion,
		type BuildStamp
	} from './context';

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
		status = null,
		errorMessage = null,
		errorId = null,
		label = 'Report a problem',
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
		/** The error boundary fills these in; nothing else does. */
		status?: number | null;
		errorMessage?: string | null;
		errorId?: string | null;
		label?: string;
		/** Injectable clock, so a harness can pin the captured timestamp. */
		now?: () => number;
	} = $props();

	const excluded = $derived(
		place === 'shell' ? feedbackExclusion(routeId, { hasError: status !== null }) : null
	);

	const shown = $derived(!!submit && !excluded);

	let open = $state(false);
	/** Captured at OPEN, not at render: the viewport and the user agent are what
	 * they were looking at when they decided something was wrong. */
	let captured = $state<Record<string, unknown>>({});

	function openBox() {
		const viewport =
			typeof window === 'undefined'
				? null
				: { w: window.innerWidth, h: window.innerHeight };
		const userAgent = typeof navigator === 'undefined' ? null : navigator.userAgent;
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
	</div>
{/if}

{#if open && submit}
	<div class="sfb-host">
		<FeedbackBox
			app={appForRouteId(routeId, pathname)}
			context={contextOf({ routeId, pathname })}
			meta={captured}
			{submit}
			askContact={anonymous}
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

	/* A control that cannot be pressed on paper is ink. */
	@media print {
		.sfb {
			display: none !important;
		}
	}

	/* The box reads its palette from --fb-* on an ancestor rather than growing a
	   per-app branch; the portal's tokens are handed to it here. */
	.sfb-host {
		--fb-bg: var(--surface-1, #0b1016);
		--fb-bg-deep: var(--bg0, #05080b);
		--fb-ink: var(--text-1, #dfe8ee);
		--fb-ink-dim: var(--text-2, #b3c1cc);
		--fb-line: var(--hairline, rgba(147, 163, 176, 0.22));
		--fb-line-strong: var(--line-strong, rgba(147, 163, 176, 0.4));
		--fb-accent: var(--green, #7fd0ff);
		--fb-font: var(--font-display, inherit);
	}
</style>
