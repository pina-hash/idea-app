/**
 * WHAT A STUDENT HAS DONE ON AN HTML WORKSHEET, IN THE WORDS A GRADER NEEDS
 * (ledger 0457, report 6aa5954d).
 *
 * A ported worksheet has no turn-in button, so "turned in" is false for every
 * student who saved every answer, and the connector's read grades listed the
 * whole class as "not turned in". The honest facts are two: how many of the
 * worksheet's questions this student has an answer saved for, and whether any
 * of those answers was saved after the due date. This module is the ONE
 * statement of both, read by the grading console's roster and by the
 * connector, so the two cannot disagree.
 *
 * "ANSWERED" IS THE PROGRESS RAIL'S OWN JUDGMENT (`hxProgress`): the blocks it
 * counts (required, not optional) and whether each has a saved answer. A
 * sentence-count shortfall is still an answer saved, so this counts the
 * block as answered when anything is stored for it, and reports the short ones
 * apart. A picture counts when a file is saved in its box.
 *
 * "SAVED AFTER DUE" READS EACH ANSWER'S OWN SAVE TIME against the due date the
 * caller hands in, which is the student's own due date once extensions exist.
 * No time, or no due date, is never late.
 */
import { hxValuesFromResponses, hxImagesFromFiles, type HxResponseRow } from './html-assignment/answers';
import { hxBlockHasResponse, hxProgress } from './html-assignment/progress';
import { manifestBlocks, type HtmlAssignmentManifest } from './html-assignment/manifest';
import type { SubmissionFileRow } from './assignment-spec';

export interface WorksheetAnswered {
	/** Questions with an answer saved, out of `of`. */
	answered: number;
	/** The questions the worksheet counts (required, not optional). */
	of: number;
	/** Answered but shorter than the sentences asked for. */
	short: number;
	/** Answers saved after the due date, and the latest save. */
	savedAfterDue: number;
	lastSaved: string | null;
	/** Every counted question answered. */
	allAnswered: boolean;
}

export type AnswerRow = HxResponseRow & { updated_at?: string | null };
export type AnswerFile = SubmissionFileRow & { created_at?: string | null };

function instant(iso: string | null | undefined): number | null {
	if (!iso) return null;
	const ms = Date.parse(iso);
	return Number.isFinite(ms) ? ms : null;
}

/** One student's answered count on one worksheet, against their own due date. */
export function worksheetAnswered(
	manifest: HtmlAssignmentManifest,
	responses: readonly AnswerRow[],
	files: readonly AnswerFile[] = [],
	dueAt: string | null = null
): WorksheetAnswered {
	const values = hxValuesFromResponses(manifest, responses);
	const images = hxImagesFromFiles(manifest, files);
	const progress = hxProgress(manifest, values, images);
	const blockOf = new Map(manifestBlocks(manifest).map((b) => [b.id, b] as const));
	let answered = 0;
	let short = 0;
	let of = 0;
	for (const b of progress.blocks) {
		if (b.weight <= 0) continue;
		of += 1;
		const block = blockOf.get(b.blockId);
		if (!block) continue;
		if (hxBlockHasResponse(block, values, images)) {
			answered += 1;
			if (b.reason === 'short') short += 1;
		}
	}
	const due = instant(dueAt);
	let savedAfterDue = 0;
	let last: number | null = null;
	const consider = (at: string | null | undefined) => {
		const ms = instant(at);
		if (ms === null) return;
		if (last === null || ms > last) last = ms;
		if (due !== null && ms > due) savedAfterDue += 1;
	};
	for (const r of responses) if (blockOf.has(r.block_id)) consider(r.updated_at);
	for (const f of files) if (f.block_id && blockOf.has(f.block_id)) consider(f.created_at);
	return {
		answered,
		of,
		short,
		savedAfterDue,
		lastSaved: last === null ? null : new Date(last).toISOString(),
		allAnswered: of > 0 && answered === of
	};
}

/** "Answered 7 of 9", plus ", saved after due" when any answer was. */
export function worksheetAnsweredWords(a: WorksheetAnswered): string {
	if (a.of === 0) return a.savedAfterDue ? 'Saved after due' : 'Nothing to answer';
	const base = a.answered === 0 ? `None of ${a.of} answered` : `Answered ${a.answered} of ${a.of}`;
	return a.savedAfterDue ? `${base}, saved after due` : base;
}
