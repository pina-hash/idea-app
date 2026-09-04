/**
 * The IDEA Coin Ledger, with the report control it did not have.
 *
 * "The coin ledger pages have no way to report a problem. Every other surface
 * carries one." They did not, and the reason was structural rather than an
 * omission: the Ledger is carried-over legacy HTML with no Svelte layout above
 * it, so `SiteFeedback` -- mounted once in the root layout, which is what makes
 * report coverage something a new route INHERITS -- could never reach it. It is
 * injected into the served HTML instead, the convention this repo already uses
 * for everything added to a legacy page, and the file on disk is untouched.
 *
 * THIS DRIVES `/dev/coins`, WHICH SERVES THE SHIPPING BYTES. The harness reads
 * the same `src/lib/legacy/coins/index.html` the public route reads, rewrites
 * `/api/coin/` to its own fixtures, and injects the report panel through the
 * SAME `legacyReportPanelScript` with the same options -- so what is measured
 * here is the shipping markup and the shipping control, not a copy of either.
 * `/coins/index.html` itself is a real route and outside this harness's `/dev`
 * boundary; it was measured by hand and the numbers agree (63x44 trigger, panel
 * opening in one click, six controls all at or above 44px, at both widths).
 *
 * THE 51px HORIZONTAL-SCROLL FINDING AT 375 WAS THE LEDGER'S FOURTH TAB, AND
 * IT IS FIXED. This paragraph has now been wrong twice and the second way is
 * the one worth remembering.
 *
 * IT FIRST BLAMED `#student-drawer`, for weeks: "a slide-in panel parked off
 * the right edge at ~750px". Every clause of that was measured and the
 * conclusion was still wrong. `#student-drawer` is `position: fixed`, and a
 * fixed element contributes NOTHING to the document's scrollable overflow. Its
 * children -- the header, the body, the close button, the name, stats and
 * transaction-title rows -- are static or absolute INSIDE that fixed ancestor,
 * so they carry a `getBoundingClientRect().right` of 727-750 and sort to the
 * top of any offender list ordered by that number, while contributing nothing
 * either. `horizontal-scroll` in ../checks.mjs skips an element whose OWN
 * position is fixed and does not walk up for a fixed ancestor, so the drawer's
 * six children were exactly what its report showed: six true measurements of an
 * element that was not the cause. That instrument gap is still there and is not
 * this spec's to close.
 *
 * THEN, HAVING FOUND THE REAL CAUSE, IT SAID THE CAUSE COULD NOT BE FIXED --
 * "carried-over legacy under CLAUDE.md's freeze, whose only exception is
 * VANGUARD. The row stays red on purpose." The freeze is real and the sentence
 * that followed from it was not: the freeze's own escape hatch is an explicit
 * rule, and prompt 0025 was issued with one, scoped to these two CSS rules and
 * nothing else in the file. A finding recorded as permanently unfixable is a
 * finding nobody reads again.
 *
 * WHAT WAS WRONG, MEASURED BEFORE THE FIX. `.tab-bar` was `display: flex` with
 * no `flex-wrap` and no `overflow-x`. At 375 the four tabs wanted 410.3px in a
 * 343px container and `.tab-btn` "Contracts" ran 329.2 -> 426.3 -- 426 being
 * the `scrollWidth` the check reported, to the pixel, and the only non-fixed
 * node past the edge. At 320 it was two tabs. The Ledger's own
 * `body { overflow-x: hidden }` propagates to the viewport, so `scrollLeft` set
 * to 999 read back 0 on `documentElement`, on `body`, on `window` AND on
 * `.tab-bar` itself: the clipped part could not be reached by scrolling, by
 * swiping, or at all. And it was WORSE in production than this harness could
 * report -- the tabs are Orbitron, which this harness blocks, and with the real
 * face injected the overflow measured 89px rather than 51px.
 *
 * WHAT IS TRUE NOW. `flex-wrap: wrap` on `.tab-bar` and `min-height: 44px` on
 * `.tab-btn`, in the Ledger's own stylesheet. Measured at 320, 375, 414 and
 * 1440: 0px overflow at every one, all four tabs inside the viewport and
 * hit-testable at their own centres, every tab exactly 44.0px tall (they were
 * 39.6 narrow and 33.8 at desktop, both under the floor on a page any student
 * reaches without signing in), the bar wrapping to two rows below ~430px and
 * staying one row at 1440. Wrapping rather than a scrollable strip, because a
 * phone paints an overlay scrollbar only while a finger is moving: at rest a
 * strip would look complete and still be hiding a tab, which is this same
 * defect wearing different clothes.
 *
 * THE TRIGGER IS THE ROW THAT MATTERS AND IT IS THE ONE THAT WAS WRONG. The
 * first version reused the Ledger's own `.share-btn` class -- and that class is
 * `display: none` below 768px in the Ledger's own media query, so the control
 * measured 0x0 at 375px: perfect at 1440, invisible on the width a student
 * actually reads this page at, with nothing to say so.
 */
export default {
	path: '/dev/coins',
	label: 'IDEA Coin Ledger (shipping bytes) with the injected report control',
	/* The Ledger is not a SvelteKit app, so there is no hydration to wait on --
	   the injected script mounts on DOMContentLoaded. What needs settling is the
	   page's own entrance animations and its fixture fetches. */
	settleMs: 1200,
	prepare: [
		{
			/* THE PANEL IS BUILT LAZILY, on first press, so this predicate names
			   something only the click can produce: at rest the panel element
			   does not exist at all. */
			click: '#idea-ledger-report-btn',
			until: '() => { const p = document.getElementById("idea-ledger-report"); return !!p && getComputedStyle(p).display !== "none"; }',
			attempts: 8,
			waitMs: 250
		},
		{
			/* THE OVERFLOW MEASUREMENT ITSELF, printed rather than gated. An
			   `evaluate` step's return value is the only raw number this report
			   format carries; an `orderResult` row prints the array it compares
			   and nothing else, and that array has to be the same at both
			   widths (see the verdict row below, and the first draft of it,
			   which expected "#student-drawer" and got "no overflow" at 1440).

			   IT SKIPS ANYTHING UNDER A FIXED ANCESTOR, and that one clause is
			   the difference between naming the cause and naming the loudest
			   rectangle. Sorted by `right` alone this step answered
			   "#student-drawer" for weeks -- true about the geometry, false
			   about the overflow, because a fixed subtree creates no scrollable
			   overflow at all. Walking up for a fixed ancestor (rather than
			   testing the element's own `position`, which is what
			   ../checks.mjs does) drops all six of the drawer's children and
			   leaves the one node that actually sets `scrollWidth`. */
			evaluate:
				'() => { const d = document.documentElement; const over = d.scrollWidth - d.clientWidth; if (over <= 0) return "no horizontal overflow at " + window.innerWidth + "px"; const underFixed = (e) => { for (let p = e; p; p = p.parentElement) { if (getComputedStyle(p).position === "fixed") return true; } return false; }; const worst = [...document.querySelectorAll("*")].filter((e) => !underFixed(e)).map((e) => [e, e.getBoundingClientRect().right]).filter(([, r]) => r > d.clientWidth + 0.5).sort((a, b) => b[1] - a[1])[0]; const el = worst && worst[0]; if (!el) return over + "px overflow at " + window.innerWidth + "px, but every node past the edge sits under a fixed ancestor"; const name = (el.id ? "#" + el.id : el.tagName.toLowerCase() + "." + (el.className || "").toString().split(" ")[0]) + " [" + (el.textContent || "").trim().slice(0, 20) + "]"; return over + "px overflow at " + window.innerWidth + "px, widest NON-FIXED offender " + name + " right=" + worst[1].toFixed(1); }'
		}
	],
	presence: [
		/* THE POSITIVE CONTROL: the Ledger's own tab bar. Without it, every row
		   below could pass on a page that failed to render at all. */
		{ selector: '.tab-bar .tab-btn', label: 'the Ledger rendered (its own tabs)', expectPresent: 4 },
		{ selector: '#idea-ledger-report-btn', label: 'the report trigger, in the page header', expectPresent: 1, maxPresent: 1 },
		{ selector: '#idea-ledger-report', label: 'the report panel, once opened', expectPresent: 1, maxPresent: 1 },
		{ selector: '#idea-ledger-report button[data-kind]', label: 'one chip per feedback kind', expectPresent: 4, maxPresent: 4 },
		{ selector: '#idea-ledger-report textarea', label: 'the message field', expectPresent: 1, maxPresent: 1 },
		/* SIGNED OUT IS THE HARNESS'S DEFAULT, and the optional contact field is
		   offered ONLY where there is no account -- a signed-in report already
		   carries one. This is the row that says the branch exists; the
		   signed-in spec beside it is the row that says it is a branch. */
		{ selector: '#idea-ledger-report input[type="text"]', label: 'the optional contact field (signed out)', expectPresent: 1, maxPresent: 1 }
	],
	contrast: [
		{ selector: '#idea-ledger-report-btn', label: 'the trigger on the Ledger header', min: 4.5 },
		{ selector: '#idea-ledger-report [role="dialog"] > div > div:nth-child(1), #idea-ledger-report > div > div:nth-child(1)', label: 'the panel heading', min: 4.5 },
		{ selector: '#idea-ledger-report > div > div:nth-child(2)', label: 'the panel note copy', min: 4.5 }
	],
	tapTargets: [
		{ selector: '#idea-ledger-report-btn', label: 'the report trigger', min: 44 },
		{ selector: '#idea-ledger-report button', label: 'every control inside the panel', min: 44 },
		/* THE LEDGER'S OWN TABS, WHICH NOTHING HAD EVER MEASURED. They were
		   33.8px tall at 1440 and 39.6px at 375 -- under the floor at both, on a
		   page a student reaches without signing in, so IDEA_INTERFACE_STANDARDS
		   10 gives no exception for them. `min-height` in the Ledger's own
		   stylesheet takes all four to 44.0px at every width measured.

		   This is `tapTargets` and not `tapReach` on purpose: a tab OWNS its row,
		   so growing the painted box is the right mechanism (`.tap-44`'s case,
		   not `.tap-reach-44`'s), and the box is what a finger lands on. */
		{ selector: '.tab-bar .tab-btn', label: "the Ledger's own tabs", min: 44 }
	],
	textContains: [
		{
			selector: '#idea-ledger-report',
			label: 'the panel says what a signed-out report carries, before it is sent',
			must: [
				'REPORT A PROBLEM',
				'not signed in',
				'this report carries no name',
				'A way to reach you (optional)'
			],
			/* A REPORT IS NEVER PRESENTED AS ANONYMOUS AND ALSO IDENTIFIED, and
			   this phrase is the signed-in sentence's own -- it appears in that
			   state and in no other, which is what makes the prohibition mean
			   something rather than forbid a string nothing ever writes. Its
			   mirror is the `coins-signed-in` spec, which requires this phrase
			   and forbids the three above. */
			mustNot: ['carries your account']
		}
	],
	orderResult: [
		{
			label: 'a signed-out report posts to the anonymous route and nowhere else',
			/* THE ENDPOINT IS READ OFF THE INJECTED CONFIG, which is the only
			   place it exists -- the two paths must never swap, and a signed-in
			   student travelling the anonymous route would file a row carrying
			   no account and attributable to an address instead. */
			evaluate:
				'() => { const src = [...document.scripts].map((s) => s.textContent || "").find((t) => t.indexOf("idea-ledger-report-btn") !== -1); if (!src) return ["NO INJECTED SCRIPT"]; const m = /"endpoint":"([^"]+)"/.exec(src); return [m ? m[1] : "NO ENDPOINT IN CONFIG"]; }',
			expected: ['/api/feedback']
		},
		{
			label: 'no part of the injected control contributes to the overflow, at either width',
			/* ONE VERDICT AT BOTH WIDTHS. `horizontal-scroll` reports the
			   widest offenders already, but a reader scanning for "did the
			   report control break this page" needs the answer beside the
			   control's own rows, and it has to be the same answer at 1440
			   (where nothing overflows) as at 375 (where the Ledger's own
			   drawer does). So the probe asks about the CONTROL rather than
			   about the overflow: it walks every offending node and answers
			   whether any of them is the trigger or the panel. The measurement
			   naming the drawer is the `prepare-eval` line above. */
			evaluate:
				'() => { const d = document.documentElement; if (d.scrollWidth <= d.clientWidth) return ["not the injected control"]; const offenders = [...document.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().right > d.clientWidth + 0.5); const trigger = document.getElementById("idea-ledger-report-btn"); const panel = document.getElementById("idea-ledger-report"); const ours = offenders.filter((e) => (trigger && (e === trigger || trigger.contains(e))) || (panel && (e === panel || panel.contains(e)))); return [ours.length === 0 ? "not the injected control" : "THE INJECTED CONTROL: " + ours.length + " node(s)"]; }',
			expected: ['not the injected control']
		},
		{
			/* NOTHING BUT FIXED FURNITURE IS PAST THE RIGHT EDGE, AND THE TAB BAR
			   IS NO LONGER EXEMPT FROM THAT. This row used to allow `.tab-bar`
			   through -- "fixed furniture or the Ledger's own tab bar" -- which
			   was the honest shape while the overflow was a recorded, unfixed
			   defect. Now that it is fixed, the exemption is exactly what would
			   let it come back silently, so it is gone: a tab past the edge
			   fails this row by name.

			   It asks the CATEGORY rather than the element, because the array an
			   `orderResult` compares has to be the same at both widths (the
			   verdict row further down carries that lesson, and the first draft
			   of the probe above expected "#student-drawer" and got "no
			   overflow" at 1440). A fixed subtree creates no scrollable overflow
			   and ../checks.mjs skips only the fixed element itself, never its
			   children, so naming that category is what keeps the drawer's six
			   descendants from reading as a finding. */
			label: 'nothing but fixed furniture is past the right edge',
			evaluate:
				'() => { const d = document.documentElement; const underFixed = (e) => { for (let p = e; p; p = p.parentElement) { if (getComputedStyle(p).position === "fixed") return true; } return false; }; const stray = [...document.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().right > d.clientWidth + 0.5).filter((e) => !underFixed(e)); return [stray.length === 0 ? "fixed furniture only" : "PAST THE EDGE: " + stray.length + " node(s), first " + (stray[0].id ? "#" + stray[0].id : stray[0].tagName.toLowerCase() + "." + (stray[0].className || "").toString().split(" ")[0]) + " [" + (stray[0].textContent || "").trim().slice(0, 16) + "]"]; }',
			expected: ['fixed furniture only']
		},
		{
			/* THE FOURTH TAB IS ON SCREEN AND CAN BE PRESSED, WHICH IS THE CLAIM
			   A STUDENT CARES ABOUT AND IS NOT THE SAME CLAIM AS ZERO OVERFLOW.
			   A document can report `scrollWidth === clientWidth` while a tab is
			   clipped by an ancestor, hidden under a fixed overlay, or painted at
			   zero width -- so this hit-tests each tab at its own centre rather
			   than reading geometry, and counts all four rather than checking the
			   last one. `Contracts` was the tab that was unreachable; naming only
			   it would leave a spec that passes once the tabs are reordered.

			   It answers the same string at every width, because that is what an
			   `orderResult` requires -- at 1440 the bar is one row and at 375 it
			   is two, and "all four reachable" is true of both.

			   IT LOOKS PAST THE INJECTED REPORT PANEL, and the first draft of
			   this row did not: `#idea-ledger-report` is a `position: fixed`
			   MODAL covering the whole viewport (measured 0,0 -> 375x900 and
			   1440x900), the `prepare` step above opens it, and it therefore
			   sits on top of all four tabs at both widths. A plain
			   `elementFromPoint` answered "UNREACHABLE: Leaderboard,
			   Transaction Log, Analytics, Contracts" on a page whose tab bar was
			   completely fine -- a false red that would have been read as this
			   fix not working. The claim that is actually wanted is that nothing
			   of the PAGE's own is between a finger and a tab, so the stack is
			   walked and everything inside the injected panel is skipped; a tab
			   covered by anything else still fails by name. */
			label: 'all four tabs are inside the viewport and hit-testable',
			evaluate:
				'() => { const d = document.documentElement; const panel = document.getElementById("idea-ledger-report"); const btns = [...document.querySelectorAll(".tab-bar .tab-btn")]; if (btns.length !== 4) return ["EXPECTED 4 TABS, FOUND " + btns.length]; const bad = btns.filter((b) => { const r = b.getBoundingClientRect(); if (r.left < -0.5 || r.right > d.clientWidth + 0.5 || r.width < 1 || r.height < 1) return true; const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2); const top = stack.find((e) => !(panel && (e === panel || panel.contains(e)))); return !(top === b || b.contains(top)); }); return [bad.length === 0 ? "4/4 reachable" : "UNREACHABLE: " + bad.map((b) => b.textContent.trim()).join(", ")]; }',
			expected: ['4/4 reachable']
		},
		{
			label: 'the trigger is inside the page header, not floating over the leaderboard',
			evaluate:
				'() => { const b = document.getElementById("idea-ledger-report-btn"); if (!b) return ["NO TRIGGER"]; const fixed = getComputedStyle(b).position === "fixed"; const inHeader = !!b.closest("header"); return [inHeader && !fixed ? "in the header" : (fixed ? "floating" : "outside the header")]; }',
			expected: ['in the header']
		}
	]
};
