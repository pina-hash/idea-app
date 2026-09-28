/**
 * THE CLASS'S OWN SETTINGS TAB (report R06, 2026-09-28: "it's odd how the
 * class settings are in the people tab ... it's not the place I would look").
 * Edit details, Archive class and Delete class moved here from the bottom of
 * People, with their handlers; People keeps the roster and the teams.
 *
 * The REAL ClassSettingsPanel on the classroom harness's in-memory
 * transports, at the width the real route gets (`classroomMeasure` answers
 * `split` for `settings`, the same as People and Grades, so the tab bar does
 * not move between them).
 *
 * Measured with Edit details pressed (report R15): the key that closes the
 * form reads as PRESSED -- the plate's lit key, whose broken accent ring is a
 * `::after` only a lit `.btn` draws -- beside Archive class, the same kind of
 * key unlit, as the control. The form opens under it and the page does not
 * scroll sideways at 375.
 */
const OPEN = `() => !!document.querySelector('[data-testid="settings-details-form"]')`;

export default {
	path: '/dev/classroom?view=settings',
	label: 'Class settings tab: details, Archive class and Delete class, with Edit details lit while its form is open',
	prepare: [
		{ waitFor: `() => !!document.querySelector('[data-testid="settings-edit-details"]')`, timeoutMs: 20000 },
		{ click: '[data-testid="settings-edit-details"]', until: OPEN }
	],
	presence: [
		{ selector: '[data-testid="class-settings"]', label: 'the Settings panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-edit-details"][aria-expanded="true"].on', label: 'Edit details, open and lit', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-details-form"]', label: 'the details form', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-archive"]', label: 'Archive class', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-delete"]', label: 'Delete class', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="settings-delete-zone"]', label: 'the delete confirmation (not armed)', expectPresent: 0 },
		{ selector: '[data-testid="settings-archive-note"]', label: 'what archiving costs, in words, before the press', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="settings-edit-details"]', label: 'the open key says Close', must: ['Close'] },
		{ selector: '[data-testid="settings-archive"]', label: 'Archive class', must: ['Archive class'] },
		{ selector: '[data-testid="settings-archive-note"]', label: 'archiving keeps everything', must: ['keeps every post, grade and roster row'] }
	],
	tapTargets: [
		{ selector: '[data-testid="settings-edit-details"], [data-testid="settings-archive"], [data-testid="settings-delete"]', label: 'the three class controls', min: 44 },
		{ selector: '[data-testid="settings-details-form"] input', label: 'the details fields', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="settings-details"] dt', label: 'detail names', min: 4.5 },
		{ selector: '[data-testid="settings-details"] dd', label: 'detail values', min: 4.5 },
		{ selector: '[data-testid="settings-archive-note"]', label: 'the archive sentence', min: 4.5 },
		{ selector: '[data-testid="settings-edit-details"]', label: 'Close (lit)', min: 4.5 },
		{ selector: '[data-testid="settings-archive"]', label: 'Archive class', min: 4.5 }
	],
	orderResult: [
		{
			label: 'the open key draws the lit ring and its unlit sibling does not',
			evaluate: `() => {
				const ring = (sel) => getComputedStyle(document.querySelector(sel), '::after').content;
				const open = ring('[data-testid="settings-edit-details"]');
				const unlit = ring('[data-testid="settings-archive"]');
				return [open === '""' ? 'open: ring drawn' : 'open: NO RING (' + open + ')', open !== unlit ? 'unlit sibling differs' : 'SAME AS UNLIT (' + unlit + ')'];
			}`,
			expected: ['open: ring drawn', 'unlit sibling differs']
		}
	]
};
