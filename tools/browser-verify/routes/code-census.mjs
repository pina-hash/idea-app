/**
 * THE LINES-OF-CODE BREAKDOWN PANEL, on a route with room to open it.
 *
 * WHY IT IS NOT MEASURED ON `/dev/home-order`, WHERE THE READOUT SHIPS: the
 * readout is HIDDEN below 768px. There is no width of chip that fits in the
 * signed-out banner at 375px -- the emblem is 104px, the actions row is 210px
 * and 343px of inner width less the 1rem gap leaves THIRTEEN PIXELS -- so
 * shipping one there costs a second row on a sticky header (measured 75.5px to
 * 115.1px on the real `/`). This pass runs every spec at 375 AND 1440, so on
 * the home harness there is nothing to open at one of the two widths.
 *
 * The home spec keeps the banner's questions: that the readout appears exactly
 * where there is room, that it costs the header nothing at either width, and
 * that a finger reaches it where it is shown. This one keeps the panel's.
 *
 * EVERY NUMBER ON SCREEN IS THE BUILD'S. `virtual:site-code` is produced by
 * `vite.config.ts` from `git ls-files` over this very tree, so the figures a
 * spec reads here are the figures that ship. NOTHING IN THIS FILE PINS ONE:
 * a count written down in a spec is a ratchet that goes red on the next commit
 * -- which is what `tests/spec-instructions-budget.test.ts` was deleted for --
 * so what is asserted is that the parts sum to the whole and that the two
 * renderings of the headline agree with each other.
 */
export default {
	path: '/dev/code-census',
	label: 'The lines-of-code breakdown panel, open',
	/* TWO THINGS ARRIVE AFTER THE PAGE PAINTS (report R10), and every row
	   below reads one of them. The chip COUNTS UP to its figure, and a read
	   taken mid-count is a different number from the summary's; `countUp`
	   marks the node `data-counting` exactly while it runs, which a
	   DOM-stability wait cannot see (the last 60% of the count changes digits
	   without changing the string's length). And the recent updates are the
	   REAL lazy changelog, whose line counts the dev server takes from
	   `git log --numstat` the first time the module is asked for -- about six
	   seconds on this tree -- so the wait is long and the row says why. */
	prepare: [
		{
			waitFor: '() => !!document.querySelector(".loc-value") && !document.querySelector("[data-counting]")',
			label: 'the chip has finished counting up to its figure',
			timeoutMs: 15_000
		},
		{
			waitFor:
				'() => document.querySelectorAll(".loc-panel .loc-upd").length > 0 || !!document.querySelector(\'.loc-panel [data-testid^="loc-upd-"]\')',
			label: 'the recent updates arrived (the build walks git log --numstat the first time, a few seconds)',
			timeoutMs: 90_000
		}
	],
	presence: [
		/* THE POSITIVE CONTROL for every row below, and for the whole of the
		   `census=empty` sibling: the harness page itself rendered. */
		{ selector: '.census-harness h1', label: 'the harness page rendered', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="counter-stage"] .loc-chip', label: 'the readout', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.loc-panel', label: 'the panel, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.loc-panel .loc-total', label: 'the four headline figures', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '.loc-panel .loc-axis', label: 'three breakdowns to choose from', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '.loc-panel .loc-row', label: 'one row per language', expectPresent: 8, expectVisible: 8 },
		{ selector: '.loc-panel .loc-bar', label: 'a bar beside every row', expectPresent: 8 },
		{ selector: '.loc-panel .loc-excluded li', label: 'one row per exclusion, each with its reason', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		/* THE REDESIGN (report R10): one headline figure, then sections that are
		   all spelled the same way. */
		{ selector: '.loc-panel .loc-hero-n', label: 'one headline figure', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.loc-panel .loc-sec-label', label: 'three section labels: updates, breakdown, not counted', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		/* EACH UPDATE WITH ITS OWN COUNT. Six is the panel's own limit; the tree
		   this runs on has far more than six code changes, so fewer would mean
		   the line counts went missing from the build. Every row carries two
		   signed figures, and the "could not count" and "failed" sentences are
		   ABSENT -- the positive half of the harness's `?updates=shallow` and
		   `?updates=fail` states. */
		{ selector: '.loc-panel .loc-upd', label: 'the six newest updates that changed the code', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '.loc-panel .loc-upd .loc-sign', label: 'a + and a minus glyph on every row', expectPresent: 12, maxPresent: 12, expectVisible: 12 },
		{ selector: '.loc-panel .loc-upd-cols', label: 'the column header over the figures', expectPresent: 1, maxPresent: 1 },
		{ selector: '.loc-panel [data-testid="loc-upd-uncounted"]', label: 'no "this build did not count" sentence on a full clone', expectPresent: 0 },
		{ selector: '.loc-panel [data-testid="loc-upd-failed"]', label: 'no failed-load sentence', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.loc-panel .loc-summary', label: 'the summary sentence', min: 4.5 },
		{ selector: '.loc-panel .loc-total-v', label: 'a headline figure', min: 4.5 },
		{ selector: '.loc-panel .loc-total-l', label: 'its label (4.24:1 on --bg2 before the call site moved off --dim)', min: 4.5 },
		{ selector: '.loc-panel .loc-row-label', label: 'a language name', min: 4.5 },
		{ selector: '.loc-panel .loc-row-n', label: 'its line count', min: 4.5 },
		{ selector: '.loc-panel .loc-row-pct', label: 'its share of the total', min: 4.5 },
		{ selector: '.loc-panel .loc-row-sub', label: 'the code/comment/files line under it', min: 4.5 },
		{ selector: '.loc-panel .loc-axis-head', label: 'an axis heading', min: 4.5 },
		{ selector: '.loc-panel .loc-ex-label', label: 'an excluded set', min: 4.5 },
		{ selector: '.loc-panel .loc-ex-why', label: 'why it is excluded', min: 4.5 },
		{ selector: '.loc-panel .loc-foot', label: 'the footnote', min: 4.5 },
		{ selector: '.loc-panel .loc-hero-n', label: 'the headline figure', min: 4.5 },
		{ selector: '.loc-panel .loc-hero-l', label: 'its "lines" label', min: 4.5 },
		{ selector: '.loc-panel .loc-sec-label', label: 'a section label', min: 4.5 },
		{ selector: '.loc-panel .loc-note', label: 'the line under a section label', min: 4.5 },
		{ selector: '.loc-panel .loc-upd-cols span', label: 'the Added / Removed column header', min: 4.5 },
		{ selector: '.loc-panel .loc-upd-note', label: 'an update\'s subject', min: 4.5 },
		{ selector: '.loc-panel .loc-upd-date', label: 'its date', min: 4.5 },
		{ selector: '.loc-panel .loc-upd-add', label: 'lines added (green)', min: 4.5 },
		{ selector: '.loc-panel .loc-upd-del', label: 'lines removed (the warning ink, never crimson)', min: 4.5 },
		/* THE TWO FIGURES THAT WERE --gold AND TAKE --hover-ink NOW: brass on
		   the dark themes, green on Space White, never brown. */
		{ selector: '.loc-panel .loc-files', label: 'the Files figure (--hover-ink)', min: 4.5 },
		{ selector: '.loc-panel .loc-ex-n', label: 'an exclusion\'s line count (--hover-ink)', min: 4.5 },
		/* THE TWO BAR SEGMENTS ARE DELIBERATELY NOT MEASURED HERE, AND THE
		   ATTEMPT IS WORTH RECORDING. `contrast` measures a TEXT colour against
		   its ground; a bar has no text, so the check read the inherited
		   `--text-1` against the bar's own fill and reported 1.89:1 and 1.81:1
		   -- two true measurements of a question nobody is asking. The 3:1
		   non-text floor applies to a graphical object that CONVEYS something
		   not otherwise available, and this one conveys nothing: every row
		   writes out its line count, its percentage and its code/comment split
		   in words beside it, which is why the bar is `aria-hidden`. Colour is
		   never the only signal here because the bar is never a signal at all.
		   A row asserting a number the instrument cannot mean is worse than no
		   row. */
	],
	tapTargets: [
		{ selector: '.loc-panel button', label: 'every control inside the panel', min: 44 }
	],
	/* THE READOUT'S 44px REACH IS MEASURED ON `/dev/home-order`, NOT HERE, and
	   the attempt here failed for a reason that is about this harness rather
	   than about the control: the panel is open on this route by design, it is
	   `position: fixed` once `anchored` places it, and at 375px it flips ABOVE
	   the chip and covers it -- `tap-reach` reported 88x42 "blocked by
	   div#loc-panel". In the banner the panel opens BELOW, where there is room.
	   The home spec's hit-test probe walks the stack at the chip's own centre
	   with the panel closed, which is the state a finger meets. */
	textContains: [
		{
			selector: '.loc-panel',
			label: 'the panel states what is counted and what is not',
			must: ['lines across', 'Code', 'Comment', 'Blank', 'Files', 'Not counted', 'tracked in git', 'Recent updates', 'Added', 'Removed'],
			/* A HAND-WRITTEN FIGURE IS THE THING THIS REPLACES. `35,000+` is the
			   deck's hardcoded one, which must never appear on a surface
			   claiming to count this repository. */
			mustNot: ['35,000']
		}
	],
	orderResult: [
		{
			label: 'every axis accounts for the whole census',
			/* THE ARITHMETIC, READ OFF THE RENDERED PAGE rather than off the
			   module -- a renderer that dropped a row, or sorted into the wrong
			   bucket, would pass every unit test and fail here. The percentages
			   are floored per row, so the sum is checked with a tolerance of one
			   point per row rather than against 100 exactly. */
			/* THE VERDICT CARRIES NO FIGURE, and the first draft of this row did:
			   it expected "12 rows summing to 96%" and the tree answered 99% on
			   the next run, because both numbers move with the repository. That
			   is exactly the ratchet this file's own header warns about, made
			   by the file that warns about it. The answer is the same string
			   whatever the tree holds. */
			evaluate:
				'() => { const pcts = [...document.querySelectorAll(".loc-panel .loc-row-pct")].map((e) => Number(e.textContent.replace(/[^0-9]/g, ""))); if (pcts.length < 3) return ["TOO FEW ROWS: " + pcts.length]; const sum = pcts.reduce((a, b) => a + b, 0); return [sum <= 100 && sum >= 100 - pcts.length ? "every row accounted for, within per-row rounding" : "ROWS SUM TO " + sum + "% over " + pcts.length + " rows"]; }',
			expected: ['every row accounted for, within per-row rounding']
		},
		{
			label: 'the chip and the summary sentence are two renderings of one number',
			/* A HARDCODED FIGURE IN EITHER PLACE BREAKS THIS. They are produced
			   by different functions over the same census; group separators are
			   stripped because one uses a thin space. */
			evaluate:
				'() => { const chip = document.querySelector(".loc-value"); const sum = document.querySelector(".loc-summary"); if (!chip || !sum) return ["MISSING"]; const digits = (s) => (s.match(/[0-9\\u2009,]+/) || [""])[0].replace(/[^0-9]/g, ""); const a = digits(chip.textContent); const b = digits(sum.textContent); if (!a || a.length < 5) return ["IMPLAUSIBLE HEADLINE: " + chip.textContent.trim()]; return [a === b ? "chip and summary agree" : "DISAGREE: chip " + a + " vs summary " + b]; }',
			expected: ['chip and summary agree']
		},
		{
			label: 'the three axes are three different breakdowns, not one rendered three times',
			/* PRESSING AN AXIS MUST CHANGE THE ROWS. A control that renders as
			   pressed and shows the same table is the kind of defect that looks
			   completely ordinary: the labels are plausible either way. */
			/* IT AWAITS THE RE-RENDER, and the first draft did not: Svelte 5
			   batches a state change into a microtask, so reading the rows on
			   the line after `click()` reads the table as it was and answers
			   "ONLY 1 DISTINCT of 3" on a panel that is working perfectly. A
			   step that is wrong in the failing direction is the kinder half of
			   that trap; the same read taken against a BROKEN panel would have
			   been right by accident. */
			evaluate:
				'async () => { const rows = () => [...document.querySelectorAll(".loc-panel .loc-row-label")].map((e) => e.textContent.trim()).join("|"); const axes = [...document.querySelectorAll(".loc-panel .loc-axis")]; if (axes.length !== 3) return ["EXPECTED 3 AXES, FOUND " + axes.length]; const seen = []; for (const a of axes) { a.click(); await new Promise((r) => setTimeout(r, 120)); seen.push(rows()); } const distinct = new Set(seen).size; return [distinct === 3 ? "3 distinct breakdowns" : "ONLY " + distinct + " DISTINCT of 3, first " + seen[0].slice(0, 40)]; }',
			expected: ['3 distinct breakdowns']
		},
		{
			label: 'nothing but fixed furniture is past the right edge',
			evaluate:
				'() => { const d = document.documentElement; const underFixed = (e) => { for (let p = e; p; p = p.parentElement) { if (getComputedStyle(p).position === "fixed") return true; } return false; }; const stray = [...document.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().right > d.clientWidth + 0.5).filter((e) => !underFixed(e)); return [stray.length === 0 ? "fixed furniture only" : "PAST THE EDGE: " + stray.length + " node(s), first " + (stray[0].id ? "#" + stray[0].id : stray[0].tagName.toLowerCase() + "." + (stray[0].className || "").toString().split(" ")[0])]; }',
			expected: ['fixed furniture only']
		},
		{
			label: 'the panel fits the viewport and nothing inside it scrolls sideways',
			/* THE ROW ABOVE SKIPS THE PANEL, because `anchored` makes it fixed
			   furniture -- so its own fit is asserted here: inside the viewport
			   at both edges, and no horizontal overflow within it, which is
			   where a long update subject or a wide figure column would show up
			   first at 375 (report R10). */
			evaluate:
				'() => { const p = document.querySelector(".loc-panel"); if (!p) return ["NO PANEL"]; const r = p.getBoundingClientRect(); const vw = document.documentElement.clientWidth; const inside = r.left >= -0.5 && r.right <= vw + 0.5; const sideways = p.scrollWidth > p.clientWidth + 0.5; return [inside ? "inside the viewport" : "OUTSIDE: " + r.left.toFixed(1) + " to " + r.right.toFixed(1) + " in " + vw, sideways ? "SCROLLS SIDEWAYS: " + p.scrollWidth + " in " + p.clientWidth : "no sideways scroll"]; }',
			expected: ['inside the viewport', 'no sideways scroll']
		},
		{
			label: 'the added and removed figures line up down the list, each with its sign',
			/* PER-UPDATE COUNTS ALIGNED is the redesign's claim, and a column
			   that drifts by a row's own content is invisible in a screenshot at
			   a glance: every figure's RIGHT edge is read and must agree within
			   half a pixel, per column. The sign is read off the text, so a row
			   that lost its + or minus fails by name. */
			evaluate:
				'() => { const adds = [...document.querySelectorAll(".loc-panel .loc-upd-add")]; const dels = [...document.querySelectorAll(".loc-panel .loc-upd-del")]; if (adds.length < 2 || adds.length !== dels.length) return ["ROWS: " + adds.length + " added, " + dels.length + " removed"]; const spread = (els) => { const xs = els.map((e) => e.getBoundingClientRect().right); return Math.max(...xs) - Math.min(...xs); }; const signed = adds.every((e) => e.textContent.trim().startsWith("+")) && dels.every((e) => e.textContent.trim().startsWith("\\u2212")); return [spread(adds) <= 0.5 ? "added column aligned" : "ADDED DRIFTS " + spread(adds).toFixed(1) + "px", spread(dels) <= 0.5 ? "removed column aligned" : "REMOVED DRIFTS " + spread(dels).toFixed(1) + "px", signed ? "every figure signed" : "A FIGURE LOST ITS SIGN"]; }',
			expected: ['added column aligned', 'removed column aligned', 'every figure signed']
		},
		{
			label: 'the pop-up wears the plate: its face is the plate panel, not the page',
			/* THE PANEL LIST IN plate.css NAMES `.loc-panel` (report R10), and the
			   plate's panel radius is the one geometry a theme cannot move, so it
			   is the reading that says the rule reached the element. */
			evaluate:
				'() => { const p = document.querySelector(".loc-panel"); if (!p) return ["NO PANEL"]; const cs = getComputedStyle(p); return [cs.borderTopLeftRadius === "12px" ? "plate panel radius" : "RADIUS " + cs.borderTopLeftRadius, cs.backgroundImage.includes("gradient") ? "plate panel face" : "NO PLATE FACE: " + cs.backgroundImage.slice(0, 40)]; }',
			expected: ['plate panel radius', 'plate panel face']
		}
	]
};
