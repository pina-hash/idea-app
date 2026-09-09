export default {
	path: '/dev/maps-viewer?state=item',
	label:
		'IDEA Maps item card reached by BROWSING (no route in the URL: the card offers the way there, and the copy-link control)',
	/* THE PLACE CARD'S TWO CONTROLS (prompt 0112). A card opened by hand
	   carries "Show me the way" -- a staged route to this thing from the top
	   of the map, which is what a directions control is -- and "Copy link",
	   because the position is the URL. The stage-end spec is the positive
	   control for the first: arrived at by the route, the card withholds it. */
	/* HYDRATION IS PROVEN, NOT WAITED FOR, exactly as the directory spec does
	   it: the copy control is server-rendered and clickable before any
	   handler is attached, and at 375 the first run pressed it a beat too
	   early and reported the control silent. The press is retried until the
	   control answers, and the attempt count is printed. */
	prepare: [
		{
			evaluate: `async () => {
				const started = Date.now();
				for (let attempt = 1; attempt <= 30; attempt += 1) {
					document.querySelector('[data-testid="maps-card-copy"]')?.click();
					await new Promise((r) => setTimeout(r, 300));
					if (document.querySelector('.mv-card-url')) {
						return 'copy control answering after ' + attempt + ' attempt(s), ' + (Date.now() - started) + 'ms';
					}
				}
				return 'COPY CONTROL NEVER ANSWERED in 30 attempts';
			}`,
			label: 'the card is answering, not merely painted (retries the copy control until it speaks)'
		}
	],
	presence: [
		{
			selector: '[data-testid="maps-viewer-card"]',
			label: 'the item card',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-card-way"]',
			label: 'the way there, offered because the card was reached by browsing',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-card-copy"]',
			label: 'the copy-link control',
			expectPresent: 1,
			expectVisible: 1,
			maxPresent: 1
		},
		{
			selector: '[data-testid="maps-viewer-trail"]',
			label: 'NO trail: nobody is on a route',
			expectPresent: 0
		},
		{
			selector: '[data-testid="maps-viewer-stack"]',
			label: 'the drawing of where it is, beside the card',
			expectPresent: 1,
			expectVisible: 1
		}
	],
	orderResult: [
		{
			label: '"SHOW ME THE WAY" STARTS THE ROUTE AT THE TOP OF THE MAP, targeting this item',
			evaluate: `() => {
				const way = document.querySelector('[data-testid="maps-card-way"]');
				if (!way) return ['NO WAY CONTROL'];
				const url = new URL(way.href, location.origin);
				const item = new URL(location.href).searchParams.get('item');
				return [
					url.searchParams.get('at') === null ? 'starts at the top' : 'STARTS PART WAY: ' + url.searchParams.get('at'),
					url.searchParams.get('to') && url.searchParams.get('to').endsWith(item ?? '') ? 'targets this item' : 'WRONG TARGET: ' + url.searchParams.get('to'),
					url.searchParams.get('item') === null ? 'opens no card at the first stage' : 'OPENS THE CARD'
				];
			}`,
			expected: ['starts at the top', 'targets this item', 'opens no card at the first stage']
		},
		{
			label: 'COPY LINK SAYS WHAT IT DID, IN WORDS, whichever answer the clipboard gave',
			/* Headless Chromium may refuse the clipboard; the control then shows
			   the address to copy by hand rather than doing nothing. Either
			   outcome is a sentence on screen. */
			evaluate: `async () => {
				const status = document.querySelector('.mv-card-url');
				const text = (status?.textContent ?? '').trim();
				return [
					status ? 'the control answered in words' : 'NO ANSWER ON SCREEN',
					text.includes('clipboard') || text.includes('Copy this address') ? 'either copied or shown to copy' : 'UNEXPECTED: ' + text.slice(0, 60)
				];
			}`,
			expected: ['the control answered in words', 'either copied or shown to copy']
		}
	],
	textContains: [
		{
			selector: '[data-testid="maps-viewer-card"]',
			label: 'the card names the thing, where it is, and both controls',
			must: ['Dial Caliper', 'Drawer 1', 'Show me the way', 'Copy link']
		}
	],
	contrast: [
		{ selector: '[data-testid="maps-card-way"]', label: 'the way control, in the mark colour', min: 4.5 },
		{ selector: '[data-testid="maps-card-copy"]', label: 'the copy control', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="maps-card-way"]', label: 'Show me the way', min: 44 },
		{ selector: '[data-testid="maps-card-copy"]', label: 'Copy link', min: 44 }
	]
};
