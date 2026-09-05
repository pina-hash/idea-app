/**
 * WHAT HAPPENS TO A NOTEBOOK PHOTO BEFORE IT IS SENT, AND WHAT IT IS TOLD WHEN
 * IT CANNOT BE.
 *
 * This is the notebook's half of the same job `$lib/maps/photo-prepare` does
 * for a shelf photo, and it exists for the narrower of the two reasons: not
 * the format (the notebook route already resolves an empty `File.type` from
 * the extension), but the SIZE, and specifically WHERE the size is refused and
 * WHAT the refusal says.
 *
 * TWO DEFECTS, AND THEY ARE THE SAME DEFECT TWICE.
 *
 *   1. THE SENTENCE. The route answers `Photos are capped at 4 MB.` -- which
 *      states the limit and nothing else. It does not say how big THIS photo
 *      is, so a student cannot tell whether they missed by a little or by a
 *      lot, and it does not say what to do, so the obvious next move is to
 *      pick the same file again. CLAUDE.md asks a refusal for three things and
 *      that sentence carries one of them.
 *
 *   2. THE MOMENT. `fitForUpload` in `$lib/notebook/camera` re-encodes an
 *      oversize capture and is deliberately conservative: every failure path
 *      -- a format it cannot decode, a canvas refusal, an encode that comes
 *      out bigger -- returns the ORIGINAL file, over the cap, on purpose,
 *      because "a legible server error" was judged better than replacing the
 *      photo with something worse. That reasoning is sound and this does not
 *      change it. What it costs is that the legible server error arrives after
 *      the whole file has crossed school wifi, which is 0163's own argument
 *      one subsystem over: a refusal after a minute of waiting is the same
 *      refusal at the worst possible moment.
 *
 * SO THE SIZE RULE IS STATED ONCE, HERE, READ FROM THE ONE REGISTRY, and both
 * ends can ask it: a browser before it sends, and the route after it has
 * received. Neither has its own copy of the number.
 *
 * WHAT THIS DOES NOT DO, AND WHY THE BROWSER HALF IS NOT WIRED UP YET.
 * `NotebookPhotos`, `PhotoStager` and `CameraCapture` are the surfaces that
 * pick a file, and this bundle does not own them. `notebookPhotoRefusal` is
 * written to be called from a picker -- pure, synchronous, over `File.size`
 * alone, with no decode and no await -- and until one does, the refusal it
 * produces is the ROUTE'S refusal, which is strictly better than the sentence
 * that was there. Wiring it into the picker is one import and one branch, and
 * it is reported rather than done here.
 *
 * THE CAP IS NOT MOVED. 4 MiB at the route and 3.6 MiB in the browser are the
 * numbers that were already being enforced; `$lib/upload-limits` transcribes
 * the first and `tests/upload-limits.test.ts` asserts the transcription
 * against `MAX_PHOTO_BYTES` itself, so the two cannot drift apart in silence.
 */

import { uploadCeiling, uploadSizeRefusal, uploadTooLargeMessage } from '$lib/upload-limits';

/** The one id this module speaks for, so no caller passes the wrong row. */
export const NOTEBOOK_PHOTO_UPLOAD = 'notebook-photo' as const;

/** The route's cap, from the registry rather than from a second literal. */
export const NOTEBOOK_PHOTO_MAX_BYTES = uploadCeiling(NOTEBOOK_PHOTO_UPLOAD).maxBytes as number;

/**
 * WHY THIS PHOTO CANNOT BE SENT, OR NULL.
 *
 * Size only, and that is deliberate rather than partial: the type question is
 * genuinely harder on this path than on the maps one, because an iPhone HEIC
 * arrives with an EMPTY `File.type` and the notebook resolves it from the
 * filename extension inside `readPhotoForm` -- server-side, where the
 * allowlist that governs it lives. Restating that resolution here would be a
 * second copy of the rule this codebase is most careful about, and it would be
 * the copy that stops matching. Size needs no allowlist and no decode: it is
 * one number against one number, and it is the refusal both students hit.
 *
 * An EMPTY file is refused too, and separately, because "0 bytes" is never a
 * size problem -- it is a picker that handed over nothing, and telling
 * somebody their 0 MB photo is over a 4 MB limit is a sentence that reads as a
 * bug.
 */
export function notebookPhotoRefusal(file: { size: number; name?: string }): string | null {
	if (!Number.isFinite(file.size) || file.size <= 0) {
		return 'That file is empty. Take the photo again, or pick a different one.';
	}
	return uploadSizeRefusal(NOTEBOOK_PHOTO_UPLOAD, file.size);
}

/**
 * The same sentence, for a caller that already knows the size is over -- the
 * route, which has the file in hand and does not need the predicate re-run.
 */
export function notebookPhotoTooLarge(sizeBytes: number): string {
	return uploadTooLargeMessage(NOTEBOOK_PHOTO_UPLOAD, sizeBytes);
}
