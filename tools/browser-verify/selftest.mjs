/**
 * NEGATIVE CONTROLS. A check that has never failed has not been tested.
 *
 *   node tools/browser-verify/run.mjs --selftest
 *
 * Every check is put to a pair of fixtures: one built to BREAK it and one built
 * to pass it. Both measured values are printed. A check that comes back green on
 * the broken fixture, or red on the sound one, is a broken instrument -- and
 * this file exits non-zero for it, because unlike the measuring run there IS a
 * right answer here.
 *
 * The fixtures are self-contained documents rather than a mutation of src/. A
 * mutation proves the check once, in a tree that then has to be restored
 * byte-identically; this proves it on every run, for any future session, and
 * touches nothing.
 */
import { launch, openPage, settle, waitUntil, clickUntil } from './browser.mjs';
import {
	horizontalScroll,
	contrast,
	tapTargets,
	tapReach,
	presence,
	textContains,
	domOrder,
	orderResult,
	datalistOrder,
	consoleErrors,
	statePairContrast,
	motionSweep,
	prepareClickResult,
	prepareWaitResult,
	prepareEvalResult
} from './checks.mjs';

const shell = (body, head = '') =>
	`<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
    html,body{margin:0;padding:0;background:#0a0c0b;color:#eae6d8;font:16px/1.4 sans-serif}
    ${head}</style></head><body>${body}</body></html>`;

/* Each case: what to load, which check to run, and which way it must come out. */
const CASES = [
	{
		group: 'horizontal-scroll',
		bad: {
			name: 'a 1200px-wide nowrap row inside a 375px viewport',
			html: shell('<div id="row" style="white-space:nowrap;width:1200px">overflowing content</div>'),
			run: (p) => horizontalScroll(p),
			expect: 'outside'
		},
		good: {
			name: 'the same row constrained to the viewport',
			html: shell('<div id="row" style="max-width:100%;overflow-x:auto"><div style="white-space:nowrap;width:1200px">x</div></div>'),
			run: (p) => horizontalScroll(p),
			expect: 'within'
		}
	},
	{
		group: 'contrast',
		bad: {
			/* The ground is a color-mix on an ancestor and the text is
			   semi-transparent: a regex over computed styles reads neither. */
			name: 'dim text over a color-mix ground, alpha on the text',
			html: shell(
				'<div style="background:color-mix(in srgb, #ffffff 12%, #0a0c0b)"><p id="t" style="color:rgba(234,230,216,0.28)">barely there</p></div>'
			),
			run: (p) => contrast(p, { selector: '#t', min: 4.5, all: true }),
			expect: 'outside'
		},
		good: {
			name: 'the same ground with the platform ink at full alpha',
			html: shell('<div style="background:color-mix(in srgb, #ffffff 12%, #0a0c0b)"><p id="t" style="color:#eae6d8">readable</p></div>'),
			run: (p) => contrast(p, { selector: '#t', min: 4.5, all: true }),
			expect: 'within'
		}
	},
	{
		group: 'contrast (ground resolution)',
		bad: {
			/* Proves the check composites the REAL ancestor ground rather than
			   assuming the page plate: the text would pass on #0a0c0b. */
			name: 'pale ink on a pale card that sits on a dark page',
			html: shell('<div style="background:#d8d4c6;padding:8px"><p id="t" style="color:#eae6d8">on a light card</p></div>'),
			run: (p) => contrast(p, { selector: '#t', min: 4.5, all: true }),
			expect: 'outside'
		},
		good: {
			name: 'dark ink on that same light card',
			html: shell('<div style="background:#d8d4c6;padding:8px"><p id="t" style="color:#14180f">on a light card</p></div>'),
			run: (p) => contrast(p, { selector: '#t', min: 4.5, all: true }),
			expect: 'within'
		}
	},
	{
		group: 'tap-target',
		bad: {
			name: 'a 20px control',
			html: shell('<button id="b" style="width:20px;height:20px;padding:0">x</button>'),
			run: (p) => tapTargets(p, { selector: '#b', min: 44 }),
			expect: 'outside'
		},
		good: {
			name: 'the same control at the 44px floor',
			html: shell('<button id="b" style="min-width:44px;min-height:44px;padding:0">x</button>'),
			run: (p) => tapTargets(p, { selector: '#b', min: 44 }),
			expect: 'within'
		}
	},
	{
		group: 'tap-target (label measurement)',
		bad: {
			name: 'a 22px input in a 22px label',
			html: shell('<label style="display:inline-block;height:22px"><input id="i" type="checkbox" style="width:22px;height:22px;margin:0"></label>'),
			run: (p) => tapTargets(p, { selector: '#i', min: 44 }),
			expect: 'outside'
		},
		good: {
			/* CLAUDE.md: a control wrapped in a label is measured AT THE LABEL,
			   which is what a finger hits. 22px input, 44px label, passes. */
			name: 'the same 22px input in a 44px label',
			html: shell('<label style="display:inline-flex;align-items:center;min-height:44px;min-width:44px"><input id="i" type="checkbox" style="width:22px;height:22px;margin:0"></label>'),
			run: (p) => tapTargets(p, { selector: '#i', min: 44 }),
			expect: 'within'
		}
	},
	{
		/*
			`.tap-reach-44` grows a small control's HIT AREA with a centred
			`::after` pseudo-element rather than growing the control's own box
			(app.css), for a control inside a line of text where inflating the
			box would reflow the writing around it. The ordinary `tapTargets`
			check measures the element's own box, which is BY DESIGN under 44px
			here -- so this fixture reproduces the real CSS mechanism (not a
			simplification of it) and proves `tapReach` measures the REACH
			instead: the bad case has no reach mechanism at all (a plain small
			link), the good case has the actual `.tap-reach-44`/`::after` rule
			pair.
		*/
		group: 'tap-reach (small control, no reach vs the real mechanism)',
		bad: {
			name: 'a 20px-tall inline link with no reach mechanism',
			html: shell('<a id="a" href="#" style="display:inline-block;height:20px;line-height:20px">x</a>'),
			run: (p) => tapReach(p, { selector: '#a', min: 44 }),
			expect: 'outside'
		},
		good: {
			name: 'the same link with the real .tap-reach-44/::after pair',
			html: shell(
				'<a id="a" class="reach" href="#" style="display:inline-block;height:20px;line-height:20px">x</a>',
				'.reach{position:relative}.reach::after{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:max(100%,44px);height:max(100%,44px)}'
			),
			run: (p) => tapReach(p, { selector: '#a', min: 44 }),
			expect: 'within'
		}
	},
	{
		/*
			GEOMETRY ALONE CANNOT SEE THIS ONE: the reach box measures 44px
			either way, so only a HIT TEST catches a neighbouring OPAQUE
			element sitting on top of part of it and stealing the tap
			(CLAUDE.md: "Verify a reach by HIT-TESTING it"). The bad fixture
			overlaps the reach's left edge with a sibling; the good one moves
			the sibling clear of it.
		*/
		group: 'tap-reach (a neighbour steals part of the reach)',
		bad: {
			name: 'an opaque sibling covering the reach’s left edge',
			html: shell(
				'<span style="position:relative;display:inline-block">' +
					'<a id="a" class="reach" href="#" style="display:inline-block;height:20px;line-height:20px">x</a>' +
					'<span style="position:absolute;left:-15px;top:-12px;width:20px;height:44px;background:#000"></span>' +
					'</span>',
				'.reach{position:relative}.reach::after{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:max(100%,44px);height:max(100%,44px)}'
			),
			run: (p) => tapReach(p, { selector: '#a', min: 44 }),
			expect: 'outside'
		},
		good: {
			name: 'the same pair with the sibling clear of the reach',
			html: shell(
				'<span style="position:relative;display:inline-block">' +
					'<a id="a" class="reach" href="#" style="display:inline-block;height:20px;line-height:20px">x</a>' +
					'<span style="position:absolute;left:200px;top:-12px;width:20px;height:44px;background:#000"></span>' +
					'</span>',
				'.reach{position:relative}.reach::after{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:max(100%,44px);height:max(100%,44px)}'
			),
			run: (p) => tapReach(p, { selector: '#a', min: 44 }),
			expect: 'within'
		}
	},
	{
		group: 'presence (present but not visible)',
		bad: {
			/* The exact shape the check exists for: the node IS in the DOM, so a
			   querySelector-count assertion passes while nothing is on screen. */
			name: 'the element is in the DOM at opacity 0',
			html: shell('<div id="card" style="opacity:0">the card</div>'),
			run: (p) => presence(p, { selector: '#card', expectPresent: 1, expectVisible: 1 }),
			expect: 'outside'
		},
		good: {
			name: 'the same element painted',
			html: shell('<div id="card">the card</div>'),
			run: (p) => presence(p, { selector: '#card', expectPresent: 1, expectVisible: 1 }),
			expect: 'within'
		}
	},
	{
		/*
			THE ANCESTOR CASE, WHICH THE CHECK USED TO MISS. `opacity` is NOT an
			inherited property, so a child of an `opacity: 0` parent computes
			opacity 1 and reports itself visible while being painted nowhere --
			the exact false green `presence` exists to prevent. Caught by a live
			`--break invisible` that set opacity 0 on three routes' room wrappers
			and got a clean run back; the group above only ever set opacity on the
			asserted element itself, which is why it passed throughout.
		*/
		group: 'presence (invisible via an ANCESTOR)',
		bad: {
			name: 'the element is opaque but its parent is at opacity 0',
			html: shell('<div style="opacity:0"><div id="card">the card</div></div>'),
			run: (p) => presence(p, { selector: '#card', expectPresent: 1, expectVisible: 1 }),
			expect: 'outside'
		},
		good: {
			name: 'the same nesting with the parent painted',
			html: shell('<div style="opacity:1"><div id="card">the card</div></div>'),
			run: (p) => presence(p, { selector: '#card', expectPresent: 1, expectVisible: 1 }),
			expect: 'within'
		}
	},
	{
		group: 'presence (absent entirely)',
		bad: {
			name: 'the element is not rendered at all',
			html: shell('<div>nothing here</div>'),
			run: (p) => presence(p, { selector: '#card', expectPresent: 1, expectVisible: 1 }),
			expect: 'outside'
		},
		good: {
			name: 'the element is rendered',
			html: shell('<div id="card">the card</div>'),
			run: (p) => presence(p, { selector: '#card', expectPresent: 1, expectVisible: 1 }),
			expect: 'within'
		}
	},
	{
		group: 'dom-order',
		bad: {
			name: 'the "after" element rendered ahead of the "before" element',
			html: shell('<div id="second">second</div><div id="first">first</div>'),
			run: (p) => domOrder(p, { before: '#first', after: '#second', label: 'first before second' }),
			expect: 'outside'
		},
		good: {
			name: 'the "before" element genuinely rendered first',
			html: shell('<div id="first">first</div><div id="second">second</div>'),
			run: (p) => domOrder(p, { before: '#first', after: '#second', label: 'first before second' }),
			expect: 'within'
		}
	},
	{
		group: 'order-result',
		bad: {
			/* The write path recorded an id array, but the wrong one -- the same
			   shape a transport that reorders on the wrong axis, or silently
			   no-ops and leaves a stale write behind, would produce. */
			name: 'the recorded write does not match the expected order',
			html: shell('<script>window.__order = ["a", "c", "b"];</' + 'script>'),
			run: (p) => orderResult(p, { evaluate: '() => window.__order', expected: ['a', 'b', 'c'] }),
			expect: 'outside'
		},
		good: {
			name: 'the recorded write matches the expected order',
			html: shell('<script>window.__order = ["a", "b", "c"];</' + 'script>'),
			run: (p) => orderResult(p, { evaluate: '() => window.__order', expected: ['a', 'b', 'c'] }),
			expect: 'within'
		}
	},
	{
		group: 'datalist-order',
		bad: {
			/* The datalist resolves fine -- the input names it correctly -- but its
			   options are in the WRONG order relative to what the page's own
			   probe function produces. This is the shape a stale or unkeyed
			   `{#each}` over a re-sorted array would render: present, resolved,
			   silently out of order. */
			name: 'a resolved datalist whose options are out of order',
			html: shell(
				'<input id="i" list="dl"><datalist id="dl"><option value="b"></option><option value="a"></option></datalist>' +
					'<script>window.__expected = () => ["a", "b"];</' +
					'script>'
			),
			run: (p) =>
				datalistOrder(p, { inputSelector: '#i', evaluateExpected: '() => window.__expected()', label: 'test' }),
			expect: 'outside'
		},
		good: {
			name: 'the same datalist with its options in the probe’s own order',
			html: shell(
				'<input id="i" list="dl"><datalist id="dl"><option value="a"></option><option value="b"></option></datalist>' +
					'<script>window.__expected = () => ["a", "b"];</' +
					'script>'
			),
			run: (p) =>
				datalistOrder(p, { inputSelector: '#i', evaluateExpected: '() => window.__expected()', label: 'test' }),
			expect: 'within'
		}
	},
	{
		group: 'state-pair-contrast',
		bad: {
			/* THE REAL BUG: an "active" rule that restates the ancestor's own
			   default. `.btn` already sets `color: #78b870`, so an
			   `[aria-pressed='true']` rule repeating the identical colour on the
			   identical ground renders pressed and unpressed IDENTICALLY -- only
			   `aria-pressed` tells them apart, which is invisible to a sighted
			   reader. Both individually clear 4.5:1 by a wide margin, which is
			   exactly why a plain per-element `contrast` check would not catch
			   this. */
			name: 'the pressed button restates the unpressed default (green-on-green)',
			html: shell(
				'<button id="a" class="btn" aria-pressed="true">Active</button>' +
					'<button id="b" class="btn" aria-pressed="false">Inactive</button>',
				'.btn{color:#78b870;background:#0d0c0a;border:0}'
			),
			run: (p) => statePairContrast(p, { activeSelector: '#a', inactiveSelector: '#b', label: 'test pair' }),
			expect: 'outside'
		},
		good: {
			name: 'the pressed button gives up the shared accent it should not have',
			html: shell(
				'<button id="a" class="btn active" aria-pressed="true">Active</button>' +
					'<button id="b" class="btn" aria-pressed="false">Inactive</button>',
				'.btn{color:#a39d92;background:#0d0c0a;border:0}.btn.active{color:#78b870}'
			),
			run: (p) => statePairContrast(p, { activeSelector: '#a', inactiveSelector: '#b', label: 'test pair' }),
			expect: 'within'
		}
	},
	{
		/*
			NOT A CHECK -- a PREPARE MECHANISM, and it gets a control for the same
			reason the checks do. `waitFor` exists so a route whose state arrives
			on an async payload is measured after it lands rather than before, and
			its failure mode is the dangerous kind: if a silent timeout counted as
			success, every measurement after it would be an honest reading of a
			page that had not finished loading, which reads as a surface that
			renders nothing rather than as a step that gave up. So the negative
			control is a predicate that never holds.
		*/
		group: 'wait-for (prepare step)',
		bad: {
			name: 'a predicate that never holds',
			html: shell('<div id="here">nothing else is coming</div>'),
			run: async (p) => {
				const r = await waitUntil(p, '() => !!document.querySelector("#late")', { timeoutMs: 1200 });
				return {
					check: 'wait-for',
					measured: `${r.reason} after ${r.waitedMs}ms`,
					threshold: 'the predicate holds',
					withinThreshold: r.ok
				};
			},
			expect: 'outside'
		},
		good: {
			/* The real shape: the element is not in the document at load and
			   arrives later, which is what an async transport resolving looks
			   like. A `settleMs` short of 300ms would measure the empty page. */
			name: 'an element that arrives 300ms after load',
			html: shell(
				'<div id="here">waiting</div><script>setTimeout(() => { const d = document.createElement("div"); d.id = "late"; document.body.appendChild(d); }, 300)</' +
					'script>'
			),
			run: async (p) => {
				const r = await waitUntil(p, '() => !!document.querySelector("#late")', { timeoutMs: 5000 });
				return {
					check: 'wait-for',
					measured: `${r.reason} after ${r.waitedMs}ms`,
					threshold: 'the predicate holds',
					withinThreshold: r.ok
				};
			},
			expect: 'within'
		}
	},
	{
		/*
			NOT A CHECK EITHER -- the CLICK MECHANISM `prepare` steps use to reach
			a state, and it gets a control for the reason CLAUDE.md names: this
			repo uses `aria-disabled` over `disabled` deliberately, in several
			places, so a blocked control can still explain itself when tapped.
			Playwright's `locator.click()` performs an actionability check that
			treats `aria-disabled="true"` as disabled and refuses to click --
			silently, from the harness's point of view, as a click that "never
			satisfies its predicate". A route driving a blocked control through
			the ordinary click path reads as a dead button and measures nothing
			about what it actually does.
		*/
		group: 'click-through (aria-disabled control)',
		bad: {
			name: "Playwright's own locator.click() refuses an aria-disabled control",
			html: shell(
				'<button id="btn" aria-disabled="true" onclick="document.getElementById(\'out\').textContent=\'clicked\'">Blocked</button>' +
					'<div id="out">not clicked</div>'
			),
			run: async (p) => {
				let clicked = true;
				try {
					await p.locator('#btn').click({ timeout: 1200 });
				} catch {
					clicked = false;
				}
				const text = await p.locator('#out').textContent();
				return {
					check: 'click-through',
					measured: `locator.click() ${clicked ? 'reported success' : 'refused/timed out'}; output reads "${text}"`,
					threshold: 'the tap reaches the control despite aria-disabled',
					withinThreshold: text === 'clicked'
				};
			},
			expect: 'outside'
		},
		good: {
			name: "clickUntil's coordinate click lands on an aria-disabled control",
			html: shell(
				'<button id="btn" aria-disabled="true" onclick="document.getElementById(\'out\').textContent=\'clicked\'">Blocked</button>' +
					'<div id="out">not clicked</div>'
			),
			run: async (p) => {
				const r = await clickUntil(
					p,
					'#btn',
					'() => document.getElementById("out").textContent === "clicked"',
					{ attempts: 3, gapMs: 100 }
				);
				return {
					check: 'click-through',
					measured: `${r.reason} after ${r.attempts} attempt(s)`,
					threshold: 'the tap reaches the control despite aria-disabled',
					withinThreshold: r.ok
				};
			},
			expect: 'within'
		}
	},
	{
		group: 'text-contains (a required phrase went missing)',
		bad: {
			/* The compliance regression exactly: the element is present, it
			   paints, its ink clears 4.5:1, and the attribution is gone.
			   `presence` and `contrast` both come back green on this fixture,
			   which is why this check has to exist at all. */
			name: 'a trademark footer that dropped the rights holder',
			html: shell('<footer class="gt-tm"><p id="tm">SOLIDWORKS is a trademark. IDEA GAUNTLET is an educational tool built at Bosco Tech.</p></footer>'),
			run: (p) =>
				textContains(p, {
					selector: '#tm',
					must: ['SOLIDWORKS is a trademark of Dassault Syst\u00e8mes', 'not affiliated with']
				}),
			expect: 'outside'
		},
		good: {
			/* Whitespace COLLAPSED on both sides: the needle is written on one
			   line and the haystack is wrapped across three, the way the real
			   footer's source is. A check that matched literally would redden
			   the day somebody reflowed a paragraph. */
			name: 'the full sentence, source-wrapped across lines',
			html: shell(
				'<footer class="gt-tm"><p id="tm">SOLIDWORKS is a trademark of Dassault Syst\u00e8mes.\n\t\tIDEA GAUNTLET is an educational tool built at Bosco Tech and is\n\t\tnot affiliated with, sponsored by, or endorsed by Dassault Syst\u00e8mes.</p></footer>'
			),
			run: (p) =>
				textContains(p, {
					selector: '#tm',
					must: ['SOLIDWORKS is a trademark of Dassault Syst\u00e8mes', 'not affiliated with']
				}),
			expect: 'within'
		}
	},
	{
		group: 'text-contains (a forbidden phrase appeared)',
		bad: {
			/* The direction a `must` list cannot see. Every required phrase is
			   still there; one more has been added that reverses the claim. */
			name: 'every required phrase present, plus a claim of endorsement',
			html: shell(
				'<footer class="gt-tm"><p id="tm">SOLIDWORKS is a trademark of Dassault Syst\u00e8mes. IDEA GAUNTLET is not affiliated with them, and is an officially endorsed partner product.</p></footer>'
			),
			run: (p) =>
				textContains(p, {
					selector: '#tm',
					must: ['SOLIDWORKS is a trademark of Dassault Syst\u00e8mes', 'not affiliated with'],
					mustNot: ['officially endorsed', 'in partnership with']
				}),
			expect: 'outside'
		},
		good: {
			name: 'the same required phrases with neither forbidden claim',
			html: shell(
				'<footer class="gt-tm"><p id="tm">SOLIDWORKS is a trademark of Dassault Syst\u00e8mes. IDEA GAUNTLET is not affiliated with, sponsored by, or endorsed by Dassault Syst\u00e8mes.</p></footer>'
			),
			run: (p) =>
				textContains(p, {
					selector: '#tm',
					must: ['SOLIDWORKS is a trademark of Dassault Syst\u00e8mes', 'not affiliated with'],
					mustNot: ['officially endorsed', 'in partnership with']
				}),
			expect: 'within'
		}
	},
	{
		group: 'text-contains (selector matched nothing)',
		bad: {
			/* A selector that matches nothing satisfies "no forbidden phrase
			   appears" perfectly, and would report a clean compliance reading
			   about a footer that is not on the page. The day a class name
			   moves, that is the failure -- silent, and in the reassuring
			   direction. */
			name: 'a mustNot-only assertion against a selector that matches nothing',
			html: shell('<footer class="gt-other"><p>the footer moved to another class</p></footer>'),
			run: (p) => textContains(p, { selector: '#tm', mustNot: ['officially endorsed'] }),
			expect: 'outside'
		},
		good: {
			name: 'the same assertion against the selector it names',
			html: shell('<footer class="gt-tm"><p id="tm">the footer is where the spec says it is</p></footer>'),
			run: (p) => textContains(p, { selector: '#tm', mustNot: ['officially endorsed'] }),
			expect: 'within'
		}
	},
	{
		group: 'presence (maxVisible -- the ceiling expectVisible cannot express)',
		bad: {
			/* `expectVisible` is a FLOOR: `visible >= 0` holds for any number,
			   so every `expectVisible: 0` row in routes.mjs passes on this
			   fixture and reports "visible 1" as if that were the intended
			   reading. GAUNTLET-DESIGN states the FeatureManager rail as a
			   prohibition ("hidden by default; do not make it visible by
			   default"), which is a ceiling, not a minimum. */
			name: 'a rail that must be hidden by default, painting itself open',
			html: shell('<nav id="rail" style="display:block;width:200px;height:300px;background:#123">open</nav>'),
			run: (p) => presence(p, { selector: '#rail', expectPresent: 1, expectVisible: 0, maxVisible: 0 }),
			expect: 'outside'
		},
		good: {
			/* Present in the DOM at a zero box, which is what a collapsed rail
			   and a closed Disclosure both are -- kept so it prints and so
			   reopening costs nothing. */
			name: 'the same rail collapsed: in the DOM, painted nowhere',
			html: shell('<nav id="rail" style="display:none">collapsed</nav>'),
			run: (p) => presence(p, { selector: '#rail', expectPresent: 1, expectVisible: 0, maxVisible: 0 }),
			expect: 'within'
		}
	},
	{
		/* The whole point of the check: a page measured with the animation
		   RUNNING says nothing about what a reduced-motion reader sees. */
		group: 'motion (an animation reduced motion does not switch off)',
		bad: {
			name: 'a spin declared outside any media query',
			html: shell(
				'<div data-mark="x"><span id="g" class="g">g</span></div>',
				'@keyframes spin{to{transform:rotate(360deg)}} .g{display:block;width:20px;height:20px;animation:spin 2s linear infinite}'
			),
			run: (p) => motionSweep(p, [{ selector: '[data-mark="x"]', label: 'ungated' }]),
			expect: 'outside'
		},
		good: {
			name: 'the same spin behind prefers-reduced-motion: no-preference',
			html: shell(
				'<div data-mark="x"><span id="g" class="g">g</span></div>',
				'@keyframes spin{to{transform:rotate(360deg)}} .g{display:block;width:20px;height:20px}' +
					'@media (prefers-reduced-motion: no-preference){.g{animation:spin 2s linear infinite}}'
			),
			run: (p) => motionSweep(p, [{ selector: '[data-mark="x"]', label: 'gated' }]),
			expect: 'within'
		}
	},
	{
		/* "Nothing is hidden in a base state" -- the half a whole-component
		   check cannot see, because the other elements settle correctly. */
		group: 'motion (hidden in the cancelled state)',
		bad: {
			name: 'an element the animation FADES IN, invisible once cancelled',
			html: shell(
				'<div data-mark="x"><span class="a">a</span><span class="b">b</span></div>',
				'@keyframes in{to{opacity:1}} .a,.b{display:block;width:20px;height:20px}' +
					'.b{opacity:0}' +
					'@media (prefers-reduced-motion: no-preference){.a,.b{animation:in 2s linear infinite}}'
			),
			run: (p) => motionSweep(p, [{ selector: '[data-mark="x"]', label: 'fade-in base state' }]),
			expect: 'outside'
		},
		good: {
			name: 'the same pair resting at their authored opacity',
			html: shell(
				'<div data-mark="x"><span class="a">a</span><span class="b">b</span></div>',
				'@keyframes in{to{opacity:1}} .a,.b{display:block;width:20px;height:20px}' +
					'.b{opacity:0.35}' +
					'@media (prefers-reduced-motion: no-preference){.a,.b{animation:in 2s linear infinite}}'
			),
			run: (p) => motionSweep(p, [{ selector: '[data-mark="x"]', label: 'authored resting opacity' }]),
			expect: 'within'
		}
	},
	{
		group: 'motion (a residual transform once the animation is cancelled)',
		bad: {
			name: 'an element parked off its own glyph by a base transform',
			html: shell(
				'<div data-mark="x"><span class="a">a</span></div>',
				'@keyframes slide{to{transform:translateY(0)}} .a{display:block;width:20px;height:20px;transform:translateY(20px)}' +
					'@media (prefers-reduced-motion: no-preference){.a{animation:slide 2s linear infinite}}'
			),
			run: (p) => motionSweep(p, [{ selector: '[data-mark="x"]', label: 'residual transform' }]),
			expect: 'outside'
		},
		good: {
			name: 'the same animation over a base state with no transform',
			html: shell(
				'<div data-mark="x"><span class="a">a</span></div>',
				'@keyframes slide{to{transform:translateY(0)}} .a{display:block;width:20px;height:20px}' +
					'@media (prefers-reduced-motion: no-preference){.a{animation:slide 2s linear infinite}}'
			),
			run: (p) => motionSweep(p, [{ selector: '[data-mark="x"]', label: 'no residual transform' }]),
			expect: 'within'
		}
	},
	{
		/* A sweep that generated no cases satisfies "nothing moves under reduce"
		   perfectly. CLAUDE.md: assert the case count of a generated sweep, so a
		   sweep that generated nothing cannot pass. */
		group: 'motion (the sweep found nothing to animate)',
		bad: {
			name: 'a subtree with no animation anywhere -- a renamed class, silently',
			html: shell('<div data-mark="x"><span class="a">a</span></div>', '.a{display:block;width:20px;height:20px}'),
			run: (p) => motionSweep(p, [{ selector: '[data-mark="x"]', label: 'nothing animated' }]),
			expect: 'outside'
		},
		good: {
			name: 'the same subtree with one gated animation in it',
			html: shell(
				'<div data-mark="x"><span class="a">a</span></div>',
				'@keyframes in{to{opacity:1}} .a{display:block;width:20px;height:20px}' +
					'@media (prefers-reduced-motion: no-preference){.a{animation:in 2s linear infinite}}'
			),
			run: (p) => motionSweep(p, [{ selector: '[data-mark="x"]', label: 'one gated animation' }]),
			expect: 'within'
		}
	},
	{
		/* The FRC direction. Asserted in the RUNNING phase: under reduce a
		   merely-gated animation is indistinguishable from none, which is the
		   one thing this mark may not have. */
		group: "motion (expect 'never' -- the FRC brand rule)",
		bad: {
			name: 'the mark carrying a gated animation, which is still an alteration',
			html: shell(
				'<div data-mark="frc"><span class="a">a</span></div>',
				'@keyframes in{to{opacity:1}} .a{display:block;width:20px;height:20px}' +
					'@media (prefers-reduced-motion: no-preference){.a{animation:in 2s linear infinite}}'
			),
			run: (p) => motionSweep(p, [{ selector: '[data-mark="frc"]', label: 'FRC', expect: 'never' }]),
			expect: 'outside'
		},
		good: {
			name: 'the mark with no animation in either state',
			html: shell('<div data-mark="frc"><span class="a">a</span></div>', '.a{display:block;width:20px;height:20px}'),
			run: (p) => motionSweep(p, [{ selector: '[data-mark="frc"]', label: 'FRC', expect: 'never' }]),
			expect: 'within'
		}
	},
	{
		/*
			THE ABSENCE ROW, WHICH WAS THE MOST-USED SHAPE IN `routes/` AND THE
			ONE THAT COULD NOT FAIL. `expectPresent` is a floor, so
			`expectPresent: 0` meant `present >= 0` and every "must be absent"
			row in this directory -- about 30 of them across both trees -- was
			green whatever the page rendered. Measured on the real surface
			rather than reasoned: an `<svg>` injected into `TrademarkFooter`
			gave `ok presence [no mark of any kind inside the footer] present 1,
			visible 1` and a run reporting 0 outside threshold, on the one row
			whose whole job is `docs/GAUNTLET-DESIGN.md`'s "nominative text
			only, never the logo or a lookalike".

			`expectPresent: 0` now implies a ceiling of 0. The fixture pair is
			the forbidden element present, and the same page without it.
		*/
		group: 'presence (expectPresent 0 is an EQUALITY, not a floor)',
		bad: {
			name: 'the element the row says must be absent is in the DOM',
			html: shell('<footer id="tm"><p>nominative text</p><svg width="8" height="8"><rect width="8" height="8"/></svg></footer>'),
			run: (p) => presence(p, { selector: '#tm svg, #tm img', expectPresent: 0 }),
			expect: 'outside'
		},
		good: {
			name: 'the same footer with no mark in it',
			html: shell('<footer id="tm"><p>nominative text</p></footer>'),
			run: (p) => presence(p, { selector: '#tm svg, #tm img', expectPresent: 0 }),
			expect: 'within'
		}
	},
	{
		/*
			A LIMIT, PROVED RATHER THAN LEFT TO BE REDISCOVERED, which is why
			BOTH slots here expect `within`. No ceiling can tell "the rule holds"
			apart from "the selector matches nothing because the markup was
			renamed" -- `present 0` is the identical reading. The forbidden
			element below is genuinely on the page under a different class, and
			the check correctly and uselessly passes.

			THE ANSWER IS NOT A CLEVERER CHECK, IT IS A POSITIVE CONTROL IN THE
			SAME SPEC, and every absence row in `routes/` has one: the footer's
			own `.gt-tm`, the song queue's `[aria-disabled]` twin, the 30 grid
			cells beside the two absent cell states, the 25 student rows beside
			the eleven manager-only controls. A new absence row without one is
			an assertion about a selector, not about a surface.
		*/
		group: 'presence (an absence row cannot see a RENAMED selector -- the limit)',
		bad: {
			name: 'the forbidden element is present under another class; the row still passes',
			html: shell('<footer id="tm"><p>text</p><svg class="renamed" width="8" height="8"><rect width="8" height="8"/></svg></footer>'),
			run: (p) => presence(p, { selector: '#tm .mark-glyph', expectPresent: 0 }),
			expect: 'within'
		},
		good: {
			name: 'its positive control, which is what actually carries the claim',
			html: shell('<footer id="tm"><p>text</p><svg class="renamed" width="8" height="8"><rect width="8" height="8"/></svg></footer>'),
			run: (p) => presence(p, { selector: '#tm svg, #tm img, #tm picture', expectPresent: 0 }),
			expect: 'outside'
		}
	},
	{
		/*
			THE PRE-CLICK SHORT-CIRCUIT. `clickUntil` checks a step's `until`
			BEFORE clicking and returns "already satisfied" when it holds, which
			is correct and is a trap: a predicate satisfiable by the page's
			RESTING state means the click never physically fires and the report
			still says "clicked". It has bitten twice for real in this repo
			(`/dev/classroom-split/s-1?manage=1` when the bulk bar started
			rendering at rest, `/dev/notebook` when `.pick.free` started
			`aria-pressed` true), and both times the state the spec exists to
			measure was never reached.

			THE FIXTURES DIFFER ONLY IN THE PREDICATE, on purpose: the same
			page, the same control, the same click. `#out` exists at rest, so a
			predicate naming it holds before anything happens; `#out.done` is
			produced by the handler alone. That is the whole distinction a
			prepare predicate has to make.
		*/
		group: 'prepare-click (a predicate the page satisfies at REST)',
		bad: {
			name: 'the `until` already holds, so the click never fires',
			html: shell(
				'<button id="btn" onclick="document.getElementById(\'out\').className=\'done\'">go</button><div id="out">at rest</div>'
			),
			run: async (p) => {
				const step = { click: '#btn', until: '() => !!document.querySelector("#out")' };
				const r = await clickUntil(p, step.click, step.until, { attempts: 3, gapMs: 80 });
				return prepareClickResult(step, r);
			},
			expect: 'outside'
		},
		good: {
			name: 'the same click under a predicate only the click can satisfy',
			html: shell(
				'<button id="btn" onclick="document.getElementById(\'out\').className=\'done\'">go</button><div id="out">at rest</div>'
			),
			run: async (p) => {
				const step = { click: '#btn', until: '() => !!document.querySelector("#out.done")' };
				const r = await clickUntil(p, step.click, step.until, { attempts: 3, gapMs: 80 });
				return prepareClickResult(step, r);
			},
			expect: 'within'
		}
	},
	{
		/* A click with no `until` returns after ONE attempt with nothing
		   verified (`clickUntil`'s own "clicked (no predicate given)" branch).
		   No route spec does this today; the control is what keeps it that way. */
		group: 'prepare-click (a click with no `until` verifies nothing)',
		bad: {
			name: 'no predicate: the step reports success having checked nothing',
			html: shell('<button id="btn">go</button>'),
			run: async (p) => {
				const step = { click: '#btn' };
				const r = await clickUntil(p, step.click, undefined, { attempts: 3, gapMs: 80 });
				return prepareClickResult(step, r);
			},
			expect: 'outside'
		},
		good: {
			name: 'a selector that matches nothing is already reported, and still is',
			html: shell('<button id="btn" onclick="this.id=\'done\'">go</button>'),
			run: async (p) => {
				const step = { click: '#btn', until: '() => !!document.querySelector("#done")' };
				const r = await clickUntil(p, step.click, step.until, { attempts: 3, gapMs: 80 });
				return prepareClickResult(step, r);
			},
			expect: 'within'
		}
	},
	{
		/*
			A PREPARE STEP IS A MEASUREMENT NOW, AND THIS IS THE CONTROL FOR
			THAT. These used to be prose printed above the results, so a step
			that failed outright counted for nothing: a spec given a throwing
			`evaluate`, a `click` matching nothing and a `waitFor` that times
			out reported "4 measurement(s), 0 outside threshold" and `--strict`
			EXITED 0, over a route whose every number described a state the run
			never reached.
		*/
		group: 'prepare-eval / prepare-wait (a step that fails is a FINDING)',
		bad: {
			name: 'an evaluate that throws, and a wait whose predicate never holds',
			html: shell('<div id="here">nothing else is coming</div>'),
			run: async (p) => {
				const evalStep = { evaluate: '() => { throw new Error("boom"); }' };
				const out = await p
					.evaluate(`(${evalStep.evaluate})()`)
					.then((v) => ({ ok: true, v }))
					.catch((e) => ({ ok: false, err: e.message.split('\n')[0] }));
				const evalRow = prepareEvalResult(evalStep, out);
				const waitStep = { waitFor: '() => !!document.querySelector("#late")' };
				const waitRow = prepareWaitResult(waitStep, await waitUntil(p, waitStep.waitFor, { timeoutMs: 800 }));
				return {
					check: 'prepare-step',
					measured: `evaluate: ${evalRow.measured}; wait: ${waitRow.measured}`,
					threshold: 'both steps succeed',
					withinThreshold: evalRow.withinThreshold && waitRow.withinThreshold
				};
			},
			expect: 'outside'
		},
		good: {
			name: 'both steps doing what they say',
			html: shell(
				'<div id="here">waiting</div><script>setTimeout(() => { const d = document.createElement("div"); d.id = "late"; document.body.appendChild(d); }, 200)</' +
					'script>'
			),
			run: async (p) => {
				const evalStep = { evaluate: '() => "settled 1 thing"' };
				const out = await p
					.evaluate(`(${evalStep.evaluate})()`)
					.then((v) => ({ ok: true, v }))
					.catch((e) => ({ ok: false, err: e.message.split('\n')[0] }));
				const evalRow = prepareEvalResult(evalStep, out);
				const waitStep = { waitFor: '() => !!document.querySelector("#late")' };
				const waitRow = prepareWaitResult(waitStep, await waitUntil(p, waitStep.waitFor, { timeoutMs: 5000 }));
				return {
					check: 'prepare-step',
					measured: `evaluate: ${evalRow.measured}; wait: ${waitRow.measured}`,
					threshold: 'both steps succeed',
					withinThreshold: evalRow.withinThreshold && waitRow.withinThreshold
				};
			},
			expect: 'within'
		}
	},
	{
		group: 'console-errors (thrown)',
		bad: {
			name: 'a script that throws on load',
			html: shell('<div>ok</div><script>throw new Error("state_unsafe_mutation (simulated)")</' + 'script>'),
			run: (p, errs) => consoleErrors(errs),
			expect: 'outside'
		},
		good: {
			name: 'a script that does not throw',
			html: shell('<div>ok</div><script>void 0</' + 'script>'),
			run: (p, errs) => consoleErrors(errs),
			expect: 'within'
		}
	},
	{
		group: 'console-errors (console.error)',
		bad: {
			name: 'an explicit console.error',
			html: shell('<div>ok</div><script>console.error("a real error line")</' + 'script>'),
			run: (p, errs) => consoleErrors(errs),
			expect: 'outside'
		},
		good: {
			name: 'a console.warn, which is not an error',
			html: shell('<div>ok</div><script>console.warn("a warning line")</' + 'script>'),
			run: (p, errs) => consoleErrors(errs),
			expect: 'within'
		}
	}
];

async function measure(browser, fixture, width) {
	const { context, page, consoleErrors: errs } = await openPage(browser, { width, blockExternal: false });
	try {
		await page.setContent(fixture.html, { waitUntil: 'load' });
		await settle(page, { settleMs: 250 });
		/* `motionSweep` sweeps every entry in ONE pair of media flips and so
		   returns an ARRAY of results, one per entry. A fixture here hands it a
		   single entry, so take the one row; every other check returns its
		   result object directly. */
		const out = await fixture.run(page, errs);
		return Array.isArray(out) ? out[0] : out;
	} finally {
		await context.close();
	}
}

export async function runSelfTest({ width = 375 } = {}) {
	const { browser, executablePath } = await launch();
	console.log(`\n=== browser-verify self-test (negative controls) ===`);
	console.log(`chromium ${browser.version()} at ${executablePath}, viewport ${width}px\n`);

	let failures = 0;
	try {
		for (const c of CASES) {
			console.log(`${c.group}`);
			for (const kind of ['bad', 'good']) {
				const f = c[kind];
				const r = await measure(browser, f, width);
				const wanted = f.expect === 'within';
				const got = r.withinThreshold;
				const correct = got === wanted;
				if (!correct) failures++;
				/* THE LABEL FOLLOWS `expect`, NOT THE SLOT NAME. Most groups pair
				   a slot that must come out OUTSIDE with one that must come out
				   WITHIN, so bad/good and negative/positive coincided. One group
				   here does not: the renamed-selector group proves a LIMIT, so its
				   `bad` slot is the one expected to PASS (the wrong selector
				   sees nothing) and its `good` slot is the one expected to FAIL
				   (the right selector finds the element). Printing "negative"
				   over a control expected to pass is how the next reader
				   concludes the instrument is broken. */
				console.log(
					`  ${correct ? 'PROVED  ' : 'BROKEN  '}${f.expect === 'outside' ? 'negative' : 'positive'}: ${f.name}`
				);
				console.log(`            measured ${r.measured}   (threshold ${r.threshold})`);
				console.log(
					`            check said ${got ? 'WITHIN' : 'OUTSIDE'} threshold; expected ${wanted ? 'WITHIN' : 'OUTSIDE'}${correct ? '' : '   <-- THE INSTRUMENT IS WRONG'}`
				);
			}
			console.log('');
		}
	} finally {
		await browser.close();
	}

	const slots = CASES.flatMap((c) => [c.bad, c.good]);
	const negative = slots.filter((f) => f.expect === 'outside').length;
	console.log('---');
	console.log(
		`${slots.length} controls run (${negative} negative, ${slots.length - negative} positive), ${failures} instrument failure(s)`
	);
	return failures;
}
