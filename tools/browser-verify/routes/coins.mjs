/**
 * The IDEA Coin Ledger, with the site's own feedback button and window.
 *
 * LEDGER 0396 (report 80bb4d23: "it should just be the same exact system
 * that's on the rest of the website except maybe a different color scheme").
 * The Ledger is carried-over legacy HTML with no Svelte layout above it, so
 * `SiteFeedback` -- mounted once in the root layout -- could never reach it, and
 * it used to carry a hand-built look-alike panel. It now carries the REAL
 * `FeedbackTrigger`, server-rendered into its bytes in the official corner, and
 * the button opens the REAL window, `/feedback/embed`, in a same-origin frame
 * over the page. The file on disk is untouched.
 *
 * THIS DRIVES `/dev/coins`, WHICH SERVES THE SHIPPING BYTES. The harness reads
 * the same `src/lib/legacy/coins/index.html` the public route reads, rewrites
 * `/api/coin/` to its own fixtures, and injects the button through the SAME
 * `injectFeedbackLaunch` with the same options; the one addition is the
 * window's in-memory sink (`sink=memory`), so a report lands on this page as the
 * exact row `submitFeedback` would have sent. What is measured here is the
 * shipping button and the shipping window, not a copy of either. The window is
 * read out of the frame's document (same origin), which is why its rows are
 * `orderResult` probes rather than selector rows.
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
 * either. `horizontal-scroll` in ../checks.mjs skipped an element whose OWN
 * position was fixed and did not walk up for a fixed ancestor, so the drawer's
 * six children were exactly what its report showed: six true measurements of an
 * element that was not the cause.
 *
 * THAT INSTRUMENT GAP IS CLOSED (prompt 0029). `horizontal-scroll` now walks up
 * for a fixed ancestor and skips the whole subtree, and it COUNTS what it
 * skipped rather than dropping it silently -- this page reports `9 node(s) past
 * the edge skipped as viewport-fixed` at both widths, which is the drawer and
 * its descendants. The probes below kept their own `underFixed` walk while the
 * core lacked one; they still carry it because they answer a different question
 * (which node, by name, at both widths) and because a probe that agrees with
 * the check it sits beside is what makes the pair worth reading.
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
 * THE BUTTON SITS WHERE THE HOME PAGE'S DOES, NOT IN THE LEDGER'S HEADER. The
 * look-alike panel's trigger lived beside Share (and its first version reused
 * `.share-btn`, which is `display: none` below 768px, so it measured 0x0 on a
 * phone). The official button floats in the official corner at every width,
 * and the Ledger's own Back to top key and the version chip are lifted above it
 * by the injected stylesheet rather than sitting under it.
 */
import {
	frameFields,
	FRAME_TYPESET_CHECK,
	OFFICIAL_CORNER_CHECK,
	OPEN_FRAME_BOX,
	ROOM_INKS,
	ROOM_INKS_CHECK,
	TYPE_FRAME_REPORT
} from './_report-room.mjs';

export default {
	path: '/dev/coins',
	label: 'IDEA Coin Ledger (shipping bytes) with the official feedback button and its framed window',
	/* The Ledger is not a SvelteKit app, so there is no hydration to wait on --
	   the injected script mounts on DOMContentLoaded. What needs settling is the
	   page's own entrance animations and its fixture fetches. */
	settleMs: 1200,
	prepare: [
		/* THE FRAME LOADS ON THE WAY TO THE PRESS, so this predicate names
		   something only the click can produce: at rest there is no frame. */
		OPEN_FRAME_BOX,
		TYPE_FRAME_REPORT,
		ROOM_INKS,
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
			   overflow at all. Walking up for a fixed ancestor drops all six of
			   the drawer's children and leaves the one node that actually sets
			   `scrollWidth`. ../checks.mjs tested the element's OWN `position`
			   when this was written and walks up now (prompt 0029), so the two
			   agree; this one stays because it names the node and the width in
			   one printed line, which the check's own row does not. */
			evaluate:
				'() => { const d = document.documentElement; const over = d.scrollWidth - d.clientWidth; if (over <= 0) return "no horizontal overflow at " + window.innerWidth + "px"; const underFixed = (e) => { for (let p = e; p; p = p.parentElement) { if (getComputedStyle(p).position === "fixed") return true; } return false; }; const worst = [...document.querySelectorAll("*")].filter((e) => !underFixed(e)).map((e) => [e, e.getBoundingClientRect().right]).filter(([, r]) => r > d.clientWidth + 0.5).sort((a, b) => b[1] - a[1])[0]; const el = worst && worst[0]; if (!el) return over + "px overflow at " + window.innerWidth + "px, but every node past the edge sits under a fixed ancestor"; const name = (el.id ? "#" + el.id : el.tagName.toLowerCase() + "." + (el.className || "").toString().split(" ")[0]) + " [" + (el.textContent || "").trim().slice(0, 20) + "]"; return over + "px overflow at " + window.innerWidth + "px, widest NON-FIXED offender " + name + " right=" + worst[1].toFixed(1); }'
		}
	],
	presence: [
		/* THE POSITIVE CONTROL: the Ledger's own tab bar. Without it, every row
		   below could pass on a page that failed to render at all. */
		{ selector: '.tab-bar .tab-btn', label: 'the Ledger rendered (its own tabs, Transfers the fifth since ledger 0402)', expectPresent: 5 },
		{ selector: '#idea-feedback-launch .sfb-trigger', label: 'the official feedback button, server-rendered', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '#idea-feedback-launch .sfb-glyph svg', label: 'the button carries the site control\'s glyph', expectPresent: 1, maxPresent: 1 },
		{ selector: '#idea-feedback-frame.is-open', label: 'the window, open in its frame', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: 'header .idea-ledger-logo .idea-logo', label: 'the emblem lockup, top left', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: 'header a.logo', label: 'no old text mark', expectPresent: 0 },
		/* THE LOOK-ALIKE IS GONE, button and panel both (the rejected design). */
		{ selector: '#idea-ledger-report, #idea-ledger-report-btn', label: 'no look-alike panel or its header button', expectPresent: 0 }
	],
	contrast: [
		{ selector: '#idea-feedback-launch .sfb-word', label: 'the button word on its Ledger key', min: 4.5 }
	],
	tapTargets: [
		{ selector: '#idea-feedback-launch .sfb-trigger', label: 'the feedback button', min: 44 },
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
	orderResult: [
		frameFields(false),
		FRAME_TYPESET_CHECK,
		OFFICIAL_CORNER_CHECK,
		ROOM_INKS_CHECK,
		{
			/* THE REPORT RECORDS THE LEDGER, NEVER THE FRAME. The window's
			   address carries the opener's route, build and room, and the window
			   files the report against that route (`parseEmbedParams`). Read off
			   the frame's own URL, and its note off its own document. */
			label: 'the window files against the Ledger, in its plate, and says a signed-out report carries no name',
			evaluate: `() => {
				const f = document.getElementById('idea-feedback-frame');
				if (!f) return ['NO FRAME'];
				const q = new URL(f.src, location.href).searchParams;
				const note = f.contentDocument?.querySelector('.fb-note')?.textContent || '';
				return [
					'route ' + q.get('route'),
					'plate ' + q.get('plate'),
					'room tokens ' + (Object.keys(JSON.parse(q.get('room') || '{}')).length >= 20 ? 'handed over' : 'MISSING'),
					note.includes('not signed in') && note.includes('carries no name') ? 'says no name' : 'NOTE: ' + note.slice(0, 60),
					f.contentDocument?.querySelector('.site-plate .fb-box') ? 'plate keys' : 'NO PLATE'
				];
			}`,
			expected: ['route /coins', 'plate 1', 'room tokens handed over', 'says no name', 'plate keys']
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
				'() => { const d = document.documentElement; if (d.scrollWidth <= d.clientWidth) return ["not the injected control"]; const offenders = [...document.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().right > d.clientWidth + 0.5); const trigger = document.getElementById("idea-feedback-launch"); const panel = document.getElementById("idea-feedback-frame"); const ours = offenders.filter((e) => (trigger && (e === trigger || trigger.contains(e))) || (panel && (e === panel || panel.contains(e)))); return [ours.length === 0 ? "not the injected control" : "THE INJECTED CONTROL: " + ours.length + " node(s)"]; }',
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
			   overflow" at 1440). A fixed subtree creates no scrollable overflow,
			   so naming that category is what keeps the drawer's six descendants
			   from reading as a finding -- and since prompt 0029 ../checks.mjs
			   makes the same distinction in its own offender list rather than
			   skipping only the fixed element itself. */
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

			   IT MEASURES THE TABS ONCE THE WINDOW HAS CLOSED, AND THAT THE PAGE
			   WAS INERT WHILE IT WAS OPEN (ledger 0396, review round 1). The
			   `prepare` step above opens the window, whose frame covers the
			   viewport, and the launcher now makes every other child of the
			   page's body `inert` while it is up, so the tabs are rightly out of
			   reach then (the first draft of this row looked past the frame in
			   the stack, which `inert` ends: an inert tab is not hit-tested at
			   all). So it reads `inert` on every tab while the window is open,
			   closes the window through its own Escape, hit-tests each tab with
			   the page given back (a launcher that left the page inert fails it
			   by name), and opens the window again for any read after this one. */
			label: 'the page is inert behind the open window, and once it closes all five tabs are inside the viewport and hit-testable',
			evaluate: `async () => {
				const d = document.documentElement;
				const f = document.getElementById('idea-feedback-frame');
				const t = document.querySelector('#idea-feedback-launch .sfb-trigger');
				const btns = [...document.querySelectorAll('.tab-bar .tab-btn')];
				if (btns.length !== 5) return ['EXPECTED 5 TABS, FOUND ' + btns.length, ''];
				if (!f || !t || !f.classList.contains('is-open')) return ['NO OPEN WINDOW', ''];
				const wait = (ms) => new Promise((r) => setTimeout(r, ms));
				const inertOpen = btns.every((b) => !!b.closest('[inert]'));
				const ta = f.contentDocument.querySelector('#fb-msg');
				ta.focus();
				ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
				for (let i = 0; i < 30 && f.classList.contains('is-open'); i++) await wait(100);
				const bad = btns.filter((b) => {
					const r = b.getBoundingClientRect();
					if (r.left < -0.5 || r.right > d.clientWidth + 0.5 || r.width < 1 || r.height < 1) return true;
					const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
					return !(top === b || b.contains(top));
				});
				t.click();
				for (let i = 0; i < 30 && !(f.classList.contains('is-open') && f.contentDocument.querySelector('#fb-msg')); i++) await wait(100);
				return [
					inertOpen ? 'the page behind the open window is inert' : 'THE PAGE BEHIND THE OPEN WINDOW IS NOT INERT',
					bad.length === 0 ? '5/5 reachable once it closes' : 'UNREACHABLE: ' + bad.map((b) => b.textContent.trim()).join(', ')
				];
			}`,
			expected: ['the page behind the open window is inert', '5/5 reachable once it closes']
		}
	]
};
