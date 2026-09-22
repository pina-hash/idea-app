export default {
	path: '/dev/maps-viewer?state=walls',
	label:
		'IDEA Maps viewer with walls on (decision 36: the typed outline is the INTERIOR face, so the band lies OUTWARD from it)',
	/* THE STATE WHERE THE DECISION IS EITHER TRUE ON SCREEN OR IT IS A
	   SENTENCE IN A COMMENT. The building is 1200 x 800 inches with a 12 inch
	   exterior wall and a 5 inch DEFAULT for its rooms; the Machine Shop names
	   no wall and inherits the 5; the Mill Room names ZERO and must draw a
	   line beside a sibling drawing a band; the Weld Bay is a five-sided room
	   rotated 12 degrees carrying 8 inches, which is the mitered offset.
	   Every number below is read back in INCHES through the drawing's own
	   viewBox, so it is comparable with the typed figure rather than with a
	   pixel count that means nothing on its own. */
	presence: [
		{
			selector: '[data-testid="maps-viewer-frame-wall"]',
			label: 'the frame (the building) draws its own wall band',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-viewer-shape-wall"]',
			label:
				'two of the three drawn rooms carry a band: the Machine Shop (inherited 5) and the Weld Bay (8). The Mill Room is ZERO and draws none, which is the absence that makes zero different from null.',
			expectPresent: 2,
			expectVisible: 2,
			maxPresent: 2
		},
		{
			selector: '[data-testid="maps-viewer-drawing"] a[data-node]',
			label:
				'and all three rooms are still links -- THE POSITIVE CONTROL for the zero above: a drawing with nothing on it would also report "no third band"',
			expectPresent: 3,
			expectVisible: 3
		}
	],
	prepare: [
		{
			/* The bands are server-rendered, but the SCALE the inch/pixel
			   conversion needs only exists once the drawing's own effect has
			   measured it. A geometry line read before that would describe the
			   no-JavaScript page. */
			evaluate: `async () => {
				const started = Date.now();
				for (let attempt = 1; attempt <= 40; attempt += 1) {
					if (document.querySelector('[data-testid="maps-viewer-scale"]')) {
						return 'measured (scale bar present) after ' + attempt + ' poll(s), ' + (Date.now() - started) + 'ms';
					}
					await new Promise((r) => setTimeout(r, 150));
				}
				return 'NEVER MEASURED: no scale bar in 40 polls, ' + (Date.now() - started) + 'ms';
			}`,
			label: 'the drawing has been measured by its own effect (the scale bar exists)'
		},
		{
			evaluate: `() => {
				const svg = document.querySelector('[data-testid="maps-viewer-drawing"] svg');
				const box = svg.getBoundingClientRect();
				const vb = svg.getAttribute('viewBox').split(' ').map(Number);
				const pxPerIn = box.width / vb[2];
				const frame = document.querySelector('[data-testid="maps-viewer-frame-wall"]');
				const walls = [...document.querySelectorAll('[data-testid="maps-viewer-shape-wall"]')];
				return 'window ' + window.innerWidth + 'x' + window.innerHeight
					+ ', drawing ' + Math.round(box.width) + 'x' + Math.round(box.height) + 'px'
					+ ', viewBox ' + vb.map((v) => Math.round(v)).join(' ') + ' in'
					+ ', scale ' + pxPerIn.toFixed(4) + ' px/in'
					+ ', frame wall typed ' + frame.dataset.thicknessIn + 'in = ' + (Number(frame.dataset.thicknessIn) * pxPerIn).toFixed(2) + 'px on screen'
					+ ', shape walls typed ' + walls.map((w) => w.dataset.thicknessIn + 'in').join(' and ');
			}`,
			label: 'the geometry: drawing size, the viewBox in inches, and what a typed wall measures on screen'
		}
	],
	orderResult: [
		{
			label:
				'THE INNER FACE DID NOT MOVE: a 1200 x 800 building with a 12 inch wall is still 1200 x 800 of usable space',
			/* Decision 36's central promise, read off the drawing rather than
			   off the data: the frame RECT is the typed outline, and it has to
			   be exactly the typed numbers with a wall on the building. If the
			   outline had been read as a centerline or an exterior this is the
			   line that would move. */
			evaluate: `() => {
				const rect = document.querySelector('.mv-frame');
				const w = Number(rect.getAttribute('width'));
				const h = Number(rect.getAttribute('height'));
				const x = Number(rect.getAttribute('x'));
				const y = Number(rect.getAttribute('y'));
				return [
					'interior ' + w + ' x ' + h + ' in',
					x === 0 && y === 0 ? 'with its origin still at 0,0' : 'ORIGIN MOVED to ' + x + ',' + y
				];
			}`,
			expected: ['interior 1200 x 800 in', 'with its origin still at 0,0']
		},
		{
			label:
				'THE BAND LIES OUTWARD, AND IT IS THE TYPED THICKNESS ON EVERY SIDE',
			/* The band is an evenodd annulus of two subpaths. Its bounding box
			   in USER UNITS is the exterior; the frame rect is the interior;
			   the difference on each side must be the typed number. Reading
			   getBBox rather than a screen rect is what makes the answer
			   inches, so it is comparable with what somebody typed. */
			evaluate: `() => {
				const wall = document.querySelector('[data-testid="maps-viewer-frame-wall"]');
				const t = Number(wall.dataset.thicknessIn);
				const b = wall.getBBox();
				const rect = document.querySelector('.mv-frame');
				const ix = Number(rect.getAttribute('x'));
				const iy = Number(rect.getAttribute('y'));
				const iw = Number(rect.getAttribute('width'));
				const ih = Number(rect.getAttribute('height'));
				const near = (a, want) => Math.abs(a - want) < 0.01;
				return [
					'left ' + (ix - b.x).toFixed(2) + 'in',
					'top ' + (iy - b.y).toFixed(2) + 'in',
					'right ' + ((b.x + b.width) - (ix + iw)).toFixed(2) + 'in',
					'bottom ' + ((b.y + b.height) - (iy + ih)).toFixed(2) + 'in',
					near(ix - b.x, t) && near(iy - b.y, t) && near((b.x + b.width) - (ix + iw), t) && near((b.y + b.height) - (iy + ih), t)
						? 'all four equal the typed ' + t + 'in'
						: 'NOT THE TYPED THICKNESS (' + t + 'in)'
				];
			}`,
			expected: [
				'left 12.00in',
				'top 12.00in',
				'right 12.00in',
				'bottom 12.00in',
				'all four equal the typed 12in'
			]
		},
		{
			label:
				'AN INHERITED DEFAULT REACHES A ROOM THAT NAMED NO WALL, AND AN EXPLICIT ZERO STOPS IT',
			/* The pair that proves two columns were needed. The Machine Shop
			   carries nothing and draws the building's 5 inch DEFAULT -- not
			   the building's own 12 inch exterior, which is the error a single
			   inherited column would have made. The Mill Room carries zero and
			   draws nothing at all. */
			evaluate: `() => {
				const walls = [...document.querySelectorAll('[data-testid="maps-viewer-shape-wall"]')];
				const typed = walls.map((w) => Number(w.dataset.thicknessIn)).sort((a, b) => a - b);
				const shapes = [...document.querySelectorAll('[data-testid="maps-viewer-drawing"] a[data-node]')];
				const walled = new Set(walls.map((w) => w.dataset.nodeWall));
				const bare = shapes.filter((a) => !walled.has(a.dataset.node));
				return [
					'bands at ' + typed.join('in and ') + 'in',
					typed.includes(5) ? 'the inherited 5 reached the room that named nothing' : 'NO INHERITED 5',
					!typed.includes(12) ? 'and the building own 12 did NOT leak down' : 'THE 12 LEAKED DOWN',
					bare.length === 1 ? 'one room draws no band at all: ' + bare[0].querySelector('title').textContent.split(' (')[0] : bare.length + ' ROOMS WITH NO BAND'
				];
			}`,
			expected: [
				'bands at 5in and 8in',
				'the inherited 5 reached the room that named nothing',
				'and the building own 12 did NOT leak down',
				'one room draws no band at all: Mill Room'
			]
		},
		{
			label:
				'THE MITERED POLYGON: a five-sided room rotated 12 degrees keeps its corner count and grows by the typed 8 inches',
			/* The polygon offset is real arithmetic rather than a box grown by
			   t, so the evidence is that the OUTER ring has the same number of
			   corners as the inner one and is not axis-aligned. A bounding-box
			   offset would produce four corners and a square answer. */
			evaluate: `() => {
				const walls = [...document.querySelectorAll('[data-testid="maps-viewer-shape-wall"]')];
				const poly = walls.find((w) => Number(w.dataset.thicknessIn) === 8);
				if (!poly) return ['NO 8in WALL'];
				const d = poly.getAttribute('d');
				const rings = d.split('Z').filter((p) => p.trim().length > 0);
				const corners = rings.map((r) => (r.match(/[ML]/g) || []).length);
				// The inner ring is the shape's own path, already in the DOM as
				// the sibling <path> -- so if the two ring corner counts match
				// the offset kept every corner rather than squaring off.
				const shape = poly.parentElement.querySelector('path:not(.mv-wall)');
				const shapeCorners = (shape.getAttribute('d').match(/[ML]/g) || []).length;
				return [
					'two rings of ' + corners.join(' and ') + ' corners',
					corners[0] === corners[1] ? 'outer and inner have the same corner count' : 'CORNER COUNT CHANGED',
					corners[1] === shapeCorners ? 'and the inner ring is the room path itself (' + shapeCorners + ' corners)' : 'INNER RING IS NOT THE ROOM PATH'
				];
			}`,
			expected: [
				'two rings of 5 and 5 corners',
				'outer and inner have the same corner count',
				'and the inner ring is the room path itself (5 corners)'
			]
		},
		{
			label: 'THE WALL IS NOT A TAP TARGET: the pointer belongs to the room, not to its wall',
			/* A band that swallowed the pointer would make the room next door
			   harder to reach on a phone, so it is `pointer-events: none` and
			   this hit-tests that rather than reading the declaration. */
			/* THE ASSERTION IS THAT THE HIT IS NOT THE BAND, not that it is any
			   particular element. What it lands on legitimately DIFFERS by
			   width -- measured, `svg` at 1440 and the room's own `path` at
			   375, because the band is 3.4px there and a point two pixels in
			   from its edge is already over the room. Both are correct and
			   naming one of them would have made this check width-dependent
			   for no gain. It also sweeps EVERY band rather than the first, so
			   a second one that did take the pointer could not hide behind the
			   first. */
			evaluate: `() => {
				const walls = [...document.querySelectorAll('[data-testid="maps-viewer-shape-wall"]'), document.querySelector('[data-testid="maps-viewer-frame-wall"]')].filter(Boolean);
				const declared = walls.every((w) => window.getComputedStyle(w).pointerEvents === 'none');
				const landings = walls.map((w) => {
					const b = w.getBoundingClientRect();
					const hit = document.elementFromPoint(Math.round(b.left + 2), Math.round(b.top + b.height / 2));
					return hit === w ? 'THE BAND' : (hit ? hit.tagName.toLowerCase() : 'nothing');
				});
				// The landing ELEMENT is width-dependent, so it is reported for
				// the reader and kept OUT of the compared sentence: this check
				// compares element for element, so folding a varying name into
				// the string would make it fail at one width for no defect.
				console.info('[walls] hit-test landings: ' + landings.join(', '));
				return [
					declared ? 'all ' + walls.length + ' bands declare pointer-events none' : 'A BAND TAKES THE POINTER',
					!landings.includes('THE BAND') ? 'and no hit test lands on a band' : 'A HIT TEST LANDED ON A BAND',
					// The POSITIVE CONTROL: a sweep that found no bands would
					// report "no hit test landed on a band" perfectly happily.
					landings.length === 3 ? 'over all 3 of them' : 'ONLY ' + landings.length + ' BAND(S) FOUND'
				];
			}`,
			expected: [
				'all 3 bands declare pointer-events none',
				'and no hit test lands on a band',
				'over all 3 of them'
			]
		}
	]
};
