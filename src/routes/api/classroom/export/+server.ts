import { json } from '@sveltejs/kit';
import { exportClassroomItem } from '$lib/server/classroom-export';
import type { RequestHandler } from './$types';

/**
 * Exports one item's spec to the repo. Called AFTER a content write has already
 * committed, and never awaited by the thing that wrote it.
 *
 * WHY THE CLIENT FIRES THIS RATHER THAN THE WRITE PATH DOING IT INLINE. The
 * export is best-effort and must never block or fail a publish, and on a
 * serverless platform "fire and forget after responding" is not a thing that
 * reliably happens -- the function is torn down once its response is returned,
 * so work started after that may simply never run. Its own request is the only
 * shape that both keeps the save fast AND gives the export a whole invocation
 * to finish in. Every content transport pings it and ignores the result
 * (`pingClassroomExport`); the manage console's Retry is the same call, awaited,
 * because there someone is watching it.
 *
 * IT IS NOT A NEW AUTHORITY. Every read inside runs under the caller's OWN
 * cookie session, so it can only ever export something the caller could already
 * read, and the bookkeeping write is refused by classroom_record_export for
 * anyone who does not manage the item. A caller who hammers this at an id they
 * cannot touch gets nothing back but "skipped" or a refusal.
 *
 * IT NEVER 500s ON A FAILED EXPORT. A GitHub refusal is a normal outcome that
 * has already been recorded on the item; answering 200 with `status: 'failed'`
 * is what lets the client tell "the export did not land" apart from "this
 * request did not arrive", which are different problems with different fixes.
 */
export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}

	let body: { item_id?: unknown };
	try {
		body = (await request.json()) as { item_id?: unknown };
	} catch {
		return json({ error: 'Expected a JSON body.' }, { status: 400 });
	}

	const itemId = typeof body.item_id === 'string' ? body.item_id.trim() : '';
	if (!itemId) return json({ error: 'Which item?' }, { status: 400 });

	try {
		const outcome = await exportClassroomItem(supabase, itemId);
		return json(outcome);
	} catch (e) {
		// The exporter records its own failures and returns them; reaching here
		// means something outside that path broke (a malformed id refused by
		// Postgres, say). Still not an error the caller can act on, and NOT one
		// this build can classify -- 'unknown' is shown verbatim rather than
		// described as a race or a refusal it may well not be.
		return json({
			status: 'failed',
			error: (e as Error).message ?? 'The export failed.',
			kind: 'unknown'
		});
	}
};
