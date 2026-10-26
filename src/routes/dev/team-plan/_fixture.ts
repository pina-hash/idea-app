/**
 * A TEAM PLAN IN `classroom_team_plan`'s OWN SHAPE (ledger 0436), for the
 * `/dev/team-plan` harness and `tests/classroom-team-plan.test.ts`. Today is
 * 2026-10-29; the Design sign-off is 2026-11-02, two school days away; and the
 * team has done less than 80% of what it planned to date, so it is Slipping.
 */
const block = (id: string, field: string, type = 'longText') => ({ id, field, type });
const done = { text: 'Done and written up.' };

export function fixturePlan(): Record<string, unknown> {
	const members = [
		{ key: 'k-ana', name: 'Ana', me: true },
		{ key: 'k-ben', name: 'Ben', me: false },
		{ key: 'k-cara', name: 'Cara', me: false },
		{ key: 'k-dev', name: 'Dev', me: false }
	];
	const t = (id: string, title: string, owner: string | null, due: string, points: number, value: unknown, extra: Record<string, unknown> = {}) => ({
		id,
		kind: 'seed',
		title,
		item_id: 'item-plan',
		block_id: id,
		role_id: null,
		block: block(id, `${id}F`),
		owner,
		fixed_owner: false,
		due_on: due,
		cap: '2026-11-13',
		points,
		machine: null,
		depends_on: null,
		blocked: null,
		note: null,
		value,
		has_image: false,
		on_it: [],
		...extra
	});
	return {
		ok: true,
		today: '2026-10-29',
		team: { id: 'team-1', name: 'Team Torque', number: 1, section_id: 'sec', drawn_on: '2026-10-26' },
		me: 'k-ana',
		manager: false,
		members,
		roles: [
			{ id: 'frame', title: 'Frame and mount', owner: 'k-ben' },
			{ id: 'energy', title: 'Energy store', owner: 'k-cara' },
			{ id: 'drive', title: 'Drive', owner: 'k-ana' },
			{ id: 'ballpath', title: 'Ball path', owner: 'k-dev' }
		],
		items: [{ id: 'item-plan', title: 'Launcher plan', due_at: '2026-11-14T07:00:00Z' }],
		tasks: [
			t('goal', 'Team goal', 'k-ana', '2026-10-27', 20, done),
			t('method', 'Launch method', 'k-ben', '2026-10-27', 10, done),
			t('frame-req', 'Frame requirement', 'k-ben', '2026-10-28', 20, null, { role_id: 'frame', fixed_owner: true }),
			t('energy-req', 'Energy store requirement', 'k-cara', '2026-10-28', 20, null, { role_id: 'energy', fixed_owner: true, blocked: 'Waiting on spring rates' }),
			t('drive-req', 'Drive requirement', 'k-ana', '2026-10-29', 20, null, { role_id: 'drive', fixed_owner: true, on_it: ['k-ana'] }),
			t('ballpath-req', 'Ball path requirement', 'k-dev', '2026-10-30', 20, null, { role_id: 'ballpath', fixed_owner: true }),
			t('frame-cut', 'Cut the frame rails', 'k-ben', '2026-11-04', 30, null, { machine: 'router' }),
			t('drive-print', 'Print the pulley', 'k-ana', '2026-11-05', 15, null, { machine: 'printer' }),
			t('test-proc', 'Test procedure', 'k-dev', '2026-11-12', 25, null),
			{ ...t('bolts', 'Buy bolts', null, '2026-10-30', 0, null), kind: 'team', item_id: null, block_id: null, block: null }
		],
		checked_in: ['k-ana'],
		balance: {
			total: 180,
			unowned: 0,
			even: 45,
			balanced: false,
			members: [
				{ key: 'k-ana', points: 55 },
				{ key: 'k-ben', points: 60 },
				{ key: 'k-cara', points: 20 },
				{ key: 'k-dev', points: 45 }
			]
		},
		machines: [
			{ id: 'laser', label: 'Laser cutter' },
			{ id: 'router', label: 'CNC router' },
			{ id: 'printer', label: '3D printer' }
		],
		no_school: [{ day: '2026-11-11', label: 'Veterans Day' }],
		checkpoints: [
			{ key: 'plan', title: 'Plan', date: '2026-10-28', gate: null, state: 'approved', items: [], auto: {},
				decision: { status: 'approved', at: '2026-10-28T16:12:00Z', by: 'A. Pina', note: null } },
			{ key: 'design', title: 'Design', date: '2026-11-02', gate: 'No metal is cut before this sign-off.', state: 'open',
				items: [
					{ id: 'fields', kind: 'auto', text: "The Design post's fields are complete" },
					{ id: 'calc', kind: 'auto', text: 'Its calculators have been run' },
					{ id: 'aluminum', kind: 'tap', text: 'The structure is aluminum, with wood only for a minor part' },
					{ id: 'mount', kind: 'tap', text: 'The drill or power tool is clamped or mounted to the launcher, never hand-held while firing' }
				],
				auto: { fields: true, calc: true }, decision: null },
			{ key: 'safe', title: 'Safe to test', date: '2026-11-09', gate: 'No firing before this sign-off.', state: 'open' },
			{ key: 'ready', title: 'Competition ready', date: '2026-11-12', gate: null, state: 'open' }
		],
		owners_fixed: true
	};
}
