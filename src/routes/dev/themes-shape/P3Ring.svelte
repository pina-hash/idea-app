<script lang="ts">
	/**
	 * THE PROGRESS RING (ledger 0344, D11): Sci-Fi Line's big knob redrawn as a
	 * READOUT, the one knob the proposal allows. It turns nothing; it shows a
	 * fraction (a returned grade here, a class timer in the Live tab). Built
	 * from our own tokens in inline SVG -- nothing traced, sampled or embedded.
	 *
	 * THE VALUE IS REAL TEXT, NOT SVG TEXT. It sits in a `<span>` over the
	 * drawing so the contrast walk reads its colour and its ground like any
	 * other label; the drawing itself is `aria-hidden` paint. The container is
	 * one `role="img"` with the value in words, because "90%" alone beside the
	 * returned-grade readout would be read twice and mean less.
	 *
	 * EVERY COLOUR IS A `--p3-ring-*` TOKEN, read where it is used (a stop's
	 * `stop-color`, a stroke), so a theme changes the paint and nothing else.
	 * Every length here is in the viewBox and shared by every theme.
	 *
	 * THE FILTERS ARE LOCAL. Three blurs (the disc's drop shadow, the glow on
	 * the white segments and the arc's bloom), each on an element about 160px
	 * across, never on the page. Ids come from `$props.id()` so two rings on one page never share a
	 * gradient.
	 */
	let {
		value,
		text,
		label,
		size = 168
	}: {
		/** 0 to 1. */
		value: number;
		/** The readout in the centre, e.g. `90%`. */
		text: string;
		/** The same fact in words, for a screen reader. */
		label: string;
		size?: number;
	} = $props();

	const uid = $props.id();
	const id = (n: string) => `p3r-${uid}-${n}`;

	const R = 84;
	const C = 2 * Math.PI * R;
	const v = $derived(Math.max(0, Math.min(1, value)));

	/* The outer thin ring: arcs of different lengths with gaps, as the kit's
	   outer ring reads (a long arc top right, short ones on the left). The
	   path length is normalised to 360 so the numbers are degrees. */
	const OUTER = '52 9 18 7 64 12 10 6 38 11 24 8 30 10 14 47';
	/* The glowing white segments inside the disc: five arcs, uneven gaps. */
	const GLOW = '56 16 44 14 60 18 40 12 72 28';
</script>

<div class="p3-ring" role="img" aria-label={label} style:--p3-ring-size="{size}px" data-testid="p3-ring">
	<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
		<defs>
			<linearGradient id={id('rest')} x1="0.25" y1="0" x2="0.85" y2="1">
				<stop offset="0" style="stop-color: var(--p3-ring-rest-a)" />
				<stop offset="1" style="stop-color: var(--p3-ring-rest-b)" />
			</linearGradient>
			<linearGradient id={id('disc')} x1="0.2" y1="0.05" x2="0.75" y2="1">
				<stop offset="0" style="stop-color: var(--p3-ring-disc-a)" />
				<stop offset="1" style="stop-color: var(--p3-ring-disc-b)" />
			</linearGradient>
			<linearGradient id={id('sheen')} x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" style="stop-color: var(--p3-ring-sheen); stop-opacity: 0.9" />
				<stop offset="1" style="stop-color: var(--p3-ring-sheen); stop-opacity: 0" />
			</linearGradient>
			<radialGradient id={id('face')} cx="0.42" cy="0.38" r="0.7">
				<stop offset="0" style="stop-color: var(--p3-ring-face-hi)" />
				<stop offset="1" style="stop-color: var(--p3-ring-face)" />
			</radialGradient>
			<filter id={id('drop')} x="-30%" y="-30%" width="170%" height="180%">
				<feGaussianBlur stdDeviation="6" />
			</filter>
			<filter id={id('bloom')} x="-20%" y="-20%" width="140%" height="140%">
				<feGaussianBlur stdDeviation="4" />
			</filter>
			<filter id={id('glow')} x="-20%" y="-20%" width="140%" height="140%">
				<feGaussianBlur in="SourceGraphic" stdDeviation="2.8" result="b" />
				<feMerge>
					<feMergeNode in="b" />
					<feMergeNode in="SourceGraphic" />
				</feMerge>
			</filter>
		</defs>

		<!-- The outer thin segmented ring. -->
		<circle class="r-outer" cx="100" cy="100" r="96" pathLength="360" stroke-dasharray={OUTER} transform="rotate(-78 100 100)" />
		<!-- The channel the track sits in. -->
		<circle class="r-channel" cx="100" cy="100" r={R} />
		<circle class="r-channel-line" cx="100" cy="100" r="77" />
		<!-- The remainder, shaded gray. -->
		<circle class="r-rest" cx="100" cy="100" r={R} stroke="url(#{id('rest')})" />
		<!-- The value: a thick flat accent arc from twelve o'clock, counter-
		     clockwise as the kit draws it. Under it, the same arc blurred: the
		     bloom a lit arc throws on a dark plate. Its colour is a token that is
		     transparent on Space White, where glow is white and the accent never
		     glows off the dark display. -->
		<circle
			class="r-value-bloom"
			cx="100"
			cy="100"
			r={R}
			stroke-dasharray="{C * v} {C}"
			transform="translate(200 0) scale(-1 1) rotate(-90 100 100)"
			filter="url(#{id('bloom')})"
		/>
		<circle
			class="r-value"
			cx="100"
			cy="100"
			r={R}
			stroke-dasharray="{C * v} {C}"
			transform="translate(200 0) scale(-1 1) rotate(-90 100 100)"
		/>
		<!-- The raised disc: a soft drop shadow toward the lower right, then the
		     disc, whose broad outer rim is the brightest thing on it. -->
		<circle class="r-drop" cx="106" cy="111" r="74" filter="url(#{id('drop')})" />
		<circle class="r-disc" cx="100" cy="100" r="75" fill="url(#{id('disc')})" />
		<!-- The inner face, a step down from the rim, then the fine dotted tick
		     ring just inside the rim. -->
		<circle class="r-face" cx="100" cy="100" r="61" fill="url(#{id('face')})" />
		<circle class="r-band" cx="100" cy="100" r="61" />
		<circle class="r-ticks" cx="100" cy="100" r="63.2" pathLength="900" />
		<!-- The glowing white segments. -->
		<circle
			class="r-glow"
			cx="100"
			cy="100"
			r="47"
			pathLength="360"
			stroke-dasharray={GLOW}
			transform="rotate(-100 100 100)"
			filter="url(#{id('glow')})"
		/>
		<!-- Glass, not blur: a clear sheen over the top half of the disc and a
		     bright rim highlight on its upper left. Light, no backdrop. -->
		<path class="r-sheen" d="M 30 100 A 70 70 0 0 1 170 100 Q 100 82 30 100 Z" fill="url(#{id('sheen')})" />
		<circle class="r-rim" cx="100" cy="100" r="74" pathLength="360" stroke-dasharray="0 196 110 54" />
	</svg>
	<span class="p3-ring-value" aria-hidden="true">{text}</span>
</div>

<style>
	.p3-ring {
		position: relative;
		flex: none;
		width: var(--p3-ring-size);
		height: var(--p3-ring-size);
	}
	svg {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
	}
	/* STROKE-ONLY RINGS SAY `fill: none` ONE BY ONE. A blanket rule on
	   `circle, path` would outrank the `fill="url(...)"` attributes on the
	   disc, the face and the sheen (a stylesheet beats a presentation
	   attribute), and the disc would silently never be painted. */
	.r-outer,
	.r-channel,
	.r-channel-line,
	.r-rest,
	.r-value,
	.r-value-bloom,
	.r-band,
	.r-ticks,
	.r-glow,
	.r-rim {
		fill: none;
	}
	.r-outer {
		stroke: var(--p3-ring-outer);
		stroke-width: 1.8;
	}
	.r-channel {
		stroke: var(--p3-ring-channel);
		stroke-width: 14;
		opacity: 0.35;
	}
	.r-channel-line {
		stroke: var(--p3-ring-channel);
		stroke-width: 1.6;
	}
	/* The arc is about an eighth of the radius, as the kit's is. */
	.r-rest {
		stroke-width: 9;
	}
	.r-value {
		stroke: var(--p3-ring-value);
		stroke-width: 9;
	}
	.r-value-bloom {
		stroke: var(--p3-ring-bloom);
		stroke-width: 12;
	}
	.r-drop {
		fill: var(--p3-ring-drop);
	}
	.r-disc {
		stroke: var(--p3-ring-disc-edge);
		stroke-width: 1;
	}
	.r-band {
		stroke: var(--p3-ring-band);
		stroke-width: 1.2;
	}
	.r-ticks {
		stroke: var(--p3-ring-ticks);
		stroke-width: 3;
		stroke-dasharray: 0.8 1.2;
	}
	.r-glow {
		stroke: var(--p3-ring-glow);
		stroke-width: 4.6;
	}
	.r-rim {
		stroke: var(--p3-ring-rim);
		stroke-width: 1.4;
		stroke-linecap: round;
	}
	.p3-ring-value {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-family: var(--p3-readout-face, var(--font-mono));
		font-size: calc(var(--p3-ring-size) * 0.19);
		letter-spacing: 0.04em;
		color: var(--p3-ring-text);
		font-variant-numeric: tabular-nums;
		pointer-events: none;
	}
</style>
