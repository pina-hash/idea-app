/**
 * Opening a document somebody ELSE shared with you: the pure, client-safe layer.
 *
 * `0205` shipped `ideacad_shared_with_me` and `ideacad_open_shared_document` and
 * BOTH HAD NO CALLER for eight days. Ledger 0190 built `SharePanel` and ledger
 * 0195 mounted it, so a student could GRANT access from the real item page --
 * and the classmate they granted it to had no way to open the document. The
 * feature was half live. This module is the arithmetic for the other half.
 *
 * NO SVELTE, NO TRANSPORT, NO CLIENT IN HERE, the same rule `sharing.ts`
 * follows: every decision below is assertable without a browser and without a
 * database, and the one place a surface asks a question is a pure function
 * rather than an expression written at two call sites.
 *
 * WHAT THIS MODULE IS NOT: it is not the authorization boundary, and on this
 * path that sentence has teeth. `0205` re-asks `_ideacad_can_write_document`
 * INSIDE every write RPC, so a grant revoked mid-session cannot write no matter
 * what any value here says. A rule here decides what to RENDER; the database
 * decides what happens.
 */

import {
	IDEACAD_ROLE_LABELS,
	IDEACAD_ROLE_NOTES,
	ideacadCanWrite,
	ideacadNormalizeEmail,
	type IdeacadDocumentRole,
	type IdeacadSharedDocument
} from './sharing';

/**
 * One row of the list, shaped for rendering.
 *
 * `label` and `note` are `sharing.ts`'s, looked up rather than restated: a
 * second spelling of "View only" is the one that stops matching the chip the
 * owner sees on the same screen.
 */
export interface IdeacadSharedRow {
	documentId: string;
	ownerEmail: string;
	role: IdeacadDocumentRole;
	label: string;
	note: string;
	grantedAt: string;
	updatedAt: string;
	/** Whether opening this row hands over an editable surface. */
	canWrite: boolean;
}

/**
 * Shape and ORDER the list the RPC returned.
 *
 * THE ORDER IS THE DATABASE'S AND IS RE-ASSERTED HERE ANYWAY.
 * `ideacad_shared_with_me` orders by `d.student_email`, and this sorts on the
 * normalized address so two renders of one payload cannot differ -- a list that
 * reshuffles between two frames is a list a student cannot point at. The tie
 * break is the document id, which is unique, so the order is TOTAL: two
 * documents shared by one person can never swap places.
 */
export function ideacadSharedRows(
	documents: readonly IdeacadSharedDocument[]
): IdeacadSharedRow[] {
	return documents
		.map((document) => ({
			documentId: document.documentId,
			ownerEmail: document.ownerEmail,
			role: document.role,
			label: IDEACAD_ROLE_LABELS[document.role],
			note: IDEACAD_ROLE_NOTES[document.role],
			grantedAt: document.grantedAt,
			updatedAt: document.updatedAt,
			canWrite: ideacadCanWrite(document.role)
		}))
		.sort((a, b) => {
			const owner = ideacadNormalizeEmail(a.ownerEmail).localeCompare(
				ideacadNormalizeEmail(b.ownerEmail)
			);
			return owner !== 0 ? owner : a.documentId.localeCompare(b.documentId);
		});
}

/**
 * THE EMPTY LIST IS A NORMAL STATE AND RENDERS NO PLACEHOLDER, which is the
 * same rule `ideacadSharingSummary` follows for a private document. Nobody
 * having shared anything with you is the DEFAULT, not a deficiency, so a
 * surface says nothing about it rather than labelling it "0 documents".
 *
 * NULL IS THE ANSWER, never an empty string: a caller rendering `{#if summary}`
 * then cannot accidentally put an empty line on screen.
 */
export function ideacadSharedSummary(rows: readonly IdeacadSharedRow[]): string | null {
	if (rows.length === 0) return null;
	const editable = rows.filter((row) => row.canWrite).length;
	const readOnly = rows.length - editable;
	const parts: string[] = [];
	if (editable > 0) parts.push(`${editable} you can edit`);
	if (readOnly > 0) parts.push(`${readOnly} to look at`);
	return `${rows.length === 1 ? '1 document' : `${rows.length} documents`} shared with you (${parts.join(', ')})`;
}

/** The heading a surface puts above the list. One spelling. */
export const IDEACAD_SHARED_HEADING = 'Shared with you';

/**
 * THERE IS NO `openLabel` FUNCTION AND THAT IS DELIBERATE.
 *
 * `PartsPanel`'s rule -- one primary control per row whose WORD IS THE STATE --
 * resolves here to something simpler than a lookup: a row that is not open
 * offers `Open`, and a row that IS open offers NO CONTROL AT ALL, because
 * re-opening the document already on screen is a press whose only outcome is
 * nothing happening. CLAUDE.md forbids offering one of those, and it says the
 * reason in words instead (the row carries an "Open now" mark). A helper that
 * answered 'Open' in both branches would be a function with one answer, which
 * reads like a decision and is not one.
 */

/**
 * Whether a row is the one currently on screen. Compared on the id, never on
 * the owner: one person can share two documents on one item.
 */
export function ideacadSharedIsOpen(row: IdeacadSharedRow, openDocumentId: string | null): boolean {
	return openDocumentId !== null && row.documentId === openDocumentId;
}

/**
 * THERE IS NO `IDEACAD_SHARED_VIEW_ONLY` CONSTANT, AND THERE WAS ONE UNTIL THE
 * PAGES WERE RASTERIZED AND LOOKED AT.
 *
 * The rule it existed for is real -- a row that cannot be edited and says
 * nothing about why reads as broken rather than as read-only -- but
 * `IDEACAD_ROLE_NOTES.viewer` ALREADY SAYS IT ('Shared with you to look at. You
 * cannot make changes.'), in `sharing.ts`, in the words the owner reads on the
 * same screen. So the constant was a second statement of one rule, and on screen
 * it was two sentences stacked one under the other saying the same thing in
 * different words. Every check passed: both were present, both cleared contrast,
 * and neither content check can see that a reader is being told twice.
 *
 * The row renders the ROLE NOTE and tags it when the role cannot write, so there
 * is one sentence, from one place, and the surface that says why is the same
 * surface that names the role.
 */

/**
 * The sentence a student reads when the document they had open is no longer
 * theirs to write -- the grant was removed while they were working in it.
 *
 * IT IS NOT `conflict`'s OWN SENTENCE, AND THAT IS THE POINT OF A SECOND
 * STRING. `store.ts` publishes 'This concept changed elsewhere. Your unsaved
 * work is still here.' for a stale revision, which on this path would be a lie:
 * nothing changed elsewhere, the access did. The PHASE is reused (see the
 * shared-open block in `store.ts`) because the consequence is identical --
 * terminal, no further write attempted, the local copy untouched -- and the
 * WORDS are its own because the cause is not.
 *
 * IT SAYS WHAT IS STILL TRUE FIRST. The work on screen is still there; what is
 * gone is the ability to save it here. A student who reads "access removed" and
 * nothing else assumes the screen is about to be taken away from them.
 */
export const IDEACAD_SHARED_ACCESS_LOST =
	'You no longer have access to this document, so nothing more can be saved to it. What is on screen is still here. Ask the owner to share it again.';

/**
 * The sentence for a deployment with no `0205`.
 *
 * THE LADDER RULE. Migrations are applied by hand, so a tree sitting between
 * `0204` and `0205` is a real state: `ideacad_shared_with_me` does not exist,
 * PostgREST answers `PGRST202`, and the honest thing is to render no list at
 * all and say why -- never to report "nothing is shared with you" for a
 * question this deployment could not ask. "Cannot tell" must never render as
 * the confident answer.
 */
export const IDEACAD_SHARED_UNAVAILABLE =
	'Opening a document a classmate shared with you is not switched on for this site yet. Your own work is unaffected.';

/**
 * What a surface knows about the shared list. `ready` starts FALSE and is
 * turned on only by a read that actually landed, which is `notesReady`'s shape
 * from the notebook and `sharingReady`'s from `sharing.ts`.
 */
export interface IdeacadSharedCapability {
	ready: boolean;
	reason: string | null;
}

export function ideacadSharedOff(): IdeacadSharedCapability {
	return { ready: false, reason: IDEACAD_SHARED_UNAVAILABLE };
}

export function ideacadSharedOn(): IdeacadSharedCapability {
	return { ready: true, reason: null };
}
