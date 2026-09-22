/**
 * THE IDENTITY CONTROLS IN THE PROFILE MENU (ledger 0289, report 15).
 *
 * This is the surface a STUDENT customizes their own identity on, and it is
 * mounted in sixty-nine mastheads -- so everything about it is student-facing
 * at every width, which is the 44px floor rather than the 24px one
 * (IDEA_INTERFACE_STANDARDS 10: the lower floor is a property a surface
 * DECLARES in a named class on its own root, and this surface declares
 * nothing of the kind).
 *
 * WHAT IT MEASURES THAT THE UNIT TESTS CANNOT:
 *
 *   1. THE CONTROLS CLEAR 44px. `tests/dom/` has no layout engine -- it reads
 *      every box as zero -- so a tap-target claim asserted there would pass
 *      vacuously. The swatch grid, the colour wells and the tagline field are
 *      all new and all had to be measured rather than declared.
 *   2. THE WRITE ACTUALLY LANDS, through the component's own `saveProfile` and
 *      the stub client, and the STORED ROW is what says so. The banner renders
 *      nothing at all for an uncustomized identity, so a banner-only check
 *      cannot tell "chose nothing" from "the component failed to mount" -- the
 *      same argument the pathway readout is on this harness for.
 *   3. THE PANEL STILL FITS. Ledger 0280 measured this popover's one problem
 *      list sitting 113px below the fold at 900px after a SINGLE section was
 *      added; this bundle adds five control groups. They are inside a
 *      `Disclosure` that is closed by default for exactly that reason, and the
 *      probe below reads where the Sign out control actually sits once the
 *      section is open.
 *
 * IT DRIVES `?style=set`, so the banner, the badge and the tagline are on
 * screen without pressing six controls first -- and then presses a seventh to
 * prove the write path. The pre-0220 deployment (`?style=absent`, where the
 * whole section must be GONE rather than present and refusing every save) is
 * asserted in `tests/identity-style-shared.test.ts` against
 * `profileStyleReady`, which is where a structural absence belongs; a browser
 * spec for it would be a second URL measuring the same one-line predicate.
 */
export default {
	path: '/dev/profile-menu?style=set',
	label: 'ProfileMenu: a student customizes their own identity',
	prepare: [
		{
			/* WAIT FOR THE LOAD TO HAVE SETTLED BEFORE TOUCHING ANYTHING, and
			   this step is here because it was MEASURED rather than added for
			   tidiness. This harness is `ssr = false`, so `waitForApp` -- which
			   returns on DOM stability -- can return while SvelteKit is still
			   finishing its own first navigation. The trigger click then landed,
			   its `until` was satisfied, and the very next step threw
			   `Execution context was destroyed, most likely because of a
			   navigation` with an ABORTED `__data.json` request behind it. Every
			   measurement after that point was of a page that no longer existed.

			   THE PREDICATE IS THE READOUT'S VALUE, not the element's presence:
			   `style-ready` reads 'yes' only once the profile row has actually
			   reached the component, which is the state the rest of this spec
			   assumes. */
			waitFor: `() => { const r = document.querySelector('[data-testid="style-ready"]'); return !!r && r.textContent.trim() === 'yes'; }`,
			label: 'the profile row has reached the component'
		},
		{
			click: '.pm-trigger',
			until: `() => !!document.querySelector('.pm-panel')`,
			label: 'open the panel from the trigger'
		},
		{
			/* THE SECTION IS CLOSED ON ARRIVAL, which is the restraint rather
			   than a state to skip past: `collapseWhen` constant-true is how
			   "closed by default" is spelled, and it is safe because the signal
			   is LATCHED inside `Disclosure` so a student's own press sticks.
			   Printed rather than assumed, because a section that arrived OPEN
			   would make every geometry number below a measurement of a
			   different panel. */
			evaluate: `() => { const b = [...document.querySelectorAll('.pm-panel .disc-trigger')].find((t) => t.textContent.includes('Identity')); return b ? 'Identity disclosure arrives aria-expanded=' + b.getAttribute('aria-expanded') : 'NO IDENTITY DISCLOSURE -- the section did not render'; }`,
			label: 'the identity section arrives closed'
		},
		{
			/* THE PREDICATE IS `aria-expanded`, NOT THE PRESENCE OF A SWATCH, and
			   that is `Disclosure`'s documented contract rather than a
			   subtlety: "COLLAPSING HIDES, IT NEVER REMOVES" -- the region
			   stays in the DOM and is hidden in CSS so it prints and so
			   reopening costs nothing. A presence predicate therefore ALREADY
			   HELD before the click, the harness correctly refused to fire it
			   ("the predicate ALREADY HELD, so the click never fired -- this
			   step reached no state"), and every control below was measured
			   present-and-invisible. */
			click: '.pm-panel .disc-trigger',
			until: `() => document.querySelector('.pm-panel .disc-trigger').getAttribute('aria-expanded') === 'true'`,
			label: 'expand Identity and wait for aria-expanded'
		},
		{
			evaluate: `() => { const g = (id) => { const e = document.querySelector('[data-testid="' + id + '"]'); return e ? e.textContent.trim() : 'MISSING'; }; return 'before: accent=' + g('accent') + ' badge=' + g('badge') + ' banner=' + g('bg') + ' tagline=' + g('tagline') + ' ready=' + g('style-ready'); }`,
			label: 'the stored identity before the tap'
		},
		{
			/* TAP AN ACCENT AND WAIT FOR THE STORED ROW TO MOVE, not for a
			   class to appear: the write ends in `invalidateAll()` and the
			   readout is the LOAD's value rather than a copy the page kept, so
			   waiting on the row is waiting on the thing that actually
			   persisted. Emerald is index 5 of the nine controls (None first,
			   then the eight presets). */
			/* SCOPED TO THE ACCENT GROUP BY ITS OWN HOOK. `:nth-of-type` counts
			   among SIBLINGS OF THE SAME TYPE, and all four groups are made of
			   buttons -- so `.pm-swatches .pm-swatch:nth-of-type(5)` matched
			   TWO elements, one in the accents and one in the badges. */
			click: '[data-testid="pm-accent"] .pm-swatch:nth-of-type(5)',
			until: `() => document.querySelector('[data-testid="accent"]').textContent.trim() === '#0fbe7a'`,
			label: 'tap the Emerald accent and wait for the stored row'
		},
		{
			evaluate: `() => { const g = (id) => document.querySelector('[data-testid="' + id + '"]').textContent.trim(); return 'after: accent=' + g('accent') + ' badge=' + g('badge') + ' banner=' + g('bg') + ' tagline=' + g('tagline'); }`,
			label: 'the stored identity after the tap'
		}
	],
	presence: [
		/* POSITIVE CONTROLS FIRST. Without them every absence row below is
		   satisfied by a panel that failed to render at all. */
		{ selector: '.pm-panel', label: 'the panel is open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.pm-identity', label: 'the identity section is expanded', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* Nine accents (None + eight), nine badges (None + eight), three banner
		   modes, three effects (None + the two AMBIENT ones). The effect count
		   is the one that carries a rule: an EVENT flourish has no moment to
		   play at on a profile, so `PROFILE_FLOURISHES` filters it out and a
		   fourth control here would mean the derivation had been replaced by a
		   typed-out list. */
		{ selector: '.pm-swatch', label: 'every identity control (9 accents + 9 badges + 3 banners + 3 effects)', expectPresent: 24, maxPresent: 24, expectVisible: 24 },
		{ selector: '.pm-preview .idb', label: 'the live preview is the REAL banner component', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.pm-tagline input', label: 'the tagline field', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* THE BANNER IS SEEDED, so the preview has something to show: `?style=set`
		   carries a gradient, so the wash layer is present. */
		{ selector: '.pm-preview .idb.styled.has-bg', label: 'the seeded style reaches the preview', expectPresent: 1, maxPresent: 1 },
		/* A COLOUR WELL APPEARS ONLY FOR THE MODE THAT USES IT. `?style=set` is
		   a gradient, so there are exactly two -- From and To. A control whose
		   only possible outcome is nothing must not be offered. */
		{ selector: '.pm-color', label: 'two colour wells for a gradient, and no more', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '.pm-error', label: 'no refusal on a write that succeeded', expectPresent: 0 }
	],
	tapTargets: [
		{ selector: '.pm-swatch', label: 'every accent, badge, banner and effect control', min: 44 },
		{ selector: '.pm-color', label: 'the colour wells, measured at the label a finger hits', min: 44 },
		{ selector: '.pm-tagline input', label: 'the tagline field', min: 44 },
		{ selector: '.pm-tagline .pm-btn', label: 'the tagline Save', min: 44 }
	],
	contrast: [
		{ selector: '.pm-swatch .pm-swatch-word', label: 'every control word', min: 4.5, all: true },
		{ selector: '.pm-tier-name', label: 'the preset tier headings', min: 4.5, all: true },
		{ selector: '.pm-hint', label: 'the sentence explaining what identity is for', min: 4.5 },
		{ selector: '.pm-preview .idb-name', label: 'the name on the live preview', min: 4.5 }
	],
	orderResult: [
		{
			/* THE WRITE LANDED AND NOTHING ELSE MOVED WITH IT. Every control on
			   this section writes ONE field through `saveProfile`, so a patch
			   that carried a stale copy of the others would show up here as a
			   second value changing. The banner pair is the one that could:
			   `writeBackground` assembles type and value together because 0220
			   constrains them to appear together, and a patch moving one alone
			   is refused by the database with a sentence no student can act on. */
			label: 'tapping an accent writes exactly that field',
			evaluate: `() => { const g = (id) => document.querySelector('[data-testid="' + id + '"]').textContent.trim(); return [g('accent'), g('badge'), g('bg'), g('tagline')]; }`,
			expected: ['#0fbe7a', 'rocket', 'gradient', 'CAD or nothing']
		},
		{
			/* THE SELECTED CONTROL SAYS SO TO SOMEBODY NOT LOOKING AT THE RING.
			   Colour is never the only signal: `aria-pressed` carries it, and
			   exactly ONE accent may be pressed at a time -- two would mean the
			   selection is being derived from something other than the stored
			   row. */
			label: 'exactly one accent reads pressed, and it is the one that was tapped',
			evaluate: `() => { const accents = document.querySelector('[data-testid="pm-accent"]'); if (!accents) return ['NO ACCENT GROUP']; const pressed = [...accents.querySelectorAll('[aria-pressed="true"]')]; return [pressed.length + ' pressed', pressed.map((p) => p.textContent.trim()).join(',') || 'NONE']; }`,
			expected: ['1 pressed', 'Emerald']
		},
		{
			/* ==================================================================
			   THE LAST CONTROL IN THE PANEL IS STILL REACHABLE WITH THE SECTION
			   OPEN, MEASURED THE WAY THIS PANEL IS ALREADY MEASURED.

			   THE PREDICATE IS `profile-menu-state-open.mjs`'s, DELIBERATELY,
			   and the first draft of this probe invented a second one and was
			   WRONG because of it. It asked whether Sign out was inside the
			   VIEWPORT and reported "AND IT IS UNREACHABLE: bottom 1678 of 900
			   with no scroll" -- which read as a real defect and produced a
			   `max-height` / `overflow-y: auto` on `.pm-panel` that had to be
			   backed out. This panel is NOT its own scroller by design: it is
			   reachable by scrolling the DOCUMENT, which is what the older spec
			   asserts and what it was still asserting while this one claimed a
			   defect. Two probes answering one question is the pair that stops
			   agreeing, and here they disagreed on the very first run.

			   So the question asked is the established one -- is it inside the
			   document's scroll extent -- about the SIGN OUT control
			   specifically, because that is the row this bundle pushed down and
			   the one a student needs after using the section.
			   ================================================================== */
			label: 'sign out is still reachable with the identity section open',
			evaluate: `() => { const out = document.querySelector('.pm-signout'); const panel = document.querySelector('.pm-panel'); if (!out || !panel) return ['MISSING: panel=' + !!panel + ' signout=' + !!out]; const d = document.documentElement; const bottom = out.getBoundingClientRect().bottom + d.scrollTop; const extent = Math.max(d.scrollHeight, document.body.scrollHeight); return [bottom <= extent + 1 ? 'reachable by scrolling the document' : 'CLIPPED: sign out at ' + Math.round(bottom) + ' past document extent ' + Math.round(extent), panel.scrollHeight <= panel.clientHeight + 1 ? 'the panel is still not its own scroller' : 'THE PANEL BECAME ITS OWN SCROLLER ' + panel.scrollHeight + '>' + panel.clientHeight]; }`,
			expected: ['reachable by scrolling the document', 'the panel is still not its own scroller']
		},
		{
			/* THE PREVIEW IS THE REAL COMPONENT AND IT AGREES WITH THE STORED
			   ROW. A hand-drawn preview is the second implementation that stops
			   matching; this reads the ACCENT off the rendered banner and
			   compares it with the value the database now holds. */
			label: 'the live preview agrees with the stored row',
			evaluate: `() => { const stored = document.querySelector('[data-testid="accent"]').textContent.trim(); const card = document.querySelector('.pm-preview .idb'); if (!card) return ['NO PREVIEW RENDERED']; const acc = getComputedStyle(card).getPropertyValue('--idb-acc').trim(); return [stored === acc ? 'preview and row agree: ' + stored : 'DISAGREE: row=' + stored + ' preview=' + acc]; }`,
			expected: ['preview and row agree: #0fbe7a']
		}
	]
};
