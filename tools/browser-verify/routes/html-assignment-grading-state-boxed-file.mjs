/**
 * A FILE THAT IS NOT A PICTURE, IN THE BOX THE DOCUMENT HOLDS OPEN (ledger 0368).
 *
 * An image block stores whatever it is sent -- the Dogtag takes a `.SLDPRT` --
 * and before ledger 0368 the frame asked an `<img>` to decode every stored
 * file, fetched a part file through the proxy only to fail, and then offered no
 * way to get it. `isImageFilename` is the one rule now: a name that is not a
 * picture is a tile with its kind, its name and a worded Download, and no image
 * request is made at all. This is Mr. Pina's "download button ... is not
 * working" report from the parent's side: the document's own button works
 * since `allow-downloads` joined the sandbox, and this Download needs no flag.
 *
 * `?state=boxed-file` is the boxed fixture with the stored file renamed
 * `dogtag.SLDPRT` and its bytes a part file's.
 */
import { OPEN_AND_WAIT_FOR_BOX } from './html-assignment-grading-state-boxed.mjs';

export default {
	path: '/dev/html-assignment-grading?state=boxed-file',
	label: 'Grading console: a part file drawn as a tile with a Download, in the document\'s box',

	prepare: OPEN_AND_WAIT_FOR_BOX,

	orderResult: [
		{
			label: 'a tile, not a picture: no image is requested for a part file',
			evaluate: `() => {
				const tile = document.querySelector('[data-testid="hx-image-over-file"]');
				const a = document.querySelector('[data-testid="hx-image-over-download"]');
				return [
					'tiles=' + document.querySelectorAll('[data-testid="hx-image-over-file"]').length,
					'imgsInOverlay=' + document.querySelectorAll('.hx-image-over img').length,
					'pictureButtons=' + document.querySelectorAll('[data-testid="hx-image-over"]').length,
					'name=' + (tile?.querySelector('.hx-image-over-name')?.textContent ?? 'absent'),
					'hrefIsTheStoredFile=' + (a?.getAttribute('href') ?? '').startsWith('data:application/octet-stream'),
					'downloadName=' + (a?.getAttribute('download') ?? 'absent'),
					'saysNotAPicture=' + (tile?.textContent.includes('could not be shown') ?? false),
					'strip=' + document.querySelectorAll('.hx-images').length,
					'lightbox=' + document.querySelectorAll('dialog[data-testid="hx-lightbox"]').length
				];
			}`,
			expected: [
				'tiles=1',
				'imgsInOverlay=0',
				'pictureButtons=0',
				'name=dogtag.SLDPRT',
				'hrefIsTheStoredFile=true',
				'downloadName=dogtag.SLDPRT',
				/* The sentence belongs to a picture-NAMED file whose bytes did not
				   decode, not to a file that never claimed to be one. */
				'saysNotAPicture=false',
				'strip=0',
				/* Nothing here is a picture, so there is no viewer to open. */
				'lightbox=0'
			]
		},
		{
			label: 'the Download is on top of the frame and can be pressed',
			evaluate: `async () => {
				const a = document.querySelector('[data-testid="hx-image-over-download"]');
				if (!a) return ['absent'];
				a.scrollIntoView({ block: 'center', behavior: 'instant' });
				await new Promise((r) => setTimeout(r, 100));
				const r = a.getBoundingClientRect();
				const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
				return ['centreHitsDownload=' + (hit === a || a.contains(hit))];
			}`,
			expected: ['centreHitsDownload=true']
		}
	],

	presence: [
		{ selector: '[data-testid="hx-image-over-file"]', label: 'the file tile in the box', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="hx-image-over-download"]', label: 'its worded Download', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.hx-image-over img', label: 'an image element in the box (none for a part file)', expectPresent: 0 }
	],

	tapTargets: [{ selector: '[data-testid="hx-image-over-download"]', label: 'the Download in the box', min: 44 }],

	contrast: [
		{ selector: '.hx-image-over-name', label: 'the filename on the tile', min: 4.5 },
		{ selector: '[data-testid="hx-image-over-download"]', label: 'the Download word', min: 4.5 },
		{ selector: '.hx-image-over .hx-file-glyph', label: 'the file kind', min: 4.5 }
	]
};
