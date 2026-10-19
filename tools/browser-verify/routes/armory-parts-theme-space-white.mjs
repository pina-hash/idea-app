/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * IDEA ARMORY PART NUMBERS (ledger 0405): the Parts view and the COTS library,
 * every state stacked on /dev/armory-parts through the real components.
 */
const HYDRATED = [{ waitFor: '() => !!document.querySelector("[data-armory-parts-hydrated]")', timeoutMs: 30000 }];
const TAKE = `() => { const k = document.querySelector('[data-view="student"] [data-testid="armory-part-take-key"]'); if (!k) return 'NO KEY'; k.click(); return 'pressed'; }`;

export default {
	path: '/dev/armory-parts?theme=space-white',
	label: 'Space White: IDEA Armory part numbers: the Parts view (student, mentor, archived, empty, class project) and the COTS library (student, mentor, empty)',
	prepare: [
		...HYDRATED, { waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 },
		{ evaluate: TAKE, until: `() => !!document.querySelector('[data-view="student"] [data-testid="armory-part-result"]')` }
	],
	presence: [
		{ selector: '[data-view="student"] [data-testid="armory-part-row"]', label: 'twelve numbers, plus the one just taken', expectPresent: 13, maxPresent: 13, expectVisible: 13 },
		{ selector: '[data-view="student"] [data-testid="armory-parts-subsystem"]', label: 'three subsystems with numbers', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-view="student"] [data-testid="armory-parts-assembly"]', label: 'five assemblies (DT 01, DT 02, SH 01, EE 01, and the new DT 03)', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-view="student"] [data-testid="armory-part-take"]', label: 'a student takes a number', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="student"] [data-testid="armory-part-result"]', label: 'and is told which', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="student"] [data-testid="armory-part-prefix-form"]', label: 'a student sets no prefix', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="mentor"] [data-testid="armory-part-prefix-form"]', label: 'a mentor sets the prefix (the control)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="archived"] [data-testid="armory-part-take"]', label: 'an archived project takes no numbers', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="archived"] [data-testid="armory-parts-archived"]', label: 'and says so', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="empty"] [data-testid="armory-parts-empty"]', label: 'an empty registry says how numbers arrive', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="cots-student"] [data-testid="armory-cots-row"]', label: 'seven live COTS parts', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-view="cots-student"] :is([data-testid="armory-cots-add"], [data-testid="armory-cots-correct"], [data-testid="armory-cots-retire"], [data-testid="armory-subsystem-form"], [data-testid="armory-subsystem-retire"])', label: 'a student adds, corrects and retires nothing', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="cots-mentor"] [data-testid="armory-cots-retire"]', label: 'a mentor retires any of the seven (the control)', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-view="cots-mentor"] [data-testid="armory-cots-add"]', label: 'and adds', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="cots-mentor"] [data-testid="armory-subsystem"]', label: 'nine subsystem codes', expectPresent: 9, maxPresent: 9, expectVisible: 9 },
		{ selector: '[data-view="cots-empty"] [data-testid="armory-cots-empty"]', label: 'an empty library says so', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-view="student"] [data-testid="armory-part-result"]', label: 'the new number in full', must: ['5669-26-DT-0300'] },
		{ selector: '[data-view="class-project"] [data-testid="armory-parts-prefix"]', label: 'a class project numbers by its course', must: ['IDEA100'] },
		{ selector: '[data-view="student"] [data-testid="armory-parts"]', label: 'revision beside, made from and a removed file in words', must: ['Rev C', 'Made from WCP-0388', '(removed)'], mustNot: ['@boscotech'] }
	],
	tapTargets: [
		{ selector: '[data-view="student"] [data-testid="armory-part-take"] :is(select, input, button)', label: 'the take form', min: 44 },
		{ selector: '[data-view="student"] .ap-choice', label: 'assembly or part', min: 44 },
		{ selector: '[data-view="student"] [data-testid="armory-parts-search"]', label: 'the search box', min: 44 },
		{ selector: '[data-view="student"] .ap-file', label: 'file links', min: 44 },
		{ selector: '[data-view="cots-mentor"] [data-testid="armory-cots"] :is(button, input, a.ac-link)', label: 'the library controls and links', min: 44 },
		{ selector: '[data-view="cots-mentor"] [data-testid="armory-subsystems"] :is(button, input)', label: 'the subsystem controls', min: 44 }
	],
	contrast: [
		{ selector: '[data-view="student"] .ap-num', label: 'part numbers', min: 4.5 },
		{ selector: '[data-view="student"] :is(.ap-title, .ap-meta, .ap-kind)', label: 'what a number is, and who took it', min: 4.5 },
		{ selector: '[data-view="student"] .ar-readout', label: 'readouts and revisions', min: 4.5 },
		{ selector: '[data-view="student"] :is(.ap-preview, .ap-legend dd, .ap-sample)', label: 'the take form and the legend', min: 4.5 },
		{ selector: '[data-view="cots-mentor"] :is(.ac-num, .ac-desc, .ac-meta, .ac-samples)', label: 'the library rows', min: 4.5 },
		{ selector: '[data-view="cots-mentor"] :is(.as-code, .as-name)', label: 'the subsystem codes', min: 4.5 }
	]
};
