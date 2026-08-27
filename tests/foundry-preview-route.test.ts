// tests/foundry-preview-route.test.ts
//
// THE PREVIEW MOUNT (`/foundry/preview/<app>/<version>/`), DRIVEN AS THE ROUTE
// and not as a copy of it.
//
// WHY THIS FILE EXISTS, given the repo adds tests sparingly. Every failure it
// pins is SILENT, is a disclosure, or is both:
//
// 1. THE AUTHOR CHECK. This is the ONLY thing standing between one student's
//    unfinished work and every other signed-in student, because unlike `/b/`
//    and `/a/` this mount deliberately serves a version whose status licenses
//    nothing. A gate that stopped biting would look perfect from the author's
//    own browser -- their app would still run -- and would be discovered by
//    somebody guessing two uuids.
//
// 2. THE SANDBOX. Preview runs student HTML on the PORTAL origin, which is the
//    host holding the session cookies -- the exact thing the apps origin exists
//    to prevent. What makes that tolerable is the CSP `sandbox` directive with
//    NO `allow-same-origin`, which puts the document in an opaque origin. The
//    portal's session tokens are `httpOnly: false`, i.e. readable by
//    `document.cookie`, so a preview that acquired that flag would hand a
//    student's own script the session of whoever opened it. A page with the flag
//    renders IDENTICALLY to one without it; nothing but an assertion sees the
//    difference.
//
// 3. THE PUBLISHED MOUNTS ARE UNCHANGED. `serveBundleFile` was refactored around
//    rather than loosened, and `foundryFileResponse` now shares a byte-to-
//    response helper with the preview responder. Both of those are the shape of
//    change that silently widens the thing it was told not to touch.
//
// It drives the REAL handlers, imported from their own files, against the REAL
// in-memory fixture the dev server uses.
//
// WHAT THE FIXTURE CAN AND CANNOT STAND IN FOR, said once. Fixture versions
// carry no `status` column, so "a draft" is modelled by the property that
// actually matters here: A VERSION THE PUBLISHED MOUNTS REFUSE. Every version
// used below as a draft is asserted to 404 on `/b/` in the same test that
// asserts preview serves it, so the claim "preview reaches what the published
// gate does not" is measured rather than assumed. Fixture apps carry no `owner`
// column either, so `previewBundleFile`'s dev branch states one -- every fixture
// app is owned by `FIXTURE_VIEWER` -- which is what lets the author / not-author
// / admin split be driven through the real handler.

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { GET as PREVIEW_GET, fallback as PREVIEW_FALLBACK } from '../src/routes/foundry/preview/[appId]/[versionId]/[...path]/+server.ts';
import { GET as BUNDLE_GET } from '../src/routes/b/[appId]/[versionId]/[...path]/+server.ts';
import { GET as APP_GET } from '../src/routes/a/[appId]/[...path]/+server.ts';
import { setDev } from './stubs/app-environment.ts';
import { previewViewerMayRun } from '../src/lib/server/foundry-bundle.ts';
import {
	FIXTURE_APP_A,
	FIXTURE_APP_B,
	FIXTURE_APP_HIDDEN,
	FIXTURE_APP_TYPES,
	FIXTURE_APP_UNPUBLISHED,
	FIXTURE_VERSION_A_LIVE,
	FIXTURE_VERSION_A_STALE,
	FIXTURE_VERSION_B_LIVE,
	FIXTURE_VERSION_HIDDEN,
	FIXTURE_VERSION_TYPES,
	FIXTURE_VERSION_UNPUBLISHED,
	FIXTURE_VIEWER
} from '../src/lib/server/foundry-dev-fixture.ts';
import { FOUNDRY_STORAGE_SHIM_TAG } from '../src/lib/foundry/storage-shim.ts';
import { foundryPreviewUrl } from '../src/lib/foundry/bundle-url.ts';

const PORTAL = 'https://ideabosco.com';
const APPS = 'https://apps.ideabosco.com';

/** A second signed-in student. Not the author of anything in the fixture. */
const OTHER_STUDENT = '88888888-8888-4888-8888-888888888888';

beforeAll(() => {
	// The fixture path is the dev path; without this every handler reaches for a
	// Supabase project that does not exist here and answers 404 for everything,
	// which would make every refusal below pass vacuously.
	setDev(true);
	process.env.PUBLIC_FOUNDRY_APPS_ORIGIN = APPS;
	delete process.env.PUBLIC_FOUNDRY_PORTAL_ORIGIN;
});

afterAll(() => {
	setDev(false);
	delete process.env.PUBLIC_FOUNDRY_APPS_ORIGIN;
	delete process.env.PUBLIC_FOUNDRY_PORTAL_ORIGIN;
});

/**
 * A stand-in for the caller's own Supabase client, answering only the one RPC
 * the route asks it. The REAL `isAdmin` helper runs against this, so the
 * admin-ness in these tests goes through the same code path production does
 * rather than being injected past it.
 */
function client(admin: boolean) {
	return {
		rpc: async (fn: string) => {
			if (fn === 'is_admin') return { data: admin, error: null };
			return { data: null, error: { code: 'PGRST202', message: 'unexpected rpc' } };
		}
	};
}

type Who = { uid: string | null; admin?: boolean };

/** The AUTHOR of every fixture app, per `previewBundleFile`'s dev branch. */
const AUTHOR: Who = { uid: FIXTURE_VIEWER };
const STRANGER: Who = { uid: OTHER_STUDENT };
const ADMIN: Who = { uid: OTHER_STUDENT, admin: true };
const ANONYMOUS: Who = { uid: null };

/** The real preview handler, called the way SvelteKit calls it. */
function preview(
	appId: string,
	versionId: string,
	path: string,
	who: Who,
	opts: { origin?: string; slash?: boolean; method?: string } = {}
): Promise<Response> {
	const origin = opts.origin ?? PORTAL;
	const tail = path === '' && opts.slash !== false ? '/' : path === '' ? '' : `/${path}`;
	const href = `${origin}/foundry/preview/${appId}/${versionId}${tail}`;
	const handler = opts.method && opts.method !== 'GET' ? PREVIEW_FALLBACK : PREVIEW_GET;
	return handler({
		params: { appId, versionId, path },
		url: new URL(href),
		request: new Request(href, { method: opts.method ?? 'GET' }),
		locals: {
			claims: who.uid ? { sub: who.uid } : null,
			supabase: client(who.admin === true)
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any) as Promise<Response>;
}

/** The real `/b/` handler, for the "the published gate refuses this" controls. */
function bundle(appId: string, versionId: string, path = ''): Promise<Response> {
	const tail = path === '' ? '/' : `/${path}`;
	const href = `${APPS}/b/${appId}/${versionId}${tail}`;
	return BUNDLE_GET({
		params: { appId, versionId, path },
		url: new URL(href),
		request: new Request(href)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any) as Promise<Response>;
}

/** The real `/a/` handler, same purpose. */
function direct(appId: string, path = ''): Promise<Response> {
	const tail = path === '' ? '/' : `/${path}`;
	const href = `${APPS}/a/${appId}${tail}`;
	return APP_GET({
		params: { appId, path },
		url: new URL(href),
		request: new Request(href)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any) as Promise<Response>;
}

/* ========================================================================
 * 1. THE THING THE FEATURE IS FOR: reaching a build the published gate does
 *    not serve.
 * ===================================================================== */

describe('the author reaches a version no published mount will serve', () => {
	/**
	 * THE CENTRAL CLAIM, AND IT CARRIES ITS OWN CONTROL. `FIXTURE_VERSION_A_STALE`
	 * is not its app's published version, so `serveBundleFile` refuses it -- which
	 * is exactly the shape of a draft. Asserting the `/b/` 404 in the SAME test is
	 * what makes "preview reaches further" a measurement: without it, a preview
	 * that had quietly become an alias for the published gate would still pass.
	 */
	it('serves a version /b/ refuses, to its author', async () => {
		const refused = await bundle(FIXTURE_APP_A, FIXTURE_VERSION_A_STALE);
		expect(refused.status).toBe(404);

		const res = await preview(FIXTURE_APP_A, FIXTURE_VERSION_A_STALE, '', AUTHOR);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(await res.text()).toContain('<html');
	});

	/**
	 * THE FIRST-BUILD CASE, which is the one a real student actually hits: an app
	 * whose very first upload has never been published or submitted, so BOTH
	 * published mounts refuse it and there is currently no way on earth to run it.
	 */
	it('serves the first build of an app with nothing published, which /b/ and /a/ both refuse', async () => {
		expect((await bundle(FIXTURE_APP_UNPUBLISHED, FIXTURE_VERSION_UNPUBLISHED)).status).toBe(404);
		expect((await direct(FIXTURE_APP_UNPUBLISHED)).status).toBe(404);

		const res = await preview(FIXTURE_APP_UNPUBLISHED, FIXTURE_VERSION_UNPUBLISHED, '', AUTHOR);
		expect(res.status).toBe(200);
		expect((await res.text()).length).toBeGreaterThan(0);
	});

	it('serves a published version too, so the control is not status-shaped', async () => {
		const res = await preview(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE, '', AUTHOR);
		expect(res.status).toBe(200);
	});

	/**
	 * RELATIVE ASSETS RESOLVE, which is the whole reason the path has this shape
	 * and the difference between "the app runs" and "the app renders unstyled and
	 * scriptless, which reads as a bad upload".
	 */
	it.each([
		['style.css', 'text/css; charset=utf-8'],
		['app.js', 'text/javascript; charset=utf-8'],
		['data.json', 'application/json; charset=utf-8'],
		['pixel.png', 'image/png']
	])('serves %s under the version root with its own type', async (path, type) => {
		const res = await preview(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES, path, AUTHOR);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe(type);
	});

	/**
	 * THE SHIM IS NOT OPTIONAL HERE EITHER -- it is MORE load-bearing than on the
	 * published mounts, because preview never gets `allow-same-origin` and is
	 * therefore ALWAYS on an opaque origin, where the `localStorage` getter
	 * throws. A generated app that reads saved state at the top of its script is
	 * a blank page without this, on every single preview.
	 */
	it('injects the storage shim first inside <head>', async () => {
		const body = await (await preview(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE, '', AUTHOR)).text();
		expect(body).toContain(FOUNDRY_STORAGE_SHIM_TAG);
		expect(body.indexOf(FOUNDRY_STORAGE_SHIM_TAG)).toBe(body.indexOf('<head>') + '<head>'.length);
	});

	/** The bare root 307s to the slash form, or every relative asset 404s. */
	it('307s the slashless root to the slash form, relatively', async () => {
		const res = await preview(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE, '', AUTHOR, { slash: false });
		expect(res.status).toBe(307);
		expect(res.headers.get('location')).toBe(`${FIXTURE_VERSION_A_LIVE}/`);
	});

	/** Keyed on whether the entry was DERIVED, never on the filename. */
	it('does not bounce an explicit request for index.html', async () => {
		const res = await preview(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE, 'index.html', AUTHOR);
		expect(res.status).toBe(200);
	});
});

/* ========================================================================
 * 2. WHO IS REFUSED. The disclosure half.
 * ===================================================================== */

describe('everyone who is not the author or an admin gets the same bodyless 404', () => {
	/**
	 * THE ASSERTION THIS WHOLE FILE IS FOR. A second signed-in student, on the
	 * exact URL that works for the author, on a version that is nobody's business
	 * but the author's.
	 */
	it('refuses a second student the author`s draft', async () => {
		const mine = await preview(FIXTURE_APP_A, FIXTURE_VERSION_A_STALE, '', AUTHOR);
		expect(mine.status).toBe(200);

		const theirs = await preview(FIXTURE_APP_A, FIXTURE_VERSION_A_STALE, '', STRANGER);
		expect(theirs.status).toBe(404);
		expect(theirs.body).toBeNull();
		expect(await theirs.text()).toBe('');
	});

	it('refuses a second student every asset of it, not only the entry document', async () => {
		for (const path of ['', 'notes.txt']) {
			const res = await preview(FIXTURE_APP_A, FIXTURE_VERSION_A_STALE, path, STRANGER);
			expect(res.status).toBe(404);
		}
		// POSITIVE CONTROL: those paths are real. Two 404s over two missing files
		// would pass this and prove nothing.
		expect((await preview(FIXTURE_APP_A, FIXTURE_VERSION_A_STALE, 'notes.txt', AUTHOR)).status).toBe(200);
	});

	it('refuses a caller with no session', async () => {
		expect((await preview(FIXTURE_APP_A, FIXTURE_VERSION_A_STALE, '', ANONYMOUS)).status).toBe(404);
	});

	/**
	 * A DRAFT SOMEBODY MAY NOT SEE AND A VERSION THAT DOES NOT EXIST ANSWER
	 * IDENTICALLY, so the URL cannot be used to ask whether a given student has
	 * work in progress. Compared field for field rather than by status alone: a
	 * body, a header or a length that differed would be the oracle.
	 */
	it('is indistinguishable from a version that does not exist', async () => {
		const forbidden = await preview(FIXTURE_APP_A, FIXTURE_VERSION_A_STALE, '', STRANGER);
		const nonexistent = await preview(
			FIXTURE_APP_A,
			'00000000-0000-4000-8000-000000000000',
			'',
			STRANGER
		);
		expect(forbidden.status).toBe(nonexistent.status);
		expect([...forbidden.headers.entries()].sort()).toEqual(
			[...nonexistent.headers.entries()].sort()
		);
		expect(await forbidden.text()).toBe(await nonexistent.text());
	});

	/**
	 * A DELETED APP HAS NO ROW. `foundry_delete_app` is real deletion with nothing
	 * to restore from (0136), so the app lookup answers nothing and the gate is
	 * handed null.
	 *
	 * WHAT THIS TEST PROVES AND WHAT IT DOES NOT: at the ROUTE level it proves the
	 * caller gets the standard 404, which is the whole of what a caller can see.
	 * It cannot distinguish "the gate refused a null app" from "the fixture had no
	 * such app", because in dev those are the same absence -- so the gate's own
	 * answer to a null app row is asserted directly in the predicate suite below,
	 * which is where that distinction is visible at all.
	 */
	it('refuses an app id with no row, to its would-be author and to an admin alike', async () => {
		const gone = '00000000-0000-4000-8000-0000000000de';
		expect((await preview(gone, FIXTURE_VERSION_A_STALE, '', AUTHOR)).status).toBe(404);
		expect((await preview(gone, FIXTURE_VERSION_A_STALE, '', ADMIN)).status).toBe(404);
	});

	/**
	 * BOTH IDS COME OFF THE URL, so naming an app you DO own beside a version you
	 * do NOT is the obvious attempt. The version's own `app_id` is what decides.
	 * In the fixture both apps share one author, so this refusal cannot be coming
	 * from the ownership check -- it is the pairing check or nothing.
	 */
	it('refuses a version that belongs to a different app, even to that app`s author', async () => {
		const res = await preview(FIXTURE_APP_A, FIXTURE_VERSION_B_LIVE, '', AUTHOR);
		expect(res.status).toBe(404);
		// POSITIVE CONTROL: the same author reaches that version under its OWN app,
		// so the refusal above is about the pairing rather than about the viewer.
		expect((await preview(FIXTURE_APP_B, FIXTURE_VERSION_B_LIVE, '', AUTHOR)).status).toBe(200);
	});

	it('refuses a path that climbs out of the bundle', async () => {
		for (const path of ['../secret.txt', '/etc/passwd']) {
			expect((await preview(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE, path, AUTHOR)).status).toBe(404);
		}
	});

	it('refuses anything that is not GET or HEAD', async () => {
		for (const method of ['POST', 'PUT', 'DELETE']) {
			const res = await preview(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE, '', AUTHOR, { method });
			expect(res.status).toBe(404);
		}
	});

	/**
	 * NOT ON THE APPS ORIGIN. There is no session there so this would refuse
	 * anyway, but the route says so explicitly -- see the handler's own note on
	 * why an implicit refusal that rests on cookie defaults is not good enough.
	 */
	it('refuses a preview path arriving on the apps origin', async () => {
		const res = await preview(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE, '', AUTHOR, { origin: APPS });
		expect(res.status).toBe(404);
		// POSITIVE CONTROL: the identical request on the portal origin is a 200,
		// so the refusal is the host check and not a broken fixture.
		expect((await preview(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE, '', AUTHOR)).status).toBe(200);
	});
});

describe('an admin previews what a student cannot', () => {
	it('reaches another student`s unpublished build', async () => {
		expect((await preview(FIXTURE_APP_UNPUBLISHED, FIXTURE_VERSION_UNPUBLISHED, '', STRANGER)).status).toBe(404);
		expect((await preview(FIXTURE_APP_UNPUBLISHED, FIXTURE_VERSION_UNPUBLISHED, '', ADMIN)).status).toBe(200);
	});

	/**
	 * THE HIDDEN SPLIT, which is the one clause in this gate that is a judgement.
	 * An admin previews a shelved app because they are the person who shelved it
	 * and a decision about a build that cannot run the build is made blind; the
	 * OWNER is refused, matching 0130 refusing their edit of a hidden app and 0136
	 * their delete of one.
	 *
	 * THE FIXTURE'S BYTES SAY "A SHELVED APP SERVED ITS BYTES", which is an alarm
	 * written for the PUBLISHED mounts, where it is exactly right. On this mount
	 * an admin reading it is the intended outcome, so the string is matched
	 * deliberately here rather than treated as a failure.
	 */
	it('reaches a shelved app, which its owner does not', async () => {
		expect((await bundle(FIXTURE_APP_HIDDEN, FIXTURE_VERSION_HIDDEN)).status).toBe(404);
		expect((await preview(FIXTURE_APP_HIDDEN, FIXTURE_VERSION_HIDDEN, '', AUTHOR)).status).toBe(404);

		const res = await preview(FIXTURE_APP_HIDDEN, FIXTURE_VERSION_HIDDEN, '', ADMIN);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain('shelved');
	});
});

/* ========================================================================
 * 3. THE GATE ITSELF, AS A PREDICATE. Every combination, including the ones
 *    the fixture cannot express.
 * ===================================================================== */

describe('previewViewerMayRun', () => {
	const APP = { id: 'app-1', owner: 'student-1', hidden_at: null };
	const VERSION = { app_id: 'app-1' };
	const OWNER = { id: 'student-1', isAdmin: false };

	it('admits the owner', () => {
		expect(previewViewerMayRun(APP, VERSION, OWNER)).toBe(true);
	});

	it('admits an admin who is not the owner', () => {
		expect(previewViewerMayRun(APP, VERSION, { id: 'staff-1', isAdmin: true })).toBe(true);
	});

	it('refuses another student', () => {
		expect(previewViewerMayRun(APP, VERSION, { id: 'student-2', isAdmin: false })).toBe(false);
	});

	/**
	 * A DELETED APP, WHICH IS THE ONLY PLACE THIS IS VISIBLE. At the route level a
	 * deleted app and an unknown one are the same absence; here the null row can
	 * be handed in beside a version and a viewer who WOULD otherwise be admitted,
	 * so the refusal is unambiguously the null app.
	 */
	it('refuses a deleted app, to its former owner and to an admin', () => {
		expect(previewViewerMayRun(null, VERSION, OWNER)).toBe(false);
		expect(previewViewerMayRun(null, VERSION, { id: 'staff-1', isAdmin: true })).toBe(false);
	});

	it('refuses a missing version row', () => {
		expect(previewViewerMayRun(APP, null, OWNER)).toBe(false);
	});

	it('refuses a version belonging to another app', () => {
		expect(previewViewerMayRun(APP, { app_id: 'app-2' }, OWNER)).toBe(false);
		// ...including for an admin, because the pairing is not about permission.
		expect(previewViewerMayRun(APP, { app_id: 'app-2' }, { id: 's', isAdmin: true })).toBe(false);
	});

	/**
	 * FAIL CLOSED ON AN EMPTY VIEWER ID. `locals.claims?.sub` is a string, and a
	 * row whose `owner` were somehow also empty must not match it.
	 */
	it('refuses an empty viewer id even against an empty owner', () => {
		expect(previewViewerMayRun(APP, VERSION, null)).toBe(false);
		expect(previewViewerMayRun(APP, VERSION, { id: '', isAdmin: false })).toBe(false);
		expect(
			previewViewerMayRun({ ...APP, owner: '' }, VERSION, { id: '', isAdmin: false })
		).toBe(false);
		expect(previewViewerMayRun({ ...APP, owner: '' }, VERSION, { id: '', isAdmin: true })).toBe(
			false
		);
	});

	it('refuses a null owner', () => {
		expect(previewViewerMayRun({ ...APP, owner: null }, VERSION, OWNER)).toBe(false);
	});

	it('refuses a hidden app to its owner and admits it to an admin', () => {
		const shelved = { ...APP, hidden_at: '2026-08-24T12:00:00Z' };
		expect(previewViewerMayRun(shelved, VERSION, OWNER)).toBe(false);
		expect(previewViewerMayRun(shelved, VERSION, { id: 'staff-1', isAdmin: true })).toBe(true);
	});
});

/* ========================================================================
 * 4. THE SANDBOX. The containment that pays for running student HTML on the
 *    cookie-carrying host.
 * ===================================================================== */

describe('a preview response never grants allow-same-origin, in any configuration', () => {
	afterEach(() => {
		process.env.PUBLIC_FOUNDRY_APPS_ORIGIN = APPS;
		delete process.env.PUBLIC_FOUNDRY_PORTAL_ORIGIN;
	});

	/**
	 * EVERY CONFIGURATION, AND -- THE HALF THAT ACTUALLY DISCRIMINATES -- EVERY
	 * PORTAL HOST THE REQUEST CAN ARRIVE ON.
	 *
	 * The grant is a function of two origins being non-empty and DIFFERENT, and
	 * the preview responder defeats it by handing the header builder the SAME
	 * variable twice, so the strict set is a property of the call site rather than
	 * of the environment.
	 *
	 * VARYING ONLY THE ENVIRONMENT DOES NOT TEST THAT, AND THIS SWEEP ORIGINALLY
	 * DID ONLY THAT. Measured: with the responder mutated to resolve a portal
	 * origin the way `foundryFileResponse` does, four of five environment-only
	 * rows still passed -- because on the CANONICAL portal host the resolved
	 * portal origin and the request origin are the same string, so the two
	 * spellings coincide and the mutation is invisible. The row that caught it did
	 * so by accident.
	 *
	 * WHERE THEY GENUINELY DIVERGE IS A PORTAL HOST THAT IS NOT THE CANONICAL ONE,
	 * WHICH IS A VERCEL PREVIEW DEPLOYMENT -- a supported, ordinary configuration
	 * (`PUBLIC_FOUNDRY_PORTAL_ORIGIN` is deliberately allowed to be unset, and the
	 * fallback then names `ideabosco.com` while the request arrives on
	 * `idea-app-git-....vercel.app`). There the resolved portal origin differs
	 * from the request origin, the flag would be granted, and it would be granted
	 * on a host that IS carrying that deployment's session cookies. Those rows are
	 * the proof; the canonical-host rows are the regression net.
	 */
	const CANON = PORTAL;
	/** A Vercel preview deployment: a portal host that is not the canonical one. */
	const BRANCH = 'https://idea-app-git-lane.vercel.app';

	const CONFIGS: [string, string | null, string | null, string][] = [
		['nothing set, canonical host', null, null, CANON],
		['portal origin only, canonical host', null, PORTAL, CANON],
		['apps origin only, canonical host (the fallback grants it on /b/)', APPS, null, CANON],
		['both set, canonical host (the production shape)', APPS, PORTAL, CANON],
		// THE TWO THAT DISCRIMINATE. Both are preview deployments, and in both the
		// resolved portal origin is `ideabosco.com` while the request is not.
		['apps origin only, preview deployment host', APPS, null, BRANCH],
		['both set, preview deployment host', APPS, PORTAL, BRANCH],
		// A third: the portal variable names a host the request did not arrive on.
		['portal origin naming another host', APPS, BRANCH, CANON]
	];

	it.each(CONFIGS)('withholds it with %s', async (_label, apps, portal, origin) => {
		if (apps === null) delete process.env.PUBLIC_FOUNDRY_APPS_ORIGIN;
		else process.env.PUBLIC_FOUNDRY_APPS_ORIGIN = apps;
		if (portal === null) delete process.env.PUBLIC_FOUNDRY_PORTAL_ORIGIN;
		else process.env.PUBLIC_FOUNDRY_PORTAL_ORIGIN = portal;

		const res = await preview(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE, '', AUTHOR, { origin });

		// POSITIVE CONTROL: a 404 carries no CSP at all and would pass every
		// `not.toContain` below without proving anything.
		expect(res.status).toBe(200);
		const csp = res.headers.get('content-security-policy');
		expect(csp).toBeTruthy();
		expect(csp!).toContain('sandbox allow-scripts');
		expect(csp!).not.toContain('allow-same-origin');
		// AND THE ORIGIN IT NAMES IS THE ONE IT WAS REACHED ON, never a resolved
		// one -- which is the same fact stated from the other side, and the thing
		// that makes the flag unreachable. A responder that resolved a portal
		// origin would name it here even in the rows where the flag stayed away.
		expect(csp!).toContain(`frame-ancestors ${origin}`);
	});

	/**
	 * THE CONTROL THAT MAKES THE SWEEP MEAN SOMETHING: in the configuration whose
	 * row above is `apps origin only`, the PUBLISHED mount DOES grant the flag. So
	 * the absence on preview is a decision this code makes, not a flag that is
	 * never granted anywhere.
	 */
	it('while the published mount grants it in the same configuration', async () => {
		process.env.PUBLIC_FOUNDRY_APPS_ORIGIN = APPS;
		delete process.env.PUBLIC_FOUNDRY_PORTAL_ORIGIN;

		const published = await bundle(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE);
		expect(published.status).toBe(200);
		expect(published.headers.get('content-security-policy')!).toContain('allow-same-origin');

		const previewed = await preview(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE, '', AUTHOR);
		expect(previewed.headers.get('content-security-policy')!).not.toContain('allow-same-origin');
	});

	/** `frame-ancestors` is pinned to the portal rather than left unset, which is
	    what passing the request origin twice buys over passing two empty strings. */
	it('pins frame-ancestors to the origin it was reached on', async () => {
		const csp = (
			await preview(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE, '', AUTHOR)
		).headers.get('content-security-policy')!;
		expect(csp).toContain(`frame-ancestors ${PORTAL}`);
	});

	it('is nosniff, no-referrer, unindexed and privately cached, like every bundle byte', async () => {
		const h = (await preview(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE, '', AUTHOR)).headers;
		expect(h.get('x-content-type-options')).toBe('nosniff');
		expect(h.get('referrer-policy')).toBe('no-referrer');
		expect(h.get('x-robots-tag')).toBe('noindex, nofollow');
		expect(h.get('cache-control')).toBe('private, max-age=60');
	});

	/**
	 * PREVIEW IS THE PUBLISHED RESPONSE MINUS EXACTLY ONE FLAG, and this asserts
	 * the "exactly one" half. Everything else about the two header sets is
	 * compared field for field, so a header the shared builder gains reaches both
	 * and a divergence anywhere else reddens here.
	 */
	it('differs from the published response in the sandbox flag and nothing else', async () => {
		process.env.PUBLIC_FOUNDRY_APPS_ORIGIN = APPS;
		delete process.env.PUBLIC_FOUNDRY_PORTAL_ORIGIN;

		const p = await preview(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE, '', AUTHOR);
		const b = await bundle(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE);
		expect(p.status).toBe(200);
		expect(b.status).toBe(200);

		const names = (r: Response) => [...r.headers.keys()].sort();
		expect(names(p)).toEqual(names(b));

		for (const key of names(p)) {
			// The CSP differs by the flag and by the literal origin in every source
			// list, both of which are the point; everything else must match.
			if (key === 'content-security-policy') continue;
			expect([key, p.headers.get(key)]).toEqual([key, b.headers.get(key)]);
		}

		// AND THE CSP DIFFERS ONLY IN THE FLAG, ASSERTED DIRECTIVE BY DIRECTIVE.
		// A whole-string comparison cannot say this: the two policies legitimately
		// name different BUNDLE origins (each names its own), so the values have to
		// be compared after substituting one for the other -- and `frame-ancestors`
		// is the one directive that must NOT be substituted, because on both mounts
		// it resolves to the same portal origin and rewriting preview's would turn
		// a match into a false difference. That distinction is the reason this is a
		// loop rather than one `expect`.
		const parse = (csp: string) =>
			new Map(
				csp
					.split(';')
					.map((d) => d.trim())
					.filter(Boolean)
					.map((d) => {
						const i = d.indexOf(' ');
						return i === -1
							? ([d, ''] as [string, string])
							: ([d.slice(0, i), d.slice(i + 1)] as [string, string]);
					})
			);

		const pd = parse(p.headers.get('content-security-policy')!);
		const bd = parse(b.headers.get('content-security-policy')!);
		expect([...pd.keys()].sort()).toEqual([...bd.keys()].sort());
		// POSITIVE CONTROL: the parse produced directives at all. Two empty maps
		// compare equal and every loop below would run zero times.
		expect(pd.size).toBeGreaterThan(8);

		for (const [name, value] of pd) {
			if (name === 'sandbox') {
				// THE ONE DIFFERENCE, and it is exactly one flag, appended.
				expect(`${value} allow-same-origin`).toBe(bd.get('sandbox'));
				continue;
			}
			if (name === 'frame-ancestors') {
				// Both pin the PORTAL, from two different resolutions, so they match
				// as they stand and substituting would break it.
				expect(value).toBe(bd.get(name));
				expect(value).toBe(PORTAL);
				continue;
			}
			expect([name, value.split(PORTAL).join(APPS)]).toEqual([name, bd.get(name)]);
		}
	});
});

/* ========================================================================
 * 5. THE PUBLISHED MOUNTS ARE UNCHANGED.
 * ===================================================================== */

describe('the published gate is not loosened by the existence of a preview', () => {
	it('still refuses a version that is neither published nor submitted', async () => {
		expect((await bundle(FIXTURE_APP_A, FIXTURE_VERSION_A_STALE)).status).toBe(404);
		expect((await bundle(FIXTURE_APP_UNPUBLISHED, FIXTURE_VERSION_UNPUBLISHED)).status).toBe(404);
	});

	it('still refuses a hidden app', async () => {
		expect((await bundle(FIXTURE_APP_HIDDEN, FIXTURE_VERSION_HIDDEN)).status).toBe(404);
		expect((await direct(FIXTURE_APP_HIDDEN)).status).toBe(404);
	});

	it('still refuses another app`s file', async () => {
		expect((await bundle(FIXTURE_APP_A, FIXTURE_VERSION_B_LIVE)).status).toBe(404);
	});

	it('still serves the published version on both mounts', async () => {
		expect((await bundle(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE)).status).toBe(200);
		expect((await direct(FIXTURE_APP_A)).status).toBe(200);
	});

	/**
	 * AND THEY TAKE NO VIEWER. `serveBundleFile` is reached by routes that answer
	 * on a host with no session; a signed-in caller and an anonymous one get the
	 * identical answer, because there is nothing there to read. Asserted through
	 * the handlers, which take no `locals` at all in the calls above -- if either
	 * had grown a session dependency these would throw rather than 404.
	 */
	it('answers the published mounts with no session in scope at all', async () => {
		expect((await bundle(FIXTURE_APP_TYPES, FIXTURE_VERSION_TYPES)).status).toBe(200);
		expect((await direct(FIXTURE_APP_TYPES)).status).toBe(200);
	});
});

/* ========================================================================
 * 6. THE URL THE CONTROL BUILDS IS THE URL THE ROUTE ANSWERS.
 * ===================================================================== */

describe('foundryPreviewUrl', () => {
	it('produces the slash form the route serves', () => {
		expect(foundryPreviewUrl('app-1', 'ver-1')).toBe('/foundry/preview/app-1/ver-1/');
	});

	/**
	 * SAME-ORIGIN BY CONSTRUCTION. It takes no origin argument, so a caller
	 * cannot point it at the apps host -- where the route refuses, because there
	 * is no session there to resolve a viewer from.
	 */
	it('is a path and never an absolute URL', () => {
		const url = foundryPreviewUrl('app-1', 'ver-1')!;
		expect(url.startsWith('/')).toBe(true);
		expect(url).not.toContain('://');
		expect(foundryPreviewUrl.length).toBe(2);
	});

	it('is null when it has nothing to point at', () => {
		expect(foundryPreviewUrl(null, 'ver-1')).toBeNull();
		expect(foundryPreviewUrl('app-1', null)).toBeNull();
		expect(foundryPreviewUrl('  ', 'ver-1')).toBeNull();
		expect(foundryPreviewUrl('app-1', '')).toBeNull();
	});

	/**
	 * THE BUILDER AND THE HANDLER AGREE, driven rather than eyeballed: the path
	 * this produces is split back into the params SvelteKit would give the route,
	 * and the route answers 200.
	 */
	it('parses back into params the real handler serves', async () => {
		const url = foundryPreviewUrl(FIXTURE_APP_A, FIXTURE_VERSION_A_LIVE)!;
		const segments = url.split('/').filter(Boolean);
		expect(segments.slice(0, 2)).toEqual(['foundry', 'preview']);
		const [appId, versionId] = segments.slice(2);
		const res = await preview(appId, versionId, '', AUTHOR);
		expect(res.status).toBe(200);
	});
});
