<!--
	GREENLINE homepage mark: a chrome machine wedge caught mid-collision under
	crossed floodlight cones, with the signature green thread sweeping beneath
	it and an amber spark burst at the impact point. Themed off GREENLINE's own
	locked brand system (src/lib/greenline/brand: chrome/steel dominant, green
	surgical, amber reserved for impact), deliberately NOT VANGUARD's
	green-on-black or GAUNTLET's graphite-cyan reading. Colors are the brand's
	hex values inlined (not imported from brand.css/brand.ts) so this small
	icon never pulls in the GREENLINE display fonts. Animation only runs under
	prefers-reduced-motion: no-preference.
-->
<svg viewBox="0 0 40 40" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<!-- Crossed floodlight cones, cool left / warm right, per the key art rig -->
	<g class="beams">
		<path class="beam beam-l" d="M3 5 L20 19 L3 25 Z" fill="#78a5cd" opacity="0.16" />
		<path class="beam beam-r" d="M37 5 L20 19 L37 25 Z" fill="#ffd9a0" opacity="0.13" />
	</g>

	<!-- Chrome machine wedge, frozen at the point of impact -->
	<g class="body" stroke="#93a3b0" stroke-width="1.3">
		<path d="M6 25 L15 15 L25 16 L34 24 L26 28 L12 28 Z" fill="#cfdae2" fill-opacity="0.08" />
		<path d="M15 15 L18 20 L25 16" opacity="0.75" stroke="#cfdae2" />
		<path d="M12 28 L26 28" opacity="0.45" stroke-width="1" />
	</g>

	<!-- Signature green thread, sweeping like the wordmark sheen -->
	<g class="signature">
		<path d="M4 31 H36" stroke="currentColor" stroke-width="1.5" opacity="0.55" />
		<path class="sig-sweep" d="M4 31 H12" stroke="#eafff3" stroke-width="1.5" />
	</g>

	<!-- Amber impact sparks at the collision point -->
	<g class="sparks" stroke="#ffb02e" stroke-width="1.1">
		<path class="spark s1" d="M20 19 L23 14" />
		<path class="spark s2" d="M20 19 L18 13" />
		<path class="spark s3" d="M20 19 L25 18" />
		<path class="spark s4" d="M20 19 L16 22" />
	</g>
</svg>

<style>
	svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.sig-sweep {
		transform-box: fill-box;
	}
	@media (prefers-reduced-motion: no-preference) {
		.beam-l {
			animation: gl-flicker 4.4s ease-in-out infinite;
		}
		.beam-r {
			animation: gl-flicker 4.4s ease-in-out infinite 1.6s;
		}
		.sig-sweep {
			animation: gl-sweep 3.2s ease-in-out infinite;
		}
		.spark {
			animation: gl-spark 3.2s ease-in-out infinite;
		}
		.spark.s2 {
			animation-delay: 0.1s;
		}
		.spark.s3 {
			animation-delay: 0.2s;
		}
		.spark.s4 {
			animation-delay: 0.05s;
		}
	}
	@keyframes gl-flicker {
		0%,
		100% {
			opacity: 0.85;
		}
		45% {
			opacity: 1;
		}
		50% {
			opacity: 0.4;
		}
		55% {
			opacity: 1;
		}
	}
	@keyframes gl-sweep {
		0% {
			transform: translateX(0);
			opacity: 0;
		}
		8% {
			opacity: 1;
		}
		55%,
		100% {
			transform: translateX(28px);
			opacity: 0;
		}
	}
	@keyframes gl-spark {
		0%,
		78%,
		100% {
			opacity: 0;
			transform: scale(0.6);
		}
		84% {
			opacity: 1;
			transform: scale(1.15);
		}
		92% {
			opacity: 0.7;
			transform: scale(1);
		}
	}
</style>
