/**
 * Digital notebook, WRITTEN NOTES: the server-side normalizer.
 *
 * This is the sanitizer. Everything a student's editor produces passes
 * through it before a single byte is stored, and it is deliberately under
 * `$lib/server` -- SvelteKit refuses to bundle that into client code -- so
 * there is no build in which the browser's copy of these rules is the one
 * being enforced.
 *
 * IT IS A WHITELIST TRANSLATOR, NOT A STRIPPER. The input is the editor's
 * own ProseMirror JSON, arbitrary and untrusted; the output is the closed
 * NoteDoc shape from $lib/notebook-notes. Nothing is "cleaned up and passed
 * along": a node type the walk does not name cannot appear in the result,
 * because the result is BUILT, node by node, from the ones it does. That is
 * what makes the failure mode of a novel attack "the content disappears"
 * rather than "the content survives in a form nobody checked".
 *
 * AND IT IS NOT THE ONLY THING STANDING BETWEEN A STUDENT AND AN INSTRUCTOR'S
 * BROWSER. The stored doc is rendered by walking it into real Svelte elements
 * (NoteContent.svelte) -- there is no `{@html}` in the note path at all -- and
 * `safeHref` runs again at render time. So a note that reached the database
 * some other way (a direct PostgREST call on the RPC, which is granted to
 * `authenticated` like every other student write) still cannot execute
 * anything; it can only be text. This file is the first of three gates, not
 * the only one.
 *
 * THE WALK ITSELF LIVES IN `./rich-text-normalize` and is shared with the
 * classroom's item bodies, which used to hold a line-for-line copy of it. The
 * two CONTRACTS stay separate -- separate closed shapes, separate SQL gates,
 * separate renderers -- and everything below is what makes this one a note
 * rather than an item body.
 */

import {
	NOTE_MAX_CHARS,
	docLength,
	docText,
	type NoteBlock,
	type NoteDoc,
	type TiptapNode
} from '$lib/notebook-notes';
import { richBlocksFrom, type RichWalkOptions } from './rich-text-normalize';

export type NormalizeResult = { ok: true; doc: NoteDoc } | { ok: false; error: string };

/**
 * Real notes are two levels (list -> item), or three once a sublist is in
 * play; the ceiling is a guard against hostile nesting, not a feature limit.
 */
const WALK: RichWalkOptions = { maxDepth: 12 };

/**
 * Editor output (or anything at all) -> a storable note.
 *
 * Accepts the ProseMirror document the editor emits: `{ type: 'doc', content:
 * [...] }`, or a bare array of nodes. Returns a refusal rather than an empty
 * document for input with nothing in it, because "save" on an empty note is a
 * mistake worth reporting, not a note.
 */
export function normalizeNoteDoc(input: unknown): NormalizeResult {
	if (input === null || input === undefined) {
		return { ok: false, error: 'A note needs some text.' };
	}

	let nodes: TiptapNode[];
	if (Array.isArray(input)) {
		nodes = input as TiptapNode[];
	} else if (typeof input === 'object') {
		const content = (input as TiptapNode).content;
		if (!Array.isArray(content)) {
			return { ok: false, error: 'That note could not be read.' };
		}
		nodes = content;
	} else {
		return { ok: false, error: 'That note could not be read.' };
	}

	// A cheap ceiling on the WORK, separate from the ceiling on the result:
	// normalization of a pathological document should be refused, not
	// performed and then thrown away.
	if (nodes.length > 2000) {
		return { ok: false, error: 'That note is too long to save.' };
	}

	const doc = richBlocksFrom<NoteBlock>(nodes, 0, WALK);
	if (docText(doc) === '') {
		return { ok: false, error: 'A note needs some text.' };
	}
	if (docLength(doc) > NOTE_MAX_CHARS) {
		return {
			ok: false,
			error: `A note is capped at ${NOTE_MAX_CHARS.toLocaleString()} characters. Split it across two notes.`
		};
	}

	return { ok: true, doc };
}
