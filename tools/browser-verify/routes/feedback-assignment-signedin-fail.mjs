/**
 * THE WINDOW DID NOT LOAD (ledger 0396): the assignment page's button opens the
 * window's page in a frame, and here that page answers the site's own error
 * page (the harness's `signedIn=fail`, which reaches only the window). The
 * launcher sees a document without the window's mark, throws the frame away
 * at once rather than after the full wait for `ready`, and the button says in
 * words beside itself that the window did not load and to press it again --
 * the root control's own sentence, `FEEDBACK_LOAD_FAILED`, on its own ground so
 * it stays legible over whatever the page has under the corner.
 */
export default {
	path: '/dev/feedback/assignment?signedIn=fail',
	label: 'Assignment page, the window cannot load: the button says so beside itself, at once',
	prepare: [
		{
			click: '#idea-feedback-launch .sfb-trigger',
			until: `() => !!document.querySelector('#idea-feedback-launch .sfb-load-failed')`
		}
	],
	presence: [
		{ selector: '#idea-feedback-launch .sfb-trigger', label: 'the button stays, to be pressed again', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '#idea-feedback-launch .sfb-load-failed', label: 'the did-not-load sentence, beside the button', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '#idea-feedback-frame', label: 'the frame that never became the window is thrown away', expectPresent: 0 }
	],
	textContains: [
		{ selector: '#idea-feedback-launch .sfb-load-failed', label: 'it says what happened and what to do, in words', must: ['did not load', 'press it again'] }
	],
	contrast: [{ selector: '#idea-feedback-launch .sfb-load-failed', label: 'the did-not-load sentence on its own ground', min: 4.5 }],
	tapTargets: [{ selector: '#idea-feedback-launch .sfb-trigger', label: 'the feedback button', min: 44 }],
	/* The window's 503 IS the state under test; the browser logs it. */
	ignoreConsole: [/503/]
};
