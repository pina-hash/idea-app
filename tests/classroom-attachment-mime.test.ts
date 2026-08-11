// tests/classroom-attachment-mime.test.ts
//
// The classroom attachment upload gate (readAttachmentForm) and the serving
// allowlist (INLINE_TYPES). Pure -- no fixture, no database.
//
// WHY THIS ONE IS HERE, against this repo's default of not writing tests for
// feature behaviour: the proxy serves these bytes FROM THE APP'S OWN ORIGIN, so
// what the allowlist admits is a security property, not a convenience. An SVG
// let through and rendered inline is same-origin script; an HTML file is the
// same problem with a different extension. That failure is invisible to
// everyone until it is exploited, which is exactly the shape of thing this
// suite exists for (the notebook-photo-mime.test.ts precedent).
//
// The acceptance half earns its place too, for the mirror-image reason the
// notebook's does: keying the allowlist on File.type ALONE rejects real files,
// because the File API REQUIRES an empty type when the platform cannot
// determine one. The extension fallback is what makes an ordinary handout
// upload; the refusals are what keep it narrow.

import { describe, expect, it } from 'vitest';
import {
	INLINE_TYPES,
	MAX_ATTACHMENT_BYTES,
	isPreviewableImage,
	readAttachmentForm
} from '../src/lib/server/classroom-attachments';

function formWith(file: File): FormData {
	const form = new FormData();
	form.set('file', file, file.name);
	return form;
}

const bytes = (n = 8) => new Uint8Array(n).fill(1);

describe('what may be uploaded', () => {
	it('accepts the ordinary handout types', () => {
		const cases: [string, string, string][] = [
			['photo.jpg', 'image/jpeg', 'jpg'],
			['diagram.png', 'image/png', 'png'],
			['rubric.pdf', 'application/pdf', 'pdf'],
			['roster.csv', 'text/csv', 'csv'],
			[
				'brief.docx',
				'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
				'docx'
			]
		];
		for (const [name, type, ext] of cases) {
			const read = readAttachmentForm(formWith(new File([bytes()], name, { type })));
			expect('error' in read, name).toBe(false);
			if ('error' in read) continue;
			expect(read.mimeType).toBe(type);
			expect(read.ext).toBe(ext);
			expect(read.filename).toBe(name);
		}
	});

	it('falls back to the extension when the platform gave no media type', () => {
		// An empty File.type is CONFORMING, not a broken browser -- and it is what
		// a phone hands over for HEIC. Refusing it would reject a real photo.
		const read = readAttachmentForm(formWith(new File([bytes()], 'IMG_0042.HEIC', { type: '' })));
		expect('error' in read).toBe(false);
		if ('error' in read) return;
		expect(read.mimeType).toBe('image/heic');
	});

	it('names a pasted screenshot rather than storing a blob with no name', () => {
		const read = readAttachmentForm(formWith(new File([bytes()], 'blob', { type: 'image/png' })));
		expect('error' in read).toBe(false);
		if ('error' in read) return;
		expect(read.filename).toBe('pasted-image.png');
	});

	it('refuses the types that would be dangerous or useless to serve back', () => {
		const refused: [string, string][] = [
			// The two that matter: both render as script from our own origin.
			['drawing.svg', 'image/svg+xml'],
			['page.html', 'text/html'],
			['index.htm', ''],
			// And the ones with no business on a class page.
			['payload.exe', 'application/x-msdownload'],
			['bundle.zip', 'application/zip'],
			['noextension', '']
		];
		for (const [name, type] of refused) {
			const read = readAttachmentForm(formWith(new File([bytes()], name, { type })));
			expect('error' in read, name).toBe(true);
			if (!('error' in read)) continue;
			expect(read.status).toBe(400);
		}
	});

	it('refuses an empty field and an oversized file', () => {
		const empty = readAttachmentForm(new FormData());
		expect('error' in empty && empty.status).toBe(400);

		const zero = readAttachmentForm(
			formWith(new File([], 'nothing.png', { type: 'image/png' }))
		);
		expect('error' in zero && zero.status).toBe(400);

		const huge = readAttachmentForm(
			formWith(
				new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], 'big.png', { type: 'image/png' })
			)
		);
		expect('error' in huge && huge.status).toBe(413);
	});
});

describe('what may be served inline', () => {
	it('never admits a script-capable type, whatever the upload gate did', () => {
		for (const type of ['image/svg+xml', 'text/html', 'application/xhtml+xml', 'text/csv']) {
			expect(INLINE_TYPES.has(type), type).toBe(false);
		}
	});

	it('admits exactly the images and PDF', () => {
		expect([...INLINE_TYPES].sort()).toEqual([
			'application/pdf',
			'image/gif',
			'image/heic',
			'image/heif',
			'image/jpeg',
			'image/png',
			'image/webp'
		]);
	});

	it('previews images only -- a PDF is inline but is not a thumbnail', () => {
		expect(isPreviewableImage('image/png')).toBe(true);
		expect(isPreviewableImage('application/pdf')).toBe(false);
		expect(isPreviewableImage('image/svg+xml')).toBe(false);
	});
});
