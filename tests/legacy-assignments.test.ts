import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assignmentSlugs, courses, loadAssignmentHtml } from '$lib/legacy';

/**
 * WHAT THIS PINS: which legacy assignment files are reachable at
 * `/assignments/<slug>`, which is a PUBLIC route reading no session.
 *
 * `src/lib/legacy/index.ts` used to glob `./assignments/*.html` and take
 * everything, so `_TEMPLATE.html` -- the blank authoring template -- was a
 * public page serving "IDEA-000 / Assignment 00 / Placeholder prompt" to
 * anyone who found the URL. The glob is `./assignments/[!_]*.html` now, and a
 * leading underscore means "not a route".
 *
 * This is a route-surface guarantee and it regresses SILENTLY: widening the
 * glob again puts a scaffold back on a public URL and nothing on any screen
 * reports it. The narrowing direction is the one that fails loudly (an
 * assignment 404s in front of a class), which is why the expected set below
 * is derived from the DIRECTORY rather than from the module under test -- a
 * glob that matched nothing would otherwise pass every absence assertion
 * vacuously.
 */

const ASSIGNMENT_DIR = fileURLToPath(new URL('../src/lib/legacy/assignments', import.meta.url));

/** Every `.html` on disk, which is the real producer of the slug set. */
const filesOnDisk = readdirSync(ASSIGNMENT_DIR)
	.filter((f) => f.endsWith('.html'))
	.sort();

const expectedSlugs = filesOnDisk
	.filter((f) => !f.startsWith('_'))
	.map((f) => f.replace(/\.html$/, ''))
	.sort();

const underscored = filesOnDisk.filter((f) => f.startsWith('_'));

describe('legacy assignment slugs', () => {
	it('has an underscored file on disk, so the exclusion below is not vacuous', () => {
		// The positive control for the whole file. If nothing in the directory
		// starts with an underscore, every "is not reachable" assertion here is
		// true for the wrong reason.
		expect(underscored).toContain('_TEMPLATE.html');
		expect(filesOnDisk.length).toBeGreaterThan(expectedSlugs.length);
	});

	it('resolves every assignment whose filename does not start with an underscore', () => {
		expect(assignmentSlugs).toEqual(expectedSlugs);
		// Named explicitly as well as by derivation, so a directory that lost a
		// file and a glob that lost a file cannot agree with each other.
		expect(assignmentSlugs).toContain('idea100-blade-01');
		expect(assignmentSlugs).toContain('idea113-blade-01');
		expect(assignmentSlugs).toContain('MSET-Mold-01');
		expect(assignmentSlugs).toContain('idea403-senior-final');
	});

	it('does not resolve an underscored file as a slug', () => {
		for (const file of underscored) {
			const slug = file.replace(/\.html$/, '');
			expect(assignmentSlugs).not.toContain(slug);
		}
	});

	it('answers null for an underscored slug and HTML for a real one', async () => {
		// `loadAssignmentHtml` is what the public route calls; a null is the
		// route's 404. Both directions, on the same call.
		expect(await loadAssignmentHtml('_TEMPLATE')).toBeNull();
		const real = await loadAssignmentHtml('idea100-blade-01');
		expect(real).not.toBeNull();
		expect(real).toContain('<!DOCTYPE html>');
	});

	it('still surfaces every course assignment the layout names', () => {
		// `courses` filters on the same slug set, so a glob narrowed too far
		// would quietly empty the dashboard index instead of 404ing.
		const listed = courses.flatMap((c) => c.assignments.map((a) => a.slug));
		expect(listed.length).toBeGreaterThan(0);
		for (const slug of listed) expect(assignmentSlugs).toContain(slug);
		expect(listed).toContain('idea113-blade-01');
		expect(listed).toContain('mset-mold-02');
	});
});

describe('idea100-blade-01, which students are working in right now', () => {
	/**
	 * Two behavioural fixes were made in this file and both are PROVEN in a
	 * real browser (see the history entry). What is asserted here is only the
	 * structural half a browser pass cannot keep watch over: that the two
	 * shapes the defects lived in have not come back, and that the storage key
	 * the students' saved answers hang off has not moved.
	 */
	const html = () => loadAssignmentHtml('idea100-blade-01') as Promise<string>;

	/**
	 * Comments stripped, the way `tools/claude-md-check.mjs` reads a migration.
	 * Both fixes carry a comment QUOTING the expression they replaced -- which
	 * is the whole value of the comment -- so a raw substring sweep finds the
	 * defect's own epitaph and reddens. The stripped copy is asserted to still
	 * hold the replacement, so stripping cannot be what makes the test pass.
	 */
	const code = async () => (await html()).replace(/\/\*[\s\S]*?\*\//g, '');

	it('keeps the storage key its saved work is already under', async () => {
		expect(await html()).toContain("const STORAGE_KEY = 'idea100-blade-01';");
	});

	it('does not find an image row by matching its data URL', async () => {
		// Two copies of one picture share a dataUrl, so a findIndex over it
		// edits or deletes the FIRST row whichever row was clicked.
		const source = await code();
		expect(source).not.toContain('images.findIndex(i => i.dataUrl');
		// The positive control: the row closes over the object instead.
		expect(source).toContain('images.indexOf(imgObj)');
		expect(source).toContain('imgObj.caption = cap.value;');
	});

	it('reads the picked files one at a time rather than per-reader', async () => {
		const source = await code();
		// The order pictures land in must be the order they were picked, not
		// the order they finished decoding.
		expect(source).toContain('async function addImageFiles(files)');
		expect(source).toContain('for (const file of Array.from(files))');
	});
});
