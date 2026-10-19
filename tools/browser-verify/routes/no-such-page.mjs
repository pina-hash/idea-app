/**
 * THE ERROR PAGE IN THE SITE'S LOOK (report 6f1c0a3d, ledger 0416). It drew the
 * retired green-frame card and "ERROR // 404" because the page that failed
 * (a classroom item) never rendered the room that carries the plate. The root
 * layout now puts every error page on the site plate, so the title bar between
 * its hazard ends, the panel, the recessed facts and the raised keys are the
 * home page's own. An address under /dev that answers nothing is a real 404.
 */
export default {
	path: '/dev/no-such-page',
	label: 'The error page: a 404 in the site plate',
	// The page's own document answers 404 on purpose: that is the state measured.
	ignoreConsole: [/status of 404 \(Not Found\) \[404 [^\]]*\/dev\/no-such-page\]/],
	presence: [
		{ selector: '.site-plate .err-page', label: 'the error page on the site plate', expectPresent: 1, maxPresent: 1 },
		{ selector: 'h1.plate-title.err-title', label: 'the title bar', expectPresent: 1, maxPresent: 1 },
		{ selector: '.err-card .err-code', label: 'the status as a number', expectPresent: 1, maxPresent: 1 },
		{ selector: '.err-card .btn', label: 'the keys', expectPresent: 2, maxPresent: 3 }
	],
	textContains: [
		{ selector: 'h1.err-title', label: 'the heading', contains: 'That page is not here' },
		{ selector: '.err-chip', label: 'the status in words', contains: 'Not found' }
	],
	orderResult: [
		{
			label: 'no `//` anywhere on the page, the heading included',
			evaluate: `() => [...document.querySelectorAll('.err-page *')].filter((el) => /\\/\\//.test(getComputedStyle(el, '::before').content + getComputedStyle(el, '::after').content) || /\\s\\/\\/\\s/.test(el.childNodes.length === 1 ? el.textContent : '')).map((el) => el.className)`,
			expected: []
		}
	],
	contrast: [
		{ selector: '.err-lead', label: 'the sentence', min: 4.5 },
		{ selector: '.err-facts dd', label: 'the page address', min: 4.5 },
		{ selector: '.err-facts dt', label: 'the fact labels', min: 4.5 },
		{ selector: '.err-chip', label: 'the status word', min: 4.5 }
	]
};
