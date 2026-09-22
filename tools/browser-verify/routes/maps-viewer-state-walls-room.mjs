export default {
	path: '/dev/maps-viewer?state=walls-room',
	label:
		'IDEA Maps viewer one level down with walls on -- where a 1 inch wall in a 400 inch room is the SUB-PIXEL case decision 36 asked the renderer to answer',
	/* THE NARROW-WIDTH ANSWER, MEASURED RATHER THAN DESCRIBED. Decision 36
	   said a band with a real dimension reverses `non-scaling-stroke` on
	   purpose and "needs its own answer for how a thin wall reads at 375px,
	   where a literal wall-thickness stroke could be thinner than the hairline
	   it replaces". The answer this bundle gives is that the band is NEVER
	   inflated and the hairline underneath it is the floor: below one device
	   pixel the band thins away and what is left is exactly what was on screen
	   before 0224. This route is where that is either true or a sentence in a
	   comment.

	   The Machine Shop is 400 x 300 inches and inherits the building's 5 inch
	   default; Tool Chest A inside it carries 1 inch. At 375px the chest's
	   wall is well under a device pixel. */
	presence: [
		{
			selector: '[data-testid="maps-viewer-frame-wall"]',
			label: 'the room draws the 5 inch wall it INHERITED, having named none of its own',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-viewer-shape-wall"]',
			label: 'and the tool chest draws its own 1 inch wall, however few pixels that is',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		}
	],
	prepare: [
		{
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
				const chest = document.querySelector('[data-testid="maps-viewer-shape-wall"]');
				const room = document.querySelector('[data-testid="maps-viewer-frame-wall"]');
				const t = Number(chest.dataset.thicknessIn);
				const ft = Number(room.dataset.thicknessIn);
				return 'window ' + window.innerWidth + 'x' + window.innerHeight
					+ ', drawing ' + Math.round(box.width) + 'x' + Math.round(box.height) + 'px'
					+ ', scale ' + pxPerIn.toFixed(4) + ' px/in'
					+ ', the room wall typed ' + ft + 'in = ' + (ft * pxPerIn).toFixed(3) + 'px'
					+ ', the chest wall typed ' + t + 'in = ' + (t * pxPerIn).toFixed(3) + 'px'
					+ ' (' + (t * pxPerIn < 1 ? 'SUB-PIXEL: the hairline is the floor here' : 'over one device pixel') + ')'
					+ ', device pixel ratio ' + window.devicePixelRatio;
			}`,
			label:
				'the geometry, and what the two typed walls actually measure in device pixels at this width'
		}
	],
	orderResult: [
		{
			label:
				'THE BAND IS NEVER INFLATED: a 1 inch wall is 1 inch of the drawing whatever that comes to on screen',
			/* The whole of the narrow-width answer, as arithmetic in USER UNITS
			   rather than pixels: the band's own bounding box minus the shape's
			   is the typed thickness on each side, at EVERY width, because
			   nothing anywhere clamps it to a pixel minimum. A renderer that
			   had taken the other road -- a minimum band width -- would report
			   a number here that grows as the drawing shrinks, which is the
			   drawing lying about the dimension it exists to show. */
			evaluate: `() => {
				const wall = document.querySelector('[data-testid="maps-viewer-shape-wall"]');
				const t = Number(wall.dataset.thicknessIn);
				const shape = wall.parentElement.querySelector('path:not(.mv-wall)');
				const w = wall.getBBox();
				const s = shape.getBBox();
				const sides = [s.x - w.x, s.y - w.y, (w.x + w.width) - (s.x + s.width), (w.y + w.height) - (s.y + s.height)];
				const near = sides.every((v) => Math.abs(v - t) < 0.01);
				return [
					'typed ' + t + 'in',
					'grown ' + sides.map((v) => v.toFixed(3)).join('/') + 'in on each side',
					near ? 'which is the typed thickness exactly, with no pixel floor applied' : 'INFLATED OR SHRUNK'
				];
			}`,
			expected: [
				'typed 1in',
				'grown 1.000/1.000/1.000/1.000in on each side',
				'which is the typed thickness exactly, with no pixel floor applied'
			]
		},
		{
			label:
				'AND THE HAIRLINE IS STILL UNDERNEATH IT, which is what a sub-pixel band degrades to',
			/* The floor. The shape's own path keeps its `non-scaling-stroke`,
			   so whatever the band comes to, a line is drawn -- which is
			   exactly the drawing that was on screen before 0224. Read as a
			   computed style on the real element rather than from the
			   stylesheet, because that is the one that is actually painting. */
			evaluate: `() => {
				const wall = document.querySelector('[data-testid="maps-viewer-shape-wall"]');
				const shape = wall.parentElement.querySelector('path:not(.mv-wall)');
				const cs = window.getComputedStyle(shape);
				const wcs = window.getComputedStyle(wall);
				return [
					cs.vectorEffect === 'non-scaling-stroke' ? 'the shape keeps its non-scaling hairline' : 'HAIRLINE GONE: ' + cs.vectorEffect,
					cs.strokeWidth !== '0px' && cs.stroke !== 'none' ? 'and it is really stroked (' + cs.strokeWidth + ')' : 'NOT STROKED',
					wcs.stroke === 'none' ? 'while the band itself carries no stroke, so one surface draws one line' : 'THE BAND IS ALSO STROKED: ' + wcs.stroke
				];
			}`,
			expected: [
				'the shape keeps its non-scaling hairline',
				'and it is really stroked (1.5px)',
				'while the band itself carries no stroke, so one surface draws one line'
			]
		},
		{
			label: 'THE ROOM INHERITED ITS WALL: 5 inches from the building, not the building own 12',
			evaluate: `() => {
				const room = document.querySelector('[data-testid="maps-viewer-frame-wall"]');
				const t = Number(room.dataset.thicknessIn);
				return [
					'the room draws ' + t + 'in',
					t === 5 ? 'which is the building default it inherited' : 'NOT THE INHERITED DEFAULT',
					t !== 12 ? 'and not the building own exterior' : 'THE EXTERIOR LEAKED DOWN'
				];
			}`,
			expected: [
				'the room draws 5in',
				'which is the building default it inherited',
				'and not the building own exterior'
			]
		}
	]
};
