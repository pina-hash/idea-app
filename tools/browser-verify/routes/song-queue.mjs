// original array position 20 of 25 -- see ../README.md for what `order` means
export const order = 20;

export default {
	path: '/dev/song-queue',
	label: 'Song queue (0145), seven mounts -- student, capped student, manager, read-only',
	/*
		SHIPPED BUILT AND NEVER REGISTERED. The route's own header says so:
		"deliberately NOT in tools/browser-verify/routes.mjs, because the
		session that added it was scoped out of that directory." Its own
		session hand-measured 0px overflow, 23 controls at exactly 44.0px
		(hit fraction 1.0) and 20 links boxing at 24.3px whose HIT-TESTED
		reach is 44.0px with 0 taps stolen -- confirmed here rather than
		retyped: a plain box-height tap-target check would report 20
		findings on `.tap-reach-44` links that are genuinely fine, because
		the reach is a pseudo-element that grows the HIT AREA without
		reflowing the link's own line box (CLAUDE.md: ".tap-reach-44
		expands the HIT AREA of one sitting inside a line of text"). The
		harness's own `tap-target` check already hit-tests every control's
		CENTRE and reports it beside the box, which is what proves the
		20 links are not 20 findings.
	*/
	presence: [
		{ selector: 'section.mount[data-mount]', label: 'the seven state mounts', expectPresent: 7 },
		{ selector: '[data-testid="song-queue"]', label: 'SongQueue card, one per mount', expectPresent: 7 },
		{ selector: '[data-mount="student / at the cap"] [data-testid="song-queue-send"][aria-disabled="true"]', label: 'capped student control is aria-disabled', expectPresent: 1 },
		{ selector: '[data-testid="song-queue-send"][disabled], [data-testid="song-queue-approve"][disabled], [data-testid="song-queue-reject"][disabled]', label: 'no control carries a real disabled attribute', expectPresent: 0, expectVisible: 0 }
	],
	contrast: [
		{ selector: '[data-testid="song-queue-price"]', label: 'price label', min: 4.5 },
		{ selector: '[data-mount="manager / queue to work"] [data-testid="song-queue-tally"]', label: 'pending tally', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.tap-44', label: 'primary controls (send / approve / reject / send reason)', min: 44 }
	],
	/*
		`.sq-link` IS `.tap-reach-44`, NOT `.tap-44`: it sits inside a text
		row (a URL and its meta beside it), so its box stays whatever its
		text needs (measured 24.3px tall) and the 44px floor is met by the
		pseudo-element reach instead (app.css). Pointing the ordinary
		`tapTargets` box check at it would report all 20 as findings on a
		control that is correct by design -- see `tapReach` in checks.mjs,
		which measures the reach's own geometry and hit-tests it rather
		than the link's box.
	*/
	tapReach: [
		{ selector: '.sq-link.tap-reach-44', label: 'approved/pending row links (reach, not box)', min: 44 }
	],
	/*
		THE aria-disabled CONTRACT AGAIN, the same shape as /dev/hall-pass:
		the capped student's Request control must still take the tap and
		explain itself. Proven by actually clicking it (clickUntil's
		coordinate click, which lands on aria-disabled where
		locator.click() would refuse) and reading the notice it produces.
	*/
	prepare: [
		{
			click: '[data-mount="student / at the cap"] [data-testid="song-queue-send"]',
			until: '() => !!document.querySelector(\'[data-mount="student / at the cap"] [data-testid="song-queue-notice"]\')'
		}
	]
};
