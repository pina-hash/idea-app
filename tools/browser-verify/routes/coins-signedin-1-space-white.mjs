/**
 * The IDEA Coin Ledger's feedback window, signed in, ON SPACE WHITE (review
 * round 1 of ledger 0396) -- the theme Mr. Pina teaches in, and the one no
 * spec opened the framed window in, which is how the chosen kind and horizon
 * shipped at 2.35:1 there while IDEA and Matrix read 11.46.
 *
 * `?theme=space-white` pins the Ledger and stores the choice the way the
 * site's own switch does (the harness's alone), so the window, signed in,
 * opens in Space White too, which the first row checks inside the frame.
 *
 * THE LAST ROW SWITCHES THE THEME TO IDEA AS ANOTHER TAB WOULD (review round
 * 2): with the window built while the Ledger was on Space White, the box used
 * to keep Space White's light field under IDEA's light ink, 1.0:1. It runs
 * last because it leaves the page in IDEA; `coins-signedin-1` runs the other
 * direction.
 */
import { FRAME_KEYS_CHECK, frameFollowsTheme, OFFICIAL_CORNER_CHECK, OPEN_FRAME_BOX } from './_report-room.mjs';

export default {
	path: '/dev/coins-signedin-1-space-white',
	aliasOf: '/dev/coins?signedIn=1&theme=space-white',
	label: 'IDEA Coin Ledger feedback window, signed in, on Space White',
	settleMs: 1200,
	prepare: [OPEN_FRAME_BOX],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'the Ledger is on Space White (positive control)', expectPresent: 1, maxPresent: 1 },
		{ selector: '#idea-feedback-launch .sfb-trigger', label: 'the official feedback button', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '#idea-feedback-frame.is-open', label: 'the window, open in its frame', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [{ selector: '#idea-feedback-launch .sfb-word', label: 'the button word on its Ledger key', min: 4.5 }],
	tapTargets: [{ selector: '#idea-feedback-launch .sfb-trigger', label: 'the feedback button', min: 44 }],
	orderResult: [
		{
			label: 'the window follows the Ledger into Space White',
			evaluate: `() => [document.getElementById('idea-feedback-frame')?.contentDocument?.documentElement.getAttribute('data-theme') ?? 'NO FRAME']`,
			expected: ['space-white']
		},
		FRAME_KEYS_CHECK,
		OFFICIAL_CORNER_CHECK,
		frameFollowsTheme('idea', null)
	]
};
