/**
 * A CLASS NOBODY HAS VOTED ON AND NO ACCENT (decision 45), at 375 and 1440:
 * the state every class is in until somebody votes, which has to look EXACTLY
 * as the classroom did before themes. No banner wrapper, no strip bar, no card
 * edge, no badge -- and the panel is still offered, saying nothing is chosen.
 * The themed student spec is the positive control for every absence here.
 */
import { IGNORE, READY } from './_classroom-theme.mjs';

export default {
	path: '/dev/classroom-theme?votes=none',
	label: 'Class theme, nothing voted: every surface exactly as before themes',
	ignoreConsole: IGNORE,
	prepare: [
		{ waitFor: READY, label: 'the class page and the three class cards have painted' },
		{ waitFor: `() => !!document.querySelector('[data-testid="class-theme-toggle"]')`, label: 'the panel read its tally' }
	],
	presence: [
		{ selector: '[data-testid="harness-class"] .pane-title', label: 'the class title (positive control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-banner"]', label: 'a banner (none: nothing chosen)', expectPresent: 0 },
		{ selector: '[data-testid="class-icon-theme"]', label: 'a strip bar (none)', expectPresent: 0 },
		{ selector: '[data-testid="class-icon-badge"]', label: 'a strip badge (none)', expectPresent: 0 },
		{ selector: '.class-card.themed', label: 'a themed card (none)', expectPresent: 0 },
		{ selector: '.class-card', label: 'the three plain cards (positive control)', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '.class-card[style]', label: 'a card with a style attribute (none)', expectPresent: 0 },
		/* The panel's root is boxless inside the class header's key row (ledger
		   0360), so its presence is counted here and the visible key is its
		   trigger. */
		{ selector: '[data-testid="class-theme-panel"]', label: 'the vote is still offered (a boxless root)', expectPresent: 1, maxPresent: 1, expectVisible: 0 },
		{ selector: '[data-testid="class-theme-toggle"]', label: 'the vote’s trigger, a visible key', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [{ selector: '[data-testid="class-theme-words"]', label: 'the panel says nothing is chosen', must: ['Not chosen yet'] }]
};
