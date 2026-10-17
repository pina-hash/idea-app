<svelte:options css="injected" />

<script lang="ts">
	import { FEEDBACK_GLYPH, FEEDBACK_LOAD_FAILED, FEEDBACK_OPENING, PROBLEM_GLYPH, REPORT_LABEL } from './context';

	/**
	 * THE FEEDBACK BUTTON, AND THE ONLY COPY OF IT (ledger 0396, reports
	 * 0fe82a80 and 80bb4d23: "every feedback window on the website should be
	 * the same window").
	 *
	 * `SiteFeedback` mounts it on every Svelte page, and the legacy pages that
	 * render no layout (the IDEA Coin Ledger, a carried-over assignment) get it
	 * SERVER-RENDERED into the bytes they serve by
	 * `$lib/server/feedback-launch.ts`. That is why the stylesheet is
	 * `css="injected"`: a raw HTML response loads none of SvelteKit's extracted
	 * CSS files, so a component whose styles live in a separate file would
	 * arrive on the Ledger unstyled. Injected, `render()` hands back this exact
	 * stylesheet (scoped hashes and all) in its `head`, so the Ledger's button
	 * is drawn by the same rules as the home page's, with nothing restated. On
	 * a SvelteKit page the server render puts the same stylesheet in the head,
	 * so there is no unstyled first frame either.
	 *
	 * A ROOM RESTYLES IT THROUGH TOKENS ONLY. Every painted value reads a
	 * `--fb-room-*` hook first, so the Ledger's injected hook block can make
	 * this button its own key (a face gradient, the bevel, the 11px corner)
	 * without a rule of its own; see `SiteFeedback`'s scrim block for the whole
	 * set and why a room declares them on `body:has(.<room>)`.
	 *
	 * PRESENTATION ONLY: it reports a press and a preload and owns no state.
	 */
	let {
		place = 'shell',
		label = REPORT_LABEL,
		error = false,
		loadFailed = false,
		pending = false,
		id = undefined,
		onopen = undefined,
		onpreload = undefined
	}: {
		place?: 'shell' | 'relocated';
		label?: string;
		/** An error page: the warning triangle, and the primary action's edge. */
		error?: boolean;
		/** The window's code did not load: said beside the button, never swallowed. */
		loadFailed?: boolean;
		/**
		 * PRESSED, AND THE WINDOW IS NOT ON SCREEN YET (ledger 0396). The word
		 * says so (`FEEDBACK_OPENING`) and the button is `aria-busy`, so a press
		 * that has to wait for the window's code -- a cold tap on a phone, where
		 * nothing hovers first -- never looks like a press that did nothing.
		 * The legacy launcher's script sets the same two things on the same
		 * markup.
		 */
		pending?: boolean;
		/** Only the server-rendered launcher names its wrapper, so its script can find it. */
		id?: string;
		onopen?: () => void;
		onpreload?: () => void;
	} = $props();

	let buttonEl = $state<HTMLButtonElement | null>(null);

	/** Focus the button without scrolling: where focus goes back when the window closes. */
	export function focus() {
		buttonEl?.focus({ preventScroll: true });
	}
</script>

<div class="sfb sfb-{place}" {id}>
	<button
		bind:this={buttonEl}
		type="button"
		class="sfb-trigger"
		class:sfb-trigger-error={error}
		data-tour="report"
		data-word={label}
		data-pending-word={FEEDBACK_OPENING}
		aria-busy={pending ? 'true' : undefined}
		onclick={() => onopen?.()}
		onpointerenter={() => onpreload?.()}
		onpointerdown={() => onpreload?.()}
		onfocus={() => onpreload?.()}
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
				<!-- A speech bubble, from the one list in context.ts; the error
				     page keeps the warning triangle, because a report there is a
				     problem report by definition. -->
				{#each error ? PROBLEM_GLYPH : FEEDBACK_GLYPH as d (d)}
					<path {d} />
				{/each}
			</svg>
		</span>
		<span class="sfb-word">{pending ? FEEDBACK_OPENING : label}</span>
	</button>
	{#if loadFailed}
		<!-- Said beside the control, not swallowed: the one thing worse than a
		     report window that will not open is one that will not say so. -->
		<p class="sfb-load-failed" role="alert">{FEEDBACK_LOAD_FAILED}</p>
	{/if}
</div>

<style>
	/*
	   THE CORNER IS THE BUTTON'S, AND A ROOM KEEPS ITS CONTROLS OUT OF IT
	   (ledger 0396). The button floats in the same bottom-right corner on every
	   page, so a room never moves it; it makes room instead, reading these two
	   lengths: `--feedback-clear-block` (how far up the bottom edge the button
	   reaches, plus a gap) as the foot padding of a scroll container, so its
	   last control always scrolls clear, and `--feedback-clear-inline` (how far
	   in from the right edge it reaches) as the end padding of a row pinned to
	   the bottom edge. Both are declared only while a floating button is on the
	   page, so a room that reads them with a 0px fallback reserves nothing
	   where there is no button (GREENLINE, VANGUARD). The arithmetic is the
	   button's own geometry below: its bottom offset, its height (44px, 48px on
	   a phone) and its measured width (143px to 167px across the rooms and the
	   two sizes, so the inline figure is the widest plus room to spare).
	*/
	:global(body:has(.sfb-shell)) {
		--feedback-clear-block: calc(0.75rem + 44px + 0.5rem + env(safe-area-inset-bottom, 0px));
		--feedback-clear-inline: calc(max(0.75rem, env(safe-area-inset-right, 0px)) + 10rem + 0.5rem);
	}
	@media (max-width: 30rem) {
		:global(body:has(.sfb-shell)) {
			--feedback-clear-block: calc(1.5rem + 48px + 0.5rem + env(safe-area-inset-bottom, 0px));
			--feedback-clear-inline: calc(max(1rem, env(safe-area-inset-right, 0px)) + 11rem + 0.5rem);
		}
	}

	.sfb-shell {
		position: fixed;
		right: max(0.75rem, env(safe-area-inset-right, 0px));
		bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
		/* Below the box's own scrim (120) and below the install prompt (1000),
		   above ordinary page content (1). A legacy page whose own overlays sit
		   far higher (an assignment's scanlines at 9998) hands in its own through
		   the hook, so the button is never drawn under a page's decoration. */
		z-index: var(--fb-room-z, 90);
	}
	.sfb-relocated {
		display: inline-flex;
	}
	/* ON A PHONE THE PILL IS BIGGER AND SITS HIGHER (ledger 0380, report
	   3d9e02d1, Safari on an iPhone at 393x793: "make the button bigger or raise
	   it up a tad so it's easier to use"). 44px is the floor and this is the
	   thumb's corner: 48px tall, the glyph and the word a step larger, and
	   1.5rem clear of the bottom edge so it sits above Safari's floating toolbar
	   rather than against it. Only the floating pill; a relocated one lives in
	   somebody's own header and keeps their sizing. */
	@media (max-width: 30rem) {
		.sfb-shell:not(.sfb-relocated) {
			right: max(1rem, env(safe-area-inset-right, 0px));
			bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));
		}
		.sfb-shell:not(.sfb-relocated) .sfb-trigger {
			min-height: 48px;
			min-width: 48px;
			padding: 0 1.1rem;
			font-size: 0.8rem;
		}
		.sfb-shell:not(.sfb-relocated) .sfb-glyph {
			width: 1.2rem;
			height: 1.2rem;
		}
	}

	.sfb-trigger {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		/* 44px, the tap-target floor. */
		min-height: 44px;
		min-width: 44px;
		margin: 0;
		padding: 0 0.9rem;
		appearance: none;
		/* EVERY PAINTED VALUE READS A ROOM HOOK FIRST (report 35, 2026-09-25),
		   with the site token as the fallback -- see the scrim block in
		   SiteFeedback.svelte for the whole hook set and why a room declares
		   it on `body:has(.<room>)` rather than on its own wrapper. With no
		   room hook set, every line below resolves to exactly what it did.

		   THE FOUR TRIGGER HOOKS (ledger 0396) are for a room whose own
		   controls are raised keys rather than pills -- the Coin Ledger -- so
		   the button can wear the room's key face, bevel, corner and word ink
		   through tokens alone (`--fb-room-trigger-face`, `-lift`, `-ink` and
		   `--fb-room-radius`). `--fb-room-trigger-face` is a whole background value
		   (a gradient is fine), which is why it is its own hook and not
		   `--fb-room-bg`: the box reads that one inside a gradient of its own. */
		background: var(--fb-room-trigger-face, var(--fb-room-bg, var(--surface-2, #0d1a12)));
		/* THE LOAD-BEARING EDGE, NOT THE HAIRLINE. The pill's outer edge is the
		   only thing separating a control from the page under it, which is what
		   `--boundary` exists for (CLAUDE.md, "A BOUNDARY THAT CARRIES MEANING").
		   It was `--hairline` everywhere but Space White: measured 1.18:1 against
		   the portal page at 375 and 1.22:1 at 1440, a control nobody could see
		   the edge of (report 20: "the report button does not show up"). */
		border: 1px solid var(--fb-room-edge, var(--boundary, rgba(140, 220, 160, 0.22)));
		/* ONE SILHOUETTE IN EVERY ROOM (review round 2): the home page's key
		   corner, the plate's `--plate-r-control` (11px), whether or not the
		   room wears the plate. Outside it this was a 999px pill, so the same
		   button changed shape between the home page and GAUNTLET, a handout
		   or FRC; a room changes its colours, never its outline. */
		border-radius: var(--fb-room-radius, var(--plate-r-control, 11px));
		color: var(--fb-room-trigger-ink, var(--fb-room-ink-muted, var(--text-2, #9fb8a6)));
		/* The site's own face in every room, never a room's (review round 4):
		   the button keeps one width and one word everywhere. */
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.7rem;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		text-decoration: none;
		cursor: pointer;
		box-shadow: var(--fb-room-trigger-lift, var(--fb-room-lift, 0 6px 18px rgba(0, 0, 0, 0.35)));
	}
	/* UNDER SPACE WHITE (ledger 0297, package F1b): the pill lifts on the
	   theme's hard elevation rather than a blurred dark drop. Its load-bearing
	   edge used to be set here too; every theme takes it now (above). A room
	   that hands in its own lift keeps it. */
	:global(:root[data-theme='space-white']) .sfb-trigger {
		box-shadow: var(--fb-room-trigger-lift, var(--elevation-2));
	}
	:global(:root[data-theme='space-white']) .sfb-relocated .sfb-trigger {
		box-shadow: none;
	}
	.sfb-relocated .sfb-trigger {
		box-shadow: none;
	}
	.sfb-trigger:hover,
	.sfb-trigger:focus-visible {
		color: var(--fb-room-ink, var(--text-1, #dff3e3));
		border-color: var(--fb-room-accent, var(--green, #3ddc84));
	}
	/* THE FOCUS RING IS AN OUTLINE, AND NOTHING ON THE BUTTON MAY SUPPRESS IT
	   (ledger 0396, review round 3; IDEA_INTERFACE_STANDARDS 6, "Focus
	   visibility is text"). This rule used to say `outline: none` and lean on
	   the edge colour above, which the plate cannot show: the plate's key paints
	   its border with a border-box gradient and sets its own border colours at a
	   heavier specificity, so on every plated page (home, the classroom, the
	   coin desk, the certifications portal, the Foundry, Maps) a keyboard focus
	   changed 0 of the button's 9128 pixels. The ring is the site's own
	   (`:focus-visible` in app.css, 2px at a 2px offset, `--focus-ring`), drawn
	   by this rule so a page with no app.css (the Coin Ledger, a handout) gets
	   it too, and a room hands in its own ring colour through
	   `--fb-room-focus`, measured in its own block. The ring sits over the page
	   ground round the button, which is what it is measured against. */
	.sfb-trigger:focus-visible {
		outline: 2px solid var(--fb-room-focus, var(--focus-ring, #5abda8));
		outline-offset: 2px;
	}
	.sfb-trigger[aria-busy='true'] {
		cursor: progress;
	}
	.sfb-trigger-error {
		/* An error page is the one place this is the primary action. */
		color: var(--fb-room-ink, var(--text-1, #dff3e3));
		border-color: var(--fb-room-accent, var(--green, #3ddc84));
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
		color: var(--fb-room-danger, var(--amber, #d08030));
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.68rem;
		line-height: 1.4;
	}
	.sfb-shell .sfb-load-failed {
		/* Above the floating pill, which sits at the bottom edge: the pill
		   stays where it was and the sentence takes no space it could push.
		   It floats over whatever the page has there, so it carries the pill's
		   own ground: bare, it was measured over a Ledger key at 375 with the
		   key's label running through the sentence. */
		position: absolute;
		right: 0;
		bottom: calc(100% + 0.4rem);
		text-align: right;
		padding: 0.35rem 0.55rem;
		background: var(--fb-room-bg, var(--surface-2, #0d1a12));
		border: 1px solid var(--fb-room-edge, var(--boundary, rgba(159, 184, 166, 0.5)));
		border-radius: 6px;
	}

	/* A control that cannot be pressed on paper is ink. */
	@media print {
		.sfb {
			display: none !important;
		}
	}
</style>
