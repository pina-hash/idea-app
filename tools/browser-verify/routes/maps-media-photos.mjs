/**
 * /dev/maps-media/photos -- THE FOUR WAYS A MAP PHOTO CAN RENDER, and the
 * claim that NONE OF THEM MOVES THE COLUMN.
 *
 * WHY THIS SURFACE AND NOT `tests/dom/`. happy-dom has no layout engine and no
 * raster pipeline: `getBoundingClientRect()` answers 0x0 there and an `<img>`
 * never decodes, so a "the four boxes agree" assertion written in that project
 * would compare zero against zero and pass over a page that never laid out.
 * The DATABASE half of this bundle is measured in
 * `tests/maps-media-listing.test.ts` against a real Postgres; this is the half
 * that needs pixels.
 *
 * WHAT MAKES THE FOUR STATES DIFFERENT, AND WHY THE SPLIT IS WHERE IT IS:
 *
 *   present  the object answered with bytes that decode.
 *   absent   the thing has no photos. There is no photo region AT ALL -- not
 *            an empty one -- because a card with nothing to show should say
 *            nothing. This is most of the map.
 *   refused  `mapsPhotoUrl` answered EMPTY, which is the no-configured-project
 *            path. Judged in the browser with NO REQUEST MADE, which is what
 *            makes naming it free: it tells a stranger nothing, because
 *            nothing was asked.
 *   failed   the request WAS made and produced no picture. Several causes land
 *            here on purpose -- a swept object, a row naming bytes that are
 *            gone, and (if `/object/public/` turns out to consult RLS after
 *            0186) a photo this caller may not read. The page must not
 *            distinguish them: the split is between what the browser judged
 *            ALONE and what it had to ask about, never between the reasons the
 *            far end had.
 *
 * THE `failed` ROW IS THE ONE THAT NEEDS A WAIT, AND THE REASON IS THE ONE
 * THIS REPO KEEPS RE-LEARNING. `waitForApp` returns on DOM STABILITY, which
 * the server-rendered markup satisfies before hydration has attached anything
 * and long before a 404 has come back -- so a spec that measured immediately
 * would read the `<img>` it is about to leave and report the wrong frame. The
 * wait below keys on the tile the error handler produces, which only the error
 * handler can produce, and it is a MEASUREMENT: a page that never gets there
 * fails loudly rather than measuring the wrong thing quietly.
 *
 * THE `present` ROW IS A REAL NETWORK TURN ON LOOPBACK, not a data: URI. The
 * card builds its own src with the shipping `mapsPhotoUrl`, and
 * `src/routes/dev/maps-media/o/[...path]/+server.ts` answers the URL that
 * function produced. Nothing is substituted, so a change to how the URL is
 * built reddens here rather than being papered over by a fixture.
 */

const kase = (k) => `[data-case="${k}"]`;
const PRESENT = kase('present');
const ABSENT = kase('absent');
const REFUSED = kase('refused');
const FAILED = kase('failed');

export default {
	path: '/dev/maps-media/photos',
	label: 'IDEA Maps photo states: present, absent, refused, failed to load',
	prepare: [
		{
			label: 'the failed case has really errored, not merely rendered',
			waitFor:
				'() => !!document.querySelector(\'[data-case="failed"] [data-testid="maps-photo-failed"]\')'
		}
	],
	presence: [
		{ selector: '.harness h1', label: 'page heading', expectPresent: 1, maxPresent: 1 },
		/* THE POSITIVE CONTROL FOR EVERY ABSENCE ROW BELOW. Without it a page
		   that failed to render at all satisfies all of them and the geometry
		   probe compares nothing against nothing. */
		{
			selector: '[data-testid="maps-photo-cases"] > li',
			label: 'the four photo cases',
			expectPresent: 4,
			maxPresent: 4,
			expectVisible: 4
		},

		/* PRESENT: still an img, and neither out-tile. */
		{ selector: `${PRESENT} [data-testid="maps-photo"]`, label: 'present: a real picture', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: `${PRESENT} [data-testid="maps-photo-failed"]`, label: 'present: it did not error', expectPresent: 0 },
		{ selector: `${PRESENT} [data-testid="maps-photo-refused"]`, label: 'present: not the refused tile', expectPresent: 0 },

		/* ABSENT: no photo region of any kind. THE LIST ITSELF IS THE CLAIM --
		   a card with no photos must not render an empty gallery. */
		{ selector: `${ABSENT} [data-testid="maps-card-photos"]`, label: 'absent: no photo region at all', expectPresent: 0 },
		{ selector: `${ABSENT} [data-testid="maps-photo"]`, label: 'absent: no img', expectPresent: 0 },
		{ selector: `${ABSENT} [data-testid="maps-photo-refused"]`, label: 'absent: not the refused tile', expectPresent: 0 },
		{ selector: `${ABSENT} [data-testid="maps-photo-failed"]`, label: 'absent: not the failed tile', expectPresent: 0 },

		/* REFUSED: judged locally. THE `img` ABSENCE IS THE CLAIM -- it says no
		   request was made for a photo the client already knew it could not
		   address. */
		{ selector: `${REFUSED} [data-testid="maps-photo"]`, label: 'refused: NO REQUEST WAS MADE', expectPresent: 0 },
		{ selector: `${REFUSED} [data-testid="maps-photo-refused"]`, label: 'refused: its own tile', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: `${REFUSED} [data-testid="maps-photo-failed"]`, label: 'refused: NOT the failed tile -- a different fact', expectPresent: 0 },

		/* FAILED: the request was made and came back with nothing. */
		{ selector: `${FAILED} [data-testid="maps-photo-failed"]`, label: 'failed: its own tile', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: `${FAILED} [data-testid="maps-photo"]`, label: 'failed: the img is gone once it errored', expectPresent: 0 },
		{ selector: `${FAILED} [data-testid="maps-photo-refused"]`, label: 'failed: NOT the refused tile', expectPresent: 0 },

		/* THE CAPTION SURVIVES BOTH FAILURES. What the photo was OF is the one
		   thing still worth saying when the photo is not there, and it is the
		   half a placeholder is most likely to swallow. */
		{ selector: `${FAILED} .mv-photo-caption`, label: 'failed: the caption is still there', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: `${REFUSED} .mv-photo-caption`, label: 'refused: the caption is still there', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '.harness h1', label: 'h1 on the viewer plate', min: 4.5 },
		{ selector: '.lede', label: 'the lede copy', min: 4.5 },
		{ selector: '.legend b', label: 'the legend state names', min: 4.5, all: true },
		/* The two out-tiles carry WORDS, and colour is never the only signal,
		   so the words have to clear on the ground they are painted on. */
		{ selector: '.mv-photo-out', label: 'the words in both out-tiles', min: 4.5, all: true },
		{ selector: '.mv-photo-caption', label: 'every caption', min: 4.5, all: true }
	],
	orderResult: [
		{
			/* THE CLAIM THIS SPEC EXISTS FOR, and it is two claims in tension
			   measured in one probe:

			     1. NO STATE MOVES THE COLUMN. The four cards sit in one
			        `auto-fit` grid, so a photo failing must not change the
			        WIDTH of the cell it is in -- otherwise the map reflows
			        every time an object 404s, which nothing reports and which
			        just looks slightly wrong forever.
			     2. ALL FOUR ARE VISUALLY DISTINCT. A reader can tell a picture
			        from "nothing here" from "not available" from "did not
			        load".

			   HEIGHT IS DELIBERATELY NOT ASSERTED EQUAL, and saying so is the
			   honest part: a placeholder cannot know the height of the photo
			   that did not arrive, so the out-tiles carry a stated 4/3 guess
			   and a real photo carries its own ratio. What holds is the WIDTH
			   and the x position, which is what a column is.

			   IT COMPARES PAINT, NOT STRUCTURE. Keying on tag name or class
			   would make the row structurally true and visually vacuous -- the
			   two out-tiles are both `<span>` and would differ by nothing the
			   eye can use. So the key is `a picture / no picture` plus the
			   computed background, border style and border colour, read with
			   `getComputedStyle` so the answer is what the cascade actually
			   produced on this ground. */
			label: 'four states: same column, four appearances',
			evaluate:
				'() => { const look = (k) => { const li = document.querySelector(`[data-case="${k}"]`); if (!li) return { key: "MISSING:" + k }; const box = li.querySelector(\'[data-testid="maps-photo"], [data-testid="maps-photo-refused"], [data-testid="maps-photo-failed"]\'); const card = li.querySelector(".mv-card"); if (!card) return { key: "NOCARD:" + k }; const cr = card.getBoundingClientRect(); if (!box) return { key: "no photo region", card: Math.round(cr.width) }; const cs = getComputedStyle(box); const r = box.getBoundingClientRect(); const picture = box.tagName === "IMG" && box.naturalWidth > 0 ? "a picture" : "no picture"; return { key: [picture, cs.backgroundColor, cs.borderStyle, cs.borderColor].join("|"), box: Math.round(r.width), card: Math.round(cr.width) }; }; const all = ["present", "absent", "refused", "failed"].map(look); const bad = all.filter((a) => a.key.startsWith("MISSING:") || a.key.startsWith("NOCARD:")); if (bad.length) return ["A CASE DID NOT RENDER: " + bad.map((b) => b.key).join(", ")]; const keys = all.map((a) => a.key); const distinct = new Set(keys).size === 4; const cards = new Set(all.map((a) => a.card)); const boxes = new Set(all.filter((a) => a.box !== undefined).map((a) => a.box)); return [distinct ? "four distinct appearances" : "NOT DISTINCT: " + keys.join(" // "), cards.size === 1 ? "card width identical in all four" : "CARD WIDTH MOVES: " + [...cards].join(" / "), boxes.size === 1 ? "photo box width identical in all three that draw one" : "PHOTO BOX WIDTH MOVES: " + [...boxes].join(" / ")]; }',
			expected: [
				'four distinct appearances',
				'card width identical in all four',
				'photo box width identical in all three that draw one'
			]
		},
		{
			label: 'THE PRESENT CASE REALLY DECODED, AND ITS URL WAS BUILT BY mapsPhotoUrl',
			/* A `present` row that quietly failed would be indistinguishable
			   from `failed` on the row above once both are "no picture". This
			   reads `naturalWidth` (4, the fixture PNG) and the src SHAPE,
			   which is `mapsPhotoUrl`'s own output and nothing the harness
			   wrote by hand. */
			evaluate:
				'() => { const img = document.querySelector(\'[data-case="present"] [data-testid="maps-photo"]\'); if (!img) return ["no img"]; const u = new URL(img.src, location.href); return [img.naturalWidth > 0 ? "decoded" : "DID NOT DECODE", u.pathname.includes("/storage/v1/object/public/maps-media/") ? "mapsPhotoUrl shape" : "WRONG SHAPE: " + u.pathname]; }',
			expected: ['decoded', 'mapsPhotoUrl shape']
		}
	],
	textContains: [
		{
			selector: '[data-harness="maps-media-photos"]',
			label: 'the page says what each state means, so a number here is readable without the spec',
			must: ['no request was made', 'could not be loaded', 'not available']
		}
	],
	/* The `failed` case really requests an object the fixture route 404s, so
	   Chromium logs a failed resource load. That is the FIXTURE doing exactly
	   what it is there for, not a defect on the page. */
	ignoreConsole: ['Failed to load resource', '404']
};
