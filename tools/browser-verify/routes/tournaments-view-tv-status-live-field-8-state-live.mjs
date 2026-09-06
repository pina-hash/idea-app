export default {
	path: '/dev/tournaments?view=tv&status=live&field=8&state=live',
	label: 'Projector stage, a match live, pinned to the viewport',
	/* THE ROOM'S SCREEN. TvStage mounted the way /tournaments/[id]/tv mounts
	   it (position: fixed, the whole viewport), with one match in progress.
	   The harness widths are a phone and a desk; the projector figure is a
	   third width the report quotes from `--width 1920`: at 1920x1080 the
	   names measure 89.6px, the round label 35.2px (was 22.4), LIVE 33.6px
	   (was 25.6), the match clock 41.6px and the footer address 26.9px (was
	   16.8) -- sized against a 2.2 m wide image read from 8 m. Nothing on
	   this stage is a control, which the last presence row states. */
	settleMs: 900,
	presence: [
		{ selector: '.tv .tnm-live', label: 'LIVE indicator (the one emerald element)', expectPresent: 1, maxPresent: 1 },
		{ selector: '.tv .entry-banner.xl', label: 'the two competitors at xl', expectPresent: 2, maxPresent: 2 },
		{ selector: '.tv .clock', label: 'the match clock', expectPresent: 1, maxPresent: 1 },
		{ selector: '.tv .stage-label', label: 'round label', expectPresent: 1, maxPresent: 1 },
		{ selector: '.tv a, .tv button, .tv input', label: 'controls on the projector (none, by design)', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.tv .tv-name', label: 'tournament name', min: 4.5 },
		{ selector: '.tv .tnm-live', label: 'LIVE (accent on the plate)', min: 4.5 },
		{ selector: '.tv .stage-label', label: 'round label', min: 4.5 },
		{ selector: '.tv .entry-banner.xl:not(.has-bg) .name', label: 'competitor names (unstyled banners)', min: 4.5 },
		{ selector: '.tv .vs', label: 'vs', min: 4.5 },
		{ selector: '.tv .clock', label: 'match clock', min: 4.5 },
		{ selector: '.tv .clock-word', label: 'match clock word', min: 4.5 },
		{ selector: '.tv .tv-foot', label: 'footer address', min: 4.5 }
		/* Competitor names are measured on banners carrying NO entry style: a
		   styled banner paints its own art behind the name and picks its ink by
		   that art's luminance (`bannerInk`, 0064), and the sweep resolves a
		   ground by walking ANCESTORS, so it lands on the panel behind the art
		   and reports the dark ink of a light banner at 1.13:1 -- a true reading
		   of the wrong ground. Two of the sim's eight entries carry a style. */
	],
	/* No `motion` row: the LIVE pulse is on a `::before`, invisible to
	   `getAnimations()` on the element (see tournaments.mjs). */
};
