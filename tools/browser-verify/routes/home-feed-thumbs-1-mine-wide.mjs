/**
 * WIDE ON THE HOME PAGE'S CLASS CARDS (ledger 0396, polish round): a 16:9
 * slot above every row's title, the post's own thumbnail, its body cover, or
 * the generated look, in as many columns of at least 20rem as the card holds
 * (three at 1440, one on a phone) and never wider than the class list's own
 * pane (26rem). The interactive live thumbnail sits
 * ABOVE its row's link, keeping its own clicks (the class page's rule), and
 * its slot lines up with every other row's.
 */
import { HOME_LIST_FITS, HOME_ROWS, HOME_THUMBS, HOME_THUMBS_CONSOLE, HOME_THUMBS_READY, HOME_WIDE_MARKS } from './_home-feed-thumbs.mjs';

export default {
	path: `${HOME_THUMBS}&mine=wide`,
	label: "Home page class cards with the person's Wide: a slot above every title",
	prepare: HOME_THUMBS_READY,
	orderResult: [
		{
			label: "each row's shape and slot",
			evaluate: HOME_ROWS,
			expected: ['wide image', 'wide image', 'wide html', 'wide html', 'wide generated', 'wide generated', 'wide generated', 'wide generated', 'wide generated']
		},
		{ ...HOME_LIST_FITS, expected: ['fits, 0 of 9 outside, overflow clip', 'fits, 0 of 2 outside, overflow clip', 'fits, 0 of 1 outside, overflow clip'] },
		{
			label: 'every slot is above its title, at most 26rem wide, at the same inset in its row, and the titles of a line level',
			evaluate: `() => {
				const rows = [...document.querySelectorAll('.feed-card .assignment-list > .feed-row, .feed-card .assignment-list > .feed-own')];
				const slots = rows.map((r) => r.querySelector('[data-testid="post-thumb"]').getBoundingClientRect());
				const names = rows.map((r) => r.querySelector('.assignment-name').getBoundingClientRect());
				const insets = new Set(rows.map((r, i) => Math.round(slots[i].left - r.getBoundingClientRect().left)));
				const lines = new Map();
				rows.forEach((r, i) => { const k = Math.round(r.getBoundingClientRect().top); (lines.get(k) ?? lines.set(k, []).get(k)).push(Math.round(names[i].top)); });
				return [
					'above ' + slots.every((s, i) => s.bottom <= names[i].top + 0.5),
					'capped ' + slots.every((s) => s.width <= 416.5),
					'one inset ' + (insets.size === 1),
					'titles level ' + [...lines.values()].every((t) => new Set(t).size === 1),
					'16:9 ' + slots.every((s) => Math.abs(s.width / s.height - 16 / 9) < 0.02)
				];
			}`,
			expected: ['above true', 'capped true', 'one inset true', 'titles level true', '16:9 true']
		},
		{
			/* A finger at the middle of each of the first four slots: the row's own
			   link over a picture, a cover and a non-interactive live thumbnail,
			   and the frame itself for the interactive one. */
			label: 'a press at the middle of a slot lands on the row link, and on the frame for the interactive one',
			evaluate: `() => [...document.querySelectorAll('.feed-card [data-testid="post-thumb"]')].slice(0, 4).map((pt) => {
				pt.scrollIntoView({ block: 'center', behavior: 'instant' });
				const r = pt.getBoundingClientRect();
				const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
				return !hit ? 'nothing' : hit.tagName === 'IFRAME' ? 'IFRAME' : hit.closest('a.feed-row') ? 'row link' : hit.tagName;
			})`,
			expected: ['row link', 'row link', 'IFRAME', 'row link']
		},
		{
			...HOME_WIDE_MARKS,
			expected: [
				'overdue 4px from its slot, down the slot and the title, row none, marker drawn',
				'imminent 4px from its slot, down the slot and the title, row none, marker drawn',
				'imminent 4px from its slot, down the slot and the title, row none, marker drawn'
			]
		}
	],
	presence: [
		{ selector: '.feed-card [data-testid="feed-post-thumb"] .pt[data-shape="wide"]', label: 'a Wide slot on every row', expectPresent: 9, maxPresent: 9, expectVisible: 9 },
		{ selector: '.feed-own', label: 'the interactive live thumbnail, above its row link', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.feed-own iframe[sandbox]:not([inert])', label: 'its frame takes its own clicks', expectPresent: 1, maxPresent: 1 },
		{ selector: 'a.feed-row iframe:not([inert])', label: 'no frame inside a row link that is not inert', expectPresent: 0 },
		{ selector: 'a.feed-row a', label: 'no link nested inside a row link', expectPresent: 0 },
		{ selector: '.feed-card iframe[sandbox*="allow-same-origin"]', label: 'no frame granted allow-same-origin', expectPresent: 0 },
		{ selector: '.feed-card .assignment-icon-thumb', label: 'no 34px mark beside a Wide slot', expectPresent: 0 }
	],
	contrast: [{ selector: '.feed-card .assignment-name', label: 'row titles under a slot', min: 4.5 }],
	tapTargets: [{ selector: '.legacy-index .assignment-item.linked', label: 'feed rows', min: 44 }],
	ignoreConsole: HOME_THUMBS_CONSOLE
};
