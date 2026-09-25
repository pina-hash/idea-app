/**
 * Shared by the "Download all files" route specs (ledger 0298, A6). A leading
 * underscore marks it as infrastructure: `routes.mjs` skips it when it reads
 * this directory.
 */
export const OPEN_FILES_PANEL = [
	{
		waitFor: '() => document.querySelectorAll(".roster-list .roster-row").length > 0',
		label: 'the roster has loaded'
	},
	{
		click: '[data-testid="work-export-disclosure"]',
		until: `() => document.querySelector('[data-testid="work-export-disclosure"]')?.getAttribute('aria-expanded') === 'true'`,
		label: 'the export panel is open, one press from its collapsed default',
		attempts: 12,
		gapMs: 200
	},
	{
		/* THE WIDER ROSTER ANSWERS ASYNCHRONOUSLY; the note about the other class
		   is the sign it has, because without it those students read as strangers. */
		waitFor: `() => [...document.querySelectorAll('[data-testid="bulk-files-note"]')].some((n) => n.textContent.includes('your other classes'))`,
		label: 'the count is final: the other class is recognised'
	}
];
