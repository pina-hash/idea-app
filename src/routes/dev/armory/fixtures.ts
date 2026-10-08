import type { ArmoryChange, ArmoryCheckout, ArmoryDevice, ArmoryFile, ArmoryHistoryEntry, ArmoryMember, ArmoryProject } from '$lib/armory/view';
import { checkoutsFromFiles } from '$lib/armory/view';

/** 10:30 AM in Los Angeles on 2026-10-06; every time below is relative to it. */
export const NOW = Date.parse('2026-10-06T17:30:00Z');
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
const hash = (c: string) => c.repeat(64).slice(0, 64);

export const PROJECT: ArmoryProject = { id: '6b1f6c1e-0000-4000-8000-000000000001', name: 'Robot 2026', season: null, role: 'mentor', archived: false };
export const STUDENT_PROJECT: ArmoryProject = { ...PROJECT, role: 'student' };

export const PROJECTS: ArmoryProject[] = [
	PROJECT,
	{ id: '6b1f6c1e-0000-4000-8000-000000000002', name: 'IDEA209H Blade Team 4', season: null, role: 'student' },
	{ id: '6b1f6c1e-0000-4000-8000-000000000003', name: 'Offseason Swerve', season: 2025, role: 'cad_lead' },
	{ id: '6b1f6c1e-0000-4000-8000-000000000004', name: 'Robot 2025', season: 2025, role: 'mentor', archived: true, archived_at: '2026-06-01T17:00:00Z' }
];

export const ARCHIVED_PROJECT: ArmoryProject = { ...PROJECTS[3] };

export const MEMBERS: ArmoryMember[] = [
	{ email: 'apina@boscotech.edu', role: 'mentor' },
	{ email: 'maria.lopez@boscotech.net', role: 'cad_lead' },
	{ email: 'ana.reyes@boscotech.net', role: 'student' },
	{ email: 'ben.okafor@boscotech.net', role: 'student' }
];

const version = (id: string, author: string, minutesAgo: number, c: string, bytes = 1_482_220) => ({
	id,
	hash: hash(c),
	bytes,
	author,
	created_at: at(minutesAgo)
});

export const SYNCED_FILES: ArmoryFile[] = [
	{ id: 'f-1', folder: 'Drivetrain', name: 'Gearbox Plate.SLDPRT', deleted: false, created_at: at(4000), current: version('v-1', 'maria.lopez@boscotech.net', 95, 'a'), lock: null },
	{ id: 'f-2', folder: 'Drivetrain', name: 'Drivetrain.SLDASM', deleted: false, created_at: at(4000), current: version('v-2', 'ana.reyes@boscotech.net', 30, 'b', 3_904_112), lock: null },
	{ id: 'f-3', folder: 'Drivetrain/Wheels', name: 'Wheel Hub.SLDPRT', deleted: false, created_at: at(3000), current: version('v-3', 'ben.okafor@boscotech.net', 1440 + 60, 'c'), lock: null },
	{ id: 'f-4', folder: 'Intake', name: 'Roller Bracket.SLDPRT', deleted: false, created_at: at(200), current: version('v-4', 'ana.reyes@boscotech.net', 12, 'd', 640_331), lock: null },
	{ id: 'f-5', folder: '', name: 'Robot 2026.SLDASM', deleted: false, created_at: at(5000), current: version('v-5', 'maria.lopez@boscotech.net', 300, 'e', 9_220_118), lock: null }
];

const lock = (who: string, device: string, deviceId: string, minutesAgo: number) => ({
	holder_email: who,
	holder_device_id: deviceId,
	holder_device_name: device,
	acquired_at: at(minutesAgo),
	broken_at: null,
	broken_by: null
});

export const EDITING_FILES: ArmoryFile[] = SYNCED_FILES.map((f) =>
	f.id === 'f-2'
		? { ...f, lock: lock('ana.reyes@boscotech.net', 'Lab PC 3', 'd-lab3', 18) }
		: f.id === 'f-4'
			? { ...f, lock: lock('ben.okafor@boscotech.net', 'Ben laptop', 'd-ben', 6) }
			: f
);
export const EDITING_SEEN: Record<string, number> = { 'd-lab3': NOW - 2 * 60_000, 'd-ben': NOW - 60_000 };

export const QUIET_FILES: ArmoryFile[] = [
	...SYNCED_FILES.map((f) => (f.id === 'f-3' ? { ...f, lock: lock('ben.okafor@boscotech.net', 'Lab PC 7', 'd-lab7', 60 * 20) } : f)),
	{ id: 'f-6', folder: 'Intake', name: 'Intake Arm.SLDPRT', deleted: false, created_at: at(3), current: null, lock: null }
];
export const QUIET_SEEN: Record<string, number> = { 'd-lab7': NOW - 60 * 60_000 * 19 };

export const SIDE_FILES: ArmoryFile[] = EDITING_FILES;
export const SIDE_COUNTS: Record<string, number> = { 'f-2': 2, 'f-5': 1 };

export const SIDE_FILE: ArmoryFile = EDITING_FILES.find((f) => f.id === 'f-2')!;
export const SIDE_HISTORY: ArmoryHistoryEntry[] = [
	{ id: 'v-2', kind: 'version', author: 'ana.reyes@boscotech.net', created_at: at(30), bytes: 3_904_112, hash: hash('b'), reason: null },
	{ id: 's-2', kind: 'side_version', author: 'ben.okafor@boscotech.net', created_at: at(26), bytes: 3_901_004, hash: hash('9'), reason: 'stale parent' },
	{ id: 's-1', kind: 'side_version', author: 'maria.lopez@boscotech.net', created_at: at(70), bytes: 3_880_420, hash: hash('8'), reason: 'caller does not hold lock' },
	{ id: 'v-1b', kind: 'version', author: 'maria.lopez@boscotech.net', created_at: at(1440 + 120), bytes: 3_870_000, hash: hash('7'), reason: null },
	{ id: 'v-0b', kind: 'version', author: 'ana.reyes@boscotech.net', created_at: at(1440 * 3), bytes: 2_100_000, hash: hash('6'), reason: null }
];

export const RELEASE = {
	tag: 'v0.1.0',
	files: [
		{
			name: 'IDEA-Armory-Setup-v0.1.0.exe',
			size: 36909480,
			sha256: '65f65ac9ccb90667ec42fd298cb95fffa3e1556de68b50ff52d10201d51cbcdd',
			kind: 'laptop' as const,
			href: 'https://github.com/pina-hash/idea-armory/releases/download/v0.1.0/IDEA-Armory-Setup-v0.1.0.exe'
		},
		{
			name: 'IDEA-Armory-USB-v0.1.0.zip',
			size: 49819497,
			sha256: 'c1f7c9e3c02cfcd06a28d0ae6c0b6da28e896271a2477ed623a16e9b7dba4163',
			kind: 'flash-drive' as const,
			href: 'https://github.com/pina-hash/idea-armory/releases/download/v0.1.0/IDEA-Armory-USB-v0.1.0.zip'
		}
	]
};

export const CONNECT = {
	port: 51234,
	state: 'k3vV0fG7pQ2xYwq1nZ8rT5uB9mC4aE6dH0jL2sN7oPq',
	challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
	device: 'Lab PC 3'
};

/** The checkout list as 0232's armory_project_checkouts answers it, with chosen names. */
const CHOSEN: Record<string, string> = { 'ana.reyes@boscotech.net': 'Ana Reyes', 'ben.okafor@boscotech.net': 'Ben Okafor' };
export const checkoutsOf = (files: ArmoryFile[]): ArmoryCheckout[] =>
	checkoutsFromFiles(files).map((c) => ({ ...c, holder_name: CHOSEN[c.holder_email] ?? null }));

export const DEVICES: ArmoryDevice[] = [
	{ id: 'd-lab3', name: 'Lab PC 3', registered_at: at(60 * 24 * 9), last_seen: NOW - 2 * 60_000 },
	{ id: 'd-home', name: 'Ana laptop', registered_at: at(60 * 24 * 20), last_seen: NOW - 60 * 60_000 * 26 }
];

export const STORAGE = { bytes: 41_225_884, files: 14 };

let cursor = 900;
const change = (kind: string, minutesAgo: number, entity: string, payload: Record<string, unknown>): ArmoryChange => ({
	cursor: cursor--,
	kind,
	entity_id: entity,
	payload,
	created_at: at(minutesAgo)
});
/** Newest first, the order the load hands it down. */
export const ACTIVITY: ArmoryChange[] = [
	change('lock_acquired', 6, 'f-4', { holder: 'ben.okafor@boscotech.net', device_id: 'd-ben' }),
	change('lock_acquired', 18, 'f-2', { holder: 'ana.reyes@boscotech.net', device_id: 'd-lab3' }),
	change('lock_released', 25, 'f-4', { device_id: 'd-lab3' }),
	change('version', 26, 'v-4', { file_id: 'f-4', device_id: 'd-lab3' }),
	change('lock_acquired', 40, 'f-4', { holder: 'ana.reyes@boscotech.net', device_id: 'd-lab3' }),
	change('folder_renamed', 120, PROJECT.id, { from: 'Drive', to: 'Drivetrain', files: 3, by: 'maria.lopez@boscotech.net' }),
	change('file_revived', 200, 'f-4', { folder: 'Intake', name: 'Roller Bracket.SLDPRT', by: 'ana.reyes@boscotech.net' }),
	change('lock_broken', 300, 'f-5', { by: 'maria.lopez@boscotech.net', former_holder: 'ben.okafor@boscotech.net' }),
	change('folder_deleted', 1500, PROJECT.id, { folder: 'Old Intake', files: 2, by: 'maria.lopez@boscotech.net' }),
	change('member_added', 1600, PROJECT.id, { email: 'ben.okafor@boscotech.net', role: 'student', by: 'apina@boscotech.edu' }),
	change('project_renamed', 2000, PROJECT.id, { from: 'Robot', to: 'Robot 2026', by: 'apina@boscotech.edu' }),
	change('project_created', 5000, PROJECT.id, { name: 'Robot', season: null, by: 'apina@boscotech.edu' })
];

export const START_RELEASE = { tag: 'v0.1.0', size: 36909480, name: 'IDEA-Armory-Setup-v0.1.0.exe' };

// ---- Armory v0.3 on the website (round of 2026-10-07): many, team, search ----
// Every name here is invented for the harness.

/** The members of the small project, as 0233's team read answers them. */
export const MEMBERS_LINKED: ArmoryMember[] = [
	{ email: 'apina@boscotech.edu', role: 'mentor', name: 'Mr. Pina', avatar: 'preset:hex', avatar_url: null, pathway: 'IDEA', has_account: true, devices: [], checkouts: [] },
	{ email: 'maria.lopez@boscotech.net', role: 'cad_lead', name: 'Maria Lopez', avatar: 'preset:owl', avatar_url: null, pathway: 'IDEA', has_account: true, devices: [], checkouts: [] },
	{ email: 'ana.reyes@boscotech.net', role: 'student', name: 'Ana Reyes', avatar: 'preset:fox', avatar_url: null, pathway: 'ACE', has_account: true, devices: [], checkouts: [] },
	{ email: 'ben.okafor@boscotech.net', role: 'student', name: 'Ben Okafor', avatar: null, avatar_url: null, pathway: 'MSET', has_account: true, devices: [], checkouts: [] }
];

const MANY_FOLDERS = ['Arm', 'Bumpers', 'Climber', 'Drivetrain', 'Electrical', 'Elevator', 'Field Elements', 'Frame', 'Hardware', 'Intake', 'Sensors', 'Shooter'];
const MANY_SUB: Record<string, string> = {
	Arm: 'Wrist',
	Climber: 'Hooks',
	Drivetrain: 'Wheels',
	Elevator: 'Carriage',
	Intake: 'Rollers',
	Shooter: 'Flywheel'
};
const PART = ['Plate', 'Bracket', 'Spacer', 'Shaft', 'Gusset', 'Hub', 'Mount', 'Cover', 'Rail', 'Tube'];
const HOLDERS = [
	{ email: 'ana.reyes@boscotech.net', device: 'Lab PC 3', id: 'd-lab3' },
	{ email: 'ben.okafor@boscotech.net', device: 'Ben laptop', id: 'd-ben' },
	{ email: 'diego.marin@boscotech.net', device: 'Lab PC 5', id: 'd-lab5' },
	{ email: 'priya.natarajan@boscotech.net', device: 'Lab PC 8', id: 'd-lab8' },
	{ email: 'sam.whitfield@boscotech.net', device: 'Sam laptop', id: 'd-sam' },
	{ email: 'apina@boscotech.edu', device: 'Room 214 desk', id: 'd-pina' }
];

/**
 * THE MANY FIXTURE: 240 files in 12 top-level folders (six with a subfolder),
 * 60 of them checked out by 6 people on 7 computers. Deterministic: no
 * Math.random, every value from the index.
 */
export const MANY_FILES: ArmoryFile[] = Array.from({ length: 240 }, (_, i) => {
	const top = MANY_FOLDERS[i % 12];
	const n = Math.floor(i / 12);
	const folder = MANY_SUB[top] && n >= 14 ? `${top}/${MANY_SUB[top]}` : top;
	// Five of each folder's twenty are checked out, by the six holders in turn.
	const out = n % 4 === (i % 12) % 4;
	const holder = HOLDERS[out ? Math.floor(i / 4) % 6 : (i % 6)];
	// Ana works on two computers: the second half of her checkouts are from home.
	const device = out && holder.email === 'ana.reyes@boscotech.net' && i > 120 ? { device: 'Ana laptop', id: 'd-home' } : holder;
	return {
		id: `m-${String(i).padStart(3, '0')}`,
		folder,
		name: `${top.split(' ')[0]} ${PART[n % 10]} ${String(n + 1).padStart(2, '0')}.SLDPRT`,
		deleted: false,
		created_at: at(9000 - i),
		current: version(`mv-${i}`, holder.email, 600 + i * 3, 'abcdef'[i % 6]),
		lock: out ? lock(holder.email, device.device, device.id, 20 + i * 7) : null
	};
});
export const MANY_SEEN: Record<string, number> = {
	'd-lab3': NOW - 60_000,
	'd-home': NOW - 60 * 60_000 * 30,
	'd-ben': NOW - 3 * 60_000,
	'd-lab5': NOW - 40_000,
	'd-lab8': NOW - 60 * 60_000 * 3,
	'd-sam': NOW - 90_000,
	'd-pina': NOW - 5 * 60_000
};

const NAMES: Record<string, string> = {
	'apina@boscotech.edu': 'Mr. Pina',
	'ana.reyes@boscotech.net': 'Ana Reyes',
	'ben.okafor@boscotech.net': 'Ben Okafor',
	'diego.marin@boscotech.net': 'Diego Marin',
	'priya.natarajan@boscotech.net': 'Priya Natarajan',
	'sam.whitfield@boscotech.net': 'Sam Whitfield',
	'maria.lopez@boscotech.net': 'Maria Lopez'
};
export const manyCheckouts = (files: ArmoryFile[]): ArmoryCheckout[] =>
	checkoutsFromFiles(files).map((c) => ({ ...c, holder_name: NAMES[c.holder_email] ?? null }));

const seenAt = (minutesAgo: number | null) => (minutesAgo === null ? null : new Date(NOW - minutesAgo * 60_000).toISOString());
const dev = (id: string, name: string, minutesAgo: number | null, state: string | null = 'idle', app = '0.3.0') => ({
	id,
	name,
	registered_at: at(60 * 24 * 20),
	last_seen: seenAt(minutesAgo),
	app_version: minutesAgo === null ? null : app,
	state: minutesAgo === null ? null : state
});
const outOf = (email: string) =>
	MANY_FILES.filter((f) => f.lock && f.lock.holder_email === email).map((f) => ({
		file_id: f.id,
		folder: f.folder,
		name: f.name,
		path: `${f.folder}/${f.name}`,
		since: f.lock!.acquired_at,
		device_id: f.lock!.holder_device_id
	}));

/**
 * THE TEAM FIXTURE: eighteen members with every presence the page can say.
 * `jordan.vance@` chose the display name "Shadow"; the team read carries only
 * that name, and a student viewer must never see the address it hides.
 */
export const TEAM: ArmoryMember[] = [
	{ email: 'apina@boscotech.edu', role: 'mentor', name: 'Mr. Pina', avatar: 'preset:hex', avatar_url: null, pathway: 'IDEA', has_account: true, devices: [dev('d-pina', 'Room 214 desk', 5)], checkouts: outOf('apina@boscotech.edu') },
	{ email: 'maria.lopez@boscotech.net', role: 'cad_lead', name: 'Maria Lopez', avatar: 'preset:owl', avatar_url: null, pathway: 'IDEA', has_account: true, devices: [dev('d-maria', 'Lab PC 1', 1, 'syncing')], checkouts: [] },
	{ email: 'ana.reyes@boscotech.net', role: 'student', name: 'Ana Reyes', avatar: 'preset:fox', avatar_url: null, pathway: 'ACE', has_account: true, devices: [dev('d-lab3', 'Lab PC 3', 1), dev('d-home', 'Ana laptop', 60 * 30)], checkouts: outOf('ana.reyes@boscotech.net') },
	{ email: 'ben.okafor@boscotech.net', role: 'student', name: 'Ben Okafor', avatar: null, avatar_url: null, pathway: 'MSET', has_account: true, devices: [dev('d-ben', 'Ben laptop', 2)], checkouts: outOf('ben.okafor@boscotech.net') },
	{ email: 'diego.marin@boscotech.net', role: 'student', name: 'Diego Marin', avatar: 'preset:gear', avatar_url: null, pathway: 'BMET', has_account: true, devices: [dev('d-lab5', 'Lab PC 5', 1)], checkouts: outOf('diego.marin@boscotech.net') },
	{ email: 'priya.natarajan@boscotech.net', role: 'student', name: 'Priya Natarajan', avatar: 'preset:orbit', avatar_url: null, pathway: 'CSEE', has_account: true, devices: [dev('d-lab8', 'Lab PC 8', 60 * 3)], checkouts: outOf('priya.natarajan@boscotech.net') },
	{ email: 'sam.whitfield@boscotech.net', role: 'student', name: 'Sam Whitfield', avatar: null, avatar_url: null, pathway: 'MAT', has_account: true, devices: [dev('d-sam', 'Sam laptop', 1, 'offline-soon')], checkouts: outOf('sam.whitfield@boscotech.net') },
	{ email: 'jordan.vance@boscotech.net', role: 'student', name: 'Shadow', avatar: 'preset:cat', avatar_url: null, pathway: 'IDEA', has_account: true, devices: [dev('d-jv', 'Lab PC 9', null)], checkouts: [] },
	{ email: 'lena.osei@boscotech.net', role: 'student', name: 'Lena Osei', avatar: 'preset:bolt', avatar_url: null, pathway: 'ACE', has_account: true, devices: [], devices_total: 0, checkouts: [] },
	{ email: 'tomas.ruiz@boscotech.net', role: 'student', name: 'Tomas Ruiz', avatar: null, avatar_url: null, pathway: 'BMET', has_account: true, devices: [], devices_total: 2, checkouts: [] },
	{ email: 'kai.nakamura@boscotech.net', role: 'student', name: 'Kai Nakamura', avatar: 'preset:wave', avatar_url: null, pathway: 'CSEE', has_account: true, devices: [dev('d-kai', 'Kai laptop', 60 * 24 * 2)], checkouts: [] },
	{ email: 'noor.haddad@boscotech.net', role: 'student', name: 'Noor Haddad', avatar: 'preset:compass', avatar_url: null, pathway: 'MSET', has_account: true, devices: [dev('d-noor', 'Lab PC 11', 45)], checkouts: [] },
	{ email: 'eli.brandt@boscotech.net', role: 'student', name: 'Eli Brandt', avatar: null, avatar_url: null, pathway: 'MAT', has_account: true, devices: [dev('d-eli', 'Lab PC 12', 1)], checkouts: [] },
	{ email: 'grace.ifeanyi@boscotech.net', role: 'student', name: 'Grace Ifeanyi', avatar: 'preset:triad', avatar_url: null, pathway: 'IDEA', has_account: true, devices: [dev('d-grace', 'Grace laptop', 60 * 24 * 5, 'idle', '0.2.9')], checkouts: [] },
	{ email: 'owen.park@boscotech.net', role: 'instructor', name: 'Owen Park', avatar: 'preset:reticle', avatar_url: null, pathway: null, has_account: true, devices: [dev('d-owen', 'Lab PC 2', 12)], checkouts: [] },
	{ email: 'zara.mendes@boscotech.net', role: 'student', name: 'Zara Mendes', avatar: 'preset:delta', avatar_url: null, pathway: 'ACE', has_account: true, devices: [dev('d-zara', 'Zara laptop', 60 * 7)], checkouts: [] },
	{ email: 'hugo.lind@boscotech.net', role: 'student', name: 'Hugo Lind', avatar: null, avatar_url: null, pathway: 'CSEE', has_account: true, devices: [dev('d-hugo', 'Lab PC 14', 1)], checkouts: [] },
	{ email: 'new.student@boscotech.net', role: 'student', has_account: false, devices: [], checkouts: [] }
];

/** People with a site account, for the in-memory search. */
export const DIRECTORY: Array<{ email: string; name: string; avatar: string | null; pathway: string | null }> = [
	...TEAM.filter((m) => m.has_account).map((m) => ({ email: m.email, name: m.name!, avatar: m.avatar ?? null, pathway: m.pathway ?? null })),
	{ email: 'anaya.cole@boscotech.net', name: 'Anaya Cole', avatar: 'preset:axolotl', pathway: 'IDEA' },
	{ email: 'andre.silva@boscotech.net', name: 'Andre Silva', avatar: null, pathway: 'MSET' },
	{ email: 'hana.kim@boscotech.net', name: 'Hana Kim', avatar: 'preset:bear', pathway: 'ACE' },
	{ email: 'ivan.petrov@boscotech.net', name: 'Ivan Petrov', avatar: 'preset:turbine', pathway: 'BMET' },
	{ email: 'mila.santos@boscotech.edu', name: 'Ms. Santos', avatar: 'preset:circuit', pathway: null }
];

/** Forty change-feed rows for the many fixture, newest first. */
export const MANY_ACTIVITY: ArmoryChange[] = Array.from({ length: 40 }, (_, i) => {
	const f = MANY_FILES[(i * 7) % 240];
	const by = HOLDERS[i % 6].email;
	const kinds = ['lock_acquired', 'version', 'lock_released', 'file_created'] as const;
	const kind = kinds[i % 4];
	return {
		cursor: 5000 - i,
		kind,
		entity_id: kind === 'version' ? `mv-${i}` : f.id,
		payload:
			kind === 'version'
				? { file_id: f.id, device_id: HOLDERS[i % 6].id }
				: kind === 'file_created'
					? { name: f.name, folder: f.folder, by }
					: { holder: by, device_id: HOLDERS[i % 6].id },
		created_at: at(3 + i * 11)
	};
});

export const MANY_STORAGE = { bytes: 1_288_490_188, files: 1_204 };

export const MANY_PROJECT: ArmoryProject = { id: '6b1f6c1e-0000-4000-8000-000000000005', name: 'Robot 2027', season: null, role: 'mentor', archived: false };

/** What Delete forever would remove from the archived project. */
export const PURGE_PREVIEW = {
	name: 'Robot 2025',
	folder: null,
	files: 212,
	live_files: 198,
	versions: 1_604,
	side_versions: 37,
	checkouts: 2,
	blobs: 1_390,
	bytes: 3_221_225_472,
	archived: true,
	referenced_elsewhere: 0,
	can_purge: true
};

/** The same project when another project's file history names one of its versions (0233 refuses 55006). */
export const PURGE_PREVIEW_BLOCKED = { ...PURGE_PREVIEW, referenced_elsewhere: 2, can_purge: false };

/** The index's cards, with the counts 0233's summaries read adds. */
export const SUMMARIES = [
	{ ...PROJECT, files: 5, removed: 0, checked_out: 2, mine: 0, members: 4, versions: 31, side_versions: 3, bytes: 41_225_884, stored: 14, last_change_at: at(6) },
	{ ...PROJECTS[1], files: 48, removed: 2, checked_out: 9, mine: 2, members: 6, versions: 220, side_versions: 4, bytes: 210_000_000, stored: 160, last_change_at: at(95) },
	{ ...PROJECTS[2], files: 412, removed: 30, checked_out: 37, mine: 0, members: 12, versions: 2_812, side_versions: 51, bytes: 2_400_000_000, stored: 1_900, last_change_at: at(60 * 26) },
	{ ...PROJECTS[3], files: 212, removed: 14, checked_out: 0, mine: 0, members: 9, versions: 1_604, side_versions: 37, bytes: 3_221_225_472, stored: 1_390, last_change_at: at(60 * 24 * 120) },
	{ id: '6b1f6c1e-0000-4000-8000-000000000006', name: 'Freshman Drawbot', season: null, role: null, archived: false, files: 26, removed: 0, checked_out: 3, mine: 0, members: 5, versions: 90, side_versions: 0, bytes: 30_000_000, stored: 60, last_change_at: at(300) }
];
