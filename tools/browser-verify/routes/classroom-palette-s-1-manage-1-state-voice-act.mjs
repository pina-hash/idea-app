/**
 * AN EXACT NAME ACTS, AND AN INTERIM ONE ONLY ONCE IT HAS HELD STILL (ledger
 * 0298, report 31: "the time it takes me to speak and navigate somewhere is
 * greater than just clicking"). The service hands over "Classroom settings" as
 * an INTERIM result -- words it has not finished with -- and the palette acts
 * on it once it has held still for the stability window (about 300ms), without
 * waiting for the service to decide the sentence is over. The session ends
 * FIRST (the recogniser is aborted), then the registered action runs: the
 * palette closes and Settings opens.
 *
 * The measurement is the time from the interim result to Settings being on
 * screen: at least the window (it did not act on the first reading), and well
 * under a second.
 */
import { MANAGER, PALETTE_OPEN, READY, pressKey } from './_classroom-palette.mjs';
import { LISTENING, MIC, PLANT_VOICE_STUB } from './_voice-stub.mjs';

const SETTINGS_OPEN = `() => !!document.querySelector('dialog[data-testid="classroom-settings"][open]')`;

export default {
	path: `${MANAGER}&state=voice-act`,
	aliasOf: MANAGER,
	label: 'Command palette (teacher): an exact name, heard as an interim result, runs once it holds still',
	prepare: [
		READY,
		PLANT_VOICE_STUB,
		pressKey({ key: 'k', ctrlKey: true }, PALETTE_OPEN),
		{ click: MIC, until: LISTENING },
		{
			label: 'the service hears "classroom settings" and has not finished with it',
			evaluate: `async () => {
				const t0 = performance.now();
				window.__voiceRec.hearing('Classroom settings');
				const early = !!document.querySelector('dialog[data-testid="classroom-settings"][open]');
				for (let i = 0; i < 100 && !document.querySelector('dialog[data-testid="classroom-settings"][open]'); i++) await new Promise((r) => setTimeout(r, 20));
				window.__voiceActMs = Math.round(performance.now() - t0);
				window.__voiceEarly = early;
				return 'Settings on screen after ' + window.__voiceActMs + 'ms (on screen at once: ' + early + ')';
			}`,
			until: SETTINGS_OPEN
		}
	],
	presence: [
		{ selector: 'dialog[data-testid="classroom-settings"]', label: 'Settings, opened by voice', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="command-palette"]', label: 'the palette closed behind it', expectPresent: 0 }
	],
	orderResult: [
		{
			label: 'not on the first reading, within the window plus a margin, and the session ended before the action',
			evaluate: `() => [
				String(window.__voiceEarly),
				window.__voiceActMs >= 280 && window.__voiceActMs <= 900 ? 'acted after the window' : 'ACTED AT ' + window.__voiceActMs + 'ms',
				window.__voiceRec.calls.join(',')
			]`,
			expected: ['false', 'acted after the window', 'start,abort']
		}
	]
};
