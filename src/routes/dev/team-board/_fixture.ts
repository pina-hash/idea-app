/**
 * A BOARD IN `classroom_team_board`'s OWN SHAPE (ledger 0436, 0306), for the
 * `/dev/team-board` harness and `tests/classroom-team-board.test.ts`: four
 * teams across three classes on 2026-10-29, built from the team plan
 * fixture. Team Torque is Slipping two school days before its Design
 * sign-off; Team Arc has done everything due and is on pace; Team Volt and
 * Team Bolt tag machines on other days. The machine tags seeded here are
 * what the board's machine counts must equal.
 */
import { fixturePlan } from '../team-plan/_fixture';

type Task = Record<string, unknown> & { id: string; block_id: string | null; due_on: string; value: unknown; machine: string | null };
const DONE = { text: 'Done and written up.' };

function variant(id: string, name: string, section: string, label: string, edit: (tasks: Task[]) => void, saved: Record<string, string>) {
	const plan = fixturePlan() as Record<string, unknown> & { team: Record<string, unknown>; tasks: Task[] };
	plan.team = { ...plan.team, id, name, section_id: section };
	plan.tasks = plan.tasks.map((t) => ({ ...t, id: `${id}-${t.id}` }));
	edit(plan.tasks);
	return { ...plan, section_label: label, saved_at: Object.fromEntries(Object.entries(saved).map(([k, v]) => [`${id}-${k}`, v])) };
}

export const MACHINE_TAGS = {
	router: { '2026-11-04': 4 },
	printer: { '2026-11-05': 3, '2026-11-06': 1 },
	laser: { '2026-11-03': 2 }
} as const;

export function fixtureBoard(): Record<string, unknown> {
	const torque = variant('t1', 'Team Torque', 's2', 'Block 2', () => {}, {
		goal: '2026-10-27T17:00:00Z',
		method: '2026-10-28T18:30:00Z'
	});
	const arc = variant(
		't2',
		'Team Arc',
		's2',
		'Block 2',
		(tasks) => {
			for (const t of tasks) if (t.due_on <= '2026-10-30' && t.block_id) t.value = DONE;
			for (const t of tasks) if (t.id.endsWith('energy-req')) t.blocked = null;
		},
		{ goal: '2026-10-27T17:00:00Z', method: '2026-10-27T18:00:00Z', 'frame-req': '2026-10-28T17:00:00Z', 'energy-req': '2026-10-28T19:00:00Z', 'drive-req': '2026-10-29T16:00:00Z', 'ballpath-req': '2026-10-29T17:00:00Z' }
	);
	const volt = variant(
		't3',
		'Team Volt',
		's3',
		'Block 3',
		(tasks) => {
			for (const t of tasks) {
				if (t.id.endsWith('frame-cut')) Object.assign(t, { machine: 'laser', due_on: '2026-11-03' });
				if (t.id.endsWith('drive-print')) t.due_on = '2026-11-06';
				if (t.id.endsWith('test-proc')) Object.assign(t, { machine: 'laser', due_on: '2026-11-03' });
			}
		},
		{ goal: '2026-10-28T17:00:00Z' }
	);
	const bolt = variant(
		't4',
		'Team Bolt',
		's4',
		'Block 4',
		(tasks) => {
			for (const t of tasks) if (t.id.endsWith('test-proc')) Object.assign(t, { machine: 'router', due_on: '2026-11-04' });
		},
		{}
	);
	return {
		ok: true,
		today: '2026-10-29',
		sections: [
			{ id: 's2', label: 'Block 2' },
			{ id: 's3', label: 'Block 3' },
			{ id: 's4', label: 'Block 4' }
		],
		teams: [torque, arc, volt, bolt],
		machines: [
			{ id: 'laser', label: 'Laser cutter' },
			{ id: 'router', label: 'CNC router' },
			{ id: 'printer', label: '3D printer' },
			{ id: 'mill', label: 'Mill' }
		],
		no_school: [{ day: '2026-11-11', label: 'Veterans Day' }]
	};
}
