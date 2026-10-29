// tests/html-assignment-any-one.test.ts
//
// LEDGER 0458: "ANY ONE OF THESE" GROUPS (report 3d205727) AND OPTIONAL WORK
// THAT NEVER COUNTS (report 88ad281b).
//
// A group is ONE requirement met by any member. Before it, the kit's
// data-any-one boxes were each `optional` in the manifest, so a student who
// filled none of them read 100% done. The expected numbers here are worked by
// hand: a 6-point module with one required box and one group is two units of
// 3 points each.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { hxCompletion, hxProgress, hxProgressNextLine } from '$lib/classroom/html-assignment/progress';
import { hxAnswersLeft, hxAnswersLeftCount } from '$lib/classroom/html-assignment/answers-left';
import { htmlAnswerSheet } from '$lib/classroom/html-assignment/mount';
import { validateHtmlManifest, type HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
import HtmlAnswerList from '$lib/classroom/html-assignment/HtmlAnswerList.svelte';

const LEVELS = [
	{ points: 6, label: 'Complete', short: 'All there', descriptor: 'Every part is present.' },
	{ points: 3, label: 'Developing', short: 'Half there', descriptor: 'Half the parts are present.' },
	{ points: 0, label: 'Absent', short: 'Nothing', descriptor: 'Nothing is present.' }
];

function manifest(groupOver: Record<string, unknown> = {}): HtmlAssignmentManifest {
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Pick a sketch',
		course: 'IDEA100',
		points: 6,
		modules: [
			{
				id: 'm1',
				title: 'Sketch',
				points: 6,
				blocks: [
					{ id: 'name-it', field: 'nameIt', type: 'text' },
					{ id: 'a', field: 'optA', type: 'longText', optional: true, anyOf: 'pick', prompt: 'A sketch on paper' },
					{ id: 'b', field: 'optB', type: 'image', optional: true, anyOf: 'pick' },
					{ id: 'c', field: 'optC', type: 'text', optional: true, anyOf: 'pick', ...groupOver },
					{ id: 'extra', field: 'extra', type: 'longText', optional: true }
				],
				criteria: [{ id: 'c1', text: 'Sketch', points: 6, levels: LEVELS }]
			}
		]
	} as HtmlAssignmentManifest;
}

describe('a group counts once, met by any member', () => {
	it('nothing filled: two units owed, none met, the group named as any one of three', () => {
		const p = hxProgress(manifest(), {});
		expect(p.totalBlocks).toBe(2);
		expect(p.metBlocks).toBe(0);
		expect(p.percent).toBe(0);
		expect(hxAnswersLeftCount(p)).toBe(2);
		const rows = hxAnswersLeft(manifest(), p)[0].items;
		expect(rows.map((r) => r.want)).toEqual(['Empty', 'Fill any one of 3']);
		// The jump lands on the group's first box.
		expect(rows[1].field).toBe('optA');
	});

	it('the required box alone is half the bar, and the group is still owed', () => {
		const p = hxProgress(manifest(), { nameIt: 'Spinner' });
		expect(p.percent).toBe(50);
		expect(p.complete).toBe(false);
		expect(hxProgressNextLine(p)).toBe('Next up: "Sketch", answer 2 of 2, needs any one of 3 boxes filled.');
	});

	it('any one member completes the group, a picture included', () => {
		for (const [values, images] of [
			[{ nameIt: 'x', optA: 'drawn' }, {}],
			[{ nameIt: 'x', optC: 'done' }, {}],
			[{ nameIt: 'x' }, { optB: { url: '/f/1', name: 'p.jpg', caption: '' } }]
		] as const) {
			const p = hxProgress(manifest(), values, images);
			expect(p.complete, JSON.stringify(values)).toBe(true);
			expect(p.percent).toBe(100);
		}
	});

	it('a plain optional box never counts, filled or not', () => {
		expect(hxProgress(manifest(), { nameIt: 'x', extra: 'more' }).percent).toBe(50);
		expect(hxProgress(manifest(), { nameIt: 'x', optA: 'y' }).totalBlocks).toBe(2);
	});

	it('an unsaved member holds a filled group at 99', () => {
		const p = hxProgress(manifest(), { nameIt: 'x', optA: 'y' }, {}, { unsaved: ['optA'] });
		expect(p.filled).toBe(true);
		expect(p.percent).toBe(99);
	});

	it('completion is the latest answered member', () => {
		const done = hxCompletion(
			manifest(),
			[
				{ block_id: 'name-it', value: { text: 'x' }, updated_at: '2026-10-20T10:00:00Z' },
				{ block_id: 'c', value: { text: 'y' }, updated_at: '2026-10-21T10:00:00Z' }
			] as never
		);
		expect(done.complete).toBe(true);
		expect(done.at).toBe('2026-10-21T10:00:00.000Z');
		const none = hxCompletion(manifest(), [{ block_id: 'name-it', value: { text: 'x' }, updated_at: '2026-10-20T10:00:00Z' }] as never);
		expect(none.complete).toBe(false);
	});
});

describe('the importer checks a group', () => {
	it('accepts a well-formed group', () => {
		expect(validateHtmlManifest('', manifest()).errors).toEqual([]);
	});

	it('refuses a member that is not optional, a group of one, a malformed id, and a group in two modules', () => {
		const notOptional = validateHtmlManifest('', manifest({ optional: false }));
		expect(notOptional.errors.join(' ')).toMatch(/group "pick" but is not optional/);

		const m1 = manifest();
		m1.modules[0].blocks = m1.modules[0].blocks.filter((b) => b.id === 'name-it' || b.id === 'a');
		expect(validateHtmlManifest('', m1).errors.join(' ')).toMatch(/group "pick" with one box/);

		const bad = validateHtmlManifest('', manifest({ anyOf: 'a b' }));
		expect(bad.errors.join(' ')).toMatch(/sets anyOf to "a b"/);

		const two = manifest();
		two.points = 12;
		two.modules.push({
			id: 'm2',
			title: 'Second',
			points: 6,
			blocks: [
				{ id: 'q', field: 'q', type: 'text', optional: true, anyOf: 'pick' },
				{ id: 'r', field: 'r', type: 'text', optional: true, anyOf: 'pick' }
			],
			criteria: [{ id: 'c1', text: 'Second', points: 6, levels: LEVELS }]
		} as never);
		expect(validateHtmlManifest('', two).errors.join(' ')).toMatch(/used in modules "m1" and "m2"/);
	});
});

describe('Answers shows a group as one row', () => {
	const student = (values: Record<string, string>) => ({
		email: 's@boscotech.net',
		displayName: 'Sam',
		responses: Object.entries(values).map(([field, text]) => ({
			block_id: { nameIt: 'name-it', optA: 'a', optB: 'b', optC: 'c', extra: 'extra' }[field] as string,
			value: { text }
		})),
		files: []
	});

	it('the sheet marks the members', () => {
		const sheet = htmlAnswerSheet(manifest(), {}, {});
		expect(sheet[0].cells.map((c) => c.anyOf)).toEqual([null, 'pick', 'pick', 'pick', null]);
	});

	it('one row for the group: none answered, then only the members filled', () => {
		const empty = render(HtmlAnswerList, { props: { manifest: manifest(), student: student({ nameIt: 'x' }) as never } }).body;
		expect(empty.match(/data-testid="answers-any-one"/g)?.length).toBe(1);
		expect(empty).toContain('None of the 3 answered');
		// Five blocks, one of them a three-member group: three question rows.
		expect(empty.match(/<dt/g)?.length).toBe(3);

		const one = render(HtmlAnswerList, { props: { manifest: manifest(), student: student({ nameIt: 'x', optC: 'my pick' }) as never } }).body;
		expect(one).not.toContain('None of the 3 answered');
		expect(one).toContain('my pick');
		expect(one.match(/class="answers-member[ "]/g)?.length).toBe(1);
	});
});

describe('optional work never counts (88ad281b), measured on the real Rotation 2 Survey', () => {
	const src = readFileSync('assignment-sources/idea100/rotation-2-survey.src.html', 'utf8');
	const json = /<script type="application\/json" id="idea-manifest">([\s\S]*?)<\/script>/.exec(src)?.[1] ?? '';
	const m = JSON.parse(json) as HtmlAssignmentManifest;

	it('counts the six required answers and none of the fifty-one optional ones', () => {
		const all = m.modules.flatMap((x) => x.blocks);
		expect(all.length).toBe(57);
		const p = hxProgress(m, {});
		expect(p.totalBlocks).toBe(6);
		const optionalFilled = Object.fromEntries(all.filter((b) => b.optional).map((b) => [b.field, 'yes']));
		expect(hxProgress(m, optionalFilled).percent).toBe(0);
	});
});
