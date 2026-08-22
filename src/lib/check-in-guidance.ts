/**
 * A NOTEBOOK CHECK-IN'S GUIDANCE PROMPT, in one place: the vocabulary three
 * surfaces share, and the single write every one of them goes through.
 *
 * WHAT GUIDANCE IS. The paragraph an instructor writes on a check-in saying
 * what to photograph and what to write about it -- stored on
 * `notebook_sessions.guidance_doc` (0123), in the SAME closed document shape
 * `classroom_items.body_doc` carries, validated by the SAME `_classroom_doc_ok`
 * the classroom uses. There is no third rich-text contract here and there must
 * not be one.
 *
 * WHY THIS MODULE EXISTS AT ALL. Guidance is authored on three surfaces that
 * live in three different rooms -- the classroom composer (`ContentComposer` ->
 * `CheckInStager`), the classroom item page (`ItemDetail`), and the instructor
 * review console (`SessionManager` under `/notebook/review`) -- and read on two
 * more. Each of those would otherwise carry its own copy of the word target,
 * its own fetch, and its own idea of what an empty prompt is. This is the one
 * copy.
 *
 * IT IS AT `$lib` ROOT, not under `$lib/classroom` or `$lib/notebook`, because
 * it is genuinely both: the thing is a NOTEBOOK check-in's column, authored
 * from CLASSROOM surfaces. Filing it under either room would make the other
 * room's import read as a layering mistake rather than as the shared contract
 * it is.
 */

import type { ItemDoc, ItemInline } from '$lib/classroom/classroom-doc';
import { tiptapWordCount, type TiptapNode } from '$lib/rich-text';

/**
 * THE TARGET, and it is a target rather than a limit.
 *
 * A check-in prompt is bench instruction read on a phone in a shop, beside a
 * photo the student is about to take. 250 words is the same figure
 * `IDEA_MATERIAL_SPEC` v2.1 sets for a module's instructions, for the same
 * reason: past it the reading stops being the thing in front of the person and
 * starts being an obstacle to it, and the teaching that explains WHY belongs in
 * the unit's reference document.
 *
 * IT NEVER BLOCKS A SAVE, ANYWHERE. There is no gate on it in the RPC, none in
 * the route, and none in any component -- the counter goes amber and says so.
 * The only hard ceiling is the database's 20,000 characters, which is a storage
 * bound rather than an editorial one. An instructor who has a reason to write
 * 300 words is not going to be told by a text box that they may not.
 */
export const GUIDANCE_WORD_TARGET = 250;

/** The counter's three states, mirroring `sentenceState`'s shape exactly. */
export type GuidanceState = 'empty' | 'within' | 'over';

export function guidanceState(count: number, target = GUIDANCE_WORD_TARGET): GuidanceState {
	if (count === 0) return 'empty';
	return count > target ? 'over' : 'within';
}

/**
 * WORDS IN THE PROMPT BEING TYPED. One line, because the counting rule is
 * `tiptapWordCount`'s and this is only the name it goes by on this feature --
 * a second implementation is what would let the composer and the review console
 * disagree about the same paragraph.
 */
export function guidanceWordCount(doc: TiptapNode | null | undefined): number {
	return tiptapWordCount(doc);
}

/** The counter's own words, so three mounts cannot spell them three ways. */
export function guidanceCountLabel(count: number, target = GUIDANCE_WORD_TARGET): string {
	if (count === 0) return `0 of ${target} words`;
	const word = count === 1 ? 'word' : 'words';
	return count > target
		? `${count} ${word}, over the ${target} target`
		: `${count} of ${target} ${word}`;
}

/**
 * IS THERE A PROMPT HERE. An empty document, a document of empty blocks, and
 * null are ONE state, exactly as they are in the database: 0123 stores SQL
 * null, JSON `null` and `[]` identically, because "a prompt with no blocks in
 * it" is a thing no reader can render differently from "no prompt".
 */
export function hasGuidance(doc: ItemDoc | null | undefined): boolean {
	if (!doc || !doc.length) return false;
	for (const block of doc) {
		if ('runs' in block) {
			if (block.runs.some((run: ItemInline) => run.text.trim() !== '')) return true;
		} else if (block.items.length > 0) {
			return true;
		}
	}
	return false;
}

/** What one guidance write came back with. */
export type GuidanceSaveResult = { ok: true; cleared: boolean } | { ok: false; message: string };

/**
 * THE ONE WRITE, and every surface calls this function.
 *
 * WHY IT IS A ROUTE AND NOT A DIRECT RPC CALL. `notebook_set_session_guidance`
 * takes the STORED document shape, and the browser holds the EDITOR'S -- the
 * translation between them is `$lib/server/classroom-doc`'s whitelist
 * normalizer, which builds its result from the node types it names and
 * therefore cannot be moved into the client without losing the first of the
 * three gates. So the route normalizes and calls the RPC AS THE CALLER: the
 * manager check inside the function is still the boundary, and a caller talking
 * to PostgREST directly still meets `_classroom_doc_ok`. This is the same shape
 * `/api/classroom/item` and `/api/notebook/edit-note` already have, for the
 * same reason.
 *
 * A REFUSAL IS NOT RETRYABLE AND SAYS SO. The server considered the document
 * and answered; sending the identical bytes again five times with backoff
 * arrives at the identical answer while telling an instructor their work is
 * being retried. Only a transport failure is worth another attempt, and that is
 * the distinction `SaveState` is built around.
 */
export async function saveSessionGuidance(
	sessionId: string,
	doc: TiptapNode | null,
	fetchImpl: typeof fetch = fetch
): Promise<GuidanceSaveResult> {
	let res: Response;
	try {
		res = await fetchImpl('/api/notebook/session-guidance', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ session_id: sessionId, guidance: doc })
		});
	} catch (e) {
		return { ok: false, message: (e as Error).message || 'That guidance could not be saved.' };
	}
	let payload: { ok?: boolean; cleared?: boolean; error?: string } = {};
	try {
		payload = (await res.json()) as typeof payload;
	} catch {
		/* A body we cannot read is reported by status alone, below. */
	}
	if (!res.ok || !payload.ok) {
		return { ok: false, message: payload.error || 'That guidance could not be saved.' };
	}
	return { ok: true, cleared: !!payload.cleared };
}
