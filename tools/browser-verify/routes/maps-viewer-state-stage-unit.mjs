export default {
	path: '/dev/maps-viewer?state=stage-unit',
	label:
		'IDEA Maps staged route, mid-walk (the Machine Shop with Tool Chest A marked: step 3 of 5, gold, with a way on and a way to skip)',
	/* THE STAGED ROUTE'S MIDDLE, which is the only place all three of its
	   controls exist at once: the trail, the Next control and the Skip. The
	   ends are measured on the other two stage specs -- and this state is the
	   POSITIVE CONTROL for the directory spec's `maps-viewer-trail` zero and
	   for the room spec's `[data-marked]` zero.

	   THE HIGHLIGHT IS GOLD AND THE CHROME IS GREEN, which is the surface's
	   one colour rule and is measured here rather than asserted: a map's job
	   is to make one found thing leap out of a plan, so if the linework were
	   already in the accent the found thing would have nowhere to go. */
	presence: [
		{
			selector: '[data-testid="maps-viewer-trail"]',
			label: 'the trail, on screen the whole way',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-viewer-next"]',
			label: 'a way on to the next stage',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="maps-viewer-skip"]',
			label: 'and a way straight to the end, for somebody in a hurry',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-marked]',
			label: 'exactly one thing marked at this stage: the next link, on the plan and in the list',
			expectPresent: 2,
			expectVisible: 2,
			maxPresent: 2
		},
		{
			selector: '[data-testid="maps-viewer-card"]',
			label: 'NO item card yet: the route has not arrived',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-viewer-trail"] a.mv-trail-dot',
			label: 'NO trail dot is a link: they are progress marks, and the breadcrumb is the named way back',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-viewer-trail"] .mv-trail-dot',
			/* The reported `aria-hidden` count is the half that matters and the
			   check prints it rather than thresholding it: five marks, painted
			   (they are the progress indicator) and none of them announced,
			   because the sentence beside them already says "Step 3 of 5". */
			label: 'one mark per stage, all five painted, all five aria-hidden',
			expectPresent: 5,
			maxPresent: 5,
			expectVisible: 5,
			maxVisible: 5
		}
	],
	orderResult: [
		{
			label: 'THE MARK IS GOLD, THE CHROME IS GREEN, AND THEY ARE NOT THE SAME COLOUR',
			/* Read off the PAINTED pixels rather than the stylesheet: both are
			   color-mix() over a plate, which a regex over computed styles
			   skips silently. The mark's border is composited to a canvas the
			   way checks.mjs does it. */
			evaluate: `() => {
				const px = (c) => {
					const cv = document.createElement('canvas');
					cv.width = cv.height = 1;
					const ctx = cv.getContext('2d');
					ctx.fillStyle = '#000';
					ctx.fillRect(0, 0, 1, 1);
					ctx.fillStyle = c;
					ctx.fillRect(0, 0, 1, 1);
					const d = ctx.getImageData(0, 0, 1, 1).data;
					return [d[0], d[1], d[2]];
				};
				const marked = document.querySelector('[data-testid="maps-viewer-rows"] [data-marked]');
				const plain = [...document.querySelectorAll('[data-testid="maps-viewer-rows"] .mv-row')]
					.find((el) => !el.hasAttribute('data-marked'));
				if (!marked) return ['NOTHING MARKED'];
				const markBorder = px(getComputedStyle(marked).borderTopColor);
				const heading = px(getComputedStyle(document.querySelector('[data-testid="maps-viewer-head"] h1')).color);
				return [
					// Gold is red-dominant and green-second; the accent is
					// green-dominant. Naming the axis rather than the hex is
					// what keeps this from being a second copy of the palette.
					markBorder[0] > markBorder[2] && markBorder[1] > markBorder[2] ? 'the mark is warm' : 'MARK IS NOT WARM: ' + markBorder.join(','),
					heading[1] > heading[0] && heading[1] > heading[2] ? 'the chrome is green' : 'CHROME IS NOT GREEN: ' + heading.join(','),
					plain && getComputedStyle(plain).borderTopColor !== getComputedStyle(marked).borderTopColor
						? 'a marked row does not look like an unmarked one'
						: 'MARKED AND UNMARKED LOOK ALIKE'
				];
			}`,
			expected: [
				'the mark is warm',
				'the chrome is green',
				'a marked row does not look like an unmarked one'
			]
		},
		{
			label: 'THE NEXT CONTROL ADVANCES EXACTLY ONE LINK, AND THE SKIP ARRIVES',
			evaluate: `() => {
				const next = new URL(document.querySelector('[data-testid="maps-viewer-next"]').href, location.origin);
				const skip = new URL(document.querySelector('[data-testid="maps-viewer-skip"]').href, location.origin);
				const here = new URL(location.href).searchParams.get('at');
				return [
					next.searchParams.get('at') && next.searchParams.get('at') !== here ? 'next moves on' : 'NEXT GOES NOWHERE',
					next.searchParams.get('item') === null ? 'next does not jump to the card' : 'NEXT SKIPS THE WALK',
					skip.searchParams.get('item') ? 'skip opens the card' : 'SKIP DOES NOT ARRIVE',
					next.searchParams.get('q') === 'caliper' && skip.searchParams.get('q') === 'caliper'
						? 'both carry the query'
						: 'QUERY LOST ON THE WAY'
				];
			}`,
			expected: [
				'next moves on',
				'next does not jump to the card',
				'skip opens the card',
				'both carry the query'
			]
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-viewer-trail"]',
			label: 'the stage is numbered and named, so the walk teaches the building',
			must: ['Step 3 of 5', 'Tool Chest A', 'inside Machine Shop']
		},
		{
			selector: '[data-testid="maps-viewer-rows"] [data-marked]',
			label: 'and the mark says so in WORDS as well as in gold',
			must: ['found here']
		}
	],
	contrast: [
		{ selector: '[data-testid="maps-viewer-trail"] .mv-trail-step', label: 'the step counter, in the mark colour', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-trail"] .mv-trail-now', label: 'the stage sentence', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-next"]', label: 'the Next control', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-skip"]', label: 'the Skip control', min: 4.5 },
		{ selector: '[data-testid="maps-viewer-rows"] [data-marked] .mv-found', label: 'the "found here" word on the gold fill', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="maps-viewer-next"]', label: 'Next', min: 44 },
		{ selector: '[data-testid="maps-viewer-skip"]', label: 'Skip to the end', min: 44 },
		{ selector: '[data-testid="maps-viewer-rows"] .mv-row', label: 'every row, marked or not', min: 44 }
	],
	/* NO tapReach ON THE TRAIL DOTS, deliberately, and the reason is in the
	   component beside them: they are aria-hidden progress marks rather than
	   controls. An unlabelled 10px circle could not carry a visible word and
	   five real 44px targets would be 220px of them on a 375px screen -- and
	   what they would navigate to is already reachable BY NAME in the
	   breadcrumb, because for any route the stages ARE the containment chain.
	   The presence row below is what holds them to that: the moment one
	   becomes a link again, it reddens. */
};
