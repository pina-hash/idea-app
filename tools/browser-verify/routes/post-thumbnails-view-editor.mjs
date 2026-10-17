/**
 * THE THUMBNAIL EDITOR ON THE COMPOSER (ledger 0396): the REAL ContentComposer,
 * a new post and an HTML assignment being edited, each with the editor. The
 * edited one previews its document's live thumbnail in every shape; Generated
 * look stages the generated identity in every shape and says so in words.
 */
import { THUMBS, THUMBS_READY } from './_post-thumbnails.mjs';

export default {
	path: `${THUMBS}?view=editor`,
	label: 'The thumbnail editor on a new post and on an HTML assignment',
	prepare: [
		THUMBS_READY,
		/* A live thumbnail is created only when its slot comes within a screen
		   of the viewport, and the edit form sits below the new-post form. */
		{
			evaluate: `() => { document.querySelector('[data-testid="thumbs-edit"] [data-testid="thumbnail-preview"]').scrollIntoView({ block: 'center', behavior: 'instant' }); return 'scrolled'; }`,
			waitMs: 300
		},
		{
			waitFor: `() => document.querySelectorAll('[data-testid="thumbs-edit"] [data-testid="html-thumbnail"][data-ready="true"]').length === 3`,
			timeoutMs: 30000
		},
		{
			click: '[data-testid="thumbs-create"] [data-testid="thumbnail-generated"]',
			until: `() => /chosen by hand/.test(document.querySelector('[data-testid="thumbs-create"] [data-testid="thumbnail-now"]')?.textContent ?? '')`,
			attempts: 20
		}
	],
	orderResult: [
		{
			label: 'the edited assignment previews its live thumbnail in every shape',
			evaluate: `() => [...document.querySelectorAll('[data-testid="thumbs-edit"] [data-testid="thumbnail-preview"] [data-testid="post-thumb"]')].map((p) => p.getAttribute('data-shape') + ' ' + p.getAttribute('data-source'))`,
			expected: ['tile html', 'wide html', 'banner html']
		},
		{
			label: 'the new post previews the generated look in every shape',
			evaluate: `() => [...document.querySelectorAll('[data-testid="thumbs-create"] [data-testid="thumbnail-preview"] [data-testid="post-thumb"]')].map((p) => p.getAttribute('data-shape') + ' ' + p.getAttribute('data-source'))`,
			expected: ['tile generated', 'wide generated', 'banner generated']
		}
	],
	presence: [
		{ selector: '[data-testid="thumbnail-editor"]', label: 'an editor on each form', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		/* Two PNGs offered; the PDF and the HEIC photo (a picture 0268 would
		   refuse as a thumbnail) are not. The attachment route answers 401 here,
		   so each tile names its file instead of drawing a broken picture. */
		{ selector: '[data-testid="thumbs-edit"] [data-testid="thumbnail-pick"] button', label: "the edited post's two pictures to pick", expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="thumbs-edit"] [data-testid="thumbnail-pick-item"][data-loaded="false"] .te-pick-name', label: 'a picture that did not load names its file', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="thumbs-edit"] [data-testid="thumbnail-pick-item"] img', label: 'no broken picture left in a tile', expectPresent: 0 },
		{ selector: '[data-testid="thumbnail-unavailable"]', label: 'no "not switched on" sentence', expectPresent: 0 },
		{ selector: '[data-testid="thumbnail-preview"] .te-row-title', label: "each preview drawn as the post, with its title", expectPresent: 6, maxPresent: 6, expectVisible: 6 }
	],
	textContains: [
		{ selector: '[data-testid="thumbs-edit"] [data-testid="thumbnail-now"]', label: 'the edited post says it is automatic', must: ["the HTML document's live thumbnail"] },
		{ selector: '[data-testid="thumbs-create"] [data-testid="thumbnail-now"]', label: 'the new post says what was chosen', must: ['generated look, chosen by hand'] },
		{ selector: '[data-testid="thumbs-edit"] [data-testid="thumbnail-pick"]', label: 'the tiles name bench.png and arm.png, never the HEIC', must: ['bench.png', 'arm.png'], mustNot: ['IMG_0412'] }
	],
	contrast: [
		{ selector: '[data-testid="thumbnail-now"]', label: 'what the post shows, in words', min: 4.5 },
		{ selector: '.te-hint', label: 'the paste and drop hint', min: 4.5 },
		{ selector: '.te-row-title', label: "the post's title beside each preview", min: 4.5 }
	],
	/* The edited post's own pictures load from the attachment route, which
	   answers 401 with no session in a harness; the pick keys are measured with
	   their pictures missing. */
	ignoreConsole: [/api\/classroom\/attachment\/att-/, /Failed to load resource: net::ERR_FAILED/],
	tapTargets: [
		{ selector: '[data-testid="thumbnail-upload"], [data-testid="thumbnail-paste"], [data-testid="thumbnail-generated"], [data-testid="thumbnail-auto"]', label: 'the thumbnail keys', min: 44 },
		{ selector: '.te-pick-item', label: "the post's own pictures", min: 44 }
	]
};
