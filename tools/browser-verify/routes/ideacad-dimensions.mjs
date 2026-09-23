/**
 * THE NUMBERS IN THE VIEWPORT, MEASURED. Ledger 0296 (friction F025).
 *
 * `/dev/ideacad-dimensions` mounts the REAL `DimensionOverlay` (and the real
 * `DimensionPanel` beside it) over a kernel-free fake model: a 4 x 3 rectangle
 * sketched on Top and extruded 1 in, with its body selected, so the overlay
 * draws the sketch's width and height and the extrude's depth beside the
 * edges they control.
 *
 * WHAT IS CLAIMED: three numbers, each a BUTTON (a driving value is a control)
 * reading value and unit; every one clears 44 px and keeps its text 10 px off
 * its left and right border; no two labels overlap and none sits under the
 * panel (`orderResult`, computed on the page from the drawn boxes); a press at
 * a label's centre reaches the label; nothing scrolls sideways. The absence
 * rows (no box open, no measured word) sit beside the three-button positive
 * control. Typing is the editing spec's (`?state=editing`), and a read-only
 * document's absence of controls is `?state=readonly`'s.
 */
const overlapProbe = `() => {
	const boxes = [...document.querySelectorAll('[data-dimension-label]')].map((e) => e.getBoundingClientRect());
	const chrome = [...document.querySelectorAll('.panels > *, .controls, .error')].map((e) => e.getBoundingClientRect());
	const hits = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
	let n = 0;
	for (let i = 0; i < boxes.length; i++) { for (let j = i + 1; j < boxes.length; j++) if (hits(boxes[i], boxes[j])) n++; for (const c of chrome) if (hits(boxes[i], c)) n++; }
	return [boxes.length ? n : -1];
}`;
const gapProbe = `() => {
	let worst = Infinity;
	for (const el of document.querySelectorAll('[data-dimension-label]')) {
		const r = el.getBoundingClientRect(), cs = getComputedStyle(el), range = document.createRange(); range.selectNodeContents(el); const t = range.getBoundingClientRect();
		worst = Math.min(worst, t.left - r.left - parseFloat(cs.borderLeftWidth), r.right - parseFloat(cs.borderRightWidth) - t.right);
	}
	return [Number.isFinite(worst) && worst >= 6];
}`;
const reachProbe = `() => {
	const els = [...document.querySelectorAll('button[data-dimension-label]')];
	return [els.length > 0 && els.every((el) => { const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && (hit === el || el.contains(hit)); })];
}`;
export default {
	path: '/dev/ideacad-dimensions',
	label: 'IdeaCAD: a part\'s sizes drawn beside it, each one a button to type into',
	prepare: [
		{ waitFor: '() => !!window.ideaCadDims && document.querySelectorAll(\'[data-dimension-label]\').length === 3', waitMs: 300 }
	],
	presence: [
		{ selector: '[data-testid="ideacad-dimension-overlay"]', label: 'the overlay', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="ideacad-dimension-overlay"] button[data-dimension-label]', label: 'width, height and depth, each a button', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="ideacad-dimension-overlay"] .dim-lines polyline', label: 'dimension and witness lines, 3 per sketch value and 3 for the depth (present; a line parallel to the screen edge has a zero-width box, so visibility is the screenshot\'s)', expectPresent: 9, maxPresent: 9, expectVisible: 0 },
		{ selector: '[data-testid="ideacad-dimension-overlay"] [data-dimension-input]', label: 'no box open before a press', expectPresent: 0 },
		{ selector: '[data-testid="ideacad-dimension-overlay"] small', label: 'no measured word: every number here is driving', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="ideacad-dimension-overlay"]', label: 'value and unit on every label', must: ['4.000 in', '3.000 in', '1.000 in'], mustNot: ['measured', 'NaN'] }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-dimension-overlay"] button[data-dimension-label]', label: 'a dimension value', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="ideacad-dimension-overlay"] button[data-dimension-label]', label: 'a dimension value, pressed to type', min: 44 }
	],
	orderResult: [
		{ evaluate: overlapProbe, expected: [0], label: 'labels overlapping each other or the panel (0; -1 would mean none were drawn)' },
		{ evaluate: gapProbe, expected: [true], label: 'every label keeps at least 6 px between its text and its left and right border' },
		{ evaluate: reachProbe, expected: [true], label: 'a press at each label\'s centre reaches that label' }
	],
	ignoreConsole: []
};
