/**
 * 0045 -- THE CLOSURE REACHES THE ROUTES THAT SERVE BYTES.
 *
 * WHAT THIS FILE IS ABOUT. 0173 built the per-section Foundry closure and 0042
 * decided its scope; 0042 then reported that neither had checked whether the
 * control blocked the thing it exists for. It did not. `/foundry/preview`,
 * `/foundry/download` and `/foundry/starter` are `+server.ts` endpoints, A
 * ROUTE GROUP'S LAYOUT LOAD DOES NOT RUN FOR AN ENDPOINT, and the closure was
 * carried entirely by `+layout.server.ts`. So a student in a closed class
 * pressed Preview on their own shelf -- deliberately open, per 0042 -- and
 * their build ran, on our own host, during somebody's lesson.
 *
 * WHY IT IS AUTOMATED AT ALL, given the repository's rule that tests are the
 * exception: this is a gating boundary whose regression is SILENT. A preview
 * that quietly stops consulting the closure looks identical on screen to one
 * that consults it and is told the class is open. The only person who finds
 * out is an instructor, in front of a class, when the button does not work.
 *
 * IT DRIVES THE REAL HANDLERS against the REAL RPC on a REAL Postgres with the
 * REAL migration chain applied, through the PostgREST shim -- never a
 * hand-written `{ open: false }`. The whole question is what these routes do
 * with what `foundry_section_access()` actually returns for a student in two
 * sections, one of which has closed it, and a stubbed shape would be this file
 * agreeing with itself.
 *
 * THE THREE POSITIVE CONTROLS, because an exclusion assertion that has never
 * bitten is not a result:
 *
 *   1. THE REFUSAL IS THE CLOSURE'S. Every "this student is refused" assertion
 *      is paired with the SAME student, on the SAME route, with the class
 *      OPENED again through the real RPC -- and the refusal flips. A gate that
 *      refused everybody for an unrelated reason cannot pass that pair.
 *   2. THE NARROWING IS WHAT DECIDES IT. `FOUNDRY_CLOSURE_BLOCKS` is mutated
 *      IN MEMORY, both ways: dropping `preview` from it must let a closed
 *      student through, and adding `download` to it must refuse one. Neither
 *      route names the set itself, so this is the only thing that proves the
 *      wire is live rather than the routes happening to agree today.
 *   3. THE APPS ORIGIN HAS NO GATE, AND THAT IS ASSERTED RATHER THAN LEFT
 *      BLANK. See the last section.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
	createClassroomSection,
	createUser,
	enrollStudent,
	startTestDb,
	type SeededUser,
	type TestDb
} from './db/harness';
import { createPostgrestShim, loadForeignKeys } from './db/postgrest-shim';
import {
	FOUNDRY_CLOSURE_BLOCKS,
	FOUNDRY_CLOSURE_LIMIT,
	FOUNDRY_CLOSURE_REACH,
	foundryAccessFromRpc,
	foundryClosureBlocks,
	type FoundryGuarded
} from '../src/lib/foundry/access';
import { GET as PREVIEW_GET } from '../src/routes/foundry/preview/[appId]/[versionId]/[...path]/+server';
import { GET as DOWNLOAD_GET } from '../src/routes/foundry/download/[appId]/[versionId]/+server';
import { GET as STARTER_GET } from '../src/routes/foundry/starter/+server';
import { GET as BUNDLE_GET } from '../src/routes/b/[appId]/[versionId]/[...path]/+server';
import { GET as APP_GET } from '../src/routes/a/[appId]/[...path]/+server';

/**
 * The Foundry chain plus the classroom files 0173's gate reads through, 0094
 * for the uuid/email bridge, and 0141 for the download route's own RPCs. 0137
 * LAST, because it is a sweep over whatever the chain above it created.
 */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0067_admin_tier.sql',
	'0053_app_feedback.sql',
	'0069_notebook.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0090_classroom_instructor_materials.sql',
	'0094_notebook_classroom_sections.sql',
	'0101_classroom_decks.sql',
	'0130_foundry.sql',
	'0131_foundry_service_role_writes.sql',
	'0132_foundry_author_class.sql',
	'0136_foundry_delete.sql',
	'0139_foundry_telemetry.sql',
	'0141_foundry_app_cap_and_download.sql',
	'0173_foundry_section_gate_description_and_trust.sql',
	'0137_anon_execute_sweep.sql'
] as const;

const OWNER_EMAIL = 'apina@boscotech.edu';
const PORTAL = 'https://ideabosco.com';

let db: TestDb;
let fks: Awaited<ReturnType<typeof loadForeignKeys>>;

let owner: SeededUser;
let admin: SeededUser;
let closingTeacher: SeededUser;
/** In BOTH sections. The person this whole bundle is about. */
let student: SeededUser;
/** In neither. The control for "is the refusal about the class at all". */
let outsider: SeededUser;

let closedSectionId: string;
let openSectionId: string;
let appId: string;
let versionId: string;

/**
 * THE SET IS MUTATED IN MEMORY AND RESTORED BY VALUE.
 *
 * `FOUNDRY_CLOSURE_BLOCKS` is a `readonly` array, which is a TypeScript claim
 * and not a runtime one, so the underlying array is splice-able. That is what
 * lets the narrowing be proved from the route's own behaviour rather than from
 * a second reading of the constant.
 *
 * IT IS RESTORED FROM A COPY TAKEN HERE, never re-derived and never restored
 * with `git checkout --`: the repository's mutation rule exists because a
 * restore-to-HEAD discards a session's uncommitted work and leaves every later
 * mutant applying to a pristine tree, which reads as a clean proof and is a
 * script testing code that is no longer there. Nothing on disk is touched by
 * this file at all.
 */
const BLOCKS_ORIGINAL = [...FOUNDRY_CLOSURE_BLOCKS];
const mutableBlocks = FOUNDRY_CLOSURE_BLOCKS as FoundryGuarded[];

function setBlocks(next: readonly FoundryGuarded[]): void {
	mutableBlocks.length = 0;
	mutableBlocks.push(...next);
}

/**
 * THE FIXTURE IS RESTORED IN `afterEach`, NEVER AT THE END OF A TEST BODY.
 *
 * A trailing `openSection` call is skipped the moment an assertion above it
 * fails, so the NEXT test starts against a class that is still closed and
 * fails for a reason that has nothing to do with what it is asserting. That
 * turned one real failure into a cascade of six here before this moved. The
 * mutated set is restored the same way and for the same reason.
 */
afterEach(async () => {
	setBlocks(BLOCKS_ORIGINAL);
	for (const sectionId of [closedSectionId, openSectionId]) {
		await openSection(closingTeacher, sectionId);
	}
});

// ===========================================================================
// Driving the real handlers.
// ===========================================================================

function localsFor(user: SeededUser) {
	return {
		claims: { sub: user.id, email: user.email },
		supabase: createPostgrestShim(db, fks, user.id)
	};
}

function preview(user: SeededUser, app = appId, version = versionId): Promise<Response> {
	const href = `${PORTAL}/foundry/preview/${app}/${version}/`;
	return PREVIEW_GET({
		params: { appId: app, versionId: version, path: '' },
		url: new URL(href),
		request: new Request(href),
		locals: localsFor(user)
	} as never) as Promise<Response>;
}

function download(user: SeededUser): Promise<Response> {
	const href = `${PORTAL}/foundry/download/${appId}/${versionId}`;
	return DOWNLOAD_GET({
		params: { appId, versionId },
		url: new URL(href),
		request: new Request(href),
		locals: localsFor(user)
	} as never) as Promise<Response>;
}

function starter(user: SeededUser): Promise<Response> {
	const href = `${PORTAL}/foundry/starter`;
	return STARTER_GET({
		params: {},
		url: new URL(href),
		request: new Request(href),
		locals: localsFor(user)
	} as never) as Promise<Response>;
}

/**
 * "Was this the CLOSURE'S refusal", asked by its two observable properties
 * together rather than by the status alone.
 *
 * 403 AND THE SENTENCE, because either on its own is weak: a 403 from some
 * other layer would pass a status-only check, and the sentence could in
 * principle appear inside a 200. The class name is what makes it the closure's
 * refusal and not a generic one.
 */
async function refusedByClosure(res: Response): Promise<boolean> {
	if (res.status !== 403) return false;
	const body = await res.text();
	return body.includes('has the Foundry closed right now.');
}

async function closeSection(as: SeededUser, sectionId: string, note: string | null) {
	await db.asUser(as.id, (q) =>
		q(`select public.foundry_set_section_open($1::uuid, false, $2)`, [sectionId, note])
	);
}

async function openSection(as: SeededUser, sectionId: string) {
	await db.asUser(as.id, (q) =>
		q(`select public.foundry_set_section_open($1::uuid, true, null)`, [sectionId])
	);
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	fks = await loadForeignKeys(db);

	owner = await createUser(db, OWNER_EMAIL, 'Site Owner');
	admin = await createUser(db, 'fdyserve-admin@boscotech.edu', 'An Admin');
	closingTeacher = await createUser(db, 'fdyserve-close@boscotech.edu', 'Closing Teacher');
	student = await createUser(db, 'fdyserve-student@boscotech.net', 'A Student');
	outsider = await createUser(db, 'fdyserve-outsider@boscotech.net', 'Another Student');

	await db.asUser(owner.id, (q) =>
		q(`select public.admin_grant($1, null)`, ['fdyserve-admin@boscotech.edu'])
	);

	closedSectionId = await createClassroomSection(db, {
		as: admin,
		courseCode: 'IDEA209H',
		courseTitle: 'Engineering I Honors',
		label: 'Block 3',
		teacherEmail: closingTeacher.email
	});
	openSectionId = await createClassroomSection(db, {
		as: admin,
		courseCode: 'IDEA100',
		courseTitle: 'Introduction to Engineering',
		label: 'Block 6',
		teacherEmail: closingTeacher.email
	});
	for (const sectionId of [closedSectionId, openSectionId]) {
		await enrollStudent(db, {
			as: admin,
			sectionId,
			email: student.email,
			displayName: 'A Student'
		});
	}

	// The student's own app and one version of it, which is what every one of
	// these three routes is addressed by.
	appId = await db.asUser(student.id, async (q) => {
		const { rows } = await q<{ r: { app_id: string } }>(
			`select public.foundry_create_app($1, $2, $3, null, $4) as r`,
			[
				'bolt-sorter',
				'Bolt Sorter',
				'Plain HTML and a bit of JavaScript.',
				'A small browser game about sorting bolts by thread pitch.'
			]
		);
		return rows[0].r.app_id;
	});
	versionId = await db.asUser(student.id, async (q) => {
		const { rows } = await q<{ r: { version_id: string } }>(
			`select public.foundry_create_version($1::uuid, $2) as r`,
			[appId, `${student.id}/${crypto.randomUUID()}.zip`]
		);
		return rows[0].r.version_id;
	});
}, 180_000);

afterAll(async () => {
	await db?.stop();
});

// ===========================================================================
// 1. THE PATHS, AND WHICH ONES A CLOSURE REACHES.
// ===========================================================================

describe('the three serve routes consult the closure', () => {
	/**
	 * THE CENTRAL CLAIM, WITH ITS OWN CONTROL IN THE SAME TEST. A closed
	 * student is refused the preview; the SAME student on the SAME URL is
	 * served the moment the class opens again, through the real RPC. Without
	 * the second half, a route that had come to refuse everybody -- a broken
	 * viewer resolution, a missing fixture -- would pass the first.
	 *
	 * "SERVED" HERE MEANS "PAST THE GATE", NOT 200. There is no
	 * `SUPABASE_SERVICE_ROLE_KEY` in a test process, so `previewBundleFile`
	 * answers `not_configured` and the route turns that into its own bodyless
	 * 404. That is a perfectly good discriminator: 403-with-the-sentence and
	 * bodyless-404 are two different answers, and only the first is this gate.
	 */
	it('refuses a closed student the preview, and serves them again when the class opens', async () => {
		await closeSection(closingTeacher, closedSectionId, 'Bench work today.');
		const closed = await preview(student);
		expect(closed.status).toBe(403);
		expect(await refusedByClosure(closed.clone())).toBe(true);

		await openSection(closingTeacher, closedSectionId);
		const opened = await preview(student);
		expect(opened.status).toBe(404);
		expect(await opened.text()).toBe('');
	});

	/**
	 * THE REFUSAL NAMES THE CLASS AND CARRIES THE SAME WORDS THE PANEL DOES.
	 * `foundryClosedSentence` and `FOUNDRY_CLOSURE_LIMIT` are what
	 * `FoundryClosed.svelte` renders everywhere else; two spellings of one
	 * refusal is how a surface ends up explaining something the database is
	 * not doing.
	 */
	it('states the reason in the same vocabulary the student already sees', async () => {
		await closeSection(closingTeacher, closedSectionId, 'Bench work today.');
		const res = await preview(student);
		const body = await res.text();

		expect(body).toContain('Engineering I Honors (Block 3)');
		expect(body).toContain(FOUNDRY_CLOSURE_LIMIT);
		expect(res.headers.get('content-type')).toContain('text/html');

		// NOT A BLANK BODY AND NOT A 404, which is the whole difference between
		// this refusal and every other one on a bundle route.
		expect(body.length).toBeGreaterThan(200);
		expect(res.status).not.toBe(404);

		// NO TEACHER ADDRESS. 0173 projects the course title and the label and
		// nothing else, and this response must not become the one place an
		// address reaches a student.
		expect(body).not.toContain('@');

		// AND NO WORKAROUND. The share-link limit is the instructor's to read,
		// on a surface behind `classroom_manages_section`; writing it onto the
		// refusal would hand a closed student the way around it in our own
		// words. The positive control is the assertion in section 3 that the
		// sentence exists at all.
		expect(body).not.toContain('share link');
	});

	/**
	 * THE OTHER TWO ROUTES CARRY ON, AND THAT IS A DECISION RATHER THAN A GAP.
	 * The argument is on `FOUNDRY_CLOSURE_BLOCKS`: download serves the author
	 * or an admin and nobody else, so its bytes are bytes that student
	 * uploaded and already has; starter is a generated template with no
	 * student app in it. Asserting they are NOT refused is what stops a later
	 * "make it consistent" sweep quietly taking a student's own work away from
	 * them in five other classes.
	 */
	it('leaves download and starter reachable for a closed student', async () => {
		await closeSection(closingTeacher, closedSectionId, null);

		const dl = await download(student);
		expect(await refusedByClosure(dl.clone())).toBe(false);
		expect(dl.status).toBe(404); // past the gate, refused by `not_configured`

		const st = await starter(student);
		expect(await refusedByClosure(st.clone())).toBe(false);
		expect(st.status).toBe(200);
		expect((await st.text()).toLowerCase()).toContain('<!doctype html>');

	});

	/**
	 * ONE CLOSED CLASS IS ENOUGH AND THE OTHER CLASS IS NOT THE REASON. The
	 * student is in two sections; closing the OPEN one instead refuses them
	 * just the same, and the sentence names the class that actually closed it.
	 * 0173's "any closed section closes it" reading, seen from the route.
	 */
	it('is refused by whichever of their classes closed it, and named accurately', async () => {
		await closeSection(closingTeacher, openSectionId, null);
		const res = await preview(student);
		const body = await res.text();
		expect(res.status).toBe(403);
		expect(body).toContain('Introduction to Engineering (Block 6)');
		expect(body).not.toContain('Engineering I Honors');
	});

	/**
	 * A STUDENT IN NEITHER CLASS IS UNTOUCHED, and an ADMIN never is.
	 * `foundry_section_access` reads the caller's own enrollments and returns
	 * open for an admin; this is that answer arriving at the route rather than
	 * being read off the function a second time.
	 */
	it('does not reach a student in neither class, nor an administrator', async () => {
		await closeSection(closingTeacher, closedSectionId, null);
		expect(await refusedByClosure(await preview(outsider))).toBe(false);
		expect(await refusedByClosure(await preview(admin))).toBe(false);
	});
});

// ===========================================================================
// 2. THE NARROWING IS WHAT DECIDES IT.
// ===========================================================================

describe('the routes read the narrowing rather than restating it', () => {
	/**
	 * MUTATION, IN THE PERMISSIVE DIRECTION. Dropping `preview` from the set
	 * must let a closed student straight through. If this test fails -- if the
	 * refusal survives the set being emptied of it -- then the route has its
	 * own copy of the rule and the whole point of the shared module is gone.
	 */
	it('drops the preview refusal when preview leaves the blocked set', async () => {
		await closeSection(closingTeacher, closedSectionId, null);
		expect(await refusedByClosure(await preview(student))).toBe(true);

		setBlocks(['gallery']);
		expect(foundryClosureBlocks('preview')).toBe(false);
		const through = await preview(student);
		expect(await refusedByClosure(through.clone())).toBe(false);
		expect(through.status).toBe(404);

	});

	/**
	 * AND IN THE OTHER DIRECTION, which is the half that proves the wire is
	 * live on the two routes that are currently OPEN. Adding `download` to the
	 * set must refuse a closed student, with no change to the route's own
	 * file. That is the sense in which download "consults the predicate"
	 * rather than merely not being gated.
	 */
	it('refuses download the moment download joins the blocked set', async () => {
		await closeSection(closingTeacher, closedSectionId, null);
		expect(await refusedByClosure(await download(student))).toBe(false);

		setBlocks(['gallery', 'preview', 'download']);
		expect(await refusedByClosure(await download(student))).toBe(true);

	});

	it('refuses the starter the moment starter joins the blocked set', async () => {
		await closeSection(closingTeacher, closedSectionId, null);
		expect((await starter(student)).status).toBe(200);

		setBlocks(['gallery', 'preview', 'starter']);
		expect(await refusedByClosure(await starter(student))).toBe(true);

	});

	/**
	 * THE SET ITSELF, PINNED. A place added to it, or removed from it, is a
	 * decision about what an instructor's button does and must be made
	 * deliberately rather than by an import reordering.
	 */
	it('blocks exactly the two places a bundle runs', () => {
		expect([...FOUNDRY_CLOSURE_BLOCKS]).toEqual(['gallery', 'preview']);
		expect(foundryClosureBlocks('download')).toBe(false);
		expect(foundryClosureBlocks('starter')).toBe(false);
		// `null` still fails closed: a route nobody has classified is blocked
		// until somebody decides where it belongs.
		expect(foundryClosureBlocks(null)).toBe(true);
	});
});

// ===========================================================================
// 3. THE DEGRADATION LADDER, AND THE SENTENCES.
// ===========================================================================

describe('the degradation ladder has one implementation', () => {
	/**
	 * `PGRST202` ALONE OPENS. Four callers now share this; the failure mode it
	 * guards is a deployment sitting between 0172 and 0173, where the function
	 * genuinely does not exist and closing would lock every student out of a
	 * feature nobody turned off.
	 */
	it('degrades to open only on a genuinely missing function', () => {
		expect(foundryAccessFromRpc(null, { code: 'PGRST202' }).open).toBe(true);
		// Everything else fails CLOSED, which is the standing rule for an
		// access helper. The pair is the point: a `catch` would open on both.
		expect(foundryAccessFromRpc(null, { code: '42501' }).open).toBe(false);
		expect(foundryAccessFromRpc(null, { code: 'PGRST301' }).open).toBe(false);
		expect(foundryAccessFromRpc(null, {}).open).toBe(false);
	});

	it('passes a real answer through unchanged', () => {
		const row = { open: false, closed: [{ section_id: 'x' }] };
		expect(foundryAccessFromRpc(row, null)).toBe(row);
		expect(foundryAccessFromRpc(null, null).open).toBe(true);
	});

	/**
	 * A CLOSED STUDENT WHOSE RPC FAILS FOR ANY OTHER REASON IS REFUSED BY THE
	 * ROUTE, not served. Driven through the real handler with a client whose
	 * `rpc` throws the shape PostgREST would return.
	 */
	it('refuses at the route when the gate itself fails', async () => {
		const href = `${PORTAL}/foundry/preview/${appId}/${versionId}/`;
		const res = (await PREVIEW_GET({
			params: { appId, versionId, path: '' },
			url: new URL(href),
			request: new Request(href),
			locals: {
				claims: { sub: student.id, email: student.email },
				supabase: { rpc: async () => ({ data: null, error: { code: '57014' } }) }
			}
		} as never)) as Response;
		expect(res.status).toBe(403);

		// The positive control on the same stub: the code that means "not
		// applied yet" lets the request through instead.
		const through = (await PREVIEW_GET({
			params: { appId, versionId, path: '' },
			url: new URL(href),
			request: new Request(href),
			locals: {
				claims: { sub: student.id, email: student.email },
				supabase: {
					rpc: async () => ({ data: null, error: { code: 'PGRST202' } }),
					// `isAdmin` runs past the gate on this rung and reads `profiles`
					// through its pre-0067 fallback; the stub answers it so the
					// control measures the GATE rather than a missing method.
					from: () => ({
						select: () => ({
							eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) })
						})
					})
				}
			}
		} as never)) as Response;
		expect(through.status).not.toBe(403);
	});

	/**
	 * THE INSTRUCTOR'S CONTROL TELLS THE TRUTH, INCLUDING THE PART IT CANNOT
	 * ENFORCE. This is the half that matters most: an instructor who believes
	 * the button stops a student playing, and finds out in front of a class
	 * that it does not, is worse off than one who was told the limit up front.
	 */
	it('names both things a closure cannot stop, where the switch is pressed', () => {
		expect(FOUNDRY_CLOSURE_REACH).toMatch(/share link/i);
		expect(FOUNDRY_CLOSURE_REACH).toMatch(/without signing in/i);
		expect(FOUNDRY_CLOSURE_REACH).toMatch(/until they reload/i);
		// 0042's own two claims survive, unchanged.
		expect(FOUNDRY_CLOSURE_REACH).toMatch(/in every class and at home/i);
		expect(FOUNDRY_CLOSURE_REACH).toMatch(/not only during your period/i);
		// And the effect sentence gained the surface this bundle closed.
		expect(FOUNDRY_CLOSURE_LIMIT).not.toMatch(/share link/i);
	});
});

// ===========================================================================
// 4. THE APPS ORIGIN, WHERE NOTHING WAS BUILT.
// ===========================================================================

describe('the apps origin is not gated, deliberately', () => {
	/**
	 * NOTHING WAS BUILT HERE AND THIS IS THE ASSERTION THAT SAYS SO.
	 *
	 * `/a/` and `/b/` answer on `apps.ideabosco.com`, which holds NO PORTAL
	 * SESSION by design: `@supabase/ssr` sets the session cookies with no
	 * `Domain`, so they are host-only on the main host and are not sent there
	 * at all. That absence is the entire point of the origin split -- a
	 * student's published bundle runs somewhere it cannot read a classmate's
	 * credentials -- and a closure is a rule about a VIEWER. There is no
	 * viewer on that origin for the rule to be about.
	 *
	 * WHAT WAS PRICED AND REJECTED is in the history entry; the short form is
	 * that the two designs which would work are the two that must not be
	 * built. `Domain`-scoping the session onto the apps host hands every
	 * student bundle tokens that are `httpOnly: false`, which is the one
	 * failure the split exists to prevent. A signed per-request token
	 * reintroduces machinery five lanes removed (`tests/foundry-bundle-url.test.ts`
	 * sweeps for its names), breaks the plain shareable address `FoundryShare`
	 * promises a student in words, and STILL does not stop the actual case:
	 * a link already saved, a link a friend sent, or a tab already open.
	 *
	 * SO THIS TEST ASSERTS THE ABSENCE, STRUCTURALLY. Both handlers are called
	 * with NO `locals` at all -- no session, no client -- and must still
	 * answer. A gate added there would throw on `locals.supabase` and redden
	 * this, which is exactly the conversation it should force: anybody adding
	 * one has to answer the cookie question first.
	 */
	it('serves /a/ and /b/ with no session object in the event at all', async () => {
		const bHref = `https://apps.ideabosco.com/b/${appId}/${versionId}/`;
		const b = (await BUNDLE_GET({
			params: { appId, versionId, path: '' },
			url: new URL(bHref),
			request: new Request(bHref)
		} as never)) as Response;
		// A bodyless 404 from `serveBundleFile` (no service role key here), which
		// is a refusal about the BUILD and not about any viewer.
		expect(b.status).toBe(404);
		expect(await b.text()).toBe('');

		const aHref = `https://apps.ideabosco.com/a/${appId}/`;
		const a = (await APP_GET({
			params: { appId, path: '' },
			url: new URL(aHref),
			request: new Request(aHref)
		} as never)) as Response;
		expect(a.status).toBe(404);
		expect(await a.text()).toBe('');
	});

	/**
	 * AND THE CLOSURE CHANGES NOTHING ABOUT EITHER, WHICH IS THE HONEST
	 * MEASUREMENT RATHER THAN A COMFORTING ONE. With the class genuinely
	 * closed through the real RPC, the two apps-origin handlers answer
	 * BYTE-IDENTICALLY to how they answered with it open. That is the gap Mr.
	 * Pina's check walks into, stated as a test so nobody later reads the
	 * closure as complete.
	 */
	it('answers identically whether the class is open or closed', async () => {
		const aHref = `https://apps.ideabosco.com/a/${appId}/`;
		const call = async () =>
			(await APP_GET({
				params: { appId, path: '' },
				url: new URL(aHref),
				request: new Request(aHref)
			} as never)) as Response;

		await openSection(closingTeacher, closedSectionId);
		const whileOpen = await call();

		await closeSection(closingTeacher, closedSectionId, 'Bench work today.');
		// The gate is genuinely on: the portal route refuses this same student.
		expect(await refusedByClosure(await preview(student))).toBe(true);

		const whileClosed = await call();
		expect(whileClosed.status).toBe(whileOpen.status);
		expect(await whileClosed.text()).toBe(await whileOpen.text());

	});
});
