/**
 * VOICE IS THE PALETTE'S SPEAK CONTROL, AND A MISS ACTS ON NOTHING (ledger
 * 0298, report 31). A teacher opens the palette with Ctrl K, presses Speak,
 * and says part of an item's name ("gear ratios"): nothing is opened, the
 * palette keeps listening, the words sit in the field, the ranked list
 * answers them with the item on top, and a sentence says what was heard. The
 * words and the microphone's own word are measured for contrast and the
 * control for its 44px.
 *
 * The acting half (an exact name, heard as an INTERIM result that holds still
 * for the stability window) is classroom-palette-s-1-manage-1-state-voice-act;
 * the no-support half is ...-state-voice-none.
 */
import { MANAGER, PALETTE_OPEN, READY, pressKey } from './_classroom-palette.mjs';
import { LISTENING, MIC, PLANT_VOICE_STUB } from './_voice-stub.mjs';

export default {
	path: `${MANAGER}&state=voice`,
	aliasOf: MANAGER,
	label: 'Command palette (teacher): Speak, and a near miss that acts on nothing',
	prepare: [
		READY,
		PLANT_VOICE_STUB,
		pressKey({ key: 'k', ctrlKey: true }, PALETTE_OPEN),
		{ label: 'nothing is built until Speak', evaluate: `() => 'recognisers built on open: ' + window.__voiceBuilt` },
		{ click: MIC, until: LISTENING },
		{
			label: 'say part of a name',
			evaluate: `() => { window.__voiceRec.say('Gear ratios.'); return 'said'; }`,
			until: `() => (document.querySelector('[data-testid="palette-voice-note"]')?.textContent ?? '').includes('Heard')`
		}
	],
	presence: [
		{ selector: MIC, label: 'the Speak control, now Stop', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="palette-voice-note"]', label: 'what was heard, said in words', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: MIC, label: 'the control says what a press does', must: ['Stop'], mustNot: ['Speak'] },
		{
			selector: '[data-testid="palette-voice-note"]',
			label: 'listening, what it heard, whose service listens, and that the portal records nothing',
			must: ['Listening.', 'Heard "gear ratios"', 'Nothing is named exactly that', 'speech service listens', 'the portal records nothing'],
			mustNot: ['nothing is recorded or sent']
		}
	],
	contrast: [
		{ selector: MIC, label: 'the Speak control word', min: 4.5 },
		{ selector: '[data-testid="palette-voice-note"]', label: 'the heard sentence', min: 4.5 }
	],
	tapTargets: [{ selector: MIC, label: 'the Speak control', min: 44 }],
	orderResult: [
		{
			label: 'one recogniser, still listening, nothing opened, the words in the field and the item on top of the list',
			evaluate: `() => [
				String(window.__voiceBuilt),
				window.__voiceRec.calls.join(','),
				String(!!document.querySelector('[data-testid="command-palette"]')),
				document.querySelector('[data-testid="palette-input"]').value,
				document.querySelector('[data-testid="palette-row"]')?.getAttribute('data-key') ?? 'NO ROW'
			]`,
			expected: ['1', 'start', 'true', 'gear ratios', 'item:i-returned']
		}
	]
};
