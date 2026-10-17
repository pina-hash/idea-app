/**
 * THE CLASS CARD'S FOLD IS ITS OWN KEY, AND IT FOLDS WITHOUT GOING ANYWHERE
 * (ledger 0396, part 3: "open a class in one click, without expanding its card
 * first; expanding is only for picking a specific assignment").
 *
 * The header used to be one <button> that folded the card, so the only way
 * into a class was the "Open class" link at the foot of the open list. Now the
 * class's identity is one link and the fold is a sibling <button> at the
 * header's right edge. This spec presses the fold on the first card twice,
 * through real clicks, and reads after each press what the fold changed and
 * what it did not: the state, the word, the list's height and `inert`, and the
 * address, which must still be this harness (a fold that navigated, or a click
 * that reached the link underneath, would move it).
 *
 * The positive control for the absence row is in this spec too: three links
 * and three folds are counted present before "no control inside another" is
 * read as zero.
 *
 * The other half, a click on the link going in with the card folded and no
 * fold on the way, is ./home-feed-base-dev-state-class-link.mjs. Tab order and
 * Enter on each control need real key presses, which a prepare step cannot
 * send, so they are measured by a script and recorded in the bundle's history
 * entry.
 */
import { SETTLE_ENTRANCE } from './_shared.mjs';

const FIRST_TOGGLE = '.legacy-index .feed-card [data-testid="feed-toggle"]';
const firstExpanded = (v) =>
	`() => document.querySelector('${FIRST_TOGGLE}')?.getAttribute('aria-expanded') === '${v}'`;

/* One line describing the first card after a press. The list's height is read
   after the click step's wait, which outlasts its 0.35s max-height ease. */
const RECORD = (tag) => `() => {
	const card = document.querySelector('.legacy-index .feed-card');
	const t = card.querySelector('[data-testid="feed-toggle"]');
	const list = card.querySelector('.assignment-list');
	const h = list.getBoundingClientRect().height;
	const line = '${tag}: aria-expanded ' + t.getAttribute('aria-expanded')
		+ ', word ' + card.querySelector('.feed-toggle-word').textContent.trim()
		+ ', list ' + (h < 0.5 ? '0px' : h > 40 ? 'open' : h.toFixed(1) + 'px')
		+ ', ' + (list.hasAttribute('inert') ? 'inert' : 'not inert')
		+ ', controls its list ' + (t.getAttribute('aria-controls') === list.id)
		+ ', at ' + location.pathname;
	(window.__foldKey ??= []).push(line);
	return line;
}`;

export default {
	path: '/dev/home-feed?state=fold-key',
	aliasOf: '/dev/home-feed',
	label: 'Home class card: the fold is its own key, folds and opens without navigating',
	prepare: [
		{ evaluate: SETTLE_ENTRANCE, waitMs: 150 },
		{ click: FIRST_TOGGLE, until: firstExpanded('false'), waitMs: 600 },
		{ evaluate: RECORD('folded'), label: 'read the card after the fold' },
		{ click: FIRST_TOGGLE, until: firstExpanded('true'), waitMs: 600 },
		{ evaluate: RECORD('opened'), label: 'read the card after it opens again' }
	],
	presence: [
		{ selector: '.legacy-index .feed-card [data-testid="feed-open"]', label: 'one class link per card (positive control)', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '.legacy-index .feed-card button[data-testid="feed-toggle"][aria-expanded][aria-controls]', label: 'one fold key per card, carrying its state and its list', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '.legacy-index .feed-card :is(a button, a a, button a, button button)', label: 'no control nested inside another', expectPresent: 0 },
		{ selector: '.legacy-index .feed-card button.course-header', label: 'the header is no longer one button', expectPresent: 0 }
	],
	orderResult: [
		{
			label: 'the fold changes the card and nothing else',
			evaluate: '() => window.__foldKey ?? []',
			expected: [
				'folded: aria-expanded false, word Show, list 0px, inert, controls its list true, at /dev/home-feed',
				'opened: aria-expanded true, word Hide, list open, not inert, controls its list true, at /dev/home-feed'
			]
		}
	],
	contrast: [
		{ selector: '.legacy-index .feed-card .feed-toggle-word', label: 'the fold key word', min: 4.5 },
		{ selector: '.legacy-index .feed-card .feed-open .course-updated', label: 'class title inside the link', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.legacy-index .feed-card [data-testid="feed-toggle"]', label: 'fold keys', min: 44 },
		{ selector: '.legacy-index .feed-card [data-testid="feed-open"]', label: 'class links', min: 44 }
	]
};
