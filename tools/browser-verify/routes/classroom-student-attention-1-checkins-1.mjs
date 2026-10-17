/**
 * NEEDS ATTENTION SHORT ENOUGH TO SIT BESIDE SCORES (polish round). The harness
 * keeps one missing assignment of the fixture's four (`&attention=1`) and one
 * flagged notebook check-in of its two (`&checkins=1`, polish round C, since a
 * check-in's date now takes a line under its words), so the card holds the two
 * against two score bars: about the same height, so the pair stays side by
 * side (the negative control is the full page, where they stack), the row's
 * Grade and Full screen keys sit on its title's line, and nothing beside
 * either card is taller than a row and a half.
 *
 * Polish round C, in this narrow form above all: the assignment's date and the
 * check-in's sit in one column under their titles; no part of the title link's
 * 44px answers anything but the link; and a score bar's title is shown whole,
 * here with the first one made long on purpose so it has to wrap.
 *
 * Polish round 1: the check-in's label is made long too, so it wraps (three
 * lines in the 960 card, two at 375), and the air between a row's words and its
 * date is one figure for both rows: the wrapped label used to end flush on its
 * date.
 *
 * Run it at 960 and 1278 as well as the two default widths: the side-by-side
 * narrow card is what 960 has.
 */
import {
	ATTENTION_DATE_AIR,
	ATTENTION_DATES_ONE_COLUMN,
	ATTENTION_KEYS_MATCH,
	ATTENTION_KEYS_ON_TITLE_LINE,
	ATTENTION_TITLE_REACH,
	BAR_TITLES_WHOLE,
	DUO_NO_HOLE,
	STUDENT,
	STUDENT_READY
} from './_classroom-student.mjs';

const LONG_TITLE = 'Final design review of the four bar linkage and gearbox assembly';
const LONG_CHECKIN = 'Notebook: Day 18 motor bench test with the torque sensor and the long calibration write-up, flagged';

export default {
	path: `${STUDENT}?attention=1&checkins=1`,
	label: "One student's page: a short Needs attention beside Scores",
	prepare: [
		STUDENT_READY,
		{
			evaluate: `() => { const t = document.querySelector('[data-testid="so-score-bar"] .so-bar-title'); t.textContent = '${LONG_TITLE}'; t.setAttribute('title', '${LONG_TITLE}'); }`,
			until: `() => document.querySelector('[data-testid="so-score-bar"] .so-bar-title')?.textContent === '${LONG_TITLE}'`,
			label: 'the first score bar is given a long title'
		},
		{
			evaluate: `() => { document.querySelector('[data-testid="so-attention-checkin"] > .so-list-main').textContent = '${LONG_CHECKIN}'; }`,
			until: `() => document.querySelector('[data-testid="so-attention-checkin"] > .so-list-main')?.textContent === '${LONG_CHECKIN}'`,
			label: 'the notebook check-in is given a long label'
		}
	],
	presence: [
		{ selector: '[data-testid="so-attention-row"]', label: 'one missing assignment', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="so-attention-checkin"]', label: 'one notebook row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="so-duo"][data-arrangement="side"]', label: 'the pair, side by side where there is room for two columns', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="so-duo"][data-arrangement="stacked"]', label: 'not stacked', expectPresent: 0 }
	],
	orderResult: [
		{ ...ATTENTION_KEYS_MATCH, expected: ['a-safety: same keys'] },
		{ label: 'Needs attention and Scores leave no block of nothing beside either', evaluate: DUO_NO_HOLE, expected: ['no block beside either card'] },
		{ label: 'the row keeps its keys on its title line (under it on a phone)', evaluate: ATTENTION_KEYS_ON_TITLE_LINE, expected: ['ok'] },
		{ label: "the assignment's date and the check-in's in one column", evaluate: ATTENTION_DATES_ONE_COLUMN, expected: ['one column of dates'] },
		{ label: 'nothing covers the title link anywhere in its 44px', evaluate: ATTENTION_TITLE_REACH, expected: ['every point of every title link answers the link'] },
		{ label: 'the wrapped check-in label keeps the same air above its date as the assignment', evaluate: ATTENTION_DATE_AIR, expected: ['every date sits alike against its words, a wrapped label included'] },
		{ label: 'the score bar titles, the long one included, shown whole', evaluate: BAR_TITLES_WHOLE, expected: ['whole'] },
		{
			label: 'two columns where the page is wide enough for two 24rem cards, one on a phone',
			evaluate: `() => {
				const a = document.querySelector('[data-testid="so-attention"]').getBoundingClientRect();
				const s = document.querySelector('[data-testid="so-scores"]').getBoundingClientRect();
				const duo = document.querySelector('[data-testid="so-duo"]');
				const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
				const two = duo.getBoundingClientRect().width >= 2 * 24 * rem + parseFloat(getComputedStyle(duo).columnGap);
				const side = Math.abs(a.top - s.top) <= 1;
				return [side === two ? 'as expected' : (side ? 'side by side' : 'stacked') + ' at ' + window.innerWidth + 'px'];
			}`,
			expected: ['as expected']
		},
		{ label: 'no horizontal page scroll', evaluate: `() => [document.documentElement.scrollWidth - document.documentElement.clientWidth <= 0]`, expected: [true] }
	],
	contrast: [
		{ selector: '[data-testid="so-attention"] .so-meta', label: 'the dates under the titles', min: 4.5 },
		{ selector: '[data-testid="so-attention"] .so-row-key', label: 'Grade and Full screen', min: 4.5 },
		{ selector: '.so-bar-title, .so-bar-figure', label: 'score bar words', min: 4.5 }
	],
	tapReach: [{ selector: '[data-testid="so-attention"] .so-row-key', label: 'Grade and Full screen on the row, by their reach (the title line is 44px tall)', min: 44 }]
};
