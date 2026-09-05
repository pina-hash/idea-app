/**
 * /dev/foundry-covers -- THE FOUR WAYS A COVER CAN RENDER, and the claim that
 * NONE OF THEM MOVES THE ROW.
 *
 * `0182_foundry_covers_private.sql` stops
 * `/storage/v1/object/public/foundry-covers/<key>` answering, so every Foundry
 * surface asks `/api/foundry-cover/<key>` instead. The failure that produces
 * is not a broken picture, which somebody would notice -- it is a gallery
 * whose cards change height depending on whether each cover happens to
 * resolve, so a list reflows every time an object 404s or a session expires.
 * Nothing reports that; it just looks slightly wrong forever.
 *
 * SO THE LOAD-BEARING ROW IS THE `orderResult` GEOMETRY PROBE, not the
 * presence counts. `horizontal-scroll` and `contrast` cannot see a height
 * difference between two cards, and `tapTargets` measures a control rather
 * than a row -- so the four card boxes are read directly and compared to each
 * other, which is the only thing that answers the question.
 *
 * THE FOUR STATES, AND WHY THREE OF THEM ARE DISTINCT AND TWO COLLAPSE:
 *
 *   present   a key, bytes arrive. The picture.
 *   absent    `cover_path` null. Always had its own rendering.
 *   refused   the stored value is NOT A KEY. `foundryCoverUrl` answers null in
 *             the browser with NO REQUEST MADE, so naming this case costs no
 *             information at all.
 *   failed    the request WAS made and produced no picture -- the server
 *             refused it, OR the bytes did not decode. Those two are ONE
 *             rendering on purpose, because `/api/foundry-cover` answers
 *             identically to both: a 403 on one key and a 404 on another is an
 *             oracle for which scraped keys are still live. The split here is
 *             between what the browser judged ALONE and what it had to ask
 *             about, never between the reasons the server had.
 *
 * THE `failed` ROW IS THE ONE THAT NEEDS A WAIT. `onerror` fires after a
 * network turn, and `waitForApp` returns on DOM STABILITY, which the
 * server-rendered markup satisfies long before that -- so without the
 * `prepare` step below the run reads an `<img>` that has not failed YET and
 * reports the state it is about to leave. The wait is a MEASUREMENT, so a page
 * that never gets there fails loudly rather than measuring the wrong frame.
 *
 * NO ROW HERE COVERS THE MINT. The route needs a session and a real bucket,
 * neither of which a dev harness has, so `present` resolves to a data: URI and
 * the handler is driven as the real handler in `tests/foundry-cover-url.test.ts`
 * instead. Said out loud so a green run here is not read as coverage of the
 * signed URL.
 */

/** The four cards, in fixture order. One selector builder, not four literals. */
const card = (n) => `.fdy-cards li:nth-child(${n})`;
const PRESENT = card(1);
const ABSENT = card(2);
const REFUSED = card(3);
const FAILED = card(4);

export default {
	path: '/dev/foundry-covers',
	label: 'Foundry cover states: present, absent, refused, failed to load',
	prepare: [
		{
			/* The `failed` card's `<img>` must have ERRORED before anything is
			   measured. Written against the attribute `foundryCoverFailed`
			   stamps, which only the error handler can produce -- a wait on the
			   element merely existing would be satisfied at rest and would
			   short-circuit to the wrong frame. */
			waitFor:
				'() => !!document.querySelector(".fdy-cards li:nth-child(4) img[data-cover-failed]")'
		}
	],
	presence: [
		{ selector: '.harness h1', label: 'page heading', expectPresent: 1, maxPresent: 1 },
		/* THE POSITIVE CONTROL FOR EVERY ROW BELOW. Without it a page that
		   failed to render at all would satisfy the absence rows and the
		   geometry probe would compare nothing against nothing. */
		{ selector: '.fdy-cards li', label: 'the four cover cases', expectPresent: 4, maxPresent: 4 },

		/* PRESENT: an img that is still an img, carrying no failure stamp. */
		{ selector: `${PRESENT} img`, label: 'present: a real picture', expectPresent: 1, maxPresent: 1 },
		{ selector: `${PRESENT} img[data-cover-failed]`, label: 'present: it did not error', expectPresent: 0 },
		{ selector: `${PRESENT} .fg-cover-bad`, label: 'present: not the not-a-key marker', expectPresent: 0 },

		/* ABSENT: the pre-existing empty tile. No img was ever built, so no
		   request was made for an app that simply has no cover. */
		{ selector: `${ABSENT} img`, label: 'absent: no img at all', expectPresent: 0 },
		{ selector: `${ABSENT} .fdy-card-nocover`, label: 'absent: the empty tile', expectPresent: 1, maxPresent: 1 },
		{ selector: `${ABSENT} .fg-cover-bad`, label: 'absent: not the not-a-key marker', expectPresent: 0 },

		/* REFUSED: judged locally. THE `img` ABSENCE IS THE CLAIM -- it says no
		   request was made for a value the client already knew was not a key,
		   which is what makes naming this state free of any oracle. */
		{ selector: `${REFUSED} img`, label: 'refused: NO REQUEST WAS MADE', expectPresent: 0 },
		{ selector: `${REFUSED} .fg-cover-bad`, label: 'refused: its own marker', expectPresent: 1, maxPresent: 1 },
		{ selector: `${REFUSED} .fdy-card-nocover`, label: 'refused: not the empty tile', expectPresent: 0 },

		/* FAILED: the request WAS made -- the img is still in the DOM, stamped.
		   It is deliberately NOT swapped for a different element, because the
		   stamp is what the `prepare` wait keys on and because the box must not
		   change. */
		{ selector: `${FAILED} img[data-cover-failed]`, label: 'failed: the img errored and was stamped', expectPresent: 1, maxPresent: 1 },
		{ selector: `${FAILED} .fg-cover-bad`, label: 'failed: NOT the not-a-key marker -- a different fact', expectPresent: 0 },
		{ selector: `${FAILED} .fdy-card-nocover`, label: 'failed: not the empty tile either', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.harness h1', label: 'h1 on the forge plate', min: 4.5 },
		{ selector: '.lede', label: 'the lede copy', min: 4.5 },
		{ selector: '.legend b', label: 'the legend state names', min: 4.5, all: true },
		/* The card titles are the words beside each state, and colour is never
		   the only signal -- so they have to clear on the same ground. */
		{ selector: '.fdy-cards .fdy-card-title', label: 'every card title', min: 4.5, all: true }
	],
	orderResult: [
		{
			/* THE CLAIM THIS SPEC EXISTS FOR, and it is two claims measured in
			   one probe because they are in tension:

			     1. NO STATE MOVES THE ROW. All four cover boxes are the same
			        size and all four cards are the same height, so a gallery
			        does not reflow as covers resolve or fail.
			     2. ALL FOUR ARE VISUALLY DISTINCT. A reader can tell "no cover"
			        from "that is not a key" from "it did not arrive" -- three
			        different facts, plus the picture itself.

			   IT COMPARES PAINT AND NOTHING ELSE, AND THE FIRST DRAFT DID NOT.
			   That draft included the element's TAG NAME and CLASS in the key,
			   which made the row structurally true and visually vacuous: the
			   `refused` marker is a `<span>` and the `failed` one is an
			   `<img>`, so they differed by tag whatever they painted. Measured
			   by mutation -- collapsing `.fg-cover-bad`'s fill onto
			   `[data-cover-failed]`'s, so the two really did paint the same --
			   and the row STAYED GREEN. A check that cannot fail is not a
			   check, so the key is now `a picture / no picture` (an `<img>`
			   with a decoded `naturalWidth`), the computed background-image,
			   background-color, border-style and border-color: the list of
			   things a person looking at the screen could actually tell apart,
			   and nothing a serializer or a scope hash can move.

			   `getComputedStyle` IS READ RATHER THAN THE STYLESHEET, so the
			   answer is what the cascade actually produced on this element on
			   this ground -- the room's rules are global (`forge.css`) and a
			   scoped rule in the component could beat them. */
			label: 'four states: same box, four appearances',
			evaluate:
				'() => { const look = (n) => { const li = document.querySelector(`.fdy-cards li:nth-child(${n})`); if (!li) return { key: "MISSING:" + n }; const box = li.querySelector(".fdy-card-cover"); if (!box) return { key: "NOBOX:" + n }; const cs = getComputedStyle(box); const r = box.getBoundingClientRect(); const cr = li.getBoundingClientRect(); const picture = box.tagName === "IMG" && box.naturalWidth > 0 ? "a picture" : "no picture"; return { key: [picture, cs.backgroundImage === "none" ? "no-bg-image" : cs.backgroundImage.slice(0, 60), cs.backgroundColor, cs.borderStyle, cs.borderColor].join("|"), box: Math.round(r.width) + "x" + Math.round(r.height), card: Math.round(cr.width) + "x" + Math.round(cr.height) }; }; const all = [1, 2, 3, 4].map(look); const bad = all.filter((a) => a.key.startsWith("MISSING:") || a.key.startsWith("NOBOX:")); if (bad.length) return ["A CASE DID NOT RENDER: " + bad.map((b) => b.key).join(", ")]; const keys = all.map((a) => a.key); const distinct = new Set(keys).size === 4; const boxes = new Set(all.map((a) => a.box)); const cards = new Set(all.map((a) => a.card)); return [distinct ? "four distinct appearances" : "NOT DISTINCT: " + keys.join(" // "), boxes.size === 1 ? "cover box identical in all four" : "COVER BOX MOVES: " + [...boxes].join(" / "), cards.size === 1 ? "card box identical in all four" : "CARD BOX MOVES: " + [...cards].join(" / ")]; }',

			/* THREE VERDICTS RATHER THAN THREE PIXEL FIGURES, and that is the
			   difference between a claim and a ratchet. What matters is that
			   the four AGREE; the specific number is a function of the card's
			   padding and of the viewport, so pinning it would redden the next
			   time somebody changes a margin for an unrelated reason and the
			   fix offered each time would be to write down the new number.
			   The measured sizes appear in `measured` on the failing side,
			   which is the side that needs them. */
			expected: [
				'four distinct appearances',
				'cover box identical in all four',
				'card box identical in all four'
			]
		}
	],
	/* The `failed` case really requests a data: URI that is not an image, so
	   Chromium logs a decode failure. That is the FIXTURE doing exactly what it
	   is there for, not a defect on the page. */
	ignoreConsole: ['Failed to load resource', 'net::ERR_INVALID_URL', 'data:image/png']
};
