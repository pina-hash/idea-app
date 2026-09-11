/**
 * WHICH ENGINE AN ASSIGNMENT IS, DECIDED ONCE.
 *
 * WHY THIS IS A MODULE AND NOT `=== 3` WRITTEN OUT AT EACH MOUNT. An item is a
 * ported HTML document or it is a v1 spec, and every surface that renders an
 * assignment has to ask -- the student's item page, the manager's read-only
 * view, the grading console, the class stream. TWO SPELLINGS OF "IS THIS A
 * PORTED DOCUMENT" IS HOW A STUDENT GETS A WORKSHEET AND AN INSTRUCTOR GETS A
 * BLANK SPEC PANEL: the spec table has no row for a schema-3 item, so a surface
 * that answered "no" renders the v1 branch over nothing at all, and neither
 * `svelte-check` nor a test of either component notices. The failure is a
 * teacher looking at an empty card for the assignment they just uploaded.
 *
 * IT IS ALSO WHERE THE THIRD ANSWER LIVES, which is the one a bare comparison
 * cannot express. An item can BE schema 3 and still have no document to serve:
 * a deployment sitting short of 0195's table, an RLS read that returned
 * nothing, a row removed under a live item. `htmlAssignmentMount` returns that
 * as `unavailable` rather than folding it into either engine, because both
 * alternatives lie -- the v1 branch tells a student this assignment has no
 * online hand-in, and the frame branch has no `src` to point at.
 *
 * EVERYTHING HERE IS PURE AND TAKES `unknown`. It is the shape `itemLayoutOf`
 * uses for 0193's columns and for the same reason: these values arrive from a
 * select ladder that may not have been able to ask, from jsonb nothing has
 * re-validated, and from an environment variable that is routinely unset. None
 * of them may throw, and none of them may answer outside its union.
 */

import { fieldBlockMap, type HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
// The go-live condition is the classroom's, not this module's. A second
// spelling of it here would be a sentence that disagrees with the gate.
import { isScheduled } from '$lib/classroom/classroom';
import type { HxImageState } from '$lib/classroom/html-assignment/bridge';

/**
 * The value `classroom_items.assignment_schema_version` carries for a ported
 * document (0195). NULL and 1 are the v1 spec engine of 0086; the column's own CHECK constraint also admits schema 4 for IdeaCAD.
 */
export const HTML_ASSIGNMENT_SCHEMA_VERSION = 3;

/**
 * The version this read could see, or null for "could not tell".
 *
 * STRICTLY A NUMBER, so a string `'3'` answers null. Nothing in production can
 * produce one -- PostgREST hands an integer column back as a JS number -- so a
 * string arriving here means a value took some other path into the payload, and
 * the safe reading of an unexpected shape is the one that does not claim this
 * is a ported document. A stored value can never put the UI in a state no
 * branch renders.
 */
export function htmlAssignmentSchemaVersion(source: unknown): number | null {
	if (!source || typeof source !== 'object') return null;
	const raw = (source as Record<string, unknown>).assignment_schema_version;
	return typeof raw === 'number' && Number.isInteger(raw) ? raw : null;
}

/** THE predicate. False for a read that could not tell, which is what keeps
    "cannot say" from rendering as "this is a ported assignment". */
export function isHtmlAssignment(source: unknown): boolean {
	return htmlAssignmentSchemaVersion(source) === HTML_ASSIGNMENT_SCHEMA_VERSION;
}

/**
 * Attach the version a probe read onto an item, `withItemLayout`'s shape for
 * 0193's columns: `Object.assign` rather than a spread into a fresh literal, so
 * the caller keeps its `ClassroomItem` type and no excess-property check has to
 * be argued with. A value that is not an integer attaches NOTHING, so the item
 * stays honestly silent about a question this deployment could not answer.
 */
export function withHtmlAssignmentVersion<T extends object>(item: T, raw: unknown): T {
	if (typeof raw !== 'number' || !Number.isInteger(raw)) return item;
	return Object.assign(item, { assignment_schema_version: raw });
}

/**
 * What a load hands down for a ported assignment. The DOCUMENT COLUMN IS
 * DELIBERATELY NOT HERE: the bytes are served by `/hx/<document_id>` under the
 * sandbox CSP, and shipping them in a page payload would both double the
 * transfer and put an uploaded document inside the portal origin's own HTML,
 * which is the single thing the origin split exists to prevent.
 *
 * `manifest` is `unknown` on purpose. It is jsonb, validated at import by
 * `classroom_set_html_assignment` and re-validated by nothing since; typing it
 * as the parsed interface here would be this module asserting a fact it did not
 * check. `htmlFieldToBlockId` is what turns it into something safe to use.
 */
export interface HtmlAssignmentData {
	documentId: string;
	manifest: unknown;
	filename: string;
	updatedAt: string | null;
}

/** Which engine a surface should mount, and the third answer neither engine
    can express. */
export type HtmlAssignmentMount = 'html' | 'spec' | 'unavailable';

/**
 * THE ONE DECISION. `item` is whatever the surface holds (a row, a normalized
 * item, or nothing at all); `data` is what the load could read.
 *
 * Note that a read which could not answer the version question at all falls to
 * `spec`, and that is correct rather than a fallback: a deployment without 0195
 * has no schema-3 items in it, so the v1 engine is the only engine there is.
 */
export function htmlAssignmentMount(
	item: unknown,
	data: HtmlAssignmentData | null | undefined
): HtmlAssignmentMount {
	if (!isHtmlAssignment(item)) return 'spec';
	return data ? 'html' : 'unavailable';
}

/**
 * WHAT A READER IS TOLD WHEN THERE IS NOTHING TO MOUNT. A control absent for a
 * reason says the reason, which is the whole difference between a rule and a
 * defect: an assignment card with no work surface and no sentence reads as a
 * broken page. It names no table, no migration and no column, because it is
 * read by a student.
 */
export const HTML_ASSIGNMENT_UNAVAILABLE =
	'This assignment could not be opened. Nothing you have done is lost. Tell your teacher, and they can check the upload.';

/**
 * WHY THE FRAME IS EMPTY ON AN ITEM NOBODY CAN SEE YET, SAID IN WORDS.
 *
 * `/hx/<docId>` refuses a document whose item is unpublished or scheduled, with
 * a BODYLESS 404 -- deliberately, because the route answers on a host that
 * holds no session and every refusal there is indistinguishable from every
 * other one. That gate is correct and is not loosened by any of this.
 *
 * WHAT IT COSTS IS ON THIS SIDE: only a MANAGER can open an item that is not
 * live, so the only person who ever meets that 404 is the teacher, and what
 * they got was an empty box with nothing to explain it -- which reads as a
 * broken upload, on the surface where they were about to decide whether to
 * publish. A control absent for a reason says the reason.
 *
 * IT NAMES PUBLISHING AND NOT THE ROUTE, because the reader's next action is to
 * publish, not to debug a host gate.
 */
export const HTML_ASSIGNMENT_NOT_LIVE =
	'The worksheet is served only once this assignment is published, so there is nothing to show here yet. Publish it to see the document.';

/**
 * WHETHER `/hx/<docId>` WILL ANSWER FOR THIS ITEM, asked on the client with the
 * SAME CONDITION the server gate uses.
 *
 * `published`, and either no `publish_at` or one that has passed, which is
 * `_classroom_item_live` in SQL and `published && !isScheduled(...)` in
 * `$lib/server/html-assignment-document.ts`. It is DISPLAY ONLY, exactly as
 * `isScheduled` is: what is actually served is decided by the route at the
 * moment of the request, so a page left open past a go-live moment can be wrong
 * about a sentence and never about access.
 *
 * A READ THAT COULD NOT SELECT `publish_at` READS AS LIVE, which is `isScheduled`'s
 * own rule and is what an item authored before scheduling existed is. The cost
 * of being wrong that way is one sentence not shown; the cost of the other way
 * is a sentence claiming an item is unpublished when it is live.
 */
export function htmlAssignmentServed(
	item: { published: boolean; publish_at?: string | null },
	now: Date = new Date()
): boolean {
	return item.published && !isScheduled(item, now);
}

/**
 * `field` -> `block_id` AS A PLAIN RECORD, FROM THE STORED MANIFEST, for the
 * frame's own prop.
 *
 * `fieldBlockMap` is the ONE implementation of the mapping and this calls it;
 * what is added here is only the two things a caller of it from a page payload
 * needs. The Map becomes a Record because that is the prop's declared type. And
 * the walk is guarded, because `fieldBlockMap` is written against a manifest
 * that has ALREADY been validated and would throw on a `modules` that is not an
 * array or a block that is null.
 *
 * THE GUARD IS A PRECONDITION, NOT A SECOND VALIDATOR. It asks only what the
 * walk itself needs -- containers that are arrays, blocks that are objects with
 * a string id and a string field -- and nothing about ids matching their
 * pattern, points summing, or any other rule `validateHtmlManifest` owns. That
 * function cannot run here: it reads the manifest out of the DOCUMENT, and this
 * page deliberately never loads the document.
 *
 * AN EMPTY RECORD FAILS CLOSED. The bridge drops every message naming a field
 * it does not hold, so a manifest this cannot walk yields a worksheet that
 * saves nothing rather than one that writes to a guessed block id.
 */
export function htmlFieldToBlockId(manifest: unknown): Record<string, string> {
	if (!walkableManifest(manifest)) return {};
	return Object.fromEntries(fieldBlockMap(manifest));
}

function walkableManifest(manifest: unknown): manifest is HtmlAssignmentManifest {
	if (!manifest || typeof manifest !== 'object') return false;
	const m = manifest as Record<string, unknown>;
	if (m.header !== undefined && !blocksWalkable(m.header)) return false;
	if (m.modules === undefined) return true;
	if (!Array.isArray(m.modules)) return false;
	return m.modules.every((mod) => {
		if (!mod || typeof mod !== 'object') return false;
		const blocks = (mod as Record<string, unknown>).blocks;
		return blocks === undefined || blocksWalkable(blocks);
	});
}

function blocksWalkable(blocks: unknown): boolean {
	if (!Array.isArray(blocks)) return false;
	return blocks.every(
		(b) =>
			!!b &&
			typeof b === 'object' &&
			typeof (b as Record<string, unknown>).id === 'string' &&
			typeof (b as Record<string, unknown>).field === 'string'
	);
}

/**
 * THE FRAME'S `src`, AND UNSET MEANS SAME ORIGIN.
 *
 * `PUBLIC_HX_SANDBOX_ORIGIN` set is production: documents answer on their own
 * host, `/hx/` 404s anywhere else, and the URL has to name that host. Unset is
 * dev and every Vercel preview, where one server answers both roles -- and
 * `hxOnServingHost` in `src/routes/hx/_headers.ts` treats unset as "any host"
 * for exactly that reason. A RELATIVE URL is the matching answer on this side:
 * it resolves to whatever host the page is on, so nothing has to be configured
 * for the route to be reachable, and no hostname is baked into a payload.
 *
 * IT CANNOT SILENTLY FALL BACK TO THE PORTAL IN PRODUCTION, because in
 * production the variable is set. The failure a fallback would otherwise hide
 * is the Foundry one: a student's document served off the cookie-carrying host,
 * rendering perfectly, with nothing on screen to say so.
 *
 * The trailing-slash normalization is `_headers.ts`'s own, spelled the same way
 * because that function is private to a route directory this module cannot
 * import from. Two spellings of one rule is worth extracting the day a third
 * appears.
 */
export function htmlAssignmentSrc(
	sandboxOrigin: string | null | undefined,
	documentId: string
): string {
	const origin = (sandboxOrigin ?? '').trim().replace(/\/+$/, '');
	return `${origin}/hx/${documentId}`;
}

/**
 * THE ANSWER PATH, AS A SEAM THIS MODULE DESCRIBES AND DOES NOT IMPLEMENT.
 *
 * Saving a ported worksheet's answers is its own lane
 * (`html-assignment/answers.ts`); what a rendering surface needs is only the
 * shape, so it can hand the frame's callbacks somewhere and hand it the state
 * to open on. Typing it here rather than importing the controller keeps the
 * mount compilable while that lane is in flight, and keeps the render path from
 * taking a dependency on a write path it has no business knowing about.
 *
 * ABSENCE IS THE MECHANISM. A surface that passes no controller renders the
 * worksheet READ ONLY -- there is no write to execute, rather than a write that
 * is merely hidden -- which is exactly what an instructor's read-only view
 * wants and exactly what a student should get on a deployment where the answer
 * path has not landed. A worksheet that accepts typing and saves nothing is the
 * one outcome that must not be reachable.
 *
 * `values` AND `images` ARE READ ON EVERY RENDER, so a controller holding them
 * in `$state` should expose them as getters or as a reactive object. A plain
 * property reassigned on a frozen object would seed the document once and never
 * update it.
 */
export interface HtmlAssignmentAnswers {
	/** Keyed by FIELD, the document's own names, which is what the frame seeds
	    with. The controller owns the translation from block ids. */
	readonly values: Record<string, string | boolean>;
	readonly images: Record<string, HxImageState>;
	/** The last acknowledgement to hand down, or null for none yet. */
	readonly saved: { at: string; ok: boolean; reason?: string | null } | null;
	/*
		NAMED AFTER THE CONTROLLER, NOT AFTER THE FRAME'S CALLBACKS, and the two
		were briefly spelled differently.

		This interface first read `onchange` / `onimage` / `onimageremove` /
		`onimagecaption`, mirroring `HtmlAssignmentFrame`'s frozen callback
		contract. That is a defensible name for a prop and the wrong name for
		THIS: the object satisfying it is `HxAnswers`, whose methods are
		`change` / `image` / `imageRemove` / `imageCaption`, and an interface
		that describes its one implementation under different names buys nothing
		and needs an adapter at every mount. The frame's names stay the frame's;
		the translation happens once, where the callbacks are built.

		A METHOD RETURNING A PROMISE SATISFIES A `void` RETURN, which is what
		lets the three async ones sit here unchanged. The mount deliberately does
		not await them: an upload is not something a document's message handler
		waits on, and the acknowledgement travels back through `saved`.
	*/
	/** Required: a controller that cannot take a change is not an answer path,
	    and offering one would produce the writable-but-unsaving worksheet. */
	change: (change: { blockId: string; field: string; value: string | boolean }) => void;
	image?: (image: { blockId: string; field: string; name: string; bytes: string }) => void;
	imageRemove?: (image: { blockId: string; field: string }) => void;
	imageCaption?: (image: { blockId: string; field: string; caption: string }) => void;
}
