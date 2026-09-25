/**
 * A REFUSED CHANNEL DEGRADES TO THE POLL, IN WORDS (feedback R34).
 *
 * `?refused=1` refuses window B's broadcast channel, the way 0211's policy
 * refuses a topic. Window B must say "Live unavailable" and why, and an edit
 * Ana saves in window A must STILL reach window B without a refresh -- through
 * the database poll, inside one poll interval (12 s) plus the fixture's
 * latency. The step reports the measured delay.
 */
import { COVERED_CONTROLS_B, LIVE_WORD_CLEAR_B, hitsItself, liveSource } from './_ideacad-live.mjs';

const NOTE_B = '[data-testid="live-pane-b"] [data-testid="ideacad-live-note"]';

export default {
	path: '/dev/ideacad-live?refused=1',
	label: 'IdeaCAD live sync: with its channel refused, a window still updates from the database poll',
	prepare: [
		{ waitFor: `() => !!window.__icA && !!window.__icB && !window.__icA.busy && !window.__icB.busy && !!document.querySelector('[data-testid="live-pane-b"] [data-testid="ideacad-live-state"][data-status="refused"]')` },
		{
			evaluate: liveSource(`
				window.__icRefusedNote ??= note();
				if (!B.model.bodies.length) {
					await idle(A); await sketchInA(); await idle(A); await extrudeInA(); await idle(A);
					await A.save();
					const saved = performance.now();
					let arrived = null;
					for (let i = 0; i < 800; i++) { if (B.model.bodies.length === 1 && !B.busy) { arrived = performance.now(); break; } await wait(25); }
					window.__icLiveTiming = { saveToShownMs: arrived === null ? null : Math.round(arrived - saved) };
				}
				await showB();
				return 'before: "' + window.__icRefusedNote + '"; B shows ' + B.model.bodies.length + ' body ' + (window.__icLiveTiming?.saveToShownMs ?? '?') + ' ms after A saved, by the poll alone; B says: ' + note();
			`),
			until: `() => !!window.__icB && window.__icB.model.bodies.length === 1 && /Updated by Ana Reyes/.test(document.querySelector('${NOTE_B}')?.textContent ?? '')`,
			attempts: 2,
			gapMs: 1000
		}
	],
	presence: [
		{ selector: '[data-testid="live-pane-b"] [data-testid="ideacad-live-state"][data-status="refused"]', label: 'window B says live is unavailable', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="live-pane-a"] [data-testid="ideacad-live-state"][data-status="live"]', label: 'window A is still live (positive control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ideacad-recovery"]', label: 'no recovery panel', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="live-pane-b"] [data-testid="ideacad-live-state"]', label: 'the status word, in words', must: ['Live unavailable'] },
		{ selector: NOTE_B, label: 'the change still arrived and says whose it was', must: ['Updated by Ana Reyes'] }
	],
	orderResult: [
		{
			label: 'before the change, window B said the poll covers it; afterwards it holds A\'s body, inside one poll interval plus latency',
			evaluate: `() => [/checks for saved changes every 12 seconds/.test(window.__icRefusedNote ?? ''), window.__icB.model.bodies.length, (window.__icLiveTiming?.saveToShownMs ?? 99999) < 13500]`,
			expected: [true, 1, true]
		},
		{ label: 'the note\'s dismiss control is what a press at its centre lands on', evaluate: hitsItself(`${NOTE_B} button`), expected: [true] },
		{ label: 'the longest status word, "Live unavailable", overlaps no top-bar control, footer word or save indicator, pushes no top-bar control outside the bar, and sits inside the window or gives way entirely (at least 8 things compared)', evaluate: LIVE_WORD_CLEAR_B, expected: [0, 0, true, true] },
		{ label: 'the note covers none of window B\'s tool palette or top bar (count covered by it, and at least 5 controls a press does reach)', evaluate: COVERED_CONTROLS_B, expected: [0, true] }
	],
	contrast: [{ selector: '[data-testid="live-pane-b"] [data-testid="ideacad-live-state"]', label: 'the unavailable word', min: 4.5 }],
	ignoreConsole: []
};
