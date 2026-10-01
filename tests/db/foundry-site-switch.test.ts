// tests/db/foundry-site-switch.test.ts
//
// 0230 PART B1: THE WHOLE-FOUNDRY SWITCH (report c26026b0). What would fail
// SILENTLY, and so is asserted here:
//
//   1. THE TWO RE-CREATED FUNCTIONS ANSWER EVERY DEPLOYED CALL AS BEFORE.
//      foundry_section_access (0173) and foundry_play_start (0139) are replaced
//      at their existing signatures, and a body that drifted on the way past
//      would change what every student's Foundry gate reads with nothing on
//      screen to say so. So a CORPUS of calls is put to the DEPLOYED functions
//      first (a closed class, an open class, a teacher, an admin, no session;
//      a published build, the wrong build, a hidden app, a draft, an invented
//      id, no session), 0230 is applied over the same database, and the corpus
//      is put again and compared case for case. The only difference allowed is
//      the four site keys, and their values are asserted too.
//   2. ONLY AN ADMIN TURNS IT OFF, and while it is off no play is recorded for
//      anybody, with the on state as the positive control.
//   3. NO ADDRESS IN THE PAYLOAD: closed_by is in the table and never in a
//      read, with the stored row as the positive control.
//   4. THE TABLE'S GRANTS: service_role reads it (the bundle gate) and writes
//      nothing; no client role holds anything.
//   5. A SECOND PASTE never turns a closed Foundry back on.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './harness';
import {
	PRE_0230,
	SQL_0230,
	canExecute,
	catalogFingerprint,
	overloads,
	refusal,
	tablePrivileges
} from './chain-0230';

const ACCESS = 'select public.foundry_section_access() as r';
const PLAY = 'select public.foundry_play_start($1::uuid, $2::uuid) as r';
const SET = 'select public.foundry_set_site_open($1::boolean, $2) as r';
const SITE_KEYS = ['site_closed_at', 'site_exempt', 'site_note', 'site_open'] as const;
const FAKE = '00000000-0000-4000-8000-000000000000';
const ADMIN_ONLY = 'Only a site administrator can turn the whole Foundry on or off.';

type Json = Record<string, unknown>;

let db: TestDb;
let admin: SeededUser;
let teacher: SeededUser;
let closedKid: SeededUser;
let openKid: SeededUser;
let maker: SeededUser;
let player: SeededUser;
let closedSection: string;

const app: Record<string, { app: string; version: string }> = {};

async function publishApp(as: SeededUser, slug: string): Promise<{ app: string; version: string }> {
	const appId = await db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: { app_id: string } }>(
			`select public.foundry_create_app($1, $2, $3, null, $4) as r`,
			[slug, `App ${slug}`, 'Plain HTML and a bit of JavaScript.', 'A test app.']
		);
		return rows[0].r.app_id;
	});
	const versionId = await db.asUser(as.id, async (q) => {
		const { rows } = await q<{ r: { version_id: string } }>(
			`select public.foundry_create_version($1::uuid, $2) as r`,
			[appId, `uploads/${appId}/v1.zip`]
		);
		return rows[0].r.version_id;
	});
	await db.asUser(as.id, (q) => q(`select public.foundry_submit_version($1::uuid)`, [versionId]));
	await db.asUser(admin.id, (q) =>
		q(`select public.foundry_review_version($1::uuid, 'approve', null, null)`, [versionId])
	);
	return { app: appId, version: versionId };
}

/** Each caller's access answer; '' is no session, read as the connection owner. */
async function accessAs(u: SeededUser | null): Promise<Json> {
	if (!u) return (await db.sql<{ r: Json }>(ACCESS)).rows[0].r;
	return db.asUser(u.id, async (q) => (await q<{ r: Json }>(ACCESS)).rows[0].r);
}
async function playAs(u: SeededUser | null, appId: string, versionId: string): Promise<Json | string> {
	try {
		if (!u) return (await db.sql<{ r: Json }>(PLAY, [appId, versionId])).rows[0].r;
		return await db.asUser(u.id, async (q) => (await q<{ r: Json }>(PLAY, [appId, versionId])).rows[0].r);
	} catch (error) {
		return `raised: ${(error as Error).message}`;
	}
}
async function setSite(u: SeededUser, open: boolean | null, note: string | null = null): Promise<Json> {
	return db.asUser(u.id, async (q) => (await q<{ r: Json }>(SET, [open, note])).rows[0].r);
}
async function plays(): Promise<number> {
	return (await db.sql<{ n: number }>(`select count(*)::int as n from public.student_app_plays`)).rows[0].n;
}
function withoutSite(r: Json): Json {
	const out = { ...r };
	for (const k of SITE_KEYS) delete out[k];
	return out;
}
/** What a play answer means, without the parts that differ per call by design. */
function playShape(r: Json | string): unknown {
	if (typeof r === 'string') return r;
	return { ok: r.ok, reason: r.reason ?? null, keys: Object.keys(r).sort() };
}

type AccessCase = [string, () => SeededUser | null];
const ACCESS_CASES: AccessCase[] = [
	['a student whose class closed the Foundry', () => closedKid],
	['a student whose class did not', () => openKid],
	['a teacher', () => teacher],
	['an admin', () => admin],
	['the maker', () => maker],
	['no session', () => null]
];
type PlayCase = [string, () => SeededUser | null, () => [string, string]];
const PLAY_CASES: PlayCase[] = [
	['the published build', () => player, () => [app.live.app, app.live.version]],
	['the wrong build', () => player, () => [app.live.app, app.draft.version]],
	['a hidden app', () => player, () => [app.hidden.app, app.hidden.version]],
	['a draft only', () => player, () => [app.draft.app, app.draft.version]],
	['an invented app', () => player, () => [FAKE, app.live.version]],
	['no session', () => null, () => [app.live.app, app.live.version]]
];

const accessBefore = new Map<string, Json>();
const playBefore = new Map<string, unknown>();

beforeAll(async () => {
	db = await startTestDb(PRE_0230);

	admin = await createUser(db, 'apina@boscotech.edu', 'Owner Admin');
	teacher = await createUser(db, 'teach@boscotech.edu', 'Tea Cher');
	closedKid = await createUser(db, 'closed.kid@boscotech.net', 'Closed Kid');
	openKid = await createUser(db, 'open.kid@boscotech.net', 'Open Kid');
	maker = await createUser(db, 'maker@boscotech.net', 'Mae Ker');
	player = await createUser(db, 'player@boscotech.net', 'Play Er');

	closedSection = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 1', teacherEmail: teacher.email });
	const openSection = await createClassroomSection(db, { as: admin, courseCode: 'IDEA100', courseTitle: 'Engineering I', label: 'Block 2', teacherEmail: teacher.email });
	await enrollStudent(db, { as: teacher, sectionId: closedSection, email: closedKid.email, displayName: 'Closed Kid' });
	await enrollStudent(db, { as: teacher, sectionId: openSection, email: openKid.email, displayName: 'Open Kid' });
	// THROUGH THE REAL 0173 WRITE: the class closure 0230 must leave alone.
	await db.asUser(teacher.id, (q) =>
		q(`select public.foundry_set_section_open($1::uuid, false, $2)`, [closedSection, 'CAD day, back tomorrow.'])
	);

	app.live = await publishApp(maker, 'live-app');
	app.hidden = await publishApp(maker, 'hidden-app');
	await db.asUser(admin.id, (q) =>
		q(`select public.foundry_set_app_hidden($1::uuid, true, 'Under discussion.')`, [app.hidden.app])
	);
	const draftApp = await db.asUser(maker.id, async (q) => {
		const { rows } = await q<{ r: { app_id: string } }>(
			`select public.foundry_create_app($1, $2, $3, null, null) as r`,
			['draft-app', 'A draft', 'Plain HTML.']
		);
		return rows[0].r.app_id;
	});
	const draftVersion = await db.asUser(maker.id, async (q) => {
		const { rows } = await q<{ r: { version_id: string } }>(
			`select public.foundry_create_version($1::uuid, $2) as r`,
			[draftApp, `uploads/${draftApp}/v1.zip`]
		);
		return rows[0].r.version_id;
	});
	app.draft = { app: draftApp, version: draftVersion };

	// THE CORPUS, PUT TO THE DEPLOYED FUNCTIONS.
	for (const [name, who] of ACCESS_CASES) accessBefore.set(name, await accessAs(who()));
	for (const [name, who, args] of PLAY_CASES) playBefore.set(name, playShape(await playAs(who(), ...args())));

	await db.sql(SQL_0230);
});

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
describe('the deployed corpus, case for case', () => {
	test('the corpus was not empty, and the class closure was in it', () => {
		expect(accessBefore.size).toBe(6);
		expect(playBefore.size).toBe(6);
		expect(accessBefore.get('a student whose class closed the Foundry')).toMatchObject({ ok: true, open: false });
		expect(playBefore.get('the published build')).toMatchObject({ ok: true });
		expect(playBefore.get('no session')).toBe('raised: You must be signed in.');
	});

	test.each(ACCESS_CASES)('foundry_section_access, %s: every 0173 key keeps its value', async (name, who) => {
		const after = await accessAs(who());
		const before = accessBefore.get(name)!;
		expect(withoutSite(after)).toEqual(before);
		// The keys really are new: the deployed answer did not carry them.
		for (const k of SITE_KEYS) expect(before).not.toHaveProperty(k);
		expect(after).toMatchObject({
			site_open: true,
			site_closed_at: null,
			site_note: null,
			site_exempt: who() === admin
		});
	});

	test.each(PLAY_CASES)('foundry_play_start, %s: the same answer', async (name, who, args) => {
		expect(playShape(await playAs(who(), ...args()))).toEqual(playBefore.get(name));
	});

	test('a NEW player still starts a fresh session, not a resumed one', async () => {
		const fresh = await createUser(db, 'fresh@boscotech.net', 'Fresh Player');
		expect(await playAs(fresh, app.live.app, app.live.version)).toMatchObject({ ok: true, resumed: false });
	});
});

// ===========================================================================
describe('only an admin turns it off', () => {
	test('a student and a teacher are refused; anon cannot call it at all', async () => {
		expect(await refusal(() => setSite(closedKid, false))).toBe(ADMIN_ONLY);
		expect(await refusal(() => setSite(teacher, false))).toBe(ADMIN_ONLY);
		expect(await refusal(() => db.asAnon((q) => q(SET, [false, null])))).toMatch(/permission denied for function/);
		// And nothing moved.
		expect((await accessAs(openKid)).site_open).toBe(true);
	});

	test('an admin must say on or off, and keeps the note short', async () => {
		expect(await refusal(() => setSite(admin, null))).toBe('On or off? That has to be one or the other.');
		expect(await refusal(() => setSite(admin, false, 'n'.repeat(301)))).toBe('Keep the note to 300 characters.');
		expect((await accessAs(openKid)).site_open).toBe(true);
	});
});

// ===========================================================================
describe('while it is off', () => {
	let closedAt: string;

	beforeAll(async () => {
		const r = await setSite(admin, false, '  Back on Monday.  ');
		expect(r).toMatchObject({ ok: true, open: false, note: 'Back on Monday.' });
		closedAt = r.closed_at as string;
		expect(closedAt).toBeTruthy();
	});

	test('every reader is told, the note travels, and only an admin is exempt', async () => {
		const student = await accessAs(closedKid);
		expect(student).toMatchObject({ site_open: false, site_closed_at: closedAt, site_note: 'Back on Monday.', site_exempt: false });
		// The class closure is still reported exactly as before.
		expect(withoutSite(student)).toEqual(accessBefore.get('a student whose class closed the Foundry'));
		expect(await accessAs(openKid)).toMatchObject({ open: true, site_open: false, site_exempt: false });
		expect(await accessAs(admin)).toMatchObject({ open: true, site_open: false, site_exempt: true });
	});

	test('no address in the payload, while the stored row does name who turned it off', async () => {
		for (const u of [closedKid, openKid, teacher, admin]) {
			expect(JSON.stringify(await accessAs(u))).not.toContain('@');
		}
		const { rows } = await db.sql(`select closed_by from public.foundry_site_settings`);
		expect(rows[0].closed_by).toBe(admin.email);
	});

	test('turning it off twice keeps the first time', async () => {
		const again = await setSite(admin, false, 'Still off.');
		expect(again.closed_at).toBe(closedAt);
		expect((await accessAs(openKid)).site_note).toBe('Still off.');
	});

	test('no play is recorded, for a student or an admin, and nothing is written', async () => {
		const n = await plays();
		for (const u of [player, maker, admin]) {
			expect(await playAs(u, app.live.app, app.live.version)).toEqual({ ok: false, reason: 'not_playable' });
		}
		expect(await plays()).toBe(n);
	});

	test('a second paste does not turn it back on', async () => {
		const before = await catalogFingerprint(db);
		await db.sql(SQL_0230);
		expect(await catalogFingerprint(db)).toBe(before);
		expect(await accessAs(openKid)).toMatchObject({ site_open: false, site_closed_at: closedAt });
		const { rows } = await db.sql<{ n: number }>(`select count(*)::int as n from public.foundry_site_settings`);
		expect(rows[0].n).toBe(1);
	});

	test('turning it back on clears all three fields, and play works again (the positive control)', async () => {
		expect(await setSite(admin, true, 'ignored')).toEqual({ ok: true, open: true, closed_at: null, note: null });
		const { rows } = await db.sql(`select closed_at, closed_by, note from public.foundry_site_settings`);
		expect(rows[0]).toEqual({ closed_at: null, closed_by: null, note: null });
		expect(await accessAs(closedKid)).toMatchObject({ site_open: true, site_note: null });
		const second = await createUser(db, 'second@boscotech.net', 'Second Player');
		expect(await playAs(second, app.live.app, app.live.version)).toMatchObject({ ok: true, resumed: false });
	});
});

// ===========================================================================
describe('the grants', () => {
	test('the settings table: RLS on, no policy, nothing for a client, SELECT alone for the service role', async () => {
		const { rows } = await db.sql<{ rls: boolean; policies: number }>(
			`select c.relrowsecurity as rls,
			        (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
			 from pg_class c where c.oid = 'public.foundry_site_settings'::regclass`
		);
		expect(rows[0]).toEqual({ rls: true, policies: 0 });
		expect(await tablePrivileges(db, 'anon', 'foundry_site_settings')).toEqual([]);
		expect(await tablePrivileges(db, 'authenticated', 'foundry_site_settings')).toEqual([]);
		expect(await tablePrivileges(db, 'service_role', 'foundry_site_settings')).toEqual(['select']);
		// The bundle gate's read works as the service role, and a student's does not.
		const served = await db.asServiceRole((q) => q(`select closed_at from public.foundry_site_settings where id`));
		expect(served.rows).toHaveLength(1);
		expect(await refusal(() => db.asUser(openKid.id, (q) => q(`select * from public.foundry_site_settings`)))).toMatch(
			/permission denied/
		);
	});

	test('it is a singleton: a second row is unrepresentable', async () => {
		expect(await refusal(() => db.sql(`insert into public.foundry_site_settings (id) values (false)`))).toMatch(
			/check constraint/
		);
	});

	test('the private predicate is reachable by no role at all, and reads the row', async () => {
		for (const role of ['anon', 'authenticated', 'service_role']) {
			expect(await canExecute(db, role, '_foundry_site_closed()'), role).toBe(false);
		}
		expect((await db.sql(`select public._foundry_site_closed() as c`)).rows[0].c).toBe(false);
	});

	test('the three client functions: one overload each, anon no, authenticated yes', async () => {
		for (const fn of ['foundry_set_site_open(boolean, text)', 'foundry_section_access()', 'foundry_play_start(uuid, uuid)']) {
			expect(await overloads(db, fn.split('(')[0]), fn).toBe(1);
			expect(await canExecute(db, 'anon', fn), fn).toBe(false);
			expect(await canExecute(db, 'authenticated', fn), fn).toBe(true);
		}
	});
});
