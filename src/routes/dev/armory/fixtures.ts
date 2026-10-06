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
