<!--
	Site Admins homepage mark.

	IT EXISTS BECAUSE THE TWO ADMIN CARDS WERE THE SAME PICTURE. Site Admins and
	Admin Dashboard both carried `icon: 'dashboard'`, so the only thing telling
	them apart in the grid was their titles -- and in the compact view, where the
	tagline is dropped, that is a 24px glyph repeated twice above two lines of
	text. The two surfaces do different jobs: the dashboard is a set of readings
	(roles, pathways, review queues), and this one is a ROSTER -- who may
	administer the portal at all, a list only the owner can add to.

	So the glyph is that: a short roster with a key beside it. The key TURNS,
	once, slowly, and the roster line it belongs to brightens with it -- a grant
	landing on a name. Everything is drawn at rest; the motion only moves what is
	already on screen.

	Strokes inherit currentColor. Animation only runs under
	prefers-reduced-motion: no-preference.
-->
<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<!-- The roster: three names, the top one the grant lands on. -->
	<path class="row granted" d="M4 9h10" />
	<path d="M4 16h10" opacity="0.6" />
	<path d="M4 23h7" opacity="0.6" />
	<!-- The key: bow, shaft and two teeth. -->
	<g class="key">
		<circle cx="23" cy="11" r="3.2" />
		<path d="M23 14.2V25" />
		<path d="M23 19h3.4M23 22.4h2.6" />
	</g>
</svg>

<style>
	svg {
		width: 100%;
		height: 100%;
		display: block;
	}
	.key {
		/* Turns about the centre of its bow, in user units -- a lock turning,
		   not a whole key tumbling about its bounding box. */
		transform-origin: 23px 11px;
	}
	@media (prefers-reduced-motion: no-preference) {
		.key {
			animation: am-turn 4.6s ease-in-out infinite;
		}
		.row.granted {
			animation: am-grant 4.6s ease-in-out infinite;
		}
	}
	@keyframes am-turn {
		0%,
		12%,
		62%,
		100% {
			transform: rotate(0deg);
		}
		32%,
		46% {
			transform: rotate(14deg);
		}
	}
	@keyframes am-grant {
		0%,
		26%,
		70%,
		100% {
			opacity: 1;
		}
		40%,
		56% {
			opacity: 0.5;
		}
	}
</style>
