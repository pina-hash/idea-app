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
 * along": a node type this file does not name cannot appear in the result,
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
 */

import {
	NOTE_MAX_CHARS,
	docLength,
	docText,
	safeHref,
	type NoteBlock,
	type NoteDoc,
	type NoteInline,
	type TiptapNode
} from '$lib/notebook-notes';

export type NormalizeResult = { ok: true; doc: NoteDoc } | { ok: false; error: string };

/**
 * Hostile input can nest thousands deep; a recursive walk over it is a stack
 * overflow, which in a serverless function is a 500 rather than a refusal.
 * Real notes are two levels (list -> item).
 */
const MAX_DEPTH = 12;

/** Marks we understand. Anything else on a run is simply not carried over. */
function markState(node: TiptapNode): { bold: boolean; italic: boolean; href: string | null } {
	let bold = false;
	let italic = false;
	let href: string | null = null;
	for (const mark of node.marks ?? []) {
		if (!mark || typeof mark.type !== 'string') continue;
		switch (mark.type) {
			case 'bold':
			case 'strong':
				bold = true;
				break;
			case 'italic':
			case 'em':
				italic = true;
				break;
			case 'link': {
				const raw = mark.attrs?.href;
				// A link whose target is not http/https/mailto keeps its TEXT and
				// loses its link -- dropping the run would silently delete what
				// the student wrote.
				href = safeHref(typeof raw === 'string' ? raw : null);
				break;
			}
			default:
				break;
		}
	}
	return { bold, italic, href };
}

/** Adjacent runs that would render identically are one run. */
function pushRun(runs: NoteInline[], run: NoteInline): void {
	const last = runs[runs.length - 1];
	if (last && !!last.bold === !!run.bold && !!last.italic === !!run.italic && last.href === run.href) {
		last.text += run.text;
		return;
	}
	runs.push(run);
}

/**
 * Every text node reachable from `node`, flattened into runs.
 *
 * Flattening rather than rejecting is the point: a paste that arrives wrapped
 * in something out of scope (a heading, a table cell, a span) still gives the
 * student their words back as plain text instead of losing them.
 */
function collectRuns(node: TiptapNode, runs: NoteInline[], depth: number): void {
	if (depth > MAX_DEPTH || !node || typeof node !== 'object') return;

	if (node.type === 'text' && typeof node.text === 'string' && node.text !== '') {
		const { bold, italic, href } = markState(node);
		const run: NoteInline = { text: node.text };
		if (bold) run.bold = true;
		if (italic) run.italic = true;
		if (href) run.href = href;
		pushRun(runs, run);
		return;
	}

	// Line breaks are not part of the scope (the editor has them switched off),
	// but a paste can carry one; a space keeps the words apart.
	if (node.type === 'hardBreak') {
		pushRun(runs, { text: ' ' });
		return;
	}

	for (const child of Array.isArray(node.content) ? node.content : []) {
		collectRuns(child, runs, depth + 1);
	}
}

function trimRuns(runs: NoteInline[]): NoteInline[] {
	const kept = runs.filter((r) => r.text !== '');
	if (kept.length) {
		kept[0] = { ...kept[0], text: kept[0].text.replace(/^\s+/, '') };
		const last = kept.length - 1;
		kept[last] = { ...kept[last], text: kept[last].text.replace(/\s+$/, '') };
	}
	return kept.filter((r) => r.text !== '');
}

/** A list's items: one run list each, with nested lists flattened in place. */
function listItems(node: TiptapNode, depth: number): NoteInline[][] {
	const items: NoteInline[][] = [];
	for (const child of Array.isArray(node.content) ? node.content : []) {
		if (!child || typeof child !== 'object') continue;
		if (child.type === 'bulletList' || child.type === 'orderedList') {
			// A nested list becomes more items of the SAME list. Indentation is
			// out of scope, and losing a level reads better than losing the text.
			if (depth < MAX_DEPTH) items.push(...listItems(child, depth + 1));
			continue;
		}
		const runs: NoteInline[] = [];
		collectRuns(child, runs, depth + 1);
		const trimmed = trimRuns(runs);
		if (trimmed.length) items.push(trimmed);
	}
	return items;
}

function blocksFrom(nodes: TiptapNode[], depth: number): NoteBlock[] {
	const blocks: NoteBlock[] = [];
	for (const node of nodes) {
		if (!node || typeof node !== 'object' || typeof node.type !== 'string') continue;

		if (node.type === 'bulletList' || node.type === 'orderedList') {
			const items = listItems(node, depth + 1);
			if (items.length) blocks.push({ type: node.type === 'bulletList' ? 'ul' : 'ol', items });
			continue;
		}

		// Everything else -- paragraph, and any out-of-scope block a paste
		// dragged in -- contributes its text as a paragraph.
		const runs: NoteInline[] = [];
		collectRuns(node, runs, depth + 1);
		const trimmed = trimRuns(runs);
		if (trimmed.length) blocks.push({ type: 'p', runs: trimmed });
	}
	return blocks;
}

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

	const doc = blocksFrom(nodes, 0);
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
