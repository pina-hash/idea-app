/**
 * A NUMBER IN THE VIEWPORT, OPEN FOR TYPING. Ledger 0296 (F025).
 *
 * `/dev/ideacad-dimensions?state=editing` (the harness reads its own query): the width label
 * pressed, a real click, so the box opens in place holding the number with
 * all of it selected; then 6 is typed and Enter pressed, and the fake
 * workspace's log must read "Set Distance 1" with the sketch's width at 6.
 * The box is a 44 px field with no min, max or step: the kernel's answer is
 * the only refusal of a value.
 */
export default {
	path: '/dev/ideacad-dimensions?state=editing',
	label: 'IdeaCAD: a dimension typed in place',
	prepare: [
		{ waitFor: '() => !!window.ideaCadDims && document.querySelectorAll(\'[data-dimension-label]\').length === 3' },
		{ click: '[data-dimension-label="s1:kw"]', until: '() => !!document.querySelector(\'[data-dimension-input="s1:kw"]\')', attempts: 10, gapMs: 200, waitMs: 200 }
	],
	presence: [
		{ selector: '[data-dimension-input="s1:kw"]', label: 'the box, open in place of the width', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: 'button[data-dimension-label="s1:kw"]', label: 'the width button it replaced, absent while open', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-dimension-overlay"] button[data-dimension-label]', label: 'the other two numbers, still buttons (positive control)', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-dimension-input][min], [data-dimension-input][max], [data-dimension-input][step]', label: 'no min, max or step on the box', expectPresent: 0 }
	],
	tapTargets: [
		{ selector: '[data-dimension-input="s1:kw"]', label: 'the box', min: 44 }
	],
	orderResult: [
		{ evaluate: '() => { const i = document.activeElement; return [!!i && i.getAttribute(\'data-dimension-input\') === \'s1:kw\', i && i.value, i && i.selectionStart, i && i.selectionEnd]; }', expected: [true, '4', 0, 1], label: 'the box opens focused, holding 4, all of it selected' },
		{ evaluate: `async () => {
			const i = document.querySelector('[data-dimension-input="s1:kw"]');
			i.value = '6'; i.dispatchEvent(new Event('input', { bubbles: true }));
			i.form.requestSubmit();
			for (let k = 0; k < 60 && document.querySelector('[data-dimension-input]'); k++) await new Promise((r) => setTimeout(r, 50));
			const w = window.ideaCadDims.manifest.features[0].constraints.find((c) => c.id === 'kw').value;
			return [...window.ideaCadDims.log, w];
		}`, expected: ['Set Distance 1', 6], label: 'Enter sets the width through set-feature, labelled as the history row reads' }
	],
	ignoreConsole: []
};
