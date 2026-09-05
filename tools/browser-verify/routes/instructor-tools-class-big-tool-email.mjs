export default {
	path: '/dev/instructor-tools?class=big&tool=email',
	label: 'Email the class, oversized roster: the split into several drafts',
	aliasOf: '/dev/instructor-tools?class=big',
	/*
		THE SPLIT BRANCH, WHICH A REAL CLASS DOES NOT REACH.

		Measured: 39 recipients at `first.last@boscotech.net` encode to roughly
		1140 characters, well under the 1800 the module refuses past -- so the
		sibling spec on the ordinary roster renders ONE draft, and this branch
		would otherwise never be driven in a browser at all.

		IT IS THE BRANCH THAT FAILS SILENTLY. A control that built the plan
		correctly and then rendered only its first link produces a message that
		looks sent and is not, to precisely the students who cannot tell. So the
		fixture is deliberately oversized (68 rows) and this spec reads the
		addresses back out of the HREFS THE PAGE ACTUALLY RENDERED rather than
		out of the module -- which is the only way the two can be shown to agree.
	*/
	prepare: [
		{
			click: '[data-testid="tool-email"]',
			until: '() => !!document.querySelector("[data-testid=\'email-panel\']")'
		}
	],
	presence: [
		{ selector: '[data-testid="email-panel"]', label: 'email panel', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="email-draft"]', label: 'several draft links', expectPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="email-plan"]', label: 'the sentence saying how many drafts', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="email-copy"]', label: 'copy all addresses', expectPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			evaluate: `() => {
				const links = [...document.querySelectorAll('[data-testid="email-draft"]')];
				const carried = links.flatMap((a) => {
					const bcc = new URL(a.getAttribute('href'), location.href).searchParams.get('bcc') || '';
					return bcc ? bcc.split(',') : [];
				});
				const listed = (document.querySelector('[data-testid="email-addresses"]')?.textContent || '')
					.split(',').map((s) => s.trim()).filter(Boolean);
				return [
					String(links.length > 1),
					String(carried.length),
					String(new Set(carried).size === carried.length),
					String(carried.length === listed.length),
					String(links.every((a) => a.getAttribute('href').startsWith('mailto:?bcc=')))
				];
			}`,
			expected: ['true', '68', 'true', 'true', 'true'],
			label: 'the class really is split, and every one of the 68 is on exactly one draft'
		},
		{
			/* EVERY RENDERED URL IS UNDER THE CEILING. A chunker that split but
			   still emitted an over-length link would satisfy the row above. */
			evaluate: `() => [String([...document.querySelectorAll('[data-testid="email-draft"]')]
				.every((a) => a.getAttribute('href').length <= 1800))]`,
			expected: ['true'],
			label: 'no rendered mailto exceeds the ceiling'
		},
		{
			evaluate: `() => {
				const t = document.querySelector('[data-testid="email-plan"]')?.textContent || '';
				return [
					String(/\\d+ drafts/.test(t)),
					String(/= 68 students/.test(t)),
					String(t.includes('some of the class will not get it'))
				];
			}`,
			expected: ['true', 'true', 'true'],
			label: 'the note states the split, the total it adds up to, and what happens if only some are sent'
		},
		{
			/* EACH LINK SAYS WHICH DRAFT IT IS AND HOW MANY IT CARRIES, so a
			   window that never opened is noticeable rather than invisible. */
			evaluate: `() => [...document.querySelectorAll('[data-testid="email-draft"]')]
				.map((a) => String(/^Draft \\d+ of \\d+ \\(\\d+\\)$/.test(a.textContent.trim())))`,
			expected: ['true', 'true'],
			label: 'each link names its own place in the sequence and its own count'
		}
	],
	tapTargets: [{ selector: '[data-testid="email-draft"]', label: 'a draft link', min: 44 }],
	contrast: [{ selector: '[data-testid="email-plan"]', label: 'the draft-count sentence', min: 4.5 }]
};
