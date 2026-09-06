export default {
	path: '/dev/tournament-thumbs',
	label:
		'Tournament entry thumbnails: present, absent, refused and failed, in the two real spectator components',
	/* WHY THIS SURFACE IS DRIVEN IN A REAL BROWSER.

	   The claim 0076 adds to the render path is entirely about PAINT and
	   GEOMETRY, and neither is assertable anywhere else in this repo.
	   `tests/dom/` has no layout engine at all -- `getBoundingClientRect()`
	   answers a zero box and `getComputedStyle(el).color` answers the EMPTY
	   STRING there -- so a "the four states look different" test written in
	   that project would pass over four elements that were never laid out and
	   never painted. The DECISION half (which URL is refused) is asserted in
	   `tests/tournament-thumbs-state.test.ts` and is deliberately not
	   duplicated below.

	   TWO OF THE FOUR STATES ARE ONLY REACHABLE THROUGH A REAL ELEMENT.
	   `failed` is the `<img>`'s own `error` event and nothing else; `present`
	   needs bytes that actually decode. A harness that faked either would be
	   asserting its own fixture.

	   AND THE COMPARISON IS BETWEEN THE STATES, NOT AGAINST A PINNED COLOUR.
	   Prompt 0071's probe found two states painting identically and differing
	   only in words, which every per-state contrast row in this directory would
	   have passed one at a time. So the rows below read all four boxes in one
	   evaluation and assert the SIGNATURES are pairwise distinct -- a change
	   that makes two of them converge reddens, whatever the individual values
	   are. */
	prepare: [
		{
			waitFor: `() => document.querySelector('.harness')?.getAttribute('data-thumbs-settled') === '1'
				&& document.querySelectorAll('[data-thumb-case]').length === 8`,
			label: 'the eight cells (four states x two components) are mounted'
		},
		{
			/* `waitForApp` returns on DOM STABILITY, which this page satisfies the
			   moment the fixtures render -- before the `failed` fixture's image
			   has finished not-loading. So the state this spec exists to measure
			   is reached AFTER the page looks settled, and a measurement taken on
			   that signal alone would read `failed` as `present` and never say
			   so. This step retries against the effect it actually wants and
			   REPORTS what that cost: a run whose attempts jump is a run whose
			   timing changed, which is worth seeing before it becomes a flake. */
			evaluate: `async () => {
				const t0 = performance.now();
				let attempts = 0;
				const marks = () => document.querySelectorAll('.mark.failed').length;
				while (marks() < 2 && attempts < 200) {
					attempts += 1;
					await new Promise((r) => setTimeout(r, 25));
				}
				/* A STRING, deliberately: prepareEvalResult prints a string or a
				   number and renders anything else as "(nothing printable)". An
				   object here would run the retry and then throw its own answer
				   away, which is the whole point of the step. */
				return 'failed tiles painted: ' + marks() + ' after ' + attempts +
					' retry attempt(s), ' + Math.round(performance.now() - t0) + 'ms';
			}`,
			label: 'both failed tiles have replaced their images (attempts and elapsed reported)'
		}
	],
	presence: [
		{
			selector: '[data-thumb-case]',
			label: 'four states rendered in each of the two components',
			expectPresent: 8,
			maxPresent: 8,
			expectVisible: 8
		},
		{
			selector: '.mark.refused',
			label: 'exactly one refused tile per component, never more',
			expectPresent: 2,
			maxPresent: 2,
			expectVisible: 2
		},
		{
			selector: '.mark.failed',
			label: 'exactly one failed tile per component',
			expectPresent: 2,
			maxPresent: 2,
			expectVisible: 2
		},
		{
			selector: '[data-thumb-case="absent"] .thumb.initial',
			label: 'ABSENT still draws the entrant initial and is not marked as a fault',
			expectPresent: 2,
			maxPresent: 2,
			expectVisible: 2
		},
		{
			selector: '[data-thumb-case="absent"] .mark',
			label: 'and carries NO fault mark -- a walk-up with no photo is not an error',
			expectPresent: 0
		},
		{
			/* The positive control for the zero above and for the src zero in
			   `orderResult`: two images really are on the page, so "no fault
			   mark on absent" cannot be a selector that matched nothing. */
			selector: '[data-thumb-case="present"] img.thumb',
			label: 'the present fixture really did render an image element',
			expectPresent: 2,
			maxPresent: 2,
			expectVisible: 2
		}
	],
	contrast: [
		{
			selector: '.mark.refused',
			label: 'the refused glyph against its own fill',
			min: 4.5
		},
		{
			selector: '.mark.failed',
			label: 'the failed glyph against its own fill',
			min: 4.5
		}
	],
	orderResult: [
		{
			label: 'FOUR STATES, FOUR DISTINCT PAINTS -- compared against each other, not against a pinned value',
			/* Composited to a canvas rather than string-compared, because these
			   values arrive as rgba() over a room background and two different
			   alphas over the same ground can be the same pixel.

			   AND A DECODED PICTURE IS SAMPLED AS PIXELS, WHICH THE FIRST DRAFT
			   OF THIS ROW DID NOT DO AND WHICH THE HARNESS CAUGHT. Reading only
			   the BOX's computed fill and ink reported `.banners: 4 states, 3
			   distinct paints`: in that component `.thumb.initial` inherits its
			   ink from the banner (`color: currentColor`) and takes the same
			   background as the `<img>`, so `present` and `absent` had an
			   identical box and collapsed -- a true statement about the box and
			   a false one about what a spectator sees, which is exactly the
			   "differing only in words" failure this row exists to catch. The
			   image is same-origin, so its centre pixel can be read for real.
			   That is paint, not structure. */
			evaluate: `() => {
				const over = (value, under) => {
					const c = document.createElement('canvas');
					c.width = c.height = 1;
					const ctx = c.getContext('2d');
					ctx.fillStyle = under;
					ctx.fillRect(0, 0, 1, 1);
					ctx.fillStyle = value;
					ctx.fillRect(0, 0, 1, 1);
					const d = ctx.getImageData(0, 0, 1, 1).data;
					return d[0] + ',' + d[1] + ',' + d[2];
				};
				const picturePixel = (img) => {
					if (!(img instanceof HTMLImageElement) || !img.naturalWidth) return null;
					const c = document.createElement('canvas');
					c.width = c.height = 1;
					const ctx = c.getContext('2d');
					ctx.drawImage(img, Math.floor(img.naturalWidth / 2), Math.floor(img.naturalHeight / 2), 1, 1, 0, 0, 1, 1);
					const d = ctx.getImageData(0, 0, 1, 1).data;
					return 'px ' + d[0] + ',' + d[1] + ',' + d[2] + ',' + d[3];
				};
				const out = [];
				const ground = getComputedStyle(document.body).backgroundColor || 'rgb(0,0,0)';
				for (const scope of ['.chips', '.banners']) {
					const sigs = new Map();
					for (const cell of document.querySelectorAll(scope + ' [data-thumb-case]')) {
						const kind = cell.getAttribute('data-thumb-case');
						const box = cell.querySelector('.thumb');
						if (!box) { out.push(scope + ' ' + kind + ': NO BOX'); continue; }
						const cs = getComputedStyle(box);
						sigs.set(kind, picturePixel(box) ||
							(over(cs.backgroundColor, ground) + '|' + over(cs.color, ground) + '|' + cs.borderStyle));
					}
					out.push(scope + ': ' + sigs.size + ' states, ' + new Set(sigs.values()).size + ' distinct paints');
				}
				return out;
			}`,
			expected: ['.chips: 4 states, 4 distinct paints', '.banners: 4 states, 4 distinct paints']
		},
		{
			label: 'NO ROW MOVES -- every state occupies the identical box, in both components',
			/* The whole reason the fault tiles are `.thumb` plus a modifier
			   rather than a element of their own. Measured to the sub-pixel and
			   reported as a set, so a state that is one pixel out shows the
			   number rather than a boolean. */
			evaluate: `() => {
				const out = [];
				for (const scope of ['.chips', '.banners']) {
					const boxes = [...document.querySelectorAll(scope + ' [data-thumb-case] .thumb')]
						.map((b) => b.getBoundingClientRect());
					if (boxes.length !== 4) { out.push(scope + ': ' + boxes.length + ' boxes'); continue; }
					const dims = new Set(boxes.map((r) => Math.round(r.width * 100) / 100 + 'x' + Math.round(r.height * 100) / 100));
					const nonZero = boxes.every((r) => r.width > 0 && r.height > 0);
					out.push(scope + ': ' + dims.size + ' distinct size(s), laid out ' + nonZero);
				}
				return out;
			}`,
			/* One distinct size per component and a real box: a run measuring
			   zero-sized elements would report "1 distinct size" too, which is
			   why `laid out` is in the same string. */
			expected: ['.chips: 1 distinct size(s), laid out true', '.banners: 1 distinct size(s), laid out true']
		},
		{
			label: 'THE REFUSED STRING NEVER REACHES AN ATTRIBUTE, anywhere in the document',
			/* Not "the img is absent" -- the whole rule is that the element is
			   not rendered rather than rendered with a blanked value, so this
			   sweeps every attribute of every element rather than one selector. */
			evaluate: `() => {
				let hits = 0;
				let scanned = 0;
				for (const el of document.querySelectorAll('*')) {
					for (const a of el.attributes) {
						scanned += 1;
						if (a.value.includes('javascript:')) hits += 1;
					}
				}
				return ['attributes scanned > 100: ' + (scanned > 100), 'javascript: in an attribute: ' + hits];
			}`,
			expected: ['attributes scanned > 100: true', 'javascript: in an attribute: 0']
		},
		{
			label: 'AND THE FAULT TILES CARRY A WORD, not only a colour and a glyph',
			/* Colour is never the only signal and neither is a glyph: the label
			   is what an assistive reader gets. `absent` is checked to have NO
			   label in the same read, because the entrant initial beside a
			   display name is decoration and labelling it would announce a
			   non-event on every chip in a bracket. */
			evaluate: `() => {
				const labelled = [...document.querySelectorAll('.mark')]
					.map((m) => (m.getAttribute('aria-label') || '').trim().length > 3);
				const absentLabelled = [...document.querySelectorAll('[data-thumb-case="absent"] .thumb')]
					.filter((m) => m.getAttribute('aria-label')).length;
				return [
					'fault marks: ' + labelled.length,
					'all labelled: ' + labelled.every(Boolean),
					'absent marks labelled: ' + absentLabelled
				];
			}`,
			expected: ['fault marks: 4', 'all labelled: true', 'absent marks labelled: 0']
		}
	],
	textContains: [
		{
			selector: '.harness',
			label: 'the page states what each fixture is, in words, beside the paint',
			must: ['thumbnail_url', 'walk-up', 'error'],
			mustNot: ['—']
		}
	],
	/* The `failed` fixture requests a path that deliberately 404s -- that IS the
	   state under test -- so the console error it produces belongs to the
	   fixture and not to the page. */
	ignoreConsole: [
		'Failed to load resource',
		'this-object-was-deleted-0076'
	]
};
