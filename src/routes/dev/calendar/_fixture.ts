/**
 * THE CALENDAR HARNESS'S FIXTURE (ledger 0439): one student's calendar in
 * `calendar_feed`'s own shape, IDEA209H Unit 4 in late October 2026 with an
 * IDEA100 class beside it. Names are invented.
 */
export const SECTION_A = '0b5a1c2e-0000-4000-8000-00000000000a';
export const SECTION_B = '0b5a1c2e-0000-4000-8000-00000000000b';
const ITEM = '7f000000-0000-4000-8000-000000000001';
const ITEM2 = '7f000000-0000-4000-8000-000000000002';

export function fixtureFeed(opts: { admin?: boolean; today?: string } = {}) {
	const today = opts.today ?? '2026-10-28';
	const ev = (o: Record<string, unknown>) => ({ section_ids: [SECTION_A], ...o });
	return {
		ok: true,
		today,
		from: '2026-09-27',
		to: '2026-12-12',
		sections: [
			{ id: SECTION_A, label: 'Block 2', block: null, course: 'IDEA209H', course_title: 'Engineering Design', teaches: false },
			{ id: SECTION_B, label: 'Block 1', block: null, course: 'IDEA100', course_title: 'Rotation', teaches: false }
		],
		prefs: {},
		link: false,
		admin: opts.admin === true,
		events: [
			ev({ id: `open:${ITEM}`, layer: 'classes', kind: 'open', title: 'Launcher plan', day: '2026-10-23', item_id: ITEM }),
			ev({ id: `due:${ITEM}`, layer: 'classes', kind: 'due', title: 'Launcher plan', day: '2026-11-02', at: '2026-11-03T07:59:59Z', item_id: ITEM }),
			ev({ id: `pace:${ITEM}:d1`, layer: 'pacing', kind: 'pacing', title: 'Read the brief', day: '2026-10-23', item_id: ITEM, item_title: 'Launcher plan', step_id: 'd1' }),
			ev({ id: `pace:${ITEM}:d2`, layer: 'pacing', kind: 'pacing', title: 'Split the roles', day: '2026-10-26', item_id: ITEM, item_title: 'Launcher plan', step_id: 'd2' }),
			ev({ id: `pace:${ITEM}:d3`, layer: 'pacing', kind: 'pacing', title: 'Sketch each subsystem', day: '2026-10-28', item_id: ITEM, item_title: 'Launcher plan', step_id: 'd3' }),
			ev({ id: `pace:${ITEM}:d4`, layer: 'pacing', kind: 'pacing', title: 'Size the energy store', day: '2026-10-29', item_id: ITEM, item_title: 'Launcher plan', step_id: 'd4' }),
			ev({ id: `pace:${ITEM}:d5`, layer: 'pacing', kind: 'pacing', title: 'Design review ready', day: '2026-11-02', item_id: ITEM, item_title: 'Launcher plan', step_id: 'd5' }),
			ev({ id: `signoff:${SECTION_A}:plan`, layer: 'team', kind: 'signoff', title: 'Plan', day: '2026-10-28', state: 'requested', item_id: ITEM }),
			ev({ id: `signoff:${SECTION_A}:design`, layer: 'team', kind: 'signoff', title: 'Design', day: '2026-11-02', state: 'open', gate: 'No metal is cut before this sign-off.', item_id: ITEM }),
			ev({ id: 'task:1', layer: 'team', kind: 'task', title: 'Frame sketch', day: '2026-10-28', mine: true, owner: 'Ana', item_id: ITEM }),
			ev({ id: 'task:2', layer: 'team', kind: 'task', title: 'Drive gear ratio', day: '2026-10-29', owner: 'Ben', item_id: ITEM }),
			ev({ id: 'task:3', layer: 'team', kind: 'task', title: 'Ball path mock-up', day: '2026-10-30', owner: 'Cara', blocked: true, item_id: ITEM }),
			{ id: `due:${ITEM2}`, layer: 'classes', kind: 'due', title: 'Blade CAD 02', day: '2026-10-30', at: '2026-10-31T06:59:59Z', item_id: ITEM2, section_ids: [SECTION_B] },
			{ id: 'noschool:2026-11-11', layer: 'no_school', kind: 'no_school', title: 'Veterans Day', day: '2026-11-11', section_ids: [] },
			{ id: 'event:e1', event_id: 'e1', layer: 'idea', kind: 'event', title: 'IDEA open lab night', day: '2026-10-29', start_time: '15:30', end_time: '17:30', location: 'IDEA building', section_ids: [] },
			{ id: 'event:e2', event_id: 'e2', layer: 'robotics', kind: 'event', title: 'Beach Blitz', day: '2026-10-30', end_day: '2026-11-01', location: 'Capistrano Valley HS', section_ids: [] },
			{ id: 'event:e3', event_id: 'e3', layer: 'idea', kind: 'event', title: 'SCAR beetleweight event', day: '2026-12-05', location: 'IDEA building', section_ids: [] }
		]
	};
}

/** The plan the item page judges, for the pacing strip. */
export function fixturePacing() {
	return {
		ok: true,
		today: '2026-10-28',
		due_at: '2026-11-03T07:59:59Z',
		pacing: [
			{ id: 'd1', title: 'Read the brief', day: '2026-10-23', modules: ['brief'] },
			{ id: 'd2', title: 'Split the roles', day: '2026-10-26', modules: ['roles'] },
			{ id: 'd3', title: 'Sketch each subsystem', day: '2026-10-28', modules: ['sketch'] },
			{ id: 'd4', title: 'Size the energy store', day: '2026-10-29', modules: ['energy'] },
			{ id: 'd5', title: 'Design review ready', day: '2026-11-02', modules: [] }
		]
	};
}
