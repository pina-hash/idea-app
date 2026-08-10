/**
 * The upload routes' media-type allowlist.
 *
 * Kept, against this repo's default of not adding tests, because the change
 * it covers WIDENS what the server accepts. The widening is necessary: the
 * File API requires an empty `File.type` when the platform cannot determine
 * a file's media type, and that is the norm for the HEIC/HEIF photos an
 * iPhone produces -- so keying the allowlist on the declared type alone
 * refuses a real camera photo as "not an image", silently, on the exact path
 * this whole flow exists for. The risk in fixing it by consulting the
 * filename is letting through something that is not an image at all, so the
 * REFUSALS below are the half that earns the file its place.
 *
 * Pure and DB-free, unlike its neighbours here; it needs no fixture.
 */
import { describe, expect, it } from 'vitest';
import { readPhotoForm } from '$lib/server/notebook-upload';

const form = (photo: File) => { const f = new FormData(); f.set('photo', photo); return f; };
const file = (name: string, type: string, bytes = 10) =>
	new File([new Uint8Array(bytes)], name, { type });

describe('readPhotoForm mime resolution', () => {
	it('uses the declared type when present', () => {
		expect(readPhotoForm(form(file('a.jpg', 'image/jpeg')))).toMatchObject({ ext: 'jpg', mimeType: 'image/jpeg' });
	});
	it('falls back to the extension when File.type is empty (HEIC off an iPhone)', () => {
		expect(readPhotoForm(form(file('IMG_0001.HEIC', '')))).toMatchObject({ ext: 'heic', mimeType: 'image/heic' });
		expect(readPhotoForm(form(file('image.jpg', '')))).toMatchObject({ ext: 'jpg', mimeType: 'image/jpeg' });
		expect(readPhotoForm(form(file('shot.PNG', '')))).toMatchObject({ ext: 'png', mimeType: 'image/png' });
	});
	it('accepts the image/jpg alias some Android pickers emit', () => {
		expect(readPhotoForm(form(file('image.jpg', 'image/jpg')))).toMatchObject({ ext: 'jpg', mimeType: 'image/jpeg' });
	});
	it('still refuses a genuine non-image', () => {
		expect(readPhotoForm(form(file('notes.pdf', 'application/pdf')))).toMatchObject({ status: 400 });
		expect(readPhotoForm(form(file('noext', '')))).toMatchObject({ status: 400 });
	});
	it('still enforces the size cap', () => {
		expect(readPhotoForm(form(file('big.jpg', 'image/jpeg', 5 * 1024 * 1024)))).toMatchObject({ status: 413 });
	});
});
