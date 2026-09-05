export default {
	path: '/dev/instructor-tools?tool=email',
	label: 'Email the class: one draft for a real class, BCC, with the instructor left off',
	aliasOf: '/dev/instructor-tools',
	/*
		THE ORDINARY CASE, WHICH TURNED OUT TO BE ONE DRAFT. Measured rather than
		assumed: 39 recipients at `first.last@boscotech.net` encode to roughly
		1140 characters, well under the 1800 the module refuses past. So a real
		class does NOT split, and the sibling spec `?class=big` is where the
		split branch is driven.

		WHAT IS WORTH MEASURING HERE IS WHO IS ON IT. The fixture roster is 41
		rows -- 39 active students, one inactive, and the teacher's own
		enrollment (0138) -- and two of those three must be left off. That is a
		silent failure in both directions: a teacher BCC'd into every class email
		they send, and a student who left the class still receiving its business.
	*/
	prepare: [
		{
			click: '[data-testid="tool-email"]',
			until: '() => !!document.querySelector("[data-testid=\'email-panel\']")'
		}
	],
	presence: [
		{ selector: '[data-testid="email-panel"]', label: 'email panel', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="email-draft"]', label: 'one draft link for a class this size', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="email-plan"]', label: 'the sentence saying how many drafts', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="email-copy"]', label: 'copy all addresses', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="email-addresses"]', label: 'the selectable list', expectPresent: 1, expectVisible: 1 },
		/* Opening one tool closes the other: one panel at a time is the whole
		   placement argument, and a positive control sits directly above. */
		{ selector: '[data-testid="picker-panel"]', label: 'picker panel (closed by opening email)', expectPresent: 0 }
	],
	orderResult: [
		{
			/* MORE THAN ONE DRAFT, AND EVERY ADDRESS ON EXACTLY ONE OF THEM.
			   Read off the hrefs the page actually rendered, not off the module
			   -- a component that built the plan and then rendered one link
			   would satisfy a unit test and fail here. */
			evaluate: `() => {
				const links = [...document.querySelectorAll('[data-testid="email-draft"]')];
				const carried = links.flatMap((a) => {
					const bcc = new URL(a.getAttribute('href'), location.href).searchParams.get('bcc') || '';
					return bcc ? bcc.split(',') : [];
				});
				const listed = (document.querySelector('[data-testid="email-addresses"]')?.textContent || '')
					.split(',').map((s) => s.trim()).filter(Boolean);
				return [
					String(carried.length),
					String(new Set(carried).size === carried.length),
					String(carried.length === listed.length),
					String(links.every((a) => a.getAttribute('href').startsWith('mailto:?bcc=')))
				];
			}`,
			expected: ['39', 'true', 'true', 'true'],
			label: 'all 39 active students are on the one draft, nobody duplicated, and it is BCC'
		},
		{
			/* THE TEACHER'S OWN ENROLLMENT AND THE INACTIVE STUDENT ARE NOT
			   RECIPIENTS, and the roster row above them still is -- so this is
			   the exclusion working rather than an empty list. */
			evaluate: `() => {
				const listed = (document.querySelector('[data-testid="email-addresses"]')?.textContent || '');
				return [
					String(listed.includes('teacher@boscotech.edu')),
					String(listed.includes('hugo.petrov@boscotech.net')),
					String(listed.includes('ana.reyes@boscotech.net'))
				];
			}`,
			expected: ['false', 'false', 'true'],
			label: 'the instructor and the inactive student are left off; an ordinary student is on'
		},
		{
			/* The sentence carries the arithmetic. A note that merely counted
			   would leave a teacher unable to notice a window that never
			   opened. */
			evaluate: `() => {
				const t = document.querySelector('[data-testid="email-plan"]')?.textContent || '';
				return [String(/Opens one draft/.test(t)), String(/all 39 students/.test(t))];
			}`,
			expected: ['true', 'true'],
			label: 'the note says one draft and names the whole class it carries'
		}
	],
	tapTargets: [
		{ selector: '[data-testid="email-draft"]', label: 'a draft link', min: 44 },
		{ selector: '[data-testid="email-copy"]', label: 'copy all addresses', min: 44 },
		{ selector: '[data-testid="email-subject"]', label: 'the subject field', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="email-plan"]', label: 'the draft-count sentence', min: 4.5 },
		{ selector: '[data-testid="email-addresses"]', label: 'the address list', min: 4.5 }
	]
};
