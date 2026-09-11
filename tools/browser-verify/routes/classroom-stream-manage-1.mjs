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
		}
	]
};
