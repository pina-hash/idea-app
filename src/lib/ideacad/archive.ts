/**
 * The IdeaCAD document ARCHIVE: the pure, client-safe layer.
 *
 * Mr. Pina's decision 29, answered 2026-09-13. When a document's owner leaves a
 * section the document AND ALL ITS WORK IS ARCHIVED, NOT DELETED, and stays
 * reachable by the instructor; an instructor who shares an archived document
 * with a class gives those students access to it too. His reason is the design
 * constraint: he regularly brings up past student work to show current students
 * as reference, and work from students who have since left is exactly what he
 * wants to be able to show.
 * `docs/decisions/entries/29-ideacad-owner-leaves-a-section.md` is the record
 * and `supabase/migrations/0214_ideacad_document_archive.sql` is the data layer.
 *
 * NO SVELTE, NO TRANSPORT, NO CLIENT IN HERE, exactly as `sharing.ts` is built:
 * plain data plus the arithmetic, so every rule below is assertable without a
 * browser and without a database.
 *
 * IT IS NOT THE AUTHORIZATION BOUNDARY. Every rule here mirrors one the
 * database enforces inside a SECURITY DEFINER RPC and exists so a surface can
 * decide what to RENDER. A control this module hides is a convenience; a call
 * the database refuses is the boundary. Do not add a rule here that 0214 does
 * not also enforce.
 */

/**
 * WHY A DOCUMENT IS IN THE ARCHIVE. Two populations, and a surface has to be
 * able to say which, because one is a decision somebody made and the other is a
 * fact about the roster that nobody chose.
 *
 * `archived`   somebody pressed Archive. `archivedAt` and `archivedBy` are set.
 * `offRoster`  the owner has no enrollment in any section the assignment is
 *              posted to, so `ideacad_roster` -- which drives off the
 *              enrollment -- cannot list it at all. Before 0214 these were in
 *              the table and on no surface anywhere.
 *
 * A row can be both. `archived` wins the label, because it is the deliberate
 * one. `ideacad_archive` decides that in SQL and this union is the mirror.
 */
export const IDEACAD_ARCHIVE_REASONS = ['archived', 'off_roster'] as const;

export type IdeacadArchiveReason = (typeof IDEACAD_ARCHIVE_REASONS)[number];

/** One class an archived document has been shared with. */
export interface IdeacadArchiveSectionShare {
	sectionId: string;
	label: string;
	grantedBy: string;
	grantedAt: string;
}

/** One row of `ideacad_archive`, as the RPC projects it. */
export interface IdeacadArchiveRow {
	documentId: string;
	ownerEmail: string;
	archivedAt: string | null;
	archivedBy: string | null;
	onRoster: boolean;
	reason: IdeacadArchiveReason;
	conceptCount: number;
	updatedAt: string;
	sharedWithSections: IdeacadArchiveSectionShare[];
}

/** A class the instructor could share an archived document with. */
export interface IdeacadArchiveSection {
	sectionId: string;
	label: string;
}

/**
 * The words, once, and each is a WORD rather than only a hue -- colour is never
 * the only signal.
 *
 * Every renderer is exhaustive over the union, so a third reason is a type
 * error rather than a blank chip.
 */
export const IDEACAD_ARCHIVE_REASON_LABELS: Record<IdeacadArchiveReason, string> = {
	archived: 'Archived',
	off_roster: 'Off roster'
};

/**
 * What each reason MEANS, in the instructor's terms. No table names, no
 * migration numbers: this is read by somebody deciding what to do about a row.
 */
export const IDEACAD_ARCHIVE_REASON_NOTES: Record<IdeacadArchiveReason, string> = {
	archived:
		'Kept on purpose as reference work. Nobody can change it, and it stays here after the student leaves.',
	off_roster:
		'The student who made this is no longer on the roster for this assignment, so it is not on the live class list. Archive it to keep it as reference work.'
};

/**
 * THE ONE SENTENCE A SURFACE MUST SHOW BEFORE SHARING WITH A CLASS, and it is
 * here rather than in the component for the reason `FoundryShare`'s is: a
 * student -- or here a whole class -- should know what is being handed over
 * before it is handed over, and a surface that quietly lost the sentence is one
 * where somebody shares something without knowing what is on it.
 *
 * IT NAMES THE ATTRIBUTION DELIBERATELY. 0214 projects the owner's address to
 * everyone the class grant reaches, which was a decision and not an oversight:
 * `ideacad_open_shared_document` returns the document row, so a redacted list
 * beside an unredacted open would read as a guarantee and not be one. The
 * honest answer is to say so here.
 */
export const IDEACAD_ARCHIVE_SHARE_NOTE =
	'Everyone in the class you pick can open this and see whose work it is. They can look at every concept in it and cannot change any of them. You can undo this at any time.';

/** Said where the archive is empty, so an empty list is never a blank panel. */
export const IDEACAD_ARCHIVE_EMPTY_NOTE =
	'Nothing is archived for this assignment yet. Work shows up here when you archive it, or when the student who made it is no longer on the roster.';

/**
 * Said where a control is absent because the deployment has no 0214.
 * "Cannot tell" must never render as the permissive answer, so the surface says
 * this instead of quietly drawing nothing.
 */
export const IDEACAD_ARCHIVE_UNAVAILABLE =
	'The archive is not available on this deployment yet.';

/**
 * MAY THIS DOCUMENT BE SHARED WITH A CLASS. 0214's narrowing (b), mirrored:
 * only an ARCHIVED document, never a live one. Sharing a live student's
 * in-progress work with a whole class is a disclosure nobody has decided, and
 * an off-roster document that has not been archived is still live work.
 *
 * A ROW WITH NO `archivedAt` IS THE OFF-ROSTER CASE and it answers false, which
 * is why this reads the STAMP rather than the reason: the two agree today, and
 * the stamp is the thing 0214 actually gates on.
 */
export function ideacadArchiveCanShare(row: Pick<IdeacadArchiveRow, 'archivedAt'>): boolean {
	return row.archivedAt !== null;
}

/**
 * The classes an archived document is not already shared with. A control whose
 * only possible outcome is a duplicate is not offered, and the section list is
 * the item's own postings -- 0214's narrowing (c).
 */
export function ideacadArchiveShareTargets(
	row: Pick<IdeacadArchiveRow, 'sharedWithSections'>,
	sections: readonly IdeacadArchiveSection[]
): IdeacadArchiveSection[] {
	const already = new Set(row.sharedWithSections.map((s) => s.sectionId));
	return sections.filter((s) => !already.has(s.sectionId));
}

/**
 * THE ORDER THE ARCHIVE READS IN, and it is not the order the RPC returns.
 *
 * `ideacad_archive` orders by owner address, which is a stable key and the
 * right one for a database. What an instructor is looking at is a list of
 * DECISIONS, so the rows that still need one come first: an off-roster document
 * nobody has archived is the row somebody has to act on, and a deliberately
 * archived one is settled. Within each group the address keeps the RPC's own
 * ordering, so two renders of one payload cannot disagree.
 *
 * IT IS A PURE FUNCTION OVER A COPY. Sorting the array the payload arrived in
 * would mutate a caller's state in place, which on a Svelte 5 surface is how a
 * list reorders itself under a reader between two unrelated renders.
 */
export function ideacadArchiveOrder(rows: readonly IdeacadArchiveRow[]): IdeacadArchiveRow[] {
	const rank = (r: IdeacadArchiveRow) => (r.reason === 'off_roster' ? 0 : 1);
	return [...rows].sort((a, b) => rank(a) - rank(b) || a.ownerEmail.localeCompare(b.ownerEmail));
}

/**
 * How many rows still need a decision. Rendered beside the heading, and ZERO IS
 * RENDERED rather than hidden -- an instructor who sees no number cannot tell
 * "nothing to do" from "the count did not load".
 */
export function ideacadArchiveUndecided(rows: readonly IdeacadArchiveRow[]): number {
	return rows.filter((r) => r.reason === 'off_roster').length;
}

/**
 * Read a reason off a payload, DROPPING anything the union does not name.
 *
 * A value no branch renders must not reach the UI, and "cannot tell" must never
 * read as the permissive answer -- the same rule `ideacadRoleFromPayload`
 * applies to a role. An unrecognised reason comes back null and the caller
 * drops the row rather than rendering a blank chip beside somebody's work.
 */
export function ideacadArchiveReasonFromPayload(value: unknown): IdeacadArchiveReason | null {
	return typeof value === 'string' &&
		(IDEACAD_ARCHIVE_REASONS as readonly string[]).includes(value)
		? (value as IdeacadArchiveReason)
		: null;
}
