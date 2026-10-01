<script lang="ts">
	import { BADGE_BY_ID } from './entry-styles';

	/**
	 * ONE BADGE EMBLEM, IN THE CURRENT COLOUR, AND THE ONE RENDERER OF THEM.
	 * Renders nothing for an unknown or absent id. Every surface that shows a
	 * badge (the class theme ballot, the class banner, the class strip and
	 * cards, the profile picker and banner, the tournament chips and banners)
	 * mounts this, so the art in `$lib/identity-style` is drawn exactly one way.
	 *
	 * FOUR LAYERS OF ONE INK, in paint order: the recessed faces, the outline,
	 * the thin details, the solid marks. See `BADGES` for what each is for.
	 * Nothing here names a colour: every layer is `currentColor` or a mix of
	 * it, so a pressed key, a washed banner and a light theme each paint it in
	 * their own measured ink.
	 *
	 * THE MOTION IS ONE SHORT BEAT, NEVER A LOOP, AND ONLY UNDER
	 * `prefers-reduced-motion: no-preference` (ledger 0360, report R16). `motion`
	 * says WHEN it plays:
	 *
	 *   'hover' (the default)  when the nearest link, button, label or
	 *          `[role=button]` around the badge is hovered or focused from the
	 *          keyboard, and once when it BECOMES pressed (`aria-pressed`): a vote
	 *          on the class theme ballot, a pick in the profile menu. A badge in a
	 *          surface nobody can press (a chip on the tournament TV stage) never
	 *          moves, because nothing around it can match.
	 *   'once' on first view: the outline draws itself, the faces fill, then the
	 *          beat. For a surface that shows ONE identity (the class banner, a
	 *          profile banner), where arriving is the moment.
	 *   'none' never.
	 *
	 * THE REST FRAME IS THE BASE STYLE, AND NOTHING IS HIDDEN IN IT. No
	 * opacity, no dash offset and no transform is declared outside a keyframe
	 * (only the origins the keyframes turn about), so with the animation
	 * cancelled -- reduced motion, a print, a finished beat -- the whole emblem
	 * is painted. Every beat starts and ends on no transform, which is why a
	 * hover that leaves mid-beat lands on the finished glyph rather than on a
	 * frame of it. `tests/badge-art.test.ts` sweeps this stylesheet for all of
	 * that.
	 *
	 * THE KEYFRAMES ARE GLOBAL (`-global-`, prefixed `idea-badge-`) BECAUSE THE
	 * BEAT IS CHOSEN BY A CUSTOM PROPERTY. One `animation` rule per trigger
	 * reads `--b-beat`, which each `data-motion` sets; Svelte rewrites a scoped
	 * keyframe name only where it is written literally, so a name reached
	 * through a variable has to be global to resolve at all.
	 */
	let {
		id = null,
		size = '1em',
		motion = 'hover'
	}: {
		id?: string | null;
		size?: string;
		motion?: 'hover' | 'once' | 'none';
	} = $props();

	const def = $derived(id ? (BADGE_BY_ID[id] ?? null) : null);
</script>

{#if def}
	<svg
		class="badge-icon"
		class:hover={motion === 'hover'}
		class:once={motion === 'once'}
		data-badge={def.id}
		data-motion={def.motion}
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		stroke-width="1.6"
		stroke-linejoin="round"
		stroke-linecap="round"
		aria-hidden="true"
	>
		<g class="b-art">
			{#each def.faces ?? [] as d, i (i)}
				<path class="b-face" {d} fill-rule="evenodd" />
			{/each}
			{#each def.paths as d, i (i)}
				<path class="b-line" {d} pathLength="1" />
			{/each}
			{#each def.details ?? [] as d, i (i)}
				<path class="b-detail" {d} />
			{/each}
			{#each def.solids ?? [] as d, i (i)}
				<path class="b-solid" {d} />
			{/each}
		</g>
	</svg>
{/if}

<style>
	.badge-icon {
		flex: none;
		display: block;
		/* A beat scales or lifts the art by a unit or so; it must not be cut off
		   at the viewBox edge on the way. */
		overflow: visible;
		/* The beat, chosen per emblem below; the triggers read it. */
		--b-beat: none;
		--b-face-beat: none;
		--b-detail-beat: none;
		--b-solid-beat: none;
	}
	/* THE FACE'S TINT IS AN OPACITY, NEVER A `color-mix()` OF `currentColor`,
	   BECAUSE A KEYFRAME ANIMATES IT. Chrome 154 crashes the whole renderer
	   (STATUS_BREAKPOINT, "Can't open this page") when an animation moves an
	   SVG `fill` or `stroke` to a `color-mix()` that names `currentColor`; the
	   bolt's charge beat did exactly that, and every classroom page showing a
	   class whose vote picked the bolt died about a second after it painted
	   (2026-10-01). `currentColor` at 22% opacity paints the same pixel as
	   that mix with `transparent`, and opacity animates safely.
	   `tests/keyframe-paint-currentcolor.test.ts` sweeps every keyframe in
	   `src/` for the pattern. */
	.b-face {
		fill: currentColor;
		fill-opacity: 0.22;
		stroke: none;
	}
	.b-detail {
		stroke-width: 1;
		stroke-opacity: 0.62;
	}
	.b-solid {
		fill: currentColor;
		stroke: none;
	}
	/* The origins each beat turns about, in user units of the 24-unit grid.
	   Origins only: nothing is moved at rest. */
	.b-art {
		transform-origin: 12px 12px;
	}
	.b-solid {
		transform-box: fill-box;
		transform-origin: center;
	}
	[data-motion='turn'] {
		--b-beat: idea-badge-turn;
	}
	[data-motion='twinkle'] {
		--b-beat: idea-badge-twinkle;
	}
	[data-motion='twinkle'] .b-art {
		transform-origin: 12px 12.7px;
	}
	[data-motion='flash'] {
		--b-beat: idea-badge-jolt;
		--b-face-beat: idea-badge-charge;
	}
	[data-motion='sheen'] {
		--b-beat: idea-badge-bump;
		--b-detail-beat: idea-badge-gleam;
	}
	[data-motion='lift'] {
		--b-beat: idea-badge-lift;
		--b-detail-beat: idea-badge-thrust;
	}
	[data-motion='lift'] .b-detail {
		transform-origin: 12px 17.8px;
	}
	[data-motion='flicker'] {
		--b-beat: idea-badge-flicker;
		--b-solid-beat: idea-badge-core;
	}
	[data-motion='flicker'] .b-art {
		transform-origin: 12px 20px;
	}
	[data-motion='glint'] {
		--b-beat: idea-badge-rise;
		--b-solid-beat: idea-badge-jewel;
	}
	[data-motion='nod'] {
		--b-beat: idea-badge-nod;
	}
	[data-motion='nod'] .b-art {
		transform-origin: 12px 20px;
	}

	@media (prefers-reduced-motion: no-preference) {
		/* ONCE: the outline draws itself, the faces fill under it, the solid
		   marks arrive last, and then the beat. */
		.once .b-line {
			animation: idea-badge-draw 560ms cubic-bezier(0.2, 0.7, 0.2, 1) 1;
		}
		.once .b-face {
			animation:
				idea-badge-fill 680ms ease-out 1,
				var(--b-face-beat) 760ms 440ms ease-in-out 1;
		}
		.once .b-detail {
			animation:
				idea-badge-fill 680ms ease-out 1,
				var(--b-detail-beat) 760ms 440ms ease-in-out 1;
		}
		.once .b-solid {
			animation:
				idea-badge-pop 640ms ease-out 1,
				var(--b-solid-beat) 760ms 440ms ease-in-out 1;
		}
		.once .b-art {
			animation: var(--b-beat) 760ms 440ms cubic-bezier(0.3, 0.7, 0.3, 1) 1;
		}

		/* HOVER: the beat alone, when the control around the badge is hovered,
		   focused from the keyboard, or becomes pressed. One rule per state
		   rather than one list, so each reads as the state it is. */
		:global(:is(a, button, label, [role='button']):hover) .hover .b-art,
		:global(:is(a, button, label, [role='button']):focus-visible) .hover .b-art,
		:global(:is(a, button, label, [role='button'])[aria-pressed='true']) .hover .b-art {
			animation: var(--b-beat) 760ms cubic-bezier(0.3, 0.7, 0.3, 1) 1;
		}
		:global(:is(a, button, label, [role='button']):hover) .hover .b-face,
		:global(:is(a, button, label, [role='button']):focus-visible) .hover .b-face,
		:global(:is(a, button, label, [role='button'])[aria-pressed='true']) .hover .b-face {
			animation: var(--b-face-beat) 760ms ease-in-out 1;
		}
		:global(:is(a, button, label, [role='button']):hover) .hover .b-detail,
		:global(:is(a, button, label, [role='button']):focus-visible) .hover .b-detail,
		:global(:is(a, button, label, [role='button'])[aria-pressed='true']) .hover .b-detail {
			animation: var(--b-detail-beat) 760ms ease-in-out 1;
		}
		:global(:is(a, button, label, [role='button']):hover) .hover .b-solid,
		:global(:is(a, button, label, [role='button']):focus-visible) .hover .b-solid,
		:global(:is(a, button, label, [role='button'])[aria-pressed='true']) .hover .b-solid {
			animation: var(--b-solid-beat) 760ms ease-in-out 1;
		}
	}

	/* THE DRAW: the outline traced from nothing (pathLength is 1 on every
	   outline, so one dash covers all of it). */
	@keyframes -global-idea-badge-draw {
		from {
			stroke-dasharray: 1 1;
			stroke-dashoffset: 1;
		}
		to {
			stroke-dasharray: 1 1;
			stroke-dashoffset: 0;
		}
	}
	@keyframes -global-idea-badge-fill {
		0%,
		35% {
			fill-opacity: 0;
			stroke-opacity: 0;
		}
	}
	@keyframes -global-idea-badge-pop {
		0%,
		55% {
			opacity: 0;
			transform: scale(0.4);
		}
	}

	/* THE BEATS. Each starts and ends on no transform. */
	@keyframes -global-idea-badge-turn {
		/* One tooth pitch (360 / 8), so the last frame IS the first. */
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(45deg);
		}
	}
	@keyframes -global-idea-badge-twinkle {
		40% {
			transform: rotate(14deg) scale(1.14);
		}
		70% {
			transform: rotate(-4deg) scale(0.97);
		}
	}
	@keyframes -global-idea-badge-jolt {
		15% {
			transform: translate(-0.7px, 0.5px);
		}
		30% {
			transform: translate(0.6px, -0.4px);
		}
		45% {
			transform: translate(-0.3px, 0.2px);
		}
		60% {
			transform: none;
		}
	}
	@keyframes -global-idea-badge-charge {
		20%,
		40% {
			fill-opacity: 0.72;
		}
	}
	@keyframes -global-idea-badge-bump {
		35% {
			transform: scale(1.08);
		}
		65% {
			transform: scale(0.98);
		}
	}
	@keyframes -global-idea-badge-gleam {
		35% {
			stroke-opacity: 1;
			stroke-width: 1.4;
		}
	}
	@keyframes -global-idea-badge-lift {
		40% {
			transform: translateY(-1.8px);
		}
		75% {
			transform: translateY(0.4px);
		}
	}
	@keyframes -global-idea-badge-thrust {
		40% {
			transform: scaleY(1.7);
			stroke-opacity: 1;
		}
		75% {
			transform: scaleY(0.8);
		}
	}
	@keyframes -global-idea-badge-flicker {
		25% {
			transform: scale(1.04, 1.1) rotate(-2deg);
		}
		50% {
			transform: scale(0.98, 0.94) rotate(1.5deg);
		}
		75% {
			transform: scale(1.01, 1.04) rotate(-0.5deg);
		}
	}
	@keyframes -global-idea-badge-core {
		30% {
			transform: scale(1.18);
		}
		60% {
			transform: scale(0.9);
		}
	}
	@keyframes -global-idea-badge-rise {
		40% {
			transform: translateY(-1px);
		}
	}
	@keyframes -global-idea-badge-jewel {
		20% {
			transform: scale(1.6);
		}
		45% {
			transform: none;
		}
		60% {
			transform: scale(1.35);
		}
	}
	@keyframes -global-idea-badge-nod {
		30% {
			transform: rotate(-9deg);
		}
		65% {
			transform: rotate(5deg);
		}
	}
</style>
