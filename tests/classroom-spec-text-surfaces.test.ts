// tests/classroom-spec-text-surfaces.test.ts
//
// THE ENUMERATION ITSELF, and the markdown bridge the prose fields ride on.
//
// The guard is only as good as the list it consults: a field that quietly
// entered `specTextSurfaces` would become editable AND permitted in the same
// stroke, with no refusal anywhere to notice it. So this file pins the list
// exhaustively -- what is on it and, more to the point, what is NOT -- against
// a fixture carrying one of every block type in each schema.
//
// AND IT SWEEPS THE REAL CORPUS. `materials/` is written by the classroom
// GitHub export on every item save, so nothing here asserts over its BYTES,
// its counts or its hashes (the ratchet CLAUDE.md names). What it asserts is a
// PROPERTY that must hold for any spec at all: every surface the enumeration
// yields reads back as a string, writing one back changes nothing, and the
// guard approves that no-op. A spec added or resaved tomorrow satisfies that or
// finds a real bug.

import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { AssignmentSpec } from '$lib/classroom/assignment-spec';
import type { ReferenceSpec } from '$lib/classroom/reference-spec';
import {
	applySpecTextEdits,
	readSpecText,
	specPathKey,
	specTextSurfaces,
	writeSpecText,
	type EditableSpecKind
} from '$lib/classroom/spec-text';
import { guardSpecTextEdit } from '$lib/classroom/spec-text-guard';
import {
	appendFigure,
	editorToMarkdown,
	itemDocToMarkdown,
	markdownEditable,
	markdownFromEditor,
	markdownToItemDoc,
	markdownUneditableReasons
} from '$lib/classroom/spec-markdown';
import { docToTiptap } from '$lib/classroom/classroom-doc';
import { figureReference } from '$lib/classroom/classroom';

const ASSIGNMENT: AssignmentSpec = {
	schemaVersion: 1,
	meta: {
		assignmentId: 'a-1',
		title: 'Density lab',
		totalPoints: 30,
		course: 'IDEA209H',
		unit: 1,
		dueDate: '2026-09-04',
		gradingCategory: 'Labs',
		headerFields: ['Name', 'Bench']
	},
	approvalGate: { afterModule: 'm1', label: 'Bench check' },
	declarations: { academicIntegrity: true },
	modules: [
		{
			id: 'm1',
			title: 'Measure',
			points: 30,
			aiLevel: 1,
			aiNote: 'AI may explain the arithmetic.',
			intro: 'With your partner.',
			customChecks: [{ name: 'Balance', description: 'Zeroed before each sample.' }],
			blocks: [
				{ type: 'instructions', content: 'Weigh each sample.' },
				{
					type: 'table',
					id: 't1',
					points: 10,
					columns: [{ key: 'mass', label: 'Mass (g)', tip: 'Two decimals' }]
				},
				{ type: 'textField', id: 'f1', prompt: 'Why?', points: 10 },
				{ type: 'checklist', id: 'c1', items: ['Goggles'] },
				{ type: 'imageZone', id: 'z1', minImages: 1, captions: true },
				{ type: 'calc', id: 'k1', tool: 'density', config: { units: 'metric' } }
			],
			rubric: [
				{
					id: 'r1',
					criterion: 'Accurate',
					levels: [
						{ points: 0, label: 'Missing', descriptor: 'None.', short: 'none' },
						{ points: 5, label: 'Partial', descriptor: 'Some.' },
						{ points: 10, label: 'Full', descriptor: 'All.' }
					]
				}
			]
		}
	]
};

const REFERENCE: ReferenceSpec = {
	schemaVersion: 2,
	kind: 'reference',
	meta: { referenceId: 'r-1', title: 'Syllabus', subtitle: 'Fall', course: 'IDEA209H', updated: '2026-08-01' },
	navigation: 'stacked',
	sections: [
		{
			slug: 'grading',
			title: 'Grading',
			blurb: 'How marks add up.',
			blocks: [
				{ type: 'instructions', content: 'Out of 100.' },
				{ type: 'keyValue', title: 'Glance', items: [{ label: 'Labs', value: '40%' }] },
				{
					type: 'dataTable',
					title: 'Weights',
					caption: 'Term one',
					columns: [{ key: 'cat', label: 'Category' }],
					rows: [{ cat: 'Labs' }]
				},
				{ type: 'callout', variant: 'warn', title: 'Late', content: 'Two days.' },
				{ type: 'cardGrid', title: 'Links', cards: [{ title: 'Safety', url: 'https://e.edu', body: 'Read.' }] },
				{
					type: 'linkCard',
					title: 'Parts',
					links: [{ url: 'https://e.com', fallbackLabel: 'Caliper', label: 'C', note: 'Any' }]
				},
				{
					type: 'calc',
					tool: 'aiLevelLookup',
					title: 'AI levels',
					config: { entries: [{ workType: 'Lab', level: 1, permitted: 'Explain', notPermitted: 'Write' }] }
				}
			]
		}
	]
};

const keys = (kind: EditableSpecKind, spec: AssignmentSpec | ReferenceSpec) =>
	specTextSurfaces(spec, kind).map((s) => s.key);

describe('the assignment enumeration', () => {
	it('names exactly the text surfaces, in document order', () => {
		expect(keys('assignment', ASSIGNMENT)).toEqual([
			'meta.title',
			'approvalGate.label',
			'modules[0].title',
			'modules[0].intro',
			'modules[0].blocks[0].content',
			'modules[0].blocks[1].columns[0].label',
			'modules[0].blocks[1].columns[0].tip',
			'modules[0].blocks[2].prompt',
			'modules[0].blocks[3].items[0]'
		]);
	});

	it('leaves every grading and structural field off the list', () => {
		const listed = new Set(keys('assignment', ASSIGNMENT));
		const mustBeAbsent = [
			'meta.totalPoints',
			'meta.assignmentId',
			'meta.course',
			'meta.unit',
			'meta.dueDate',
			'meta.gradingCategory',
			'meta.headerFields[0]',
			'schemaVersion',
			'approvalGate.afterModule',
			'declarations.academicIntegrity',
			'modules[0].id',
			'modules[0].points',
			'modules[0].aiLevel',
			'modules[0].aiNote',
			'modules[0].customChecks[0].name',
			'modules[0].customChecks[0].description',
			'modules[0].blocks[0].type',
			'modules[0].blocks[1].id',
			'modules[0].blocks[1].points',
			'modules[0].blocks[1].columns[0].key',
			'modules[0].blocks[2].id',
			'modules[0].blocks[4].id',
			'modules[0].blocks[5].tool',
			'modules[0].blocks[5].config.units',
			'modules[0].rubric[0].criterion',
			'modules[0].rubric[0].levels[0].label',
			'modules[0].rubric[0].levels[0].descriptor',
			'modules[0].rubric[0].levels[0].short',
			'modules[0].rubric[0].levels[0].points'
		];
		// POSITIVE CONTROL beside the exclusions, so a sweep reading the wrong
		// property cannot come back clean: these ARE on the list.
		const mustBePresent = ['meta.title', 'modules[0].title', 'modules[0].blocks[2].prompt'];
		expect(mustBeAbsent.filter((k) => listed.has(k))).toEqual([]);
		expect(mustBePresent.filter((k) => !listed.has(k))).toEqual([]);
		expect(mustBeAbsent).toHaveLength(29);
	});

	it('marks an imageZone and a calc block as carrying no text at all', () => {
		const listed = keys('assignment', ASSIGNMENT);
		expect(listed.filter((k) => k.startsWith('modules[0].blocks[4]'))).toEqual([]);
		expect(listed.filter((k) => k.startsWith('modules[0].blocks[5]'))).toEqual([]);
	});

	it('marks instructions as prose and everything else as plain', () => {
		const byKey = new Map(specTextSurfaces(ASSIGNMENT, 'assignment').map((s) => [s.key, s.kind]));
		expect(byKey.get('modules[0].blocks[0].content')).toBe('prose');
		expect(byKey.get('modules[0].intro')).toBe('block');
		expect(byKey.get('modules[0].blocks[2].prompt')).toBe('block');
		expect(byKey.get('meta.title')).toBe('line');
		expect([...byKey.values()].filter((k) => k === 'prose')).toHaveLength(1);
	});

	it('offers no gate label when there is no gate', () => {
		const bare = JSON.parse(JSON.stringify(ASSIGNMENT)) as AssignmentSpec;
		delete bare.approvalGate;
		expect(keys('assignment', bare)).not.toContain('approvalGate.label');
	});
});

describe('the reference enumeration', () => {
	it('names exactly the text surfaces, in document order', () => {
		expect(keys('reference', REFERENCE)).toEqual([
			'meta.title',
			'meta.subtitle',
			'sections[0].title',
			'sections[0].blurb',
			'sections[0].blocks[0].content',
			'sections[0].blocks[1].title',
			'sections[0].blocks[1].items[0].label',
			'sections[0].blocks[1].items[0].value',
			'sections[0].blocks[2].title',
			'sections[0].blocks[2].caption',
			'sections[0].blocks[2].columns[0].label',
			'sections[0].blocks[2].rows[0].cat',
			'sections[0].blocks[3].title',
			'sections[0].blocks[3].content',
			'sections[0].blocks[4].title',
			'sections[0].blocks[4].cards[0].title',
			'sections[0].blocks[4].cards[0].body',
			'sections[0].blocks[5].title',
			'sections[0].blocks[5].links[0].fallbackLabel',
			'sections[0].blocks[5].links[0].label',
			'sections[0].blocks[5].links[0].note',
			'sections[0].blocks[6].title'
		]);
	});

	it('leaves the slug, every url, every key and the whole calc config off', () => {
		const listed = new Set(keys('reference', REFERENCE));
		const mustBeAbsent = [
			'sections[0].slug',
			'meta.referenceId',
			'meta.course',
			'meta.updated',
			'navigation',
			'schemaVersion',
			'kind',
			'sections[0].blocks[2].columns[0].key',
			'sections[0].blocks[3].variant',
			'sections[0].blocks[4].cards[0].url',
			'sections[0].blocks[5].links[0].url',
			'sections[0].blocks[6].tool',
			'sections[0].blocks[6].config.entries[0].permitted',
			'sections[0].blocks[6].config.entries[0].notPermitted',
			'sections[0].blocks[6].config.entries[0].level',
			'sections[0].blocks[6].config.entries[0].workType'
		];
		const mustBePresent = ['sections[0].title', 'sections[0].blocks[3].content'];
		expect(mustBeAbsent.filter((k) => listed.has(k))).toEqual([]);
		expect(mustBePresent.filter((k) => !listed.has(k))).toEqual([]);
		expect(mustBeAbsent).toHaveLength(16);
	});

	it('marks both prose blocks as prose, and nothing else', () => {
		const prose = specTextSurfaces(REFERENCE, 'reference')
			.filter((s) => s.kind === 'prose')
			.map((s) => s.key);
		expect(prose).toEqual(['sections[0].blocks[0].content', 'sections[0].blocks[3].content']);
	});

	it('treats a dataTable cell as optional and keys it on the COLUMN', () => {
		// The fixture's single row has `cat` and no `pct`; a second column with
		// no entry in the row is still a surface, so a blank cell can be filled.
		const two = JSON.parse(JSON.stringify(REFERENCE)) as ReferenceSpec;
		const table = two.sections[0].blocks[2] as { columns: { key: string; label: string }[] };
		table.columns.push({ key: 'pct', label: 'Percent' });
		const listed = keys('reference', two);
		expect(listed).toContain('sections[0].blocks[2].rows[0].pct');
		const surface = specTextSurfaces(two, 'reference').find(
			(s) => s.key === 'sections[0].blocks[2].rows[0].pct'
		);
		expect(surface?.present).toBe(false);
		expect(surface?.optional).toBe(true);
	});
});

describe('reading and writing one surface', () => {
	it('reads back exactly what the enumeration reported', () => {
		for (const [kind, spec] of [
			['assignment', ASSIGNMENT],
			['reference', REFERENCE]
		] as const) {
			for (const s of specTextSurfaces(spec, kind)) {
				expect(readSpecText(spec, s.path) ?? '').toBe(s.value);
			}
		}
	});

	it('writeSpecText does not mutate the document it was handed', () => {
		const before = JSON.stringify(ASSIGNMENT);
		writeSpecText(ASSIGNMENT, ['modules', 0, 'title'], 'Something else');
		expect(JSON.stringify(ASSIGNMENT)).toBe(before);
	});

	it('specPathKey prints a path the way a refusal names it', () => {
		expect(specPathKey(['modules', 0, 'blocks', 2, 'prompt'])).toBe('modules[0].blocks[2].prompt');
		expect(specPathKey([])).toBe('');
	});
});

// ---------------------------------------------------------------------------
// The markdown bridge.
// ---------------------------------------------------------------------------

describe('the markdown / rich-text bridge', () => {
	it('opens ordinary prose in the editor and writes it back the same', () => {
		const md = '### Weigh each sample\n\nRecord to **two** decimals, then *check* your work.\n\n- Goggles on\n- Balance zeroed';
		expect(markdownEditable(md)).toBe(true);
		const doc = markdownToItemDoc(md);
		expect(doc).not.toBeNull();
		expect(itemDocToMarkdown(doc!)).toBe(md);
	});

	it('carries a link and a nested list through unchanged', () => {
		const md = 'See [the table](https://example.edu/t).\n\n1. Measure\n  - mass\n  - volume\n2. Divide';
		expect(markdownEditable(md)).toBe(true);
		const doc = markdownToItemDoc(md)!;
		expect(itemDocToMarkdown(doc)).toBe(md);
	});

	it('refuses the editor for a table, a code block, a quotation and inline code', () => {
		// AN IMAGE USED TO BE THE FIFTH CASE HERE AND IS NOT ANY MORE (0176).
		// `ItemBlock` gained an image member, so a figure line now round-trips
		// through `markdownToItemDoc` / `itemDocToMarkdown` unchanged and the
		// field opens in the editor -- which is asserted, in the other
		// direction, in the case immediately below. The assertion is MOVED
		// rather than deleted: a construct that stopped making a field
		// uneditable is exactly the kind of change that should have to be
		// written down somewhere.
		const cases: [string, string][] = [
			['| a | b |\n|---|---|\n| 1 | 2 |', 'a table'],
			['```\nx = 1\n```', 'a code block'],
			['> Careful here.', 'a quotation'],
			['Type `npm test` first.', 'inline code']
		];
		for (const [md, reason] of cases) {
			expect(markdownEditable(md)).toBe(false);
			expect(markdownUneditableReasons(md)).toContain(reason);
		}
		// POSITIVE CONTROL: the same predicate says yes to ordinary prose, so
		// "false" above is a judgement rather than a function that always refuses.
		expect(markdownEditable('Just a sentence.')).toBe(true);
		expect(markdownUneditableReasons('Just a sentence.')).toEqual([]);
	});

	it('OPENS a field carrying an image, which it did not before 0176', () => {
		const md = '![The bench](attachment:bench.png)';
		expect(markdownEditable(md)).toBe(true);
		expect(markdownUneditableReasons(md)).toEqual([]);
		const doc = markdownToItemDoc(md)!;
		expect(doc).toEqual([{ type: 'img', src: 'attachment:bench.png', alt: 'The bench' }]);
		expect(itemDocToMarkdown(doc)).toBe(md);
	});

	it('re-serializes a hard-wrapped paragraph as one line, and calls that editable', () => {
		// The measured reason `markdownEditable` is a SEMANTIC test rather than a
		// byte comparison: this renders identically either way.
		const md = 'One sentence\nwrapped across two lines.';
		expect(markdownEditable(md)).toBe(true);
		expect(itemDocToMarkdown(markdownToItemDoc(md)!)).toBe('One sentence wrapped across two lines.');
	});

	it('reports UNFAITHFUL when the editor holds text markdown would re-read', () => {
		// A literal asterisk pair: `parseInline` has no escape syntax, so writing
		// it out and reading it back produces emphasis instead of the characters.
		const doc = docToTiptap([{ type: 'p', runs: [{ text: 'Multiply 3 *by* 4.' }] }]);
		const out = markdownFromEditor(doc);
		expect(out.markdown).toBe('Multiply 3 *by* 4.');
		expect(out.faithful).toBe(false);
		// The same defect through the link arm: brackets typed as characters.
		const brackets = markdownFromEditor(
			docToTiptap([{ type: 'p', runs: [{ text: 'Write [a](https://x) literally.' }] }])
		);
		expect(brackets.faithful).toBe(false);

		// POSITIVE CONTROLS, so "faithful: false" is a judgement rather than a
		// function that always says no: ordinary text, a real bold mark, a real
		// link and a real list all come back faithful.
		const plain = markdownFromEditor(docToTiptap([{ type: 'p', runs: [{ text: 'Multiply 3 by 4.' }] }]));
		expect(plain.faithful).toBe(true);
		const bold = markdownFromEditor(
			docToTiptap([{ type: 'p', runs: [{ text: 'Record to ' }, { text: 'two', bold: true }, { text: ' decimals.' }] }])
		);
		expect(bold.markdown).toBe('Record to **two** decimals.');
		expect(bold.faithful).toBe(true);
		const link = markdownFromEditor(
			docToTiptap([{ type: 'p', runs: [{ text: 'the table', href: 'https://example.edu/t' }] }])
		);
		expect(link.markdown).toBe('[the table](https://example.edu/t)');
		expect(link.faithful).toBe(true);
		const list = markdownFromEditor(
			docToTiptap([{ type: 'ul', items: [[{ text: 'Goggles' }], [{ text: 'Balance' }]] }])
		);
		expect(list.markdown).toBe('- Goggles\n- Balance');
		expect(list.faithful).toBe(true);
	});

	it('drops an empty trailing paragraph rather than writing a blank block', () => {
		expect(editorToMarkdown({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe('');
	});

	it('appends an image as its own figure line, using the one reference spelling', () => {
		const figure = figureReference('bench setup.png');
		expect(figure).toBe('![bench setup](attachment:bench setup.png)');
		expect(appendFigure('Weigh each sample.', figure)).toBe(`Weigh each sample.\n\n${figure}`);
		expect(appendFigure('', figure)).toBe(figure);
		expect(appendFigure('Trailing space.   \n\n', figure)).toBe(`Trailing space.\n\n${figure}`);
	});
});

// ---------------------------------------------------------------------------
// The real corpus. A PROPERTY, never its bytes -- see the header.
// ---------------------------------------------------------------------------

describe('the enumeration holds over every spec in materials/', () => {
	const paths = execSync("find materials -name '*.json'", { encoding: 'utf8' })
		.trim()
		.split('\n')
		.filter(Boolean);

	const specs: { path: string; kind: EditableSpecKind; spec: AssignmentSpec | ReferenceSpec }[] = [];
	for (const path of paths) {
		let doc: Record<string, unknown>;
		try {
			doc = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
		} catch {
			continue;
		}
		if (doc?.kind === 'reference' && Array.isArray(doc.sections)) {
			specs.push({ path, kind: 'reference', spec: doc as unknown as ReferenceSpec });
		} else if (Array.isArray(doc?.modules) && doc?.meta) {
			specs.push({ path, kind: 'assignment', spec: doc as unknown as AssignmentSpec });
		}
	}

	it('found specs to sweep', () => {
		// The case count, so a sweep that generated nothing cannot pass. A FLOOR
		// rather than an equality: `materials/` is app-written and grows.
		expect(specs.length).toBeGreaterThanOrEqual(10);
	});

	it('every surface reads back as a string and re-writing it changes nothing', () => {
		let checked = 0;
		const problems: string[] = [];
		for (const { path, kind, spec } of specs) {
			const surfaces = specTextSurfaces(spec, kind);
			for (const s of surfaces) {
				checked += 1;
				if (typeof s.value !== 'string') problems.push(`${path} ${s.key}: not a string`);
			}
			const edits = new Map(surfaces.map((s) => [s.key, s.value]));
			const next = applySpecTextEdits(spec, kind, edits);
			if (JSON.stringify(next) !== JSON.stringify(spec)) problems.push(`${path}: no-op rewrite changed the document`);
			const verdict = guardSpecTextEdit(spec, next, kind);
			if (!verdict.ok) problems.push(`${path}: guard refused a no-op -- ${verdict.violations[0].message}`);
		}
		expect(problems).toEqual([]);
		expect(checked).toBeGreaterThan(500);
	});

	it('a one-word edit to every prose field is permitted, and the rest is untouched', () => {
		let edited = 0;
		const refused: string[] = [];
		for (const { path, kind, spec } of specs) {
			for (const s of specTextSurfaces(spec, kind)) {
				if (s.kind !== 'prose') continue;
				edited += 1;
				const next = applySpecTextEdits(spec, kind, new Map([[s.key, `${s.value} Reworded.`]]));
				const verdict = guardSpecTextEdit(spec, next, kind);
				if (!verdict.ok) refused.push(`${path} ${s.key}: ${verdict.violations[0].message}`);
				else if (verdict.changed.length !== 1) refused.push(`${path} ${s.key}: ${verdict.changed.length} changed`);
			}
		}
		expect(refused).toEqual([]);
		expect(edited).toBeGreaterThan(100);
	});
});
