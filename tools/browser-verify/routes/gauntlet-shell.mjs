// original array position 23 of 25 -- see ../README.md for what `order` means
export const order = 23;

export default {
	path: '/dev/gauntlet-shell',
	label: 'GAUNTLET viewport chrome -- trademark footer, FeatureManager rail, cursor layer',
	/*
		THREE COMPONENTS THE GAUNTLET LAYOUT PUTS ON EVERY PAGE, none of
		which had ever been measured: TrademarkFooter, FeatureTreeNav and
		CursorLayer are mounted in `src/routes/gauntlet/+layout.svelte` and
		were reachable from no dev route at all, so every student in every
		mode has been looking at them and no instrument has.

		The footer is COMPLIANCE-CRITICAL rather than cosmetic
		(docs/GAUNTLET-DESIGN.md: nominative SOLIDWORKS text only, never the
		logo or a lookalike), which is why it gets a `textContains` row and
		an `img/svg` exclusion rather than a presence row. A footer that had
		lost the rights holder from its sentence is present, visible, and
		clears its contrast minimum exactly as before.
	*/
	textContains: [
		{
			selector: '.gt-tm p',
			label: 'trademark disclaimer, verbatim',
			must: [
				'SOLIDWORKS is a trademark of Dassault Systèmes',
				'IDEA GAUNTLET is an educational tool built at Bosco Tech',
				'not affiliated with, sponsored by, or endorsed by Dassault Systèmes'
			],
			/*
				The forbidden half is not decoration: a sentence can keep
				every required phrase and add one that reverses it, and a
				`must` list cannot see that. These are the claims the
				disclaimer exists to deny.
			*/
			mustNot: ['officially endorsed', 'in partnership with', 'a Dassault Systèmes product']
		}
	],
	presence: [
		{ selector: '.gt-tm', label: 'trademark footer', expectPresent: 1, expectVisible: 1 },
		/*
			"Nominative text only, never the logo or a lookalike" as a
			STRUCTURAL exclusion. No image and no inline mark may appear
			inside the footer, in any form.
		*/
		{ selector: '.gt-tm img, .gt-tm svg, .gt-tm picture', label: 'no mark of any kind inside the footer', expectPresent: 0, expectVisible: 0 },
		/*
			GAUNTLET-DESIGN states the FeatureManager rail as a
			PROHIBITION -- "hidden by default; do not make it visible by
			default" -- and the rail is present in the DOM either way, so
			a presence row alone says nothing about it. The claim is the
			`orderResult` reachability probe below; what is asserted HERE
			is only that it exists and is hidden from assistive tech,
			which is the half a hit test cannot see.

			THE FIRST DRAFT OF THIS ROW WAS `maxVisible: 0`, AND IT WAS
			WRONG IN A WAY WORTH WRITING DOWN. At 1440px the collapsed
			rail is not `display: none` -- it is `translateX(calc(-100% -
			1.5rem))` plus `pointer-events: none`, so it keeps a real
			232px box, entirely off the left edge of the viewport, and
			`isVisible` correctly reports it as painted. The ceiling
			therefore reddened on a rail that is behaving exactly as
			designed. `isVisible` does not model "outside the viewport"
			and must not be taught to: `tapReach` already reports
			off-screen sample points as a harness artefact, so changing
			that predicate would move readings on routes this bundle does
			not own. The effect is what gets asserted instead.
		*/
		{ selector: '.gt-tree', label: 'FeatureManager rail, present (display:none at 375, slid off the left edge at 1440)', expectPresent: 1, expectVisible: 0 },
		{ selector: '.gt-tree[aria-hidden="true"]', label: 'collapsed rail hidden from assistive tech', expectPresent: 1, expectVisible: 0 },
		/*
			The tab is `display: none` below 1440px along with the rail it
			reveals, so `expectVisible: 0` is the width-safe floor and the
			printed count is the reading: 0 at 375, 1 at 1440.
		*/
		{ selector: '.gt-tree-tab', label: 'the rail’s reveal tab (display:none below 1440px: 0 visible at 375, 1 at 1440)', expectPresent: 1, expectVisible: 0 },
		/*
			`cursor: none` is applied by CursorLayer adding `.gt-cursor-on`
			to `.gt-root`, and it must not be applied until the first real
			mousemove has seeded the reticle a position -- otherwise there
			is a window in which the native cursor is hidden and nothing
			has replaced it. The harness never moves the mouse before
			measuring, so the class must be absent here.
		*/
		{ selector: '.gt-root.gt-cursor-on', label: 'native cursor NOT hidden before the first mousemove', expectPresent: 0, expectVisible: 0 },
		{ selector: '.gt-cursor-layer', label: 'cursor layer mounted', expectPresent: 1 },
		/*
			The countdown renders NOTHING when inactive, which is its state
			on every page that is not mid-room-start. Absence is the
			mechanism; the alias below is its positive control.
		*/
		{ selector: '.gt-countdown', label: 'countdown overlay, inactive', expectPresent: 0, expectVisible: 0 }
	],
	contrast: [
		{ selector: '.gt-tm p', label: 'trademark disclaimer copy', min: 4.5 },
		{ selector: '.harness h1', label: 'h1 on the VIEWPORT plate', min: 4.5 }
	],
	/*
		THE HIT TEST IS THE HIGHEST-VALUE ROW ON THIS ROUTE. `.gt-cursor-layer`
		is `position: fixed; inset: 0; z-index: 900` -- it covers the entire
		viewport of every GAUNTLET page. It is `pointer-events: none`, and if
		that ever stopped being true the whole section would go unclickable
		with nothing on screen looking wrong and no console error. The probe
		asks the DOM what a tap at the centre of a control actually lands on.
	*/
	orderResult: [
		/*
			"HIDDEN BY DEFAULT" AS THE EFFECT, NOT AS A PROXY FOR IT. The
			rail is unreachable at 375 because it is `display: none`, and
			unreachable at 1440 because it is translated off the left edge
			with `pointer-events: none`. Those are two different
			mechanisms producing one guarantee, and a probe that asked
			about either mechanism would be width-dependent and would go
			green the day the other one changed. This one samples the
			rail's own box, clamped into the viewport, and asks the DOM
			what a pointer at each point actually lands on -- so a rail
			that started painting itself open, by any means, comes back
			'reachable' at both widths.
		*/
		{
			label: 'the FeatureManager rail cannot be reached by a pointer on arrival',
			evaluate:
				'() => { const rail = document.querySelector(".gt-tree"); if (!rail) return ["NO RAIL"]; const r = rail.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return ["unreachable"]; const xs = [0.1, 0.5, 0.9].map((f) => r.left + r.width * f); const ys = [0.1, 0.5, 0.9].map((f) => r.top + r.height * f); for (const x of xs) { for (const y of ys) { if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue; const hit = document.elementFromPoint(x, y); if (hit && (hit === rail || rail.contains(hit))) return ["reachable"]; } } return ["unreachable"]; }',
			expected: ['unreachable']
		},
		{
			label: 'a tap reaches the page through the full-viewport cursor layer',
			evaluate:
				'() => { const b = document.querySelector(\'[data-testid="under-overlay"]\'); if (!b) return ["NO CONTROL"]; b.scrollIntoView({ block: "center", behavior: "instant" }); const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return [hit ? (hit.getAttribute("data-testid") || hit.className || hit.tagName) : "NOTHING"]; }',
			expected: ['under-overlay']
		}
	],
	tapTargets: [{ selector: '.harness .bar button', label: 'harness controls', min: 44 }]
};
