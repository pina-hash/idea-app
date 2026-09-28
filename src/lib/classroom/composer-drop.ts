/**
 * WHERE A FILE DROPPED ON THE COMPOSER GOES (ledger 0297, package ITEM; report
 * 21).
 *
 * Mr. Pina, verbatim: "I want to be able to drag and drop HTML specs,
 * currently drag and drop only works for general file upload, I want
 * different drag and drops for different uploads on the page."
 *
 * The composer's whole form is a drop zone, so a file dropped on the title or
 * the body is not lost. It used to hand EVERY such file to the student-facing
 * Files list -- so a spec `.json` and a ported `.html`, dropped anywhere but on
 * their own small boxes, were staged as attachments the whole class could
 * read, and the box built for them never heard about it (measured by Phase 0's
 * drop.mjs: "1 dropped file attached."). The root zone now asks THIS function
 * which of the form's targets a file belongs to and hands it there.
 *
 * THE ROOT NEVER CLAIMS A FILE A NESTED TARGET SHOULD HAVE TAKEN, and the
 * routing is by each target's OWN type rule, read from where that rule lives:
 * `SPEC_ACCEPT` is the spec importer's picker and drop rule, `DECK_ACCEPT` the
 * deck box's, `HTML_DOCUMENT_ACCEPT` the ported-document box's. None of those
 * strings is written here. A file matching a target that is NOT on this form
 * (a material has no spec importer for an assignment spec, an edit has no
 * staged-deck box, a teacher who is not an admin has no ported-document box)
 * is an ordinary file and goes to Files exactly as before.
 *
 * WHAT IT DOES NOT CHANGE, and CLAUDE.md is why: the Files panel stays
 * UNFILTERED ("no accept on a plain picker, on either side"). A `.json` data
 * file or a `.zip` dropped straight onto the Files box is still attached, by
 * that box's own drop target, which the root stands down for.
 *
 * A ZIP ASKS. A zip can be a presentation, a gallery of pictures, or simply a
 * file to hand out, and nothing in the bytes says which a teacher meant -- so
 * the answer is the teacher's (report 23), through the composer's zip choice,
 * never a guess made here.
 *
 * ON THE EDIT FORM A SPEC OR A PORTED DOCUMENT IS NEVER AN ORDINARY FILE
 * (reports R01 and R11, 2026-09-28). The create-form rule above ("a target not
 * on this form leaves its files as ordinary files") put a spec `.json` and a
 * ported `.html` dropped on an EDIT onto the class's Files list, because the
 * edit form carries no spec importer of its own and offers the ported box only
 * on an item that already has a document. Mr. Pina, editing an assignment,
 * dropped the document he meant to upload and it was attached for the whole
 * class. So an edit form says where each one goes instead:
 *
 *   - a spec goes to the ITEM PAGE'S own importer when the caller hands one in
 *     (`specWhere: 'item-page'`), which is the one importer that owns an
 *     existing item's spec (see ContentComposer's header on why the edit form
 *     carries no second one); where there is none (the class list's row
 *     editor), it is REFUSED in words (`specRefusal`), never attached;
 *   - a web page on an assignment that cannot take one is REFUSED in words
 *     (`htmlRefusal`): the assignment is not a ported one, or this form cannot
 *     upload a ported document.
 *
 * A REFUSAL NAMES THE FILE, SAYS IT WAS NOT ATTACHED AND SAYS WHAT TO DO
 * INSTEAD, including how to hand the file out on purpose: the Files box's own
 * drop target is unfiltered and still takes it, because "no accept on a plain
 * picker" governs that box and not this router. A form with no Files list at
 * all (`files: false`) refuses an ordinary file the same way rather than
 * swallowing the drop, which is what let the drop zone stop being switched off
 * whenever attachments were (the spec and document routes never needed them).
 */

import { matchesAccept } from '$lib/file-drop';
import { DECK_ACCEPT } from '$lib/classroom/deck';
import { SPEC_ACCEPT } from '$lib/classroom/composer-staging';
import { HTML_DOCUMENT_ACCEPT } from '$lib/classroom/html-assignment/store';

/** Where one dropped file goes. `refused` is a file the form declined out
 *  loud (see `ComposerDropRefusal`); it is attached nowhere. */
export type ComposerDropRoute = 'spec' | 'html' | 'zip' | 'files' | 'refused';

/** Why a dropped file was declined. One reason, one sentence. */
export type ComposerDropRefusal =
	/** A spec, on an edit form with no importer to hand it to (the class list's row editor). */
	| 'spec-elsewhere'
	/** A web page, on an assignment that is not a ported HTML assignment. */
	| 'html-not-ported'
	/** A web page, on an assignment whose form cannot upload a ported document. */
	| 'html-not-here'
	/** Any other file, on a form with no Files list. */
	| 'no-files';

/** Which typed targets this form has right now. Absent means "not on this
 *  form", and a file for an absent target is an ordinary file, unless a
 *  refusal is named for it, which is the edit form's answer. */
export interface ComposerDropTargets {
	/** A spec importer: the staged one (create), or the item page's (edit). */
	spec: boolean;
	/** The ported-document box (an assignment, and an admin). */
	html: boolean;
	/** The zip choice: presentation, gallery or plain file. Offered wherever
	 *  the Files list is, since a gallery is ordinary attachments. */
	zip: boolean;
	/** Where a routed spec lands: this form's own staged importer, or the item
	 *  page's importer outside it. Only the wording differs. Default `form`. */
	specWhere?: 'form' | 'item-page';
	/** Decline a spec this form cannot route, rather than attach it. */
	specRefusal?: 'spec-elsewhere' | null;
	/** Decline a web page this form cannot route, rather than attach it. */
	htmlRefusal?: 'html-not-ported' | 'html-not-here' | null;
	/** False when the form has no Files list. Default true. */
	files?: boolean;
}

function routeAndReason(
	file: File,
	targets: ComposerDropTargets
): { route: ComposerDropRoute; reason: ComposerDropRefusal | null } {
	if (matchesAccept(file, SPEC_ACCEPT)) {
		if (targets.spec) return { route: 'spec', reason: null };
		if (targets.specRefusal) return { route: 'refused', reason: targets.specRefusal };
	}
	if (matchesAccept(file, HTML_DOCUMENT_ACCEPT)) {
		if (targets.html) return { route: 'html', reason: null };
		if (targets.htmlRefusal) return { route: 'refused', reason: targets.htmlRefusal };
	}
	if (targets.zip && matchesAccept(file, DECK_ACCEPT)) return { route: 'zip', reason: null };
	if (targets.files === false) return { route: 'refused', reason: 'no-files' };
	return { route: 'files', reason: null };
}

/** One file's route. ORDER MATTERS ONLY WHERE RULES OVERLAP, and none do:
 *  `.json`, `.html` and `.zip` are three different extensions. */
export function composerDropRoute(file: File, targets: ComposerDropTargets): ComposerDropRoute {
	return routeAndReason(file, targets).route;
}

/** Why a file is refused on this form, or null when it is not. */
export function composerDropRefusal(file: File, targets: ComposerDropTargets): ComposerDropRefusal | null {
	return routeAndReason(file, targets).reason;
}

/** The file names as one phrase: "a.json", "a.json and b.json", "a, b and c". */
function namesPhrase(files: readonly File[]): string {
	const names = files.map((f) => f.name || 'The file');
	if (names.length <= 1) return names[0] ?? 'The file';
	return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * THE SENTENCE FOR ONE REASON, naming every file it refused. Each says the
 * file was NOT attached, where the thing it looks like is handled, and how to
 * hand it out as a plain file on purpose (the Files box takes any file).
 */
export function composerDropRefusalLine(reason: ComposerDropRefusal, files: readonly File[]): string {
	const names = namesPhrase(files);
	const were = files.length === 1 ? 'was' : 'were';
	const them = files.length === 1 ? 'it' : 'them';
	const handOut = `To hand ${them} out as a file instead, drop ${them} on the Files box.`;
	switch (reason) {
		case 'spec-elsewhere':
			return (
				`${names} ${were} not attached. A spec is imported on the item's own page, under ` +
				`Instructor tools: open the item and drop it there. ${handOut}`
			);
		case 'html-not-ported':
			return (
				`${names} ${were} not attached. This assignment is not a ported HTML assignment, so a ` +
				`web page cannot replace anything on it. ${handOut}`
			);
		case 'html-not-here':
			return (
				`${names} ${were} not attached. A ported HTML assignment is uploaded by a site admin, ` +
				`from Edit post on the assignment's own page. ${handOut}`
			);
		case 'no-files':
			return `${names} ${were} not attached. This form takes no files.`;
	}
}

/** A whole drop, split by route, each list in the order it was dropped. */
export type ComposerDropSplit = Record<ComposerDropRoute, File[]>;

export function splitComposerDrop(files: readonly File[], targets: ComposerDropTargets): ComposerDropSplit {
	const out: ComposerDropSplit = { spec: [], html: [], zip: [], files: [], refused: [] };
	for (const f of files) out[composerDropRoute(f, targets)].push(f);
	return out;
}

/**
 * WHAT THE ROOT SAYS AFTER A DROP, one short line per destination, so a file
 * never appears to vanish into a box the teacher is not looking at, and one
 * sentence per refusal, so a declined file is never silent either. `targets`
 * is what the drop was routed against: it decides the spec's wording and each
 * refusal's reason. Without it a refused file is read as having no Files list
 * to go to, the one reason that needs no context.
 */
export function composerDropSummary(
	split: Omit<ComposerDropSplit, 'refused'> & { refused?: File[] },
	targets?: ComposerDropTargets
): string | null {
	const parts: string[] = [];
	const n = (k: number, one: string, many: string) => (k === 1 ? one : `${k} ${many}`);
	if (split.files.length) parts.push(`${n(split.files.length, 'One file', 'files')} added to Files`);
	if (split.spec.length) {
		const what = n(split.spec.length, 'the spec', 'spec files');
		parts.push(
			targets?.specWhere === 'item-page'
				? `${what} sent to this item's spec importer, under Instructor tools. Nothing is published ` +
						'yet: close the editor to check it and publish it there'
				: `${what} sent to the spec importer`
		);
	}
	if (split.html.length) parts.push(`${n(split.html.length, 'the document', 'documents')} sent to the ported assignment box`);
	if (split.zip.length) parts.push(`${n(split.zip.length, 'the zip', 'zips')} waiting for your choice below`);
	const lines: string[] = [];
	if (parts.length) {
		const line = parts.join('; ');
		lines.push(line.charAt(0).toUpperCase() + line.slice(1) + '.');
	}
	const byReason = new Map<ComposerDropRefusal, File[]>();
	for (const f of split.refused ?? []) {
		const reason = (targets && composerDropRefusal(f, targets)) || 'no-files';
		byReason.set(reason, [...(byReason.get(reason) ?? []), f]);
	}
	for (const [reason, files] of byReason) lines.push(composerDropRefusalLine(reason, files));
	return lines.length ? lines.join(' ') : null;
}

/**
 * WHAT KIND OF POST A DROP ON THE CLASS PAGE OPENS (R01). New post opens as an
 * announcement, which takes neither a spec nor a ported document, so a spec or
 * a worksheet dropped on the class page would route to Files on arrival and the
 * drop would do the one thing the report asked it not to. So the dropped files
 * choose the kind BEFORE they are routed: a spec makes a MATERIAL when it reads
 * as a reference document (schema 2, or a `meta.referenceId`) and an
 * ASSIGNMENT otherwise; a web page makes an assignment where this form offers
 * the ported box (`html`); anything else leaves the kind alone (null). A spec
 * that cannot be read or parsed still makes an assignment, whose importer then
 * says what is wrong with it in its own words.
 */
export async function composerKindForDrop(
	files: readonly File[],
	opts: { html: boolean }
): Promise<'assignment' | 'material' | null> {
	const spec = files.find((f) => matchesAccept(f, SPEC_ACCEPT));
	if (spec) {
		try {
			const parsed = JSON.parse(await spec.text()) as {
				schemaVersion?: unknown;
				meta?: { referenceId?: unknown } | null;
			} | null;
			if (parsed && (parsed.schemaVersion === 2 || typeof parsed.meta?.referenceId === 'string')) {
				return 'material';
			}
		} catch {
			/* Not JSON: the assignment importer says so, in its own words. */
		}
		return 'assignment';
	}
	if (opts.html && files.some((f) => matchesAccept(f, HTML_DOCUMENT_ACCEPT))) return 'assignment';
	return null;
}

/** The sentence the ported-document box gives when it already holds one: the
 *  box's own drop target is disabled then, and the root must say why rather
 *  than stage it anywhere else. */
export const HTML_DROP_BUSY =
	'A ported document is already staged. Remove it in the ported assignment box to stage a different one.';
