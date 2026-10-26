// tests/db/team-unit4-fixture.ts
//
// One fixture class for the ledger 0436 suites: a team assignment shared by
// two sections (one post, as Unit 4 is posted), four subsystem roles, and a
// draw per section saved but NOT posted, so a suite can watch posting be the
// switch. Every row is written through the real RPCs, never by insert.

import {
	createClassroomSection,
	createUser,
	enrollStudent,
	type SeededUser,
	type TestDb
} from './harness';

export const ROLES = [
	{ id: 'frame', title: 'Frame and mount' },
	{ id: 'energy', title: 'Energy store' },
	{ id: 'drive', title: 'Drive' },
	{ id: 'ballpath', title: 'Ball path' }
] as const;

const LEVELS = (top: number) => [
	{ points: top, label: 'Complete', short: 'All there', descriptor: 'Every part is present.' },
	{ points: Math.floor(top / 2), label: 'Developing', short: 'Half there', descriptor: 'Half the parts are present.' },
	{ points: 0, label: 'Absent', short: 'Nothing', descriptor: 'Nothing is present.' }
];

export function teamManifest() {
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Launcher plan',
		course: 'IDEA209H',
		points: 100,
		team: {
			roles: ROLES.map((r) => ({ ...r })),
			checkpoints: [
				{
					id: 'plan',
					title: 'Plan',
					date: '2026-10-28',
					items: [
						{ id: 'owners', kind: 'auto', check: 'plan-owners', text: 'Every task has an owner and a due date' },
						{ id: 'roles', kind: 'auto', check: 'roles-owned', text: 'Every role has an owner' },
						{ id: 'balance', kind: 'auto', check: 'plan-balanced', text: 'The plan balances' },
						{ id: 'fields', kind: 'auto', check: 'blocks-complete', blocks: ['frame-text', 'energy-text', 'drive-text', 'ballpath-text'], text: "Each role's requirement field is complete" },
						{ id: 'interfaces', kind: 'tap', role: 'frame', text: 'The sketches meet at the named interfaces' },
						{ id: 'method', kind: 'tap', ownerOnly: true, text: 'The launch method is a flywheel or a catapult' }
					]
				},
				{
					id: 'design',
					title: 'Design',
					date: '2026-11-02',
					gate: 'No metal is cut before this sign-off.',
					items: [
						{ id: 'aluminum', kind: 'tap', text: 'The structure is aluminum, with wood only for a minor part' },
						{ id: 'mount', kind: 'tap', role: 'drive', text: 'The drill or power tool is clamped or mounted to the launcher, never hand-held while firing' }
					]
				}
			]
		},
		header: [{ id: 'who', field: 'studentName', type: 'text' }],
		modules: [
			{
				id: 'shared',
				title: 'Team goal',
				points: 40,
				audience: 'team',
				blocks: [
					{ id: 'goal', field: 'goalText', type: 'longText' },
					{ id: 'method', field: 'methodText', type: 'text' }
				],
				criteria: [{ id: 'c1', text: 'Goal', points: 40, levels: LEVELS(40) }]
			},
			...ROLES.map((r) => ({
				id: `${r.id}-req`,
				title: `${r.title} requirement`,
				points: 10,
				audience: 'role',
				role: r.id,
				blocks: [{ id: `${r.id}-text`, field: `${r.id}Text`, type: 'longText' }],
				criteria: [{ id: 'c1', text: 'Requirement', points: 10, levels: LEVELS(10) }]
			})),
			{
				id: 'mine',
				title: 'Reflection',
				points: 20,
				audience: 'individual',
				blocks: [{ id: 'reflect', field: 'reflectText', type: 'longText' }],
				criteria: [{ id: 'c1', text: 'Reflection', points: 20, levels: LEVELS(20) }]
			}
		]
	};
}

export function documentFor(m: ReturnType<typeof teamManifest>): string {
	const fields = [
		...m.header.map((b) => b.field),
		...m.modules.flatMap((mod) => mod.blocks.map((b) => b.field))
	];
	return [
		'<!doctype html><html><head><title>Launcher plan</title></head><body>',
		...fields.map((f) => `<textarea data-field="${f}"></textarea>`),
		`<script type="application/json" id="idea-manifest">${JSON.stringify(m)}<\/script>`,
		'</body></html>'
	].join('\n');
}

export interface Unit4Fixture {
	admin: SeededUser;
	teacher: SeededUser;
	/** Section A: eight students, two teams, the eighth on none. */
	sectionA: string;
	/** Section B: three students, one team. */
	sectionB: string;
	a: SeededUser[];
	b: SeededUser[];
	item: string;
	setA: string;
	setB: string;
	teamA1: string;
	teamA2: string;
	teamB1: string;
}

export function rpcOf(db: TestDb) {
	async function rpc<T = Record<string, unknown>>(user: SeededUser, call: string, params: unknown[] = []): Promise<T> {
		return db.asUser(user.id, async (q) => {
			const { rows } = await q<{ result: T }>(`select ${call} as result`, params);
			return rows[0].result;
		});
	}
	async function refusal(user: SeededUser, call: string, params: unknown[] = []): Promise<string | null> {
		try {
			await rpc(user, call, params);
			return null;
		} catch (e) {
			return (e as Error).message;
		}
	}
	return { rpc, refusal };
}

export async function seedUnit4(db: TestDb, opts: { dueAt?: string | null } = {}): Promise<Unit4Fixture> {
	const { rpc } = rpcOf(db);
	const admin = await createUser(db, 'apina@boscotech.edu', 'A. Pina');
	const teacher = await createUser(db, 'cosso@boscotech.edu', 'M. Cosso');
	await db.sql('insert into public.app_admins (email, granted_by) values ($1, $1) on conflict do nothing', [admin.email]);
	const sectionA = await createClassroomSection(db, {
		as: admin,
		courseCode: 'IDEA209H',
		courseTitle: 'Engineering Design',
		label: 'Block 2',
		teacherEmail: admin.email
	});
	const sectionB = await createClassroomSection(db, {
		as: admin,
		courseCode: 'IDEA209H',
		courseTitle: 'Engineering Design',
		label: 'Block 4',
		teacherEmail: teacher.email
	});
	const names = ['Ana Perez', 'Ben Ortiz', 'Cara Lin', 'Dev Shah', 'Eli Moss', 'Fay Kim', 'Gus Cole', 'Hal Ruiz'];
	const a: SeededUser[] = [];
	for (const name of names) {
		const email = `${name.toLowerCase().replace(' ', '.')}@boscotech.net`;
		const user = await createUser(db, email, name);
		await enrollStudent(db, { as: admin, sectionId: sectionA, email, displayName: name });
		a.push(user);
	}
	const b: SeededUser[] = [];
	for (const name of ['Ivy Wong', 'Jay Park', 'Kai Diaz']) {
		const email = `${name.toLowerCase().replace(' ', '.')}@boscotech.net`;
		const user = await createUser(db, email, name);
		await enrollStudent(db, { as: teacher, sectionId: sectionB, email, displayName: name });
		b.push(user);
	}
	const created = await rpc<{ item_id: string }>(
		admin,
		`public.classroom_create_item(
			p_kind => 'assignment', p_section_ids => $1::uuid[], p_title => $2,
			p_body => $3, p_points => 100, p_published => true)`,
		[[sectionA, sectionB], 'Launcher plan', 'Plan your launcher as a team.']
	);
	const item = created.item_id;
	const manifest = teamManifest();
	await rpc(admin, 'public.classroom_set_html_assignment($1::uuid, $2, $3::jsonb, $4)', [
		item,
		documentFor(manifest),
		JSON.stringify(manifest),
		'plan.html'
	]);
	if (opts.dueAt !== undefined) {
		await db.sql('update public.classroom_items set due_at = $2 where id = $1', [item, opts.dueAt]);
	}
	const saveSet = (as: SeededUser, section: string, teams: SeededUser[][]) =>
		rpc<string>(as, 'public.classroom_save_team_set($1::uuid, $2, $3::bigint, $4, $5::integer, $6::jsonb)', [
			section,
			'Launcher teams',
			4242,
			'count',
			teams.length,
			JSON.stringify(teams.map((members, i) => ({ team_number: i + 1, members: members.map((m) => m.email) })))
		]);
	const setA = await saveSet(admin, sectionA, [a.slice(0, 4), a.slice(4, 7)]);
	const setB = await saveSet(teacher, sectionB, [b]);
	const teamOf = async (set: string, n: number) =>
		(
			await db.sql<{ id: string }>('select id from public.classroom_teams where team_set_id = $1 and team_number = $2', [
				set,
				n
			])
		).rows[0].id;
	return {
		admin,
		teacher,
		sectionA,
		sectionB,
		a,
		b,
		item,
		setA,
		setB,
		teamA1: await teamOf(setA, 1),
		teamA2: await teamOf(setA, 2),
		teamB1: await teamOf(setB, 1)
	};
}

export async function postSet(db: TestDb, as: SeededUser, set: string): Promise<void> {
	await rpcOf(db).rpc(as, 'public.classroom_post_team_set($1::uuid, $2::timestamptz)', [set, null]);
}
