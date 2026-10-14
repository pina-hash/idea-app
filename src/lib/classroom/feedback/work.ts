/**
 * THE PICTURES IN ONE STUDENT'S WORKSHEET THAT AN INSTRUCTOR CAN DRAW ON
 * (0238, decision 60), worked out from the same stored rows and the same
 * projections the frame is seeded from (`hxImagesFromFiles`,
 * `hxFileIdsByField`), so the picture the tool opens on is the picture the
 * frame is showing for that field and never a second guess at it.
 *
 * Picture or file is `isImageFilename`, the one rule: a part file handed in
 * through an image block is a Download, and nobody draws on a Download.
 */
import { isImageFilename } from '$lib/classroom/classroom';
import type { SubmissionFileRow } from '$lib/classroom/assignment-spec';
import { hxFileIdsByField, hxImagesFromFiles } from '$lib/classroom/html-assignment/answers';
import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
import { htmlFieldToBlockId } from '$lib/classroom/html-assignment/mount';
import type { DrawingTarget } from './session.svelte';
import type { FeedbackThread, FieldNote, Marks } from './notes';

export interface DrawablePicture {
	field: string;
	fileId: string;
	blockId: string;
	src: string;
	alt: string;
	/** The words on the list's key: the student's caption, else the file's name. */
	label: string;
}

export function drawablePictures(
	manifest: HtmlAssignmentManifest | null,
	files: readonly SubmissionFileRow[]
): DrawablePicture[] {
	if (!manifest) return [];
	const images = hxImagesFromFiles(manifest, files);
	const ids = hxFileIdsByField(manifest, files);
	const blocks = htmlFieldToBlockId(manifest);
	const out: DrawablePicture[] = [];
	for (const field of Object.keys(images).sort((a, b) => a.localeCompare(b))) {
		const image = images[field];
		const fileId = ids.get(field);
		const blockId = blocks[field];
		if (!fileId || !blockId || !isImageFilename(image.name)) continue;
		const words = image.caption || image.name;
		out.push({ field, fileId, blockId, src: image.url, alt: words, label: words });
	}
	return out;
}

/** The drawing tool's target for a new note on one field's picture, or null. */
export function drawTargetForField(pictures: readonly DrawablePicture[], field: string): DrawingTarget | null {
	const p = pictures.find((x) => x.field === field);
	return p ? { src: p.src, alt: p.alt, fileId: p.fileId, blockId: p.blockId } : null;
}

/** The drawing tool's target for drawing on a note's own picture again. */
export function drawTargetForThread(thread: FeedbackThread, src: string, alt: string): DrawingTarget | null {
	if (!thread.fileId) return null;
	const first = thread.messages.find((m) => m.role === 'teacher');
	return {
		src,
		alt,
		fileId: thread.fileId,
		blockId: thread.blockId,
		threadId: thread.id,
		initialMarks: thread.marks,
		initialBody: first?.body ?? ''
	};
}

/** File id to the words for that picture, for a note's thumbnail. */
export function pictureWords(pictures: readonly DrawablePicture[]): Record<string, string> {
	return Object.fromEntries(pictures.map((p) => [p.fileId, p.alt]));
}

/** What the worksheet frame is handed for one student's work: the pins, the drawings and the two presses. */
export interface HtmlWorkFeedback {
	notes: Readonly<Record<string, FieldNote>>;
	marks: Readonly<Record<string, Marks>>;
	onnote: (field: string, threadId: string) => void;
	/** Present only on an instructor's side; a student's frame gets no drawing key. */
	onannotate: ((field: string) => void) | null;
}
