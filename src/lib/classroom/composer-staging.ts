/**
 * WHAT THE COMPOSER DOES AFTER THE ITEM EXISTS, as plain functions.
 *
 * Everything that hangs off a classroom item is stored against its id, so the
 * item has to exist before any of it can be applied: files, instructor-only
 * files, a presentation deck and a spec are all STAGED in the form and written
 * once the create/update call hands an id back. That ordering is the whole
 * reason this is a two-phase save, and it is where every interesting failure
 * lives.
 *
 * IT IS OUT HERE, NOT IN THE COMPONENT, because the guarantees it carries are
 * the ones that fail SILENTLY. A retry that creates a second item looks exactly
 * like a retry that worked; a staged deck cleared after a failed upload looks
 * exactly like one that never existed. Neither shows up in a type check and
 * neither is visible in a screenshot, so both are asserted directly against
 * these functions.
 *
 * Pure apart from the transports it is handed: no Svelte, no Supabase, nothing
 * that decides who may write. Every call goes through a SECURITY DEFINER RPC
 * that re-checks the caller, exactly as it does from the component.
 */

import type { ClassroomItemKind } from '$lib/classroom/classroom';
import type { CheckInDraft } from '$lib/classroom/class-check-ins';
import { deckUploadSizeIssue, type DeckTransports, type DeckUploadProgress } from '$lib/classroom/deck';

/**
 * WHERE A SAVE SHOULD GO, and the reason this is a decision rather than an
 * `if`: getting it wrong posts a second copy of content that already exists.
 *
 * `createdItemId` is set only when a create SUCCEEDED and something staged
 * after it did not -- the state the failure message invites someone to "save
 * again" from. Without this that second save would run `createItem` again and
 * quietly post a duplicate, which is exactly what following the instruction
 * produced before it existed (found in the browser: one retry, two items).
 */
export type SaveTarget =
	| { action: 'update'; itemId: string }
	| { action: 'create' }
	| { action: 'refuse'; message: string };

export function saveTarget(args: {
	mode: 'create' | 'edit';
	itemId: string | null;
	createdItemId: string | null;
	targetIds: string[];
}): SaveTarget {
	if (args.mode === 'edit') {
		if (!args.itemId) return { action: 'refuse', message: 'Nothing to update.' };
		return { action: 'update', itemId: args.itemId };
	}
	// A retry after a partially-failed create: update what exists.
	if (args.createdItemId) return { action: 'update', itemId: args.createdItemId };
	if (args.targetIds.length === 0) {
		return { action: 'refuse', message: 'Pick at least one class to post to.' };
	}
	return { action: 'create' };
}

/**
 * WHICH SPEC A STAGED DOCUMENT IS, decided by the item's own kind.
 *
 * The two are genuinely different things written through different RPCs: an
 * ASSIGNMENT carries an interactive spec (modules, points, rubrics, a
 * preflight), a MATERIAL carries a reference document (sections, no points, no
 * submission). An announcement carries neither -- there is nothing on a post
 * for a spec to describe -- so it is offered none.
 */
export function stagedSpecKind(kind: ClassroomItemKind): 'assignment' | 'reference' | null {
	if (kind === 'assignment') return 'assignment';
	if (kind === 'material') return 'reference';
	return null;
}

/**
 * A DECK IS REFUSED AT STAGE TIME, not at save time.
 *
 * The cap is a platform one (a deck zip has to fit inside one serverless
 * request body), so an oversize zip is never going to reach the server however
 * long someone waits. Telling them while they are picking the file is the only
 * moment the answer is useful; telling them after they have filled out the rest
 * of the form and pressed Post is the moment it is most annoying.
 */
export function stagedDeckIssue(file: File): string | null {
	return deckUploadSizeIssue(file.size);
}

export interface StagedExtras {
	/** The zip, or null. */
	deck: File | null;
	/** The validated spec JSON, or null. */
	spec: unknown | null;
	/** Which setter the spec goes through; null means it is not applied at all. */
	specKind: 'assignment' | 'reference' | null;
	/**
	 * A NOTEBOOK CHECK-IN TO HANG OFF THIS ITEM (0120), or null.
	 *
	 * The THIRD staged attachable, and it follows the spec's pattern rather than
	 * the deck's on purpose: there are no bytes, so it is one RPC here -- no
	 * endpoint, no multipart parse, no staged upload job, no progress to report.
	 * What it shares with both is the two-phase shape, because the check-in
	 * hangs off an item id that does not exist until the create call returns.
	 */
	checkIn: CheckInDraft | null;
}

export interface StagedExtrasTransports {
	deck: DeckTransports | null;
	setSpec: ((itemId: string, spec: unknown) => Promise<{ ok: boolean; message?: string }>) | null;
	setReferenceSpec:
		| ((itemId: string, spec: unknown) => Promise<{ ok: boolean; message?: string }>)
		| null;
	/**
	 * Null where attaching one is not available: a project whose schema predates
	 * 0120, or a surface with no manage rights. Absence removes the control the
	 * same way it does for the other two.
	 */
	createCheckIn:
		| ((itemId: string, draft: CheckInDraft) => Promise<{ ok: boolean; message?: string }>)
		| null;
}

export interface StagedExtrasResult {
	/** One line per thing that did not land, named -- never a generic error. */
	failures: string[];
	/**
	 * WHAT IS STILL STAGED. Only what actually landed is cleared, so saving
	 * again retries the rest rather than asking a teacher to go and find the
	 * same file a second time. This mirrors what the attachment upload has
	 * always done and is the reason both are reported together.
	 */
	deck: File | null;
	spec: unknown | null;
	checkIn: CheckInDraft | null;
}

/**
 * Apply the staged deck, spec and check-in to an item that now exists.
 *
 * ALL THREE ARE ATTEMPTED even if the first fails: they are independent writes
 * against an item that already exists, and stopping at the first failure would
 * mean a teacher who staged two had to save three times to find out about the
 * second one. The deck goes first only because it is the long one, so its
 * progress is what the form reports while it runs.
 */
export async function applyStagedExtras(
	itemId: string,
	staged: StagedExtras,
	transports: StagedExtrasTransports,
	onDeckProgress?: (progress: DeckUploadProgress) => void
): Promise<StagedExtrasResult> {
	const failures: string[] = [];
	let deck = staged.deck;
	let spec = staged.spec;
	let checkIn = staged.checkIn;

	if (deck) {
		if (!transports.deck) {
			failures.push('presentation deck: uploading a deck is not available here');
		} else {
			const name = deck.name;
			let res: { ok: boolean; message?: string; cancelled?: boolean };
			try {
				res = await transports.deck.uploadDeck(itemId, deck, {
					onProgress: onDeckProgress
				});
			} catch (e) {
				res = { ok: false, message: (e as Error).message || 'Upload failed.' };
			}
			if (res.ok) {
				deck = null;
			} else {
				failures.push(
					`presentation deck "${name}": ${res.cancelled ? 'upload cancelled' : (res.message ?? 'upload failed')}`
				);
			}
		}
	}

	if (spec != null && staged.specKind) {
		const write =
			staged.specKind === 'reference' ? transports.setReferenceSpec : transports.setSpec;
		const noun = staged.specKind === 'reference' ? 'reference document' : 'interactive spec';
		if (!write) {
			failures.push(`${noun}: attaching one is not available here`);
		} else {
			let res: { ok: boolean; message?: string };
			try {
				res = await write(itemId, spec);
			} catch (e) {
				res = { ok: false, message: (e as Error).message || 'Save failed.' };
			}
			if (res.ok) {
				spec = null;
			} else {
				failures.push(`${noun}: ${res.message ?? 'could not be attached'}`);
			}
		}
	}

	/**
	 * THE CHECK-IN, last and cheapest: one RPC, no bytes, nothing to resume.
	 *
	 * It is named by its LABEL in a failure, not by "the check-in", because a
	 * teacher who staged one has typed that label and will recognise it -- the
	 * same reason the deck is named by its filename.
	 */
	if (checkIn) {
		if (!transports.createCheckIn) {
			failures.push('notebook check-in: attaching one is not available here');
		} else {
			let res: { ok: boolean; message?: string };
			try {
				res = await transports.createCheckIn(itemId, checkIn);
			} catch (e) {
				res = { ok: false, message: (e as Error).message || 'Save failed.' };
			}
			if (res.ok) {
				checkIn = null;
			} else {
				const name = checkIn.session_label.trim() || 'untitled';
				failures.push(`notebook check-in "${name}": ${res.message ?? 'could not be attached'}`);
			}
		}
	}

	return { failures, deck, spec, checkIn };
}

/**
 * DOES THE COMPOSER HOLD WORK SOMEBODY WOULD MIND LOSING?
 *
 * Read before anything discards it -- closing the composer, navigating out of
 * the class, or the browser unloading. Deliberately generous about what counts:
 * a staged file cannot be recovered from anywhere (the browser gave the form a
 * File handle, not a path), and neither can a body somebody has just written,
 * so the bar is "is there anything at all in here", not "is it substantial".
 *
 * The posting targets and the kind toggle are NOT work: both are seeded by the
 * pane the composer opened in, so a composer opened and left alone would
 * otherwise always report itself dirty and warn on every close.
 */
export interface ComposerDraft {
	title: string;
	/** The rich editor's own plain-text reading, so an empty document is empty. */
	bodyText: string;
	files: number;
	instructorFiles: number;
	links: { url: string }[];
	instructorLinks: { url: string }[];
	deck: File | null;
	spec: unknown | null;
	/** A staged notebook check-in (0120): typed work, so it counts. */
	checkIn: CheckInDraft | null;
}

export function composerHasWork(draft: ComposerDraft): boolean {
	if (draft.title.trim() !== '') return true;
	if (draft.bodyText.trim() !== '') return true;
	if (draft.files > 0 || draft.instructorFiles > 0) return true;
	if (draft.deck) return true;
	if (draft.spec != null) return true;
	if (draft.checkIn) return true;
	if (draft.links.some((r) => r.url.trim() !== '')) return true;
	if (draft.instructorLinks.some((r) => r.url.trim() !== '')) return true;
	return false;
}

/** The one wording, so the close confirm and the navigation confirm agree. */
export const COMPOSER_DISCARD_WARNING =
	'This post has unsaved work in it -- text, files, a deck, a spec or a check-in. Leave and it is gone.';
