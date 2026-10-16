/**
 * THE "NEED ATTENTION" COUNT ON A TEACHER'S CLASS CARD (ledger 0392, report
 * 54b43698: "The need attention status on my classes with the white theme on
 * reads poorly and the color doesn't look nice").
 *
 * The teacher feed with every card folded, which is how Mr. Pina's home page
 * was when he filed it. Measured: the count carries a mark beside its words
 * (never color alone) and clears 4.5:1 on its own warm wash, and a folded card
 * has no band under its header (the list's padding used to survive the fold
 * as an empty 16px strip of a second ground).
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';

export const TEACHER_FOLDED = [
	{
		click: '[data-mode="teacher"]',
		until: '() => document.querySelector(\'[data-mode="teacher"]\').classList.contains("active")'
	},
	{ evaluate: SETTLE_ENTRANCE, waitMs: 150 },
	{
		evaluate: `() => { for (const b of document.querySelectorAll('.feed-card:not(.collapsed) [aria-expanded="true"]')) b.click(); return document.querySelectorAll('.feed-card.collapsed').length; }`,
		until: `() => document.querySelectorAll('.feed-card.collapsed').length === 3`,
		label: 'fold every class card'
	}
];

export const NO_BAND = {
	label: 'a folded card has no band under its header: its list is 0px tall with no padding',
	evaluate: `() => {
		const lists = [...document.querySelectorAll('.feed-card.collapsed .assignment-list')];
		const tall = lists.filter((l) => l.getBoundingClientRect().height > 0.5).length;
		return ['folded=' + document.querySelectorAll('.feed-card.collapsed').length, 'lists with height=' + tall];
	}`,
	expected: ['folded=3', 'lists with height=0']
};

export default {
	path: '/dev/home-feed?mode=teacher&state=attention',
	aliasOf: '/dev/home-feed',
	label: 'Teacher class cards, folded: the attention count reads on its wash, and no band under a folded card',
	prepare: TEACHER_FOLDED,
	presence: [
		{ selector: '[data-testid="feed-attention"]', label: 'two classes need attention', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="feed-attention"] .feed-attn-mark', label: 'each with its mark beside the words', expectPresent: 2, maxPresent: 2, expectVisible: 2 }
	],
	textContains: [{ selector: '[data-testid="feed-attention"]', label: 'the words say what it is', must: ['need attention'] }],
	contrast: [{ selector: '[data-testid="feed-attention"]', label: 'the attention count on its wash', min: 4.5 }],
	orderResult: [NO_BAND],
	tapTargets: []
};
