/**
 * THE FOUNDRY GALLERY MOSAIC: the claims `tests/dom/` structurally cannot make.
 *
 * The card is the student's uploaded thumbnail now, at the shape they uploaded,
 * so almost everything that can go wrong with it is GEOMETRY -- and happy-dom
 * has no layout engine, where `getBoundingClientRect()` answers 0x0 and
 * `getComputedStyle().color` is the empty string. A clamp asserted there reads
 * zero and passes vacuously. So the arithmetic is pinned in
 * `tests/dom/foundry-card-mosaic.test.ts` and everything a browser is required
 * for is pinned here.
 *
 * THE FIXTURE IS BUILT FOR THIS. `/dev/foundry-mosaic` serves real PNG bytes at
 * seven deliberate shapes -- four ordinary, two pathological, one modern tall
 * phone -- plus a cover path that is not a key, a cover whose request fails,
 * and two apps with no cover at all. The older `/dev/foundry-gallery` fixture
 * carries `cover_path: null` on every app, so it renders three identical
 * generated covers and the mosaic never appears on it, which is how a uniform
 * grid survived being looked at.
 *
 * THE GEOMETRY CLAIMS ARE `evaluate` STEPS WITH AN `until`, because that is the
 * one shape in this harness whose predicate becomes a measurement row: the step
 * reports the numbers it read and is outside threshold when they are wrong.
 * Each is written to hold AT BOTH WIDTHS by encoding the RULE rather than one
 * width's answer -- the pass runs every spec at 375 and 1440, so a predicate
 * that only described 1440 would redden at 375 for being right.
 */
export default {
	path: '/dev/foundry-mosaic',
	label: 'Foundry gallery mosaic (arbitrary cover shapes, clamp, name plate)',
	prepare: [
		/* Every fixture cover decoded, so every card has been MEASURED. Until
		   this holds the cards sit at the 3:2 fallback and every ratio below
		   would be reading a placeholder. */
		{
			waitFor:
				'() => [...document.querySelectorAll("img.fdy-card-shot")].every((i) => i.complete)'
		},
		/* SETTLE BEFORE MEASURING. A read taken straight after the images decode
		   catches the multicol mid-balance and reports a column count the page
		   never rests at -- measured during this bundle: a capture at that
		   moment showed four columns where the settled page has five. */
		{
			evaluate: '() => new Promise((r) => setTimeout(() => r("settled"), 900))',
			until: '() => true'
		},

		/* ---------------------------------------------------------------
		   EVERY CARD'S SHAPE IS INSIDE THE CLAMP.
		   The gallery's whole risk is that one upload owns the page, and
		   nothing anywhere constrains an uploaded cover: no dimension is
		   stored, and `$lib/upload-limits.ts` records the cover row as
		   bucket-guarded only, "nothing checks a size before sending".
		   --------------------------------------------------------------- */
		{
			evaluate: `() => {
				const cards = [...document.querySelectorAll('[data-testid="fdy-card"]')];
				const ars = cards.map((c) => { const b = c.getBoundingClientRect(); return b.width / b.height; });
				const lo = Math.min(...ars), hi = Math.max(...ars);
				return cards.length + ' cards, ratio ' + lo.toFixed(3) + ' to ' + hi.toFixed(3);
			}`,
			until: `() => {
				const cards = [...document.querySelectorAll('[data-testid="fdy-card"]')];
				if (cards.length < 10) return false;
				return cards.every((c) => {
					const b = c.getBoundingClientRect();
					const ar = b.width / b.height;
					return ar >= 0.5625 - 0.01 && ar <= 2 + 0.01;
				});
			}`
		},

		/* ---------------------------------------------------------------
		   THE PROPERTY THE TALL BOUND EXISTS FOR: no single card can be
		   taller than the smallest phone viewport in common use (667px),
		   so one upload can never occupy a whole screen and there is
		   always a next card in view. The fixture contains a 1:9 and a
		   1179x2556, so this is measured against real attempts at it.
		   --------------------------------------------------------------- */
		{
			evaluate: `() => {
				const hs = [...document.querySelectorAll('[data-testid="fdy-card"]')].map((c) => c.getBoundingClientRect().height);
				return 'tallest ' + Math.round(Math.max(...hs)) + 'px, shortest ' + Math.round(Math.min(...hs)) + 'px';
			}`,
			until: `() => [...document.querySelectorAll('[data-testid="fdy-card"]')].every((c) => c.getBoundingClientRect().height <= 667)`
		},

		/* ---------------------------------------------------------------
		   THE MOSAIC PACKS INTO COLUMNS AND NEVER OVERFLOWS SIDEWAYS.
		   One column at a phone width, several at a desktop one, and the
		   list never scrolls horizontally at either.

		   WHAT THIS STEP CANNOT SEE, stated so nobody reads it as wider
		   than it is: whether the COLUMN CEILING is capped at the card
		   count. Raising `--fdy-cols` to 40 changes nothing measurable
		   here, because 1294px of pane only fits five 15rem columns
		   anyway and this fixture has eleven cards -- the ceiling only
		   binds when there are FEWER cards than the width allows. That
		   property is structural, not geometric, and is asserted in
		   `tests/dom/foundry-card-mosaic.test.ts`, where a mutant raising
		   it reddens.
		   --------------------------------------------------------------- */
		{
			evaluate: `() => {
				const ul = document.querySelector('.fdy-gal-mosaic');
				const xs = [...new Set([...document.querySelectorAll('[data-testid="fdy-card"]')].map((c) => Math.round(c.getBoundingClientRect().x)))];
				return xs.length + ' column(s) used at ' + window.innerWidth + 'px, list scrollW ' + ul.scrollWidth + '/' + ul.clientWidth;
			}`,
			until: `() => {
				const ul = document.querySelector('.fdy-gal-mosaic');
				if (!ul || ul.scrollWidth > ul.clientWidth) return false;
				const xs = new Set([...document.querySelectorAll('[data-testid="fdy-card"]')].map((c) => Math.round(c.getBoundingClientRect().x)));
				return window.innerWidth < 768 ? xs.size === 1 : xs.size > 1;
			}`
		},

		/* ---------------------------------------------------------------
		   THE TOUCH ROUTE TO THE NAME, WHICH IS THE HALF A HOVER POPUP
		   CANNOT COVER. The plate is PERMANENT unless the viewport is wide
		   AND the device can hover; the reveal is the enhancement that has
		   to be opted into, so anything the media query cannot speak for
		   gets a name rather than a bare picture. The predicate encodes
		   that rule, so it holds at 375 (opaque) and at 1440 (revealed on
		   hover) without being told which width it is at.
		   --------------------------------------------------------------- */
		{
			evaluate: `() => {
				const ps = [...document.querySelectorAll('[data-testid="fdy-card-name"]')];
				const hoverable = matchMedia('(hover: hover) and (min-width: 48rem)').matches;
				return ps.length + ' plate(s), opacity ' + [...new Set(ps.map((p) => getComputedStyle(p).opacity))].join('/') + ', hover-reveal ' + hoverable;
			}`,
			until: `() => {
				const ps = [...document.querySelectorAll('[data-testid="fdy-card-name"]')];
				if (!ps.length) return false;
				const hoverable = matchMedia('(hover: hover) and (min-width: 48rem)').matches;
				return ps.every((p) => Number(getComputedStyle(p).opacity) === (hoverable ? 0 : 1));
			}`
		},

		/* ---------------------------------------------------------------
		   AND THE HOVER ROUTE ITSELF, DRIVEN THROUGH `:focus-visible`.
		   CSS `:hover` cannot be forced from script, so what is driven is
		   the OTHER selector in the same rule -- keyboard focus, which is
		   a route a reader needs anyway. The declaration block is shared,
		   so a change that broke the hover reveal breaks this too.
		   --------------------------------------------------------------- */
		/* ---------------------------------------------------------------
		   CONTRAST, COMPOSITED, BECAUSE BOTH GROUNDS ARE GRADIENTS.

		   THE NAME PLATE is measured against the WORST GROUND IT CAN EVER
		   HAVE, which is not any fixture's picture: the scrim is a
		   translucent black over whatever the student uploaded, so the
		   hardest case is a PURE WHITE photograph under the thinnest part
		   of the scrim the text touches. Measuring it over one fixture
		   image would be measuring that image.

		   A GENERATED COVER has an opaque ground of its own, so its two
		   gradient stops are read and the text measured against both --
		   the gradient is fixed in lightness and only its hue moves, so
		   the pair stands for every app.
		   --------------------------------------------------------------- */
		{
			evaluate: `() => {
				const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
				const ratio = (a, b) => { const L1 = lum(a[0], a[1], a[2]), L2 = lum(b[0], b[1], b[2]); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
				const nums = (s) => (s.match(/-?\\d+(?:\\.\\d+)?/g) || []).map(Number);

				/* THE SCRIM'S STOPS ARE READ OFF THE PAGE, NEVER ASSUMED. An
				   earlier draft of this step carried the alpha as a literal, so
				   thinning the real scrim until the name failed changed nothing
				   it measured -- it was checking its own arithmetic. */
				const plate = document.querySelector('.fdy-card-name');
				const title = document.querySelector('.fdy-card-name-title');
				const img = getComputedStyle(plate).backgroundImage;
				const stops = (img.match(/rgba?\\([^)]*\\)\\s+[\\d.]+%/g) || []).map((piece) => {
					const n = nums(piece);
					return { rgb: [n[0], n[1], n[2]], a: n.length > 4 ? n[3] : 1, at: n[n.length - 1] / 100 };
				});
				/* \`to top\`, so 0% is the BOTTOM edge. The glyphs' own TOP edge is
				   the thinnest scrim any of them sits on, so that is where this
				   is taken. */
				const pr = plate.getBoundingClientRect(), tr = title.getBoundingClientRect();
				const at = Math.max(0, Math.min(1, (pr.bottom - tr.top) / pr.height));
				let lo = stops[0], hi = stops[stops.length - 1];
				for (let i = 0; i < stops.length - 1; i++) { if (at >= stops[i].at && at <= stops[i + 1].at) { lo = stops[i]; hi = stops[i + 1]; } }
				const t = hi.at === lo.at ? 0 : (at - lo.at) / (hi.at - lo.at);
				const alpha = lo.a + (hi.a - lo.a) * t;
				const scrim = lo.rgb;

				/* Over a PURE WHITE photograph: the worst ground a student can
				   ever put under this text. Measuring it over a fixture image
				   would be measuring that image. */
				const ink = nums(getComputedStyle(title).color).slice(0, 3);
				const ground = scrim.map((c, i) => c * alpha + 255 * (1 - alpha));
				const worst = ratio(ink, ground);

				/* A generated cover has an opaque ground of its own, so the text
				   is measured against both of its stops. The gradient is fixed
				   in lightness and only its hue moves, so the pair stands for
				   every app. */
				const made = document.querySelector('.fdy-card-made-name');
				const madeInk = nums(getComputedStyle(made).color).slice(0, 3);
				const madeStops = (getComputedStyle(made.parentElement).backgroundImage.match(/rgba?\\([^)]*\\)/g) || []).map((c) => nums(c).slice(0, 3));
				const madeRatios = madeStops.map((c) => ratio(madeInk, c));

				window.__fdyContrast = { worst, madeRatios, alpha };
				return 'plate name over a WHITE photo ' + worst.toFixed(2) + ':1 (scrim alpha ' + alpha.toFixed(2) + ' at the glyph top); generated-cover name on its stops ' + madeRatios.map((r) => r.toFixed(2) + ':1').join(', ');
			}`,
			until: `() => {
				const c = window.__fdyContrast;
				return !!c && c.worst >= 4.5 && c.madeRatios.length >= 2 && c.madeRatios.every((r) => r >= 4.5);
			}`
		},
		{
			evaluate: `() => {
				const card = document.querySelector('[data-testid="fdy-card"]:not(.made)');
				card.focus();
				const p = card.querySelector('[data-testid="fdy-card-name"]');
				/* Past the 180ms reveal before reading: the value at the instant
				   focus lands is the transition's start, not its answer. */
				return new Promise((r) => setTimeout(() => r('focused, plate opacity ' + getComputedStyle(p).opacity), 320));
			}`,
			until: `() => {
				const card = document.querySelector('[data-testid="fdy-card"]:not(.made)');
				const p = card && card.querySelector('[data-testid="fdy-card-name"]');
				return !!p && Number(getComputedStyle(p).opacity) === 1;
			}`
		}
	],
	/*
	   THE FIXTURE ASKS FOR A COVER THAT IS NOT THERE, ON PURPOSE. One app
	   exists to drive `[data-cover-failed]` -- the state where the request was
	   made and did not produce a picture -- so its 404 is the fixture working
	   and not a defect. Pinned to that exact path rather than to a shape, so a
	   404 on anything else is still a finding.
	*/
	ignoreConsole: [/\/dev\/foundry-mosaic\/cover\/does-not-exist/],
	presence: [
		{ selector: '.harness h1', label: 'page heading', expectPresent: 1 },
		{
			selector: '[data-testid="fdy-card"]',
			label: 'mosaic cards',
			expectPresent: 11,
			maxPresent: 11
		},
		/* Seven fixture covers request bytes; the eighth (`bad-key`) is refused
		   locally with no request, so it is a `<span>` and not an `<img>`. The
		   ceiling is the assertion as much as the floor. */
		{
			selector: 'img.fdy-card-shot',
			label: 'uploaded covers (8 of 11 apps: 7 real + 1 whose request fails)',
			expectPresent: 8,
			maxPresent: 8
		},
		/* Exactly the two apps with no `cover_path` at all. A third would mean
		   `made` had widened to swallow a failure state, which is the defect
		   that left an app's name nowhere on its card. */
		{
			selector: '.fdy-card-made',
			label: 'generated covers (the 2 apps with no cover)',
			expectPresent: 2,
			maxPresent: 2
		},
		{
			selector: '.fdy-card-made-name',
			label: 'generated covers paint the app name as their art',
			expectPresent: 2,
			maxPresent: 2
		},
		/* One per card that is NOT a generated cover: the nine with a cover
		   path, real or broken. Under `Recent` no count is rendered, so a
		   generated cover has no plate at all here. */
		/*
		   `expectVisible: 0` IS THE POINT OF THIS ROW, NOT A RELAXATION OF IT.
		   Nine plates are PRESENT at both widths; how many are VISIBLE is the
		   rule under test and differs by width by design -- all nine at 375,
		   none at 1440 until a hover or a focus. A visibility floor here would
		   redden at 1440 for the component being correct. What the plate does
		   at each width is asserted exactly, as a rule, by the `prepare` step
		   above, which reads `(hover: hover) and (min-width: 48rem)` itself.
		*/
		{
			selector: '[data-testid="fdy-card-name"]',
			label: 'name plates (present on the 9 non-generated cards at both widths)',
			expectPresent: 9,
			maxPresent: 9,
			expectVisible: 0
		},
		/* THE EXCLUSION: `Recent` is the default and no card shows a count.
		   Its positive control is the plate row above, on the same fixture. */
		{
			selector: '[data-testid="fdy-card-plays"]',
			label: 'play counts under Recent (none, deliberately)',
			expectPresent: 0,
			maxPresent: 0
		},
		/* THE CHROME IS GONE. Every one of these was a real element on this
		   card before this bundle. */
		{ selector: '.fdy-card-body', label: 'old chrome panel (gone)', expectPresent: 0, maxPresent: 0 },
		{ selector: '.fdy-card-blank', label: 'old letter tile (gone)', expectPresent: 0, maxPresent: 0 },
		{ selector: '.fdy-card-cover', label: 'old fixed 16:9 box (gone)', expectPresent: 0, maxPresent: 0 }
	],
	/*
	   THE TWO TEXTS ON THIS CARD SIT ON GRADIENTS, SO THE ORDINARY `contrast`
	   CHECK CANNOT MEASURE THEM AND MUST NOT BE ASKED TO.

	   Its ground-walk looks for an opaque `background-color` up the ancestor
	   chain. Neither of these has one: the name plate is a `background-image`
	   scrim over a student's photograph, and a generated cover is a
	   `background-image` gradient. Pointed at either, the check reports the
	   CARD'S BED -- measured during this bundle as a confident-looking 14.59:1
	   against `rgb(27, 23, 18)`, a colour that is behind both and painted over
	   by both. That is `CLAUDE.md`'s own warning about `color-mix` and
	   `color(srgb ...)` in a different costume: a number measured against the
	   plate instead of the real ground.

	   So both are measured in the `prepare` step below, by compositing the
	   real values and reading the ratio back. See it for what each is measured
	   against and why that case is the worst one.
	*/
	contrast: [],
	tapTargets: [
		/* The card is the tap target now, and it is the picture -- so this is
		   really a floor on how short the WIDEST permitted shape may render.
		   At the narrowest column the mosaic produces, a 2:1 card is about
		   125px tall, which is why the clamp's wide end is where it is. */
		{ selector: '[data-testid="fdy-card"]', label: 'gallery cards', min: 44 }
	]
};
