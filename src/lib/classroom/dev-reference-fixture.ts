/**
 * A sample reference document for /dev/classroom-reference. Dev harness data
 * only -- nothing in the app imports it. It exercises EVERY block type and both
 * calc tools, so the harness is a real regression tool rather than a demo.
 *
 * It is deliberately shaped like the IDEA209H syllabus this system was built
 * for (facts strip, policy callouts, an AI-level lookup, a grade calculator, a
 * parts list of purchasable links) without being it -- the syllabus arrives
 * later as its own spec file.
 */

import type { ReferenceSpec } from './reference-spec';

export const SAMPLE_REFERENCE: ReferenceSpec = {
	schemaVersion: 2,
	kind: 'reference',
	meta: {
		referenceId: 'sample-syllabus',
		title: 'Sample Course Reference',
		subtitle: 'A worked example of every reference block',
		course: 'IDEA000',
		updated: 'August 2026'
	},
	navigation: 'tabs',
	sections: [
		{
			slug: 'overview',
			title: 'Overview',
			blurb: 'What this class is and how it runs.',
			blocks: [
				{
					type: 'keyValue',
					title: 'The facts',
					items: [
						{ label: 'Instructor', value: 'Mr. Pina' },
						{ label: 'Room', value: 'Engineering Lab 2' },
						{ label: 'Meets', value: 'Daily, periods 3 and 4' },
						{ label: 'Credit', value: '10 units, year long' }
					]
				},
				{
					type: 'instructions',
					content:
						'This class is a **design and fabrication** course. You will model parts, build them, and write about what you learned.\n\n- Bring your notebook every day.\n- Safety glasses live in the lab, not in your bag.\n- Ask for help *before* you are stuck for twenty minutes.'
				},
				{
					type: 'callout',
					variant: 'required',
					title: 'Signature required',
					content:
						'A parent or guardian must read this page and sign the printed sheet by the end of the first week.'
				}
			]
		},
		{
			slug: 'handbook',
			title: 'Handbook',
			blurb:
				'The block-markup exercise: every structure the renderer parses, plus the three things it must refuse to turn into markup.',
			blocks: [
				{
					type: 'instructions',
					content: [
						'### Unit 1 -- Measurement',
						'',
						'Read this before the first lab. It is long on purpose: this section is the one to scroll halfway down before switching tabs.',
						'',
						'#### What you will do',
						'',
						'You will measure a machined part three ways and argue about which number to trust. Bring a **pencil**, not a pen, and *write down what you actually read* rather than what you expected.',
						'',
						'- Measure the same feature three times.',
						'- Record every reading, including the one you think is wrong.',
						'    - A discarded reading is still data.',
						'    - Say why you discarded it.',
						'- Compare against the drawing, not against your neighbour.',
						'',
						'#### The order of operations',
						'',
						'1. Zero the instrument.',
						'2. Measure.',
						'    1. Read the main scale first.',
						'    2. Then the vernier.',
						'3. Record before you move on.',
						'',
						'> Precision is how closely your readings agree with each other. Accuracy is how closely they agree with the truth. You can be precisely wrong.',
						'',
						'Nominal dimensions in the drawing set are written like `12.70 ±0.05`, and a tolerance callout that reads `MMC` means something specific -- the [GD&T reference](https://ideabosco.com/gauntlet) has the full symbol set.',
						'',
						'### Unit 2 -- Fits',
						'',
						'A clearance fit always leaves a gap; an interference fit never does. The arithmetic is the same either way:',
						'',
						'```',
						'clearance = hole_size - shaft_size',
						'  max clearance = hole_max - shaft_min',
						'  min clearance = hole_min - shaft_max',
						'```',
						'',
						'#### Where people go wrong',
						'',
						'- Mixing the two ends of each tolerance band.',
						'- Reporting a negative clearance as a clearance.',
						'- Rounding before the last step.',
						'',
						'Ask early. The whole point of a shop class is that someone who has done it before is standing ten feet away.'
					].join('\n')
				},
				{
					type: 'callout',
					variant: 'info',
					title: 'Renderer note (dev fixture only)',
					content: [
						'The three lines below are hostile input. None of them may become an element, a URL, or a handler -- they render as the literal text they are.',
						'',
						'- Raw HTML: <script>alert("xss")</script> and <b>bold?</b>',
						'- An image with a handler: <img src=x onerror="alert(1)">',
						'- A javascript: link: [click me](javascript:alert(1))'
					].join('\n')
				}
			]
		},
		{
			slug: 'grading',
			title: 'Grading',
			blocks: [
				{
					type: 'dataTable',
					title: 'Weights',
					caption: 'Weights are fixed for the whole semester.',
					columns: [
						{ key: 'category', label: 'Category' },
						{ key: 'weight', label: 'Weight' },
						{ key: 'what', label: 'What counts' }
					],
					rows: [
						{ category: 'Unit labs', weight: '40%', what: 'Hands-on builds and their write-ups' },
						{ category: 'Assignments', weight: '25%', what: 'Modelling work and problem sets' },
						{ category: 'Documentation', weight: '20%', what: 'Engineering notebook entries' },
						{ category: 'Final exam', weight: '15%', what: 'One written exam per semester' }
					]
				},
				{
					type: 'calc',
					tool: 'gradeCalculator',
					title: 'Estimate your grade',
					config: {
						categories: [
							{ name: 'Unit labs', pointsPossible: 400, weight: 40 },
							{ name: 'Assignments', pointsPossible: 250, weight: 25 },
							{ name: 'Documentation', pointsPossible: 200, weight: 20 },
							{ name: 'Final exam', pointsPossible: 150, weight: 15 }
						],
						disclaimer:
							'An estimate only. Nothing you type here is saved or sent anywhere, and the gradebook is the real record.'
					}
				},
				{
					type: 'callout',
					variant: 'warn',
					content: 'Late work loses 10% per school day, down to a floor of 50%.'
				}
			]
		},
		{
			slug: 'ai-policy',
			title: 'AI policy',
			blurb: 'What AI you may use, and on what.',
			blocks: [
				{
					type: 'instructions',
					content:
						'Every assignment carries an AI level. Look up the kind of work you are doing before you start, and disclose whatever you used.'
				},
				{
					type: 'calc',
					tool: 'aiLevelLookup',
					title: 'Look up a type of work',
					config: {
						entries: [
							{
								workType: 'Engineering notebook entry',
								level: 0,
								permitted: 'Nothing. This is your own record of your own work.',
								notPermitted: 'Any AI drafting, rewriting, or summarising.',
								example: 'Writing up what went wrong with your first print.'
							},
							{
								workType: 'Studying for the exam',
								level: 1,
								permitted: 'Asking AI to explain a concept or quiz you on it.',
								notPermitted: 'Having AI produce answers you then hand in.',
								example: 'Asking for practice questions on tolerance stack-up.'
							},
							{
								workType: 'Lab write-up draft',
								level: 2,
								permitted: 'Drafting help, as long as you revise, verify, and disclose it.',
								notPermitted: 'Submitting a draft you have not checked and cannot explain.'
							},
							{
								workType: 'Brainstorming a design',
								level: 3,
								permitted: 'Open use. Say what you used.',
								notPermitted: 'Passing off an AI design as one you developed.'
							}
						]
					}
				}
			]
		},
		{
			slug: 'materials',
			title: 'Materials',
			blocks: [
				{
					type: 'cardGrid',
					title: 'Where things live',
					cards: [
						{ title: 'Classroom', url: 'https://ideabosco.com/classroom', body: 'Assignments and announcements.' },
						{ title: 'Notebook', url: 'https://ideabosco.com/notebook', body: 'Photograph and file your pages.' },
						{ title: 'GAUNTLET', url: 'https://ideabosco.com/gauntlet', body: 'CAD skills practice.' }
					]
				},
				{
					type: 'linkCard',
					title: 'Buy these before October',
					links: [
						{
							url: 'https://example.com/dial-caliper',
							fallbackLabel: 'Dial caliper, 6 in, 0.001 in graduation',
							label: 'Dial caliper',
							note: 'Any brand is fine as long as it reads to a thousandth.'
						},
						{
							url: 'https://example.com/this-listing-is-gone-404',
							fallbackLabel: 'Safety glasses, ANSI Z87.1, part 3M-11329',
							label: 'Safety glasses'
						}
					]
				}
			]
		},
		{
			slug: 'safety',
			title: 'Safety',
			blocks: [
				{
					type: 'callout',
					variant: 'info',
					content: 'The full shop safety test is taken in the first two weeks and must be passed at 100%.'
				},
				{
					type: 'dataTable',
					columns: [
						{ key: 'machine', label: 'Machine' },
						{ key: 'ppe', label: 'Required PPE' },
						{ key: 'signoff', label: 'Sign-off' }
					],
					rows: [
						{ machine: 'Bandsaw', ppe: 'Glasses', signoff: 'Instructor' },
						{ machine: 'Lathe', ppe: 'Glasses, no gloves, hair tied', signoff: 'Instructor' },
						{ machine: '3D printer', ppe: 'Glasses when removing parts', signoff: 'Peer' }
					]
				}
			]
		},
		{
			slug: 'calendar',
			title: 'Calendar',
			blocks: [
				{
					type: 'keyValue',
					items: [
						{ label: 'Unit 1', value: 'Aug 18 to Sep 19' },
						{ label: 'Unit 2', value: 'Sep 22 to Oct 24' },
						{ label: 'Unit 3', value: 'Oct 27 to Dec 5' },
						{ label: 'Final exam', value: 'Week of Dec 15' }
					]
				}
			]
		},
		{
			slug: 'contact',
			title: 'Contact',
			blocks: [
				{
					type: 'instructions',
					content:
						'Email is the fastest way to reach me: [apina@boscotech.edu](mailto:apina@boscotech.edu). I answer during the school day.'
				}
			]
		}
	]
};

/**
 * A second, unrelated document -- same shape, DISJOINT slugs -- for the
 * two-pane harness's own regression check: ReferenceDoc mounts once inside
 * ItemDetail's persistent detail pane (see ClassSplit) and is never remounted
 * between materials, so opening this document right after SAMPLE_REFERENCE
 * changes `spec` under an already-mounted instance rather than creating a new
 * one. If the active-slug clamp in ReferenceDoc ever regresses, this is what
 * would show every section hidden at once with the tab strip stuck wherever
 * the PREVIOUS document scrolled it.
 */
export const SAMPLE_REFERENCE_ALT: ReferenceSpec = {
	schemaVersion: 2,
	kind: 'reference',
	meta: {
		referenceId: 'sample-shop-rules',
		title: 'Shop Floor Rules',
		course: 'IDEA000'
	},
	navigation: 'tabs',
	sections: [
		{
			slug: 'entry',
			title: 'Entering the shop',
			blocks: [{ type: 'instructions', content: 'Glasses on before you cross the yellow line.' }]
		},
		{
			slug: 'tools',
			title: 'Shared tools',
			blocks: [{ type: 'instructions', content: 'Sign a tool back in before you leave for the day.' }]
		},
		{
			slug: 'cleanup',
			title: 'Cleanup',
			blocks: [{ type: 'instructions', content: 'Sweep your own station; the last five minutes are for this.' }]
		}
	]
};

/**
 * A document with enough sections to OVERFLOW THE STRIP at every width the
 * viewer is verified at -- 14 of them, so the tab strip scrolls on a 1440px
 * desktop inside the classroom item page's detail pane as well as on a phone.
 *
 * It exists because the operability of the strip's own controls (the scrollbar,
 * the prev/next buttons, wheel, drag) cannot be verified on a document whose
 * tabs all fit: with no overflow there is nothing to scroll and every
 * assertion passes vacuously. SAMPLE_REFERENCE deliberately stays at the size
 * that shows off the block types; this one is deliberately dull and long.
 */
export const OVERFLOW_REFERENCE: ReferenceSpec = {
	schemaVersion: 2,
	kind: 'reference',
	meta: {
		referenceId: 'sample-long-handbook',
		title: 'Program Handbook',
		subtitle: 'Fourteen sections, so the tab strip has to be scrolled',
		course: 'IDEA000',
		updated: 'August 2026'
	},
	navigation: 'tabs',
	sections: [
		['welcome', 'Welcome'],
		['schedule', 'Schedule'],
		['grading', 'Grading'],
		['attendance', 'Attendance'],
		['ai-policy', 'AI policy'],
		['materials', 'Materials'],
		['safety', 'Safety'],
		['shop-rules', 'Shop rules'],
		['notebook', 'Notebook'],
		['competitions', 'Competitions'],
		['field-trips', 'Field trips'],
		['contact', 'Contact'],
		['glossary', 'Glossary'],
		['appendix', 'Appendix']
	].map(([slug, title]) => ({
		slug,
		title,
		blurb: `The ${title.toLowerCase()} section.`,
		blocks: [
			{
				type: 'instructions' as const,
				content: `Placeholder body for **${title}**. Long enough to be a real section, dull enough that nobody reads it twice.`
			}
		]
	}))
};
