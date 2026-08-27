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
import type { RubricCriterion } from '$lib/classroom/assignment-spec';
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
	 *
	 * Since 0123 the draft also carries the GUIDANCE PROMPT, which is a SECOND
	 * write against the check-in's own id -- see `checkInSessionId` for why that
	 * makes the retry story load-bearing rather than incidental.
	 */
	checkIn: CheckInDraft | null;
	/**
	 * A CHECK-IN THIS SAVE ALREADY CREATED, whose guidance did not land.
	 *
	 * The exact shape of `saveTarget`'s `createdItemId`, one level down and for
	 * the same reason: a check-in and its prompt are two writes, so a save can
	 * half-land, and the failure message invites somebody to save again. Without
	 * this, that second save would call `createForItem` again and schedule a
	 * DUPLICATE check-in for the same day -- and unlike a duplicate item, a
	 * duplicate check-in puts a second column on every affected class's grid and
	 * asks thirty students for the same page twice.
	 *
	 * Null on a first attempt, which is every save that has not half-landed.
	 */
	checkInSessionId?: string | null;
	/**
	 * A RUBRIC STAGED AT CREATION (0139), or null.
	 *
	 * `classroom_set_rubric` requires the item to exist, exactly like the spec
	 * setters -- so this follows the SPEC's pattern (RubricBuilder's own staging
	 * mode, one full-set write, nothing to resume), never the deck's. Optional
	 * rather than required so every existing call site that predates it, here
	 * and in the tests, keeps compiling unchanged.
	 */
	rubric?: RubricCriterion[] | null;
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
		| ((
				itemId: string,
				draft: CheckInDraft
			) => Promise<{ ok: boolean; message?: string; sessionId?: string | null }>)
		| null;
	/**
	 * Write the guidance prompt on the check-in that was just created (0123).
	 *
	 * NULL IS A REAL STATE AND IT IS NOT A FAILURE: a deployment without 0123
	 * has no column to write, and a check-in still schedules perfectly well
	 * without a prompt. It is reported as a failure only when a prompt was
	 * actually staged, because that is the only case where something the author
	 * typed would otherwise disappear silently.
	 */
	setGuidance:
		| ((sessionId: string, doc: unknown) => Promise<{ ok: boolean; message?: string }>)
		| null;
	/**
	 * Write the staged rubric onto the item that now exists (0139).
	 *
	 * Optional and nullable: a rubric is assignment-only, so a material or an
	 * announcement never staged one, and this is simply absent for them --
	 * absence removes the control the same way it does for the other three.
	 */
	setRubric?:
		| ((itemId: string, criteria: RubricCriterion[] | null) => Promise<{ ok: boolean; message?: string }>)
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
	/**
	 * The check-in this run CREATED but could not finish writing. Carried back
	 * so the retry updates it instead of making a second one; null whenever
	 * there is nothing half-done.
	 */
	checkInSessionId: string | null;
	/** The rubric, if it did not land. */
	rubric: RubricCriterion[] | null;
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
	let checkInSessionId = staged.checkInSessionId ?? null;
	let rubric = staged.rubric ?? null;

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
	 * THE RUBRIC, on the same terms as the spec above it: one full-set write,
	 * nothing to resume, attempted independently of the check-in after it so a
	 * refusal here cannot swallow the check-in behind it.
	 */
	if (rubric != null) {
		if (!transports.setRubric) {
			failures.push('rubric: attaching one is not available here');
		} else {
			let res: { ok: boolean; message?: string };
			try {
				res = await transports.setRubric(itemId, rubric);
			} catch (e) {
				res = { ok: false, message: (e as Error).message || 'Save failed.' };
			}
			if (res.ok) {
				rubric = null;
			} else {
				failures.push(`rubric: ${res.message ?? 'could not be attached'}`);
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
		const name = checkIn.session_label.trim() || 'untitled';
		if (!transports.createCheckIn) {
			failures.push('notebook check-in: attaching one is not available here');
		} else {
			// A RETRY AFTER A HALF-LANDED SAVE DOES NOT CREATE A SECOND CHECK-IN.
			// `checkInSessionId` is set only when the create SUCCEEDED and the
			// guidance write did not, which is exactly the state the failure
			// message invites somebody to save again from.
			let created = checkInSessionId;
			if (!created) {
				let res: { ok: boolean; message?: string; sessionId?: string | null };
				try {
					res = await transports.createCheckIn(itemId, checkIn);
				} catch (e) {
					res = { ok: false, message: (e as Error).message || 'Save failed.' };
				}
				if (!res.ok) {
					failures.push(`notebook check-in "${name}": ${res.message ?? 'could not be attached'}`);
					return { failures, deck, spec, checkIn, checkInSessionId, rubric };
				}
				created = res.sessionId ?? null;
			}

			// THE PROMPT IS A SECOND WRITE, and it is the only reason this is not
			// a one-liner. It goes through the NARROW RPC against the check-in's
			// own id -- never a parameter on the upsert that created it, which is
			// a whole-row replace that also reconciles the section list.
			if (!checkIn.guidance) {
				checkIn = null;
				checkInSessionId = null;
			} else if (!transports.setGuidance || !created) {
				// The check-in landed. Only the prompt did not, and saying which is
				// the difference between "go and retype a paragraph" and "go and
				// schedule the whole thing again".
				checkInSessionId = created;
				failures.push(
					`notebook check-in "${name}": it was scheduled, but its guidance could not be ` +
						'written here -- this classroom is running an older database'
				);
			} else {
				let res: { ok: boolean; message?: string };
				try {
					res = await transports.setGuidance(created, checkIn.guidance);
				} catch (e) {
					res = { ok: false, message: (e as Error).message || 'Save failed.' };
				}
				if (res.ok) {
					checkIn = null;
					checkInSessionId = null;
				} else {
					checkInSessionId = created;
					failures.push(
						`notebook check-in "${name}": it was scheduled, but its guidance was not saved ` +
							`(${res.message ?? 'the write was refused'})`
					);
				}
			}
		}
	}

	return { failures, deck, spec, checkIn, checkInSessionId, rubric };
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
	/** A staged rubric (0139): typed work, so it counts. */
	rubric: RubricCriterion[] | null;
}

/**
 * THE DRAFT REDUCED TO WHAT A CHANGE TO IT WOULD MEAN.
 *
 * Two different questions are asked of a composer and BOTH are this same
 * comparison against a different reference, which is why there is one function
 * rather than two rules that can stop agreeing:
 *
 *   "is there work in here"   -> does this differ from an EMPTY draft
 *   "has this been edited"    -> does this differ from what it OPENED ON
 *
 * The second one is why the signature exists at all. `composerHasWork` was
 * doing double duty as the dirty signal, and a composer opened on an EXISTING
 * item is full of that item's own title and body from the first frame -- so it
 * reported dirty before anybody had typed, and the navigation guard asked
 * whether to discard work nobody had done. See `$lib/edit-baseline`.
 *
 * NORMALIZED THE WAY `composerHasWork` ALWAYS READ THE DRAFT, field for field:
 * text is trimmed, a link with no URL is not a link, and a staged deck, spec or
 * check-in counts as present rather than by its contents. Anything looser makes
 * the two answers disagree -- an empty link row a person added and did not fill
 * in would read as an edit while still not counting as work.
 */
export function composerDraftSignature(draft: ComposerDraft): string {
	const urls = (rows: { url: string }[]) =>
		rows.map((r) => r.url.trim()).filter((u) => u !== '');
	return JSON.stringify({
		title: draft.title.trim(),
		bodyText: draft.bodyText.trim(),
		files: draft.files,
		instructorFiles: draft.instructorFiles,
		links: urls(draft.links),
		instructorLinks: urls(draft.instructorLinks),
		deck: draft.deck ? 1 : 0,
		spec: draft.spec != null ? 1 : 0,
		checkIn: draft.checkIn ? 1 : 0,
		rubric: draft.rubric ? 1 : 0
	});
}

/** A draft holding nothing: the reference "is there work in here" asks against. */
export const EMPTY_COMPOSER_DRAFT: ComposerDraft = {
	title: '',
	bodyText: '',
	files: 0,
	instructorFiles: 0,
	links: [],
	instructorLinks: [],
	deck: null,
	spec: null,
	checkIn: null,
	rubric: null
};

export function composerHasWork(draft: ComposerDraft): boolean {
	return composerDraftSignature(draft) !== composerDraftSignature(EMPTY_COMPOSER_DRAFT);
}

/** The one wording, so the close confirm and the navigation confirm agree. */
export const COMPOSER_DISCARD_WARNING =
	'This post has unsaved work in it -- text, files, a deck, a spec, a rubric or a check-in. Leave and it is gone.';
