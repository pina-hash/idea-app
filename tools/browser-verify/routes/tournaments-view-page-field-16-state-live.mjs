export default {
	path: '/dev/tournaments?view=page&field=16&state=live',
	label: 'The event page composition in the room, 16 entries, one match live, the bracket at the console measure',
	/* The public page's pieces in the room the layout chain gives every
	   tournament page: the scoreboard masthead with the LIVE chip and the
	   event rail, the bracket at 16 entries inside its fullscreen stage, the
	   entries with their registrants, a card with body copy, dim copy and a
	   bare link. Every word is measured against the plate it sits on.

	   PROMPT 0110, ITEM 2: THE BRACKET WAS CUT OFF AND SQUISHED. Mr. Pina
	   runs the event page on a 2844x1450 screen, and the bracket rendered in
	   the 880px column `src/app.css` caps every `main` at, with the rounds
	   at a fixed width inside it. The route's page is `tnm-page console`
	   now (the window, less the gutter), and `.round` is `flex: 1 1 13.5rem`
	   so the columns take the width the page gives them. The probe below
	   reads that off the real layout at whatever width the run is driven
	   at: the page measure against the window, the bracket against the page
	   measure, and the cap that used to bind. The prepare step prints the
	   raw pixels so the 1440 / 1920 / 2844 figures are in the report rather
	   than in a sentence. */
	settleMs: 700,
	prepare: [
		{
			evaluate: () => {
				const main = document.querySelector('main.tnm-page');
				const stage = document.querySelector('[data-testid="bracket"]');
				if (!main || !stage) return 'main or bracket MISSING';
				const cs = getComputedStyle(main);
				const content = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
				const rounds = Array.from(stage.querySelectorAll('.rounds')).map((r) => Math.max(Math.round(r.getBoundingClientRect().width), r.scrollWidth));
				const cols = Array.from(stage.querySelectorAll('.round')).map((r) => Math.round(r.getBoundingClientRect().width));
				return `window ${window.innerWidth}x${window.innerHeight}; main ${Math.round(main.getBoundingClientRect().width)}px wide (content ${Math.round(content)}px, max-width ${cs.maxWidth}); bracket rounds ${rounds.join(' / ')}px; round columns ${Math.min(...cols)}..${Math.max(...cols)}px over ${cols.length} columns; stage scrollWidth ${stage.scrollWidth}px of clientWidth ${stage.clientWidth}px`;
			},
			label: 'the bracket width against the page and the window (printed)'
		}
	],
	presence: [
		{ selector: '.tnm-shell .hero .tnm-status.live', label: 'LIVE chip in the masthead (the one emerald element)', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="event-rail"] .cell.live', label: 'one live cell on the rail', expectPresent: 1, maxPresent: 1 },
		{ selector: '.bracket-scroll .match.live', label: 'one live node in the bracket', expectPresent: 1, maxPresent: 1 },
		{ selector: '.bracket-scroll .match', label: 'bracket nodes', expectPresent: 1 },
		{ selector: '[data-testid="bracket-stage"]', label: 'the bracket stage (the element that goes full screen)', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="bracket-stage"] [data-testid="bracket-fullscreen"]', label: 'the Full screen control, inside the stage so it survives entering it', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="page-entries"] .entry-banner', label: 'the sixteen entries', expectPresent: 16, maxPresent: 16 },
		/* Registrants under a banner (0192): the sim's two team entries name
		   both members; a solo whose captain is named as the entry shows
		   nothing extra. Exactly two, never sixteen. */
		{ selector: '[data-testid="page-entries"] .entry-banner .members', label: 'member lines on the two team banners only', expectPresent: 2, maxPresent: 2 }
	],
	contrast: [
		{ selector: '.hero .eyebrow', label: 'eyebrow', min: 4.5 },
		{ selector: '.hero h1', label: 'tournament name', min: 4.5 },
		{ selector: '.hero .tnm-status.live', label: 'LIVE chip', min: 4.5 },
		{ selector: '[data-testid="event-rail"] .count', label: 'rail count', min: 4.5 },
		{ selector: '[data-testid="event-rail"] .clock', label: 'rail clock', min: 4.5 },
		{ selector: '.tnm-shell .card h2', label: 'card heading', min: 4.5 },
		{ selector: '.tnm-shell .card > p', label: 'card body copy', min: 4.5 },
		{ selector: '.tnm-shell .card a', label: 'bare link', min: 4.5 },
		{ selector: '.bracket-scroll .round-label', label: 'bracket round label', min: 4.5 },
		{ selector: '.bracket-scroll .match-head', label: 'bracket node head', min: 4.5 },
		{ selector: '.bracket-scroll .live-chip', label: 'bracket LIVE chip (crimson)', min: 4.5 },
		{ selector: '.bracket-scroll .section-title', label: 'bracket section title', min: 4.5 },
		{ selector: '[data-testid="bracket-fullscreen"]', label: 'the Full screen control', min: 4.5 },
		{ selector: '[data-testid="bracket-stage"] h2', label: 'the stage heading', min: 4.5 }
		/* No contrast row on the registrant lines: the sim's two team entries
		   are its first two, and `sampleStyles` styles the first five, so
		   every `.members` line on this page sits on a styled banner whose ink
		   `bannerInk` picks against its own art -- which the sweep's ancestor
		   walk cannot see (see the tv specs). Measured: the row matched
		   nothing. The presence row above is what asserts the lines render. */
	],
	tapTargets: [
		{ selector: '.bracket-scroll a.match', label: 'bracket node links', min: 44 },
		{ selector: '[data-testid="bracket-fullscreen"]', label: 'the Full screen control', min: 44 }
	],
	textContains: [
		/* Windowed: the control offers the way in and not the way out. The
		   field-4 tv spec is where fullscreen is entered for real; this page
		   is measured at rest because entering it unmounts everything the
		   rows above measure. */
		{ selector: '[data-testid="bracket-fullscreen"]', label: 'the control names the way in', must: ['Full screen'], mustNot: ['Exit full screen'] }
	],
	orderResult: [
		{
			/* THE WIDTH CLAIM, MEASURED. Three tokens, each one a thing that
			   was wrong before this bundle: the page measure is the window
			   (`main` is `width: 100%; box-sizing: border-box`, so its border
			   box IS the viewport width and the gutter is inside it -- not
			   880px centred); the bracket's rounds take at least 90% of the
			   page's content width (the rounds row is a flex container whose
			   columns grow, so at a desk it is the content width exactly; at
			   a phone the columns' 13.5rem floor overflows the row inside
			   `.bracket-scroll`, which is the scroll and not a clip, and the
			   scrollWidth is what is read); and the cap that bound is gone. */
			evaluate: () => {
				const main = document.querySelector('main.tnm-page');
				const stage = document.querySelector('[data-testid="bracket"]');
				if (!main || !stage) return ['main-or-bracket:MISSING'];
				const cs = getComputedStyle(main);
				const mainW = main.getBoundingClientRect().width;
				const content = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
				const rounds = Array.from(stage.querySelectorAll('.rounds'));
				const widest = Math.max(...rounds.map((r) => Math.max(r.getBoundingClientRect().width, r.scrollWidth)));
				return [
					'main:present',
					main.classList.contains('console') ? 'measure:console' : 'measure:' + Array.from(main.classList).join('.'),
					mainW >= window.innerWidth * 0.95 ? 'page:>=95%-of-window' : 'page:' + Math.round((mainW / window.innerWidth) * 100) + '%-of-window',
					widest >= content * 0.9 ? 'bracket:>=90%-of-page' : 'bracket:' + Math.round((widest / content) * 100) + '%-of-page',
					cs.maxWidth === '880px' ? 'cap:880px-STILL-BINDS' : 'cap:overridden'
				];
			},
			expected: ['main:present', 'measure:console', 'page:>=95%-of-window', 'bracket:>=90%-of-page', 'cap:overridden'],
			label: 'the page is the window and the bracket is the page (the 880px main cap no longer binds)'
		}
	],
	motion: [
		{ selector: '[data-testid="event-rail"] .cell.live', label: 'rail live cell pulse', expect: 'gated' }
	]
};
