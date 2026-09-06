import { json } from '@sveltejs/kit';
import { UUID_RE } from '$lib/server/notebook-upload';
import { copyIsRemovable, readAnswer } from '$lib/classroom/DuplicateDrafts.svelte';
import type { RequestHandler } from './$types';

/**
 * Remove ONE surplus copy of a duplicate draft.
 *
 * WHAT THIS IS AND WHAT IT IS NOT. It is not a second deletion path: the
 * deletion is `POST /api/classroom/delete-content`, unchanged, reached through
 * SvelteKit's own `fetch`, which invokes that handler in-process with this
 * request's cookies. Everything here is a GATE in front of it.
 *
 * WHY THE GATE EXISTS AT ALL, given that the client already hides the control.
 * `classroom_delete_item` asks `_classroom_manages_item` and NOTHING about
 * student work -- correctly, because it is also the delete behind the item
 * page, where a teacher deleting an assignment with hand-ins on it is deleting
 * an assignment and knows it. This surface makes a different promise: it calls
 * rows SURPLUS COPIES and offers to sweep them. A copy carrying a hand-in is
 * not a surplus copy whatever it looks like, and a promise the client alone
 * keeps is a promise a crafted request breaks. So the safety is re-asked here,
 * server-side, on counts the database takes itself.
 *
 * IT RE-ASKS 0186 RATHER THAN TRUSTING THE PAYLOAD. The caller sends an id and
 * nothing else; whether that id is a surplus copy, whether it is removable, and
 * whether this caller may see it at all are all answered by re-running the same
 * function the page ran, scoped to the same section. The client cannot assert
 * any of it.
 *
 * AND IT NEVER REMOVES THE ONE BEING KEPT. `keep_id` is excluded explicitly
 * rather than by absence from the surplus list, so a future change that put the
 * kept row into that array would refuse rather than delete it.
 */
export const POST: RequestHandler = async ({ request, params, fetch, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ ok: false, error: 'You must be signed in.' }, { status: 401 });
	}

	let body: { id?: string };
	try {
		body = (await request.json()) as { id?: string };
	} catch {
		return json({ ok: false, error: 'Expected a JSON body.' }, { status: 400 });
	}

	const id = String(body.id ?? '').trim();
	if (!UUID_RE.test(id)) {
		return json({ ok: false, error: 'id must be a uuid.' }, { status: 400 });
	}

	const { data, error: rpcError } = await supabase.rpc('classroom_duplicate_drafts', {
		p_section_id: params.sectionId
	});
	if (rpcError) {
		return json(
			{ ok: false, error: 'The duplicate check could not be run, so nothing was removed.' },
			{ status: 400 }
		);
	}

	const answer = readAnswer(data);

	// Is it the kept copy? Refused by name, ahead of everything else.
	if (answer.groups.some((g) => g.keep_id === id)) {
		return json(
			{ ok: false, error: 'That is the copy being kept. It was not removed.' },
			{ status: 400 }
		);
	}

	const copy = answer.groups.flatMap((g) => g.surplus).find((c) => c.id === id);

	// NOT FOUND AND NOT YOURS ANSWER IDENTICALLY, so an id cannot be probed:
	// a row in another teacher's class, a row that is not a duplicate at all,
	// and a row that does not exist are one sentence.
	if (!copy) {
		return json(
			{ ok: false, error: 'That is not a surplus copy of a draft in this class.' },
			{ status: 400 }
		);
	}

	// THE CLAUSE. Student work is absolute and this is where it is enforced.
	if (!copyIsRemovable(copy)) {
		return json(
			{
				ok: false,
				error:
					'A student has work on that copy, so it was not removed. Open the item and look at the work before deciding.'
			},
			{ status: 400 }
		);
	}

	// The one deletion path, unchanged, with its own management check and its
	// own Drive sweep. `fetch` here is SvelteKit's, so the cookies ride along
	// and the RPC still runs as the caller.
	const res = await fetch('/api/classroom/delete-content', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ id })
	});
	const out = (await res.json().catch(() => ({}))) as { error?: string };
	if (!res.ok) {
		return json(
			{ ok: false, error: out.error ?? 'That copy could not be removed.' },
			{ status: res.status }
		);
	}

	return json({ ok: true, id });
};
