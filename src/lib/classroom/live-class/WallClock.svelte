<script lang="ts">
	import PlateRing from '$lib/classroom/PlateRing.svelte';
	import { clockHandAngles } from './wall-clock';

	/**
	 * THE WALL'S CLOCK FACE (idea 26033e4b): an analog dial drawn on the wall's
	 * own Plate ring, so IDEA's green metal, Matrix's phosphor and Space White's
	 * light plate each get their own dial from tokens they already declare, and
	 * no new colour exists for it. `ProjectorView` mounts it as the hero only
	 * when the teacher turned the face on and no timer is up, and puts the
	 * digital reading under it: THE DIAL IS DECORATION (aria-hidden), THE DIGITS
	 * ARE THE TIME.
	 *
	 * THE INKS ARE MEASURED, NOT CHOSEN BY EYE (tests/classroom-projector-ring-
	 * contrast.test.ts reads them out of this file). The hour and minute hands and
	 * the twelve indices are `--text-1`; the second hand and its cap are
	 * `--plate-ring-text`. Each hand is drawn twice, a wider halo in
	 * `--plate-ring-band` under it, because the minute and second hands cross the
	 * ring's glowing segments (radius 47), where a light hand on a light segment
	 * measured 1.13:1 washed on IDEA. The hour hand stops short of them. The
	 * Plate's own tick colour is NOT used for the indices: it measures 1.58:1
	 * washed on Space White.
	 *
	 * THE HANDS ARE PLACED BY AN SVG ATTRIBUTE AND NEVER BY A CSS TRANSITION. The
	 * second hand going from 354 degrees to 0, and the minute hand at the top of
	 * the hour, would sweep a whole turn BACKWARDS under an interpolated
	 * rotation. The angles come from `clockHandAngles`, quantised so the hour and
	 * minute hands step once a minute and only the second hand once a second.
	 *
	 * MOTION, ONLY UNDER `prefers-reduced-motion: no-preference`: the hour and
	 * minute hands sweep once from twelve to their reading when the face appears
	 * (an inner group, transform only, ending on no transform), and the second
	 * hand ticks. Under `reduce` there is no sweep and NO SECOND HAND, so nothing
	 * on the dial moves more than once a minute.
	 *
	 * TWO LAYERS, so a tick costs one small repaint. The ring (three blurs) is
	 * PlateRing's; the indices, the hour and minute hands and the cap are one
	 * layer that changes once a minute; the second hand is a layer of its own
	 * that changes once a second. No filter is ever put on the second hand.
	 *
	 * NO EFFECT AND NO CLOCK OF ITS OWN: everything is derived from the `now`
	 * the projector already keeps (a 250ms timeout, never an animation frame).
	 */
	let {
		now,
		size
	}: {
		/** The projector's own clock reading (ms). */
		now: number;
		/** The dial's width and height, any CSS length (`var(--lp-dial)` on the wall). */
		size: string;
	} = $props();

	/* A derived number only propagates when it changes, so the angles are worked
	   out once a second even though `now` moves four times a second. */
	const second = $derived(Math.floor(now / 1000) * 1000);
	const a = $derived(clockHandAngles(second));

	/** The twelve hour indices, in degrees; the quarters are drawn longer. */
	const INDICES = Array.from({ length: 12 }, (_, i) => i * 30);
</script>

<div
	class="wc"
	style:--wc-size={size}
	data-testid="projector-dial"
	data-hour={a.hour}
	data-minute={a.minute}
	data-second={a.second}
	aria-hidden="true"
>
	<!-- The bezel: the Plate ring at no value, its track flattened below. -->
	<div class="wc-bezel">
		<PlateRing value={0} {size} />
	</div>

	<svg class="wc-layer wc-face" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
		<g transform="translate(100 100)">
			{#each INDICES as deg (deg)}
				<line
					class="wc-index"
					class:wc-quarter={deg % 90 === 0}
					x1="0"
					y1={deg % 90 === 0 ? -50.5 : -53}
					x2="0"
					y2="-58.5"
					transform="rotate({deg})"
				/>
			{/each}
			<g class="wc-hand wc-hour" transform="rotate({a.hour})">
				<g class="wc-arrive" style:--wc-from="{-a.hour}deg">
					<line class="wc-halo" x1="0" y1="8" x2="0" y2="-38" />
					<line class="wc-ink" x1="0" y1="8" x2="0" y2="-38" />
				</g>
			</g>
			<g class="wc-hand wc-min" transform="rotate({a.minute})">
				<g class="wc-arrive" style:--wc-from="{-a.minute}deg">
					<line class="wc-halo" x1="0" y1="10" x2="0" y2="-55" />
					<line class="wc-ink" x1="0" y1="10" x2="0" y2="-55" />
				</g>
			</g>
			<circle class="wc-cap-halo" cx="0" cy="0" r="6.4" />
			<circle class="wc-cap" cx="0" cy="0" r="4.6" />
		</g>
	</svg>

	<svg class="wc-layer wc-sec" viewBox="0 0 200 200" aria-hidden="true" focusable="false" data-testid="projector-dial-second">
		<g transform="translate(100 100) rotate({a.second})">
			<line class="wc-halo" x1="0" y1="15" x2="0" y2="-57" />
			<circle class="wc-sec-weight-halo" cx="0" cy="12" r="4.4" />
			<line class="wc-sec-ink" x1="0" y1="15" x2="0" y2="-57" />
			<circle class="wc-sec-weight" cx="0" cy="12" r="3.2" />
			<circle class="wc-sec-cap" cx="0" cy="0" r="2.4" />
		</g>
	</svg>
</div>

<style>
	/* THE BEZEL'S TRACK IS ONE FLAT TONE, the wall timer's own choice (the darker
	   stop on a dark theme, the lighter on Space White), so a ring at no value
	   reads as the dial's rim rather than as a timer that has run out.
	   `--wc-rest` is resolved HERE, where the theme's stops are inherited, and
	   handed to the ring below as a plain colour, so no declaration refers to
	   itself. */
	.wc {
		position: relative;
		flex: none;
		width: var(--wc-size);
		height: var(--wc-size);
		--wc-rest: var(--plate-ring-rest-b);
	}
	:global(:root[data-theme='space-white']) .wc {
		--wc-rest: var(--plate-ring-rest-a);
	}
	.wc-bezel {
		--plate-ring-rest-a: var(--wc-rest);
		--plate-ring-rest-b: var(--wc-rest);
	}
	.wc-layer {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
		/* Each layer composites on its own: a tick repaints the second hand's
		   layer, never the ring's blurs or the other hands. */
		will-change: transform;
	}
	line {
		fill: none;
		stroke-linecap: round;
	}
	.wc-index {
		stroke: var(--text-1);
		stroke-width: 1.6;
	}
	.wc-index.wc-quarter {
		stroke-width: 3.2;
	}
	.wc-halo {
		stroke: var(--plate-ring-band);
	}
	.wc-hour .wc-ink {
		stroke: var(--text-1);
		stroke-width: 5.6;
	}
	.wc-hour .wc-halo {
		stroke-width: 8.4;
	}
	.wc-min .wc-ink {
		stroke: var(--text-1);
		stroke-width: 3.6;
	}
	.wc-min .wc-halo {
		stroke-width: 6.4;
	}
	.wc-cap-halo {
		fill: var(--plate-ring-band);
	}
	.wc-cap {
		fill: var(--text-1);
	}
	.wc-sec .wc-halo {
		stroke-width: 3.6;
	}
	.wc-sec-ink {
		stroke: var(--plate-ring-text);
		stroke-width: 1.5;
	}
	.wc-sec-weight-halo {
		fill: var(--plate-ring-band);
	}
	.wc-sec-weight,
	.wc-sec-cap {
		fill: var(--plate-ring-text);
	}
	/* The arrival turns about the dial's centre: the hands are drawn about the
	   origin of their own group, which the outer group puts at the centre. */
	.wc-arrive {
		transform-box: view-box;
		transform-origin: 0 0;
	}
	/* MOTION, ONLY HERE. The hour and minute hands sweep once from twelve to
	   their reading (transform only, `both` so the end rests on no transform),
	   and on a dark theme carry the ring's own bloom, which is transparent on
	   Space White, where nothing glows. Nothing loops and nothing is hidden in a
	   base state. */
	@media (prefers-reduced-motion: no-preference) {
		.wc-hour .wc-arrive {
			animation: wc-arrive 1.4s cubic-bezier(0.2, 0.7, 0.2, 1) both;
		}
		.wc-min .wc-arrive {
			animation: wc-arrive 1.6s cubic-bezier(0.2, 0.7, 0.2, 1) 0.1s both;
		}
	}
	.wc-hand {
		filter: drop-shadow(0 0 2px var(--plate-ring-bloom));
	}
	:global(:root[data-theme='space-white']) .wc-hand {
		filter: none;
	}
	@keyframes wc-arrive {
		from {
			transform: rotate(var(--wc-from));
		}
		to {
			transform: none;
		}
	}
	/* UNDER REDUCED MOTION THE SECOND HAND IS NOT DRAWN: a hand jumping every
	   second is motion on a wall thirty students face. A CSS rule, so the DOM is
	   the same in both media states. */
	@media (prefers-reduced-motion: reduce) {
		.wc-sec {
			display: none;
		}
	}
</style>
