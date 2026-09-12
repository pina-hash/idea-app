/**
 * IdeaCAD document sharing: the pure, client-safe layer.
 *
 * Mr. Pina's decision 24. A student's IdeaCAD document is PRIVATE BY DEFAULT;
 * the owner may share it with named classmates as view-only or as editor; a
 * teacher of record reads everything without being granted anything.
 * `docs/decisions/entries/24-ideacad-document-sharing.md` is the record and
 * `supabase/migrations/0205_ideacad_document_sharing.sql` is the data layer.
 *
 * NO SVELTE, NO TRANSPORT, NO CLIENT IN HERE. This is the plain-data registry
 * plus the arithmetic, so every rule below is assertable without a browser and
 * without a database, and the one place a surface asks "may this person do
 * this" is a pure function rather than an expression written twice.
 *
 * WHAT THIS MODULE IS NOT: it is not the authorization boundary. Every rule
 * here is a mirror of a rule the database enforces inside a SECURITY DEFINER
 * RPC, and it exists so a surface can decide what to RENDER. A control this
 * module hides is a convenience; a call the database refuses is the boundary.
 * Do not add a rule here that the migration does not also enforce -- a check
 * that lives only in the client is a check that is not there.
 */

/**
 * The two roles an owner can grant. `viewer` reads; `editor` reads and writes
 * every part of the document. Neither can re-share: only the owner grants, and
 * that is 0205's rule, not this module's.
 */
export const IDEACAD_GRANT_ROLES = ['viewer', 'editor'] as const;

export type IdeacadGrantRole = (typeof IDEACAD_GRANT_ROLES)[number];

/**
 * What the signed-in caller is to one document. `owner` and the two grant roles
 * come from the document and the grant table; `manager` is a teacher of record,
 * who holds no grant and never needs one.
 *
 * A THIRD GRANT ROLE WOULD BE A REAL DECISION, NOT A STRING. Every renderer
 * below is exhaustive over this union, so adding a member without its label and
 * its capabilities is a type error rather than a blank chip -- the same shape
 * the GAUNTLET rank states use.
 */
export type IdeacadDocumentRole = 'owner' | IdeacadGrantRole | 'manager';

/** One row of `ideacad_document_grants`, as the RPC projects it. */
export interface IdeacadGrant {
	granteeEmail: string;
	role: IdeacadGrantRole;
	grantedBy: string;
	grantedAt: string;
}

/** One row of `ideacad_shared_with_me`: somebody else's document, shared with me. */
export interface IdeacadSharedDocument {
	documentId: string;
	ownerEmail: string;
	role: IdeacadGrantRole;
	grantedAt: string;
	updatedAt: string;
}

/**
 * What a role can do. ONE table, so no surface re-derives it.
 *
 * `canShare` is false for every role but `owner`, INCLUDING `manager`. A
 * teacher reads everything and shares nothing: handing a student's work to
 * another student is a decision nobody has made, and 0205 refuses it.
 *
 * `canWrite` IS FALSE FOR `manager`, AND THAT IS A GAP RATHER THAN A RULE.
 * Decision 24 says Mr. Pina and Mr. Cosso see AND EDIT everything. 0201 gave
 * them read only, 0205 deliberately did not change it (a teacher has no
 * supported way to OPEN a student document to edit -- see the decision entry),
 * so this table records what the database actually does today. When teacher
 * edit ships, this is the line that moves, and the tests that pin it are the
 * ones to invert deliberately.
 */
const CAPABILITIES: Record<
	IdeacadDocumentRole,
	{ canRead: boolean; canWrite: boolean; canShare: boolean }
> = {
	owner: { canRead: true, canWrite: true, canShare: true },
	editor: { canRead: true, canWrite: true, canShare: false },
	viewer: { canRead: true, canWrite: false, canShare: false },
	manager: { canRead: true, canWrite: false, canShare: false }
};

export function ideacadCanRead(role: IdeacadDocumentRole | null): boolean {
	return role === null ? false : CAPABILITIES[role].canRead;
}

export function ideacadCanWrite(role: IdeacadDocumentRole | null): boolean {
	return role === null ? false : CAPABILITIES[role].canWrite;
}

export function ideacadCanShare(role: IdeacadDocumentRole | null): boolean {
	return role === null ? false : CAPABILITIES[role].canShare;
}

/**
 * The words, once. A word is always beside whatever glyph or hue a surface
 * chooses, because colour is never the only signal.
 */
export const IDEACAD_ROLE_LABELS: Record<IdeacadDocumentRole, string> = {
	owner: 'Owner',
	editor: 'Can edit',
	viewer: 'View only',
	manager: 'Instructor'
};

/**
 * What a surface tells somebody about a document that is not theirs. Said in
 * the student's terms, with no table or function names in it.
 */
export const IDEACAD_ROLE_NOTES: Record<IdeacadDocumentRole, string> = {
	owner: 'This is your document. You choose who else can see it.',
	editor: 'Shared with you. You can make changes, and the owner can undo the sharing.',
	viewer: 'Shared with you to look at. You cannot make changes.',
	manager: 'You are reading this as the instructor for this class.'
};

/**
 * The refusal a VIEWER reads, matching 0205's own sentence so the surface and
 * the database say the same thing.
 *
 * IT IS THE SAME STRING THE DATABASE RAISES, deliberately: a refusal is
 * rendered verbatim, and a client that re-tones the sentence is a second
 * wording of one rule. `tests/ideacad-sharing.test.ts` pins it against the
 * migration text.
 */
export const IDEACAD_VIEW_ONLY_REFUSAL = 'You have view-only access to this document.';

/** Normalize an address the way the database does, so one person is one grant. */
export function ideacadNormalizeEmail(value: string): string {
	return value.trim().toLowerCase();
}

/**
 * Whether an address is a plausible share target, BEFORE the round trip.
 *
 * THIS IS A COURTESY, NOT THE GATE, and the comment matters more than the
 * function: the database decides whether the address is on this item's roster,
 * and it is the only thing that can -- a browser cannot read the enrollment of
 * a class it is not in. So this refuses only what is obviously not an address
 * and the owner's own address, and every other refusal comes back from 0205
 * with its own sentence.
 */
export function ideacadShareTargetProblem(
	value: string,
	ownerEmail: string
): string | null {
	const target = ideacadNormalizeEmail(value);
	if (target === '') return 'Enter the school email address of the classmate you are sharing with.';
	if (!target.includes('@')) {
		return 'Enter the school email address of the classmate you are sharing with.';
	}
	if (target === ideacadNormalizeEmail(ownerEmail)) return 'This document is already yours.';
	return null;
}

/**
 * Apply a grant to a list the way 0205's upsert does: one row per person, the
 * role REPLACED rather than joined by a second row, and the list kept sorted by
 * address so two renders of one state cannot differ.
 *
 * It exists so a surface can show the result of a share without refetching, and
 * it is a mirror of the RPC's own `on conflict ... do update` rather than an
 * independent idea of what sharing means.
 */
export function ideacadApplyGrant(
	grants: readonly IdeacadGrant[],
	grant: IdeacadGrant
): IdeacadGrant[] {
	const email = ideacadNormalizeEmail(grant.granteeEmail);
	const next = grants.filter((g) => ideacadNormalizeEmail(g.granteeEmail) !== email);
	next.push({ ...grant, granteeEmail: email });
	return next.sort((a, b) => a.granteeEmail.localeCompare(b.granteeEmail));
}

/** Remove a grant from a list, matching on the normalized address. */
export function ideacadRemoveGrant(
	grants: readonly IdeacadGrant[],
	granteeEmail: string
): IdeacadGrant[] {
	const email = ideacadNormalizeEmail(granteeEmail);
	return grants.filter((g) => ideacadNormalizeEmail(g.granteeEmail) !== email);
}

/**
 * How a surface describes who a document is shared with, in words.
 *
 * NULL IS A NORMAL ANSWER AND RENDERS AS NOTHING -- no placeholder, no "shared
 * with 0 people". A private document is the default state, not a deficiency, so
 * a surface says nothing about it rather than labelling it.
 */
export function ideacadSharingSummary(grants: readonly IdeacadGrant[]): string | null {
	if (grants.length === 0) return null;
	const editors = grants.filter((g) => g.role === 'editor').length;
	const viewers = grants.length - editors;
	const parts: string[] = [];
	if (editors > 0) parts.push(`${editors} can edit`);
	if (viewers > 0) parts.push(`${viewers} can view`);
	return `Shared with ${grants.length === 1 ? '1 classmate' : `${grants.length} classmates`} (${parts.join(', ')})`;
}

/**
 * Whether this deployment has 0205 applied.
 *
 * THE LADDER RULE, one subsystem over. Migrations are applied by hand, so a
 * deployment sitting between 0204 and 0205 is a REAL state: the sharing RPCs do
 * not exist, PostgREST answers PGRST202, and the honest thing for a surface to
 * do is remove the share control and say so -- never to blank the editor, and
 * never to report "not shared" for a document whose sharing it could not ask
 * about. `sharingReady` starts FALSE and is turned on only by a call that
 * actually succeeded.
 */
export interface IdeacadSharingCapability {
	sharingReady: boolean;
	/** Set when the capability is off, so a surface can say WHY rather than just hiding. */
	reason: string | null;
}

export const IDEACAD_SHARING_UNAVAILABLE =
	'Sharing is not switched on for this site yet. Your work is saved as usual and only you and your instructors can see it.';

export function ideacadSharingOff(): IdeacadSharingCapability {
	return { sharingReady: false, reason: IDEACAD_SHARING_UNAVAILABLE };
}

export function ideacadSharingOn(): IdeacadSharingCapability {
	return { sharingReady: true, reason: null };
}

/**
 * Read a role off an `ideacad_open_shared_document` payload, DROPPING anything
 * outside the union rather than coercing it.
 *
 * Same rule a preference read follows: a value no branch renders must not reach
 * the UI. And "cannot tell" must never render as the permissive answer, so an
 * unrecognised role comes back null, which `ideacadCanWrite` answers false for.
 */
export function ideacadRoleFromPayload(value: unknown): IdeacadDocumentRole | null {
	return value === 'owner' || value === 'editor' || value === 'viewer' || value === 'manager'
		? value
		: null;
}
