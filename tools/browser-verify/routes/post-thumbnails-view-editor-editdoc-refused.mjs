/**
 * A LIVE POST WHOSE PREVIEW DOES NOT LOAD, WHERE THE FORM KNOWS THE DOCUMENT
 * CARRIES ITS TEMPLATE (review of the polish round). The stored row is the
 * automatic live thumbnail 0268 records only for a document carrying its
 * template, so a frame that never says it is ready is a load that did not
 * finish: the form says the live thumbnail did not load in this preview,
 * blames no template, and offers Try again, which makes the three frames
 * afresh (three more requests, one a frame) rather than asking for a reload that would
 * cost the form's unsaved work. The served handle here is one the dev route
 * does not know, so every frame meets the bodyless 404.
 */
import { THUMBS, THUMBS_READY } from './_post-thumbnails.mjs';

const EDIT = '[data-testid="thumbs-edit"]';
const NOW = `document.querySelector('${EDIT} [data-testid="thumbnail-now"]')?.textContent.trim() ?? ''`;
const FRAMES = `document.querySelectorAll('${EDIT} [data-testid="thumbnail-preview"] iframe').length`;
/* Frames made under the preview from the moment this is installed: a new
   frame is a new request (the route's own refusal is a document load, which
   the parent's resource timing does not report for an opaque-origin frame). */
const WATCH = `(() => { window.__made = 0; const root = document.querySelector('${EDIT} [data-testid="thumbnail-editor"]'); new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) { if (n.nodeType !== 1) continue; if (n.tagName === 'IFRAME') window.__made += 1; else window.__made += n.querySelectorAll('iframe').length; } }).observe(root, { childList: true, subtree: true }); })()`;

export default {
	path: `${THUMBS}?view=editor&editdoc=refused`,
	label: 'A live post whose preview does not load: said in words, no template blamed, and Try again asks afresh',
	prepare: [
		THUMBS_READY,
		{
			evaluate: `() => { document.querySelector('${EDIT} [data-testid="thumbnail-preview"]').scrollIntoView({ block: 'center', behavior: 'instant' }); return 'scrolled'; }`,
			waitMs: 300
		},
		{ waitFor: `() => !!document.querySelector('${EDIT} [data-testid="thumbnail-live-failed"]')`, timeoutMs: 15000 },
		{ evaluate: `() => { window.__first = [${NOW}, document.querySelector('${EDIT} [data-testid="thumbnail-live-failed"]').textContent.trim(), 'frames ' + ${FRAMES}]; ${WATCH}; return 'read'; }` },
		{
			click: `${EDIT} [data-testid="thumbnail-live-retry"]`,
			until: `() => !document.querySelector('${EDIT} [data-testid="thumbnail-live-failed"]')`,
			attempts: 12
		},
		{ evaluate: `() => { window.__retrying = ['failure note while retrying ' + !!document.querySelector('${EDIT} [data-testid="thumbnail-live-failed"]'), 'frames ' + ${FRAMES}, 'focus on ' + (document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName)]; return 'read'; }` },
		{ waitFor: `() => !!document.querySelector('${EDIT} [data-testid="thumbnail-live-failed"]')`, timeoutMs: 15000 }
	],
	orderResult: [
		{
			label: 'the first failure: what the form says, and the preview drawn without a frame',
			evaluate: `() => window.__first ?? []`,
			expected: [
				"Automatic: the HTML document's live thumbnail, which did not load in this preview.",
				'The live thumbnail did not load in this preview, which shows the generated look in its place. Try again to load it.',
				'frames 0'
			]
		},
		{
			label: 'Try again makes the three frames afresh, moves the focus to the status line, and forgets the failure until they fail again',
			evaluate: `() => [...(window.__retrying ?? []), 'frames made ' + window.__made, 'frames now ' + ${FRAMES}]`,
			expected: ['failure note while retrying false', 'frames 3', 'focus on thumbnail-now', 'frames made 3', 'frames now 0']
		}
	],
	presence: [
		{ selector: `${EDIT} [data-testid="thumbnail-live-failed"]`, label: 'the failure, said once', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: `${EDIT} [data-testid="thumbnail-live-retry"]`, label: 'its Try again', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: `${EDIT} [data-testid="thumbnail-missing-template"]`, label: 'no template blamed', expectPresent: 0 },
		{ selector: `${EDIT} [data-testid="thumbnail-live-note"]`, label: 'no publishing note on a live post', expectPresent: 0 }
	],
	textContains: [
		{
			selector: `${EDIT} [data-testid="thumbnail-live-failed"]`,
			label: 'the note names no template, because the database said the document carries it',
			must: ['did not load', 'Try again'],
			mustNot: ['template', '—']
		}
	],
	tapTargets: [{ selector: `${EDIT} [data-testid="thumbnail-live-retry"]`, label: 'Try again', min: 44 }],
	contrast: [{ selector: `${EDIT} [data-testid="thumbnail-live-failed"]`, label: 'the failure note', min: 4.5 }],
	ignoreConsole: [
		/\/hx\/thumb-refused\/thumbnail/,
		/status of 404 \(Not Found\)$/,
		/api\/classroom\/attachment\/att-/,
		/Failed to load resource: net::ERR_FAILED/
	]
};
