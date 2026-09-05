/**
 * /dev/avatars -- the claim that a FACE DOES NOT MOVE A ROW.
 *
 * This bundle puts an avatar beside a student's name on staff surfaces. The
 * failure it can produce is not a broken picture, which somebody would notice
 * -- it is a roster whose rows change height depending on whether each
 * person's image happens to load, so a class list reflows every time an object
 * 404s. Nothing reports that; it just looks slightly wrong forever.
 *
 * SO THE LOAD-BEARING ROWS HERE ARE THE `orderResult` PROBES, not the presence
 * counts. `horizontal-scroll` and `contrast` cannot see a height difference
 * between two rows, and `tapTargets` measures a control rather than a row --
 * so the row geometry is read directly and compared case against case, which
 * is the only thing that answers the question.
 *
 * WHY THE FIXTURE IS FABRICATED END TO END, said here because it is a privacy
 * decision rather than a convenience: every real surface this bundle touches
 * is staff-gated precisely because it renders a minor's face, and `/dev` has
 * no guard. The "uploaded" avatar is a data: URI and the "broken" one is a
 * path that resolves to nothing, so this page holds no real person and makes
 * no request.
 *
 * THE EIGHT TINTS ARE MEASURED HERE AND NOWHERE ELSE. `$lib/avatars.ts` picks
 * an initials colour per person from a pinned set, and the set was chosen at
 * one lightness precisely so it could be cleared as a set -- `contrast` with
 * `all: true` reports the WORST of the eight against the real rendered ground,
 * which is the assertion that says so.
 */
export default {
	path: '/dev/avatars',
	/* THE PAGE IS NOW THREE REAL `GradingConsole`s, three real `SectionGrid`s
	   and four `EntryReview` panels, and two of those consoles load their
	   roster through an async transport. `waitForApp` returns on DOM
	   STABILITY, which the server-rendered shell satisfies before any of that
	   has happened -- so without this the 375 run measured 0 grading rows and
	   read a broken image that had simply not fired `onerror` yet. Both
	   conditions are waited for together, and the wait is REPORTED, so a page
	   that never got there fails loudly instead of measuring an empty shell. */
	prepare: [
		{
			waitFor:
				'() => document.querySelectorAll("[data-testid=\\"gc-case\\"] .roster-row").length === 18 && document.querySelectorAll("img[src$=\\"gone.png\\"], img[src$=\\"this-object-does-not-exist.png\\"]").length === 0'
		}
	],
	label: 'Avatar cases: no picture, a broken picture, a long name',
	presence: [
		{ selector: '.harness h1', label: 'page heading', expectPresent: 1 },
		/* THE POSITIVE CONTROL FOR EVERY ROW BELOW. Without it a page that
		   failed to render at all would satisfy the absence rows and the
		   geometry probes would compare nothing against nothing. */
		{ selector: '[data-testid="avatar-row"]', label: 'the six roster cases', expectPresent: 6, maxPresent: 6 },
		{ selector: '[data-testid="avatar-tint"]', label: 'one sample per tint (a key per BUCKET, searched)', expectPresent: 8, maxPresent: 8 },
		{ selector: '[data-testid="avatar-parity-row"]', label: 'the five parity rows (identical text)', expectPresent: 5, maxPresent: 5 },
		/* The picture that LOADS, and the preset glyph: the two states that
		   must still be a picture rather than a tile. One img is the data: URI
		   (the broken one has swapped to a tile by the time this reads). */
		{ selector: '[data-case="loads"] img', label: 'the avatar that loads is an img', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-case="preset"] svg path', label: 'the chosen preset is a glyph', expectPresent: 1, maxPresent: 1 },
		/* THE BROKEN ONE MUST NOT STILL BE AN IMG. This is the row that says
		   `onerror` fired in a REAL browser rather than in happy-dom, where
		   the mount test dispatches the event by hand. */
		{ selector: '[data-case="broken"] img', label: 'the broken avatar left no img behind', expectPresent: 0 },
		{ selector: '[data-case="broken"] .initials', label: 'the broken avatar became a tile', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-case="none"] .initials', label: 'no picture is a tile', expectPresent: 1, maxPresent: 1 },
		/* ---------------------------------------------------------------
		   PROMPT 0038: THE REAL SURFACES. Everything above measures the
		   COMPONENT; these measure what the grid does with it, which is a
		   different question and the one the density contract turns on.
		   --------------------------------------------------------------- */
		{ selector: '[data-testid="grid-case"]', label: 'the three SectionGrid payloads', expectPresent: 3, maxPresent: 3 },
		{ selector: '[data-testid="panel-case"]', label: 'the four EntryReview headers', expectPresent: 4, maxPresent: 4 },
		/* SIX ROWS PER GRID, EIGHTEEN IN ALL: the positive control that says
		   the real component rendered its roster rather than an empty table,
		   which every height probe below would otherwise compare against
		   nothing. */
		{ selector: '[data-testid="grid-case"] tbody tr', label: 'six roster rows in each of the three grids', expectPresent: 18, maxPresent: 18 },
		{ selector: '[data-testid="grid-case"] tbody .avatar', label: 'a face in every grid row header', expectPresent: 18, maxPresent: 18 },
		/* THE PRE-0180 GRID IS ALL TILES AND NO PICTURES, which is what makes
		   the `with` row below a claim about the columns rather than about
		   the component. */
		{ selector: '[data-case="without"] tbody img', label: 'pre-0180: no image anywhere', expectPresent: 0 },
		{ selector: '[data-case="without"] tbody .initials', label: 'pre-0180: six tiles instead', expectPresent: 6, maxPresent: 6 },
		/* AND THE `with` GRID GENUINELY PAINTS PICTURES -- four data: URIs and
		   two preset glyphs. Without this the row above passes on a component
		   that simply never renders an image. */
		{ selector: '[data-case="with"] tbody img', label: 'with avatars: four real images', expectPresent: 4, maxPresent: 4 },
		{ selector: '[data-case="with"] tbody svg path', label: 'with avatars: two preset glyphs', expectPresent: 2, maxPresent: 2 },
		/* MIXED IS THE REAL CLASS: two pictures, one 404 that has already
		   become a tile, and three people who chose nothing. */
		{ selector: '[data-case="mixed"] tbody img', label: 'mixed: one surviving image (the 404 swapped)', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-case="mixed"] tbody .initials', label: 'mixed: three tiles, one of them the broken image', expectPresent: 3, maxPresent: 3 },
		{ selector: '[data-case="mixed"] tbody svg path', label: 'mixed: two preset glyphs', expectPresent: 2, maxPresent: 2 },
		/* The panel header, in its two load-bearing states. */
		{ selector: '[data-case="panel-with"] .head-who .avatar', label: 'the entry panel header carries a face', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-case="panel-broken"] .head-who img', label: 'a broken panel avatar left no img behind', expectPresent: 0 },
		{ selector: '[data-case="panel-broken"] .head-who .initials', label: 'and became a tile', expectPresent: 1, maxPresent: 1 },
		/* GradingConsole's roster list, the third real surface. Its own dev
		   route mounts it with a roster carrying NO avatar columns, so the
		   with/mixed halves of the claim can only be measured here. */
		{ selector: '[data-testid="gc-case"]', label: 'the three GradingConsole rosters', expectPresent: 3, maxPresent: 3 },
		{ selector: '[data-testid="gc-case"] .roster-row .avatar', label: 'a face on every grading roster row', expectPresent: 18, maxPresent: 18 },
		{ selector: '[data-case="gc-without"] .roster-row img', label: 'pre-0179 grading roster: no image', expectPresent: 0 },
		{ selector: '[data-case="gc-with"] .roster-row img', label: 'with avatars: four real images', expectPresent: 4, maxPresent: 4 },
		{ selector: '[data-case="gc-mixed"] .roster-row img', label: 'mixed: one surviving image (the 404 swapped)', expectPresent: 1, maxPresent: 1 }
	],
	contrast: [
		{ selector: '.harness h1', label: 'h1 on its plate', min: 4.5 },
		/* ALL EIGHT, worst reported. This is the row that would have caught
		   reusing the preset palette as ink -- two of those eight measure
		   under 3:1 as text on this ground. */
		{ selector: '[data-testid="avatar-tint"] .initials', label: 'every initials tint on the real ground', min: 4.5, all: true },
		{ selector: '[data-testid="avatar-row"] .roster-name', label: 'the name beside the face', min: 4.5, all: true },
		{ selector: '[data-testid="avatar-row"] .roster-email', label: 'the address under it', min: 4.5, all: true },
		/* THE NOTEBOOK PLATE IS A DIFFERENT ROOM AND A DIFFERENT GROUND.
		   CLAUDE.md: measure when a shared component enters a new room -- the
		   tints were cleared against `.cr-root` above and nothing said they
		   clear here. `all: true` so the worst of the eighteen is reported. */
		{ selector: '[data-case="without"] tbody .initials', label: 'every tile tint on the notebook plate', min: 4.5, all: true },
		{ selector: '[data-case="without"] .student-name', label: 'the grid name beside the face', min: 4.5, all: true },
		{ selector: '[data-case="panel-with"] .eyebrow', label: 'the entry panel eyebrow beside its face', min: 4.5, all: true }
	],
	orderResult: [
		{
			/* THE WHOLE POINT OF THIS SPEC. Six rows, four of them differing
			   only in what the picture is doing, and the heights must agree. It
			   answers a CATEGORY rather than a pixel count because an
			   `orderResult` array has to be identical at both widths, and the
			   long-name row genuinely wraps at 375 -- so the comparison is made
			   over the rows whose content is one line, with the wrapping row
			   reported separately below. */
			label: 'a missing or broken picture does not change a row height',
			evaluate:
				'() => { const rows = [...document.querySelectorAll("[data-testid=\\"avatar-parity-row\\"]")]; if (rows.length !== 5) return ["EXPECTED 5 PARITY ROWS, GOT " + rows.length]; const hs = rows.map((r) => Math.round(r.getBoundingClientRect().height)); if (hs.some((v) => v < 1)) return ["A ROW HAD NO BOX: " + JSON.stringify(hs)]; const same = hs.every((v) => Math.abs(v - hs[0]) <= 1); return [same ? "identical" : "DIFFER: " + rows.map((r, i) => r.dataset.case + "=" + hs[i]).join(" ")]; }',
			expected: ['identical']
		},
		{
			/* THE AVATAR ITSELF IS THE SAME BOX IN EVERY CASE, which is the
			   mechanism underneath the row claim: if a tile were a different
			   size from an image the rows could still agree by accident (a
			   taller name line absorbing it) and would stop agreeing the day
			   the name got shorter. */
			label: 'the avatar box is the same size whatever it is painting',
			evaluate:
				'() => { const boxes = [...document.querySelectorAll("[data-testid=\\"avatar-row\\"] .avatar, [data-testid=\\"avatar-parity-row\\"] .avatar")].map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.width) + "x" + Math.round(r.height); }); if (boxes.length !== 11) return ["EXPECTED 11, GOT " + boxes.length]; const uniq = [...new Set(boxes)]; return [uniq.length === 1 ? "one size: " + uniq[0] : "DIFFER: " + uniq.join(", ")]; }',
			expected: ['one size: 28x28']
		},
		{
			/* A LONG NAME MUST NOT SQUEEZE THE PICTURE. The failure this
			   forbids is the avatar shrinking to a sliver at 375 because a
			   50-character name won the flex negotiation -- which is what
			   happens without `flex-shrink: 0` and an inline min-width, and
			   which reads as a broken image rather than as a layout bug. */
			label: 'a name too long for its row does not shrink the face',
			evaluate:
				'() => { const el = document.querySelector("[data-case=\\"longname\\"] .avatar"); if (!el) return ["NO LONGNAME ROW"]; const w = Math.round(el.getBoundingClientRect().width); return [w === 28 ? "held at 28" : "SQUEEZED to " + w]; }',
			expected: ['held at 28']
		},
		{
			/* AND THE ROW STILL DOES NOT OVERFLOW ITS PAGE. `horizontal-scroll`
			   covers the document; this says the long name wrapped INSIDE the
			   row rather than the row growing past its container. */
			label: 'the long-name row stays inside the page at either width',
			evaluate:
				'() => { const el = document.querySelector("[data-case=\\"longname\\"]"); const main = document.querySelector("main.harness"); if (!el || !main) return ["NO ROW"]; const r = el.getBoundingClientRect(); const m = main.getBoundingClientRect(); return [r.right <= m.right + 1 ? "inside" : "OVERFLOWS by " + Math.round(r.right - m.right)]; }',
			expected: ['inside']
		},
		{
			/* EVERY TINT IS DISTINCT, which is what makes the set worth having.
			   A hash that collapsed to one bucket would pass the contrast row
			   (one colour, measured once) and defeat the feature silently. */
			label: 'the eight tints render as eight different colours',
			evaluate:
				'() => { const c = [...document.querySelectorAll("[data-testid=\\"avatar-tint\\"] .initials")].map((e) => getComputedStyle(e).color); if (c.length !== 8) return ["EXPECTED 8, GOT " + c.length]; return ["distinct:" + new Set(c).size]; }',
			expected: ['distinct:8']
		},
		{
			/* ================================================================
			   THE CLAIM PROMPT 0038 EXISTS TO SETTLE. `SectionGrid`'s density
			   is a LOCKED CONTRACT -- a 1.9rem cell box and 0.35/0.4rem
			   padding -- and a face in the row header is the one change that
			   could break it for every column at once. The avatar is 24px,
			   under the 30.4px cell, so the CELL should still be the tallest
			   thing in the row and the height should not move at all.

			   COMPARED PER ROW POSITION, NOT ROW AGAINST ROW, and the first
			   draft of this probe got that wrong in exactly the way 0033's
			   parity group already records. The three grids carry
			   byte-identical text, but the rows WITHIN one grid legitimately
			   differ: row 4 is the student who has LEFT the class and carries
			   a chip on a second line (66px), and row 6 at 375 is the
			   50-character name wrapping (120px). Comparing all eighteen to
			   each other therefore reported DIFFER for content that has
			   nothing to do with a picture. What answers the question is
			   position 1 of `with` against position 1 of `without` against
			   position 1 of `mixed`, and so on -- the avatar columns are then
			   the only thing that varies.

			   IT REPORTS THE NUMBERS, not a verdict, so the next reader can
			   audit them instead of trusting a tick.
			   ================================================================ */
			label: 'SectionGrid: the row height does not move with, without, or mixed',
			evaluate:
				'() => { const per = {}; for (const g of document.querySelectorAll("[data-testid=\\"grid-case\\"]")) { per[g.dataset.case] = [...g.querySelectorAll("tbody tr")].map((r) => Math.round(r.getBoundingClientRect().height)); } const modes = ["with", "without", "mixed"]; for (const m of modes) { if (!per[m]) return ["MISSING GRID " + m]; if (per[m].length !== 6) return ["EXPECTED 6 ROWS IN " + m + ", GOT " + per[m].length]; if (per[m].some((v) => v < 1)) return ["A ROW HAD NO BOX IN " + m]; } const diffs = []; for (let i = 0; i < 6; i++) { const a = per.with[i], b = per.without[i], c = per.mixed[i]; if (Math.abs(a - b) > 1 || Math.abs(a - c) > 1) diffs.push("row" + (i + 1) + " with=" + a + " without=" + b + " mixed=" + c); } if (diffs.length) return ["DIFFER: " + diffs.join("; "), JSON.stringify(per)]; return ["identical per row", "row1=" + per.without[0], "leftchip-row4=" + per.without[3]]; }',
			/* THE MEASURED VALUES, at 375 and at 1440 -- and they are the SAME
			   array, because the only row that wraps differently between the
			   two widths is row 6 (120 at 375, 43 at 1440) and this probe
			   compares a row only against ITSELF in the other two grids. An
			   `orderResult` array has to be identical at both widths, which is
			   what makes the per-position shape the right one here as well. */
			/* THE EXPECTATION HAS TO BE ONE ARRAY FOR BOTH WIDTHS -- `orderResult`
			   compares element for element and has no per-width form -- so the
			   probe reports the VERDICT plus the two heights that are stable at
			   both widths, and puts the full per-row numbers in the FAILURE
			   message where they are actually needed. Row 6 is 120 at 375 and
			   43 at 1440 (the long name wrapping), which is content and not a
			   picture, so it is compared and not quoted. */
			/* `leftchip-row4` IS 43 AND THE 66 THIS LINE FIRST CARRIED WAS A
			   REGRESSION, WRITTEN DOWN AS IF IT WERE THE ANSWER. Row 4 is the
			   student who has LEFT the class, whose `left` chip was an inline
			   sibling of the name; the first draft of the avatar wrapper made
			   `.name-line` a block-level flex container, which pushed the chip
			   onto a second line and took that row from 43 to 66. It was found
			   by running this same spec against the PRE-CHANGE `SectionGrid`
			   (copied in with `cp`, restored from a copy, md5-verified) and
			   reading 43 where the changed tree read 66 -- which is what a
			   before/after is for, and is the only reason a 23px regression on
			   a locked-density surface did not simply ship as the new number.
			   BOTH figures below are the pre-change tree's. */
			expected: ['identical per row', 'row1=43', 'leftchip-row4=43']
		},
		{
			/* THE MECHANISM UNDER THAT CLAIM, reported as a NUMBER rather than
			   a verdict so the next reader can audit it: the cell box, the
			   avatar box and the row. The row must be the cell plus padding,
			   and the avatar must be strictly smaller than the cell -- which
			   is why 24 rather than the 28 every other surface uses. If the
			   avatar ever became the tallest thing in the row, the row above
			   would still say "identical" (all three grids would grow
			   together) and the density contract would be quietly broken. */
			label: 'SectionGrid: the cell is still the tallest thing in the row',
			evaluate:
				'() => { const g = document.querySelector("[data-case=\\"mixed\\"]"); if (!g) return ["NO MIXED GRID"]; const cell = g.querySelector("tbody .cell"); const av = g.querySelector("tbody .avatar"); const row = g.querySelector("tbody tr"); if (!cell || !av || !row) return ["MISSING " + [!cell && "cell", !av && "avatar", !row && "row"].filter(Boolean).join(",")]; const c = Math.round(cell.getBoundingClientRect().height); const a = Math.round(av.getBoundingClientRect().height); const r = Math.round(row.getBoundingClientRect().height); return ["cell=" + c + " avatar=" + a + " row=" + r + " " + (a < c ? "avatar-under-cell" : "AVATAR-EXCEEDS-CELL")]; }',
			/* MEASURED, not computed. The first draft wrote 42 from the
			   arithmetic (30.4 cell + 11.2 padding + 1px border = 42.6) and the
			   harness answered 43; the number that belongs in a spec is the one
			   the browser produced. */
			expected: ['cell=30 avatar=24 row=43 avatar-under-cell']
		},
		{
			/* A LONG NAME MUST NOT SQUEEZE THE FACE HERE EITHER. The grid's
			   name column is `min-width: 11rem` and sticky, which is a
			   different negotiation from PeoplePanel's flex row -- so the same
			   claim is measured again on this surface rather than inherited.
			   `Fernanda Okonkwo-Villanueva de la Concepcion` is the row. */
			label: 'SectionGrid: a very long name does not shrink the face',
			evaluate:
				'() => { const g = document.querySelector("[data-case=\\"mixed\\"]"); if (!g) return ["NO MIXED GRID"]; const rows = [...g.querySelectorAll("tbody tr")]; const last = rows[rows.length - 1]; const av = last && last.querySelector(".avatar"); if (!av) return ["NO AVATAR ON THE LONG-NAME ROW"]; const r = av.getBoundingClientRect(); return [Math.round(r.width) + "x" + Math.round(r.height)]; }',
			expected: ['24x24']
		},
		{
			/* THE PANEL HEADER KEEPS ITS CLOSE BUTTON ON THE RIGHT. Adding a
			   third child to a `space-between` header is exactly how the text
			   floats into the middle and the button drifts inward; `.head-who`
			   with `flex: 1 1 auto` is what prevents it, and this is the row
			   that would catch losing that rule. */
			label: 'EntryReview: the face does not push the Close button off its edge',
			evaluate:
				'() => { const p = document.querySelector("[data-case=\\"panel-with\\"] .entry-head"); if (!p) return ["NO PANEL HEAD"]; const btn = p.querySelector("button"); const av = p.querySelector(".avatar"); if (!btn || !av) return ["MISSING CONTROL"]; const pr = p.getBoundingClientRect(); const br = btn.getBoundingClientRect(); const ar = av.getBoundingClientRect(); const rightAligned = Math.abs(br.right - pr.right) <= 2; const faceFirst = ar.left < br.left; return [(rightAligned ? "button-right" : "BUTTON-DRIFTED-" + Math.round(pr.right - br.right)) + " " + (faceFirst ? "face-left" : "FACE-MISPLACED")]; }',
			expected: ['button-right face-left']
		},
		{
			/* AND THE PANEL HEADER'S FACE IS 28px IN ALL FOUR STATES, including
			   the one whose image 404d and the one whose name wraps. Same
			   argument as the roster row above: a tile that measured
			   differently from an image would let the header agree by accident
			   today and stop agreeing tomorrow. */
			label: 'EntryReview: the header face is one size in every state',
			evaluate:
				'() => { const b = [...document.querySelectorAll("[data-testid=\\"panel-case\\"] .head-who .avatar")].map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.width) + "x" + Math.round(r.height); }); if (b.length !== 4) return ["EXPECTED 4, GOT " + b.length]; const u = [...new Set(b)]; return [u.length === 1 ? "one size: " + u[0] : "DIFFER: " + u.join(", ")]; }',
			expected: ['one size: 28x28']
		},
		{
			/* ================================================================
			   GradingConsole's roster row, the third surface and the one whose
			   number MOVED before it was measured.

			   The row's height is `min-height: 44px` -- the tap floor, which
			   that component's padding was tuned to carry after the row
			   measured 35px. With 18px of padding and border, a 28px face made
			   the AVATAR the tallest thing in the box and the row grew to 46px
			   at both widths. Measured against the pre-change file on
			   `/dev/grading-bulk`: 44 before, 46 after. At 24 the floor decides
			   again and the row is 44 exactly, which is what this row pins --
			   with, without and mixed, so a picture cannot move it either.
			   ================================================================ */
			label: 'GradingConsole: the roster row is still the 44px floor, with or without a face',
			evaluate:
				'() => { const per = {}; for (const g of document.querySelectorAll("[data-testid=\\"gc-case\\"]")) { per[g.dataset.case] = [...g.querySelectorAll(".roster-row")].map((r) => Math.round(r.getBoundingClientRect().height)); } const modes = ["gc-with", "gc-without", "gc-mixed"]; for (const m of modes) { if (!per[m]) return ["MISSING " + m]; if (per[m].length !== 6) return ["EXPECTED 6 ROWS IN " + m + ", GOT " + per[m].length]; } const diffs = []; for (let i = 0; i < 6; i++) { const a = per["gc-with"][i], b = per["gc-without"][i], c = per["gc-mixed"][i]; if (Math.abs(a - b) > 1 || Math.abs(a - c) > 1) diffs.push("row" + (i + 1) + " with=" + a + " without=" + b + " mixed=" + c); } if (diffs.length) return ["DIFFER: " + diffs.join("; "), JSON.stringify(per)]; const av = document.querySelector("[data-case=\\"gc-mixed\\"] .roster-row .avatar"); const a = av ? Math.round(av.getBoundingClientRect().height) : 0; return ["identical per row", "row1=" + per["gc-without"][0], "avatar=" + a, a < per["gc-without"][0] ? "face-under-floor" : "FACE-EXCEEDS-FLOOR"]; }',
			/* PER POSITION, not row against row -- the same correction the
			   SectionGrid probe above needed and for the same reason. Row 6 is
			   the 45-character name, which wraps to 90px at 375 and sits at 44
			   at 1440; that is its own text and has nothing to do with a face,
			   so it is compared against ITSELF in the other two rosters and
			   only the width-stable figures are quoted. */
			expected: ['identical per row', 'row1=44', 'avatar=24', 'face-under-floor']
		}
	],
	/* NO `tapTargets` BLOCK, deliberately, and an EMPTY one would have been
	   worse than none: a spec that lists a check with no rows runs nothing
	   while reading as covered. The avatar is `aria-hidden`, carries no
	   handler and is not a tap target -- nothing in this page is tappable at
	   all. The 44px claim that matters is on PeoplePanel's own row controls
	   (`.btn.tiny`), which belong to that panel and are untouched here; this
	   bundle adds a 28px decoration to the left of them and moves neither. */
	/* THE BROKEN IMAGE IS DELIBERATE, and the key is `ignoreConsole` -- the
	   name `run.mjs` actually reads (`spec.ignoreConsole ?? []`). A 404 on an
	   <img> logs a network error in Chromium and this page causes exactly one
	   on purpose; naming it by pattern is what keeps the row honest about
	   every error it did not expect. */
	ignoreConsole: [/this-object-does-not-exist\.png/, /gone\.png/, /Failed to load resource/]
};
