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
 */

import { matchesAccept } from '$lib/file-drop';
import { DECK_ACCEPT } from '$lib/classroom/deck';
import { SPEC_ACCEPT } from '$lib/classroom/composer-staging';
import { HTML_DOCUMENT_ACCEPT } from '$lib/classroom/html-assignment/store';

/** Where one dropped file goes. */
export type ComposerDropRoute = 'spec' | 'html' | 'zip' | 'files';

/** Which typed targets this form has right now. Absent means "not on this
 *  form", and a file for an absent target is an ordinary file. */
export interface ComposerDropTargets {
	/** The staged spec importer (create, and a kind that takes a spec). */
	spec: boolean;
	/** The ported-document box (an assignment, and an admin). */
	html: boolean;
	/** The zip choice: presentation, gallery or plain file. Offered wherever
	 *  the Files list is, since a gallery is ordinary attachments. */
	zip: boolean;
}

/** One file's route. ORDER MATTERS ONLY WHERE RULES OVERLAP, and none do:
 *  `.json`, `.html` and `.zip` are three different extensions. */
export function composerDropRoute(file: File, targets: ComposerDropTargets): ComposerDropRoute {
	if (targets.spec && matchesAccept(file, SPEC_ACCEPT)) return 'spec';
	if (targets.html && matchesAccept(file, HTML_DOCUMENT_ACCEPT)) return 'html';
	if (targets.zip && matchesAccept(file, DECK_ACCEPT)) return 'zip';
	return 'files';
}

/** A whole drop, split by route, each list in the order it was dropped. */
export type ComposerDropSplit = Record<ComposerDropRoute, File[]>;

export function splitComposerDrop(files: readonly File[], targets: ComposerDropTargets): ComposerDropSplit {
	const out: ComposerDropSplit = { spec: [], html: [], zip: [], files: [] };
	for (const f of files) out[composerDropRoute(f, targets)].push(f);
	return out;
}

/**
 * WHAT THE ROOT SAYS AFTER A DROP, one short line per destination, so a file
 * never appears to vanish into a box the teacher is not looking at.
 */
export function composerDropSummary(split: ComposerDropSplit): string | null {
	const parts: string[] = [];
	const n = (k: number, one: string, many: string) => (k === 1 ? one : `${k} ${many}`);
	if (split.files.length) parts.push(`${n(split.files.length, 'One file', 'files')} added to Files`);
	if (split.spec.length) parts.push(`${n(split.spec.length, 'the spec', 'spec files')} sent to the spec importer`);
	if (split.html.length) parts.push(`${n(split.html.length, 'the document', 'documents')} sent to the ported assignment box`);
	if (split.zip.length) parts.push(`${n(split.zip.length, 'the zip', 'zips')} waiting for your choice below`);
	if (!parts.length) return null;
	const line = parts.join('; ');
	return line.charAt(0).toUpperCase() + line.slice(1) + '.';
}

/** The sentence the ported-document box gives when it already holds one: the
 *  box's own drop target is disabled then, and the root must say why rather
 *  than stage it anywhere else. */
export const HTML_DROP_BUSY =
	'A ported document is already staged. Remove it in the ported assignment box to stage a different one.';
