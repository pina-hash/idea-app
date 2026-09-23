/**
 * THE NEGATIVE CONTROL: a browser with no `SpeechRecognition`, which is Firefox
 * and every third-party browser on an iPad.
 *
 * ABSENCE IS THE MECHANISM -- the rule `$lib/feedback/dictation.ts` already
 * states for its own microphone button -- so what must be on screen is NOTHING:
 * not a disabled control, not a tooltip, not a greyed microphone that errors
 * when pressed. An absence row cannot tell "the rule holds" from "the markup
 * was renamed", so the harness page's own panels are asserted present in the
 * same spec.
 *
 * THIS ROUTE FOUND A REAL DEFECT rather than merely recording one. `VoiceNav`
 * read `recognizer ?? dictationConstructor()`, which makes an explicit `null`
 * indistinguishable from an absent prop: this page asked for the no-support
 * state and got Chromium's own `webkitSpeechRecognition` back, so the control
 * rendered and would have opened a real microphone. The mount test asserting
 * the same thing was GREEN, because happy-dom has no such constructor and the
 * fallback answered null there too. It is `!== undefined` now, and the mount
 * test plants a constructor on `window` so its own row can no longer pass for
 * that reason.
 */
export default {
	path: '/dev/voice?recognizer=off',
	label: 'Voice navigation on a browser with no speech recognition (nothing renders)',
	presence: [
		/* THE POSITIVE CONTROL, and the whole reason the rows below mean
		   something: the page rendered, and it rendered the extra panel that only
		   this variant carries. */
		{
			selector: '.voice-harness .panel',
			label: 'the harness page rendered (positive control)',
			expectPresent: 3,
			expectVisible: 3
		},
		{
			selector: '[data-testid="unsupported"]',
			label: 'the one surface that deliberately states what the answer was',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		/* THE ABSENCES. Exact zero -- `maxPresent` defaults to 0 when
		   `expectPresent` is 0. */
		{
			selector: '[data-testid="control-stage"] .vnav-trigger',
			label: 'no control at all inside the stage',
			expectPresent: 0
		},
		{
			selector: '[data-testid="control-stage"] .vnav-panel',
			label: 'no panel',
			expectPresent: 0
		},
		{
			selector: '[data-testid="control-stage"] button',
			label: 'no button of any kind, disabled or otherwise',
			expectPresent: 0
		}
	],
	contrast: [
		{
			selector: '[data-testid="unsupported"] p',
			label: 'the sentence saying which browsers do have it',
			min: 4.5
		}
	],
	textContains: [
		{
			selector: '[data-testid="unsupported"]',
			label: 'it names what to use instead rather than only refusing',
			must: ['Chrome and Edge', 'Safari on an iPad'],
			/* A REFUSAL IS NEVER DRESSED AS A BROKEN FEATURE. */
			mustNot: ['error', 'failed']
		}
	],
	orderResult: [
		{
			label: 'the docked shell copy is the only VoiceNav on the page',
			/* The SHELL mount still renders here, because the harness Chromium
			   genuinely does have the API -- only the stage's copy was told it
			   does not. That is the honest reading: this route measures the
			   COMPONENT's answer to "no constructor", not the browser's. */
			evaluate:
				'() => { const stage = document.querySelectorAll(\'[data-testid="control-stage"] .vnav\').length; return [stage + " in the stage"]; }',
			expected: ['0 in the stage']
		}
	]
};
