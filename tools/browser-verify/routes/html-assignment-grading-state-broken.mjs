/**
 * A PHOTOGRAPH THAT WILL NOT DECODE FALLS BACK TO ITS ROW, NEVER TO A BROKEN
 * IMAGE ICON AND NEVER TO SILENCE.
 *
 * A submission file is served `application/octet-stream` with an attachment
 * disposition, which an `<img>` decodes perfectly (measured in Chromium,
 * CLAUDE.md's classroom-files section) -- but the object may be a `.SLDPRT` a
 * document called a photo, or bytes that never landed. The honest answer then
 * is the field, the name, the caption and a marker saying so, because a grader
 * looking at a broken-image glyph cannot tell it from a missing hand-in.
 *
 * THE BRANCH IS NOT HYPOTHETICAL. The first fixture PNG in this harness was
 * valid base64 carrying malformed PNG; it decoded to nothing and silently put
 * this row on screen in the state meant to show a working thumbnail, where
 * every content assertion still passed. Measuring both halves is what separates
 * them.
 *
 * ITS OWN SPEC, for the reason the empty one is: a route spec measures one URL.
 */
import { OPEN_FIRST_STUDENT } from './html-assignment-grading.mjs';

export default {
	path: '/dev/html-assignment-grading?state=broken',
	/* NO `aliasOf`: it makes `urlFor` visit the BASE path, which would measure
	   the default fixture under this file's name. See the empty spec. */
	label: 'Grading console: an attached photo whose bytes will not decode',

	prepare: OPEN_FIRST_STUDENT,

	orderResult: [
		{
			label: 'the fallback row, with the name and the caption still readable',
			evaluate: `() => [
				'thumbs=' + document.querySelectorAll('.hx-image-thumb').length,
				'fallbacks=' + document.querySelectorAll('.hx-image-missing').length,
				'name=' + (document.querySelector('.hx-image-name')?.textContent ?? 'absent'),
				'field=' + (document.querySelector('.hx-image-field')?.textContent ?? 'absent'),
				/* A control absent for a reason says the reason. */
				'says=' + [...document.querySelectorAll('.hx-image-caption')].some((n) => n.textContent.includes('could not be shown'))
			]`,
			expected: [
				'thumbs=0',
				'fallbacks=1',
				'name=blade-root-fillet.png',
				'field=photo',
				'says=true'
			]
		}
	],

	presence: [
		{ selector: '.hx-image-missing', label: 'the fallback marker', expectPresent: 1, maxPresent: 1 },
		{ selector: '.hx-image-thumb', label: 'thumbnails (none: these bytes do not decode)', expectPresent: 0 },
		/* The strip is still there, which is what stops the two absence rows
		   above passing on a page that simply rendered no photos at all. */
		{ selector: '.hx-images', label: 'the photo strip itself', expectPresent: 1, maxPresent: 1 }
	],

	contrast: [{ selector: '.hx-image-name', label: 'the filename on the fallback row', min: 4.5 }]
};
