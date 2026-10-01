/**
 * THE CLASS HEADER WHILE AN ITEM IS OPEN BESIDE IT (ledger 0360, report R19),
 * at 375 and 1440. The item owns the page's h1, so the class name is an h2;
 * above 1024px the header sits in the 26rem list pane and its key row wraps
 * rather than pushing the pane wider. Below 1024px the item is the only pane
 * on screen, so the header is present and not shown, which is the swap.
 */
import { IGNORE, READY } from './_class-header.mjs';

export default {
	path: '/dev/class-header?role=teacher&pane=1',
	label: 'Class header beside an open item: an h2, and a key row that wraps in the pane',
	ignoreConsole: IGNORE,
	prepare: [{ waitFor: `() => !!document.querySelector('[data-testid="class-header"] .pane-title')`, label: 'the header has painted' }],
	presence: [
		{ selector: '[data-testid="harness-class"] h2.pane-title', label: 'the class name as an h2 (hidden by the swap below 1024px)', expectPresent: 1, maxPresent: 1, expectVisible: 0 },
		{ selector: '[data-testid="harness-class"] h1', label: 'an h1 in the list (the item owns it)', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="harness-detail"] h1', label: 'the item’s own h1', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	]
};
