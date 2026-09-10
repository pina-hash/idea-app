/**
 * THE PARENT'S ANSWER CONTROLLER FOR A PORTED HTML ASSIGNMENT.
 *
 * `bridge.ts` decides whether a message COUNTS. This decides what an accepted
 * one MEANS: which row it writes, when it writes it, what comes back down as
 * `idea:saved`, and what the whole worksheet opens on after a reload. It is the
 * half nothing else in the feature does -- a frame that is listened to and
 * never written for is an empty worksheet with a very careful gate in front of
 * it.
 *
 * NO DOM AND NO SUPABASE. Transports are injected, the clock and the sleep are
 * injectable, and every rule is a function that can be put to a value with no
 * browser in the room. The Svelte surface above holds the `$state`, mounts
 * `HtmlAssignmentFrame`, and hands each accepted message here.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT WRITES THROUGH, AND WHAT IT DELIBERATELY DOES NOT ADD
 * ---------------------------------------------------------------------------
 *
 * ONE CALL PER BLOCK INTO `classroom_save_response`, THROUGH THE ENGINE
 * TRANSPORT THAT ALREADY EXISTS. There is no second RPC caller here and no new
 * write path: `createEngineTransports(supabase).saveResponse` is the one
 * implementation, and this module is handed it. An answer to a ported document
 * is an ordinary `classroom_responses` row, which is the whole reason grading,
 * the Grades tab, extra credit and the FACTS export need no HTML branch at all.
 *
 * **MEASURED, AND IT IS THE FINDING THIS FILE EXISTS TO REPORT:
 * `classroom_save_response` CANNOT CURRENTLY WRITE AN ANSWER FOR A PORTED
 * DOCUMENT.** Its first statement reads `classroom_assignment_specs` for the
 * item and raises `This assignment has no interactive spec.` when there is
 * none, and then resolves the block id against THAT SPEC's modules. A ported
 * assignment carries a MANIFEST in `classroom_html_assignments` and no spec, so
 * every save raises. `classroom_add_submission_file` has the identical gate on
 * the `p_block_id` path, so a block-bound image upload raises too. Verified
 * against a real embedded Postgres with the real migration chain applied, in
 * `tests/db/html-assignment-round-trip.test.ts`, which prints the refusal.
 *
 * THAT IS A DATABASE GAP AND IT IS NOT CLOSED FROM HERE. The shape of the
 * repair is one branch in 0086's own function -- resolve the block against the
 * manifest when the item carries an HTML assignment, exactly as it resolves it
 * against the spec otherwise -- which is a migration, and a migration is
 * somebody's deliberate act rather than a side effect of a client lane. **Do
 * not answer it with a second write path here.** A private RPC for HTML
 * answers is a second definition of what an answer is, and 0195's own header
 * gives the reason that would be wrong: the feature is additive precisely
 * because nothing about an answer moves.
 *
 * ---------------------------------------------------------------------------
 * DEBOUNCED PER BLOCK, ON THE ONE SAVE STATE
 * ---------------------------------------------------------------------------
 *
 * One `SaveState` per BLOCK ID, not one for the surface. A student typing in
 * module 6 must not cancel module 1's pending write, and one machine over a
 * whole worksheet means exactly that: its single debounce timer is re-armed by
 * every keystroke anywhere, so the last field touched is the only one that ever
 * settles quickly and a coalesced run has to reconstruct which blocks still owe
 * a write. Per block, "the newest value for THIS block" is what the machine's
 * own `save()` reads, and last-write-wins is true by construction.
 *
 * IT IS `$lib/save-state.svelte.ts` AND NOT A SIXTH VARIANT. The 800ms
 * debounce, the backoff to 8s, the five attempts, the coalescing of an edit
 * that lands mid-write and the visibilitychange/pagehide net all come from
 * there. What this module adds is the map from block id to machine and the
 * translation of a `TxResult` into a `SaveOutcome`.
 *
 * ---------------------------------------------------------------------------
 * WHAT A DOCUMENT GETS BACK
 * ---------------------------------------------------------------------------
 *
 * `idea:saved` IS BUILT BY `hxSavedMessage` AND CARRIES `schemaVersion: 3`,
 * plus a `reason` whenever `ok` is false. A document can show a student a
 * sentence and cannot ask a follow-up question, so "not saved" with no reason
 * is the failure this repository already refuses to ship.
 *
 * A CONSIDERED REFUSAL IS ANSWERED ONCE AND REPORTED; ONLY A NAMED TRANSIENT IS
 * RETRIED. `$lib/pg-errors` is the partition and there is no second list here.
 * A structured `{ok:false, reason}` from the RPC -- a submitted assignment is
 * the one that happens -- is a decision about the payload and is never sent
 * again.
 *
 * **A SECOND MEASURED GAP, REPORTED RATHER THAN PAPERED OVER:
 * `createEngineTransports.saveResponse` DROPS THE SQLSTATE.** It funnels every
 * error through the file's shared `fail()` helper, which keeps `message` and
 * nothing else, so a deadlock and a considered refusal arrive here identical
 * and this module has to classify a code it was never handed. It follows
 * `pg-errors`' own rule for that case -- an ABSENT code is not a transient, so
 * an unclassified failure is reported once rather than retried five times --
 * and the one-line repair belongs in `fail()`, which is shared by ~50 call
 * sites in a file this lane may not restructure.
 *
 * ---------------------------------------------------------------------------
 * PICTURES
 * ---------------------------------------------------------------------------
 *
 * BYTES GO FRAME-TO-PARENT ONLY. An `idea:image` carries base64 up; it is
 * decoded to a `File` and handed to `uploadClassroomFile`'s `role: 'submission'`
 * path -- the SAME path `AssignmentEngine` uses, through the same transport --
 * so a photograph attached inside a ported document is a
 * `classroom_submission_files` row like every other hand-in, with one thing to
 * grade, one thing to export and one thing to delete. What goes back down is a
 * URL.
 *
 * **A THIRD MEASURED GAP: A RESTORED PICTURE CANNOT RENDER INSIDE THE
 * DOCUMENT AS THE TWO CONTRACTS CURRENTLY STAND.** `HxImageState.url` is a
 * same-origin proxy URL by the frozen contract's own wording, and the served
 * CSP is `img-src data: blob:` with no host on it -- so an `<img>` in the
 * document pointing at `/api/classroom/submission-file/<id>` is refused by the
 * policy, and would arrive credential-free at a route that needs a session even
 * if it were not. The URL is still produced here exactly as the contract
 * specifies, because that contract is frozen and this is not the file that
 * decides. The repair that needs NO weakening of the CSP is to render a
 * restored picture in PARENT CHROME beside the frame, which is where Submit
 * already lives; widening `img-src` is the one that does not work anyway.
 *
 * ---------------------------------------------------------------------------
 * SUBMIT IS THE PARENT'S, AND SO IS THE COMPLETENESS CHECK
 * ---------------------------------------------------------------------------
 *
 * `hxIncompleteBlocks` counts sentences in the STORED values against each
 * block's `minSentences` from the manifest the parent stored at import. It is a
 * pure function of a manifest and a value map, so it is assertable without a
 * browser, and it is the parent's because a check inside the document is a
 * check whose code the document's author wrote.
 *
 * IT REUSES `countSentences`, WHICH IS THE ONE IMPLEMENTATION and is mirrored
 * in SQL by `_classroom_sentence_count`. A second counter here would disagree
 * with the server's own submit preflight over an abbreviation or a decimal
 * point, silently, in a student's favour or against it.
 */

import {
	countSentences,
	submissionFileSrc,
	type AssignmentEngineTransports,
	type ResponseValue,
	type SubmissionFileRow
} from '$lib/classroom/assignment-spec';
import type { TxResult } from '$lib/classroom/classroom';
import { isTransientSqlstate } from '$lib/pg-errors';
import { SaveState, type SaveOutcome, type SaveStateOptions } from '$lib/save-state.svelte';
import {
	hxSavedMessage,
	hxStateMessage,
	type HxImageState,
	type HxParentMessage
} from './bridge';
import {
	fieldBlockMap,
	manifestBlocks,
	type HtmlAssignmentManifest,
	type HtmlBlock
} from './manifest';

/**
 * WHAT ONE ANSWER MAY WEIGH, AND IT IS THE DATABASE'S NUMBER.
 * `classroom_save_response` raises above `pg_column_size(p_value) > 100000`, so
 * a client cap looser than that is a refusal a student only meets after the
 * round trip. Stated beside the size in the refusal, because "too large" with
 * no number is a guessing game.
 */
export const HX_MAX_ANSWER_BYTES = 100_000;

/**
 * THE TRANSPORTS THIS CONTROLLER NEEDS, AS A SUBSET OF THE ENGINE'S OWN.
 *
 * A `Pick` rather than a fresh interface, deliberately: it makes
 * `createEngineTransports(supabase)` satisfy this with no adapter and no second
 * spelling of any signature, and it makes an accidental second implementation a
 * type error rather than a review question.
 *
 * NULL REMOVES EVERY WRITE, down through the surface, exactly as an omitted
 * transport does everywhere else in this codebase. A read-only view of a ported
 * assignment -- graded, or somebody else's -- is then structural: there is no
 * write to execute rather than a flag saying not to.
 */
export type HxAnswerTransports = Pick<
	AssignmentEngineTransports,
	'saveResponse' | 'uploadSubmissionFile' | 'deleteSubmissionFile' | 'setFileCaption'
>;

/** The last acknowledgement, in the shape `HtmlAssignmentFrame` takes. */
export interface HxSavedAck {
	at: string;
	ok: boolean;
	reason?: string | null;
}

/**
 * THE REFUSALS A STUDENT READS INSIDE THE DOCUMENT.
 *
 * `locked` IS WORD FOR WORD THE SENTENCE `AssignmentEngine.svelte` SHOWS for
 * the same database answer, so a student who works in both kinds of assignment
 * reads one sentence rather than two. That component holds the twin as a
 * PRIVATE function inside itself (`refusalText`), so it cannot be imported
 * today; it is a MIGRATION CANDIDATE for the bundle that owns that file, not a
 * second sanctioned copy. `approval_pending` is not here because a manifest has
 * no approval gate to be pending on -- there is no branch to reach it.
 */
export const HX_REFUSALS = {
	locked: 'This is submitted, so edits are locked. Unsubmit to keep working.',
	readOnly: 'This assignment is not open for editing, so nothing was saved.',
	tooLarge: `That answer is longer than the ${HX_MAX_ANSWER_BYTES.toLocaleString('en-US')} character limit for one field, so it was not saved.`,
	fallback: 'That change was not saved. It is still on screen; try again.'
} as const;

// ---------------------------------------------------------------------------
// THE VALUE CODEC. Two types on the wire, one closed union in the column.
// ---------------------------------------------------------------------------

/**
 * A BRIDGE VALUE AS A `classroom_responses` VALUE.
 *
 * The bridge carries `string | boolean` and the column holds `ResponseValue`, a
 * closed union of `text` / `rows` / `checked`. A string is `text`; a boolean is
 * a ONE-ELEMENT `checked` array, which is the only member of that union that
 * carries a boolean at all and is what the grading console already reads for a
 * checklist. Written here once, in both directions, so a value cannot be stored
 * one way and read back another.
 *
 * A `radio`, a `table` cell and a `longText` are all strings on the wire and all
 * `text` in the column: the manifest's block TYPE says how the document renders
 * it, never how it is stored, and a per-type storage shape would be a second
 * vocabulary the grading console would have to learn.
 */
export function hxStoredValue(value: string | boolean): ResponseValue {
	return typeof value === 'boolean' ? { checked: [value] } : { text: value };
}

/**
 * The same mapping back, for a row read out of the database.
 *
 * NULL MEANS "NOTHING TO SEED", never `''` and never `false`: a document told a
 * checkbox is false is told something, and a stored row that carries neither
 * `text` nor `checked` is a row nobody has answered. The distinction is what
 * keeps an unanswered field out of `idea:state` entirely.
 */
export function hxBridgeValue(stored: ResponseValue | null | undefined): string | boolean | null {
	if (!stored || typeof stored !== 'object') return null;
	if (typeof stored.text === 'string') return stored.text;
	if (Array.isArray(stored.checked) && typeof stored.checked[0] === 'boolean') {
		return stored.checked[0];
	}
	return null;
}

// ---------------------------------------------------------------------------
// RESTORE. What the document opens on, from what the database holds.
// ---------------------------------------------------------------------------

/**
 * BLOCK ID BACK TO FIELD -- the direction `fieldBlockMap` does not run.
 *
 * `idea:state` is keyed by FIELD, because the document knows its own field
 * names and has never been told a block id; the rows are keyed by block id,
 * because that is the permanent join key. So the restore needs the inverse of
 * the map the write path uses, built from the SAME manifest, which is what
 * keeps the two directions from disagreeing about a renamed field.
 */
export function hxBlockFieldMap(manifest: HtmlAssignmentManifest): Map<string, string> {
	const map = new Map<string, string>();
	for (const b of manifestBlocks(manifest)) {
		if (!map.has(b.id)) map.set(b.id, b.field);
	}
	return map;
}

/** One response row, as the read path returns it. */
export interface HxResponseRow {
	block_id: string;
	value: ResponseValue | null;
}

/**
 * THE `values` HALF OF `idea:state`, FROM STORED ROWS.
 *
 * A row whose block the manifest no longer declares is DROPPED, not guessed at
 * -- that is a block id that used to exist, and the document has no field to
 * put it in. A row with an empty value is dropped for the reason above. Both
 * are ordinary states rather than errors: a re-uploaded document whose author
 * removed a module leaves exactly these rows behind, and the answers stay in
 * the table for the grading console to show.
 */
export function hxValuesFromResponses(
	manifest: HtmlAssignmentManifest,
	rows: readonly HxResponseRow[]
): Record<string, string | boolean> {
	const fieldOf = hxBlockFieldMap(manifest);
	const values: Record<string, string | boolean> = {};
	for (const row of rows) {
		const field = fieldOf.get(row.block_id);
		if (field === undefined) continue;
		const value = hxBridgeValue(row.value);
		if (value === null) continue;
		values[field] = value;
	}
	return values;
}

/**
 * THE `images` HALF, FROM HAND-IN FILE ROWS.
 *
 * ONE PICTURE PER FIELD, AND IT IS THE NEWEST. `HxImageState` is a single
 * image, so a block carrying two rows -- which is what replacing a photograph
 * without removing the old one leaves -- has to resolve to one, and the newest
 * is the one the student just took. `sort_order` is the database's own
 * append counter (`max(sort_order) + 1` per submission), so the highest is the
 * latest; ties fall back to the row order the read returned.
 *
 * A FILE WITH NO `block_id` IS NOT A DOCUMENT IMAGE and is skipped: that is a
 * plain hand-in attached beside the assignment, which belongs in parent chrome
 * and not in a field the document owns.
 */
export function hxImagesFromFiles(
	manifest: HtmlAssignmentManifest,
	files: readonly SubmissionFileRow[]
): Record<string, HxImageState> {
	const fieldOf = hxBlockFieldMap(manifest);
	const best = new Map<string, SubmissionFileRow>();
	for (const file of files) {
		if (!file.block_id) continue;
		const field = fieldOf.get(file.block_id);
		if (field === undefined) continue;
		const held = best.get(field);
		if (held && (held.sort_order ?? 0) > (file.sort_order ?? 0)) continue;
		best.set(field, file);
	}
	const images: Record<string, HxImageState> = {};
	for (const [field, file] of best) {
		images[field] = {
			url: submissionFileSrc(file.id),
			name: file.filename,
			caption: file.caption ?? ''
		};
	}
	return images;
}

/** The file id currently standing for one field, so a remove or a caption edit
    names a row rather than re-deriving one. */
export function hxFileIdsByField(
	manifest: HtmlAssignmentManifest,
	files: readonly SubmissionFileRow[]
): Map<string, string> {
	const fieldOf = hxBlockFieldMap(manifest);
	const ids = new Map<string, string>();
	const order = new Map<string, number>();
	for (const file of files) {
		if (!file.block_id) continue;
		const field = fieldOf.get(file.block_id);
		if (field === undefined) continue;
		const rank = file.sort_order ?? 0;
		if (ids.has(field) && (order.get(field) ?? 0) > rank) continue;
		ids.set(field, file.id);
		order.set(field, rank);
	}
	return ids;
}

// ---------------------------------------------------------------------------
// COMPLETENESS. The parent's own gate on Submit.
// ---------------------------------------------------------------------------

/** One block that is not finished, with the numbers a student needs. */
export interface HxIncompleteBlock {
	blockId: string;
	field: string;
	/** The module the block sits in, or null for a header identity field. */
	moduleId: string | null;
	moduleTitle: string | null;
	need: number;
	have: number;
}

/**
 * EVERY BLOCK SHORT OF ITS OWN `minSentences`, IN MANIFEST ORDER.
 *
 * ONLY `minSentences` IS CHECKED, AND THE OMISSIONS ARE THE POINT. An
 * `HtmlBlock` declares an id, a field, a type and `minSentences` -- there is no
 * `minImages`, no `minRows` and no required flag in the manifest schema, so
 * there is nothing else to check and inventing a rule here would be this file
 * deciding what a document requires. A block with no `minSentences`, or with
 * zero, carries no requirement: absence is the mechanism.
 *
 * A BOOLEAN VALUE COUNTS AS ZERO SENTENCES rather than throwing: a checkbox
 * cannot carry `minSentences` sensibly, and a manifest that puts one there is
 * asking a question the value cannot answer. It reads as unfinished, which is
 * visible, rather than as complete, which is not.
 */
export function hxIncompleteBlocks(
	manifest: HtmlAssignmentManifest,
	values: Readonly<Record<string, string | boolean>>
): HxIncompleteBlock[] {
	const out: HxIncompleteBlock[] = [];
	const consider = (block: HtmlBlock, moduleId: string | null, moduleTitle: string | null) => {
		const need = block.minSentences ?? 0;
		if (need <= 0) return;
		const value = values[block.field];
		const have = typeof value === 'string' ? countSentences(value) : 0;
		if (have >= need) return;
		out.push({ blockId: block.id, field: block.field, moduleId, moduleTitle, need, have });
	};
	for (const block of manifest.header ?? []) consider(block, null, null);
	for (const mod of manifest.modules ?? []) {
		for (const block of mod.blocks ?? []) consider(block, mod.id, mod.title);
	}
	return out;
}

/**
 * THE ONE SENTENCE A STUDENT READS WHEN SUBMIT IS NOT AVAILABLE, or null when
 * it is.
 *
 * It names the count and the first module rather than listing everything: the
 * blocks themselves are on screen, and a refusal that reprints the whole
 * worksheet is one nobody reads. Null is the "may submit" answer, so a caller
 * cannot render a refusal and offer the control at the same time -- one
 * predicate drives both, which is what stops a control that does nothing.
 */
export function hxSubmitRefusal(incomplete: readonly HxIncompleteBlock[]): string | null {
	if (incomplete.length === 0) return null;
	const first = incomplete[0];
	const where = first.moduleTitle ? `, starting in "${first.moduleTitle}"` : '';
	const n = incomplete.length;
	return `${n} ${n === 1 ? 'answer is' : 'answers are'} still short of the sentences asked for${where}. Finish those and the assignment can be turned in.`;
}

// ---------------------------------------------------------------------------
// THE OUTCOME CODEC. A transport result as something SaveState understands.
// ---------------------------------------------------------------------------

/** What the RPC answers inside a successful call: `{ok:false, reason}` is a
    considered refusal and `ok:true` is the write landing. */
export interface HxOpResult {
	ok?: boolean;
	reason?: string;
}

/**
 * A `TxResult` AS A `SaveOutcome`, WHICH IS THE WHOLE OF THE RETRY DECISION.
 *
 * THREE OUTCOMES, NOT TWO, and conflating the middle one is the defect this
 * shape exists to prevent:
 *
 *   1. the call landed and the RPC said yes            -> ok
 *   2. the call landed and the RPC said NO, with a
 *      reason it had considered                        -> failed, never retried
 *   3. the call did not land                           -> retryable ONLY if the
 *                                                         failure is a named
 *                                                         transient
 *
 * (2) arrives as `ok: true` on the transport, because the route and the RPC are
 * both working perfectly -- a submitted assignment is not an error. Retrying it
 * is how a UI asks the same question five times over twelve seconds.
 *
 * (3) LEANS ON `$lib/pg-errors` AND ON NOTHING ELSE. `retryable` set by the
 * transport is believed; a SQLSTATE, where one survives, is put to
 * `isTransientSqlstate`; an ABSENT code is NOT a transient, which is that
 * module's own stated rule for this exact case.
 */
export function hxSaveOutcome(
	res: TxResult<HxOpResult> & { code?: string | null },
	fallback: string = HX_REFUSALS.fallback
): SaveOutcome {
	if (res.ok) {
		const answered = res.data;
		if (answered && answered.ok === false) {
			const reason = answered.reason === 'locked' ? HX_REFUSALS.locked : fallback;
			return { ok: false, retryable: false, message: reason };
		}
		return { ok: true };
	}
	const retryable = res.retryable === true || isTransientSqlstate(res.code);
	return { ok: false, retryable, message: res.message || fallback };
}

// ---------------------------------------------------------------------------
// THE CONTROLLER.
// ---------------------------------------------------------------------------

export interface HxAnswersOptions {
	itemId: string;
	/** The manifest the parent STORED AT IMPORT. Never one the frame sent. */
	manifest: HtmlAssignmentManifest;
	/** Null makes every write structurally absent. */
	transports: HxAnswerTransports | null;
	/** What the database already holds, keyed by FIELD. */
	values?: Record<string, string | boolean>;
	images?: Record<string, HxImageState>;
	/** The file id standing for each field, so a remove names a row. */
	fileIds?: Map<string, string>;
	/** Injectable, so a test asserts the stamp and the curve rather than waiting. */
	now?: () => number;
	wait?: (ms: number) => Promise<void>;
	debounceMs?: number;
	/** Emitted whenever the controller's own copy of the answers moves. The
	    surface holds the `$state`; this module holds none. */
	onvalues?: (values: Record<string, string | boolean>) => void;
	onimages?: (images: Record<string, HxImageState>) => void;
	/** Every settled write, success or failure. What goes down as `idea:saved`. */
	onsaved?: (ack: HxSavedAck) => void;
}

/**
 * THE ANSWER CONTROLLER. One per mounted assignment.
 *
 * It owns: the current value of every field, the picture standing for every
 * image field, one `SaveState` per block, and the last acknowledgement. It owns
 * no DOM, no reactivity and no client.
 */
export class HxAnswers {
	readonly #opts: HxAnswersOptions;
	readonly #fieldToBlock: Map<string, string>;
	readonly #machines = new Map<string, SaveState>();
	#values: Record<string, string | boolean>;
	#images: Record<string, HxImageState>;
	#fileIds: Map<string, string>;
	#ack: HxSavedAck | null = null;

	constructor(options: HxAnswersOptions) {
		this.#opts = options;
		this.#fieldToBlock = fieldBlockMap(options.manifest);
		this.#values = { ...(options.values ?? {}) };
		this.#images = { ...(options.images ?? {}) };
		this.#fileIds = new Map(options.fileIds ?? []);
	}

	/** The map `HtmlAssignmentFrame` is handed. Built from the stored manifest,
	    which is the whole reason a frame naming a block id gets nowhere. */
	get fieldToBlockId(): Record<string, string> {
		return Object.fromEntries(this.#fieldToBlock);
	}

	get values(): Readonly<Record<string, string | boolean>> {
		return this.#values;
	}

	get images(): Readonly<Record<string, HxImageState>> {
		return this.#images;
	}

	get saved(): HxSavedAck | null {
		return this.#ack;
	}

	/** True while any block still owes the server a write. What a navigation
	    guard reads: `writing` and `failed` both count, per the save state's own
	    definition of dirty. */
	get dirty(): boolean {
		for (const machine of this.#machines.values()) if (machine.dirty) return true;
		return false;
	}

	/** Which blocks are short of their `minSentences`, from what is stored now. */
	get incomplete(): HxIncompleteBlock[] {
		return hxIncompleteBlocks(this.#opts.manifest, this.#values);
	}

	/** Null when the assignment may be turned in. One predicate, two readers. */
	get submitRefusal(): string | null {
		return hxSubmitRefusal(this.incomplete);
	}

	/** The whole `idea:state` message, built by the bridge so this cannot invent
	    a fourth shape. `readOnly` is derived from the ABSENCE of transports. */
	stateMessage(): HxParentMessage {
		return hxStateMessage({ ...this.#values }, { ...this.#images }, this.#opts.transports === null);
	}

	/** The acknowledgement in the shape the bridge sends it, or null. */
	savedMessage(): HxParentMessage | null {
		if (!this.#ack) return null;
		return hxSavedMessage(this.#ack.at, this.#ack.ok, this.#ack.reason ?? null);
	}

	/**
	 * AN ACCEPTED `idea:change`. The `blockId` is the PARENT'S resolution of the
	 * frame's field -- `hxReceive` did it, through the stored manifest -- and
	 * nothing downstream of here ever reads a block id off a frame payload.
	 */
	change(message: { blockId: string; field: string; value: string | boolean }): void {
		if (!this.#opts.transports) {
			// The frame was told `readOnly`, so a change arriving means the
			// document ignored it. Record nothing (there is nothing that could
			// save it) and say why: a refusal names its gate, and a document that
			// keeps text nobody will store is the silent failure.
			this.#settle(false, HX_REFUSALS.readOnly);
			return;
		}
		if (typeof message.value === 'string' && message.value.length > HX_MAX_ANSWER_BYTES) {
			// Refused BEFORE the request, with the limit stated: the database
			// raises above the same number and a client cap looser than the
			// server's is a refusal met only after the round trip.
			this.#settle(false, HX_REFUSALS.tooLarge);
			return;
		}
		this.#values = { ...this.#values, [message.field]: message.value };
		this.#opts.onvalues?.(this.#values);
		this.#machine(message.blockId, message.field).markDirty();
	}

	/**
	 * AN ACCEPTED `idea:image`. Base64 up, a `File` into the ordinary submission
	 * path, a URL back down. Not debounced: an upload is a deliberate act rather
	 * than a keystroke, and coalescing two of them would drop a photograph.
	 */
	async image(message: {
		blockId: string;
		field: string;
		name: string;
		bytes: string;
	}): Promise<void> {
		const transports = this.#opts.transports;
		if (!transports) return this.#settle(false, HX_REFUSALS.readOnly);
		let file: File;
		try {
			file = hxFileFromBase64(message.bytes, message.name);
		} catch {
			return this.#settle(false, 'That picture could not be read, so it was not attached.');
		}
		const res = await transports.uploadSubmissionFile(
			this.#opts.itemId,
			file,
			message.blockId,
			this.#images[message.field]?.caption ?? null
		);
		if (!res.ok) return this.#settle(false, res.message || HX_REFUSALS.fallback);
		const row = res.data.file;
		if (!row) {
			// The upload landed but the row did not come back, so there is
			// nothing to name in `idea:state`. Reported rather than treated as a
			// success: a picture the document cannot show after a reload is the
			// failure that reads as an upload that never worked.
			return this.#settle(false, 'That picture was uploaded but could not be attached to this field.');
		}
		this.#images = {
			...this.#images,
			[message.field]: {
				url: submissionFileSrc(row.id),
				name: row.filename ?? message.name,
				caption: row.caption ?? ''
			}
		};
		this.#fileIds.set(message.field, row.id);
		this.#opts.onimages?.(this.#images);
		this.#settle(true, null);
	}

	/** An accepted `idea:image-remove`. A real delete, of the row standing for
	    this field. */
	async imageRemove(message: { blockId: string; field: string }): Promise<void> {
		const transports = this.#opts.transports;
		if (!transports) return this.#settle(false, HX_REFUSALS.readOnly);
		const fileId = this.#fileIds.get(message.field);
		// NOTHING TO REMOVE IS NOT A FAILURE. A document asking twice, or asking
		// about a field whose picture another tab already removed, has got what
		// it wanted; the acknowledgement says so rather than inventing an error.
		if (!fileId) {
			this.#dropImage(message.field);
			return this.#settle(true, null);
		}
		const res = await transports.deleteSubmissionFile(fileId);
		if (!res.ok) return this.#settle(false, res.message || 'That picture could not be removed.');
		this.#dropImage(message.field);
		this.#settle(true, null);
	}

	/** An accepted `idea:image-caption`. The caption is the student's own words
	    and is stored beside the file, never in the filename. */
	async imageCaption(message: {
		blockId: string;
		field: string;
		caption: string;
	}): Promise<void> {
		const transports = this.#opts.transports;
		if (!transports) return this.#settle(false, HX_REFUSALS.readOnly);
		const fileId = this.#fileIds.get(message.field);
		if (!fileId) {
			return this.#settle(false, 'There is no picture on this field to caption.');
		}
		const res = await transports.setFileCaption(fileId, message.caption);
		if (!res.ok) return this.#settle(false, res.message || 'That caption could not be saved.');
		const held = this.#images[message.field];
		if (held) {
			this.#images = { ...this.#images, [message.field]: { ...held, caption: message.caption } };
			this.#opts.onimages?.(this.#images);
		}
		this.#settle(true, null);
	}

	/**
	 * Write everything still owed, now, and wait for it to settle. What a
	 * navigation guard flushes and what Submit calls before it asks the server:
	 * the correct answer to "you have unsaved work" is "then save it".
	 */
	async flush(): Promise<void> {
		await Promise.all([...this.#machines.values()].map((m) => m.saveNow()));
	}

	/** Every machine's listeners and timers down. Returned teardown shape, so a
	    surface can hand it straight back from an `$effect`. */
	destroy(): void {
		for (const machine of this.#machines.values()) machine.destroy();
		this.#machines.clear();
	}

	#dropImage(field: string): void {
		const next = { ...this.#images };
		delete next[field];
		this.#images = next;
		this.#fileIds.delete(field);
		this.#opts.onimages?.(this.#images);
	}

	/**
	 * ONE MACHINE PER BLOCK, MADE ON FIRST USE.
	 *
	 * `save()` reads the CURRENT value for the field rather than closing over
	 * the one that armed the debounce: every attempt calls it again, and
	 * last-write-wins is only true if the newest value is what goes out.
	 */
	#machine(blockId: string, field: string): SaveState {
		const held = this.#machines.get(blockId);
		if (held) return held;
		// THE INJECTABLES ARE ADDED ONLY WHEN THEY WERE SUPPLIED, AND THAT IS NOT
		// tidiness. `SaveState`'s constructor spreads the caller's options OVER
		// its own defaults, so a key present with the value `undefined` REPLACES
		// the default rather than falling through to it -- `now: undefined`
		// leaves the machine with no clock and throws on the first
		// acknowledgement. A key that is absent is the only thing that inherits.
		const options: SaveStateOptions = {
			debounceMs: this.#opts.debounceMs ?? 800,
			fallbackMessage: HX_REFUSALS.fallback,
			save: async () => {
				const transports = this.#opts.transports;
				if (!transports) {
					return { ok: false, retryable: false, message: HX_REFUSALS.readOnly };
				}
				const value = this.#values[field];
				if (value === undefined) return { ok: true };
				const res = await transports.saveResponse(
					this.#opts.itemId,
					blockId,
					hxStoredValue(value)
				);
				const outcome = hxSaveOutcome(res as TxResult<HxOpResult> & { code?: string | null });
				// STATED ON EVERY SETTLED ATTEMPT, not only on the last one: a
				// document showing "saving" forever because a retry is in flight
				// is a student watching nothing happen. A retryable failure
				// reports too, and the next attempt reports again.
				this.#settle(outcome.ok, outcome.ok ? null : outcome.message);
				return outcome;
			}
		};
		if (this.#opts.now) options.now = this.#opts.now;
		if (this.#opts.wait) options.wait = this.#opts.wait;
		const made = new SaveState(options);
		this.#machines.set(blockId, made);
		return made;
	}

	/** Record an acknowledgement and hand it up. The clock is the injected one,
	    so a test asserts the stamp rather than the format. */
	#settle(ok: boolean, reason: string | null): void {
		const at = new Date(this.#opts.now?.() ?? Date.now()).toISOString();
		this.#ack = ok ? { at, ok: true } : { at, ok: false, reason };
		this.#opts.onsaved?.(this.#ack);
	}
}

/**
 * BASE64 FROM THE BRIDGE AS A `File` FOR THE UPLOAD PATH.
 *
 * The document cannot upload anything itself -- an opaque origin has no
 * credentialed fetch and `connect-src 'none'` refuses an uncredentialed one --
 * so the bytes come up as a string and the parent is what puts them through
 * `uploadClassroomFile`. A data-URL prefix is tolerated because that is what
 * `FileReader.readAsDataURL` produces and it is the obvious thing for a ported
 * document to send.
 *
 * `CLASSROOM_UPLOAD_CONTENT_TYPE` IS NOT SET HERE AND MUST NOT BE. The upload
 * path never reads `File.type` -- the stored object is `application/octet-stream`
 * by the record route's own hand, deliberately, so nothing ever branches on a
 * type the uploader chose. Setting one here would be a value that is read by
 * nothing and believed by the next reader.
 */
export function hxFileFromBase64(bytes: string, name: string): File {
	const comma = bytes.startsWith('data:') ? bytes.indexOf(',') : -1;
	const raw = comma >= 0 ? bytes.slice(comma + 1) : bytes;
	const binary = atob(raw);
	const buffer = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) buffer[i] = binary.charCodeAt(i);
	const filename = name.trim() === '' ? 'photo' : name;
	return new File([buffer], filename);
}
