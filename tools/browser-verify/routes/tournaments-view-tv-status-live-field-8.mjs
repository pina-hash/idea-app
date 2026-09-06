export default {
	path: '/dev/tournaments?view=tv&status=live&field=8',
	label: 'Projector stage between matches: Next up and the QR',
	/* The state the projector spends most of the event in: who is about to
	   be called. Up-next names 57.6px at 1920 (were 24.8), their round labels
	   27.2px (were 17.6). The QR panel sits beside them. */
	settleMs: 900,
	presence: [
		{ selector: '.tv .upnext-row', label: 'up-next rows (three)', expectPresent: 3, maxPresent: 3 },
		{ selector: '.tv .entry-banner.md', label: 'up-next banners', expectPresent: 6, maxPresent: 6 },
		{ selector: '.tv .split-side canvas, .tv .split-side svg, .tv .split-side img', label: 'the QR panel', expectPresent: 1 },
		{ selector: '.tv .tnm-live', label: 'no LIVE indicator between matches', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.tv .stage-label', label: 'Next up label (accent)', min: 4.5 },
		{ selector: '.tv .upnext-label', label: 'up-next round labels', min: 4.5 },
		/* Unstyled banners only: a styled banner's ink is measured against its
		   own art by `bannerInk`, and the sweep's ancestor walk cannot see that
		   art (a light banner's dark ink read 1.13:1 against the panel BEHIND it). */
		{ selector: '.tv .entry-banner.md:not(.has-bg) .name', label: 'up-next names (unstyled banners)', min: 4.5 },
		{ selector: '.tv .sub-line', label: 'played count', min: 4.5 },
		{ selector: '.tv .tv-state', label: 'status', min: 4.5 }
	]
};
