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
 * THE 51px HORIZONTAL-SCROLL FINDING AT 375 IS PRE-EXISTING AND IS NOT THIS
 * BUNDLE'S. It is the Ledger's own `#student-drawer`, a slide-in panel parked
 * off the right edge at ~750px, and it reports identically with the injected
 * trigger removed from the DOM (measured both ways: 426/375 either way). The
 * page does not actually scroll -- the Ledger sets `body { overflow-x: hidden }`
 * -- so what the check is reading is `documentElement.scrollWidth`, which that
 * rule does not bound. The `orderResult` probe below names the offending
 * element so the finding explains itself in the report rather than reading as
 * something this control did. Fixing it means editing a frozen legacy file and
 * belongs to whoever unfreezes it.
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
			   which expected "#student-drawer" and got "no overflow" at 1440). */
			evaluate:
				'() => { const d = document.documentElement; const over = d.scrollWidth - d.clientWidth; if (over <= 0) return "no horizontal overflow at " + window.innerWidth + "px"; const worst = [...document.querySelectorAll("*")].map((e) => [e, e.getBoundingClientRect().right]).filter(([, r]) => r > d.clientWidth + 0.5).sort((a, b) => b[1] - a[1])[0]; const el = worst && worst[0]; const name = !el ? "nothing" : (el.id ? "#" + el.id : el.tagName.toLowerCase() + "." + (el.className || "").toString().split(" ")[0]); return over + "px overflow at " + window.innerWidth + "px, widest offender " + name; }'
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
			label: 'the trigger is inside the page header, not floating over the leaderboard',
			evaluate:
				'() => { const b = document.getElementById("idea-ledger-report-btn"); if (!b) return ["NO TRIGGER"]; const fixed = getComputedStyle(b).position === "fixed"; const inHeader = !!b.closest("header"); return [inHeader && !fixed ? "in the header" : (fixed ? "floating" : "outside the header")]; }',
			expected: ['in the header']
		}
	]
};
