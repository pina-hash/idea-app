// tests/connector-match.test.ts
//
// THE CONNECTOR PICKS THE CLASS HE NAMES (ledger 0457, report 02fd45c0).
// On 2026-10-28 "IDEA209H Block 2" came back ambiguous between Block 2 and
// Section 2 Block 3; on 2026-10-26 "209H Block 3", the exact title, matched
// Section 3 Block 4. Every phrase below is one he said or the label the site
// prints, run against his real class shapes (a section label and a separate
// block, as `classroom_sections` stores them), and every expected class is
// written out by hand, never derived from the matcher.

import { describe, expect, it } from 'vitest';
import { matchClasses, parseClassPhrase, type MySection } from '../src/lib/server/connector/resolve';

function cls(id: string, courseCode: string, courseTitle: string, label: string, block: string | null): MySection {
	const sec = /\s/.test(label) ? label : `Section ${label}`;
	const blk = block ? (/\s/.test(block) ? block : `Block ${block}`) : null;
	return { id, courseCode, courseTitle, label, block, title: [courseCode, sec, blk].filter(Boolean).join(' · ') };
}

// His Fall 2026 classes as the site labels them.
const MINE: MySection[] = [
	cls('h1', 'IDEA209H', 'Engineering I Honors', '1', '2'),
	cls('h2', 'IDEA209H', 'Engineering I Honors', '2', '3'),
	cls('h3', 'IDEA209H', 'Engineering I Honors', '3', '4'),
	cls('f1', 'IDEA 100', 'Technology Rotation', '1', '5'),
	cls('f2', 'IDEA 100', 'Technology Rotation', '2', '1')
];
const ids = (said: string) => matchClasses(MINE, said).map((s) => s.id).sort();

describe('a block number picks that block outright', () => {
	const cases: Array<[string, string[]]> = [
		['IDEA209H Block 2', ['h1']],
		['209H Block 3', ['h2']],
		['IDEA209H · Section 2 · Block 3', ['h2']],
		['IDEA209H · Section 3 · Block 4', ['h3']],
		['Block 4', ['h3']],
		['block 1', ['f2']],
		['IDEA 100 · Section 2 · Block 1', ['f2']],
		['IDEA100 Block 5', ['f1']],
		['idea 2 9H, block 4, section 3', ['h3']],
		['209H B2', ['h1']],
		['period 3', ['h2']]
	];
	for (const [said, want] of cases) {
		it(`"${said}"`, () => expect(ids(said)).toEqual(want));
	}
});

describe('section numbers, course numbers and bare numbers', () => {
	it('a section number picks the section, never a block with that number', () => {
		expect(ids('209H Section 2')).toEqual(['h2']);
		expect(ids('IDEA100 section 1')).toEqual(['f1']);
	});
	it('the digits of a course code are the course, not a block', () => {
		// "2" is inside IDEA209H; it must not pick Block 2 or Section 2.
		expect(ids('IDEA209H')).toEqual(['h1', 'h2', 'h3']);
		expect(ids('IDEA 100')).toEqual(['f1', 'f2']);
	});
	it('a bare number after the course is the block', () => {
		expect(ids('209H 4')).toEqual(['h3']);
		expect(ids('IDEA100 5')).toEqual(['f1']);
	});
	it('a block that does not exist matches nothing rather than a near miss', () => {
		expect(ids('209H Block 5')).toEqual([]);
		expect(ids('IDEA209H Block 1')).toEqual([]);
	});
	it('every and all keep their word', () => {
		expect(parseClassPhrase('all 209H').all).toBe(true);
		expect(parseClassPhrase('209H Block 2').all).toBe(false);
	});
});

describe('the classes the connector fixture uses (a label that is the block)', () => {
	const FIXTURE: MySection[] = [
		cls('b2', 'IDEA209H', 'Engineering I Honors', 'Block 2', null),
		cls('b4', 'IDEA209H', 'Engineering I Honors', 'Block 4', null)
	];
	it('reads the block off the label', () => {
		expect(matchClasses(FIXTURE, '209H Block 2').map((s) => s.id)).toEqual(['b2']);
		expect(matchClasses(FIXTURE, 'Block 4').map((s) => s.id)).toEqual(['b4']);
		expect(matchClasses(FIXTURE, '209H').map((s) => s.id).sort()).toEqual(['b2', 'b4']);
	});
});
