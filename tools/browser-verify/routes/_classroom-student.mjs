/**
 * ONE STUDENT'S PAGE (the 2026-10-07 round): what every state of
 * /dev/classroom-student shares. The harness mounts the REAL ClassroomShell and
 * the REAL StudentOverview over a page the real `buildStudentPage` built from
 * fixture reads that carry classmates (in the notebook grid and the team board),
 * so a projection that leaked one would show it here.
 */
import { FORCE_THEME } from './_hover-ink.mjs';

export const STUDENT = '/dev/classroom-student';
export const STUDENT_READY = {
	waitFor: `() => !!(document.querySelector('.cr-root[data-ready="true"]') && document.querySelector('[data-testid="student-overview"]'))`,
	timeoutMs: 30_000
};
/** Every classmate the fixture's whole-class reads carry. None may be on the page. */
export const CLASSMATE_TEXT = `() => {
	const text = document.body.innerText;
	return ['Ben Cho', 'Cara Diaz', 'Dev Patel', 'ben.cho@', 'cara.diaz@', 'dev.patel@'].filter((n) => text.includes(n));
}`;
export const SECTIONS = ['so-identity', 'so-glance', 'so-assignments', 'so-notebook', 'so-activity', 'so-hall-passes', 'so-teams', 'so-coins'];

/**
 * The full page under one site theme, forced the way every classroom harness
 * forces it (the harness holds no session, so the stored theme never applies
 * on its own). Contrast on every kind of text the page draws, and the chips.
 */
export const studentThemeSpec = (theme) => {
	return {
		path: `${STUDENT}?theme=${theme}`,
		aliasOf: STUDENT,
		label: `One student's page under the ${theme} theme`,
		prepare: [STUDENT_READY, { ...FORCE_THEME(theme), waitMs: 300 }],
		orderResult: [
			{
				label: `the page is on ${theme}`,
				evaluate: `() => [document.documentElement.getAttribute('data-theme') ?? 'idea']`,
				expected: [theme]
			},
			{ label: 'no classmate is named anywhere on the page', evaluate: CLASSMATE_TEXT, expected: [] },
			ATTENTION_KEYS_MATCH
		],
		contrast: [
			{ selector: '.so-row-key', label: 'Grade and Full screen keys, both lists', min: 4.5 },
			{ selector: '[data-testid="so-sections"]', label: 'the Sections key', min: 4.5 },
			{ selector: '.so-name', label: 'student name', min: 4.5 },
			{ selector: '[data-testid="so-status"]', label: 'status chips', min: 4.5 },
			{ selector: '[data-testid="so-status"][data-missing="true"]', label: 'missing chips', min: 4.5 },
			{ selector: '.so-table td', label: 'table cells', min: 4.5 },
			{ selector: '.so-table thead th', label: 'table headings', min: 4.5 },
			{ selector: '[data-testid="so-coverage"]', label: 'coverage sentence', min: 4.5 },
			{ selector: '.so-tile-label', label: 'tile labels', min: 4.5 },
			{ selector: '.so-tile-sub', label: 'tile lines', min: 4.5 },
			{ selector: '.so-meta', label: 'meta lines', min: 4.5 },
			{ selector: '.so-link', label: 'links', min: 4.5 },
			{ selector: '.so-late', label: 'late word', min: 4.5 },
			{ selector: '[data-testid="so-roster-chip"]', label: 'roster chip', min: 4.5 },
			{ selector: '.so-print-toggle', label: 'include-when-printing words', min: 4.5 },
			{ selector: '[data-testid="coin-row"] .reason', label: 'coin row reasons', min: 4.5 }
		]
	};
};

/* ------------------------------------------------------------------------
 * LEDGER 0396: the three conference fixes (reports 169b931d, bd38fa25,
 * 08bafda7), each driven under a dark theme (the default, IDEA) and Space
 * White. Every scripted press is `element.click()` from the page, never a
 * Playwright click, because a Playwright click scrolls the page to its target
 * first and the strip spec exists to prove the PAGE never moves.
 * --------------------------------------------------------------------- */

/** The strip's state after a move, once its own scroll has come to rest. */
const STRIP_READ = `async (label) => {
	const strip = document.querySelector('[data-testid="so-slideshow"] .sws-strip');
	let last = -1;
	for (let i = 0; i < 40; i++) {
		await new Promise((r) => setTimeout(r, 100));
		if (Math.abs(strip.scrollLeft - last) < 0.5) break;
		last = strip.scrollLeft;
	}
	const max = strip.scrollWidth - strip.clientWidth;
	const thumbs = [...strip.querySelectorAll('.sws-thumb')];
	const on = thumbs.findIndex((t) => t.classList.contains('on'));
	const s = strip.getBoundingClientRect();
	const t = thumbs[on]?.getBoundingClientRect();
	const inView = !!t && t.left >= s.left - 1 && t.right <= s.right + 1;
	const offCentre = t ? Math.round(t.left + t.width / 2 - (s.left + s.width / 2)) : null;
	const where = strip.scrollLeft <= 1 ? 'strip at its start' : strip.scrollLeft >= max - 1 ? 'strip at its end' : Math.abs(offCentre) <= 1 ? 'selected centred' : 'strip at ' + Math.round(strip.scrollLeft) + ' of ' + max + ', off centre by ' + offCentre;
	const count = document.querySelector('[data-testid="so-slide-count"]').textContent.trim();
	return label + ': ' + count + ', ' + where + ', ' + (inView ? 'selected in view' : 'SELECTED OUT OF VIEW') + (window.scrollY === window.__stripY ? '' : ', PAGE MOVED ' + window.__stripY + ' to ' + window.scrollY);
}`;

/**
 * THE STRIP FOLLOWS, WRAPS, AND SCROLLS ONLY ITSELF (report 169b931d): the
 * first, a middle and the last thumbnail, Next from the last and Previous
 * from the first, then the timer moving on from the last. Twelve pictures
 * (`&pictures=12`) so the strip overflows at 1440 as Mr. Pina's eleven did.
 * Each line carries the page's own scroll position: any move of it prints
 * PAGE MOVED. With the cause reverted (the thumbnail's `offsetLeft`) the first
 * line reads "strip at its end, SELECTED OUT OF VIEW" at 1440.
 */
export const studentStripSpec = (theme) => ({
	/* No `aliasOf`: the query is the state (`pictures=12`), so the run visits this
	   path itself; the theme is forced in `prepare`, and the harness ignores `theme`. */
	path: `${STUDENT}?state=strip&pictures=12${theme === 'idea' ? '' : `&theme=${theme}`}`,
	label: `One student's page: the picture strip follows, wraps and never moves the page (${theme})`,
	prepare: [
		{ waitFor: `() => document.querySelectorAll('[data-testid="so-slideshow"] .sws-thumb').length === 12`, label: 'the strip holds twelve pictures', timeoutMs: 30_000 },
		{ ...FORCE_THEME(theme), waitMs: 200 },
		{
			label: 'pause the slideshow and bring the strip into the middle of the window',
			evaluate: `() => {
				const play = document.querySelector('[data-testid="so-slide-play"]');
				if (play.dataset.playing !== 'false') play.click();
				const r = document.querySelector('[data-testid="so-slideshow"] .sws-strip').getBoundingClientRect();
				window.scrollTo({ top: Math.max(0, r.top + window.scrollY - innerHeight / 2), behavior: 'instant' });
				window.__stripY = window.scrollY;
				window.__stripLog = [];
			}`,
			until: `() => document.querySelector('[data-testid="so-slide-play"]').dataset.playing === 'false'`
		},
		{
			label: 'first, middle and last, then Next from the last and Previous from the first',
			evaluate: `async () => {
				const read = ${STRIP_READ};
				const thumb = (n) => document.querySelector('[data-testid="so-slideshow"] .sws-thumb:nth-child(' + n + ')');
				const steps = [
					['first', () => thumb(1).click()],
					['middle', () => thumb(6).click()],
					['last', () => thumb(12).click()],
					['Next from the last', () => document.querySelector('[data-testid="so-slide-next"]').click()],
					['Previous from the first', () => document.querySelector('[data-testid="so-slide-prev"]').click()]
				];
				const log = [];
				for (const [label, press] of steps) {
					press();
					log.push(await read(label));
				}
				window.__stripLog = log;
			}`,
			until: '() => (window.__stripLog || []).length === 5',
			attempts: 1,
			gapMs: 500
		},
		{
			label: 'Play from the last picture: the timer moves on to the first',
			evaluate: `async () => {
				const read = ${STRIP_READ};
				document.querySelector('[data-testid="so-slide-play"]').click();
				const count = () => document.querySelector('[data-testid="so-slide-count"]').textContent.trim();
				for (let i = 0; i < 90 && count() !== '1 of 12'; i++) await new Promise((r) => setTimeout(r, 100));
				document.querySelector('[data-testid="so-slide-play"]').click();
				window.__stripTimer = await read('the timer from the last');
			}`,
			until: '() => typeof window.__stripTimer === "string"',
			attempts: 1,
			gapMs: 500
		}
	],
	orderResult: [
		{
			label: 'every move leaves the selected picture in view, centred where the strip allows, and the page where it was',
			evaluate: '() => window.__stripLog',
			expected: [
				'first: 1 of 12, strip at its start, selected in view',
				'middle: 6 of 12, selected centred, selected in view',
				'last: 12 of 12, strip at its end, selected in view',
				'Next from the last: 1 of 12, strip at its start, selected in view',
				'Previous from the first: 12 of 12, strip at its end, selected in view'
			]
		},
		{
			label: 'the timer wraps the same way',
			evaluate: '() => [window.__stripTimer]',
			expected: ['the timer from the last: 1 of 12, strip at its start, selected in view']
		},
		{ label: 'no horizontal page scroll', evaluate: `() => [document.documentElement.scrollWidth - document.documentElement.clientWidth <= 0]`, expected: [true] }
	],
	presence: [{ selector: '[data-testid="so-slideshow"] .sws-thumb', label: 'twelve thumbnails', expectPresent: 12, maxPresent: 12 }],
	contrast: [{ selector: '.sws-count, .sws-key', label: 'slideshow count and keys', min: 4.5 }],
	tapTargets: [{ selector: '[data-testid="so-slide-prev"], [data-testid="so-slide-next"], [data-testid="so-slide-play"]', label: 'slideshow Previous, Next and Play', min: 44 }]
});

/** The page's own top-level blocks, top to bottom, and the space between each pair. */
const BLOCK_GAPS = `() => {
	const root = document.querySelector('[data-testid="student-overview"]');
	const kids = [...root.children].filter((el) => el.getBoundingClientRect().height > 0);
	const gap = parseFloat(getComputedStyle(root).rowGap);
	const out = [];
	for (let i = 1; i < kids.length; i++) {
		const d = kids[i].getBoundingClientRect().top - kids[i - 1].getBoundingClientRect().bottom;
		if (Math.abs(d - gap) > 1) out.push((kids[i - 1].dataset.testid || kids[i - 1].className.split(' ')[0]) + ' to ' + (kids[i].dataset.testid || kids[i].className.split(' ')[0]) + ': ' + Math.round(d) + 'px, gap ' + gap);
	}
	return out.length ? out : ['every block one gap apart (' + kids.length + ' blocks)'];
}`;

/**
 * THE TOP CARD CLOSES UP WITH A FIGURE GONE (report bd38fa25, round 2): with
 * the grade or Coming up hidden the pictures move under the identity, so
 * nothing in the card is left beside an empty block. Read as the empty area
 * the card actually has: beside the gallery when the two sit side by side,
 * or above it beyond the card's own gap when stacked. Stacked, the gallery is
 * the card's width or, where the card is wider, a 16:9 stage's width at its
 * height cap (polish round: a full-width stage left a landscape picture in a
 * black band), and then exactly in the middle.
 */
const HERO_CLOSED = `() => {
	const hero = document.querySelector('.so-hero');
	const main = hero.querySelector('.so-hero-main').getBoundingClientRect();
	const gal = hero.querySelector('.so-hero-gallery');
	if (!gal) return [hero.dataset.hero + ': no pictures'];
	const g = gal.getBoundingClientRect();
	const h = hero.getBoundingClientRect();
	const kids = [...hero.querySelector('.so-hero-main').children].filter((el) => el.getBoundingClientRect().height > 0);
	const last = Math.max(...kids.map((el) => el.getBoundingClientRect().bottom));
	const gap = parseFloat(getComputedStyle(hero).rowGap);
	const beside = g.top < main.bottom - 1;
	const empty = beside ? Math.round(Math.abs(g.bottom - last)) : Math.round(g.top - last - gap);
	const cap = parseFloat(getComputedStyle(gal).maxWidth);
	const fits = beside || (Math.abs(g.width - Math.min(h.width, Number.isFinite(cap) ? cap : h.width)) <= 1 && Math.abs((g.left - h.left) - (h.right - g.right)) <= 1);
	return [empty <= 1 && fits
		? hero.dataset.hero + ': no empty block'
		: hero.dataset.hero + ': ' + empty + 'px empty ' + (beside ? 'beside' : 'above') + ' the pictures, gallery ' + Math.round(g.width) + ' of ' + Math.round(h.width) + ' at ' + Math.round(g.left - h.left) + ' from the left, ' + Math.round(h.right - g.right) + ' from the right'];
}`;

/**
 * NO BLOCK OF NOTHING BESIDE NEEDS ATTENTION OR SCORES (polish round): the two
 * sit side by side only within about a row and a half of each other's height
 * (`STUDENT_DUO_STACK_PX`, 100px), and otherwise one above the other, each the
 * duo's whole width. Read off where the cards actually are, so it holds at any
 * width; the answer names the arrangement and the heights when it is wrong.
 */
export const DUO_NO_HOLE = `() => {
	const duo = document.querySelector('[data-testid="so-duo"]');
	const a = document.querySelector('[data-testid="so-attention"]'), s = document.querySelector('[data-testid="so-scores"]');
	if (!duo || !a || !s) return ['not a pair'];
	const d = duo.getBoundingClientRect(), ab = a.getBoundingClientRect(), sb = s.getBoundingClientRect();
	const side = Math.abs(ab.top - sb.top) <= 1;
	const diff = Math.round(Math.abs(ab.height - sb.height));
	if (side) return [diff <= 100 ? 'no block beside either card' : 'side by side with ' + diff + 'px of nothing beside the shorter (' + Math.round(ab.height) + ' against ' + Math.round(sb.height) + ')'];
	const whole = Math.abs(ab.width - d.width) <= 1 && Math.abs(sb.width - d.width) <= 1;
	return [whole ? 'no block beside either card' : 'one above the other, widths ' + Math.round(ab.width) + ' and ' + Math.round(sb.width) + ' of ' + Math.round(d.width)];
}`;

/**
 * A NEEDS ATTENTION ROW'S KEYS ARE ON ITS TITLE'S LINE wherever the card is a
 * column beside Scores or wider (polish round): each key's top within a few
 * px of its title link's. On a phone (a card under 24rem) they are under it.
 */
export const ATTENTION_KEYS_ON_TITLE_LINE = `() => {
	const rows = [...document.querySelectorAll('[data-testid="so-attention-row"]')];
	const card = document.querySelector('[data-testid="so-attention"]').getBoundingClientRect().width;
	const phone = card < 24 * parseFloat(getComputedStyle(document.documentElement).fontSize);
	const out = rows.map((row) => {
		const t = row.querySelector('.so-link').getBoundingClientRect();
		const k = row.querySelector('.so-row-keys').getBoundingClientRect();
		const on = Math.abs(k.top - t.top) <= 2 && k.left > t.right;
		return on === !phone ? 'ok' : (phone ? 'keys beside the title on a phone' : 'keys ' + Math.round(k.top - t.top) + 'px under the title');
	});
	return [...new Set(out)];
}`;

/**
 * ONE COLUMN OF DATES IN NEEDS ATTENTION (polish round C): every date in the
 * list, an assignment's and a notebook check-in's alike, sits in one place. In
 * a card 34rem wide or more they share a right edge on their title's line;
 * narrower, they share a left edge on their own line under the titles, at the
 * titles' own left. The card's form is read off its content width, so the
 * answer is the same words at every width when it is right.
 */
export const ATTENTION_DATES_ONE_COLUMN = `() => {
	const card = document.querySelector('[data-testid="so-attention"]');
	const rows = [...card.querySelectorAll('.so-attention-list > li')];
	if (rows.length < 2) return ['fewer than two rows'];
	const cs = getComputedStyle(card);
	const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
	const wide = card.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) >= 34 * rem;
	const read = rows.map((li) => {
		const d = li.querySelector(':scope > .so-meta').getBoundingClientRect();
		const t = (li.querySelector('.so-attention-title > .so-link') || li.querySelector(':scope > .so-list-main')).getBoundingClientRect();
		return { left: Math.round(d.left), right: Math.round(d.right), under: d.top >= t.bottom - 1, titleLeft: Math.round(t.left) };
	});
	const lefts = [...new Set(read.map((r) => r.left))], rights = [...new Set(read.map((r) => r.right))];
	if (wide) return [rights.length === 1 && read.every((r) => !r.under) ? 'one column of dates' : 'wide card: date right edges ' + rights.join(', ')];
	const ok = lefts.length === 1 && read.every((r) => r.under && r.left === r.titleLeft);
	return [ok ? 'one column of dates' : 'narrow card: date left edges ' + lefts.join(', ') + (read.some((r) => !r.under) ? ', some beside their title' : '')];
}`;

/**
 * A WRAPPED LABEL KEEPS THE SAME AIR ABOVE ITS DATE AS A ONE-LINE ONE (polish
 * round 1). Where the dates sit under the titles, the space from the bottom of
 * what is drawn directly above a row's date (the title link's text, a
 * check-in's label, or on a phone an assignment's Grade and Full screen) to
 * the top of the date's text is one figure for every row in the list, and
 * never under 4px: a three-line check-in label used to end flush on its date, so the date
 * read as one more line of it. Where the dates sit on the title's line, each
 * date is level with the FIRST line of its row's words. Both answer "every
 * date sits alike against its words", so one spec reads the same at every
 * width. Read from the text's own line boxes (a Range), so padding and empty
 * space cannot pass for air.
 */
export const ATTENTION_DATE_AIR = `() => {
	const card = document.querySelector('[data-testid="so-attention"]');
	const rows = [...card.querySelectorAll('.so-attention-list > li')];
	if (!rows.length) return ['no rows'];
	const lines = (el) => {
		const r = document.createRange();
		r.selectNodeContents(el);
		return [...r.getClientRects()].filter((q) => q.width > 0 && q.height > 0).sort((a, b) => a.top - b.top);
	};
	const read = rows.map((li) => {
		const words = lines(li.querySelector('.so-attention-title > .so-link') || li.querySelector(':scope > .so-list-main'));
		const date = lines(li.querySelector(':scope > .so-meta'));
		const wordsBottom = Math.max(...words.map((q) => q.bottom));
		const tops = [...new Set(words.map((q) => Math.round(q.top)))];
		const under = date[0].top >= wordsBottom - 1;
		/* On a phone an assignment's Grade and Full screen sit between its title
		   and its date, so what is directly above that date is the keys' own
		   drawn boxes, not the title's words. */
		const keys = [...li.querySelectorAll('.so-row-key')].map((k) => k.getBoundingClientRect()).filter((k) => k.top >= wordsBottom - 1 && k.bottom <= date[0].top + 1);
		const lastBottom = keys.length ? Math.max(...keys.map((k) => k.bottom)) : wordsBottom;
		return {
			kind: li.dataset.testid === 'so-attention-checkin' ? 'check-in' : 'assignment',
			lines: tops.length,
			under,
			air: Math.round((date[0].top - lastBottom) * 10) / 10,
			level: Math.round(((date[0].top + date[0].bottom) / 2 - (words[0].top + words[0].bottom) / 2) * 10) / 10
		};
	});
	const wrapped = Math.max(...read.map((r) => r.lines));
	const say = (r) => r.kind + ' (' + r.lines + ' line' + (r.lines === 1 ? '' : 's') + ') ';
	if (read.every((r) => r.under)) {
		const airs = read.map((r) => r.air);
		const ok = Math.max(...airs) - Math.min(...airs) <= 1.5 && Math.min(...airs) >= 4;
		return [ok ? 'every date sits alike against its words' + (wrapped > 1 ? ', a wrapped label included' : '') : 'air above the dates: ' + read.map((r) => say(r) + r.air + 'px').join(', ')];
	}
	if (read.every((r) => !r.under)) {
		const ok = read.every((r) => Math.abs(r.level) <= 1.5);
		return [ok ? 'every date sits alike against its words' + (wrapped > 1 ? ', a wrapped label included' : '') : 'dates off their first line by: ' + read.map((r) => say(r) + r.level + 'px').join(', ')];
	}
	return ['some dates beside their words and some under them'];
}`;

/**
 * NOTHING COVERS A NEEDS ATTENTION TITLE LINK'S 44px REACH (polish round C).
 * The usual card's due date used to be pulled up into the bottom of the link's
 * box, so 7px of it answered the date. Hit-tests every pixel row of every
 * title link at three points across it (each link scrolled into view first,
 * the page put back after) and names whatever answered instead.
 */
export const ATTENTION_TITLE_REACH = `() => {
	const links = [...document.querySelectorAll('[data-testid="so-attention-row"] .so-attention-title > .so-link')];
	if (!links.length) return ['no title links'];
	const back = window.scrollY;
	let total = 0, hits = 0, short = 0;
	const others = {};
	for (const link of links) {
		link.scrollIntoView({ block: 'center', behavior: 'instant' });
		const b = link.getBoundingClientRect();
		if (b.height < 43.5) short++;
		for (const x of [b.left + 4, (b.left + b.right) / 2, b.right - 4]) {
			for (let y = Math.ceil(b.top); y < Math.floor(b.bottom); y++) {
				total++;
				const el = document.elementFromPoint(x, y);
				if (el && (el === link || link.contains(el))) hits++;
				else {
					const k = el ? el.tagName.toLowerCase() + (el.classList[0] ? '.' + el.classList[0] : '') : 'nothing';
					others[k] = (others[k] || 0) + 1;
				}
			}
		}
	}
	window.scrollTo({ top: back, behavior: 'instant' });
	if (short) return [short + ' title link(s) under 44px tall'];
	return [hits === total ? 'every point of every title link answers the link' : total - hits + ' of ' + total + ' points answered ' + JSON.stringify(others)];
}`;

/**
 * A SCORE BAR'S TITLE IS SHOWN WHOLE (polish round C): nothing cut by its own
 * box (an ellipsis, or a clipped line), and the `title` still there for a
 * pointer. At 375 the old one-line title read "Old pulley wor...".
 */
export const BAR_TITLES_WHOLE = `() => {
	const titles = [...document.querySelectorAll('[data-testid="so-score-bar"] .so-bar-title')];
	if (!titles.length) return ['no bars'];
	return [...new Set(titles.map((e) => (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1 ? 'cut: ' + e.textContent.trim() : e.getAttribute('title') !== e.textContent.trim() ? 'title attribute missing' : 'whole')))];
}`;

/**
 * A LANDSCAPE PICTURE FILLS MOST OF ITS STAGE (polish round). Stacked across
 * the card's whole width at 1440 the stage was 1326px wide and a fixture
 * picture (400 by 280) drew 548px of it, 41%; the stacked gallery is now as
 * wide as a 16:9 stage at its height cap. The drawn width is worked out the
 * way `object-fit: contain` draws it, from the picture's own proportions.
 */
export const STAGE_FILL = `() => {
	const img = document.querySelector('[data-testid="so-slide"] img');
	if (!img || !img.naturalWidth || !img.naturalHeight) return ['no picture measured'];
	const b = img.getBoundingClientRect();
	const drawn = Math.min(b.width, b.height * (img.naturalWidth / img.naturalHeight));
	const share = drawn / b.width;
	return [share >= 0.75 ? 'fills its stage' : 'the picture is ' + Math.round(drawn) + 'px of a ' + Math.round(b.width) + 'px stage (' + Math.round(share * 100) + '%)'];
}`;

/**
 * A SECTIONS LIST THAT SCROLLS SAYS SO (round 2): the "N more below" words
 * name exactly the rows past the list's edge (more than a quarter of a row
 * hidden), and are absent when every row is in view. Width-invariant: at
 * 375 the list scrolls, at 1440 it may not, and either way the words match.
 */
const SECTIONS_CUE = `() => {
	const list = document.querySelector('[data-testid="so-sections-panel"] .ssm-list');
	const edge = list.getBoundingClientRect().bottom;
	const past = [...list.children].filter((li) => { const r = li.getBoundingClientRect(); return r.height > 0 && r.bottom - edge > r.height * 0.25; }).length;
	const cue = document.querySelector('[data-testid="so-sections-more"]');
	const said = cue ? cue.textContent.trim() : '';
	const faded = getComputedStyle(list).maskImage !== 'none';
	if (past === 0) return [!cue && !faded ? 'cue matches the list' : 'all rows in view, yet the cue says "' + said + '"' + (faded ? ' and the list is faded' : '')];
	return [said === past + ' more below' && faded ? 'cue matches the list' : past + ' rows below the edge, cue "' + said + '"' + (faded ? '' : ', no fade')];
}`;

/** Where the open Sections panel sits against its key: 6px off one side, lined up with it, never over it. */
const PANEL_ON_KEY = `() => {
	const k = document.querySelector('[data-testid="so-sections"]').getBoundingClientRect();
	const p = document.querySelector('[data-testid="so-sections-panel"]').getBoundingClientRect();
	const below = Math.round(p.top - k.bottom), above = Math.round(k.top - p.bottom);
	const covers = !(p.bottom <= k.top || p.top >= k.bottom || p.right <= k.left || p.left >= k.right);
	const lined = Math.abs(p.left - k.left) <= 1 || Math.abs(p.right - k.right) <= 1 || p.left <= 13 || p.right >= innerWidth - 13;
	if (!covers && lined && (below === 6 || above === 6)) return ['on its key'];
	return ['key ' + Math.round(k.top) + '-' + Math.round(k.bottom) + ', panel ' + Math.round(p.top) + '-' + Math.round(p.bottom) + (covers ? ', COVERS THE KEY' : '') + ', gap below ' + below + ' above ' + above + ', left ' + Math.round(p.left) + ' against ' + Math.round(k.left)];
}`;

/**
 * THE SECTIONS KEY (report bd38fa25): open it, untick Notebook, Coins and
 * music and Scores, and the page loses each of them and everything that
 * belongs to them (the notebook's photos in Their work included), leaves no
 * gap, and saves the choice to the account stand-in with its sibling namespace
 * kept. Then Grade so far and Coming up, which sit ABOVE the key, so the key
 * moves: the open panel has to follow it (review round 1 found it left 319px
 * below its key at 1278, and over it at 1440). The open menu is measured too.
 */
export const studentSectionsSpec = (theme) => ({
	path: `${STUDENT}?state=sections${theme === 'idea' ? '' : `&theme=${theme}`}`,
	label: `One student's page: the Sections key hides whole sections and saves the choice (${theme})`,
	prepare: [
		STUDENT_READY,
		{ ...FORCE_THEME(theme), waitMs: 200 },
		{
			label: 'positive control: the notebook, coins and scores are on the page first',
			waitFor: `() => ['so-notebook', 'so-coins', 'so-scores'].every((id) => document.querySelector('[data-testid="' + id + '"]')) && document.querySelectorAll('[data-testid="so-attention-checkin"]').length === 2`
		},
		{
			click: '[data-testid="so-sections"]',
			until: `() => document.querySelector('[data-testid="so-sections"]').getAttribute('aria-expanded') === 'true' && !document.querySelector('[data-testid="so-sections-panel"]').hidden`,
			label: 'open the Sections menu'
		},
		{
			label: 'untick Notebook, Coins and music, and Scores on returned work',
			evaluate: `() => {
				for (const id of ['notebook', 'coins', 'scores']) {
					const box = document.querySelector('[data-testid="so-sections-panel"] input[data-section="' + id + '"]');
					if (box.checked) box.click();
				}
			}`,
			until: `() => !document.querySelector('[data-testid="so-notebook"], [data-testid="so-coins"], [data-testid="so-scores"]')`
		},
		{
			label: 'the choice lands in the account stand-in (debounced), with the sibling namespace kept',
			evaluate: '() => {}',
			until: `() => { try { const b = JSON.parse(localStorage.getItem('dev-classroom-student:profile-preferences')); return JSON.stringify(b.classroom.studentPage.hidden) === '["scores","notebook","coins"]' && !!b.homepage; } catch { return false; } }`,
			attempts: 10,
			gapMs: 300
		},
		{
			/* The page is left where it is when the key is in view (it is, at both
			   widths), because a scrolled page lets the browser's scroll anchoring
			   hold the key still, and then a scroll event re-places the panel and
			   this would prove nothing about the tick itself. */
			label: 'untick Grade so far and Coming up, which sit above the key',
			evaluate: `() => {
				const k = document.querySelector('[data-testid="so-sections"]').getBoundingClientRect();
				if (k.top < 0 || k.bottom > innerHeight) window.scrollTo({ top: Math.max(0, k.top + window.scrollY - innerHeight * 0.6), behavior: 'instant' });
				const key = document.querySelector('[data-testid="so-sections"]').getBoundingClientRect();
				window.__keyBefore = Math.round(key.top);
				window.__scrollBefore = window.scrollY;
				for (const id of ['grade', 'upcoming']) {
					const box = document.querySelector('[data-testid="so-sections-panel"] input[data-section="' + id + '"]');
					if (box.checked) box.click();
				}
			}`,
			until: `() => !document.querySelector('[data-testid="so-grade"], [data-testid="so-upcoming"]')`,
			waitMs: 400
		}
	],
	presence: [
		{ selector: '[data-testid="so-sections-panel"]', label: 'the menu, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="so-sections-panel"] input[type="checkbox"]', label: 'a box per section', expectPresent: 13, maxPresent: 13, expectVisible: 13 },
		{ selector: '[data-testid="so-notebook"], [data-testid="so-coins"], [data-testid="so-scores"]', label: 'the hidden cards', expectPresent: 0 },
		{ selector: '[data-tile="notebook"], [data-tile="coins"]', label: 'their tiles', expectPresent: 0 },
		{ selector: '[data-testid="so-attention-checkin"]', label: 'notebook rows under Needs attention', expectPresent: 0 },
		{ selector: '[data-testid="so-notebook-link"]', label: 'the full-notebook key', expectPresent: 0 },
		{ selector: '[data-testid="so-attention-row"]', label: 'positive control: the missing and late work is still listed', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="so-assignments"], [data-testid="so-activity"], [data-testid="so-hall-passes"], [data-testid="so-teams"]', label: 'positive control: the shown cards', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '.so-tile', label: 'positive control: the five tiles left', expectPresent: 5, maxPresent: 5, expectVisible: 5 }
	],
	textContains: [{ selector: '[data-testid="so-sections"]', label: 'the key says how many are hidden', must: ['Sections', '5 hidden'] }],
	orderResult: [
		{
			label: 'with the notebook hidden, Their work holds only assignment pictures (the fixture has four, among three notebook pages)',
			evaluate: `() => {
				const labels = [...document.querySelectorAll('[data-testid="so-slideshow"] .sws-thumb')].map((b) => b.getAttribute('aria-label'));
				return [labels.length + ' pictures, ' + labels.filter((l) => l.includes('Notebook')).length + ' from the notebook'];
			}`,
			expected: ['4 pictures, 0 from the notebook']
		},
		{
			label: 'the open panel stays on its key after the key moved up (6px off one side, lined up, never over it)',
			evaluate: PANEL_ON_KEY,
			expected: ['on its key']
		},
		{
			label: 'positive control: the key moved up on screen, with the page not scrolled (so no scroll event re-placed the panel)',
			evaluate: `() => {
				const moved = window.__keyBefore - Math.round(document.querySelector('[data-testid="so-sections"]').getBoundingClientRect().top);
				return [(moved > 100 ? 'moved up' : 'moved ' + moved + 'px') + (window.scrollY === window.__scrollBefore ? ', page still' : ', PAGE SCROLLED ' + window.__scrollBefore + ' to ' + window.scrollY)];
			}`,
			expected: ['moved up, page still']
		},
		{
			label: 'Needs attention, alone now, takes the whole width (no empty column beside it)',
			evaluate: `() => {
				const a = document.querySelector('[data-testid="so-attention"]').getBoundingClientRect();
				const t = document.querySelector('[data-testid="so-assignments"]').getBoundingClientRect();
				return [Math.abs(a.width - t.width) <= 1 ? 'as wide as Assignments' : 'attention ' + Math.round(a.width) + ' against ' + Math.round(t.width)];
			}`,
			expected: ['as wide as Assignments']
		},
		{ label: 'no doubled gap where a section was', evaluate: BLOCK_GAPS, expected: ['every block one gap apart (5 blocks)'] },
		{
			label: 'with Grade so far and Coming up hidden, the pictures run under the identity and the top card has no empty block',
			evaluate: HERO_CLOSED,
			expected: ['stack: no empty block']
		},
		{
			label: 'stacked, a landscape picture fills most of its stage (at 1440 it was 41% of a full-width one)',
			evaluate: STAGE_FILL,
			expected: ['fills its stage']
		},
		{
			label: 'the menu says how many rows are below its edge, exactly while some are',
			evaluate: SECTIONS_CUE,
			expected: ['cue matches the list']
		},
		{
			label: 'the open menu is on screen in full',
			evaluate: `() => {
				const r = document.querySelector('[data-testid="so-sections-panel"]').getBoundingClientRect();
				return [r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight ? 'on screen' : 'OFF SCREEN ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(',')];
			}`,
			expected: ['on screen']
		},
		{ label: 'no horizontal page scroll', evaluate: `() => [document.documentElement.scrollWidth - document.documentElement.clientWidth <= 0]`, expected: [true] }
	],
	contrast: [
		{ selector: '[data-testid="so-sections-panel"] .ssm-head', label: 'menu heading', min: 4.5 },
		{ selector: '[data-testid="so-sections-panel"] .ssm-note', label: 'menu note', min: 4.5 },
		{ selector: '[data-testid="so-sections-panel"] .ssm-row', label: 'section names', min: 4.5 },
		{ selector: '[data-testid="so-sections"]', label: 'the Sections key', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="so-sections"]', label: 'the Sections key', min: 44 },
		{ selector: '[data-testid="so-sections-panel"] .ssm-row', label: 'each section row', min: 44 },
		{ selector: '[data-testid="so-sections-all"], [data-testid="so-sections-done"]', label: 'Show all and Done', min: 44 }
	]
});

/**
 * NEEDS ATTENTION CARRIES THE ROW'S OWN KEYS (report 08bafda7): every row
 * there has Grade then Full screen, going where its assignments row's keys
 * go, read off the page rather than off a list typed here.
 */
export const ATTENTION_KEYS_MATCH = {
	label: 'each Needs attention row has its assignments row\'s Grade and Full screen, in order, to the same place',
	evaluate: `() => {
		const keys = (el) => [...el.querySelectorAll('.so-row-key')].map((a) => a.textContent.trim() + ' ' + a.getAttribute('href'));
		return [...document.querySelectorAll('[data-testid="so-attention-row"]')].map((row) => {
			const id = new URL(row.querySelector('.so-link').href).searchParams.get('item');
			const table = document.querySelector('[data-testid="so-assignment-row"][data-item="' + id + '"]');
			const mine = keys(row);
			return mine.join(' | ') === keys(table).join(' | ') && mine.length === 2 && mine[0].startsWith('Grade ') && mine[1].startsWith('Full screen ') ? id + ': same keys' : id + ': ' + mine.join(' | ') + ' against ' + keys(table).join(' | ');
		});
	}`,
	expected: ['a-safety: same keys', 'a-gear: same keys', 'a-motor: same keys', 'a-essay: same keys']
};
