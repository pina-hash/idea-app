export default {
	path: '/dev/classroom-stream?manage=1',
	label: 'Class stream: unit panels in balanced columns, at a class shape with one long unit',
	/*
		THE DEFECT THIS ROUTE EXISTS FOR. Mr. Pina, 2026-09-09, at 1196x1304 on
		/classroom/<section>: "a large empty column runs down the LEFT while
		every unit panel is crammed into the right half". Measured on this
		fixture at that width before the fix, two 529px columns: Unit 1 ended at
		y=364.5 and the next card in that column began at y=1077.8, so 713.3px
		of the left column was dead while Unit 2's 902.5px panel filled the
		right. `.stream` was a `grid-template-columns: repeat(auto-fit, ...)`
		and a grid ROW is as tall as its tallest member, so one long unit beside
		a short one kills the short one's column for its whole height.

		/dev/classroom-split's own fixture cannot show it. Its three units are
		of comparable height, which is the shape the grid always handled; a real
		class is one unit with a term of posts and the next with three. That
		difference IS the defect, so it needed a fixture of its own rather than
		a widening of somebody else's.

		EVERY STRING WAS PRESENT THROUGHOUT. A presence or textContains row
		would have been green on the broken page at every width, which is why
		the rows below measure the GEOMETRY the groups landed in.
	*/
	presence: [
		{ selector: '[data-testid="unit-group"]', label: 'unit panels', expectPresent: 5, maxPresent: 5 }
	],
	orderResult: [
		/*
			NO DEAD RUN INSIDE A COLUMN. Walks each column of group cards top to
			bottom and reports the largest gap between one card's bottom and the
			next card's top. The 12px row gap is the only gap there should be;
			the threshold is 40px so a future card with a little more margin does
			not read as a finding, and 713px could never hide under it.

			The trailing row is the VACUITY CONTROL. It reports how many stacked
			PAIRS were actually compared, not how many columns there are: the
			harness drives every route at 375 and 1440 only, and the column count
			is a function of the width, so a count of columns would be a finding
			at one width and a tick at the other. A pair count of zero is the
			state where this check measures nothing, and that is what it must be
			unable to hide.

			1196px -- the width the defect was reported at -- is not one of the
			two the harness drives, and does not need to be: what it is is a
			two-column width, and 1440 is a three-column one. The mechanism is
			the same at both, and the fix is measured at 1196 by hand in this
			bundle's history entry.
		*/
		{
			label: 'no dead run down a column (largest gap between stacked panels)',
			evaluate: `async () => {
				const stream = document.querySelector('.stream');
				if (!stream) return ['no stream'];
				const cards = [...stream.children].map((el) => el.getBoundingClientRect());
				const cols = new Map();
				for (const b of cards) {
					const key = Math.round(b.x);
					if (!cols.has(key)) cols.set(key, []);
					cols.get(key).push(b);
				}
				let worst = 0;
				let pairs = 0;
				for (const list of cols.values()) {
					list.sort((a, b) => a.top - b.top);
					for (let i = 1; i < list.length; i++) {
						pairs++;
						worst = Math.max(worst, list[i].top - list[i - 1].bottom);
					}
				}
				return [
					worst <= 40 ? 'largest gap within 40px' : 'largest gap ' + Math.round(worst) + 'px',
					pairs > 0 ? 'panels were compared' : 'nothing stacked, so this check is vacuous'
				];
			}`,
			expected: ['largest gap within 40px', 'panels were compared']
		},
		/*
			AND NO DEAD COLUMN BESIDE THEM. The other half of the same decision:
			multicol cuts as many columns as the width holds and simply leaves a
			spare one empty, where the `auto-fit` grid this replaced COLLAPSED an
			unused track. Measured before `.stream`'s column-count ceiling, two
			groups at 1440px: two 426px columns at x=57 and x=507 against the
			1326px the stream had to spend, i.e. 450px of it empty at the right.
			This reads the gap between the stream's own right edge and the
			right-most card.
		*/
		{
			label: 'no unused column width at the right of the stream',
			evaluate: `async () => {
				const stream = document.querySelector('.stream');
				if (!stream) return ['no stream'];
				const sb = stream.getBoundingClientRect();
				const right = [...stream.children].reduce((a, el) => Math.max(a, el.getBoundingClientRect().right), 0);
				const dead = Math.round(sb.right - right);
				return [dead <= 2 ? 'the columns fill the stream' : dead + 'px of unused width at the right'];
			}`,
			expected: ['the columns fill the stream']
		},
		/*
			THE META LINE LOSES NOTHING, AT EITHER WIDTH (ledger 0281).

			`.row-meta` carried `white-space: nowrap; overflow: hidden;
			text-overflow: ellipsis` -- the exact rule `.row-title` shed when it
			was fixed -- and the row has nowhere near the width for one line.
			Measured at 1196x1304 in manage mode on /dev/classroom-split, whose
			rows carry the management controls this fixture's do not: a row is
			select(30) + grip(44) + expand(30) + main(177) + menu(32), so its text
			column is 143px with an item open, against 349px of content. The
			visible text was "Assignment · Due Thu, Au" -- the ellipsis was not
			trimming a tail, it was eating the due time and the points, which are
			the two fields the person reading the row acts on.

			EVERY STRING WAS PRESENT THROUGHOUT, which is why this is geometry and
			not a `textContains` row: `textContent` returns the whole sentence
			whether or not a character of it was ever painted, so a text check is
			green on the clipped page at every width. `scrollWidth` against
			`clientWidth` is the only read that tells the two apart.

			This fixture's items carry no category, so its longest line is
			"Assignment · Due <date> · N pts" -- about 265px against a 241px
			box at 375 -- which is what makes the check bite on THIS route rather
			than be a claim about a surface it cannot reach. At 1440 the box is
			324px and the same line fits on one line, so the 375 pass is the one
			doing the work and the 1440 pass is the control that the arrangement
			costs a second line only where it must.

			The trailing row is the VACUITY CONTROL, and it counts the lines that
			COULD overflow -- the ones carrying a due segment -- rather than all
			of them: a fixture of nothing but "Material · Aug 13" would pass this
			with no work done, and that is the state it must be unable to hide.

			A BACKSLASH CANNOT BE WRITTEN STRAIGHT INTO AN `evaluate` BODY, and
			nothing reports it. The body is a TEMPLATE LITERAL in this file, and a
			template literal eats an unrecognised escape -- a whitespace regex
			written the ordinary way reaches the page as /s+/g, which matches the
			LETTER s and turns "Assignment" into "A ignment". It throws nothing
			and the check simply answers wrong. Measured here, not reasoned about:
			this check's first draft normalised its text that way and reported
			every line as carrying no due date. Double any backslash, or write the
			predicate without one, which is what it does now. A BACKTICK cannot
			appear in one either -- it closes the literal, and that IS a loud
			failure (the whole spec file stops parsing).
		*/
		{
			label: 'no meta field is cut off (every .row-meta against its own box)',
			evaluate: `async () => {
				const metas = [...document.querySelectorAll('.row-meta')];
				if (!metas.length) return ['no .row-meta on the page'];
				let worst = 0;
				let clipped = 0;
				for (const el of metas) {
					const over = el.scrollWidth - el.clientWidth;
					if (over > 1) clipped++;
					if (over > worst) worst = over;
				}
				// NO TRAILING SPACE, AND NO REGEX -- two separate traps, and this
				// control caught both on its own first run, which is the whole
				// reason it is here. The markup wraps, so the template puts a
				// newline and tabs between "Due" and the date and a non-breaking
				// space in front of it: a plain includes of "Due " with a trailing
				// space answers FALSE on a line that plainly carries one. And the
				// obvious repair, normalising the whitespace with a regex, cannot
				// be written in here at all -- see the note under this check.
				const withDue = metas.filter((el) => el.textContent.includes('Due')).length;
				return [
					clipped === 0
						? 'every meta line fits its box'
						: clipped + ' meta line(s) clipped, worst by ' + Math.round(worst) + 'px',
					withDue > 0
						? 'due-dated meta lines were compared'
						: 'no meta line carries a due date, so this check is vacuous'
				];
			}`,
			expected: ['every meta line fits its box', 'due-dated meta lines were compared']
		},
		/*
			AND NO FIELD RUNS OUT OF THE LINE SIDEWAYS. The other half of the same
			decision: the fix is a WRAP, so the failure mode it replaces the
			ellipsis with is a piece too wide for the box pushing out of it
			instead of breaking. A field is unbreakable by construction -- "N pts"
			is held together with a non-breaking space so a number is never parted
			from its unit -- so this is what says the remaining ones can still
			break when the pane is narrow enough to need it.

			It reads each piece's right edge against its line's own right edge,
			which is a different question from the check above: `scrollWidth`
			answers whether the BOX overflowed, and a piece can only be reported
			here once wrapping is what is holding the line together.
		*/
		{
			label: 'no meta field runs past the right edge of its line',
			evaluate: `async () => {
				const metas = [...document.querySelectorAll('.row-meta')];
				let worst = 0;
				let bits = 0;
				for (const el of metas) {
					const right = el.getBoundingClientRect().right;
					for (const bit of el.querySelectorAll('.meta-bit')) {
						bits++;
						const over = bit.getBoundingClientRect().right - right;
						if (over > worst) worst = over;
					}
				}
				return [
					worst <= 1 ? 'every field is inside its line' : 'a field runs ' + Math.round(worst) + 'px past the line',
					bits > 0 ? 'fields were measured' : 'no .meta-bit found, so this check is vacuous'
				];
			}`,
			expected: ['every field is inside its line', 'fields were measured']
		}
	]
};
