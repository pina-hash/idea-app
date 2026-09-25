/**
 * THE VIDEOS SECTION OBEYS THE SEARCH ROW (ledger 0298, R08).
 *
 * It is derived from the items the search and filters leave showing, so
 * "gear" in the class's search box narrows the page to the two items the
 * search matches (the gear worksheet, and the shop tour, which matches through
 * its unit's name, Gears) and the Videos section to the one video among them
 * -- the count on the trigger with it -- while "2 of 5 shown" says the page is
 * narrowed. The shop tour carries links and no video, so a search that keeps
 * an item keeps a card only where there is a video to card.
 * The unfiltered class is the student spec (three cards), which is this
 * reading's positive control.
 */
import { CARDS, OPEN_VIDEOS, ROW_NAMES, VIDEOS, VIDEOS_READY } from './_class-videos.mjs';

export default {
	path: '/dev/class-videos?state=search',
	aliasOf: VIDEOS,
	label: 'Videos in a class, narrowed by the class search',
	prepare: [
		VIDEOS_READY,
		{
			evaluate: `() => {
				const input = document.querySelector('[data-testid="stream-search"]');
				input.value = 'gear';
				input.dispatchEvent(new Event('input', { bubbles: true }));
				return document.querySelector('[data-testid="class-videos-count"]')?.textContent.trim() ?? 'no count';
			}`,
			until: `() => document.querySelector('[data-testid="class-videos-count"]')?.textContent.trim() === '1 video'`
		},
		OPEN_VIDEOS
	],
	orderResult: [
		{ label: 'only the gear video', evaluate: `() => (${CARDS})()`, expected: ['GearRat1o42 | this gear video | Gear ratio worksheet | -'] },
		{ label: 'the two rows the search keeps', evaluate: ROW_NAMES, expected: ['Gear ratio worksheet', 'Shop tour'] }
	],
	presence: [
		{ selector: '[data-testid="class-video"]', label: 'one card', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="stream-find-result"]', label: 'the page says it is narrowed', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="class-videos-count"]', label: 'the count follows the search', must: ['1 video'], mustNot: ['3 videos'] },
		{ selector: '[data-testid="stream-find-result"]', label: 'the narrowed count', must: ['2 of 5 shown'] }
	]
};
