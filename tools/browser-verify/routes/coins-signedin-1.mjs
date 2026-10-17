/**
 * The IDEA Coin Ledger's feedback window, SIGNED IN -- the other direction of
 * the claim `/dev/coins` makes signed out.
 *
 * WHY IT IS A SECOND ROUTE RATHER THAN A SECOND ROW. A signed-in and a
 * signed-out report differ in two visible ways -- whether the optional contact
 * field exists, and what the note tells a person their report carries -- and
 * each is a claim about a BRANCH. A spec that only ever measured one state
 * proves the branch renders, never that it is a branch.
 *
 * SINCE LEDGER 0396 THE BRANCH IS THE WINDOW'S, NOT THE PAGE'S. The Ledger used
 * to bake a signed-in boolean into its own bytes and choose an endpoint from
 * it; the official window is a page of the site and decides from its own
 * session, exactly as the home box does, and the Ledger's injected bytes are
 * the same for every reader (`tests/feedback-coverage.test.ts` drives the real
 * route both ways and compares them). `?signedIn=1` reaches the window as the
 * harness's signed-in switch (`/feedback/embed`, dev only, with the in-memory
 * sink), which is what a real session is here.
 *
 * THE 51px OVERFLOW AT 375 IS GONE, AND IT WAS THE LEDGER'S OWN FOURTH TAB;
 * `coins.mjs` carries the before-and-after measurement and the probes.
 *
 * THE LAST ROW SWITCHES THE THEME TO SPACE WHITE AS ANOTHER TAB WOULD (review
 * round 2): the box used to keep IDEA's dark field under Space White's dark
 * ink. It runs last because it leaves the page in Space White.
 */
import { FRAME_KEYS_CHECK, frameFields, frameFollowsTheme, OFFICIAL_CORNER_CHECK, OPEN_FRAME_BOX } from './_report-room.mjs';

export default {
	path: '/dev/coins-signedin-1',
	aliasOf: '/dev/coins?signedIn=1',
	label: 'IDEA Coin Ledger feedback window, signed in',
	settleMs: 1200,
	prepare: [OPEN_FRAME_BOX],
	presence: [
		{ selector: '.tab-bar .tab-btn', label: 'the Ledger rendered (its own tabs)', expectPresent: 4 },
		{ selector: '#idea-feedback-launch .sfb-trigger', label: 'the official feedback button', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '#idea-feedback-frame.is-open', label: 'the window, open in its frame', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [{ selector: '#idea-feedback-launch .sfb-word', label: 'the button word on its Ledger key', min: 4.5 }],
	tapTargets: [{ selector: '#idea-feedback-launch .sfb-trigger', label: 'the feedback button', min: 44 }],
	orderResult: [
		/* NO CONTACT FIELD WHERE THERE IS AN ACCOUNT: it is offered only where
		   there is none, and it is NEVER an identity -- nothing verifies it. The
		   message field in the same row is the positive control. */
		frameFields(true),
		OFFICIAL_CORNER_CHECK,
		FRAME_KEYS_CHECK,
		{
			label: 'the window says the report carries an account, and never that it does not',
			evaluate: `() => {
				const note = document.getElementById('idea-feedback-frame')?.contentDocument?.querySelector('.fb-note')?.textContent || '';
				return [
					note.includes('your role, your browser and the build') ? 'says your role is attached' : 'NOTE: ' + note.slice(0, 60),
					note.includes('not signed in') || note.includes('carries no name') ? 'ALSO SAYS NO NAME' : 'never says no name'
				];
			}`,
			expected: ['says your role is attached', 'never says no name']
		},
		frameFollowsTheme('space-white', 'space-white')
	]
};
