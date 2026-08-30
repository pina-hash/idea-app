/**
 * The coin desk's read-only student preview, in the room it ships in.
 *
 * `/coin-desk/preview/+page.svelte` mounts `<StudentPreview {data} />` bare and
 * nothing else; the room comes from `/coin-desk/+layout.svelte`, which wraps
 * every area in `.cd-root` and imports `$lib/shell/split.css`. The harness gave
 * it no room at all until this spec's bundle, so every reading anyone had ever
 * taken here was of the portal plate with the split geometry missing.
 *
 * THE ABSENCE ASSERTIONS ARE THE POINT OF THE SURFACE. A preview reveals
 * nothing the caller could not already read and mutates nothing, and in this
 * codebase read-only is STRUCTURAL -- the transports that would write are not
 * handed in, so there is no write to execute. `maxVisible: 0` is the ceiling
 * `expectVisible` cannot express, and CLAUDE.md requires both directions: the
 * positive control is the `preview-body` row above them, which is what says the
 * page rendered a student's view at all rather than an empty shell that
 * trivially contains no controls.
 */
export default {
	path: '/dev/coin-preview',
	label: 'Coin desk student preview (.cd-root)',
	presence: [
		{ selector: '.cd-root .preview-banner', label: 'preview-mode banner', expectPresent: 1 },
		/* THE TYPE CHIPS, WHICH ARE NEW HERE AND ARE THE POSITIVE CONTROL FOR
		   THE ABSENCE ROWS BELOW.
		 *
		 * The coin desk's transaction types gained a tone and a glyph, and
		 * `CoinTransactionRows` is shared -- so the change reaches the STUDENT'S
		 * OWN VIEW as well as the admin's log. That is correct and is the point:
		 * a fine should read as a fine wherever it is rendered. What must NOT
		 * follow it is any ability to act, and that is the pair of claims this
		 * block makes together. Six rows with six glyphs is what says the
		 * fixture rendered a real history; without it "no forms in a read-only
		 * view" would pass on an empty pane. */
		{ selector: '.cd-root .preview-body [data-testid="type-chip"]', label: 'type chips in the student history', expectPresent: 6 },
		{ selector: '.cd-root .preview-body [data-testid="type-chip"] .coin-glyph', label: 'a glyph on every chip', expectPresent: 6 },
		/* A GLYPH NEVER SPEAKS. It sits beside the type's own word, so
		   announcing it would read the type twice; `aria-hidden` on every one. */
		{ selector: '.cd-root .preview-body .coin-glyph:not([aria-hidden="true"])', label: 'no glyph announces itself', expectPresent: 0, expectVisible: 0, maxVisible: 0 },
		{ selector: '.cd-root .preview-body', label: 'the student view itself', expectPresent: 1 },
		/* The room, asserted as a mount rather than assumed from the markup: if
		   `split.css` stopped being imported, `.cd-root` would still be in the
		   DOM and every number here would quietly be the portal's again. */
		{ selector: '.cd-root', label: 'the coin desk room', expectPresent: 1 },
		{ selector: '.cd-root .preview-body form', label: 'no forms in a read-only view', expectPresent: 0, expectVisible: 0, maxVisible: 0 },
		{ selector: '.cd-root .preview-body input[type="file"]', label: 'no file inputs', expectPresent: 0, expectVisible: 0, maxVisible: 0 },
		/* THE THREE CONTROLS THE COIN DESK'S LOG SURFACE HAS AND THIS ONE MUST
		   NOT GAIN. A student's view of their own balance is a READ: the
		   transports that would write are not handed in, so there is no write to
		   execute, and this is what says that stayed true after a shared
		   component grew a new visual vocabulary. */
		{ selector: '.cd-root .preview-body [role="combobox"]', label: 'no category picker in a student view', expectPresent: 0, expectVisible: 0, maxVisible: 0 },
		{ selector: '.cd-root .preview-body button[type="submit"]', label: 'no submit control', expectPresent: 0, expectVisible: 0, maxVisible: 0 },
		{ selector: '.cd-root .preview-body button', label: 'no buttons of any kind in the student view', expectPresent: 0, expectVisible: 0, maxVisible: 0 }
	],
	contrast: [
		{ selector: '.cd-root .preview-banner .text', label: 'banner copy on its fill', min: 4.5 },
		/* ONE ROW PER TONE PRESENT IN THIS FIXTURE. `contrast` reports the WORST
		   match, so a single selector covering all four would hide three
		   readings behind one number. FINE is absent here on purpose -- the
		   fixture has no fine -- and is measured on the picker instead
		   (`coin-desk-state-picker`), where all five appear at once. */
		{ selector: '.cd-root .preview-body .type-chip.award', label: 'AWARD chip (--green)', min: 4.5 },
		{ selector: '.cd-root .preview-body .type-chip.purchase', label: 'PURCHASE chip (--gold)', min: 4.5 },
		{ selector: '.cd-root .preview-body .type-chip.adjustment', label: 'ADJUSTMENT chip (--violet-ink)', min: 4.5 },
		{ selector: '.cd-root .preview-body .type-chip.payout', label: 'PAYOUT chip (--cyan)', min: 4.5 },
		{ selector: '.cd-root .preview-picker label', label: 'picker label on the room plate', min: 4.5 }
	],
	tapTargets: [{ selector: '.cd-root .preview-picker select', label: 'student picker', min: 44 }],
	orderResult: [
		{
			label: 'every type rendered here has its own glyph, and no two share one',
			/* THE SAME CLAIM THE PICKER MAKES, over whichever subset of the five
			   types this fixture's history happens to contain -- derived from
			   what is on screen rather than pinned at five, so a fixture gaining
			   a fine does not turn this red. */
			evaluate:
				'() => { const chips = [...document.querySelectorAll(".cd-root .preview-body [data-testid=type-chip]")]; if (!chips.length) return ["NO CHIPS"]; const types = new Set(chips.map((c) => [...c.classList].find((k) => ["award","fine","purchase","adjustment","payout"].indexOf(k) !== -1))); const glyphs = new Set(chips.map((c) => { const g = c.querySelector(".coin-glyph"); return g && g.dataset.glyph; })); if (types.has(undefined) || glyphs.has(null) || glyphs.has(undefined)) return ["A CHIP HAS NO TYPE OR NO GLYPH"]; return [types.size === glyphs.size ? "1:1 (" + types.size + " types)" : types.size + " types / " + glyphs.size + " glyphs"]; }',
			expected: ['1:1 (4 types)']
		}
	]
};
