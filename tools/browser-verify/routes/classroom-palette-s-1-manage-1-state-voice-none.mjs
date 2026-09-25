/**
 * NO SPEECH SERVICE, NO SPEAK CONTROL (ledger 0298, report 31). The browser
 * the palette opens in has no `SpeechRecognition` at all -- Firefox, or any
 * third-party browser on an iPad -- so there is no Speak button and no voice
 * line: absence is the mechanism, never a control that errors when pressed.
 * The search field is the positive control that the palette itself is open;
 * the ...-state-voice spec beside this one is the positive control for the
 * control.
 */
import { MANAGER, PALETTE_OPEN, READY, pressKey } from './_classroom-palette.mjs';
import { MIC, REMOVE_SPEECH } from './_voice-stub.mjs';

export default {
	path: `${MANAGER}&state=voice-none`,
	aliasOf: MANAGER,
	label: 'Command palette (teacher) in a browser with no speech service: no Speak control',
	prepare: [READY, REMOVE_SPEECH, pressKey({ key: 'k', ctrlKey: true }, PALETTE_OPEN)],
	presence: [
		{ selector: MIC, label: 'no Speak control', expectPresent: 0 },
		{ selector: '[data-testid="palette-voice-note"]', label: 'no voice line', expectPresent: 0 },
		{ selector: '[data-testid="palette-input"]', label: 'POSITIVE CONTROL: the palette is open', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	]
};
