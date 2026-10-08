/**
 * THE ARMORY APP'S NOTES (website requests v0.3, item 4; 0233), the REAL
 * console in `/dev/feedback?view=armory` against the harness's sample notes,
 * under the site plate with the area's source strip above it.
 *
 * WHAT IS DRIVEN: the context of the note whose JSON holds runs of backticks is
 * opened. WHAT IS READ: the strip lights one key and only one; the status tabs
 * count; the open context scrolls inside its own box rather than pushing the
 * page sideways at 375; the export key's word changes from "N shown" to "1
 * selected" when a box is checked and back when it is cleared (both
 * directions); hostile markup in a note arrives as text.
 */
export default {
	path: '/dev/feedback?view=armory',
	label: 'Armory app feedback tab: status counts, an open context that scrolls inside itself, the export key',
	prepare: [
		{
			evaluate: `() => {
				const row = [...document.querySelectorAll('[data-testid="af-row"]')].find((r) => r.textContent.includes('backticks'));
				const t = row?.querySelector('.disc-trigger');
				if (t && t.getAttribute('aria-expanded') !== 'true') t.click();
				return t ? t.getAttribute('aria-expanded') : 'no row';
			}`,
			until: `() => [...document.querySelectorAll('[data-testid="af-row"]')].find((r) => r.textContent.includes('backticks'))?.querySelector('.disc-trigger')?.getAttribute('aria-expanded') === 'true'`,
			attempts: 10
		}
	],
	presence: [
		{ selector: '[data-testid="feedback-sources"] a', label: 'the three source keys', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="feedback-sources"] a.on[aria-current="page"]', label: 'exactly one lit, and it is the current page', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="feedback-source-armory"].on', label: 'the lit one is Armory app', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="af-row"]', label: 'the five new notes (one of six is Seen)', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '.af-pre', label: 'every note carries its context (in the DOM, closed or not); the one opened is drawn', expectPresent: 5, maxPresent: 5, expectVisible: 1 },
		{ selector: '.site-plate .af-page', label: 'the console, under the site plate', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.cr-root', label: 'no classroom room around it', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="armory-report-link-help"]', label: 'how a note and an incident are linked', must: ['Send feedback', 'no incident linked', 'Report a problem'] },
		{ selector: '[data-testid="af-status-new"]', label: 'the New tab counts', must: ['New (5)'] },
		{ selector: '[data-testid="af-status-all"]', label: 'the All tab counts', must: ['All (6)'] },
		{ selector: '[data-testid="af-export"]', label: 'the export key says what it will take', must: ['Export 5 shown as Markdown'] }
	],
	orderResult: [
		{
			label: 'the open context scrolls inside its own box, and the markup in a note is text',
			evaluate: `() => {
				const row = [...document.querySelectorAll('[data-testid="af-row"]')].find((r) => r.textContent.includes('backticks'));
				const pre = row.querySelector('.af-pre');
				const r = pre.getBoundingClientRect();
				const page = document.documentElement.scrollWidth - document.documentElement.clientWidth;
				const hostile = [...document.querySelectorAll('.af-body')].some((b) => b.textContent.includes('<script>alert(1)</script>'));
				const injected = document.querySelectorAll('.af-page script, .af-page img').length;
				return [
					r.height > 0 && r.right <= window.innerWidth + 0.5 ? 'the context is drawn inside the viewport' : 'CONTEXT BOX right ' + r.right + ' height ' + r.height,
					getComputedStyle(pre).overflowX === 'auto' ? 'it scrolls on its own' : 'OVERFLOW ' + getComputedStyle(pre).overflowX,
					page <= 0 ? 'no page-level horizontal scroll' : 'PAGE SCROLLS ' + page + 'px',
					hostile && injected === 0 ? 'hostile markup is text' : 'HOSTILE ' + hostile + ' INJECTED ' + injected
				];
			}`,
			expected: ['the context is drawn inside the viewport', 'it scrolls on its own', 'no page-level horizontal scroll', 'hostile markup is text']
		},
		{
			label: 'checking a box turns the export into "1 selected", and clearing it turns it back',
			evaluate: `async () => {
				const flush = () => new Promise((r) => setTimeout(r, 60));
				const key = () => document.querySelector('[data-testid="af-export"]').textContent.replace(/\\s+/g, ' ').trim();
				const box = document.querySelector('[data-testid="af-row"] .af-select');
				const before = key();
				box.click(); await flush();
				const one = key();
				const bulk = !!document.querySelector('[data-testid="af-bulk-bar"]');
				box.click(); await flush();
				return [before, one, bulk ? 'the bulk bar appears' : 'NO BULK BAR', key(), document.querySelector('[data-testid="af-bulk-bar"]') ? 'BULK BAR STAYED' : 'the bulk bar goes'];
			}`,
			expected: [
				'Export 5 shown as Markdown',
				'Export 1 selected as Markdown',
				'the bulk bar appears',
				'Export 5 shown as Markdown',
				'the bulk bar goes'
			]
		}
	],
	contrast: [
		{ selector: '.af-body', label: 'a note body', min: 4.5 },
		{ selector: '.af-meta', label: 'who and where', min: 4.5 },
		{ selector: '.af-version', label: 'the app version', min: 4.5 },
		{ selector: '.af-tab', label: 'the status tabs', min: 4.5 },
		{ selector: '.af-pre', label: 'the context JSON', min: 4.5 },
		{ selector: '[data-testid="feedback-sources"] a', label: 'the source strip keys', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.af-control', label: 'every control on the tab', min: 44 },
		{ selector: '[data-testid="feedback-sources"] a', label: 'the source strip keys', min: 44 },
		{ selector: '[data-testid="af-row"] .disc-trigger', label: 'the Context trigger', min: 44 }
	]
};
