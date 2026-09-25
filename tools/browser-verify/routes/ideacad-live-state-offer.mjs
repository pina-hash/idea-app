/**
 * A WINDOW WITH UNSAVED WORK IS TOLD, AND KEEPS THE WORK (feedback R34).
 *
 * Ben's saves are held (failing on the wire) so window B stays unsaved on
 * purpose. Ben renames the model; Ana then draws a sketch in window A and
 * saves it. The hold is released and Ben's retrying save goes out, which the
 * server refuses as stale -- the ordinary path, since an autosave fires 800 ms
 * after an edit. Window B must NOT replay Ana's change over Ben's unsaved
 * rename. It must say, in words, that a newer version exists and who saved
 * it, with a backup control and a load control, and Ben's rename must still
 * be on screen; the duplicate "changed in another session" sentence is
 * suppressed because the live line already says it better. While a save is
 * retrying the layer WAITS rather than offering, because the newer revision
 * could be that very save; `liveDecide`'s node tests pin that order.
 */
import { COVERED_CONTROLS_B, IN_FLOW_B, OFFER_SHOWN, REACH_OFFER, hitsItself, liveReady } from './_ideacad-live.mjs';

const PANEL_B = '[data-testid="live-pane-b"] [data-testid="ideacad-recovery"]';

export default {
	path: '/dev/ideacad-live?state=offer',
	aliasOf: '/dev/ideacad-live',
	label: 'IdeaCAD live sync: a window with unsaved work keeps it and is told a newer version exists',
	prepare: [
		{ waitFor: liveReady(2) },
		{ evaluate: REACH_OFFER, until: OFFER_SHOWN, attempts: 3, gapMs: 1000 }
	],
	presence: [
		{ selector: PANEL_B, label: 'window B shows the newer-version panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="live-pane-a"] [data-testid="ideacad-recovery"]', label: 'window A, which saved it, shows none', expectPresent: 0 },
		{ selector: `${PANEL_B} [data-testid="ideacad-live-offer"]`, label: 'the line naming who saved it', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="live-pane-b"] [data-testid="ideacad-live-note"] > div', label: 'no second note beside the panel', expectPresent: 0 }
	],
	textContains: [
		{
			selector: PANEL_B,
			label: 'the panel says what happened, whose it was, and that nothing of Ben\'s was lost',
			must: ['A newer version exists', 'Ana Reyes saved a newer version of this model.', 'Your unsaved changes are still here', 'Save backup', 'Load newer version'],
			mustNot: ['This model changed in another session']
		}
	],
	orderResult: [
		{
			label: 'Ben\'s unsaved rename is still his model, and Ana\'s sketch was NOT replayed over it (A has 1 feature, B 0)',
			evaluate: `() => [window.__icB.snapshot.manifest.title, window.__icB.model.features.length, window.__icA.model.features.length]`,
			expected: ['Ben version', 0, 1]
		},
		{ label: '"Load newer version" is what a press at its centre lands on', evaluate: hitsItself(`${PANEL_B} button:last-of-type`), expected: [true] },
		{ label: '"Save backup" is what a press at its centre lands on', evaluate: hitsItself(`${PANEL_B} button:first-of-type`), expected: [true] },
		{ label: 'the panel is a block in flow between the model and the footer (it used to render below the visible work area, and placed over the model it covered the top bar)', evaluate: IN_FLOW_B('[data-testid="ideacad-recovery"]'), expected: [true, true, true] },
		{ label: 'the panel covers none of window B\'s tool palette or top bar (count covered by it, and at least 5 controls a press does reach)', evaluate: COVERED_CONTROLS_B, expected: [0, true] }
	],
	contrast: [
		{ selector: `${PANEL_B} h2`, label: 'the panel heading', min: 4.5 },
		{ selector: `${PANEL_B} p`, label: 'the panel sentences', min: 4.5 },
		{ selector: `${PANEL_B} button`, label: 'the panel controls', min: 4.5 }
	],
	tapTargets: [{ selector: `${PANEL_B} button`, label: 'backup and load', min: 44 }],
	ignoreConsole: []
};
