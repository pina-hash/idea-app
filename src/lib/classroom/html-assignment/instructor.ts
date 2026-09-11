/**
 * THE INSTRUCTOR'S OWN WORKING COPY OF A PORTED HTML ASSIGNMENT (0199).
 *
 * ===========================================================================
 * WHAT THIS IS FOR, IN ONE SENTENCE
 * ===========================================================================
 *
 * Until this lane existed, NOBODY COULD OPEN A PORTED WORKSHEET AND CONFIRM IT
 * SAVES BEFORE A CLASS USED IT. The manager's item page mounted the document
 * read-only -- structurally, by handing down no answers controller -- so the
 * first person to find a document whose fields do not record anything was a
 * student, mid-period, with their work already typed into it.
 *
 * ===========================================================================
 * IT IS `InstructorCopy.svelte`'s SURFACE WITH THE OTHER ENGINE UNDER IT
 * ===========================================================================
 *
 * 0128 built this for a v1 spec: the instructor fills the assignment out on the
 * SAME renderer the student uses, the answers autosave through the same
 * primitive, and one copy per item can be designated the answer key. Every one
 * of those sentences is true here with `SpecRenderer` replaced by
 * `HtmlAssignmentFrame`, so the vocabulary, the designate and undesignate
 * handling and the empty-copy refusal are 0128's -- imported from
 * `assignment-spec.ts` rather than retyped, because a second spelling of
 * "Designate as answer key" is two controls that stop meaning one thing.
 *
 * ===========================================================================
 * THE DATABASE NEEDED ONE BRANCH AND GOT EXACTLY ONE
 * ===========================================================================
 *
 * `classroom_save_instructor_response` (0128) read `classroom_assignment_specs`
 * and raised 'This assignment has no interactive spec.' on a ported item, with
 * a type gate overlapping a manifest's vocabulary by the single word `table`.
 * 0199 gives it the branch 0197 gave the two student write functions: the
 * item's own `assignment_schema_version` picks the arm, the manifest resolves
 * the block, and the spec path is untouched. THE TABLE, THE ROW SHAPE, THE KEY
 * FUNCTIONS AND THE READ PATH ALL STAYED STILL -- which is why there is no
 * instructor-side read module here either: `loadInstructorCopy` already returns
 * exactly what this surface renders from.
 *
 * ===========================================================================
 * WHAT THIS MODULE HOLDS, AND WHY IT IS NOT IN `transports.ts`
 * ===========================================================================
 *
 * One projection and two sentences. The projection is the point: the ONLY thing
 * an instructor's ported worksheet needs that the spec surface did not is an
 * `HxAnswerTransports` whose `saveResponse` is 0128's rather than 0086's, and
 * that is a field read off the object `createInstructorCopyTransports` already
 * returns. NO SECOND RPC CALLER IS WRITTEN ANYWHERE IN THIS LANE, which is the
 * same promise `createHtmlAnswerTransports` makes on the student side.
 *
 * It sits here rather than beside that factory because everything in it is
 * about the PORTED engine and nothing else imports it; `transports.ts` owns the
 * client calls, and this owns one rearrangement of four of them.
 */

import type { HxAnswerTransports } from '$lib/classroom/html-assignment/answers';
import type { InstructorCopyTransports } from '$lib/classroom/assignment-spec';

/**
 * THE ANSWER PATH FOR AN INSTRUCTOR'S PORTED COPY: 0128's save, and nothing
 * else.
 *
 * THE THREE FILE WRITES ARE ABSENT AND THAT IS THE WHOLE DESIGN. There is no
 * instructor counterpart to `classroom_submission_files` -- 0128 says so of
 * itself, and 0199 deliberately did not add one -- so an instructor has nowhere
 * to put a photograph. Handing the ENGINE's uploader here instead would put it
 * somewhere far worse than nowhere: `classroom_add_submission_file` opens a
 * `classroom_submissions` row for its caller, so a teacher pressing the camera
 * inside their own working copy would acquire a SUBMISSION on their own
 * assignment -- a row the grading console, the Grades tab and the FACTS export
 * all read as a student hand-in.
 *
 * `HxAnswers` answers each absence with its own sentence rather than dropping
 * the message, so the camera control inside the document says what happened.
 * See `HX_REFUSALS.noInstructorFiles`.
 *
 * A PROJECTION, NOT AN IMPLEMENTATION. `saveResponse` is the identical function
 * object `createInstructorCopyTransports` returns, so there is one caller of
 * `classroom_save_instructor_response` in the codebase and this is not it.
 */
export function hxInstructorAnswerTransports(
	transports: InstructorCopyTransports
): HxAnswerTransports {
	return { saveResponse: transports.saveResponse };
}

/**
 * WHAT THE INSTRUCTOR IS TOLD, IN PARENT CHROME, BEFORE THEY PRESS ANYTHING.
 *
 * The twin of `INSTRUCTOR_COPY_UPLOAD_NOTE`, which the v1 surface renders ON
 * the block that would have taken a picture. A document is opaque to us -- we
 * cannot label a control inside somebody's uploaded HTML, which is the byte
 * rule -- so the only honest place for this sentence is above the frame, and it
 * is rendered UNCONDITIONALLY rather than only for a manifest declaring an
 * `image` block: the manifest's block types say what the document DECLARES, and
 * a ported document is free to draw a camera control the manifest never
 * mentioned.
 */
export const HTML_INSTRUCTOR_COPY_UPLOAD_NOTE =
	'Photographs are not captured in an instructor copy. Everything you type is saved.';

/**
 * AND WHAT IT IS FOR, WHICH IS THE SENTENCE THE WHOLE LANE EXISTS TO MAKE TRUE.
 *
 * Rendered under 0128's own `INSTRUCTOR_COPY_NOTE` rather than replacing it:
 * that one says what this copy is NOT (never graded, never handed in, invisible
 * to students) and is exactly as true here. This adds the one thing that is
 * only true of a ported document -- that filling it in is how you find out
 * whether it works, before a class does.
 */
export const HTML_INSTRUCTOR_COPY_PURPOSE =
	'Filling this in is how you check the worksheet records answers before a class uses it.';
