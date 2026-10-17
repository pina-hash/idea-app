/**
 * A STORED DOCUMENT WHOSE MANIFEST NAMES A TEMPLATE IT DOES NOT CARRY, on the
 * edit form (ledger 0396, polish round). The assignment being edited stores
 * the typo document (its manifest names `cam-thumbnail`, it carries only
 * `idea-thumbnail`), so 0268's sync recorded no live thumbnail for it, and the
 * form reads that from the row: it never promises a live thumbnail, says the
 * post shows the generated look and which template to add, and asks the route
 * for nothing (the route would only answer its 404). The other direction is
 * ./post-thumbnails-view-editor.mjs, whose stored document carries its
 * template and previews it live in every shape.
 */
import { THUMBS, THUMBS_READY } from './_post-thumbnails.mjs';

export default {
	path: `${THUMBS}?view=editor&editdoc=notemplate`,
	label: 'The edit form over a stored document missing its thumbnail template: the generated look, said why, nothing asked for',
	prepare: [
		THUMBS_READY,
		{
			evaluate: `() => { document.querySelector('[data-testid="thumbs-edit"] [data-testid="thumbnail-preview"]').scrollIntoView({ block: 'center', behavior: 'instant' }); return 'scrolled'; }`,
			waitMs: 1500
		}
	],
	orderResult: [
		{
			label: 'what the edit form says, how it previews, and what it asked the route for',
			evaluate: `() => {
				const ed = document.querySelector('[data-testid="thumbs-edit"] [data-testid="thumbnail-editor"]');
				return [
					ed.querySelector('[data-testid="thumbnail-now"]').textContent.trim(),
					[...ed.querySelectorAll('[data-testid="thumbnail-preview"] [data-testid="post-thumb"]')].map((p) => p.getAttribute('data-shape') + ' ' + p.getAttribute('data-source')).join(', '),
					'frames ' + ed.querySelectorAll('iframe').length,
					'frames made ' + (window.__framesMade ?? []).filter((src) => src.includes('/hx/thumb-notemplate/')).length
				];
			}`,
			expected: [
				'Automatic: the generated look, because the HTML document does not carry the thumbnail template "cam-thumbnail" its manifest names.',
				'tile generated, wide generated, banner generated',
				'frames 0',
				'frames made 0'
			]
		}
	],
	presence: [
		{ selector: '[data-testid="thumbs-edit"] [data-testid="thumbnail-missing-template"]', label: 'the template to add, in words', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="thumbs-edit"] [data-testid="thumbnail-live-note"]', label: 'no promise that a live thumbnail will show', expectPresent: 0 },
		{ selector: '[data-testid="thumbs-edit"] [data-testid="thumbnail-live-failed"]', label: 'no failure to report, because nothing was asked for', expectPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="thumbs-edit"] [data-testid="thumbnail-missing-template"]',
			label: 'the note names the template and the fix',
			must: ['"cam-thumbnail"', '<template id="cam-thumbnail">', 'generated look'],
			mustNot: ['—']
		}
	],
	contrast: [{ selector: '[data-testid="thumbs-edit"] [data-testid="thumbnail-missing-template"]', label: 'the note', min: 4.5 }],
	ignoreConsole: [/api\/classroom\/attachment\/att-/, /Failed to load resource: net::ERR_FAILED/]
};
