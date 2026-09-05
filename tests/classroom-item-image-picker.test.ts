// tests/classroom-item-image-picker.test.ts
//
// 0041: the editor's Image control asked for a FILENAME, typed by hand. This
// file is about the list that replaced it.
//
// WHAT IS WORTH A TEST HERE, under this repo's rule that automated tests are
// the exception: every claim below fails SILENTLY. A picker that offers a name
// the renderer refuses produces a body that looks perfectly correct in the
// editor and shows a marker to a class three days later; a staged file's
// predicted name drifting from the one the record route writes produces the
// same thing with nothing on either side to say so; and the free-text fallback
// disappearing would take the image control off two surfaces this bundle does
// not own, which nothing on screen reports because the button simply stops
// having a field in it.
//
// NO DOM. `environment: 'node'`, the convention classroom-item-images.test.ts
// established one prompt earlier: the module under test is pure, and the two
// component claims are asserted on the SOURCE because the editor's runtime is
// a browser-only dynamic import. The BROWSER half of the proof is
// `npm run verify:browser` on /dev/item-images, which drives the real control.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	ATTACHMENT_REF_PREFIX,
	attachmentRef,
	imageChoices,
	isOfferedRef,
	recordedAttachmentFilename
} from '$lib/classroom/attachments';
import {
	isImageFilename,
	resolveFigureSrc,
	sanitizeAttachmentFilename,
	type ClassroomAttachment
} from '$lib/classroom/classroom';

const PICTURES: ClassroomAttachment[] = [
	{ id: 'a1', filename: 'bearing-race.png', mime_type: 'image/png', sort_order: 0 },
	{ id: 'a2', filename: 'truss-detail.jpg', mime_type: 'image/jpeg', sort_order: 1 }
];

// ---------------------------------------------------------------------------
// Part 1. THE OFFER IS EXACTLY WHAT THE RENDERER WILL DRAW.
// ---------------------------------------------------------------------------
describe('what the picker offers', () => {
	it('offers an attachment that reads as a picture and resolves', () => {
		const out = imageChoices({ attached: PICTURES });
		expect(out.map((c) => c.ref)).toEqual([
			'attachment:bearing-race.png',
			'attachment:truss-detail.jpg'
		]);
		expect(out.every((c) => c.state === 'attached')).toBe(true);
	});

	/**
	 * THE POSITIVE CONTROL FOR THIS WHOLE FILE, and the one B3 asks for by
	 * name: every offered reference is put BACK through `resolveFigureSrc`, on
	 * the same list, and must come back `ok`. It is generated rather than
	 * spelled out, and the case count is asserted, so a corpus that generated
	 * nothing cannot pass.
	 *
	 * THE EXPECTED VALUE DOES NOT COME FROM THE THING UNDER TEST. `imageChoices`
	 * produces the offers; `resolveFigureSrc` -- a module 0041 does not touch --
	 * is what judges them.
	 */
	it('EVERY offer resolves, over a corpus that includes what must be refused', () => {
		const corpus: ClassroomAttachment[] = [
			...PICTURES,
			{ id: 'a3', filename: 'schematic.svg', mime_type: 'image/svg+xml', sort_order: 2 },
			{ id: 'a4', filename: 'plan.SVGZ', mime_type: 'image/png', sort_order: 3 },
			{ id: 'a5', filename: 'sneaky.png', mime_type: 'image/svg+xml', sort_order: 4 },
			{ id: 'a6', filename: 'safety-sheet.pdf', mime_type: 'application/pdf', sort_order: 5 },
			{ id: 'a7', filename: 'assembly.SLDASM', mime_type: 'application/octet-stream', sort_order: 6 },
			{ id: 'a8', filename: '', mime_type: 'image/png', sort_order: 7 },
			{ id: 'a9', filename: 'BEARING-RACE.PNG', mime_type: 'image/png', sort_order: 8 }
		];
		const out = imageChoices({ attached: corpus });
		expect(corpus.length).toBe(9);
		expect(out).toHaveLength(2);
		for (const choice of out) {
			const back = resolveFigureSrc(choice.ref, corpus);
			expect(back.ok, `${choice.ref} was offered but does not resolve`).toBe(true);
		}
	});

	it('refuses an SVG by its NAME and by its stored MIME, which are two different rows', () => {
		const byName = imageChoices({
			attached: [{ id: 's1', filename: 'schematic.svg', mime_type: 'image/png', sort_order: 0 }]
		});
		const byMime = imageChoices({
			attached: [{ id: 's2', filename: 'sneaky.png', mime_type: 'image/svg+xml', sort_order: 0 }]
		});
		expect(byName).toHaveLength(0);
		expect(byMime).toHaveLength(0);
		// The positive control: the same shapes with the SVG-ness removed are
		// offered, so "0 offers" cannot be satisfied by a module that offers
		// nothing at all.
		expect(
			imageChoices({
				attached: [{ id: 's3', filename: 'schematic.png', mime_type: 'image/png', sort_order: 0 }]
			})
		).toHaveLength(1);
	});

	it('refuses a name that does not read as a picture, even though the alias RESOLVES', () => {
		const pdf: ClassroomAttachment[] = [
			{ id: 'p1', filename: 'safety-sheet.pdf', mime_type: 'application/pdf', sort_order: 0 }
		];
		// The distinction being drawn: the resolver is happy, because it decides
		// ACCESS and not whether bytes decode. An `img` pointed here is a broken
		// picture with a perfectly valid reference behind it.
		expect(resolveFigureSrc('attachment:safety-sheet.pdf', pdf).ok).toBe(true);
		expect(isImageFilename('safety-sheet.pdf')).toBe(false);
		expect(imageChoices({ attached: pdf })).toHaveLength(0);
	});

	it('offers a name only ONCE, because the alias matches case-insensitively and first match wins', () => {
		const dupes: ClassroomAttachment[] = [
			{ id: 'd1', filename: 'photo.png', mime_type: 'image/png', sort_order: 0 },
			{ id: 'd2', filename: 'PHOTO.PNG', mime_type: 'image/png', sort_order: 1 }
		];
		const out = imageChoices({ attached: dupes });
		expect(out).toHaveLength(1);
		expect(out[0].filename).toBe('photo.png');
		// And a staged file cannot claim a name an attachment already holds.
		expect(
			imageChoices({ attached: dupes, staged: [{ name: 'photo.png' }] })
		).toHaveLength(1);
	});

	it('a thumbnail is the SAME src the page will use, and a staged row has none', () => {
		const out = imageChoices({ attached: PICTURES, staged: [{ name: 'jig.jpg' }] });
		const attached = out.find((c) => c.state === 'attached')!;
		const staged = out.find((c) => c.state === 'staged')!;
		const resolved = resolveFigureSrc(attached.ref, PICTURES);
		expect(resolved.ok && resolved.src).toBe(attached.previewSrc);
		// Nothing but this browser's memory holds a staged file's bytes, and the
		// composer's own Files panel is already previewing them.
		expect(staged.previewSrc).toBeNull();
	});

	it('no input, no offers, and no throw', () => {
		expect(imageChoices({})).toEqual([]);
		expect(imageChoices({ attached: [], staged: [] })).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Part 2. A STAGED FILE, WHICH IS THE ONLY KIND A CREATE HAS.
// ---------------------------------------------------------------------------
describe('a file staged but not uploaded', () => {
	it('is offered under the name the item will actually record', () => {
		const out = imageChoices({ staged: [{ name: 'first cut.JPG' }] });
		expect(out).toHaveLength(1);
		expect(out[0].ref).toBe('attachment:first-cut.JPG');
		expect(out[0].state).toBe('staged');
		// And the row SAYS the name moved, because a person choosing
		// `first cut.JPG` off a list should not have to discover that the item
		// calls it something else.
		expect(out[0].label).toBe('first cut.JPG (saved as first-cut.JPG)');
	});

	it('a name needing no repair shows itself and nothing else', () => {
		expect(imageChoices({ staged: [{ name: 'jig-setup.jpg' }] })[0].label).toBe('jig-setup.jpg');
	});

	it('is refused on exactly the rules an attached one is', () => {
		expect(imageChoices({ staged: [{ name: 'notes.pdf' }] })).toHaveLength(0);
		expect(imageChoices({ staged: [{ name: 'schematic.svg' }] })).toHaveLength(0);
		expect(imageChoices({ staged: [{ name: '   ' }] })).toHaveLength(0);
		// Positive control for the three above.
		expect(imageChoices({ staged: [{ name: 'notes.png' }] })).toHaveLength(1);
	});

	it('attached comes before staged, because attached is what already resolves', () => {
		const out = imageChoices({ attached: PICTURES, staged: [{ name: 'jig.jpg' }] });
		expect(out.map((c) => c.state)).toEqual(['attached', 'attached', 'staged']);
	});
});

/**
 * THE TRIPWIRE. `recordedAttachmentFilename` predicts what
 * `/api/classroom/attachment` will store, and 0041 owns neither that route nor
 * a migration -- so the two statements of the rule cannot yet be ONE function
 * and are pinned together here instead. Folding the route onto the helper is
 * the follow-up and it is one import.
 *
 * It asserts the route's three constituents rather than its whole expression:
 * a whitespace change must not redden this, and a change to WHAT IT DOES must.
 */
describe('the predicted name and the recorded name are the same rule', () => {
	const route = readFileSync(
		new URL('../src/routes/api/classroom/attachment/+server.ts', import.meta.url),
		'utf8'
	);

	it('the route still sanitizes, still caps at 300, and still defaults', () => {
		expect(route).toContain('sanitizeAttachmentFilename(');
		expect(route).toContain('.slice(0, 300)');
		expect(route).toContain("|| 'attachment'");
	});

	it('the helper agrees with those three over a corpus, corners included', () => {
		const corpus = [
			'teardown-03.jpg',
			'first cut.JPG',
			'  padded.png  ',
			'(bracket).png',
			'a'.repeat(400) + '.png',
			'()',
			''
		];
		expect(corpus).toHaveLength(7);
		for (const raw of corpus) {
			const expected =
				sanitizeAttachmentFilename(String(raw ?? '').trim().slice(0, 300)) || 'attachment';
			expect(recordedAttachmentFilename(raw), `disagreed on ${JSON.stringify(raw)}`).toBe(
				expected
			);
		}
		// The two corners the picker itself can never reach, asserted anyway
		// because the helper is what the route would import.
		expect(recordedAttachmentFilename('()')).toBe('attachment');
		expect(recordedAttachmentFilename('a'.repeat(400) + '.png').length).toBe(300);
	});
});

// ---------------------------------------------------------------------------
// Part 3. THE HANDLER'S OWN ALLOWLIST.
// ---------------------------------------------------------------------------
describe('the insert handler can only write what was offered', () => {
	const offers = imageChoices({ attached: PICTURES });

	it('accepts an offered reference and refuses everything else', () => {
		expect(isOfferedRef(offers, 'attachment:bearing-race.png')).toBe(true);
		expect(isOfferedRef(offers, 'attachment:not-here.png')).toBe(false);
		// The empty prefix is the exact shape the old prefill produced, and it
		// is what `resolveFigureSrc` refuses as `empty`.
		expect(isOfferedRef(offers, ATTACHMENT_REF_PREFIX)).toBe(false);
		expect(isOfferedRef(offers, '')).toBe(false);
		expect(isOfferedRef(offers, 'https://evil.example/beacon.png')).toBe(false);
		// A case variant is NOT the offered string, even though the resolver
		// would match it: the handler's question is "was this on the list".
		expect(isOfferedRef(offers, 'attachment:BEARING-RACE.PNG')).toBe(false);
	});

	it('attachmentRef is the writing half of the scheme resolveFigureSrc reads', () => {
		expect(attachmentRef('x.png')).toBe('attachment:x.png');
		expect(resolveFigureSrc(attachmentRef('bearing-race.png'), PICTURES).ok).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Part 4. THE COMPONENT CONTRACTS, on the source.
// ---------------------------------------------------------------------------
describe('the editor', () => {
	const src = readFileSync(
		new URL('../src/lib/classroom/RichTextEditor.svelte', import.meta.url),
		'utf8'
	);

	it('KEEPS the free-text field for a caller that passes no list', () => {
		// SpecProseField and CheckInGuidance are not 0041's to change, and
		// neither can say which pictures exist. Losing this branch would take
		// the image control off both of them, silently -- the button would still
		// be there and the popover would say there is nothing to place.
		expect(src).toContain('const picking = $derived(images != null)');
		expect(src).toContain('aria-label="Picture file"');
		expect(src).toContain('placeholder="attachment:photo.jpg"');
	});

	it('does NOT prefill the reference when it is picking', () => {
		// `imageReady` reads the ref as non-empty, so a prefill with nothing
		// selected arms Add the moment a description is typed and inserts
		// `src: "attachment:"` -- a reference the renderer refuses as `empty`.
		expect(src).toContain("imageRef = picking ? '' : 'attachment:'");
	});

	it('refuses to insert a reference that was not offered', () => {
		expect(src).toContain('if (picking && !isOfferedRef(choices, imageRef)) return;');
	});

	it('still requires a description, by the same expression as before', () => {
		// 0030's contract, unchanged by the picker: required, refused rather
		// than dropped, and `aria-disabled` so the control can say why.
		expect(src).toContain("imageRef.trim() !== '' && imageAlt.trim() !== ''");
		expect(src).toContain('aria-disabled={!imageReady}');
		expect(/[^-]disabled=\{!imageReady\}/.test(src)).toBe(false);
	});

	it('says something when it has nothing to offer, rather than showing an empty list', () => {
		expect(src).toContain('imagesEmptyHint');
		expect(src).toContain('class="image-empty"');
	});
});

describe('the composer', () => {
	const src = readFileSync(
		new URL('../src/lib/classroom/ContentComposer.svelte', import.meta.url),
		'utf8'
	);

	it('hands the editor the student-facing files, attached and staged', () => {
		expect(src).toContain('imageChoices({');
		expect(src).toContain('attached: existing');
		expect(src).toContain('images={bodyImages}');
	});

	it('NEVER hands it an instructor-only file', () => {
		// A body is read by the whole class, and an item body's alias resolves
		// against the student-facing attachments only -- so an instructor-only
		// file could not draw even if it were offered. There is no parameter
		// through which one could be passed, and this is the sweep that says the
		// call site did not grow one.
		const call = src.slice(src.indexOf('imageChoices({'), src.indexOf('imageChoices({') + 260);
		expect(call).not.toContain('instructor');
		expect(call).toContain('staged: stagedFileNames');
	});
});
