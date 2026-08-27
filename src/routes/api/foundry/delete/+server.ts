import { json } from '@sveltejs/kit';
import { sweepFoundryObjects, type FoundryDeletePlan } from '$lib/server/foundry-bundle';
import type { RequestHandler } from './$types';

/**
 * FOUNDRY DELETION: the rows, then the objects, in that order.
 *
 * WHY A ROUTE AT ALL, when every other Foundry write goes straight from the
 * browser client to an RPC. Because the RPC is only half of a delete. Rows
 * live in Postgres and bytes live in Storage, and `foundry-bundles` carries no
 * storage policy of any kind -- so no browser client, signed in as anybody,
 * can remove a single bundle byte. `service_role` is its only deleter, and
 * that key has exactly one reader in this app (`$lib/server/foundry-bundle`).
 * `foundry-uploads` and `foundry-covers` do have own-folder delete policies,
 * but those are pinned to `auth.uid()`, so an ADMIN deleting a student's app
 * could not use them either. One server-side sweep is the only shape that
 * works for both callers.
 *
 * THIS ROUTE IS NOT THE AUTHORIZATION BOUNDARY AND MUST NEVER BECOME ONE.
 * `foundry_delete_app` and `foundry_delete_version` are called on
 * `locals.supabase` -- the CALLER'S OWN client -- so `auth.uid()` and
 * `is_admin()` inside those definer functions are the real thing and the
 * database decides. The service key is used for exactly one job afterwards:
 * removing the paths the database itself just returned. A request that is
 * refused never reaches the sweep, and the sweep can never name a path the
 * refusal would have withheld.
 *
 * THE ORDER IS ROWS FIRST, AND THAT IS AN ARGUMENT RATHER THAN AN ACCIDENT
 * (0136's header has it in full). There is no transaction across the two
 * systems, so one of them can land alone:
 *
 *   objects first -> a failure leaves a LIVE APP whose every file 404s. The
 *                    student finds it, and it reads as a corrupted upload.
 *   rows first    -> a failure leaves an ORPHANED OBJECT: bytes in a private
 *                    bucket that no row names, that nothing serves (the
 *                    serving route's allowlist is `student_app_files`, and
 *                    that row is gone), and that no client can list. It costs
 *                    storage and nothing else.
 *
 * SO A FAILED SWEEP IS NOT A FAILED DELETE, and this route does not report it
 * as one. `ok` is true the moment the RPC returns: the app IS gone. What a
 * partial sweep adds is `storageProblem`, a sentence the surface shows beside
 * the confirmation, and a SERVER LOG LINE naming every surviving object --
 * which is the only remaining record of them, because the rows that named
 * them no longer exist.
 *
 * IT ANSWERS ITS OWN 401/404, so it is deliberately not in `authedPrefixes`:
 * a route group's guard does not run for endpoints, and a redirect is a
 * strange answer to a fetch.
 *
 * A REFUSAL FROM THE RPC IS PASSED THROUGH VERBATIM. Those sentences were
 * written for the student who will read them ("That app does not exist.",
 * "That is the build your app publishes.") and a generic replacement here
 * would tell them strictly less.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { appId?: unknown; versionId?: unknown };

/** What the two RPCs return. The database names paths; the server names buckets. */
type AppPlan = {
	app_id: string;
	slug: string;
	title: string;
	version_ids: string[] | null;
	zip_paths: string[] | null;
	cover_path: string | null;
	versions_deleted: number;
	files_deleted: number;
};

type VersionPlan = {
	app_id: string;
	slug: string;
	version_id: string;
	ordinal: number;
	zip_path: string;
	files_deleted: number;
};

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) return json({ ok: false, message: 'You must be signed in.' }, { status: 401 });

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return json({ ok: false, message: 'That request was malformed.' }, { status: 400 });
	}

	const appId = typeof body.appId === 'string' ? body.appId : '';
	const versionId = typeof body.versionId === 'string' ? body.versionId : '';

	// EXACTLY ONE OF THE TWO. A body carrying both is a caller that has not
	// decided what it is deleting, and guessing on its behalf is how the wrong
	// thing goes.
	if (Boolean(appId) === Boolean(versionId)) {
		return json({ ok: false, message: 'Name an app or a version, not both.' }, { status: 400 });
	}
	if (appId && !UUID_RE.test(appId)) {
		return json({ ok: false, message: 'That app does not exist.' }, { status: 400 });
	}
	if (versionId && !UUID_RE.test(versionId)) {
		return json({ ok: false, message: 'That version does not exist.' }, { status: 400 });
	}

	let plan: FoundryDeletePlan;
	let deleted: { kind: 'app'; slug: string; title: string } | { kind: 'version'; ordinal: number };
	let counts: { versions: number; fileRows: number };

	if (appId) {
		const { data, error } = await supabase.rpc('foundry_delete_app', { p_app_id: appId });
		if (error) return json({ ok: false, message: error.message }, { status: 200 });
		const r = data as AppPlan;
		plan = {
			appId: r.app_id,
			versionIds: r.version_ids ?? [],
			zipPaths: r.zip_paths ?? [],
			coverPath: r.cover_path
		};
		deleted = { kind: 'app', slug: r.slug, title: r.title };
		counts = { versions: r.versions_deleted, fileRows: r.files_deleted };
	} else {
		const { data, error } = await supabase.rpc('foundry_delete_version', {
			p_version_id: versionId
		});
		if (error) return json({ ok: false, message: error.message }, { status: 200 });
		const r = data as VersionPlan;
		plan = {
			appId: r.app_id,
			versionIds: [r.version_id],
			zipPaths: [r.zip_path],
			// The cover belongs to the APP, which is still here.
			coverPath: null
		};
		deleted = { kind: 'version', ordinal: r.ordinal };
		counts = { versions: 1, fileRows: r.files_deleted };
	}

	// FROM HERE THE ROWS ARE GONE. Nothing below may turn that into a failure.
	const sweep = await sweepFoundryObjects(plan);

	if (sweep.problem) {
		// THE ONLY REMAINING RECORD OF THESE PATHS. The rows that named them are
		// deleted, so if this line is not written they are unfindable except by
		// walking the bucket. Best-effort instrumentation that cannot affect the
		// thing it measures: the delete has already happened.
		console.error(
			'[foundry-delete] objects left behind after a completed row delete:',
			JSON.stringify({ plan, orphaned: sweep.orphaned })
		);
	}

	return json({
		ok: true,
		deleted,
		removed: { bundles: sweep.bundles, uploads: sweep.uploads, covers: sweep.covers },
		counts,
		/** Null on a clean sweep. A sentence when bytes were left behind. */
		storageProblem: sweep.problem
	});
};
