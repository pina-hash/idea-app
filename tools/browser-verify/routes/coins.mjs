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
 * THE 51px HORIZONTAL-SCROLL FINDING AT 375 IS A REAL DEFECT IN THE LEDGER'S
 * OWN TAB BAR, AND THIS PARAGRAPH USED TO BLAME THE WRONG ELEMENT.
 *
 * It read: "It is the Ledger's own `#student-drawer`, a slide-in panel parked
 * off the right edge at ~750px." Every clause of that was measured and the
 * conclusion was still wrong, which is why the misdiagnosis survived weeks of
 * readers skipping the row as somebody else's frozen furniture.
 *
 * `#student-drawer` is `position: fixed` (`.drawer` in the Ledger's own
 * stylesheet), and a fixed element contributes NOTHING to the document's
 * scrollable overflow. Its children -- the header, the body, the close button,
 * the name, stats and transaction-title rows -- are static or absolute INSIDE
 * that fixed ancestor, so they carry a `getBoundingClientRect().right` of
 * 727-750 and land at the top of any offender list sorted by that number,
 * while contributing nothing either. `horizontal-scroll` in ../checks.mjs skips
 * an element whose OWN position is fixed and does not walk up for a fixed
 * ancestor, so the drawer's six children are exactly what its report showed --
 * and the reading it produced was six true measurements of an element that is
 * not the cause.
 *
 * THE CAUSE IS THE FOURTH TAB. Measured at 375: `.tab-bar .tab-btn`
 * "Contracts" runs 329.2 -> 426.3, and 426 is the `scrollWidth` the check
 * reports, to the pixel. It is the only non-fixed node past the viewport edge.
 * The Ledger's own `body { overflow-x: hidden }` propagates to the viewport, so
 * `scrollLeft` is pinned at 0 on `documentElement`, on `body` and on `window`
 * (all three set to 999 and read back 0) and `.tab-bar` itself is
 * `overflow-x: visible` and not scrollable -- so the clipped part of that tab
 * cannot be reached by scrolling, by swiping, or at all.
 *
 * AND IT IS WORSE IN PRODUCTION THAN THIS HARNESS REPORTS, which is the one
 * direction the fallback-stack limit in ../README.md is easy to read the wrong
 * way round. The tabs are Orbitron, loaded from `fonts.googleapis.com`, which
 * this harness blocks. Measured with the real face injected from
 * `@fontsource/orbitron` instead: the overflow goes 51px -> 89px and Contracts
 * runs 357.7 -> 464.0, so 17.3px of a 106.3px tab is on screen rather than
 * 45.8px of 97.1px. The harness under-reports it.
 *
 * REPORTED, NOT FIXED: `src/lib/legacy/coins/index.html` is carried-over legacy
 * under CLAUDE.md's freeze, whose only exception is VANGUARD. The row stays red
 * on purpose and the `orderResult` probes below name the element, so the next
 * reader gets the finding rather than the folklore.
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
				'() => { const d = document.documentElement; const over = d.scrollWidth - d.clientWidth; if (over <= 0) return "no horizontal overflow at " + window.innerWidth + "px"; const underFixed = (e) => { for (let p = e; p; p = p.parentElement) { if (getComputedStyle(p).position === "fixed") return true; } return false; }; const worst = [...document.querySelectorAll("*")].filter((e) => !underFixed(e)).map((e) => [e, e.getBoundingClientRect().right]).filter(([, r]) => r > d.clientWidth + 0.5).sort((a, b) => b[1] - a[1])[0]; const el = worst && worst[0]; if (!el) return over + "px overflow at " + window.innerWidth + "px, but every node past the edge sits under a fixed ancestor"; const name = (el.id ? "#" + el.id : el.tagName.toLowerCase() + "." + (el.className || "").toString().split(" ")[0]) + " \"" + (el.textContent || "").trim().slice(0, 20) + "\""; return over + "px overflow at " + window.innerWidth + "px, widest NON-FIXED offender " + name + " right=" + worst[1].toFixed(1); }'
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
		{ selector: '#idea-ledger-report button', label: 'every control inside the panel', min: 44 }
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
			/* WHAT IS PAST THE RIGHT EDGE, AS A CLAIM RATHER THAN AS FOLKLORE.
			   The `prepare-eval` above prints the per-width number and names the
			   widest non-fixed offender; this row is the claim that would break
			   if a SECOND thing started overflowing, and it has to answer the
			   same at both widths (the verdict row above the last one carries
			   that lesson). So it asks the category, not the element: every node
			   past the edge is either inside a fixed subtree (which creates no
			   scrollable overflow) or inside the Ledger's own tab bar. At 1440
			   there is nothing past the edge at all, which satisfies it the way
			   an empty set does -- and the printed measurement above is what
			   separates the two cases for a reader. */
			label: 'everything past the right edge is fixed furniture or the Ledger\'s own tab bar',
			evaluate:
				'() => { const d = document.documentElement; const underFixed = (e) => { for (let p = e; p; p = p.parentElement) { if (getComputedStyle(p).position === "fixed") return true; } return false; }; const stray = [...document.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().right > d.clientWidth + 0.5).filter((e) => !underFixed(e)).filter((e) => !e.closest(".tab-bar")); return [stray.length === 0 ? "fixed furniture or the tab bar" : "SOMETHING ELSE: " + stray.length + " node(s), first " + (stray[0].id ? "#" + stray[0].id : stray[0].tagName.toLowerCase() + "." + (stray[0].className || "").toString().split(" ")[0])]; }',
			expected: ['fixed furniture or the tab bar']
		},
		{
			label: 'the trigger is inside the page header, not floating over the leaderboard',
			evaluate:
				'() => { const b = document.getElementById("idea-ledger-report-btn"); if (!b) return ["NO TRIGGER"]; const fixed = getComputedStyle(b).position === "fixed"; const inHeader = !!b.closest("header"); return [inHeader && !fixed ? "in the header" : (fixed ? "floating" : "outside the header")]; }',
			expected: ['in the header']
		}
	]
};
