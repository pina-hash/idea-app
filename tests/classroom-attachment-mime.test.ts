// tests/classroom-attachment-mime.test.ts
//
// THE CLASSROOM UPLOAD GATE, AND THE THREE PROPERTIES THAT REPLACED IT.
//
// This file used to pin a twelve-entry type allowlist in both directions: the
// handout types that had to be accepted, and the script-capable types that had
// to be refused. That was the right test for the design it was written against
// -- attachments were served back FROM OUR OWN ORIGIN, where a `text/html`
// response runs as same-origin script, so the list was the whole of the
// defence and freezing it was the point.
//
// 0133 replaced the list rather than widening it, and this file follows. The
// old design also refused `.SLDPRT`, `.SLDASM`, `.STEP`, `.DXF`, `.f3d`,
// `.dwg`, `.ino` and every archive -- essentially everything an engineering
// class produces -- and a student handing in a CAD part was told their file
// "must be an image, PDF, text, CSV, or an Office document".
//
// WHAT IS ASSERTED NOW IS WHY THAT IS SAFE, because "no allowlist" is only
// safe in the presence of three specific things and each of them would break
// SILENTLY:
//
//   1. ONE CONTENT TYPE. Every object is stored and served as
//      application/octet-stream. `File.type` is never read -- it is a guess,
//      chosen by whoever is uploading, and it decides what a browser does with
//      the response.
//   2. AN OPAQUE KEY. The stored path is `<owner_id>/<uuid>.<ext>` and contains
//      nothing a person typed, so there is no traversal to escape and no
//      sanitizer to get right. The name they typed is stored separately and is
//      what they see.
//   3. A FORCED DOWNLOAD. Every read is a signed URL carrying
//      `download=<filename>`, so nothing uploaded is ever rendered inline.
//
// The acceptance half is generalized rather than deleted: it no longer lists
// which types pass, it asserts that a set of things which USED to be refused
// now pass, plus the two refusals that survive (nothing to upload, and a size
// that will never fit). Per the repo's rule, an assertion a legitimate change
// breaks is generalized to the RULE, never dropped.
//
// The INLINE_TYPES half is unchanged and is now doing a NARROWER job: it
// governs only attachments posted before 0133, which are Drive-backed and were
// filtered by the old allowlist on the way in. It must not grow.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	INLINE_TYPES,
	MAX_DRIVE_ATTACHMENT_BYTES,
	MAX_STORAGE_BYTES,
	STORAGE_CONTENT_TYPE,
	downloadFilename,
	fileExtension,
	isPreviewableImage,
	readAttachmentForm,
	storageObjectKey
} from '../src/lib/server/classroom-attachments';
import { CLASSROOM_UPLOAD_MAX_BYTES } from '../src/lib/classroom/file-upload';
import { classifyUploadError, tooLarge } from '../src/lib/classroom/upload-errors';
import { isPreviewableFile } from '../src/lib/classroom/classroom';

function formWith(file: File): FormData {
	const form = new FormData();
	form.set('file', file, file.name);
	return form;
}

const bytes = (n = 8) => new Uint8Array(n).fill(1);

// ---------------------------------------------------------------------------
// No allowlist, in either direction
// ---------------------------------------------------------------------------

describe('what may be uploaded', () => {
	/**
	 * THE REGRESSION LIST. Every one of these was refused with HTTP 400 before
	 * 0133 -- the CAD formats a class actually produces, an archive, a firmware
	 * sketch, a file with no extension, and a file the browser could not type.
	 * They are the whole reason the bundle exists, so they are named.
	 */
	const ONCE_REFUSED: [name: string, type: string][] = [
		['bracket.SLDPRT', ''],
		['chassis.SLDASM', 'application/octet-stream'],
		['assembly.STEP', ''],
		['plate.DXF', 'image/vnd.dxf'],
		['part.f3d', ''],
		['sketch.dwg', 'application/acad'],
		['firmware.ino', 'text/plain'],
		['bundle.zip', 'application/zip'],
		['payload.exe', 'application/x-msdownload'],
		['drawing.svg', 'image/svg+xml'],
		['page.html', 'text/html'],
		['noextension', ''],
		['Estudio (final) café.SLDPRT', '']
	];

	it('accepts every file type, including all thirteen it used to refuse', () => {
		expect(ONCE_REFUSED.length).toBe(13); // the sweep generated something
		for (const [name, type] of ONCE_REFUSED) {
			const read = readAttachmentForm(formWith(new File([bytes()], name, { type })));
			expect('error' in read, name).toBe(false);
		}
	});

	it('NEVER carries File.type through, however plausible it looked', () => {
		// The one property that makes the missing allowlist safe. A file
		// announcing itself as text/html must be stored as octet-stream, exactly
		// like everything else -- and so must a genuine JPEG, because a per-file
		// decision is a decision an uploader gets to influence.
		for (const [name, type] of [...ONCE_REFUSED, ['photo.jpg', 'image/jpeg'] as [string, string]]) {
			const read = readAttachmentForm(formWith(new File([bytes()], name, { type })));
			expect('error' in read).toBe(false);
			if ('error' in read) continue;
			expect(read.mimeType, `${name} (${type || 'no type'})`).toBe('application/octet-stream');
		}
		expect(STORAGE_CONTENT_TYPE).toBe('application/octet-stream');
	});

	it('keeps the extension it was given, lowercased, and tolerates having none', () => {
		expect(fileExtension('bracket.SLDPRT')).toBe('sldprt');
		expect(fileExtension('archive.tar.gz')).toBe('gz');
		expect(fileExtension('noextension')).toBe('');
		expect(fileExtension('.gitignore')).toBe('gitignore');
		expect(fileExtension(null)).toBe('');
		// Bounded: an unbounded tail becomes part of a storage key.
		expect(fileExtension('x.thisextensioniswaytoolong')).toBe('');
	});

	it('still names a pasted screenshot rather than storing a blob with no name', () => {
		const read = readAttachmentForm(formWith(new File([bytes()], 'blob', { type: 'image/png' })));
		expect('error' in read).toBe(false);
		if ('error' in read) return;
		expect(read.filename).toBe('pasted-image.png');
	});

	it('refuses only an absent field, an empty file, and a size that cannot fit', () => {
		const empty = readAttachmentForm(new FormData());
		expect('error' in empty && empty.status).toBe(400);

		const zero = readAttachmentForm(formWith(new File([], 'nothing.sldprt', { type: '' })));
		expect('error' in zero && zero.status).toBe(400);

		const huge = readAttachmentForm(
			formWith(new File([new Uint8Array(MAX_DRIVE_ATTACHMENT_BYTES + 1)], 'big.sldasm'))
		);
		expect('error' in huge && huge.status).toBe(413);
		// AND IT STATES THE LIMIT. "Too large" with no number is a guessing game.
		expect('error' in huge && huge.error).toMatch(/4 MB/);
	});
});

// ---------------------------------------------------------------------------
// The key is opaque, and the name survives
// ---------------------------------------------------------------------------

describe('the storage key', () => {
	const OWNER = '11111111-2222-3333-4444-555555555555';

	it('is <owner>/<uuid>.<ext> and carries nothing a person typed', () => {
		const key = storageObjectKey(OWNER, 'Estudio (final) café.SLDPRT');
		expect(key).toMatch(
			/^11111111-2222-3333-4444-555555555555\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.sldprt$/
		);
		// The name is not in the path, in any form -- not slugged, not encoded.
		expect(key.toLowerCase()).not.toContain('estudio');
		expect(key).not.toContain(' ');
		expect(key).not.toContain('(');
	});

	it('has nothing to traverse to, whatever the filename was', () => {
		for (const hostile of [
			'../../etc/passwd',
			'..\\..\\windows\\system32\\x.dll',
			'a/b/c.png',
			'%2e%2e%2fx.png'
		]) {
			const key = storageObjectKey(OWNER, hostile);
			// Exactly two segments: the owner id and the uuid.
			expect(key.split('/'), hostile).toHaveLength(2);
			expect(key.startsWith(`${OWNER}/`), hostile).toBe(true);
			expect(key.includes('..'), hostile).toBe(false);
		}
	});

	it('never collides for two people uploading the same filename', () => {
		const keys = new Set(Array.from({ length: 200 }, () => storageObjectKey(OWNER, 'report.pdf')));
		expect(keys.size).toBe(200);
	});

	it('loses the extension only when there was none', () => {
		expect(storageObjectKey(OWNER, 'Makefile').endsWith('Makefile')).toBe(false);
		expect(storageObjectKey(OWNER, 'Makefile')).not.toContain('.');
		expect(storageObjectKey(OWNER, 'x.step').endsWith('.step')).toBe(true);
	});
});

describe('the download filename', () => {
	/**
	 * MEASURED, NOT REASONED. The first version of this passed the name through
	 * almost untouched, and against a real Supabase project
	 * `Estudio (final) café.SLDPRT` came back in the header as
	 * `filename=Estudio%20%2528final%2529%20caf%25C3%25A9.SLDPRT` -- `%2528` is
	 * an encoded `%28`, so the value is escaped once into the signed URL's query
	 * string and again into the header, and the browser saves a name full of
	 * literal percent escapes. Every fixture whose name was `[A-Za-z0-9.-]` came
	 * back clean. So the value handed over is ASCII-only by construction.
	 */
	it('is ASCII-safe, because two encoding layers mangle anything else', () => {
		expect(downloadFilename('Estudio (final) café.SLDPRT')).toBe('Estudio_final_cafe.SLDPRT');
		expect(downloadFilename('bracket.SLDPRT')).toBe('bracket.SLDPRT');
		expect(downloadFilename('full-robot.SLDASM')).toBe('full-robot.SLDASM');
		expect(downloadFilename('noextension')).toBe('noextension');
	});

	it('folds diacritics to their base letters rather than dropping them', () => {
		// A transliteration is still readable; a hole is not.
		expect(downloadFilename('résumé.pdf')).toBe('resume.pdf');
		expect(downloadFilename('Ångström.step')).toBe('Angstrom.step');
	});

	it('collapses everything a header or a path would have to escape', () => {
		expect(downloadFilename('a/b\\c"d.zip')).toBe('a_b_c_d.zip');
		expect(downloadFilename('tab\there.txt')).toBe('tab_here.txt');
		expect(downloadFilename('   ')).toBe('download');
		expect(downloadFilename(null)).toBe('download');
		// A name that is ENTIRELY unsafe still gets something usable.
		expect(downloadFilename('（）')).toBe('download');
	});

	it('does not touch the DISPLAY name, which is the half that matters', () => {
		// The stored `filename` column is verbatim -- asserted against the real
		// row in tests/classroom-storage-objects.test.ts. This only governs what
		// a browser writes to disk.
		expect(downloadFilename('Estudio (final) café.SLDPRT')).not.toBe(
			'Estudio (final) café.SLDPRT'
		);
	});
});

// ---------------------------------------------------------------------------
// The caps agree with each other
// ---------------------------------------------------------------------------

describe('the size caps', () => {
	it('the client copy, the server copy and the bucket all say 200 MiB', () => {
		expect(MAX_STORAGE_BYTES).toBe(209715200);
		expect(CLASSROOM_UPLOAD_MAX_BYTES).toBe(MAX_STORAGE_BYTES);
		// THE BOUNDARY, read out of the migration itself rather than restated
		// here -- a constant that agrees with a second constant proves nothing
		// about the bucket that actually enforces it.
		const sql = readFileSync('supabase/migrations/0133_classroom_storage_attachments.sql', 'utf8');
		const limits = [...sql.matchAll(/file_size_limit\s*=?\s*,?\s*(\d{6,})/g)].map((m) => m[1]);
		const inserted = [...sql.matchAll(/false,\s*(\d{6,}),\s*null/g)].map((m) => m[1]);
		expect([...limits, ...inserted].length).toBeGreaterThan(0);
		for (const value of [...limits, ...inserted]) {
			expect(Number(value)).toBe(MAX_STORAGE_BYTES);
		}
	});

	it('neither bucket declares an allowed_mime_types list', () => {
		// THE BEHAVIOURAL CHECK IS IN tests/classroom-storage-objects.test.ts,
		// which reads allowed_mime_types back off the real storage.buckets row
		// after applying this migration and asserts it is NULL. This one is the
		// cheap textual backstop for the way it would most plausibly come back:
		// somebody adds a list "just for the obvious dangerous ones".
		const sql = readFileSync('supabase/migrations/0133_classroom_storage_attachments.sql', 'utf8');
		expect((sql.match(/allowed_mime_types = null/g) ?? []).length).toBe(2);
		// No array literal or array constructor anywhere near the column.
		expect(sql).not.toMatch(/allowed_mime_types\s*=\s*(array|'\{|ARRAY)/i);
	});
});

// ---------------------------------------------------------------------------
// A refusal names its gate
// ---------------------------------------------------------------------------

describe('a refusal names its gate', () => {
	it('a size refusal states BOTH the size and the limit', () => {
		const r = tooLarge(300 * 1024 * 1024, MAX_STORAGE_BYTES);
		expect(r.gate).toBe('too_large');
		expect(r.message).toMatch(/300\.0 MB/);
		expect(r.message).toMatch(/200 MB/);
		// Retrying the same file cannot help, so it is not offered.
		expect(r.retryable).toBe(false);
	});

	it('an expired signed URL is told apart from a broken file', () => {
		// Storage answers a stale upload token with a 400 and a jwt complaint,
		// NOT a 401 -- the token is in the query string, so there is nothing to
		// challenge for. Read as a plain 400 this says "your file is broken".
		const r = classifyUploadError({
			status: 400,
			detail: 'jwt expired',
			role: 'attachment',
			maxBytes: MAX_STORAGE_BYTES
		});
		expect(r.gate).toBe('expired');
		expect(r.message).toMatch(/link/i);
		expect(r.retryable).toBe(true);
	});

	it('an RLS denial says whose permission was missing, per side', () => {
		const teacher = classifyUploadError({
			status: 403,
			detail: 'new row violates row-level security policy',
			role: 'attachment',
			maxBytes: MAX_STORAGE_BYTES
		});
		expect(teacher.gate).toBe('denied');
		expect(teacher.message).toMatch(/teacher of record/i);

		const student = classifyUploadError({
			status: 403,
			detail: 'new row violates row-level security policy',
			role: 'submission',
			maxBytes: MAX_STORAGE_BYTES
		});
		expect(student.gate).toBe('denied');
		expect(student.message).toMatch(/your own submission/i);
	});

	it('never renders a bare "Upload failed", even for a status nobody planned for', () => {
		const r = classifyUploadError({
			status: 507,
			detail: 'Insufficient Storage',
			role: 'submission',
			maxBytes: MAX_STORAGE_BYTES
		});
		// The server's own sentence, verbatim, plus the status. Not paraphrased.
		expect(r.message).toBe('Insufficient Storage (HTTP 507)');
		expect(r.message).not.toMatch(/^Upload failed\.?$/);
	});
});

// ---------------------------------------------------------------------------
// Nothing branches on File.type any more
// ---------------------------------------------------------------------------

describe('no client code branches on File.type', () => {
	it('the staged preview reads the extension, not the type', () => {
		// A HEIC off an iPhone carries an EMPTY type. Under the old rule it
		// previewed only because of a fallback; now it is the ordinary path.
		expect(isPreviewableFile(new File([bytes()], 'IMG_0042.HEIC', { type: '' }))).toBe(true);
		// And a file LYING about being an image gets no special treatment either
		// way: the extension decides, and a non-image simply fails to decode.
		expect(isPreviewableFile(new File([bytes()], 'part.sldprt', { type: 'image/png' }))).toBe(
			false
		);
		expect(isPreviewableFile(new File([bytes()], 'diagram.png', { type: '' }))).toBe(true);
	});

	it('no `accept` attribute gates a plain file picker on either side', () => {
		// A SWEEP, not a spot check: an `accept` added to any of these later is
		// exactly the regression that silently re-narrows what can be handed in.
		const surfaces = [
			'src/lib/classroom/FileUploadPanel.svelte',
			'src/lib/classroom/ContentComposer.svelte',
			'src/lib/classroom/AssignmentEngine.svelte',
			'src/lib/classroom/SpecRenderer.svelte'
		];
		let inputs = 0;
		for (const path of surfaces) {
			const src = readFileSync(path, 'utf8');
			for (const m of src.matchAll(/<input[^>]*type="file"[^>]*>/g)) {
				inputs += 1;
				const tag = m[0];
				if (!tag.includes('accept=')) continue;
				// THE DECK INPUT IS NOT AN ATTACHMENT PICKER. A presentation deck
				// is a zip by construction -- the server unpacks it into a file
				// manifest -- so `.zip` there is a statement about what the FEATURE
				// consumes, not a policy about what a person may hand in. Exempt by
				// its own testid rather than by "contains .zip", so a new picker
				// cannot inherit the exemption by accident.
				if (tag.includes('data-testid="staged-deck-input"')) continue;
				// THE ONE EXEMPTION, and it is narrow: a camera button. `capture`
				// is what makes a phone open its camera, and an unfiltered capture
				// input opens a file browser instead -- so it needs `image/*` to
				// work at all. It is only ever an affordance BESIDE an unfiltered
				// picker, never instead of one, which is why it gates nothing.
				expect(tag, `${path}: ${tag}`).toContain('capture=');
				expect(tag, `${path}: ${tag}`).toContain('accept="image/*"');
			}
		}
		// The sweep found something. Without this an empty match set passes.
		expect(inputs).toBeGreaterThanOrEqual(3);
	});
});

// ---------------------------------------------------------------------------
// The legacy inline set, which now governs Drive-backed rows only
// ---------------------------------------------------------------------------

describe('what may be served inline', () => {
	it('never admits a script-capable type, whatever the upload gate did', () => {
		for (const type of ['image/svg+xml', 'text/html', 'application/xhtml+xml', 'text/csv']) {
			expect(INLINE_TYPES.has(type), type).toBe(false);
		}
	});

	it('admits exactly the images and PDF, and must not grow', () => {
		// This set no longer describes what CAN be uploaded -- it describes what
		// the Drive proxy will render inline for rows written BEFORE 0133, all of
		// which passed the old twelve-type allowlist. A storage-backed object is
		// served by Supabase as octet-stream with an attachment disposition and
		// never reaches this list, so adding a type here can only ever weaken the
		// legacy path.
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

	it('the new download path forces attachment, with no inline branch at all', () => {
		// Read out of the routes themselves: the `download` option on
		// createSignedUrl IS the Content-Disposition, and a route that stopped
		// passing it would serve a student's .html inline from supabase.co.
		for (const path of [
			'src/routes/api/classroom/attachment/[attachment_id]/+server.ts',
			'src/routes/api/classroom/submission-file/[file_id]/+server.ts'
		]) {
			const src = readFileSync(path, 'utf8');
			expect(src, path).toContain('createSignedUrl(');
			expect(src, path).toContain('download: downloadFilename(');
		}
	});
});
