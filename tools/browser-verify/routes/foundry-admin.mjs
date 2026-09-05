export default {
	path: '/dev/foundry-admin',
	label: '0173/0042: class gate scope, trusted publishers, owner roll-up, pinned detail pane',
	/*
		THE THREE STATES 0173 CREATES, none of which any automated session can
		reach on a real deployment: a student in a closed class, the teacher of
		record for that class, and an admin at the trusted publisher roster are
		three different real accounts. Everything measured here is the
		ARRANGEMENT; the gate itself is proved against the real RPCs in
		tests/foundry-section-gate-trust.test.ts, where opening each clause
		permissively flips the refusal.
	*/
	/*
		0045: THE CONFIRM STEP IS OPENED FOR REAL, BECAUSE ITS SENTENCE IS THE
		ONE THAT MATTERS MOST AND IT IS NOT ON SCREEN UNTIL SOMEBODY ARMS A ROW.

		`.fdy-access-confirm-reach` restates `FOUNDRY_CLOSURE_REACH` at the
		press that costs something -- including, since 0045, the two things a
		closure cannot stop. A spec that only measured the lead paragraph would
		be silent about the moment an instructor is actually deciding.

		THE PRESS RETRIES AGAINST ITS OWN EFFECT AND REPORTS ATTEMPTS. Paint is
		not interactivity: this page's markup is server-rendered and on screen
		before hydration attaches a handler, and no window marker separates the
		two. `clickUntil` retries until the confirm block exists and prints the
		attempt count and the elapsed milliseconds, so a step that "worked"
		through twelve dead clicks reads differently from one that landed
		first time.

		IT ARMS THE FIRST OPEN ROW, never a nth-child index: `foundrySectionOrder`
		puts the CLOSED section first, so `:first-child` here would press the
		row whose control says "Open it" and the confirm would never appear.
	*/
	prepare: [
		{
			click: '[data-testid="foundry-class-access"] .fdy-access-row:not(.is-closed) .fdy-access-do button',
			until: '() => !!document.querySelector(".fdy-access-confirm-reach")',
			label: 'arm a close so the confirm sentence is on screen'
		}
	],
	presence: [
		{ selector: '.harness h1', label: 'page heading', expectPresent: 1 },

		/* THE REFUSAL IS A STATED REASON, NOT A BLANK AREA. One panel, and the
		   note list carries ONE row against TWO closed classes -- the second
		   fixture class closed with no note on purpose, so `maxPresent` is
		   what makes "a note is optional" a measurement rather than a claim.
		   Without the ceiling, a panel that invented a placeholder for the
		   missing note would pass. */
		{ selector: '[data-testid="foundry-closed"][data-variant="panel"]', label: 'closed refusal panel', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="foundry-closed"][data-variant="panel"] .fdy-closed-notes li', label: 'instructor notes (1 of 2 closed classes left one)', expectPresent: 1, maxPresent: 1 },

		/* THE OTHER HALF OF THE SCOPE (0042), AND IT IS THE HALF A GREEN RUN
		   WOULD OTHERWISE NEVER LOOK AT. A closure reaches the gallery and
		   nothing else, so the student's own shelf, the publish flow, the
		   build contract and the manager's control keep rendering with this
		   NOTICE above them. Both variants are on this page at once, which is
		   also why every row here is scoped by `data-variant`: an unscoped
		   `[data-testid="foundry-closed"]` now matches two elements. */
		{ selector: '[data-testid="foundry-closed"][data-variant="notice"]', label: 'closed notice on a surface a closure does not reach', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="foundry-closed"][data-variant="notice"] .fdy-closed-kicker', label: 'notice kicker', expectPresent: 1, maxPresent: 1 },
		/* A NOTICE IS NOT A HEADING FOR THE PAGE IT SITS ABOVE. It carries a
		   kicker paragraph and no h2, so somebody navigating by headings does
		   not read another class's name as this page's title. An exclusion
		   with the panel's own h2 beside it as the positive control. */
		{ selector: '[data-testid="foundry-closed"][data-variant="notice"] h2', label: 'notice must own no heading', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="foundry-closed"][data-variant="panel"] h2', label: 'panel keeps its heading (control)', expectPresent: 1, maxPresent: 1 },

		/* THE REACH SENTENCE, WHERE THE SWITCH IS PRESSED. A control whose
		   blast radius nobody can predict is the defect 0042 fixes, so the
		   sentence saying a close binds those students in every class and at
		   home is a measured element and not a comment. */
		{ selector: '[data-testid="foundry-class-access"] .fdy-access-reach', label: 'reach sentence beside the switch', expectPresent: 1, maxPresent: 1 },
		/* 0045: and again at the confirm, which is the press that costs
		   something. Only reachable because the `prepare` step above armed a
		   row; if that step ever silently stops landing, this row is the thing
		   that reddens rather than the run going quietly green over a state it
		   never reached. */
		{ selector: '[data-testid="foundry-class-access"] .fdy-access-confirm-reach', label: 'reach sentence restated at the confirm', expectPresent: 1, maxPresent: 1 },

		/* The teacher's control: three sections, one currently closed. The
		   closed one sorts FIRST (foundrySectionOrder), which dom-order below
		   asserts rather than this. */
		{ selector: '[data-testid="foundry-class-access"]', label: 'class access panel', expectPresent: 1 },
		{ selector: '[data-testid="foundry-class-access"] .fdy-access-row', label: 'managed sections', expectPresent: 3, maxPresent: 3 },
		{ selector: '[data-testid="foundry-class-access"] .fdy-access-state[data-state="closed"]', label: 'closed state chips (1 of 3)', expectPresent: 1, maxPresent: 1 },

		{ selector: '[data-testid="foundry-trust-roster"]', label: 'trusted publisher roster', expectPresent: 1 },
		{ selector: '[data-testid="foundry-trust-roster"] .fdy-trust-row', label: 'trusted rows', expectPresent: 2, maxPresent: 2 },

		/* The owner roll-up. Two fixture apps, ONE played, so "1 of 2" is on
		   screen and the zero case is genuinely rendering. */
		{ selector: '[data-testid="foundry-owner-stats"]', label: 'owner roll-up', expectPresent: 1 },
		{ selector: '[data-testid="fdy-own-plays"]', label: 'all-time play figure', expectPresent: 1 },

		{ selector: '[data-testid="foundry-pinned-room"]', label: 'pinned-pane room', expectPresent: 1 }
	],
	textContains: [
		{
			selector: '[data-testid="foundry-closed"][data-variant="panel"]',
			label: 'the refusal names both classes and no email address',
			must: ['Engineering I Honors (3)', 'Engineering Design and Development (6)'],
			/* THE PAYLOAD CARRIES NO TEACHER ADDRESS (0173 projects the course
			   title and the label and nothing else), so no '@' may reach the
			   screen. 0045 adds the second exclusion: the two things a closure
			   cannot stop are the INSTRUCTOR's to read, and writing "a published
			   app opened by its own share link keeps running" onto a closed
			   student's panel would hand them the way around it, in our own
			   words, on the surface refusing them. Both are exclusions with the
			   two positive controls above them. */
			mustNot: ['@', 'share link', 'without signing in']
		},
		{
			selector: '[data-testid="foundry-closed"][data-variant="notice"]',
			label: 'the notice names the same classes and says what is still reachable',
			/* THE SAME SENTENCE FROM THE SAME SOURCE. `foundryClosedSentence`
			   builds the class list and `FOUNDRY_CLOSURE_LIMIT` says what a
			   close leaves alone; the panel above reads both too, so a change
			   that told the student one thing here and another there reddens
			   on one of these two rows. */
			must: ['Engineering I Honors (3)', 'their own apps', 'publishing'],
			mustNot: ['@', 'share link', 'without signing in']
		},
		{
			selector: '[data-testid="foundry-class-access"]',
			label: 'the instructor reads what a close takes, leaves and reaches',
			/* B2. Read off the three constants rather than paraphrased: the
			   reach clause is the one claim about this switch a person would
			   otherwise guess wrong, and the limit clause is the SAME string
			   the student's panel renders. */
			must: [
				'takes the app gallery away',
				'their own apps',
				'in every class and at home',
				'not only during your period',
				/* 0045. The closure now reaches `/foundry/preview` too, so the
				   effect sentence says so: an instructor reading only "the
				   gallery" would not expect Preview to stop working.

				   AND THE TWO THINGS IT CANNOT STOP ARE ON SCREEN. This is the
				   half that matters most: an instructor who believes the button
				   stops a student playing, and finds out in front of a class
				   that it does not, is worse off than one who was told the limit
				   up front. `/a/` and `/b/` answer on an origin that holds no
				   session by design, so there is no viewer there to gate and no
				   version of this feature in which those sentences stop being
				   true. They are read off `FOUNDRY_CLOSURE_REACH` rather than
				   paraphrased. */
				'running one of their own builds',
				'share link',
				'without signing in',
				'until they reload it'
			],
			/* AND THEY ARE NOT ON THE STUDENT'S PANEL. Which constant a
			   sentence lands in is a disclosure decision: `FOUNDRY_CLOSURE_REACH`
			   renders only here, behind `classroom_manages_section`, while
			   `FOUNDRY_CLOSURE_LIMIT` renders on the closed student's own
			   refusal. The exclusion is asserted on the two `foundry-closed`
			   rows above, with these four `must` entries as its positive
			   control on the same page. */
			mustNot: ['@']
		},
		{
			selector: '[data-testid="foundry-owner-stats"]',
			label: 'the coverage sentence travels with the figure',
			/* The phrase is read off FOUNDRY_PLAY_COVERAGE_NOTE rather than
			   paraphrased: a first draft of this row asserted '/a/' from
			   memory of the RULE ("a play from an app's own direct address is
			   not counted") rather than of the SENTENCE, and the harness
			   caught it. The note says "share link", not the route shape. */
			must: ['Opening it from its own share link is not counted']
		}
	],
	domOrder: [
		{
			before: '[data-testid="foundry-class-access"] .fdy-access-row.is-closed',
			after: '[data-testid="foundry-class-access"] .fdy-access-row:not(.is-closed)',
			label: 'a closed section sorts above the open ones (foundrySectionOrder)',
			beforeLabel: 'closed section row',
			afterLabel: 'first open section row'
		}
	],
	/*
		THE SCROLL ASSERTION, AND THE REASON IT IS AN `orderResult` RATHER THAN
		A GEOMETRY CHECK: what is being claimed is that scrolling one element
		does NOT move another, which is a BEFORE/AFTER pair and not a single
		measurement. It scrolls the nav pane by 400px, reads the detail pane's
		top before and after, and reports whether it moved.

		THE POSITIVE CONTROL IS RECORDED IN THE HISTORY ENTRY: with
		FoundryGallery reverted to scroll="page" this comes back
		['pane-not-scrollable'] and the row fails, because under page-flow the
		nav pane has no scrollport of its own to move.

		AT 375px `narrow="swap"` COLLAPSES TO ONE PANE and `fill` degrades to
		page-flow by design, so the honest answer there is 'single-column',
		which is listed as an accepted result rather than asserted away.
	*/
	orderResult: [
		{
			label: 'scrolling the card list leaves the open app where it is',
			/*
				THE PROBE ENCODES THE RULE FOR BOTH WIDTHS, because the spec runs
				at 375 and 1440 with one `expected`. Below the breakpoint
				`narrow="swap"` collapses to a single pane and `fill` degrades to
				page-flow BY DESIGN -- a phone gets the document's own scroll --
				so there is no second pane to keep still and 'ok' is the honest
				answer. Above it, 'ok' means the nav pane genuinely had its own
				scrollport AND the detail did not move when it was scrolled.

				BOTH FAILURE MODES ARE NAMED RATHER THAN FOLDED INTO false, so
				the row says WHICH thing broke: 'pane-not-scrollable' is the
				contract silently degrading to page-flow (the exact state before
				this fix, and what the positive control produces), 'detail-moved'
				is two scrollports that scroll together.
			*/
			evaluate: `() => {
				const room = document.querySelector('[data-testid="foundry-pinned-room"]');
				if (!room) return ['no-room'];
				const nav = room.querySelector('.cr-nav');
				const detail = room.querySelector('.cr-detail');
				if (!nav || !detail) return ['ok'];
				if (window.innerWidth < 1024) return ['ok'];
				if (nav.scrollHeight <= nav.clientHeight + 8) return ['pane-not-scrollable'];
				const before = detail.getBoundingClientRect().top;
				nav.scrollTop = 400;
				const after = detail.getBoundingClientRect().top;
				nav.scrollTop = 0;
				return [Math.abs(after - before) < 2 ? 'ok' : 'detail-moved'];
			}`,
			expected: ['ok']
		}
	],
	contrast: [
		{ selector: '[data-testid="foundry-closed"][data-variant="panel"] .fdy-closed-lead', label: 'refusal sentence', min: 4.5 },
		{ selector: '[data-testid="foundry-closed"][data-variant="panel"] .fdy-closed-note', label: 'instructor note', min: 4.5 },
		{ selector: '[data-testid="foundry-closed"][data-variant="panel"] .fdy-closed-next', label: 'what a close leaves alone (panel)', min: 4.5 },
		/* THE NOTICE'S OWN GROUND IS NOT THE PANEL'S. It sits on the room's
		   surface with a heat edge rather than inside a bordered card, so its
		   ink is measured separately: a shared component entering a second
		   ground is measured there, never assumed from the first. */
		{ selector: '[data-testid="foundry-closed"][data-variant="notice"] .fdy-closed-kicker', label: 'notice kicker', min: 4.5 },
		{ selector: '[data-testid="foundry-closed"][data-variant="notice"] .fdy-closed-lead', label: 'notice sentence', min: 4.5 },
		{ selector: '[data-testid="foundry-closed"][data-variant="notice"] .fdy-closed-next', label: 'what a close leaves alone (notice)', min: 4.5 },
		{ selector: '[data-testid="foundry-class-access"] .fdy-access-reach', label: 'reach sentence', min: 4.5 },
		{ selector: '[data-testid="foundry-class-access"] .fdy-access-confirm-reach', label: 'reach sentence at the confirm', min: 4.5 },
		{ selector: '[data-testid="foundry-class-access"] .fdy-access-course', label: 'section course title', min: 4.5 },
		{ selector: '[data-testid="foundry-class-access"] .fdy-access-state[data-state="open"]', label: 'Open state chip', min: 4.5 },
		{ selector: '[data-testid="foundry-class-access"] .fdy-access-state[data-state="closed"]', label: 'Closed state chip', min: 4.5 },
		{ selector: '[data-testid="foundry-trust-roster"] .fdy-trust-email', label: 'trusted address', min: 4.5 },
		{ selector: '[data-testid="fdy-own-plays"]', label: 'roll-up figure', min: 4.5 },
		{ selector: '[data-testid="foundry-owner-stats"] .fdy-own-note', label: 'coverage sentence', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="foundry-class-access"] button', label: 'section open/close controls', min: 44 },
		{ selector: '[data-testid="foundry-trust-roster"] button', label: 'roster controls', min: 44 },
		{ selector: '[data-testid="foundry-trust-roster"] input', label: 'roster fields', min: 44 }
	],
	/*
		COLOUR IS NEVER THE ONLY SIGNAL, and the two state chips carry a word
		each -- so this is not asserting that the words differ (they plainly
		do) but that the two states are also visually distinguishable, which a
		reader scanning a list of nine sections relies on. The regression it
		catches is somebody giving both chips the same ink and leaving only the
		text to tell them apart.
	*/
	statePairs: [
		{
			activeSelector: '[data-testid="foundry-class-access"] .fdy-access-state[data-state="open"]',
			inactiveSelector: '[data-testid="foundry-class-access"] .fdy-access-state[data-state="closed"]',
			label: 'Open vs Closed chips must render differently'
		}
	]
};
