// tests/notebook-tolerance-privacy.test.ts
//
// THE HARD CONSTRAINTS on the tolerance callout, asserted structurally.
//
// The band is the note AUTHOR's and nobody else's: it enters no grade, no
// rubric, no export, no print and no instructor-facing view, and there is no
// history, streak or comparison anywhere. Every one of those is a property of
// WHICH FILES IMPORT WHAT, so this file sweeps the tree rather than mounting
// anything -- a component cannot render a band it never imported.
//
// WHY IT EARNS A TEST. A leak here is silent in exactly the way the rules in
// CLAUDE.md are written about: an instructor console that gained a band would
// look completely normal to whoever added it, would look normal in review, and
// would be discovered by a student finding out their private writing score is
// on a teacher's screen. Nothing about it fails visibly.
//
// It is a SWEEP with a POSITIVE CONTROL: every assertion that a file does NOT
// import something is paired with the count of files that DO, so a sweep that
// silently matched nothing cannot pass.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { IN_SPEC, TOLERANCE_BANDS } from '../src/lib/notebook/tolerance';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', 'src');

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) walk(path, out);
		else if (/\.(svelte|ts)$/.test(name)) out.push(path);
	}
	return out;
}

const FILES = walk(ROOT).map((path) => ({ path, source: readFileSync(path, 'utf8') }));
const rel = (path: string) => path.slice(path.indexOf('src'));

/** Every file naming the callout component or the module behind it. */
const READERS = FILES.filter(
	(file) =>
		file.source.includes('ToleranceCallout') || file.source.includes('notebook/tolerance')
).map((file) => rel(file.path));

describe('the sweep can see the tree at all', () => {
	// The positive control for every absence assertion below.
	it('finds the notebook source and the callout in it', () => {
		expect(FILES.length).toBeGreaterThan(200);
		expect(FILES.map((f) => rel(f.path))).toContain('src/lib/notebook/ToleranceCallout.svelte');
		expect(READERS.length).toBeGreaterThan(0);
	});
});

describe('the band reaches the author and nobody else', () => {
	// THE WHOLE CONSTRAINT, as one list. The callout is mounted by exactly one
	// component -- the editor a student writes their own note in -- and that
	// editor is mounted only on the three composing surfaces. A fourth entry
	// appearing here is a disclosure decision, not a refactor.
	it('is imported by exactly the component that owns the editor', () => {
		expect(READERS.sort()).toEqual([
			// mounts the callout
			'src/lib/notebook/NoteEditor.svelte',
			// reads the arithmetic
			'src/lib/notebook/ToleranceCallout.svelte'
		]);
	});

	// The instructor's read path. `EntryReview` and `ReviewConsole` render a
	// student's notes through `NoteContent`, which mounts no editor -- absence
	// is the mechanism, exactly as it is for every other write control on a
	// read-only surface.
	it('no instructor surface imports it, and none mounts the editor either', () => {
		const staff = [
			'src/lib/notebook/EntryReview.svelte',
			'src/lib/notebook/ReviewConsole.svelte',
			'src/lib/notebook/SectionGrid.svelte',
			'src/lib/notebook/NoteContent.svelte'
		];
		for (const path of staff) {
			const file = FILES.find((f) => rel(f.path) === path);
			expect(file, `${path} is missing -- update this sweep`).toBeTruthy();
			expect(file!.source, `${path} imports the callout`).not.toContain('ToleranceCallout');
			expect(file!.source, `${path} imports the band arithmetic`).not.toContain(
				'notebook/tolerance'
			);
			expect(file!.source, `${path} mounts the note editor`).not.toContain('NoteEditor');
		}
	});

	// The positive control for the sweep above: a file that DOES mount the
	// editor is found by the same test.
	it('and the composing surfaces do mount the editor', () => {
		const composers = [
			'src/lib/notebook/NotebookView.svelte',
			'src/lib/notebook/NotebookEntryCard.svelte',
			'src/lib/notebook/EntryNotes.svelte'
		];
		for (const path of composers) {
			const file = FILES.find((f) => rel(f.path) === path);
			expect(file!.source, `${path} should mount the editor`).toContain('NoteEditor');
		}
	});
});

describe('the band is stored, sent and exported nowhere', () => {
	// It is computed in the browser from what is on screen. No route, no RPC,
	// no payload and no migration names it, so there is nothing for a grade, an
	// export or a print to read even if one tried.
	it('no server module, route or migration names the callout', () => {
		const offenders = FILES.filter(
			(file) =>
				(rel(file.path).startsWith('src/routes') || rel(file.path).includes('lib/server')) &&
				(file.source.includes('ToleranceCallout') || file.source.includes('notebook/tolerance'))
		).map((file) => rel(file.path));
		expect(offenders).toEqual([]);
	});

	it('the callout renders the band and nothing derived from a person', () => {
		const source = readFileSync(join(ROOT, 'lib', 'notebook', 'ToleranceCallout.svelte'), 'utf8');
		// No count, rate or issue breakdown reaches the markup: `reading.issues`
		// and `reading.rate` exist on the reading and are deliberately unread.
		const markup = source.slice(source.indexOf('</script>'), source.indexOf('<style>'));
		expect(markup).toContain('reading.band.label');
		expect(markup).not.toContain('issues');
		expect(markup).not.toContain('reading.rate');
	});

	// COPY IS ABOUT THE NOTE, NEVER ABOUT THE STUDENT. A surface that can
	// praise can also scold, so neither vocabulary is present at all.
	//
	// THIS SWEEPS THE RENDERED COPY, NOT THE SOURCE, and the distinction cost a
	// rewrite: the first version read the whole file and failed on this file's
	// own comments explaining that "nice work" must never appear. A test that
	// cannot tell a string from a sentence about that string is asserting over
	// documentation.
	it('neither the band labels nor the callout text praises or scolds', () => {
		const source = readFileSync(join(ROOT, 'lib', 'notebook', 'ToleranceCallout.svelte'), 'utf8');
		const markup = source.slice(source.indexOf('</script>'), source.indexOf('<style>'));
		// Every literal word a reader can see: the markup's text nodes, plus the
		// seven band labels, which are the only other strings that reach a screen.
		const visible = [
			...(markup.match(/>[^<>{}]+</g) ?? []).map((chunk) => chunk.slice(1, -1)),
			IN_SPEC.label,
			...TOLERANCE_BANDS.map((band) => band.label)
		]
			.join(' ')
			.toLowerCase();

		// The positive control: the sweep really did collect the copy.
		expect(visible).toContain('tolerance');
		expect(visible).toContain('in spec');
		expect(visible).toContain('± 1/2 in, eyeballed');

		const judgement = [
			'great',
			'good',
			'nice',
			'well done',
			'keep it up',
			'excellent',
			'sloppy',
			'careless',
			'poor',
			'try',
			'you ',
			'your ',
			'better',
			'worse',
			'improve'
		];
		for (const phrase of judgement) {
			expect(visible, `visible copy contains "${phrase}"`).not.toContain(phrase);
		}
	});
});
