<!--
	GREENLINE homepage mark: a closed racetrack with a start/finish line and a
	single marker lapping it continuously, so the icon reads as "combat racing"
	at a glance rather than requiring the game to already be known. The track
	is currentColor (so the card accent drives its hue); the marker, its short
	trailing fade, and the start line reuse the bright signature-green highlight
	already present in this component's earlier revision, rather than pulling in
	a new hex. Animation only runs under prefers-reduced-motion: no-preference.
-->
<svg viewBox="0 0 40 40" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<!-- Closed circuit -->
	<rect class="gl-track" x="4" y="6" width="32" height="28" rx="11" stroke="currentColor" stroke-width="1.3" opacity="0.5" />

	<!-- Start/finish tick, crossing the top straight -->
	<path class="gl-line" d="M20 3 V9" stroke="#eafff3" stroke-width="1.8" opacity="0.9" />

	<!-- Trailing fade behind the marker -->
	<rect
		class="gl-trail"
		x="4"
		y="6"
		width="32"
		height="28"
		rx="11"
		stroke="#eafff3"
		stroke-width="1.3"
		opacity="0.3"
		stroke-dasharray="12 500"
	/>

	<!-- The machine, lapping the circuit -->
	<rect
		class="gl-marker"
		x="4"
		y="6"
		width="32"
		height="28"
		rx="11"
		stroke="#eafff3"
		stroke-width="1.8"
		stroke-dasharray="4 500"
	/>
</svg>

<style>
	svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	@media (prefers-reduced-motion: no-preference) {
		.gl-marker {
			animation: gl-lap 3s linear infinite;
		}
		.gl-trail {
			animation: gl-lap 3s linear infinite;
			animation-delay: 0.12s;
		}
	}
	@keyframes gl-lap {
		from {
			stroke-dashoffset: 0;
		}
		to {
			stroke-dashoffset: -101.1;
		}
	}
</style>
