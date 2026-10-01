/**
 * THE EDIT LAYER IS ON TOP OF EVERYTHING IT COVERS (report R06, 9f94f730,
 * ledger 0360), on the REAL item page inside the REAL classroom shell and
 * split, as a teacher with the class list showing.
 *
 * The defect: `src/app.css` makes every `main` a z-index 1 stacking context,
 * and ItemDetail renders its full-viewport editor inside its own `main`, so the
 * layer's z-index 60 was ranked at 1 inside `.cr-root` -- under ClassSplit's
 * resize separator (z-index 2: the "slider bar" drawn over the form, whose grip
 * still took a drag) and under the classroom masthead (z-index 2, over the
 * layer's heading row and its Close). The layer's own computed z-index read 60
 * the whole time, which is why these rows HIT-TEST and never read a z-index.
 *
 * THE POSITIVE CONTROL is the first prepare step: at 1440 the separator and its
 * grip exist (the harness now provides the classroom preference store exactly
 * as the classroom layout does, without which ClassSplit draws no separator at
 * all and this spec would pass on an absence). Below 1024 the split is one
 * column and the separator draws no box, which the rows report as such.
 */
const EDITOR_OPEN = '() => !!document.querySelector(\'.composer-screen\')';

export default {
	path: '/dev/classroom-split/s-1/item/i-draft?manage=1&state=edit-layer',
	aliasOf: '/dev/classroom-split/s-1/item/i-draft?manage=1',
	label: 'R06: the item edit layer is above the split separator and the masthead (hit tests)',
	prepare: [
		{ waitFor: '() => !!document.querySelector(\'[data-testid="item-edit-toggle"]\')', timeoutMs: 20000 },
		{
			waitFor:
				'() => innerWidth < 1024 || !!document.querySelector(\'[data-testid="split-separator"] .cr-split-grip\')',
			timeoutMs: 20000
		},
		/* FORTY ATTEMPTS, NOT TWELVE, AND THAT IS HYDRATION RATHER THAN THE PAGE.
		   The first width a run loads is the cold one: Vite is still optimizing
		   this route's dependencies, so the server-rendered Edit post sits on
		   screen unhydrated for longer than twelve attempts at 300ms (measured
		   on 2026-10-01: the click did nothing at 4s and opened the layer at
		   12s, at 375 and at the base commit alike; at 1440, warm, attempt 1). */
		{ click: '[data-testid="item-edit-toggle"]', until: EDITOR_OPEN, attempts: 40, gapMs: 500 }
	],
	presence: [
		{ selector: '.composer-screen', label: 'the edit layer, open', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: 'main.classroom-page.edit-layer-open', label: 'the page has dropped its stacking context while editing', expectPresent: 1, maxPresent: 1 }
	],
	orderResult: [
		{
			label: 'the separator grip, the layer Close and the form under the separator are all hit as the layer',
			evaluate: `() => {
				const layer = document.querySelector('.composer-screen');
				if (!layer) return ['no layer'];
				const centre = (el) => {
					const r = el.getBoundingClientRect();
					return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
				};
				const describe = (hit) => {
					if (!hit) return 'nothing';
					if (hit.closest('.cr-split-sep')) return 'the separator';
					if (hit.closest('.app-header')) return 'the masthead';
					return (hit.className && typeof hit.className === 'string' ? hit.className.split(' ')[0] : hit.tagName.toLowerCase());
				};
				const out = [];
				const grip = document.querySelector('[data-testid="split-separator"] .cr-split-grip');
				const sep = document.querySelector('[data-testid="split-separator"]');
				const wide = innerWidth >= 1024;
				if (!grip || grip.getClientRects().length === 0) {
					out.push(wide ? 'SEPARATOR MISSING AT ' + innerWidth : 'separator under the layer');
				} else {
					const c = centre(grip);
					const hit = document.elementFromPoint(c.x, c.y);
					out.push(hit && layer.contains(hit) ? 'separator under the layer' : 'ON TOP: ' + describe(hit));
				}
				const close = document.querySelector('[data-testid="composer-screen-close"]');
				if (!close) out.push('no Close');
				else {
					const c = centre(close);
					const hit = document.elementFromPoint(c.x, c.y);
					out.push(hit && close.contains(hit) ? 'close reachable' : 'covered by ' + describe(hit));
				}
				if (!sep || sep.getClientRects().length === 0) out.push('form on top');
				else {
					const s = sep.getBoundingClientRect();
					const body = document.querySelector('.composer-screen-body') ?? layer;
					const b = body.getBoundingClientRect();
					const hit = document.elementFromPoint(s.left + s.width / 2, b.top + Math.min(b.height, innerHeight - b.top) / 2);
					out.push(hit && layer.contains(hit) ? 'form on top' : 'form under ' + describe(hit));
				}
				return out;
			}`,
			expected: ['separator under the layer', 'close reachable', 'form on top']
		},
		{
			label: 'the page keeps its stacking context once the editor closes',
			evaluate: `async () => {
				document.querySelector('[data-testid="composer-screen-close"]')?.click();
				for (let i = 0; i < 20 && document.querySelector('.composer-screen'); i++) await new Promise((r) => setTimeout(r, 100));
				const main = document.querySelector('main.classroom-page');
				return [
					document.querySelector('.composer-screen') ? 'layer still open' : 'layer closed',
					main && !main.classList.contains('edit-layer-open') && getComputedStyle(main).zIndex === '1' ? 'page back at z 1' : 'page z ' + (main ? getComputedStyle(main).zIndex : 'none')
				];
			}`,
			expected: ['layer closed', 'page back at z 1']
		}
	],
	tapTargets: [{ selector: '[data-testid="composer-screen-close"]', label: 'Close (layer header)', min: 44 }],
	contrast: [{ selector: '.composer-screen-title', label: 'the layer heading', min: 4.5 }]
};
