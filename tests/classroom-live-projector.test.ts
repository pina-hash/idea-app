// tests/classroom-live-projector.test.ts
//
// THE CLASS PROJECTOR SHOWS WHAT THE WHOLE CLASS MAY SEE, AND NOTHING ELSE
// (ledger 0297, package LIVE).
//
// The teacher's control view holds the roster, who is out on the hall pass,
// presence and hand-in states. The projector is a second window of the same
// browser, on the wall. A leak between the two is SILENT: a student's name on
// a wall display renders perfectly and nothing anywhere reports it. So the
// data path to the wall is asserted from both of its ends, each with a
// positive control that proves the instrument could have seen a leak:
//
//   1. THE PROJECTOR'S OWN LOAD, driven for real: the shipping
//      `live/projector/+page.server.ts`, through the PostgREST shim, against
//      real Postgres carrying the real migrations, wrapped in a recorder. It
//      may read one table with one select and ask one yes-or-no, and what it
//      returns carries no address and no name. POSITIVE CONTROL: the control
//      view's own load, through the SAME recorder, reaches the roster and
//      returns a student's address -- so an empty sweep above is a result.
//   2. THE FRAME, the one thing that crosses to the wall: built from a MANAGER
//      hall-pass state that names who is out, it carries no name. POSITIVE
//      CONTROL: the manager chip for that same state does name them, and a
//      pick the teacher pressed Show on does reach the frame.
//   3. THE PROJECTOR'S PARSE drops any key outside the frame type and any
//      hall-pass sentence that is not one of the two student-scope words.
//   4. THE CHANNEL between the windows, over injected fakes: a frame arrives,
//      a later window reads the stored one, and a blocked storage never throws.
//   5. THE PROJECTOR'S SOURCE imports none of the private transports the
//      control view is built from, with the control view as the positive
//      control.
//
// WHERE THE EXPECTED VALUES COME FROM: fixture names and addresses written
// here, the frame's key list compared against a list typed here rather than
// read off the module, and the two hall-pass words as a student reads them on
// their own class page.

import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import { load as projectorLoad } from '../src/routes/classroom/[sectionId]/live/projector/+page.server';
import { load as liveLoad } from '../src/routes/classroom/[sectionId]/live/+page.server';
import { PROJECTOR_SECTION_SELECT } from '../src/lib/classroom/live-class/projector-load';
import {
	PROJECTOR_FRAME_KEYS,
	buildProjectorFrame,
	hallPassWall,
	newerFrame,
	openProjectorChannel,
	parseProjectorFrame,
	parseProjectorMessage,
	type ProjectorChannelHost,
	type ProjectorMessage
} from '../src/lib/classroom/live-class/projector';
import { countdown } from '../src/lib/classroom/live-class/timer';
import { hallPassToolChip, type HallPassManagerState } from '../src/lib/classroom/hall-pass';

const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0069_notebook.sql',
	'0070_coin_economy.sql',
	'0071_notebook_optional_label.sql',
	'0075_notebook_optional_photo.sql',
	'0078_notebook_entry_notes.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0088_notebook_folders.sql',
	'0090_classroom_instructor_materials.sql',
	'0091_notebook_pin_and_activity.sql',
	'0094_notebook_classroom_sections.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0097_notebook_documentation_check.sql',
	'0098_notebook_session_postings.sql',
	'0106_notebook_instructor_student_access.sql',
	'0114_notebook_note_entry_session.sql',
	'0116_notebook_soft_delete.sql',
	'0117_notebook_soft_delete_restore.sql',
	'0118_notebook_draft_state.sql',
	'0120_notebook_session_item_link.sql',
	'0121_notebook_review_acknowledged.sql',
	'0138_classroom_manager_exclusion_and_enrollment_removal.sql'
] as const;

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;
let teacher: SeededUser;
let outsider: SeededUser;
let alice: SeededUser;
let sectionId: string;

/** Every private string in the fixture. None of them may reach the wall. */
const PRIVATE = ['alice@boscotech.net', 'Alice Alvarez', 'mvargas@boscotech.edu', 'M. Vargas'];

beforeAll(async () => {
	db = await startTestDb([...CHAIN]);
	fks = await loadForeignKeys(db);
	teacher = await createUser(db, 'mvargas@boscotech.edu', 'M. Vargas');
	outsider = await createUser(db, 'olsen@boscotech.edu', 'O. Olsen');
	alice = await createUser(db, 'alice@boscotech.net', 'Alice Alvarez');
	sectionId = await createClassroomSection(db, {
		as: teacher,
		courseCode: 'IDEA209H',
		courseTitle: 'Engineering Design Honors',
		label: 'Period 3',
		teacherEmail: teacher.email
	});
	await enrollStudent(db, { as: teacher, sectionId, email: alice.email, displayName: 'Alice Alvarez' });
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

/** The shim for one caller, wrapped so every table, select and function it is asked for is written down. */
function recordingClient(user: SeededUser) {
	const shim = createPostgrestShim(db, fks, user.id);
	const log = { tables: [] as string[], selects: [] as string[], rpcs: [] as string[] };
	const client = {
		from(table: string) {
			log.tables.push(table);
			return {
				select(select: string) {
					log.selects.push(select);
					return shim.from(table).select(select);
				}
			};
		},
		rpc(name: string, args?: Record<string, unknown>) {
			log.rpcs.push(name);
			return shim.rpc(name, args);
		}
	};
	return { client, log };
}

const claimsOf = (u: SeededUser) => ({ sub: u.id, email: u.email, role: 'authenticated' });

type Load = (event: unknown) => Promise<Record<string, unknown>>;

async function driveProjector(user: SeededUser) {
	const { client, log } = recordingClient(user);
	const data = await (projectorLoad as unknown as Load)({
		params: { sectionId },
		locals: { supabase: client, claims: claimsOf(user) }
	});
	return { data, log };
}

async function refusal(run: () => Promise<unknown>): Promise<number | null> {
	try {
		await run();
		return null;
	} catch (e) {
		return (e as { status?: number }).status ?? -1;
	}
}

describe('1. the projector load reads the class name and nothing that names a person', () => {
	it('a manager gets the class label and the section id, and only those two keys', async () => {
		const { data } = await driveProjector(teacher);
		expect(Object.keys(data).sort()).toEqual(['classLabel', 'sectionId']);
		expect(data.sectionId).toBe(sectionId);
		expect(data.classLabel).toContain('IDEA209H');
		expect(data.classLabel).toContain('Period 3');
	});

	it('what it returns carries no address and no name, and the sweep can see both', async () => {
		const { data } = await driveProjector(teacher);
		const json = JSON.stringify(data);
		for (const s of PRIVATE) expect(json, s).not.toContain(s);
		expect(json).not.toContain('@');
		// Positive control for the sweep: the same stringify over a payload that
		// does carry the fixture's address finds it.
		expect(JSON.stringify({ ...data, x: alice.email })).toContain('alice@boscotech.net');
	});

	it('it asks for exactly one table, one select and one yes-or-no', async () => {
		const { log } = await driveProjector(teacher);
		expect(log.tables).toEqual(['classroom_sections']);
		expect(log.selects).toEqual([PROJECTOR_SECTION_SELECT]);
		expect(log.rpcs).toEqual(['classroom_manages_section']);
		// Named absences: the columns and reads a manager's payload carries.
		expect(PROJECTOR_SECTION_SELECT).not.toMatch(/email|teacher|enrollment|roster|student/);
	});

	it('an enrolled student is refused 404, although the section row is theirs to read', async () => {
		// The row IS readable by her (RLS lets an enrolled student see her class),
		// so the refusal is the manage answer, not a missing row.
		const shim = createPostgrestShim(db, fks, alice.id);
		const row = await shim.from('classroom_sections').select(PROJECTOR_SECTION_SELECT).eq('id', sectionId).maybeSingle();
		expect(row.data).not.toBeNull();
		expect(await refusal(() => driveProjector(alice))).toBe(404);
	});

	it('a teacher of another class is refused the same 404', async () => {
		expect(await refusal(() => driveProjector(outsider))).toBe(404);
	});

	it("POSITIVE CONTROL: the control view's load, through the same recorder, reaches the roster", async () => {
		const { client, log } = recordingClient(teacher);
		const data = await (liveLoad as unknown as Load)({
			params: { sectionId },
			parent: async () => ({ canManage: true }),
			locals: { supabase: client, claims: claimsOf(teacher) }
		});
		expect(log.rpcs).toContain('classroom_section_roster');
		expect(JSON.stringify(data)).toContain('alice@boscotech.net');
		// And it is refused to anybody the section layout says does not manage.
		const denied = await refusal(() =>
			(liveLoad as unknown as Load)({
				params: { sectionId },
				parent: async () => ({ canManage: false }),
				locals: { supabase: client, claims: claimsOf(alice) }
			})
		);
		expect(denied).toBe(404);
	});
});

// ---------------------------------------------------------------------------
// 2 and 3. The frame, and the projector's parse of it
// ---------------------------------------------------------------------------

const DAY = '2026-09-23';
const AT = Date.parse('2026-09-23T17:30:00Z');

const managerOut: HallPassManagerState = {
	scope: 'manager',
	section_id: 's-1',
	taken: true,
	mine: false,
	open: {
		pass_id: 'p-1',
		student_email: 'alice@boscotech.net',
		student_name: 'Alice Alvarez',
		opened_at: '2026-09-23T17:20:00Z'
	},
	history: []
};

const frameInput = {
	day: DAY,
	at: AT,
	agenda: ['Warm up: gear ratios', 'Truss sketch · Due 11:59 PM'],
	timer: countdown(10, AT),
	hallPass: managerOut,
	pick: null
};

describe('2. the frame carries what the class may see, and a manager state cannot widen it', () => {
	it('POSITIVE CONTROL: the manager chip for this state names who is out', () => {
		expect(hallPassToolChip(managerOut, AT).word).toContain('Alice Alvarez');
	});

	it('built from that state, the frame names nobody and says Taken', () => {
		const frame = buildProjectorFrame(frameInput);
		const json = JSON.stringify(frame);
		for (const s of PRIVATE) expect(json, s).not.toContain(s);
		expect(json).not.toContain('@');
		expect(frame.hallPass).toEqual({ tone: 'taken', word: 'Taken' });
		expect(hallPassWall({ ...managerOut, taken: false, open: null })).toEqual({ tone: 'free', word: 'Free' });
	});

	it('its keys are exactly the seven the type names', () => {
		const expected = ['agenda', 'at', 'day', 'hallPass', 'pick', 'timer', 'v'];
		expect(Object.keys(buildProjectorFrame(frameInput)).sort()).toEqual(expected);
		expect([...PROJECTOR_FRAME_KEYS].sort()).toEqual(expected);
	});

	it('POSITIVE CONTROL: a pick the teacher pressed Show on reaches the frame, by name', () => {
		const frame = buildProjectorFrame({ ...frameInput, pick: { name: 'Alice Alvarez', seed: 'K7Q2' } });
		expect(JSON.stringify(frame)).toContain('Alice Alvarez');
		// ...and never the address, which the pick does not carry.
		expect(JSON.stringify(frame)).not.toContain('@');
	});
});

describe('3. the projector repaints only what its parse keeps', () => {
	it('drops every key outside the frame type', () => {
		const hostile = {
			...buildProjectorFrame(frameInput),
			roster: [{ email: 'alice@boscotech.net', name: 'Alice Alvarez' }],
			presence: { 'alice@boscotech.net': 'working' },
			email: 'alice@boscotech.net'
		};
		const parsed = parseProjectorFrame(JSON.parse(JSON.stringify(hostile)));
		expect(parsed).not.toBeNull();
		expect(Object.keys(parsed!).sort()).toEqual([...PROJECTOR_FRAME_KEYS].sort());
		expect(JSON.stringify(parsed)).not.toContain('@');
	});

	it('paints no hall pass whose word is not one of the two a student reads', () => {
		const base = buildProjectorFrame(frameInput);
		for (const hallPass of [
			{ tone: 'taken', word: '1 out · Alice Alvarez' },
			{ tone: 'free', word: 'Nobody out' },
			{ tone: 'taken', word: 'Free' },
			{ tone: 'out', word: 'Taken' }
		]) {
			expect(parseProjectorFrame({ ...base, hallPass })?.hallPass, JSON.stringify(hallPass)).toBeNull();
		}
		// Positive control: the real words survive.
		expect(parseProjectorFrame(base)?.hallPass).toEqual({ tone: 'taken', word: 'Taken' });
	});

	it('refuses a frame from another version, a malformed day or a non-finite time', () => {
		const base = buildProjectorFrame(frameInput);
		expect(parseProjectorFrame({ ...base, v: 2 })).toBeNull();
		expect(parseProjectorFrame({ ...base, day: 'today' })).toBeNull();
		expect(parseProjectorFrame({ ...base, at: Number.NaN })).toBeNull();
		expect(parseProjectorFrame(null)).toBeNull();
	});

	it('keeps the newer frame of today, and never one from another day', () => {
		const a = buildProjectorFrame(frameInput);
		const b = buildProjectorFrame({ ...frameInput, at: AT + 1000 });
		const yesterday = buildProjectorFrame({ ...frameInput, day: '2026-09-22', at: AT + 5000 });
		expect(newerFrame(a, b, DAY)).toBe(b);
		expect(newerFrame(b, a, DAY)).toBe(b);
		expect(newerFrame(a, yesterday, DAY)).toBe(a);
		expect(newerFrame(yesterday, null, DAY)).toBeNull();
	});

	it('a message is data: unknown types are dropped, and a frame message is parsed too', () => {
		expect(parseProjectorMessage({ type: 'hello' })).toEqual({ type: 'hello' });
		expect(parseProjectorMessage({ type: 'roster', rows: [] })).toBeNull();
		const m = parseProjectorMessage({ type: 'frame', frame: { ...buildProjectorFrame(frameInput), email: 'x@y' } });
		expect(m?.type).toBe('frame');
		expect(JSON.stringify(m)).not.toContain('@');
	});
});

// ---------------------------------------------------------------------------
// 4. The channel between the two windows
// ---------------------------------------------------------------------------

/** One origin's worth of BroadcastChannels, delivering to every OTHER instance of a name. */
function fakeBroadcastWorld() {
	const open = new Set<FakeChannel>();
	class FakeChannel {
		onmessage: ((e: MessageEvent) => void) | null = null;
		constructor(public name: string) {
			open.add(this);
		}
		postMessage(data: unknown) {
			for (const other of open) {
				if (other !== this && other.name === this.name) {
					other.onmessage?.({ data: structuredClone(data) } as MessageEvent);
				}
			}
		}
		close() {
			open.delete(this);
		}
	}
	return FakeChannel as unknown as typeof BroadcastChannel;
}

/** One origin's localStorage, firing `storage` at every OTHER window, as the browser does. */
function fakeStorageWorld() {
	const map = new Map<string, string>();
	const windows: { fn: (e: { key: string | null; newValue: string | null }) => void; owner: object }[] = [];
	function hostFor(BC?: typeof BroadcastChannel): ProjectorChannelHost {
		const owner = {};
		return {
			BroadcastChannel: BC,
			storage: {
				getItem: (k) => map.get(k) ?? null,
				setItem: (k, v) => {
					map.set(k, v);
					for (const w of windows) if (w.owner !== owner) w.fn({ key: k, newValue: v });
				}
			},
			addStorageListener(fn) {
				const entry = { fn, owner };
				windows.push(entry);
				return () => windows.splice(windows.indexOf(entry), 1);
			}
		};
	}
	return { map, hostFor };
}

describe('4. the channel carries the frame between two windows of one browser', () => {
	it('with a BroadcastChannel: a frame and a hello arrive, and a later window reads the stored frame', () => {
		const BC = fakeBroadcastWorld();
		const store = fakeStorageWorld();
		const toProjector: ProjectorMessage[] = [];
		const toControl: ProjectorMessage[] = [];
		const control = openProjectorChannel('u-1', 's-1', (m) => toControl.push(m), store.hostFor(BC));
		const projector = openProjectorChannel('u-1', 's-1', (m) => toProjector.push(m), store.hostFor(BC));

		projector.send({ type: 'hello' });
		expect(toControl.map((m) => m.type)).toEqual(['hello']);

		const frame = buildProjectorFrame(frameInput);
		control.send({ type: 'frame', frame });
		// Over the channel AND over the storage event: two arrivals of one frame,
		// which `newerFrame` collapses to one.
		expect(toProjector.filter((m) => m.type === 'frame').length).toBeGreaterThanOrEqual(1);
		expect(toProjector.every((m) => m.type !== 'frame' || m.frame.at === AT)).toBe(true);

		const late = openProjectorChannel('u-1', 's-1', () => {}, store.hostFor(BC));
		expect(late.stored()).toEqual(frame);

		// Another class's channel hears nothing.
		const otherClass: ProjectorMessage[] = [];
		openProjectorChannel('u-1', 's-2', (m) => otherClass.push(m), store.hostFor(BC));
		control.send({ type: 'frame', frame });
		expect(otherClass).toEqual([]);
		control.close();
		projector.close();
	});

	it('with no BroadcastChannel, storage alone carries the frame and the hello', () => {
		const store = fakeStorageWorld();
		const toProjector: ProjectorMessage[] = [];
		const toControl: ProjectorMessage[] = [];
		const control = openProjectorChannel('u-1', 's-1', (m) => toControl.push(m), store.hostFor());
		const projector = openProjectorChannel('u-1', 's-1', (m) => toProjector.push(m), store.hostFor());
		projector.send({ type: 'hello' });
		control.send({ type: 'frame', frame: buildProjectorFrame(frameInput) });
		expect(toControl.map((m) => m.type)).toEqual(['hello']);
		expect(toProjector.map((m) => m.type)).toEqual(['frame']);
	});

	it('a storage that throws costs the fallback and never throws into the page', () => {
		const host: ProjectorChannelHost = {
			storage: {
				getItem: () => {
					throw new Error('SecurityError');
				},
				setItem: () => {
					throw new Error('QuotaExceededError');
				}
			}
		};
		const ch = openProjectorChannel('u-1', 's-1', () => {}, host);
		expect(() => ch.send({ type: 'frame', frame: buildProjectorFrame(frameInput) })).not.toThrow();
		expect(ch.stored()).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// 5. The projector's source reaches for no private transport
// ---------------------------------------------------------------------------

describe("5. the projector's page and view import none of the control view's private reads", () => {
	const PRIVATE_READS = [
		'createPresenceTransports',
		'createHallPassTransports',
		'createTeacherEngineTransports',
		'createClassroomLive',
		'loadSectionRoster',
		'classroom_section_roster',
		'classroom_presence',
		'LiveGrid'
	];
	const projectorFiles = [
		'src/routes/classroom/[sectionId]/live/projector/+page@.svelte',
		'src/routes/classroom/[sectionId]/live/projector/+page.server.ts',
		'src/lib/classroom/live-class/ProjectorView.svelte'
	];

	it('names none of them', () => {
		for (const file of projectorFiles) {
			const src = read(file);
			for (const name of PRIVATE_READS) expect(src.includes(name), `${file} names ${name}`).toBe(false);
		}
	});

	it('POSITIVE CONTROL: the control view names most of them, so the sweep reads real source', () => {
		const control = read('src/routes/classroom/[sectionId]/live/+page.svelte') + read('src/routes/classroom/[sectionId]/live/+page.server.ts');
		const found = PRIVATE_READS.filter((name) => control.includes(name));
		expect(found.length).toBeGreaterThanOrEqual(5);
	});
});
