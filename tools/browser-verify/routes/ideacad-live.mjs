/**
 * LIVE SYNC WITHOUT A REFRESH, MEASURED (feedback R34, ledger 0298 Tier C).
 *
 * `/dev/ideacad-live` mounts TWO real `SolidWorkspace`s, each with its own
 * kernel worker, over one in-memory server that applies the save RPC's own
 * rules and one in-memory broadcast bus. Window A is Ana, window B is Ben.
 *
 * The prepare step builds a sketch and an extrude in A through A's dev hook
 * and saves, then waits for B -- which nobody touches -- to show the body.
 * What is claimed, each as a count or a read:
 *   - both windows say "Live" in words, beside the save indicator;
 *   - B shows A's body (1 body, 2 features) and says who changed it;
 *   - B's workspace is the SAME DOM node before and after (no remount, no
 *     reload), and its model moved inside a time the step reports;
 *   - no recovery panel in either window (the positive control for that row
 *     is `ideacad-live-state-offer`).
 */
import { COVERED_CONTROLS_B, IN_FLOW_B, LIVE_WORD_CLEAR_B, hitsItself, liveReady, liveSource } from './_ideacad-live.mjs';

const NOTE_B = '[data-testid="live-pane-b"] [data-testid="ideacad-live-note"]';

export default {
	path: '/dev/ideacad-live',
	label: 'IdeaCAD live sync: an edit saved in one window appears in the other without a refresh',
	prepare: [
		{ waitFor: liveReady(2) },
		{
			evaluate: liveSource(`
				window.__icBNode ??= paneB.querySelector('.solid-workspace');
				if (!B.model.bodies.length) {
					await idle(A); await sketchInA(); await idle(A); await extrudeInA(); await idle(A);
					await A.save();
					const saved = performance.now();
					let arrived = null;
					for (let i = 0; i < 400; i++) { if (B.model.bodies.length === 1 && !B.busy) { arrived = performance.now(); break; } await wait(25); }
					window.__icLiveTiming = { saveToShownMs: arrived === null ? null : Math.round(arrived - saved) };
				}
				await showB();
				const saves = server.log.filter((e) => e.event === 'save' || e.event === 'refused').map((e) => e.event + ' ' + e.actor.split('.')[0] + ' r' + e.revision).join(', ');
				return 'B shows ' + B.model.bodies.length + ' body and ' + B.model.features.length + ' features ' + (window.__icLiveTiming?.saveToShownMs ?? '?') + ' ms after A saved; server saw: ' + saves + '; B says: ' + note();
			`),
			until: `() => !!window.__icB && window.__icB.model.bodies.length === 1 && /Updated by Ana Reyes/.test(document.querySelector('${NOTE_B}')?.textContent ?? '')`,
			attempts: 3,
			gapMs: 800
		}
	],
	presence: [
		{ selector: '.solid-workspace', label: 'two real workspaces on the page', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="ideacad-live-state"][data-status="live"]', label: 'both windows say they are live', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="ideacad-live-state"][data-status="refused"]', label: 'no window says live is unavailable (positive control: the refused-1 spec)', expectPresent: 0 },
		{ selector: `${NOTE_B} > div`, label: 'window B says who changed the model', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="live-pane-a"] [data-testid="ideacad-live-note"] > div', label: 'window A, whose own save it was, says nothing', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-recovery"]', label: 'no recovery panel in either window (positive control: the offer spec)', expectPresent: 0 }
	],
	textContains: [
		{ selector: NOTE_B, label: 'the note names Ana, in words', must: ['Updated by Ana Reyes'] },
		{ selector: '[data-testid="live-pane-b"] .solid-workspace footer', label: 'window B holds A\'s body and both features', must: ['1 body', '2 features'] },
		{ selector: '[data-testid="live-pane-b"] [data-testid="ideacad-live-state"]', label: 'the status word', must: ['Live'], mustNot: ['unavailable'] }
	],
	orderResult: [
		{
			label: 'window B updated in place: the same workspace node, one body, under 2 s after A saved',
			evaluate: `() => [document.querySelector('[data-testid="live-pane-b"] .solid-workspace') === window.__icBNode, window.__icB.model.bodies.length, (window.__icLiveTiming?.saveToShownMs ?? 99999) < 2000]`,
			expected: [true, 1, true]
		},
		{ label: 'the note\'s dismiss control is what a press at its centre lands on', evaluate: hitsItself(`${NOTE_B} button`), expected: [true] },
		{ label: 'the note covers none of window B\'s tool palette or top bar (count covered by it, and at least 5 controls a press does reach)', evaluate: COVERED_CONTROLS_B, expected: [0, true] },
		{ label: 'the "Live" word overlaps no top-bar control, footer word or save indicator, pushes no top-bar control outside the bar, and sits inside the window or gives way entirely (at least 8 things compared)', evaluate: LIVE_WORD_CLEAR_B, expected: [0, 0, true, true] },
		{ label: 'the note is a line in flow between the model and the footer, over neither (below the work area, above the footer, inside the window\'s width)', evaluate: IN_FLOW_B('[data-testid="ideacad-live-note"] > div'), expected: [true, true, true] }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-live-state"]', label: 'the live word', min: 4.5 },
		{ selector: `${NOTE_B} span`, label: 'who changed it', min: 4.5 }
	],
	tapTargets: [{ selector: `${NOTE_B} button`, label: 'dismiss the note', min: 44 }],
	canvasContent: [{ selector: '[data-testid="live-pane-b"] .solid-workspace canvas', label: 'window B draws the body A made' }],
	ignoreConsole: []
};
