export default {
	path: '/dev/maps-media',
	label:
		'IDEA Maps media: what a picked photo becomes before it is stored, and whether a unique-constraint refusal is retried',
	/* WHY THIS SURFACE IS DRIVEN IN A REAL BROWSER AND NOT IN `tests/`.
	   Both decisions here are invisible everywhere they ship:

	   - The transcode needs `createImageBitmap` and `canvas.toBlob`. happy-dom
	     has neither a raster pipeline nor a layout engine, so a `tests/dom/`
	     version of this would either throw or return a number computed by
	     nothing -- the vacuous-pass shape this repo has shipped seven of. The
	     PURE half (which formats are in the transcode set) IS asserted in
	     `tests/maps-photo-prepare.test.ts`; everything below it needs pixels.

	   - `retryable` is never rendered on any real surface. A refusal wrongly
	     marked retryable looks exactly like one correctly marked so: the same
	     sentence and a Retry that will never win. So the harness renders the
	     flag and this spec reads it.

	   The FIXTURES are built by the browser under test (`canvas.toBlob`), which
	   is the same call the transcode itself makes. One is not camera bytes and
	   the page says so on screen; the `fixture caveat` presence row below is
	   what stops that admission from being quietly deleted. */
	prepare: [
		{
			waitFor: `() => !!document.querySelector('[data-testid="maps-media-prepare"]')
				&& !!document.querySelector('[data-testid="maps-media-refusals"]')`,
			label: 'both fixture runs have finished'
		}
	],
	presence: [
		{
			selector: '[data-testid="maps-media-prepare"] > li',
			label: 'one row per picked-file fixture',
			expectPresent: 5,
			maxPresent: 5,
			expectVisible: 5
		},
		{
			selector: '[data-testid="maps-media-refusals"] > li',
			label: 'the two rule-shaped constraints and the race control beside them',
			expectPresent: 3,
			maxPresent: 3,
			expectVisible: 3
		},
		{
			selector: '[data-testid="maps-media-prepare"] [data-outcome="error"]',
			label: 'NO fixture failed to build -- an error row means the measurement below is about nothing',
			expectPresent: 0
		},
		{
			/* The positive control for that zero is the `outcome` orderResult
			   below, which names an outcome for every one of the five rows. */
			selector: '[data-testid="maps-media-prepare"] [data-outcome="converted"]',
			label: 'at least one fixture really was re-encoded',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-media-caveat"]',
			label:
				'every fixture that is not camera bytes says so ON SCREEN -- describing a substitute as equivalent is the failure this row exists for',
			expectPresent: 2,
			maxPresent: 2,
			expectVisible: 2
		},
		{
			selector: '[data-testid="maps-media-prepare-pending"]',
			label: 'NO pending state left over once the fixtures have run',
			expectPresent: 0
		}
	],
	orderResult: [
		{
			label: 'EVERY PICKED FILE GETS THE RIGHT ONE OF THE THREE OUTCOMES',
			/* The whole B2 rule in one measurement, read off the rendered rows.
			   `heic-decodable` is the one that matters: a browser that CAN
			   decode the file must store a JPEG, not the HEIC. */
			evaluate: `() => [...document.querySelectorAll('[data-testid="maps-media-prepare"] > li')]
				.map((li) => li.getAttribute('data-case') + '=' + li.getAttribute('data-outcome'))`,
			expected: [
				'jpeg-passthrough=kept',
				'heic-decodable=converted',
				'heic-undecodable=refused',
				'svg-refused=refused',
				'oversize-refused=refused'
			]
		},
		{
			label: 'THE TRANSCODE PRODUCED DIFFERENT BYTES, IN A DIFFERENT FORMAT, UNDER A NEW NAME',
			/* A pass-through that merely CLAIMED to have converted would satisfy
			   the outcome row above. This reads what actually came out: the type
			   changed, the extension changed, and the stored object is a
			   different size from the file the picker handed over. */
			evaluate: `() => {
				const li = document.querySelector('[data-testid="maps-media-prepare"] [data-case="heic-decodable"]');
				if (!li) return ['no row'];
				const src = li.querySelector('[data-testid="maps-media-source"]').textContent;
				const text = li.textContent.replace(/\\s+/g, ' ');
				const srcBytes = Number((src.match(/ (\\d+)B/) || [])[1]);
				const outBytes = Number((text.match(/stored as: [^ ]+ (\\d+)B/) || [])[1]);
				return [
					src.includes('IMG_0042.HEIC') ? 'picked a .HEIC' : 'picked something else: ' + src,
					src.includes('type=(empty)') ? 'with an empty File.type' : 'type was declared',
					text.includes('image/heic -> image/jpeg') ? 'converted to jpeg' : 'NOT converted: ' + text,
					/\\.jpg /.test(text.match(/stored as: [^ ]+ /) || '') ? 'renamed .jpg' : 'kept its name',
					Number.isFinite(srcBytes) && Number.isFinite(outBytes) && outBytes !== srcBytes
						? 'bytes changed'
						: 'BYTES IDENTICAL (' + srcBytes + ' vs ' + outBytes + ')'
				];
			}`,
			expected: [
				'picked a .HEIC',
				'with an empty File.type',
				'converted to jpeg',
				'renamed .jpg',
				'bytes changed'
			]
		},
		{
			label: 'A FORMAT THIS BROWSER CANNOT DECODE IS REFUSED BY NAME, AND SAYS WHAT TO DO',
			/* The Chrome case. The alternative -- upload it and hope -- is the
			   defect: a photo that renders for nobody, found weeks after the
			   person walked away from the drawer. */
			evaluate: `() => {
				const li = document.querySelector('[data-testid="maps-media-prepare"] [data-case="heic-undecodable"]');
				if (!li) return ['no row'];
				const text = li.textContent.replace(/\\s+/g, ' ');
				return [
					li.getAttribute('data-outcome'),
					text.includes('HEIC') ? 'named the format' : 'did not name it: ' + text,
					text.includes('Most Compatible') ? 'said what to do' : 'no remedy offered'
				];
			}`,
			expected: ['refused', 'named the format', 'said what to do']
		},
		{
			label: 'AN ALREADY-UNIVERSAL FILE IS PASSED THROUGH AS THE SAME OBJECT, NOT RE-ENCODED',
			/* Re-encoding a JPEG somebody already has costs a generation of
			   quality for nothing. `same object: true` is the strongest form of
			   that claim available -- identity, not equality. */
			evaluate: `() => {
				const li = document.querySelector('[data-testid="maps-media-prepare"] [data-case="jpeg-passthrough"]');
				if (!li) return ['no row'];
				const text = li.textContent.replace(/\\s+/g, ' ');
				return [
					li.getAttribute('data-outcome'),
					text.includes('same object: true') ? 'byte-identical' : 'RE-ENCODED: ' + text
				];
			}`,
			expected: ['kept', 'byte-identical']
		},
		{
			label: 'A UNIQUE INDEX THAT IS A RULE IS NEVER RETRIED; ONE THAT IS A RACE STILL IS',
			/* The B1 rule and its own positive control in one read. The third
			   row is the control: without it, "nothing is retryable" would pass
			   this and would be a narrowing of the shared whitelist rather than
			   a partition. */
			evaluate: `() => [...document.querySelectorAll('[data-testid="maps-media-refusals"] > li')]
				.map((li) => li.getAttribute('data-constraint') + '=' + li.getAttribute('data-retryable'))`,
			expected: [
				'maps_stock_one_row_per_placement=false',
				'maps_nodes_elevation_slot=false',
				'some_upsert_that_really_did_race=true'
			]
		},
		{
			label: 'AND THE TWO PERMANENT ONES SAY SOMETHING A PERSON CAN ACT ON',
			/* A refusal that hands back `duplicate key value violates unique
			   constraint "maps_nodes_elevation_slot"` is a refusal nobody can do
			   anything about. Both halves: the sentence is there AND the raw
			   driver text is not. */
			evaluate: `() => {
				const rows = [...document.querySelectorAll('[data-testid="maps-media-refusals"] > li')];
				const msg = (c) => {
					const li = rows.find((r) => r.getAttribute('data-constraint') === c);
					return li ? li.querySelector('[data-testid="maps-media-refusal-message"]').textContent.replace(/\\s+/g, ' ').trim() : '';
				};
				const stock = msg('maps_stock_one_row_per_placement');
				const slot = msg('maps_nodes_elevation_slot');
				const race = msg('some_upsert_that_really_did_race');
				return [
					stock.includes('already placed in that container') ? 'placement worded' : 'not worded: ' + stock,
					slot.includes('elevation slot') ? 'slot worded' : 'not worded: ' + slot,
					stock.includes('duplicate key') || slot.includes('duplicate key') ? 'LEAKED THE DRIVER TEXT' : 'no driver text',
					race.includes('duplicate key') ? 'race keeps the database message' : 'race was reworded: ' + race
				];
			}`,
			expected: ['placement worded', 'slot worded', 'no driver text', 'race keeps the database message']
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-media"]',
			label: 'the surface states what each half is for, so a number here is readable without the spec',
			must: ['picked photo', 'unique-constraint refusal']
		}
	],
	contrast: [
		{ selector: '[data-testid="maps-media"] .harness-note', label: 'the harness note', min: 4.5 },
		{ selector: '[data-testid="maps-media"] .hint', label: 'the explanatory copy', min: 4.5 },
		{ selector: '[data-testid="maps-media"] .case', label: 'the fixture names', min: 4.5 },
		{ selector: '[data-testid="maps-media"] .outcome', label: 'the outcome line', min: 4.5 },
		{
			selector: '[data-testid="maps-media-caveat"]',
			label: 'the fixture caveat, which is the one thing on this page nobody may skim past',
			min: 4.5
		},
		{ selector: '[data-testid="maps-media"] .src', label: 'the file/source detail', min: 4.5 }
	]
};
