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
 */
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
			click: '.pm-btn',
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
			   this harness's header sits far down its own page. The row below
			   asserts the part that is the COMPONENT's: that the panel can be
			   scrolled to its own end rather than clipping its last rows away. */
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
		{ selector: '.pm-name-edit input', label: 'the name field, open', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.pm-theme', label: 'theme radios', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		/* THE PATHWAY CONTROL EXISTS AT ALL, which is the whole of ledger 0280:
		   before it, `ProfileMenu` rendered the chip twice and wrote the column
		   never, so a student who deferred the first-login sheet had no second
		   route to a pathway and met the sheet again a week later. */
		{ selector: '.pm-pathway', label: 'six pathway tiles', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		{ selector: '.pm-pathway .pm-pathway-word', label: 'a code on every pathway tile', expectPresent: 6, maxPresent: 6, expectVisible: 6 },
		/* THE HARNESS SEEDS `IDEA`, so exactly one tile is checked. Unset is a
		   legal state that checks none of them and is driven on its own spec. */
		{ selector: '.pm-pathway[aria-checked="true"]', label: 'exactly one pathway checked', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* COLOUR IS NOT THE ONLY SIGNAL: the checked tile carries a tick glyph
		   as well as the identity edge and fill. It is inside the checked tile's
		   own word, so this row is also a second reading of which tile is on. */
		{ selector: '.pm-pathway[aria-checked="true"] .pm-pathway-tick', label: 'the tick glyph on the checked tile', expectPresent: 1, maxPresent: 1 },
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
			label: 'the panel sits inside the viewport at this width',
			evaluate: `() => { const p = document.querySelector('.pm-panel').getBoundingClientRect(); return [p.left >= 0 && p.right <= innerWidth + 0.5 ? 'inside the viewport' : 'off edge: ' + Math.round(p.left) + '..' + Math.round(p.right) + ' of ' + innerWidth]; }`,
			expected: ['inside the viewport']
		},
		{
			/* NOTHING IN THE PANEL IS UNREACHABLE. The panel is not itself a
			   scroller, so every row of it has to be reachable by scrolling the
			   DOCUMENT -- which is true exactly when the panel's own box is fully
			   inside the scrollable document rather than running past its end.
			   Asserted from the panel's bottom against `documentElement`'s scroll
			   extent, because a screenshot cannot answer it: this Chromium paints
			   no scrollbar into one, so a clipped panel photographs as a whole
			   one. */
			label: 'the whole panel is reachable by scrolling the document',
			evaluate: `() => { const el = document.querySelector('.pm-panel'); const p = el.getBoundingClientRect(); const d = document.documentElement; const bottom = p.bottom + d.scrollTop; const extent = Math.max(d.scrollHeight, document.body.scrollHeight); return [bottom <= extent + 1 ? 'reachable' : 'clipped: panel bottom ' + Math.round(bottom) + ' past document extent ' + Math.round(extent), el.scrollHeight <= el.clientHeight + 1 ? 'panel is not its own scroller' : 'panel scrolls internally ' + el.scrollHeight + '>' + el.clientHeight]; }`,
			expected: ['reachable', 'panel is not its own scroller']
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
		/* EVERY PATHWAY CODE, ON THE GROUND IT IS ACTUALLY PAINTED ON -- five on
		   `--bg2` and the checked one on its own 12% identity tint. `all: true`
		   is the runner's default for this list, so all six are read rather than
		   the first. `pathways.ts` derives each ink for exactly this case; three
		   of the six raw identities measure 3.31-4.45:1 here. */
		{ selector: '.pm-pathway-word', label: 'the six pathway codes', min: 4.5 },
		{ selector: '.pm-note', label: 'the pathway sentence', min: 4.5 },
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
		{ selector: '.pm-pathway', label: 'the six pathway tiles', min: 44 },
		{ selector: '.pm-link', label: 'Sign out (and Admin console for an admin)', min: 44 }
	]
};
