import { json } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import {
	FOUNDRY_SOURCE_MAX_BYTES,
	foundryBundleSourceConfigured,
	listBundleFiles,
	readBundleFileText
} from '$lib/server/foundry-bundle';
import type { RequestHandler } from './$types';

/**
 * THE REVIEW QUEUE'S SOURCE READS. Main host, admin only.
 *
 * WHY A ROUTE AT ALL, when almost every other Foundry call goes straight from
 * the browser client to an RPC: `foundry-bundles` carries no storage policy at
 * all, so a client cannot read it, list it or delete from it, and
 * `student_app_files` carries no client grant either -- a reviewer cannot
 * enumerate a version's files from the browser by any route. `service_role` is
 * the only role that can, and that key has exactly one Foundry reader
 * (`$lib/server/foundry-bundle`). This route is the front door to that reader
 * and holds no credential of its own.
 *
 * IT ANSWERS ITS OWN 404, so it is deliberately not in `authedPrefixes` -- a
 * route group's guard does not run for endpoints, and a redirect would be a
 * strange answer to a fetch.
 *
 * EVERY REFUSAL IS 404, INCLUDING "YOU ARE NOT AN ADMIN". A 403 would confirm
 * that the route exists and that there is a review lane behind it; the rest of
 * the site answers a surface a caller may not see with 404 for the same reason
 * (`/admin`, `/coin-desk`, the teacher tabs). The one exception is
 * `not_configured`, which is a 503 with a reason, because it is the one state a
 * reload will never fix and a person can.
 *
 * THE SERVICE-ROLE READ BYPASSES RLS, so the authorization is entirely this
 * route's: `is_admin()` asked of the database, never `role === 'teacher'`,
 * which the email domain hands to every member of staff (0067). There is no
 * version-ownership check beyond that on purpose -- an admin may read every
 * submission, which is what reviewing is -- but there is also nothing here that
 * takes a bucket path from the caller: the path is looked up in
 * `student_app_files` for that version first, so a request can only ever name a
 * file that version actually has.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { appId?: unknown; versionId?: unknown; path?: unknown };

function notFound() {
	return json({ ok: false, reason: 'not_found' }, { status: 404 });
}

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	// There is one host now. The bundle-host refusal that used to sit here went
	// with the second origin it was refusing on.
	if (!claims) return notFound();
	if (!(await isAdmin(supabase, claims.sub))) return notFound();
	if (!foundryBundleSourceConfigured()) {
		return json({ ok: false, reason: 'not_configured' }, { status: 503 });
	}

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return json({ ok: false, reason: 'bad_request' }, { status: 400 });
	}

	const versionId = typeof body.versionId === 'string' ? body.versionId : '';
	if (!UUID_RE.test(versionId)) {
		return json({ ok: false, reason: 'bad_request' }, { status: 400 });
	}

	// NO PATH: the file list. The tree is built from these rows client-side,
	// because the rows are flat by design -- that flat list IS the proxy's
	// allowlist -- and a tree is a display shape.
	if (body.path === undefined || body.path === null) {
		const files = await listBundleFiles(versionId);
		if (!files) return json({ ok: false, reason: 'not_configured' }, { status: 503 });
		return json({ ok: true, files });
	}

	const path = typeof body.path === 'string' ? body.path : '';
	const appId = typeof body.appId === 'string' ? body.appId : '';
	if (!UUID_RE.test(appId)) {
		return json({ ok: false, reason: 'bad_request' }, { status: 400 });
	}

	const result = await readBundleFileText(appId, versionId, path);
	if (!result.ok) {
		/**
		 * The two refusals a reviewer must be able to ACT on are told apart,
		 * because both are ordinary states of a real bundle and neither means
		 * anything is wrong: a PNG is not readable as text, and a minified
		 * bundle over the cap is a fact about the build worth knowing. Everything
		 * else collapses to the same 404 as the rest of this route.
		 */
		if (result.reason === 'not_text') {
			return json({ ok: false, reason: 'not_text' }, { status: 200 });
		}
		if (result.reason === 'too_large') {
			return json({ ok: false, reason: 'too_large', maxBytes: FOUNDRY_SOURCE_MAX_BYTES }, { status: 200 });
		}
		return notFound();
	}

	return json({
		ok: true,
		path: result.path,
		contentType: result.contentType,
		byteSize: result.byteSize,
		text: result.text
	});
};
