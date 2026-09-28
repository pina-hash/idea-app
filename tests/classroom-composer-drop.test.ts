// tests/classroom-composer-drop.test.ts
//
// A FILE DROPPED ON THE COMPOSER GOES TO THE TARGET WHOSE TYPE RULE IT MATCHES,
// AND A ZIP OF PICTURES BECOMES A GALLERY (ledger 0297, package ITEM; reports
// 21 and 23).
//
// WHY A TEST. The regression is SILENT: a spec `.json` or a ported `.html`
// dropped on the title field was staged as a STUDENT-VISIBLE file while the box
// built for it never heard about it, and "1 dropped file attached." read as a
// success. Nothing threw and nothing looked wrong.
//
// WHERE THE EXPECTED VALUES COME FROM. Every type rule is read from the module
// that owns it (the importer's, the deck box's, the ported-document box's), and
// every fixture is a real `File` whose name and type a browser can produce. The
// DOM half -- a real drop event on the mounted composer -- is
// tests/dom/composer-drop-routing-mount.test.ts.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	composerDropRefusal,
	composerDropRoute,
	composerDropSummary,
	composerKindForDrop,
	splitComposerDrop,
	type ComposerDropTargets
} from '../src/lib/classroom/composer-drop';
import { SPEC_ACCEPT, specFileRefusal } from '../src/lib/classroom/composer-staging';
import { DECK_ACCEPT } from '../src/lib/classroom/deck';
import { HTML_DOCUMENT_ACCEPT } from '../src/lib/classroom/html-assignment/store';
import {
	extractGalleryPictures,
	galleryFileNames,
	galleryZipIssue,
	GALLERY_ZIP_MAX_BYTES,
	surveyZip
} from '../src/lib/classroom/gallery-zip';
import { buildZip } from '../src/lib/foundry/zip-write';

const file = (name: string, type = '', size = 8) =>
	new File([new Uint8Array(size).fill(7)], name, { type });

const ALL: ComposerDropTargets = { spec: true, html: true, zip: true };
const NONE: ComposerDropTargets = { spec: false, html: false, zip: false };

describe('the route is the target whose own rule the file matches', () => {
	const cases: [string, File, 'spec' | 'html' | 'zip' | 'files'][] = [
		['a spec by extension', file('lab-03.json'), 'spec'],
		['a spec by type, no extension', file('spec', 'application/json'), 'spec'],
		['a ported document', file('worksheet.html'), 'html'],
		['a ported document, .htm', file('worksheet.htm'), 'html'],
		['a document by type', file('export', 'text/html'), 'html'],
		['a zip by extension', file('photos.zip'), 'zip'],
		['a zip as Windows types it', file('deck', 'application/x-zip-compressed'), 'zip'],
		['a photograph', file('bench.png', 'image/png'), 'files'],
		['a PDF', file('handout.pdf', 'application/pdf'), 'files'],
		['a CAD part', file('bracket.SLDPRT'), 'files'],
		['no extension, no type', file('README'), 'files']
	];
	it.each(cases)('%s', (_label, f, route) => {
		expect(composerDropRoute(f, ALL)).toBe(route);
	});
	it('the sweep covered every route (a generated set that is empty passes)', () => {
		expect(new Set(cases.map((c) => c[2]))).toEqual(new Set(['spec', 'html', 'zip', 'files']));
	});

	it('a target NOT on this form leaves its files as ordinary files (both directions)', () => {
		for (const [, f] of cases) expect(composerDropRoute(f, NONE)).toBe('files');
		// Positive control: the same files DO route when their target is there.
		expect(cases.filter(([, f]) => composerDropRoute(f, ALL) !== 'files')).toHaveLength(7);
	});

	it('each target is independent: no spec box sends a spec to Files, not to the html box', () => {
		expect(composerDropRoute(file('a.json'), { ...ALL, spec: false })).toBe('files');
		expect(composerDropRoute(file('a.html'), { ...ALL, html: false })).toBe('files');
		expect(composerDropRoute(file('a.zip'), { ...ALL, zip: false })).toBe('files');
	});
});

describe('a whole drop splits in order, and the summary names every destination', () => {
	it('four kinds at once', () => {
		const split = splitComposerDrop(
			[file('a.png'), file('s.json'), file('w.html'), file('p.zip'), file('b.pdf')],
			ALL
		);
		expect(split.files.map((f) => f.name)).toEqual(['a.png', 'b.pdf']);
		expect(split.spec.map((f) => f.name)).toEqual(['s.json']);
		expect(split.html.map((f) => f.name)).toEqual(['w.html']);
		expect(split.zip.map((f) => f.name)).toEqual(['p.zip']);
		const line = composerDropSummary(split) ?? '';
		expect(line).toContain('2 files added to Files');
		expect(line).toContain('spec importer');
		expect(line).toContain('ported assignment box');
		expect(line).toContain('waiting for your choice');
	});
	it('nothing dropped says nothing', () => {
		expect(composerDropSummary({ spec: [], html: [], zip: [], files: [] })).toBeNull();
		expect(composerDropSummary({ spec: [], html: [], zip: [], files: [], refused: [] })).toBeNull();
	});
});

// THE EDIT FORM (R01, R11). A spec or a ported document dropped on an EDIT is
// never an ordinary file: it goes to the item page's importer or the replace
// box, or it is refused in words. The regression this guards is the silent one
// the reports describe -- a worksheet attached for the whole class while the
// box meant for it never heard about it. The DOM half, a real drop on the
// mounted edit form, is tests/dom/composer-drop-edit-mount.test.ts.
describe('on the edit form a spec or a document is routed or refused, never filed', () => {
	/** An edit of an assignment by an admin: the item page's importer is there,
	 *  the item is not a ported one. */
	const EDIT_SPEC_PAGE: ComposerDropTargets = {
		spec: true,
		specWhere: 'item-page',
		html: false,
		htmlRefusal: 'html-not-ported',
		zip: true
	};
	/** The class list's row editor: no importer, and nothing known about
	 *  whether the viewer could upload a ported document. */
	const ROW_EDITOR: ComposerDropTargets = {
		spec: false,
		specRefusal: 'spec-elsewhere',
		html: false,
		htmlRefusal: 'html-not-here',
		zip: true
	};

	const cases: [string, File, ComposerDropTargets, string, string | null][] = [
		['a spec, the item page importer there', file('lab-03.json'), EDIT_SPEC_PAGE, 'spec', null],
		['a spec, no importer', file('lab-03.json'), ROW_EDITOR, 'refused', 'spec-elsewhere'],
		['a spec by type, no importer', file('spec', 'application/json'), ROW_EDITOR, 'refused', 'spec-elsewhere'],
		['a document, not a ported assignment', file('worksheet.html'), EDIT_SPEC_PAGE, 'refused', 'html-not-ported'],
		['a document, .htm, from the row editor', file('worksheet.htm'), ROW_EDITOR, 'refused', 'html-not-here'],
		['a photograph, either form (positive control)', file('bench.png', 'image/png'), ROW_EDITOR, 'files', null],
		['a PDF, either form (positive control)', file('handout.pdf', 'application/pdf'), EDIT_SPEC_PAGE, 'files', null],
		['a zip still asks', file('photos.zip'), ROW_EDITOR, 'zip', null]
	];
	it.each(cases)('%s', (_label, f, targets, route, reason) => {
		expect(composerDropRoute(f, targets)).toBe(route);
		expect(composerDropRefusal(f, targets)).toBe(reason);
	});
	it('the sweep covered routed, refused and filed', () => {
		expect(new Set(cases.map((c) => c[3]))).toEqual(new Set(['spec', 'refused', 'files', 'zip']));
		expect(cases.filter((c) => c[3] === 'refused')).toHaveLength(4);
	});

	it('a ported document box on the edit form still takes its document (the replace box)', () => {
		expect(composerDropRoute(file('worksheet.html'), { ...EDIT_SPEC_PAGE, html: true })).toBe('html');
	});

	it('a refusal names each file, says it was NOT attached, and says how to hand it out anyway', () => {
		const split = splitComposerDrop([file('lab-03.json'), file('worksheet.html'), file('bench.png')], ROW_EDITOR);
		expect(split.files.map((f) => f.name)).toEqual(['bench.png']);
		expect(split.refused.map((f) => f.name)).toEqual(['lab-03.json', 'worksheet.html']);
		const line = composerDropSummary(split, ROW_EDITOR) ?? '';
		expect(line).toContain('One file added to Files.');
		expect(line).toContain('lab-03.json was not attached. A spec is imported on the item');
		expect(line).toContain('worksheet.html was not attached. A ported HTML assignment is uploaded by a site admin');
		expect(line.match(/drop it on the Files box/g)).toHaveLength(2);
		// Neither refused file is counted on the Files line.
		expect(line).not.toMatch(/\d files added/);
	});

	it('a spec sent to the item page says it is not published and where to publish it', () => {
		const split = splitComposerDrop([file('lab-03.json')], EDIT_SPEC_PAGE);
		expect(split.spec).toHaveLength(1);
		const line = composerDropSummary(split, EDIT_SPEC_PAGE) ?? '';
		expect(line).toContain("this item's spec importer, under Instructor tools");
		expect(line).toContain('Nothing is published yet');
		// The create wording is untouched (positive control for the branch).
		expect(composerDropSummary(split, { ...EDIT_SPEC_PAGE, specWhere: 'form' })).toBe(
			'The spec sent to the spec importer.'
		);
	});

	it('a form with no Files list refuses an ordinary file out loud rather than swallowing it', () => {
		const NO_FILES: ComposerDropTargets = { spec: true, html: true, zip: false, files: false };
		expect(composerDropRoute(file('bench.png', 'image/png'), NO_FILES)).toBe('refused');
		expect(composerDropRefusal(file('bench.png', 'image/png'), NO_FILES)).toBe('no-files');
		// ...while its spec and document routes still work: the zone no longer
		// depends on attachments for them (R11).
		expect(composerDropRoute(file('lab-03.json'), NO_FILES)).toBe('spec');
		expect(composerDropRoute(file('worksheet.html'), NO_FILES)).toBe('html');
		const split = splitComposerDrop([file('a.png'), file('b.pdf')], NO_FILES);
		expect(composerDropSummary(split, NO_FILES)).toBe('a.png and b.pdf were not attached. This form takes no files.');
	});

	it('the create form is unchanged: no refusal is named, so a typed file with no box is a file', () => {
		for (const [, f] of cases) {
			const route = composerDropRoute(f, { spec: false, html: false, zip: true });
			expect(route === 'files' || route === 'zip').toBe(true);
		}
	});
});

describe('a drop on the class page chooses the kind its files need (R01)', () => {
	const ASSIGNMENT_SPEC = JSON.stringify({ schemaVersion: 1, meta: { assignmentId: 'lab-03', title: 'Lab 3' }, modules: [] });
	const REFERENCE_SPEC = JSON.stringify({ schemaVersion: 2, meta: { referenceId: 'syl', title: 'Syllabus' }, sections: [] });
	const text = (name: string, body: string, type = '') => new File([body], name, { type });

	it('an assignment spec, a reference spec, a broken spec, a document and a photo', async () => {
		expect(await composerKindForDrop([text('lab.json', ASSIGNMENT_SPEC)], { html: true })).toBe('assignment');
		expect(await composerKindForDrop([text('syl.json', REFERENCE_SPEC)], { html: true })).toBe('material');
		expect(await composerKindForDrop([text('bad.json', '{ not json')], { html: false })).toBe('assignment');
		expect(await composerKindForDrop([text('w.html', '<!doctype html>', 'text/html')], { html: true })).toBe('assignment');
		// A document where the form offers no ported box leaves the kind alone.
		expect(await composerKindForDrop([text('w.html', '<!doctype html>', 'text/html')], { html: false })).toBeNull();
		expect(await composerKindForDrop([file('bench.png', 'image/png')], { html: true })).toBeNull();
	});
});

describe('one rule each, read from its owner, never retyped', () => {
	const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

	it('the spec importer reads SPEC_ACCEPT and its refusal from the shared module', () => {
		const importer = src('src/lib/classroom/SpecImporter.svelte');
		expect(importer).toContain("import { SPEC_ACCEPT, specFileRefusal } from '$lib/classroom/composer-staging'");
		expect(importer).not.toContain("'.json,application/json'");
		expect(SPEC_ACCEPT).toBe('.json,application/json');
		// The sentence is byte-identical to the one the importer used to type.
		expect(specFileRefusal([file('photo.png')])).toBe(
			'photo.png is not a .json file. Drop the spec JSON, or paste it into the box.'
		);
	});

	it('the ported-document rule is built from the box\'s own constants', () => {
		expect(HTML_DOCUMENT_ACCEPT).toBe('.html,.htm,text/html');
	});

	it("the deck panel's DROP refuses what its PICKER refuses, with the same sentence", () => {
		const panel = src('src/lib/classroom/DeckPanel.svelte');
		// The picker reads the constant rather than a literal copy of it.
		expect(panel).toContain('accept={DECK_ACCEPT}');
		expect(panel).not.toContain('accept=".zip');
		// The drop carries the same rule, and a refusal is said out loud.
		expect(panel).toMatch(/accept: \(f\) => matchesAccept\(f, DECK_ACCEPT\)/);
		expect(panel).toMatch(/onrejected: onDropRejected/);
		expect(panel).toMatch(/function onDropRejected[\s\S]{0,200}deckUploadTypeIssue\(file\)/);
		expect(DECK_ACCEPT).toContain('.zip');
	});

	it('the composer root routes; it never hands every file to the Files list', () => {
		const composer = src('src/lib/classroom/ContentComposer.svelte');
		expect(composer).toContain('onfiles: (files) => routeComposerDrop(files)');
		expect(composer).toMatch(/const split = splitComposerDrop\(files,/);
		// The old unconditional line is gone.
		expect(composer).not.toMatch(/onfiles: \(files\) => \{\s*filePanel\?\.add\(files\)/);
	});
});

describe('a zip of pictures is read in the browser and becomes ordinary files', () => {
	const png = (seed: number) => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, seed, seed, seed]);

	it('surveys the directory: pictures in natural order, a page noticed, noise ignored', async () => {
		const bytes = await buildZip([
			{ path: 'shots/photo10.png', bytes: png(1) },
			{ path: 'shots/photo2.png', bytes: png(2) },
			{ path: '__MACOSX/shots/._photo2.png', bytes: png(3) },
			{ path: 'shots/.DS_Store', bytes: png(4) },
			{ path: 'notes.txt', bytes: new TextEncoder().encode('hello') }
		]);
		const survey = surveyZip(bytes);
		expect(survey).not.toBeNull();
		expect(survey!.pictures).toEqual(['shots/photo2.png', 'shots/photo10.png']);
		expect(survey!.hasPage).toBe(false);
		expect(survey!.otherFiles).toBe(1);
	});

	it('a zip with a web page is noticed as one (a presentation needs one)', async () => {
		const bytes = await buildZip([
			{ path: 'index.html', bytes: new TextEncoder().encode('<!doctype html>') },
			{ path: 'img/a.jpg', bytes: png(1) }
		]);
		expect(surveyZip(bytes)?.hasPage).toBe(true);
	});

	it('unpacks every picture to a File, byte for byte, named for the picture', async () => {
		const bytes = await buildZip([
			{ path: 'a/img1.png', bytes: png(1) },
			{ path: 'b/img1.png', bytes: png(2) },
			{ path: 'c.jpg', bytes: png(3) }
		]);
		const out = await extractGalleryPictures(bytes);
		expect(out.error).toBeNull();
		expect(out.skipped).toEqual([]);
		expect(out.files.map((f) => f.name)).toEqual(['img1.png', 'b-img1.png', 'c.jpg']);
		const first = new Uint8Array(await out.files[0].arrayBuffer());
		expect(Array.from(first)).toEqual(Array.from(png(1)));
	});

	it('not a zip at all is an error in words, never a throw', async () => {
		const out = await extractGalleryPictures(new Uint8Array([1, 2, 3, 4]));
		expect(out.files).toEqual([]);
		expect(out.error).toMatch(/could not be opened/);
		expect(surveyZip(new Uint8Array([1, 2, 3]))).toBeNull();
	});

	it('the size cap states the size AND the limit', () => {
		const big = { name: 'huge.zip', size: GALLERY_ZIP_MAX_BYTES + 1 } as File;
		const line = galleryZipIssue(big) ?? '';
		expect(line).toContain('huge.zip');
		expect(line).toMatch(/over the 200\.0 MB limit/);
		expect(galleryZipIssue({ name: 'ok.zip', size: 1024 } as File)).toBeNull();
	});

	it('duplicate names across folders never collide, whatever the case', () => {
		expect(galleryFileNames(['x/A.png', 'y/a.png', 'z/a.png'])).toEqual(['A.png', 'y-a.png', 'z-a.png']);
		expect(galleryFileNames(['a.png', 'a.png'])).toEqual(['a.png', 'a-2.png']);
	});
});
