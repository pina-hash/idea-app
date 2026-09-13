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
import {
	GRID_NODE_NAME,
	gridProblem,
	type NoteGrid
} from '$lib/notebook/grid/grid-doc';
import { richBlocksFrom, type RichWalkOptions } from './rich-text-normalize';

export type NormalizeResult = { ok: true; doc: NoteDoc } | { ok: false; error: string };

/**
 * A SPREADSHEET GRID, CLAIMED BEFORE THE TEXT WALK (0199/0210).
 *
 * THE HOOK IS THE ONE THE CLASSROOM'S IMAGE USES, AND ITS NAME IS THE ONLY
 * THING ABOUT IT THAT IS WRONG. Its contract is "claim a node that carries no
 * runs at all"; see its own comment in `./rich-text-normalize`. A grid is
 * exactly that -- a ProseMirror `atom` with one attribute and no text -- so
 * without a claim it falls into the text walk, `trimRuns` comes back empty, and
 * the block is DROPPED. That is the failure this hook exists for and it is
 * silent: a student's table would simply not be in the document that got
 * stored, with nothing raised anywhere.
 *
 * IT VALIDATES BEFORE IT CLAIMS, AND `gridProblem` IS THAT VALIDATION -- the
 * same function the ProseMirror paste filter calls and the same rules
 * `_notebook_note_grid_len` enforces. This is a WHITELIST TRANSLATOR, so what
 * is emitted is BUILT here from the attribute rather than passed along: the
 * result carries `type` and `rows` and nothing else, so a node arriving with
 * extra attributes contributes none of them. A grid that does not validate is
 * NOT claimed and NOT emitted -- the content disappears rather than surviving
 * in a form nobody checked, which is this file's stated failure mode and is
 * also the only answer available, since the walk has no refusal channel.
 *
 * AN EMPTY GRID IS CLAIMED, DELIBERATELY. It is a legal block -- the gate
 * accepts a note that has one alongside some writing -- so dropping it here
 * would delete a table a student had just laid out and was about to fill in.
 * What an all-empty grid cannot do is be a note's ONLY content, and that is the
 * text floor's job below, not this one's.
 */
function claimGrid(node: TiptapNode): NoteGrid | null {
	if (node.type !== GRID_NODE_NAME) return null;
	const rows = (node as { attrs?: { rows?: unknown } }).attrs?.rows;
	const grid = { type: 'grid' as const, rows };
	return gridProblem(grid) === null ? (grid as NoteGrid) : null;
}

/**
 * Real notes are two levels (list -> item), or three once a sublist is in
 * play; the ceiling is a guard against hostile nesting, not a feature limit.
 */
const WALK: RichWalkOptions = { maxDepth: 12, imageBlock: claimGrid };

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
	// THE TEXT FLOOR, AND `docText` IS THE CLIENT MIRROR OF `v_total > 0`. A
	// grid contributes its cell sources to that projection and an EMPTY grid
	// contributes no block at all, which is what keeps this refusal and the
	// gate's agreeing about a note whose only content is a grid nobody has
	// typed into. The grid says so on screen while it is still empty
	// (`GRID_EMPTY_NOTICE`), so this is the backstop rather than the first
	// anyone hears of it.
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
