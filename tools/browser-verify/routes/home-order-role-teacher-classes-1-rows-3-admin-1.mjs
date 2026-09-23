import { SETTLE_ENTRANCE } from './_shared.mjs';

/**
 * THE LINES-OF-CODE READOUT IN THE HOME BANNER, measured in the banner it ships
 * in, plus the two coin cards' copy on the one fixture that renders both.
 *
 * `admin=1` is what makes this fixture the right one for the second half: it is
 * the only home state where the Coin Desk card renders at all, so it is the
 * only one where "does each coin card say which side of the ledger it is" can
 * be asked of both cards at once.
 *
 * THE BANNER'S QUESTION IS WHERE THE READOUT SITS, NOT WHAT IT OPENS. The
 * PANEL is measured on `/dev/code-census`, and that split is forced rather than
 * tidy: the readout is hidden below 768px, so at one of this pass's two widths
 * there is nothing here to open.
 *
 * WHY IT IS HIDDEN, MEASURED ON THE REAL SIGNED-OUT `/` RATHER THAN ON THIS
 * FIXTURE -- and the fixture is exactly why it had to be measured elsewhere.
 * Signed in with a class chip and a profile menu, `.header-right` is 316px and
 * the banner has ALREADY wrapped at 375px, so a readout on the logo's row costs
 * nothing and this harness reported a clean 125.5 -> 125.5. Signed out,
 * `.header-right` is 210px, the emblem is 104px, and 343px of inner width less
 * the 1rem gap leaves THIRTEEN PIXELS: the banner fits on ONE row without the
 * readout and on two with it, 75.5px to 115.1px, on a sticky header, on the
 * landing page. There is no width of chip that fits. Swept at 320, 360, 375,
 * 414, 480, 500, 600, 768, 769, 800, 900, 1024, 1280, 1440 and 1920 on both
 * fixtures after the gate: zero growth and zero horizontal overflow at every
 * one.
 *
 * THE FIRST PLACEMENT FAILED THIS TOO, and differently: in `.header-right`, at
 * 375px on the signed-in fixture, a 116px chip pushed `.auth-block` onto a
 * third row and took the header from 125.5px to 158.7px.
 *
 * THE PANEL IS OPENED BY SCRIPT HERE, AND THE REASON IS THE HARNESS RATHER THAN
 * THE PAGE. `/dev/home-order` mounts the real home page under a `position:
 * fixed` strip at `z-index: 9999`, which at 375px is 64.4px tall and covers the
 * banner's whole first row. A real pointer click lands on the strip. The strip
 * does not exist on `/`, so the CLICKABILITY claim is made separately by the
 * hit-test probe below, which walks the stack at the chip's own centre and
 * skips anything inside the strip -- the same shape `routes/coins.mjs` uses to
 * look past its injected modal.
 */
export default {
	path: '/dev/home-order?role=teacher&classes=1&rows=3&admin=1',
	label: 'Home banner: the lines-of-code readout, and both coin cards',
	prepare: [
		{ evaluate: SETTLE_ENTRANCE, waitMs: 150 },
		{
			/* THE HEADER'S HEIGHT WITH AND WITHOUT THE READOUT, printed. An
			   `evaluate` step's return value is the only raw number this report
			   format carries, and this is the number report 12's constraint is
			   about. The `orderResult` row further down is the verdict; this is
			   the measurement behind it. */
			evaluate:
				'() => { const head = document.querySelector(".legacy-index header"); const wrap = document.querySelector(".loc"); if (!head) return "NO HEADER"; if (!wrap) return "NO READOUT IN THE MARKUP"; const shown = getComputedStyle(wrap).display !== "none"; const before = head.getBoundingClientRect().height; const parent = wrap.parentElement; const next = wrap.nextSibling; wrap.remove(); void document.body.offsetHeight; const without = head.getBoundingClientRect().height; parent.insertBefore(wrap, next); void document.body.offsetHeight; const after = head.getBoundingClientRect().height; return window.innerWidth + "px: readout " + (shown ? "SHOWN" : "hidden") + "; header " + without.toFixed(2) + "px without it, " + before.toFixed(2) + "px with it, " + after.toFixed(2) + "px restored"; }'
		},
		{
			/* THE ROOMY VIEW, because COMPACT IS THE DEFAULT and a compact card
			   renders no `.app-sub` at all -- the two coin cards' copy, which is
			   the whole of this bundle's answer to report 16, is simply not on
			   screen until somebody presses this. That is worth knowing on its
			   own: the disambiguating sentence is one press away from the
			   default view, and the CTA verb (View live / Log) is the half that
			   is always visible. The predicate names the `.app-sub` the click
			   produces, which does not exist at rest. */
			click: '.launcher-actions .bar-btn',
			until: '() => document.querySelectorAll(".app-card .app-sub").length > 0',
			attempts: 6,
			waitMs: 200
		}
	],
	presence: [
		/* THE POSITIVE CONTROL for every row below: the page rendered its
		   launcher. Without it a page that failed to render would pass the
		   absence halves. */
		{ selector: '.launcher .app-card', label: 'the launcher rendered', expectPresent: 13, expectVisible: 13 },
		/* PRESENT AT BOTH WIDTHS, VISIBLE AT NEITHER OR ONE -- the width gate is
		   `display: none`, so the markup is always here and the `orderResult`
		   row below is what asserts WHEN it paints. `expectVisible: 0` is a
		   FLOOR of zero, which asserts nothing about visibility on purpose --
		   it is 0 at 375 and 1 at 1440, and the gate row is where that rule
		   lives. Omitting the field entirely is NOT the same thing: it defaults
		   to `expectPresent`, so a present-only row silently demands a visible
		   one and reddens at the width where the gate is doing its job. */
		{ selector: '.legacy-index header .loc-chip', label: 'the readout is in the banner markup, exactly one', expectPresent: 1, maxPresent: 1, expectVisible: 0 },
		{ selector: '.legacy-index .header-left .loc', label: 'it rides the logo row, not the actions row', expectPresent: 1, maxPresent: 1, expectVisible: 0 },
		{ selector: '.legacy-index .header-right .loc', label: 'and is NOT in the actions row (where it grew the banner by 33px)', expectPresent: 0 },
		/* THE HOVER READOUT IS NOT ON SCREEN AT REST, and it must not be: it is
		   a peek, and a peek that is always there is a second permanent line in
		   the banner. Its content is the panel's first line anyway. */
		{ selector: '.loc-peek', label: 'no hover readout until something hovers', expectPresent: 0 },
		/* AND THE PANEL IS NOT OPEN UNTIL SOMEBODY OPENS IT. */
		{ selector: '.loc-panel', label: 'the breakdown is closed at rest', expectPresent: 0 },
		{ selector: '.app-card[data-app="coins"]', label: 'the public Ledger card', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.app-card[data-app="coin-desk"]', label: 'the admin Coin Desk card', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		/* THE CHIP ONLY WHERE IT PAINTS. `contrast` reports the WORST match and
		   skips what is not rendered, so at 375 this row reads "no match",
		   which is the honest answer for a gated control and is why the gate
		   itself is asserted by the `orderResult` row rather than by this one. */
		{ selector: '.legacy-index header .loc-value', label: 'the number in the banner', min: 4.5 },
		{ selector: '.legacy-index header .loc-key', label: 'its LOC label', min: 4.5 },
		/* THE TWO COIN CARDS' OWN COPY, on the one fixture that renders both. */
		{ selector: '.app-card[data-app="coins"] .app-sub', label: 'the Ledger card copy', min: 4.5 },
		{ selector: '.app-card[data-app="coin-desk"] .app-sub', label: 'the Coin Desk card copy', min: 4.5 }
	],
	textContains: [
		{
			selector: '.app-card[data-app="coins"]',
			label: 'the Ledger card says it is the reading side',
			must: ['Where everyone reads the coins', 'Nothing here changes a balance'],
			mustNot: ['(0070)']
		},
		{
			selector: '.app-card[data-app="coin-desk"]',
			label: 'the Coin Desk card says it is the writing side, and names the Ledger',
			must: ['Where staff write the coins', 'IDEA Coin Ledger', 'Log'],
			mustNot: ['(0070)']
		}
	],
	orderResult: [
		{
			label: 'the readout is shown exactly where the banner has room for it',
			/* THE GATE, ASSERTED AS A RULE RATHER THAN AS A WIDTH, so it answers
			   the same string at 375 (hidden) and 1440 (shown) -- which is what
			   an `orderResult` requires, and is also the honest claim: the
			   readout must appear if and only if the banner is past the wrap
			   breakpoint. A gate that stopped firing, or one that started
			   hiding the readout everywhere, both fail this row by name. */
			evaluate:
				'() => { const wrap = document.querySelector(".loc"); if (!wrap) return ["NO READOUT IN THE MARKUP"]; const shown = getComputedStyle(wrap).display !== "none"; const roomy = window.innerWidth > 768; return [shown === roomy ? "matches the breakpoint" : (shown ? "SHOWN AT " + window.innerWidth + "px, where the banner wraps" : "HIDDEN AT " + window.innerWidth + "px, where there is room")]; }',
			expected: ['matches the breakpoint']
		},
		{
			label: 'the readout costs the banner nothing, at this width',
			/* THE VERDICT BEHIND THE MEASUREMENT PRINTED IN `prepare` ABOVE. It
			   has to answer the SAME string at both widths, so it COMPARES
			   rather than naming a height: 75.5 at 375 (where the readout is
			   hidden and removing it changes nothing) and 64 at 1440 are both
			   "identical". A tenth of a pixel of slack, because a sub-pixel
			   difference in a flex row is not a row anybody gained.

			   THIS ROW PASSED ON A BANNER THAT WAS GROWING 39.6px, WHICH IS WHY
			   THE SIGNED-OUT SWEEP IS IN THE PROSE ABOVE AND NOT ONLY HERE:
			   this fixture is signed in with a class chip, so its banner has
			   already wrapped at 375 and a readout on the logo's row is free.
			   The measurement that found the growth was taken on the real `/`. */
			evaluate:
				'() => { const head = document.querySelector(".legacy-index header"); const wrap = document.querySelector(".loc"); if (!head || !wrap) return ["MISSING"]; const withIt = head.getBoundingClientRect().height; const parent = wrap.parentElement; const next = wrap.nextSibling; wrap.remove(); void document.body.offsetHeight; const without = head.getBoundingClientRect().height; parent.insertBefore(wrap, next); void document.body.offsetHeight; const grew = withIt - without; return [Math.abs(grew) < 0.1 ? "identical" : "GREW BY " + grew.toFixed(2) + "px (" + without.toFixed(2) + " -> " + withIt.toFixed(2) + ")"]; }',
			expected: ['identical']
		},
		{
			label: 'a finger reaches the readout wherever it is shown',
			/* THE CLICKABILITY CLAIM, MADE SEPARATELY BECAUSE THE HARNESS COVERS
			   THE CHIP. The stack at the chip's centre is walked and anything
			   inside `/dev/home-order`'s own fixed strip is skipped -- that
			   strip is 64.4px tall at 375 and does not exist on `/`. Anything
			   ELSE on top still fails, by name. The reach itself comes from
			   `.tap-reach-44`, so the box stays 23.6px tall and the hit area is
			   44px: a pseudo-element is hit-tested as its button, which is what
			   makes a point 18px below the painted box answer the chip.

			   It folds the hidden case into the same answer, because the row
			   above already asserts WHEN it is hidden and this one must return
			   the same array at both widths. */
			evaluate:
				'() => { const chip = document.querySelector(".loc-chip"); if (!chip) return ["NO READOUT"]; const wrap = chip.closest(".loc"); if (getComputedStyle(wrap).display === "none") return ["reachable wherever it is shown"]; const strip = document.querySelector(".harness-strip"); const r = chip.getBoundingClientRect(); const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + r.width / 2, r.top + r.height / 2 - 18], [r.left + r.width / 2, r.top + r.height / 2 + 18]]; const bad = pts.filter(([x, y]) => { const stack = document.elementsFromPoint(x, y); const top = stack.find((e) => !(strip && (e === strip || strip.contains(e)))); return !(top === chip || chip.contains(top)); }); return [bad.length === 0 ? "reachable wherever it is shown" : "COVERED at " + bad.length + "/3 points"]; }',
			expected: ['reachable wherever it is shown']
		},
		{
			label: 'the number in the banner is the one the build derived, not a literal',
			/* THE POINT OF THE WHOLE FEATURE, asserted against the census the
			   page was handed rather than against a figure written here -- a
			   number in this file would be a ratchet, red on the next commit.
			   The chip's digits must be a plausible line count and must not be
			   the deck's hardcoded 35,000. Folded to one answer at both widths
			   because the chip does not paint at 375. */
			evaluate:
				'() => { const wrap = document.querySelector(".loc"); if (!wrap) return ["NO READOUT"]; if (getComputedStyle(wrap).display === "none") return ["a derived figure wherever it is shown"]; const chip = document.querySelector(".loc-value"); if (!chip) return ["NO VALUE"]; const n = Number(chip.textContent.replace(/[^0-9]/g, "")); if (!Number.isFinite(n) || n < 10000) return ["IMPLAUSIBLE: " + chip.textContent.trim()]; if (n === 35000) return ["THE HARDCODED DECK FIGURE"]; return ["a derived figure wherever it is shown"]; }',
			expected: ['a derived figure wherever it is shown']
		},
		{
			label: 'both coin cards are on the grid, with both ids intact',
			/* A MERGED TILE WOULD DELETE ONE OF THESE, and with it every admin's
			   pin, dragged position and usage count for that id. */
			evaluate:
				'() => { const ids = [...document.querySelectorAll(".app-card")].map((c) => c.dataset.app); const coins = ids.filter((i) => i === "coins").length; const desk = ids.filter((i) => i === "coin-desk").length; return [coins + " ledger, " + desk + " desk"]; }',
			expected: ['1 ledger, 1 desk']
		},
		{
			label: 'the two coin cards offer different verbs',
			evaluate:
				'() => { const cta = (id) => { const c = document.querySelector(\'.app-card[data-app="\' + id + \'"] .app-cta\'); return c ? c.textContent.replace(/[^A-Za-z ]/g, "").trim() : "MISSING"; }; const a = cta("coins"); const b = cta("coin-desk"); return [a === b ? "SAME VERB: " + a : a + " / " + b]; }',
			expected: ['View live / Log']
		}
	]
};
