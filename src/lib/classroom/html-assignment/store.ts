/**
 * STAGING, READING AND WRITING A PORTED HTML ASSIGNMENT.
 *
 * The half of the import that is not validation. `manifest.ts` decides whether a
 * document is legal; this decides what happens to a legal one, and what happens
 * to an illegal one before anybody has waited for a save.
 *
 * THREE THINGS IT OWES, and each of them is a defect somebody already shipped:
 *
 * 1. A FILE THE PLATFORM WILL NOT ACCEPT IS REFUSED BEFORE THE REQUEST IS MADE,
 *    with the limit stated beside the size. Measured 2026-09-04: the deck picker
 *    validates SIZE ONLY and never file type, so a PNG stages happily, reports
 *    ready, and fails server-side after Post -- by which point the teacher has
 *    filled in the whole form. `stagedHtmlIssue` checks BOTH, and the type check
 *    reads the FILENAME as well as `File.type`, because `File.type` is
 *    legitimately empty for a file dragged out of some archivers and an empty
 *    type must not read as "not HTML".
 *
 * 2. THE WHOLE DOCUMENT IS VALIDATED AT STAGE TIME, not at save time. A ported
 *    document is the entire assignment, so a refusal after Post is a refusal
 *    after the only work anybody did. Validation is pure and local -- no network
 *    -- so there is no reason to defer it.
 *
 * 3. A FAILED WRITE KEEPS WHAT DID NOT LAND. Same rule as every other staged
 *    attachable: the item is created first, the document is attempted, and only
 *    a document that actually landed is cleared. Saving again retries exactly
 *    the rest rather than asking a teacher to find the same file twice.
 *
 * IT IS OUT HERE, NOT IN THE COMPONENT, for the reason `composer-staging.ts`
 * gives about itself: the guarantees are the ones that fail silently. A staged
 * document cleared after a failed upload looks exactly like one that never
 * existed, and neither shows up in a type check.
 *
 * Pure apart from the transport it is handed. The write goes through a SECURITY
 * DEFINER RPC that re-checks the caller; the admin gate below is convenience,
 * and 0195 is the boundary.
 */

import {
	validateHtmlManifest,
	type HtmlAssignmentManifest,
	type ManifestValidation
} from '$lib/classroom/html-assignment/manifest';
import { stagedRubricAfterManifest } from '$lib/classroom/html-assignment/rubric';
import type { RubricCriterion } from '$lib/classroom/assignment-spec';

/**
 * THE DOCUMENT CAP, and it is the DATABASE's rather than the platform's.
 *
 * The bytes go through an RPC as jsonb, exactly as an assignment spec does, so
 * the binding limit is `pg_column_size` and not a request body -- Vercel takes
 * 100 MB and this will never be near it. 0195 refuses the same number, in the
 * same words; a client cap looser than the server's is a refusal a teacher only
 * meets after waiting for the upload.
 *
 * 2 MB against 0086's 400 KB for a spec, because a spec is a description of a
 * worksheet and this IS the worksheet -- markup, styles and the document's own
 * script, all of it inline (the CSP allows no external source).
 */
export const HTML_DOCUMENT_MAX_BYTES = 2 * 1024 * 1024;

/**
 * WHAT COUNTS AS AN HTML FILE, by extension AND by declared type.
 *
 * `File.type` is a guess the uploading platform makes and is legitimately empty
 * -- so an empty type is decided by the extension, never refused for being
 * empty. A type that is present and is NOT html is refused whatever the
 * extension says, because that is a `.html` somebody renamed.
 */
const HTML_EXTENSIONS = ['.html', '.htm'];
const HTML_MIME = 'text/html';

function hasHtmlExtension(name: string): boolean {
	const lower = (name ?? '').toLowerCase();
	return HTML_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

const mb = (n: number) => (n / 1024 / 1024).toFixed(1);

/**
 * The refusal a staged document earns, or null when it may be read.
 *
 * Size AND type, and the message states the limit as well as the size: "too
 * large" with no number is a guessing game.
 */
export function stagedHtmlIssue(file: File): string | null {
	const declared = (file.type ?? '').toLowerCase().split(';')[0].trim();
	if (!hasHtmlExtension(file.name)) {
		return (
			`"${file.name}" is not an HTML file. A ported assignment is one self-contained ` +
			`.html document, with its styles and script inline. Export it as HTML and upload that.`
		);
	}
	if (declared && declared !== HTML_MIME) {
		return (
			`"${file.name}" ends in .html but the browser reports it as ${declared}. That is usually ` +
			`a file that was renamed. Upload the real HTML document.`
		);
	}
	if (file.size > HTML_DOCUMENT_MAX_BYTES) {
		return (
			`This document is ${mb(file.size)} MB, over the ${mb(HTML_DOCUMENT_MAX_BYTES)} MB limit. ` +
			`Images belong in the assignment as image blocks a student uploads into, not embedded in ` +
			`the document as data URLs.`
		);
	}
	if (file.size === 0) {
		return `"${file.name}" is empty.`;
	}
	return null;
}

export interface StagedHtmlAssignment {
	/** The document's own filename, for the summary line and the failure list. */
	filename: string;
	/** The whole document, verbatim. Nothing rewrites a stored byte. */
	html: string;
	/** The manifest read out of it at import, which is what the parent maps through. */
	manifest: HtmlAssignmentManifest;
}

export interface HtmlImportResult {
	/** The staged document, or NULL. There is no partial import. */
	staged: StagedHtmlAssignment | null;
	errors: string[];
	warnings: string[];
}

/**
 * READ A PICKED FILE AND VALIDATE IT, in one step, at pick time.
 *
 * Every refusal a teacher can act on comes back here -- the file-shaped ones
 * from `stagedHtmlIssue` and the document-shaped ones from
 * `validateHtmlManifest`, in one list, in the order they were found. A refusal
 * renders where the user was working, in the same problem list as every other
 * problem, and never in a second place they have to learn about.
 */
export async function readStagedHtml(file: File): Promise<HtmlImportResult> {
	const issue = stagedHtmlIssue(file);
	if (issue) return { staged: null, errors: [issue], warnings: [] };

	let html: string;
	try {
		html = await file.text();
	} catch (e) {
		return {
			staged: null,
			errors: [`"${file.name}" could not be read: ${(e as Error).message || 'unknown error'}.`],
			warnings: []
		};
	}
	return stageHtmlDocument(file.name, html);
}

/**
 * The same decision over text already in hand, which is what a test drives and
 * what a re-validation of something stored would call. `readStagedHtml` is this
 * plus a `File`; there is one implementation of the judgement.
 */
export function stageHtmlDocument(filename: string, html: string): HtmlImportResult {
	const result: ManifestValidation = validateHtmlManifest(html);
	if (!result.manifest) {
		return { staged: null, errors: result.errors, warnings: result.warnings };
	}
	return {
		staged: { filename, html, manifest: result.manifest },
		errors: [],
		warnings: result.warnings
	};
}

/**
 * The one-line summary the composer shows once a document is staged. Here
 * rather than in the markup so the numbers a teacher reads before Post are the
 * numbers the validator actually counted.
 */
export function stagedHtmlSummary(staged: StagedHtmlAssignment): string {
	const m = staged.manifest;
	const modules = m.modules?.length ?? 0;
	// HEADER BLOCKS ARE COUNTED SEPARATELY, not folded in. They are identity
	// fields (name, team, date) that carry no points and never reach the rubric,
	// so counting them as answer blocks would make the figure beside the points
	// disagree with what the grading console will show.
	const blocks = (m.modules ?? []).reduce((n, mod) => n + (mod.blocks?.length ?? 0), 0);
	const identity = m.header?.length ?? 0;
	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
	const parts = [plural(modules, 'module'), plural(blocks, 'answer block')];
	if (identity) parts.push(plural(identity, 'identity field'));
	parts.push(`${m.points} points`);
	return parts.join(', ');
}

/**
 * The write. One RPC: the document and its manifest go together or neither
 * goes, because a stored document whose manifest failed to arrive is an
 * assignment that renders and cannot record a single answer.
 */
export type SetHtmlAssignment = (
	itemId: string,
	document: string,
	manifest: HtmlAssignmentManifest,
	filename: string
) => Promise<{ ok: boolean; message?: string; revision?: number | null }>;

export interface HtmlAssignmentTransports {
	/**
	 * NULL REMOVES THE CONTROL, down through the composer, exactly as every
	 * other optional transport does. Absence is the mechanism: a surface with no
	 * setter has no import panel, so read-only is structural rather than a
	 * discipline. This is also how the admin-only rule is expressed -- the first
	 * season hands the transport to an admin and to nobody else.
	 */
	setHtmlAssignment: SetHtmlAssignment | null;
	/**
	 * THE RUBRIC WRITE, and it is `classroom_set_rubric` -- the SAME RPC a spec's
	 * rubric and a hand-built one go through. There is no HTML-assignment rubric
	 * table and there must never be one: what `manifestToRubric` produces is a
	 * `RubricCriterion[]` indistinguishable from either.
	 *
	 * ABSENCE REMOVES THE WRITE, exactly as every other optional transport in
	 * this codebase removes what it drives -- the result then carries no rubric
	 * fields at all and this function behaves precisely as it did before it had
	 * any. That is not a licence to omit it: the rubric a ported assignment is
	 * graded against is a pure function of its manifest, so a surface that
	 * writes a manifest without writing the rubric beside it leaves the OLD
	 * document's rubric on the item -- which stores fine, renders fine, and is
	 * wrong only on the grading console. Every surface that uploads a document
	 * passes this.
	 */
	setRubric?:
		| ((itemId: string, criteria: RubricCriterion[] | null) => Promise<{ ok: boolean; message?: string }>)
		| null;
}

export interface HtmlApplyResult {
	/** One line naming what did not land, or empty. Never a generic error. */
	failures: string[];
	/** What is STILL staged. Null once it landed; unchanged when it did not. */
	staged: StagedHtmlAssignment | null;
	/** The revision the write produced, when the RPC reported one. */
	revision: number | null;
	/**
	 * THE RUBRIC THAT DID NOT LAND, still needing a write -- the same shape as
	 * `staged` one field up, and for the same reason. Null when it landed, and
	 * null when there was nothing to write.
	 *
	 * A FAILED RUBRIC WRITE CANNOT BE RETRIED THROUGH THIS FUNCTION, which is why
	 * it comes back rather than staying here: the document itself DID land, so
	 * re-applying the document to retry the rubric would mint a second revision
	 * of a document nobody changed. What the caller does with it is stage it as
	 * an ordinary rubric -- `applyStagedExtras` writes exactly that on the next
	 * save, through the same RPC.
	 *
	 * THE THREE RUBRIC FIELDS ARE PRESENT EXACTLY WHEN `setRubric` WAS, which is
	 * what keeps a caller that does not write rubrics reading the result it has
	 * always read. Undefined is "not this call's business"; null is "nothing left
	 * unwritten".
	 */
	rubric?: RubricCriterion[] | null;
	/** What the caller's `derived` flag becomes: true once a document owns it. */
	rubricDerived?: boolean;
	/** True when this call actually wrote one, for the caller's "also landed" note. */
	rubricWritten?: boolean;
}

/**
 * Apply a staged document to an item that now exists.
 *
 * The two-phase shape every staged attachable has: the document is stored
 * against a `classroom_items` row, so the row has to exist first. Written as its
 * own function rather than folded into `applyStagedExtras` because that module
 * belongs to the composer's own staging set and this is a fourth thing on a
 * different lane's timetable; the SEMANTICS are deliberately identical, and a
 * later bundle folding the two together should keep these.
 *
 * IT WRITES THE RUBRIC TOO, AND THAT IS WHY THE WRITE IS HERE RATHER THAN AT
 * THE CALL SITES. The rubric a ported assignment is graded against is a pure
 * function of the manifest, so it has to be rewritten at EVERY revision -- the
 * import and every re-upload after it. Left to each caller, a second upload
 * surface would store a new document beside the OLD document's rubric, which
 * stores fine, renders fine, and is wrong only on the grading console: exactly
 * the silent shape this module exists to stop. Inside, one transport is all a
 * new upload surface has to hand over, and the decision, the translation and
 * the retry semantics come with it.
 *
 * A MISSING `setRubric` REMOVES THE WRITE SILENTLY, which is the ordinary
 * optional-transport rule and is the one place here that can still go wrong by
 * omission. It is that way because this function answered three fields long
 * before it answered six, and a caller that has nothing to do with rubrics must
 * keep reading the result it has always read rather than a failure list with a
 * refusal in it on every post.
 *
 * `currentRubric` IS THE CALLER'S OWN `{ rubric, derived }` STATE, defaulted to
 * "nothing, not derived" so every call written before this keeps compiling and
 * keeps deriving. `derived` is what stops a re-upload eating a rubric somebody
 * corrected by hand; a caller that cannot remember the flag across a page load
 * -- which is every re-upload surface -- recovers it with
 * `manifestRubricIsDerived(outgoing manifest, stored rubric)`.
 */
export async function applyStagedHtmlAssignment(
	itemId: string,
	staged: StagedHtmlAssignment | null,
	transports: HtmlAssignmentTransports,
	currentRubric: { rubric: RubricCriterion[] | null; derived: boolean } = {
		rubric: null,
		derived: false
	}
): Promise<HtmlApplyResult> {
	// THE RUBRIC HALF OF EVERY RESULT, PRESENT ONLY WHEN THERE IS A TRANSPORT TO
	// WRITE ONE. With no `setRubric` this function returns exactly the three
	// fields it always returned, so a caller that has nothing to do with rubrics
	// reads the result it has always read -- absence removing the behaviour AND
	// the report of it, which is the same mechanism every other optional
	// transport here uses.
	const rubricHalf = (
		rubric: RubricCriterion[] | null,
		derived: boolean,
		written: boolean
	): Partial<HtmlApplyResult> =>
		transports.setRubric ? { rubric, rubricDerived: derived, rubricWritten: written } : {};

	if (!staged) {
		return {
			failures: [],
			staged: null,
			revision: null,
			...rubricHalf(null, currentRubric.derived, false)
		};
	}
	if (!transports.setHtmlAssignment) {
		return {
			failures: ['HTML assignment: uploading one is not available here'],
			staged,
			revision: null,
			...rubricHalf(null, currentRubric.derived, false)
		};
	}
	let res: { ok: boolean; message?: string; revision?: number | null };
	try {
		res = await transports.setHtmlAssignment(itemId, staged.html, staged.manifest, staged.filename);
	} catch (e) {
		res = { ok: false, message: (e as Error).message || 'Save failed.' };
	}
	if (!res.ok) {
		// A RUBRIC IS NEVER WRITTEN FOR A DOCUMENT THAT DID NOT LAND: it would
		// belong to an assignment nobody can see, and the retry re-writes the
		// document and re-decides this from scratch.
		return {
			failures: [`HTML assignment "${staged.filename}": ${res.message ?? 'could not be attached'}`],
			staged,
			revision: null,
			...rubricHalf(null, currentRubric.derived, false)
		};
	}

	const revision = res.revision ?? null;
	if (!transports.setRubric) return { failures: [], staged: null, revision };

	// THE DOCUMENT LANDED, SO ITS RUBRIC IS NOW THE ONE TO GRADE AGAINST -- and
	// the decision about whether to write it is `stagedRubricAfterManifest`'s,
	// which is `stagedRubricAfterSpec`'s gate over `manifestToRubric`'s rows. A
	// rubric somebody BUILT comes back unchanged and nothing is written; a
	// document with no criteria produces null, which `manifestRubricIssues`
	// refuses at pick time long before anybody gets here.
	const next = stagedRubricAfterManifest(staged.manifest, true, currentRubric);
	if (!next.derived || !next.rubric) {
		// Nothing of this call's to write: the rubric on the item is somebody's
		// own, or the document carries no criteria. `rubric` is null because null
		// means "nothing left unwritten", never "there is no rubric".
		return {
			failures: [],
			staged: null,
			revision,
			...rubricHalf(null, next.derived, false)
		};
	}
	let rubricRes: { ok: boolean; message?: string };
	try {
		rubricRes = await transports.setRubric(itemId, next.rubric);
	} catch (e) {
		rubricRes = { ok: false, message: (e as Error).message || 'Save failed.' };
	}
	if (!rubricRes.ok) {
		return {
			failures: [
				`the rubric from "${staged.filename}": ${rubricRes.message ?? 'could not be attached'}`
			],
			staged: null,
			revision,
			...rubricHalf(next.rubric, true, false)
		};
	}
	return { failures: [], staged: null, revision, ...rubricHalf(null, true, true) };
}

/**
 * THE REFUSAL A NON-ADMIN READS, and the ONE spelling of it.
 *
 * Upload is admin-only for the first season -- one of the four decisions the
 * contract states and none of the four lanes may re-open. It is a rendered
 * sentence rather than a missing panel wherever a teacher would otherwise be
 * looking for a control they have been told about; the panel itself is removed
 * by the absent transport, which is the real gate.
 */
export const HTML_ASSIGNMENT_ADMIN_ONLY =
	'Uploading a ported HTML assignment is limited to site admins this season. Send the document to an admin to post, or build the assignment with an interactive spec instead.';
