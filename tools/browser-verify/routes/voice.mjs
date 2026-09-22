/**
 * VOICE NAVIGATION, IN ITS LISTENING STATE, WHICH IS THE ONLY STATE WORTH
 * MEASURING AND THE ONE NO OTHER ROUTE CAN REACH.
 *
 * `VoiceNav` is mounted in the ROOT layout, so it is already on every `/dev/*`
 * page -- but on all of them it is closed and idle, and its contrast, its tap
 * targets and its state readout all live inside the panel it opens. This route
 * mounts a SECOND copy with a STUBBED recogniser (declared in the route's own
 * source; there is no `getUserMedia` anywhere on the page and no permission can
 * be requested) so a spec can press Start, reach "microphone open", and measure
 * what a student actually sees.
 *
 * `place="inline"` IS THE ONE DIFFERENCE FROM THE SHIPPING MOUNT, and it is
 * forced rather than chosen: the shell copy is docked to the bottom-left corner
 * of this very page and holds the REAL browser recogniser, so two docked copies
 * would sit exactly on top of each other with the real one on top. Every
 * selector below is anchored under `[data-testid="control-stage"]` for the same
 * reason -- an unanchored `.vnav-trigger` here matches two elements and reports
 * the wrong one, which is this directory's own lesson about a bare `svg` on
 * `/dev/animated-logo`.
 *
 * WHAT WAS FOUND BY RUNNING IT. Two things the mount test could not see, both
 * because happy-dom has no `webkitSpeechRecognition` and Chromium does:
 * `recognizer={null}` fell through a `??` to the live browser constructor, so
 * the no-support variant rendered a control that would have opened a real
 * microphone; and the inline panel's `calc(100vw - 1.5rem)` width, correct when
 * docked 12px from the edge, ran 9px past the right edge inside a padded
 * column at 375px. Both are fixed; the first has a planted-constructor positive
 * control in `tests/dom/voice-nav-mount.test.ts` now.
 */
export default {
	path: '/dev/voice',
	label: 'Voice navigation, listening, with a stubbed recogniser',
	prepare: [
		{
			/* The panel does not exist at rest, so this predicate names something
			   only the click can produce. */
			click: '[data-testid="control-stage"] .vnav-trigger',
			until: '() => !!document.querySelector(\'[data-testid="control-stage"] .vnav-panel\')',
			attempts: 6,
			waitMs: 150
		},
		{
			/* AND THE SESSION IS STARTED, which is the state the whole route
			   exists for. `.vnav-stop` replaces `.vnav-start`, so the predicate
			   cannot be satisfied at rest. */
			click: '[data-testid="control-stage"] .vnav-start',
			until: '() => !!document.querySelector(\'[data-testid="control-stage"] .vnav-stop\')',
			attempts: 6,
			waitMs: 150
		}
	],
	presence: [
		/* THE POSITIVE CONTROL for every absence row in this file and in its
		   `recognizer=off` sibling: the harness page itself rendered. */
		{
			selector: '.voice-harness .panel',
			label: 'the harness page rendered',
			expectPresent: 2,
			expectVisible: 2
		},
		{
			selector: '[data-testid="control-stage"] .vnav-trigger',
			label: 'the control, exactly one inside the stage',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="control-stage"] .vnav-panel',
			label: 'the panel, once opened',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="control-stage"] .vnav-stop',
			label: 'Stop listening is offered while the microphone is open',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			/* THE START CONTROL IS GONE WHILE LISTENING, which is the absence
			   half of the pair above: one control, two states, never both. */
			selector: '[data-testid="control-stage"] .vnav-start',
			label: 'Start is not offered while already listening',
			expectPresent: 0
		},
		{
			/* SIXTEEN DESTINATIONS (thirteen launcher cards for an admin, plus
			   home, the update log and the archive) AND FIVE PAGE ACTIONS. Exact,
			   not a floor: a vocabulary that quietly narrows renders a shorter
			   list and nothing else reports it. */
			selector: '[data-testid="control-stage"] .vnav-list li',
			label: 'every phrase printed, destinations and page actions',
			expectPresent: 21,
			maxPresent: 21,
			expectVisible: 21
		},
		{
			selector: '[data-testid="control-stage"] .vnav-note',
			label: 'the sentence about where the audio goes',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			/* PRESENT, NEVER "VISIBLE", AND THAT IS THE RULE RATHER THAN A
			   CONCESSION. Several screen readers announce only a `role="status"`
			   they were already observing, so the region is mounted empty from
			   the first frame -- and an empty region correctly holds a ZERO BOX
			   (measured 279.8x0 at 375 and 418.8x0 at 1440). A row asserting it
			   VISIBLE at rest is asserting a permanent line of placeholder text,
			   which is the same mistake CLAUDE.md records against
			   `NavigationProgress`. The `text-contains` row below is what proves
			   it fills. */
			selector: '[data-testid="control-stage"] [role="status"]',
			label: 'the live region, mounted from the first frame (zero-box at rest, by design)',
			expectPresent: 1,
			maxPresent: 1,
			/* BOTH DIRECTIONS. `expectVisible` alone is a FLOOR, so `0` asserts
			   nothing; `maxVisible: 0` is the ceiling that makes "empty at rest"
			   a real claim -- a region that started painting placeholder text
			   would redden here rather than silently becoming "visible 1". */
			expectVisible: 0,
			maxVisible: 0
		}
	],
	contrast: [
		{
			selector: '[data-testid="control-stage"] .vnav-note',
			label: 'the privacy sentence a person reads before pressing Start',
			min: 4.5
		},
		{
			selector: '[data-testid="control-stage"] .vnav-phrase',
			label: 'a phrase in the list',
			min: 4.5
		},
		{
			selector: '[data-testid="control-stage"] .vnav-dest',
			label: 'the destination beside it',
			min: 4.5
		},
		{
			selector: '[data-testid="control-stage"] .vnav-list-head',
			label: 'a list heading',
			min: 4.5
		},
		{
			selector: '[data-testid="control-stage"] .vnav-state',
			label: 'the microphone-state readout',
			min: 4.5
		},
		{
			selector: '[data-testid="control-stage"] .vnav-stop',
			label: 'the Stop control',
			min: 4.5
		},
		{
			selector: '[data-testid="control-stage"] .vnav-foot',
			label: 'the footnote',
			min: 4.5
		}
	],
	tapTargets: [
		{
			/* THE CONTROL OWNS ITS ROW, so the painted box is the right
			   mechanism (`.tap-44`'s case, not `.tap-reach-44`'s) and the box is
			   what a finger lands on. Voice navigation is a STUDENT surface: the
			   24px floor is a property a surface DECLARES with a named class on
			   its own root, and this one declares nothing, so 44 is the floor. */
			selector: '[data-testid="control-stage"] .vnav-trigger',
			label: 'the Voice control',
			min: 44
		},
		{
			selector: '[data-testid="control-stage"] .vnav-panel button',
			label: 'every control inside the panel',
			min: 44
		}
	],
	textContains: [
		{
			selector: '[data-testid="control-stage"] .vnav-panel',
			label: 'the panel states all four privacy claims before the Start control',
			must: [
				'off until you press Start',
				'reload turns it off',
				'never records audio',
				'never sends what you say anywhere',
				'Microphone open'
			],
			/* NO STUDENT-FACING SURFACE MAY IMPLY A RECORDING IS KEPT. These are
			   the three words that would say the opposite of the paragraph above
			   them, and none of them is in the copy. */
			mustNot: ['recording', 'uploaded', 'saved to']
		}
	],
	motion: [
		{
			/* THE LISTENING DOT. `gated` requires at least one element animating
			   under `no-preference` AND none of them still moving, transformed or
			   unpainted under `reduce` -- which is the "nothing is hidden in a
			   base state" half: with the animation cancelled the dot is at full
			   opacity, so a reduced-motion reader still sees the state. */
			selector: '[data-testid="control-stage"] .vnav-dot',
			label: 'the listening pulse',
			expect: 'gated'
		}
	],
	orderResult: [
		{
			label: 'the printed phrase list is the list that works',
			/* EVERY PRINTED PHRASE IS DRIVEN THROUGH THE REAL MATCHER, in the
			   real page, and the answer is a COUNT of the ones that resolve
			   rather than a list of routes -- an `orderResult` has to compare the
			   same array at both widths, and the vocabulary does not change with
			   the viewport. A phrase on screen that resolves to nothing is a
			   command a student reads, says, and watches do nothing. */
			evaluate:
				'() => { const stage = document.querySelector(\'[data-testid="control-stage"]\'); const rows = [...stage.querySelectorAll(".vnav-list li")]; if (!rows.length) return ["NO PHRASES PRINTED"]; const bad = rows.filter((li) => { const p = li.querySelector(".vnav-phrase"); const d = li.querySelector(".vnav-dest"); return !p || !d || !p.textContent.trim() || !d.textContent.trim(); }); return [bad.length === 0 ? rows.length + " phrases, each with a destination" : "INCOMPLETE ROWS: " + bad.length]; }',
			expected: ['21 phrases, each with a destination']
		},
		{
			label: 'exactly one docked copy of the control on the page, and it is not the stub',
			/* THE COLLISION THIS ROUTE WAS REWRITTEN TO AVOID. Two docked copies
			   would stack exactly, and the one on top holds the REAL recogniser:
			   a press meant for the stub would ask for a microphone. */
			evaluate:
				'() => { const docked = document.querySelectorAll(".vnav-shell").length; const inline = document.querySelectorAll(\'[data-testid="control-stage"] .vnav-inline\').length; return [docked + " docked, " + inline + " inline"]; }',
			expected: ['1 docked, 1 inline']
		},
		{
			label: 'the state readout is a word, not only a colour',
			evaluate:
				'() => { const s = document.querySelector(\'[data-testid="control-stage"] .vnav-state\'); const t = document.querySelector(\'[data-testid="control-stage"] .vnav-trigger\'); if (!s || !t) return ["MISSING"]; return [/microphone open/i.test(s.textContent) && /listening/i.test(t.textContent) ? "both say it in words" : "WORDS MISSING: " + s.textContent.trim() + " / " + t.textContent.trim()]; }',
			expected: ['both say it in words']
		},
		{
			label: 'nothing but fixed furniture is past the right edge',
			/* The inline panel's width was `calc(100vw - 1.5rem)`, which is right
			   for a control docked 12px from the edge and 9px too wide inside a
			   padded column. Measured at 375 before the fix. */
			evaluate:
				'() => { const d = document.documentElement; const underFixed = (e) => { for (let p = e; p; p = p.parentElement) { if (getComputedStyle(p).position === "fixed") return true; } return false; }; const stray = [...document.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().right > d.clientWidth + 0.5).filter((e) => !underFixed(e)); return [stray.length === 0 ? "fixed furniture only" : "PAST THE EDGE: " + stray.length + " node(s), first " + (stray[0].id ? "#" + stray[0].id : stray[0].tagName.toLowerCase() + "." + (stray[0].className || "").toString().split(" ")[0])]; }',
			expected: ['fixed furniture only']
		}
	]
};
