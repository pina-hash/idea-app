/**
 * A DRAFT HTML ASSIGNMENT'S EDIT FORM ASKS THE ROUTE FOR NOTHING (review of
 * the polish round). The route serves a live thumbnail only for a live post,
 * so a draft's preview could only meet the bodyless 404, and the form then
 * blamed the document's template for a refusal that was about publishing.
 * The preview shows the generated look in every shape, no frame is made and
 * no request is sent, nothing is reported as failed (after the 2.5s a frame is
 * given to say it is ready), and the one note says the live thumbnail shows
 * once the class can see the assignment. The scheduled post is
 * ./post-thumbnails-view-editor-editdoc-scheduled.mjs; a live post whose
 * preview does fail is ./post-thumbnails-view-editor-editdoc-refused.mjs.
 */
import { THUMBS, THUMBS_READY } from './_post-thumbnails.mjs';

const EDIT = '[data-testid="thumbs-edit"]';

export default {
	path: `${THUMBS}?view=editor&editdoc=draft`,
	label: "A draft HTML assignment's edit form: the generated look, the publishing note, and nothing asked of the route",
	prepare: [
		THUMBS_READY,
		{
			evaluate: `() => { document.querySelector('${EDIT} [data-testid="thumbnail-preview"]').scrollIntoView({ block: 'center', behavior: 'instant' }); return 'scrolled'; }`,
			/* Past the 2.5s a live frame is given to say it is ready, so a
			   failure, had a frame been made, would be on the page. */
			waitMs: 4000
		}
	],
	orderResult: [
		{
			label: 'what the edit form says, how it previews, and what it asked the route for',
			evaluate: `() => {
				const ed = document.querySelector('${EDIT} [data-testid="thumbnail-editor"]');
				return [
					ed.querySelector('[data-testid="thumbnail-now"]').textContent.trim(),
					[...ed.querySelectorAll('[data-testid="thumbnail-preview"] [data-testid="post-thumb"]')].map((p) => p.getAttribute('data-shape') + ' ' + p.getAttribute('data-source')).join(', '),
					'frames ' + ed.querySelectorAll('iframe').length,
					'frames made ' + (window.__framesMade ?? []).filter((src) => src.includes('/hx/thumb-gear/')).length
				];
			}`,
			expected: [
				"Automatic: the HTML document's live thumbnail.",
				'tile generated, wide generated, banner generated',
				'frames 0',
				'frames made 0'
			]
		}
	],
	presence: [
		{ selector: `${EDIT} [data-testid="thumbnail-live-note"]`, label: 'the live thumbnail shows once published, in words', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: `${EDIT} [data-testid="thumbnail-live-failed"]`, label: 'no failure reported, because nothing was asked for', expectPresent: 0 },
		{ selector: `${EDIT} [data-testid="thumbnail-live-retry"]`, label: 'no Try again', expectPresent: 0 },
		{ selector: `${EDIT} [data-testid="thumbnail-missing-template"]`, label: 'no template blamed', expectPresent: 0 }
	],
	textContains: [
		{
			selector: `${EDIT} [data-testid="thumbnail-live-note"]`,
			label: 'the note says when the live thumbnail shows, and names no template',
			must: ['once the class can see the assignment', 'scheduled time', 'generated look'],
			mustNot: ['template', '—']
		}
	],
	ignoreConsole: [/api\/classroom\/attachment\/att-/, /Failed to load resource: net::ERR_FAILED/]
};
