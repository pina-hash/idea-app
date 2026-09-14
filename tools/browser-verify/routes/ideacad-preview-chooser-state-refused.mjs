/**
 * A REAL REFUSAL, DRIVEN. Ledger 0264, item 5.
 *
 * `aliasOf` names the same dev page: this is a STATE of the chooser, not a
 * second route.
 *
 * WHY THIS IS WORTH A BROWSER RUN AT ALL. The rule is that the chooser reports
 * what the server said and never a generalisation of it, and the measured
 * failure behind it is a chooser that answered "This document could not be
 * opened" over "Only a student enrolled in this class can work on this
 * assignment". `tests/ideacad-chooser.test.ts` pins the function and six
 * mutants confirm it bites -- but nothing there proves the sentence reaches the
 * screen, and an SSR render runs no handler at all.
 *
 * THE PREVIEW'S OWN INERT CLIENT IS THE FIXTURE, which is the neat part: the
 * harness page hands `IdeaCadApp` a `{}` where a `SupabaseClient` goes, so
 * pressing a card genuinely throws inside the real store on the real path. The
 * sentence on screen is the runtime's own, not one this spec planted -- so the
 * `mustNot` below is the whole assertion: whatever arrives, it is NOT the
 * generic sentence, because there is no code path left that can produce one.
 *
 * AND IT RENDERS WHERE THE PRESS HAPPENED. The refusal is asserted INSIDE the
 * card that was clicked (`.doc .doc-refusal`), never in the panel at the top of
 * the list -- which on a chooser somebody has scrolled is a sentence about a row
 * they can no longer see. The top-of-list panel is the fallback for a card a
 * later search took off screen and is asserted ABSENT here, with the in-card
 * one present beside it as its positive control.
 */
export default {
	path: '/ideacad/preview/chooser?state=refused',
	aliasOf: '/ideacad/preview/chooser',
	label: 'IdeaCAD chooser: a refused open reports the real reason, in the card that was pressed',
	prepare: [
		{
			/* The first card's open control. `until` is what makes this a
			   guarantee rather than a hope: the step does not pass until a
			   refusal has actually been rendered inside a card. */
			click: '.doc .doc-open',
			until: '() => !!document.querySelector(".doc .doc-refusal .refusal-message")'
		}
	],
	presence: [
		{ selector: '.doc .doc-refusal', label: 'the refusal, inside the card that was pressed', expectPresent: 1, expectVisible: 1 },
		{ selector: '.refusal[role="alert"]', label: 'exactly one refusal on the page, and it is that one', expectPresent: 1, expectVisible: 1 },
		/* The eight cards are still on screen: a refusal must not take the list
		   away, and this is the positive control for the two absences below. */
		{ selector: '.doc', label: 'every document card, still there', expectPresent: 8, expectVisible: 8 },
		/* The press failed, so the editor never mounted and the command bar
		   carries no document title. */
		{ selector: '[data-testid="ideacad-document-title"]', label: 'the document title, absent because nothing opened', expectPresent: 0 },
		{ selector: '.ideacad', label: 'the Blade editor, absent because nothing opened', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.refusal-message', label: 'the refusal sentence on the card ground', min: 4.5 },
		{ selector: '.refusal-subject', label: 'the name of what refused', min: 4.5 }
	],
	textContains: [
		{
			selector: '.doc .doc-refusal',
			label: 'the sentence is the runtime’s own, not a generalisation of it',
			/* The subject is the card's own title, so a reader can tell which of
			   eight identical rows refused. */
			must: ['Competition blade study'],
			/* EVERY GENERIC THIS PATH HAS EVER PRODUCED OR COULD PRODUCE. The
			   first is the measured defect verbatim; the rest are the shapes a
			   future "friendlier default" would take. A refusal that cannot be
			   explained has its OWN words (`ideaCadOpenRefusal`'s last two rungs
			   say a failure arrived with no text and show the code), and those
			   are deliberately not any of these. */
			mustNot: [
				'This document could not be opened',
				'could not be opened',
				'Something went wrong',
				'An error occurred',
				'Please try again later'
			]
		}
	]
};
