<!--
	GAUNTLET homepage mark: an original wireframe CAD part (extruded hex boss on
	a dashed sketch profile) with a feature-tree motif and an animated machining
	scan line. Deliberately generic interface language; it must never resemble
	the SolidWORKS logo or its red-on-white scheme (see docs/GAUNTLET-DESIGN.md).
	Strokes inherit currentColor; accents read the gold/lime token. Animation
	only runs under prefers-reduced-motion: no-preference.
-->
<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<!-- Feature tree rail -->
	<g class="tree" stroke-width="1.1">
		<path d="M5 10v20" opacity="0.5" />
		<circle class="node n1" cx="5" cy="10" r="1.5" />
		<circle class="node n2" cx="5" cy="20" r="1.5" />
		<circle class="node n3" cx="5" cy="30" r="1.5" />
		<path d="M6.5 10h3M6.5 20h3M6.5 30h3" opacity="0.4" />
	</g>
	<!-- Dashed sketch profile under the part -->
	<g class="sketch" stroke="var(--gold, #c8ff00)" stroke-width="1" opacity="0.55">
		<path class="sketch-ring" d="M24 37.5l-9-3 0-3.5 9-3 9 3 0 3.5z" stroke-dasharray="3 2.6" />
	</g>
	<!-- Extruded hex boss (isometric wireframe) -->
	<g class="body">
		<path d="M24 8l8 3v3.4l-8 3-8-3V11z" />
		<path d="M24 8v9.4M16 11l8 3.4 8-3.4" opacity="0.75" />
		<path d="M16 14.4V26l8 3 8-3V14.4" />
		<path d="M24 17.4V29" opacity="0.75" />
		<circle cx="24" cy="12.6" r="1.9" opacity="0.65" />
	</g>
	<!-- Machining scan line sweeping the part -->
	<path class="scan" d="M14.5 12h19" stroke="var(--gold, #c8ff00)" stroke-width="0.9" stroke-dasharray="2 2" opacity="0.8" />
</svg>

<style>
	svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.node {
		fill: currentColor;
		stroke: none;
		opacity: 0.35;
	}
	@media (prefers-reduced-motion: no-preference) {
		.scan {
			animation: gm-scan 3.6s ease-in-out infinite;
		}
		.sketch-ring {
			animation: gm-dash 6s linear infinite;
		}
		.node.n1 {
			animation: gm-blink 3.6s infinite;
		}
		.node.n2 {
			animation: gm-blink 3.6s infinite 1.2s;
		}
		.node.n3 {
			animation: gm-blink 3.6s infinite 2.4s;
		}
	}
	@keyframes gm-scan {
		0%,
		100% {
			transform: translateY(0);
			opacity: 0.15;
		}
		50% {
			transform: translateY(16px);
			opacity: 0.85;
		}
	}
	@keyframes gm-dash {
		to {
			stroke-dashoffset: -22.4;
		}
	}
	@keyframes gm-blink {
		0%,
		75%,
		100% {
			opacity: 0.35;
		}
		12% {
			opacity: 1;
		}
	}
</style>
