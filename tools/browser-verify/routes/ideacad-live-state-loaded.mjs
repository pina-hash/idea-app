/**
 * LOADING THE NEWER VERSION TAKES TWO PRESSES AND THEN SHOWS IT (feedback R34).
 *
 * From the offer state (see `ideacad-live-state-offer.mjs`), Ben presses
 * "Load newer version", reads the confirmation that his unsaved changes will
 * be discarded, and presses "Discard mine and load". Window B then holds
 * Ana's model -- her sketch, her title -- with no panel left and the status
 * still live. The first press alone must not discard anything, which the
 * middle step checks before the second press.
 */
import { OFFER_SHOWN, REACH_OFFER, liveReady } from './_ideacad-live.mjs';

const PANEL_B = '[data-testid="live-pane-b"] [data-testid="ideacad-recovery"]';

export default {
	path: '/dev/ideacad-live?state=loaded',
	aliasOf: '/dev/ideacad-live',
	label: 'IdeaCAD live sync: after a second press, the window with unsaved work loads the newer version',
	prepare: [
		{ waitFor: liveReady(2) },
		{ evaluate: REACH_OFFER, until: OFFER_SHOWN, attempts: 3, gapMs: 1000 },
		{
			click: `${PANEL_B} button:has-text("Load newer version")`,
			until: `() => /Discard your unsaved changes/.test(document.querySelector('${PANEL_B}')?.textContent ?? '') && window.__icB.snapshot.manifest.title === 'Ben version'`,
			attempts: 10,
			gapMs: 300
		},
		{
			click: `${PANEL_B} button:has-text("Discard mine and load")`,
			until: `() => !document.querySelector('${PANEL_B}') && !window.__icB.busy && window.__icB.model.features.length === 1 && window.__icB.snapshot.manifest.title === window.__icA.snapshot.manifest.title`,
			attempts: 10,
			gapMs: 400
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-recovery"]', label: 'no panel left in either window', expectPresent: 0 },
		{ selector: '[data-testid="live-pane-b"] [data-testid="ideacad-live-state"][data-status="live"]', label: 'window B is still live', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [{ selector: '[data-testid="live-pane-b"] .solid-workspace footer', label: 'window B holds Ana\'s sketch', must: ['1 features'] }],
	orderResult: [
		{
			label: 'window B now holds exactly what the server holds',
			evaluate: `() => [window.__icB.snapshot.manifest.title === window.__icA.snapshot.manifest.title, window.__icB.model.features.length, window.__icLive.revision >= 2]`,
			expected: [true, 1, true]
		}
	],
	ignoreConsole: []
};
