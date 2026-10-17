/**
 * POST THUMBNAILS ON THE CLASS PAGE, the built-in Tile shape (ledger 0396,
 * report a6a037f3). Over the harness fixture, every row carries a slot in
 * front of its title: hand-set pictures, a picture the HTML document names,
 * three live HTML thumbnails (CSS, canvas, interactive) and the generated
 * identity for everything else, the kind glyph moved into the tile. A tile is
 * part of the row's own link (one 44px target, never a smaller one beside
 * it); only the interactive live thumbnail sits beside the link and keeps its
 * own clicks. Each live thumbnail reports what the bridge told it. A post
 * whose document's manifest names a template the document does not carry
 * (the typo an author makes) shows the generated look at once: no frame and
 * no request, where the route would only have answered a 404.
 */
import { LIVE_READY, SLOTS, SLOT_ORDER, THUMBS, THUMBS_READY, TOLD } from './_post-thumbnails.mjs';

export default {
	path: THUMBS,
	label: 'Post thumbnails on the class page, Tile',
	prepare: [THUMBS_READY, LIVE_READY, { evaluate: `() => 'settled'`, waitMs: 600 }],
	orderResult: [
		{
			label: 'every row has a slot, each showing what its post holds',
			evaluate: `() => (${SLOTS})().map((s) => s.replace(/ tile$/, ''))`,
			expected: SLOT_ORDER
		},
		{
			label: 'each live thumbnail was told its shape and scheme',
			evaluate: TOLD,
			expected: ['thumb-gear tile dark interactive=false', 'thumb-canvas tile dark interactive=false', 'thumb-interactive tile dark interactive=true']
		},
		{
			/* THE TYPO: the harness's stand-in for 0268's sync read the document
			   and recorded no live thumbnail, so the row asks for nothing; the
			   route itself, asked directly, answers the 404 the row would have
			   waited on. Read from every frame the page has made
			   (the harness's __framesMade), so a frame made and taken away is still
			   counted; the positive control is the gear post's own frame. The
			   page's resource timing reports a sandboxed frame's load zero
			   times, so it cannot be the instrument here. */
			label: 'a manifest naming a template its document lacks: the generated look, no frame, no request, and the route refuses it',
			evaluate: `async () => {
				const p = document.querySelector('[data-item-id="as-cams"] [data-testid="post-thumb"]');
				const made = window.__framesMade ?? [];
				const asked = made.filter((src) => src.includes('/hx/thumb-notemplate/')).length;
				const control = made.filter((src) => src.includes('/hx/thumb-gear/')).length;
				const res = await fetch('/hx/thumb-notemplate/thumbnail');
				const gear = await fetch('/hx/thumb-gear/thumbnail');
				return [
					'as-cams ' + p.getAttribute('data-source') + ' ready=' + p.getAttribute('data-ready'),
					'frames ' + document.querySelectorAll('[data-item-id="as-cams"] iframe').length,
					'frames made for it ' + asked + ', for the gear post ' + (control > 0),
					'route ' + res.status + ', control ' + gear.status
				];
			}`,
			expected: ['as-cams generated ready=false', 'frames 0', 'frames made for it 0, for the gear post true', 'route 404, control 200']
		},
		{
			/* What a finger at the middle of each slot actually lands on: the
			   ROW'S own link (which opens the post) over a picture, a generated
			   tile and a NON-interactive live thumbnail, and the frame itself
			   only for the one that declared "interactive": true. */
			label: 'a press at the middle of a slot lands on the row link, and on the frame only for the interactive one',
			evaluate: `() => ['as-bench', 'mat-calipers', 'as-gears', 'as-spokes', 'as-teeth'].map((id) => {
				const pt = document.querySelector('[data-item-id="' + id + '"] [data-testid="post-thumb"]');
				pt.scrollIntoView({ block: 'center', behavior: 'instant' });
				const r = pt.getBoundingClientRect();
				const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
				if (!hit) return id + ' nothing';
				if (hit.tagName === 'IFRAME') return id + ' IFRAME';
				return id + ' ' + (hit.closest('a')?.getAttribute('data-testid') ?? hit.tagName);
			})`,
			expected: ['as-bench row-open', 'mat-calipers row-open', 'as-gears row-open', 'as-spokes row-open', 'as-teeth IFRAME']
		}
	],
	presence: [
		{ selector: '.stream[data-thumbs="tile"]', label: 'the list is in Tile', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="post-thumb"]', label: 'one slot per row', expectPresent: 14, maxPresent: 14, expectVisible: 14 },
		{ selector: '[data-testid="post-thumb"][data-ready="true"]', label: 'pictures and live thumbnails painted', expectPresent: 7, maxPresent: 7 },
		{ selector: '[data-testid="html-thumbnail"] iframe[sandbox]', label: 'three sandboxed live frames', expectPresent: 3, maxPresent: 3 },
		{ selector: '[data-testid="html-thumbnail"] iframe[sandbox*="allow-same-origin"]', label: 'no frame granted allow-same-origin', expectPresent: 0 },
		/* Fourteen slots minus the interactive thumbnail (it keeps its own
		   clicks, beside the link) and the check-in (this harness hands the
		   class page no notebook address, so that row has no link at all). */
		{ selector: 'a[data-testid="row-open"] [data-testid="post-thumb"]', label: 'every tile but the interactive one and the linkless check-in is inside the row link', expectPresent: 12, maxPresent: 12 },
		{ selector: '[data-testid="post-thumb-link"]', label: 'no second link of a tile beside the row link', expectPresent: 0 },
		{ selector: 'a[data-testid="row-open"] a', label: 'no link nested inside a row link', expectPresent: 0 },
		/* The two non-interactive live thumbnails are frames inside the row
		   link, and every one is inert: out of the tab order, hidden from
		   assistive tech, taking no pointer. */
		{ selector: 'a[data-testid="row-open"] iframe[inert]', label: 'the live frames inside a row link, inert', expectPresent: 2, maxPresent: 2 },
		{ selector: 'a[data-testid="row-open"] iframe:not([inert])', label: 'no frame inside a row link that is not inert', expectPresent: 0 },
		{ selector: '.row-wrap .kind-glyph', label: 'no separate kind glyph beside a tile', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.row-name', label: 'row titles beside a tile', min: 4.5 },
		{ selector: '.row-meta', label: 'row meta beside a tile', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="row-open"]', label: 'the row link', min: 44 }],
	/* The one 404 is this spec's own probe of the route, made after the page's
	   requests were counted ("requests before 0" above is what says the row
	   asked for nothing). */
	ignoreConsole: [/\/hx\/thumb-notemplate\/thumbnail/]
};
