/**
 * THE SAME TYPO DOCUMENT UNDER A LOOK SET BY HAND (ledger 0396, polish round).
 * A hand-set thumbnail hides the database's answer from the form, so when a
 * teacher presses Automatic the form cannot know whether the stored document
 * carries its template, and the preview asks the route. The route answers its
 * 404, the frames never say they are ready, and the form says so in words:
 * the preview did not load, and since the form cannot tell (the hand-set look
 * hid the database's answer) the template is named as a cause it cannot rule
 * out, never asserted. Saving
 * hands the post back to its manifest; the row that comes back is none (0268
 * found no template), and the remounted form then reads the database's answer
 * and names the template to add.
 */
import { THUMBS, THUMBS_READY } from './_post-thumbnails.mjs';

const EDIT = '[data-testid="thumbs-edit"]';
const NOW = `document.querySelector('${EDIT} [data-testid="thumbnail-now"]')?.textContent.trim() ?? ''`;

export default {
	path: `${THUMBS}?view=editor&editdoc=notemplate-manual`,
	label: 'Automatic over a hand-set look on a document missing its template: the failed preview is said, and saving reads the database',
	prepare: [
		THUMBS_READY,
		{
			evaluate: `() => { document.querySelector('${EDIT} [data-testid="thumbnail-preview"]').scrollIntoView({ block: 'center', behavior: 'instant' }); window.__before = ${NOW}; return window.__before; }`,
			waitMs: 300
		},
		{ click: `${EDIT} [data-testid="thumbnail-auto"]`, until: `() => /Saving the post sets it/.test(${NOW})`, attempts: 20 },
		{ waitFor: `() => !!document.querySelector('${EDIT} [data-testid="thumbnail-live-failed"]')`, timeoutMs: 15000 },
		{
			evaluate: `() => { window.__failed = [${NOW}, document.querySelector('${EDIT} [data-testid="thumbnail-live-failed"]').textContent.trim()]; return 'read'; }`
		},
		{
			click: `${EDIT} [data-testid="composer-publish-bottom"]`,
			until: `() => document.querySelectorAll('[data-testid="thumbs-write"][data-op="auto"]').length > 0`,
			attempts: 20
		},
		{ waitFor: `() => !!document.querySelector('${EDIT} [data-testid="thumbnail-missing-template"]')`, timeoutMs: 15000 }
	],
	orderResult: [
		{
			label: 'before: the hand-set look; after pressing Automatic: the preview failed and the form says so',
			evaluate: `() => [window.__before, ...(window.__failed ?? [])]`,
			expected: [
				'The generated look, chosen by hand.',
				"Automatic: the HTML document's live thumbnail, which did not load in this preview. Saving the post sets it.",
				'The live thumbnail did not load in this preview, which shows the generated look in its place. Try again to load it. If it still does not load, the document may not carry <template id="cam-thumbnail">, and without it the post shows the generated look.'
			]
		},
		{
			label: "after saving: the database's answer (no live thumbnail), read from the row, and nothing asked of the route again",
			evaluate: `() => [
				${NOW},
				'frames ' + document.querySelectorAll('${EDIT} [data-testid="thumbnail-editor"] iframe').length,
				'last row ' + (document.querySelector('[data-testid="thumbs-last-row"]')?.textContent.trim() ?? '')
			]`,
			expected: [
				'Automatic: the generated look, because the HTML document does not carry the thumbnail template "cam-thumbnail" its manifest names.',
				'frames 0',
				'last row as-edit: null'
			]
		}
	],
	presence: [
		{ selector: `${EDIT} [data-testid="thumbnail-live-failed"]`, label: 'no failure note once the database has answered', expectPresent: 0 },
		{ selector: `${EDIT} [data-testid="thumbnail-missing-template"]`, label: 'the template to add', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	/* The preview's three frames asked the route, which answers the 404 a
	   document without its template gets: that is the failure this spec reads.
	   A sandboxed frame's own failed load is logged with no address, which is
	   the second pattern; nothing else on this page can answer a 404. */
	ignoreConsole: [
		/\/hx\/thumb-notemplate\/thumbnail/,
		/status of 404 \(Not Found\)$/,
		/api\/classroom\/attachment\/att-/,
		/Failed to load resource: net::ERR_FAILED/
	]
};
