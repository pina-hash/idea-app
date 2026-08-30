export default {
	path: '/dev/classroom-inspector?case=assignment&open=0',
	label: 'Item inspector COLLAPSED: the grading console reachable with no expansion and no scroll',
	/* THE WHOLE POINT OF ITEM 3. The "Open grading console" link is inside the
	   assignment block, several blocks down the inspector body, so reaching it
	   from the item page cost opening the tools AND scrolling. The header
	   shortcut renders on the same condition and points at the same href; what
	   has to be true is that it is on screen, hit-testable and 44px with the
	   body NOT rendered at all. */
	presence: [
		{ selector: '#item-inspector-body', label: 'inspector body (must be collapsed)', expectPresent: 0, maxVisible: 0 },
		{ selector: '[data-testid="insp-quick-grade"]', label: 'Grade shortcut', expectPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			label: 'grade shortcut: [inViewport, hitsSelf, scrollY, sameHrefAsInBodyLink?]',
			evaluate: `() => {
				const g = document.querySelector('[data-testid="insp-quick-grade"]');
				if (!g) return ['missing'];
				const r = g.getBoundingClientRect();
				const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
				return [
					r.top >= 0 && r.bottom <= window.innerHeight,
					!!(hit && (hit === g || g.contains(hit))),
					window.scrollY,
					!document.querySelector('#item-inspector-body')
				];
			}`,
			expected: [true, true, 0, true]
		}
	],
	tapTargets: [{ selector: '[data-testid="insp-quick-grade"]', label: 'Grade shortcut', min: 44 }],
	contrast: [{ selector: '[data-testid="insp-quick-grade"]', label: 'Grade shortcut label', min: 4.5 }],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
