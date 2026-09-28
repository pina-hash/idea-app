export default {
	path: '/dev/feedback?view=console&undo=hold',
	label: 'Feedback console outside the classroom, one report moved: the Undo beside the note',
	/*
		THE CONSOLE AS /admin/feedback RENDERS IT (report R03). It left the
		classroom shell and the classroom's `.cr-root` room for the admin area,
		so the harness now mounts it under the SITE plate on a `display: contents`
		wrapper, exactly as the root layout does for /admin, and with no
		classroom.css behind it. Anything the console silently leaned on the
		classroom room for shows up here: the error line, a colour read off a
		ground it no longer sits on, a control that lost its key face.

		ONE REPORT IS MOVED FIRST (report R02). The first report's own Seen
		button is pressed; the report leaves the New tab, the note says what
		moved, and the Undo control appears beside it, saying in words where it
		will put the report back. `?undo=hold` keeps the offer open for ten
		minutes instead of ten seconds so the measurements below are not racing
		the timer; the production route never passes that prop, which
		tests/feedback-console-route.test.ts asserts.

		THE PREDICATE IS THE THING WANTED: the Undo control existing, which only
		a landed move produces. A click before hydration does nothing and is
		retried; the first click that lands satisfies the predicate, so no
		second report is moved.
	*/
	prepare: [
		{
			click: 'article.fb-row .fb-actions button:nth-child(2)',
			until: '() => !!document.querySelector(\'[data-testid="fbc-undo"]\')',
			attempts: 8,
			waitMs: 300
		}
	],
	presence: [
		{
			selector: '[data-testid="fbc-undo"]',
			label: 'the Undo control, after one move',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="fbc-bulk-note"]',
			label: 'the sentence saying what moved, beside it',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			/* Outside the classroom room: nothing on this page may be a
			   `.cr-root`, and the positive control is the site plate wrapper
			   the console sits in. */
			selector: '.cr-root',
			label: 'no classroom room around the console',
			expectPresent: 0
		},
		{
			selector: '.site-plate .fb-page',
			label: 'the console, under the site plate',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		}
	],
	textContains: [
		{
			selector: '[data-testid="fbc-undo"]',
			label: 'the Undo says where the report goes back to, in words',
			must: ['Undo', 'back to new']
		},
		{
			selector: '[data-testid="fbc-bulk-note"]',
			label: 'the note names the move it offers to undo',
			must: ['Moved 1 report to seen']
		}
	],
	contrast: [
		{ selector: '[data-testid="fbc-undo"]', label: 'the Undo control word', min: 4.5 },
		{ selector: '[data-testid="fbc-bulk-note"]', label: 'the note beside it', min: 4.5 },
		{ selector: '.fb-contact-warn', label: 'the unverified-contact warning', min: 4.5 },
		{ selector: '.fb-when', label: 'a report timestamp', min: 4.5 },
		{ selector: '.fb-message', label: 'a report message', min: 4.5 },
		{ selector: '.filters .filter', label: 'the status tabs', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="fbc-undo"]', label: 'the Undo control', min: 44 },
		{ selector: '.fb-actions .btn', label: "each report's own status buttons", min: 44 },
		{ selector: '.filters .filter', label: 'the status tabs', min: 44 }
	]
};
