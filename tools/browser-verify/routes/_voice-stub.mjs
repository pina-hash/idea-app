/**
 * A SPEECH SERVICE WITH NO MICROPHONE BEHIND IT, planted on `window` before the
 * command palette opens (ledger 0298, report 31: voice is the palette's Speak
 * control now). The palette decides at OPEN whether this browser has a speech
 * service (`dictationConstructor()`, which reads `window.SpeechRecognition`
 * then `webkitSpeechRecognition`), so what it finds is this stub, driven
 * through the REAL `Dictation` driver: nothing here opens a device or asks for
 * a permission. The harness Chromium ships a real `webkitSpeechRecognition`,
 * which is why the stub REPLACES both names rather than filling a gap.
 *
 * `window.__voiceRec` is the recogniser the last Speak press built;
 * `say(t)` is a committed result and `hearing(t)` one the service has not
 * finished with, each exactly as the browser delivers them.
 *
 * `_`-prefixed, so the route loader skips it (routes.mjs).
 */
export const PLANT_VOICE_STUB = {
	label: 'plant a speech service with no microphone behind it',
	evaluate: `() => {
		class Stub {
			constructor() {
				this.lang = ''; this.continuous = false; this.interimResults = false;
				this.onstart = null; this.onresult = null; this.onerror = null; this.onend = null;
				this.calls = [];
				window.__voiceRec = this;
				window.__voiceBuilt = (window.__voiceBuilt || 0) + 1;
			}
			start() { this.calls.push('start'); this.onstart && this.onstart({}); }
			stop() { this.calls.push('stop'); this.onend && this.onend({}); }
			abort() { this.calls.push('abort'); }
			say(t) { this.onresult && this.onresult({ resultIndex: 0, results: [{ isFinal: true, length: 1, 0: { transcript: t } }] }); }
			hearing(t) { this.onresult && this.onresult({ resultIndex: 0, results: [{ isFinal: false, length: 1, 0: { transcript: t } }] }); }
		}
		window.SpeechRecognition = Stub;
		window.webkitSpeechRecognition = Stub;
		window.__voiceBuilt = 0;
		return 'stub planted';
	}`
};

/** No speech service at all: what Firefox, and every third-party browser on an iPad, has. */
export const REMOVE_SPEECH = {
	label: 'take the speech service away',
	evaluate: `() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; return 'no speech service'; }`
};

export const MIC = '[data-testid="palette-mic"]';
export const LISTENING = `() => !!window.__voiceRec && (document.querySelector('${'[data-testid="palette-mic"]'}')?.textContent ?? '').includes('Stop')`;
