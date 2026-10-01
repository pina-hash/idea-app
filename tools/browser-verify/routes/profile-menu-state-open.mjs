/**
 * THE PROFILE PANEL, OPEN, AT BOTH WIDTHS (ledger 0117, report 23). The
 * `profile-menu.mjs` spec measures the CLOSED trigger's reach; this one
 * presses that trigger (the shipping path, not a mount-open) and measures the
 * panel a student customises their profile in. `?state=open` is only what
 * gives this spec a filename of its own -- the harness page ignores it and
 * the press below is what opens the panel.
 *
 * WHAT WAS THERE BEFORE THIS BUNDLE, measured on the same harness: Edit,
 * Upload image and Use Google photo were ~15px underlined words; the eight
 * presets were ~32px circles eight across with no visible name; Save/Cancel
 * and Dashboard/Sign out were ~30px. Every row below is a control at the
 * 44px floor now, and every preset carries its word.
 *
 * LEDGER 0280 ADDED THE PATHWAY ROWS. This spec is the STATIC half of that
 * control -- it is present, it is six tiles, every tile carries a word, one is
 * checked, they clear 44px and their ink clears 4.5:1 on the tint they are
 * painted on. The two DRIVEN halves are their own specs, because each needs a
 * different stub answer and the stub is fixed at load:
 * `profile-menu-pathway-none-state-pathway.mjs` taps a tile and follows the value through,
 * and `profile-menu-pathway-none-refuse-rls.mjs` forces the write to be declined.
 *
 * AND THE PANEL IS MEASURED AGAINST THE VIEWPORT NOW, which it was not before.
 * Adding a section to an anchored popover is exactly the change that can push
 * its bottom off screen, and this Chromium paints no scrollbar into a
 * screenshot -- so a panel whose last rows are unreachable satisfies every
 * presence row above it. `getBoundingClientRect` is the instrument, not the
 * picture.
 *
 * LEDGER 0298 (report R18) SLIMMED THE PANEL AND MADE IT ITS OWN SCROLLER.
 * The six pathway tiles are one labelled native select; the seventeen
 * presets are behind a `Change picture` disclosure that arrives closed; the
 * panel ends at the viewport's floor (above anything floating there) and
 * scrolls inside itself, with Sign out a sticky footer. This spec used to
 * assert "panel is not its own scroller" and that the DOCUMENT reached the
 * panel's end; that was the shape R18 reported, and the rows below now assert
 * the opposite half: the panel ends inside the window, and scrolling the panel
 * to its end brings its last control above the footer. The picker is opened
 * by pressing its control, so the preset rows measure a state a student
 * reaches, and the classroom's frame is `classroom-profile-menu.mjs`.
 */
import { THEME_ROWS } from './_theme-shared.mjs';

export default {
	path: '/dev/profile-menu?state=open',
	label: 'ProfileMenu panel open: every control at 44px, every preset named',
	prepare: [
		{
			click: '.pm-trigger',
			until: `() => !!document.querySelector('.pm-panel')`,
			label: 'open the panel from the trigger'
		},
		{
			/* THE PICKER ARRIVES CLOSED, printed rather than assumed: a panel
			   that arrived with seventeen tiles open would make every geometry
			   number below a measurement of the panel R18 reported. */
			evaluate: `() => { const t = document.querySelector('[data-testid="pm-picture-toggle"]'); return t ? 'Change picture arrives aria-expanded=' + t.getAttribute('aria-expanded') + ', panel ' + Math.round(document.querySelector('.pm-panel').getBoundingClientRect().height) + 'px tall' : 'NO PICTURE CONTROL'; }`,
			label: 'the picture picker arrives closed'
		},
		{
			click: '[data-testid="pm-picture-toggle"]',
			until: `() => document.querySelector('[data-testid="pm-picture-toggle"]').getAttribute('aria-expanded') === 'true'`,
			label: 'press Change picture and wait for the picker to open'
		},
		{
			click: '.pm-edit',
			until: `() => !!document.querySelector('.pm-name-edit input')`,
			label: 'Edit name opens the inline field and the panel stays open'
		},
		{
			evaluate: `() => { const p = document.querySelector('.pm-panel').getBoundingClientRect(); return 'panel ' + Math.round(p.width) + 'x' + Math.round(p.height) + ' at x=' + Math.round(p.left) + ' (viewport ' + innerWidth + '); right edge ' + Math.round(p.right) + '; off-edge ' + (p.left < 0 || p.right > innerWidth ? 'YES' : 'no'); }`,
			label: 'the panel against the viewport edge'
		},
		{
			/* THE VERTICAL READING, printed rather than asserted, because what it
			   should be is a function of the header the panel is anchored to and
			   this harness's header sits far down its own page. The rows below
			   assert the part that is the COMPONENT's: the panel ends inside the
			   window and its own scroll reaches its last row. */
			evaluate: `() => { const el = document.querySelector('.pm-panel'); const p = el.getBoundingClientRect(); return 'panel top ' + Math.round(p.top) + ' bottom ' + Math.round(p.bottom) + ' of viewport ' + innerHeight + '; scrollHeight ' + el.scrollHeight + ' clientHeight ' + el.clientHeight + '; overflow-y ' + getComputedStyle(el).overflowY; }`,
			label: 'the panel against the viewport floor'
		}
	],
	presence: [
		{ selector: '.pm-panel', label: 'the panel (positive control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* THE RULE, NOT THE COUNT (ledger 0289). These pinned EIGHT, which was
		   the whole registry when this spec was written and which a legitimate
		   change -- report 14 asking for more options -- necessarily broke the
		   moment the set grew to seventeen. Re-pinning to the new number
		   records what last happened and checks nothing. What these rows are
		   actually for is that every preset is a REAL control and carries a
		   WORD: a glyph is not a control's name, a `title` is not discoverable
		   and a phone cannot hover (report 23, ledger 0117). So the count is a
		   FLOOR of the original eight -- the registry is append-only, so it can
		   never be fewer -- and controls are reconciled against words by the
		   `orderResult` probe below rather than by a second literal that would
		   go stale the same way. */
		{ selector: '.pm-preset', label: 'every preset is a control (at least the original eight)', expectPresent: 8, expectVisible: 8 },
		{ selector: '.pm-preset .pm-preset-word', label: 'a word on every preset', expectPresent: 8, expectVisible: 8 },
		{ selector: '.pm-preset[aria-pressed="true"]', label: 'exactly one preset pressed', expectPresent: 1, maxPresent: 1 },
		/* THE PICTURE CONTROL NAMES THE CURRENT PICTURE IN WORDS, so the
		   collapsed row says what a student has without the tiles on screen. */
		{ selector: '[data-testid="pm-picture-toggle"] .pm-pic-now', label: 'the current picture, named on its control', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.pm-name-edit input', label: 'the name field, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* One radio per site theme, from the shared count: this read 2 after
		   Space White made it 3 (ledger 0297), a stale figure on a surface the
		   theme bundle never touched. */
		{ selector: '.pm-theme', label: 'theme radios', expectPresent: THEME_ROWS, maxPresent: THEME_ROWS, expectVisible: THEME_ROWS },
		/* THE PATHWAY CONTROL EXISTS AT ALL, which is the whole of ledger 0280:
		   before it, `ProfileMenu` rendered the chip twice and wrote the column
		   never, so a student who deferred the first-login sheet had no second
		   route to a pathway and met the sheet again a week later. Since ledger
		   0298 it is ONE labelled native select rather than six tiles, and the
		   tiles are gone rather than hidden. */
		{ selector: '.pm-select', label: 'the pathway select', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.pm-select option', label: 'one option per pathway, no placeholder (an option has no box of its own)', expectPresent: 6, maxPresent: 6, expectVisible: 0 },
		{ selector: 'label.pm-label[for]', label: 'the select carries a visible label', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.pm-pathway', label: 'no pathway tiles any more', expectPresent: 0, maxPresent: 0 },
		/* THE SENTENCE. A student choosing a pathway from a menu has none of
		   the sheet's framing around them, so the section says what the value
		   is for and that it is theirs to change. */
		{ selector: '.pm-note', label: 'the pathway sentence', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			/* EVERY PRESET CARRIES EXACTLY ONE NON-EMPTY WORD, whatever the
			   registry holds -- which is what the two pinned counts above used
			   to assert between them, and which survives the set growing. A
			   preset shipped with a glyph and no name is a control nobody can
			   name, and it is invisible to a check that only compares two
			   totals that both moved. The count is printed so a run that
			   rendered no presets cannot report agreement between two zeroes. */
			label: 'every preset control carries exactly one word',
			evaluate: `() => { const c = document.querySelectorAll('.pm-preset').length; const w = document.querySelectorAll('.pm-preset .pm-preset-word').length; const named = [...document.querySelectorAll('.pm-preset')].filter((b) => ((b.querySelector('.pm-preset-word') || {}).textContent || '').trim().length > 0).length; return [c > 0 ? c + ' presets' : 'NO PRESETS RENDERED', c === w && c === named ? 'every one is named' : 'MISMATCH: ' + c + ' controls, ' + w + ' words, ' + named + ' non-empty']; }`,
			expected: ['17 presets', 'every one is named']
		},
		{
			/* THE LABEL NAMES THE SELECT AND THE SELECT HOLDS THE STORED ROW.
			   `for` is resolved rather than trusted, so an id that stopped
			   matching reads as a missing label rather than as a pass. */
			label: 'the label names the select, which shows the stored pathway',
			evaluate: `() => { const l = document.querySelector('label.pm-label[for]'); const s = l ? document.getElementById(l.getAttribute('for')) : null; return [s && s.classList.contains('pm-select') ? 'labelled' : 'LABEL DOES NOT NAME THE SELECT', s ? s.value : 'NO SELECT', document.querySelector('[data-testid="pathway"]').textContent.trim()]; }`,
			expected: ['labelled', 'IDEA', 'IDEA']
		},
		{
			label: 'the panel sits inside the viewport at this width',
			evaluate: `() => { const p = document.querySelector('.pm-panel').getBoundingClientRect(); return [p.left >= 0 && p.right <= innerWidth + 0.5 ? 'inside the viewport' : 'off edge: ' + Math.round(p.left) + '..' + Math.round(p.right) + ' of ' + innerWidth]; }`,
			expected: ['inside the viewport']
		},
		{
			/* NOTHING IN THE PANEL IS UNREACHABLE, AND THE PANEL NO LONGER RUNS
			   PAST THE WINDOW (report R18). With the picker open this panel is
			   taller than the room under this harness's header, so it must end
			   inside the viewport, scroll inside itself, and -- scrolled to its
			   end -- bring its LAST SECTION above the sticky footer. The
			   section is read off the panel rather than named in advance:
			   since the ledger 0298 review Identity comes AFTER the theme, and
			   a row about the last theme radio would have gone on passing while
			   the true last row sat under the footer. A screenshot cannot
			   answer any of that: this Chromium paints no scrollbar into one.
			   The panel's scroll position is put back afterwards, so the rows
			   below measure the state the run reached. */
			label: 'the panel ends inside the window and its own scroll reaches its last row',
			evaluate: `() => { const el = document.querySelector('.pm-panel'); const p = el.getBoundingClientRect(); const was = el.scrollTop; el.scrollTop = el.scrollHeight; const foot = document.querySelector('.pm-actions').getBoundingClientRect(); const secs = el.querySelectorAll(':scope > .pm-section'); const last = secs[secs.length - 1].getBoundingClientRect(); const out = [p.bottom <= innerHeight + 0.5 ? 'ends inside the window' : 'RUNS PAST: bottom ' + Math.round(p.bottom) + ' of ' + innerHeight, el.scrollHeight > el.clientHeight + 1 ? 'scrolls inside itself' : 'DOES NOT SCROLL (' + el.scrollHeight + ' in ' + el.clientHeight + ')', last.bottom <= foot.top + 0.5 ? 'last row clears the footer' : 'LAST ROW UNDER THE FOOTER: ' + Math.round(last.bottom) + ' > ' + Math.round(foot.top)]; el.scrollTop = was; return out; }`,
			expected: ['ends inside the window', 'scrolls inside itself', 'last row clears the footer']
		},
		{
			/* SIGN OUT IS NEVER SCROLLED AWAY: a sticky footer, hit-tested at its
			   own centre so a control painted under something else cannot pass. */
			label: 'Sign out is on screen and takes the press, with the picker open',
			evaluate: `() => { const s = document.querySelector('.pm-signout'); const r = s.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return [r.bottom <= innerHeight + 0.5 && r.top >= 0 ? 'on screen' : 'OFF SCREEN ' + Math.round(r.top) + '..' + Math.round(r.bottom), h && (h === s || s.contains(h)) ? 'hit' : 'COVERED BY ' + (h ? h.tagName + '.' + h.className : 'nothing')]; }`,
			expected: ['on screen', 'hit']
		}
	],
	contrast: [
		{ selector: '.pm-role', label: 'role', min: 4.5 },
		{ selector: '.pm-email', label: 'email', min: 4.5 },
		{ selector: '.pm-label', label: 'section labels', min: 4.5 },
		{ selector: '.pm-preset-word', label: 'preset words', min: 4.5 },
		{ selector: '.pm-preset.selected .pm-preset-word', label: 'the selected preset word on its tint', min: 4.5 },
		{ selector: '.pm-btn', label: 'control words', min: 4.5 },
		{ selector: '.pm-field span', label: 'the name field label', min: 4.5 },
		{ selector: '.pm-link', label: 'the action links', min: 4.5 },
		{ selector: '.pm-theme-note', label: 'theme notes', min: 4.5 },
		/* THE PATHWAY IS A WORD IN THE SELECT NOW (ledger 0298), in the
		   panel's own text tier on `--bg2`; the identity colour is the chip's,
		   which `pathways.ts` inks and `pathways.mjs` measures. */
		{ selector: '.pm-select', label: 'the pathway select value', min: 4.5 },
		{ selector: '.pm-note', label: 'the pathway sentence', min: 4.5 },
		{ selector: '.pm-pic-now', label: 'the current picture, named', min: 4.5 },
		{ selector: '.pm-tier-name', label: 'the preset tier headings (picker open)', min: 4.5 },
		{ selector: '.pm-panel', label: 'the panel edge on the header', min: 3 }
	],
	tapTargets: [
		{ selector: '.pm-btn', label: 'Save name, Cancel, Upload a picture, Use Google photo', min: 44 },
		{ selector: '.pm-name-edit input', label: 'the name field', min: 44 },
		{ selector: '.pm-preset', label: 'every preset control', min: 44 },
		{ selector: '.pm-theme', label: 'the theme radios', min: 44 },
		/* 44px WITH NO EXEMPTION. This is a student-facing surface -- it is the
		   menu on all 69 product pages -- so the 24px instructor floor is not
		   available to it, and the tiles are a box rather than a reach: unlike
		   the trigger, nothing sizes around them. */
		{ selector: '.pm-select', label: 'the pathway select', min: 44 },
		{ selector: '[data-testid="pm-picture-toggle"]', label: 'Change picture', min: 44 },
		{ selector: '.pm-link', label: 'Sign out (and Admin console for an admin)', min: 44 }
	]
};
