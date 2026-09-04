// tests/curriculum-course-identity.test.ts
//
// THE COURSE FIELD IS THE COURSE, AND NOTHING ELSE.
//
// `Section.course` used to carry a rotation number for the three freshman
// sections (`IDEA 100-1`, `IDEA 100-2`, `IDEA 100-3`), which made one field
// answer two questions. `activeCourseCount()` is a Set over that field, so the
// home page's Active Courses tile read 4 against a pathway running 2 -- correct
// arithmetic over incorrect data. The rotation lives in `rotation` now and
// `sectionCode()` is the one place the two are joined again.
//
// WHY THIS IS AUTOMATED AT ALL, against the repo's default that a visible
// failure belongs in a harness: an identifier quietly regaining a second field
// is not visible. The tile would go on rendering a number, `sectionCode()`
// would go on returning a string, nothing would throw, and the only symptom
// would be a count nobody re-derives -- which is exactly how the 4 stood. Mr.
// Pina's standing rule is that course IDs are the only identifiers and the A-G
// submissions use them, so an ID silently carrying scheduling is a defect
// everywhere it is read, not just on the tile.
//
// THE ASSERTIONS ARE THE CONTRACT, NOT TODAY'S CATALOG. Nothing below spells
// out "there are two courses" or names IDEA 100 as the only rotation holder: a
// new course, a fourth rotation and a retired section are all ordinary edits to
// hand-maintained metadata and must not redden this file. What is pinned is the
// RULE -- a course value carries no section-distinguishing suffix, a rotation
// is recorded separately, and the composition round-trips.

import { describe, expect, it } from 'vitest';
import {
	SECTIONS,
	activeCourseCount,
	sectionById,
	sectionCode,
	type Section
} from '$lib/curriculum';
import { FSP_CONCLUDED } from '$lib/fsp/archive';

/**
 * The shape a course code carrying a rotation takes: a trailing `-<digits>`.
 * This is the thing that must never appear in `course` again.
 */
const ROTATION_SUFFIX = /-\d+$/;

describe('curriculum: `course` names a course and nothing narrower', () => {
	it('has sections to check, and more than one course among them (positive control)', () => {
		// Without this the sweeps below pass over an empty or single-course
		// catalog and prove nothing at all.
		expect(SECTIONS.length).toBeGreaterThan(1);
		expect(new Set(SECTIONS.map((s) => s.course)).size).toBeGreaterThan(1);
	});

	it('never writes a rotation number into a course value', () => {
		const offenders = SECTIONS.filter((s) => ROTATION_SUFFIX.test(s.course)).map(
			(s) => `${s.id} -> ${s.course}`
		);
		expect(offenders, 'a course code is carrying a section-distinguishing suffix').toEqual([]);
	});

	it('records a rotation as its own field, as a positive integer', () => {
		for (const s of SECTIONS) {
			if (s.rotation === undefined) continue;
			expect(Number.isInteger(s.rotation), `${s.id}: rotation is not an integer`).toBe(true);
			expect(s.rotation, `${s.id}: rotation is not positive`).toBeGreaterThan(0);
		}
	});

	it('gives every section of a rotated course a rotation, and a distinct one', () => {
		// The invariant that makes `sectionCode()` total: if ANY section of a
		// course carries a rotation then every section of that course does, and
		// no two of them share a number -- otherwise two sections compose to the
		// same printed code and the split has bought nothing.
		const byCourse = new Map<string, Section[]>();
		for (const s of SECTIONS) {
			const list = byCourse.get(s.course);
			if (list) list.push(s);
			else byCourse.set(s.course, [s]);
		}
		for (const [course, list] of byCourse) {
			const rotated = list.filter((s) => s.rotation !== undefined);
			if (!rotated.length) continue;
			expect(rotated.length, `${course}: some sections carry a rotation and some do not`).toBe(
				list.length
			);
			const numbers = rotated.map((s) => s.rotation);
			expect(new Set(numbers).size, `${course}: two sections share a rotation number`).toBe(
				numbers.length
			);
		}
	});

	it('leaves no two sections indistinguishable, code or no code', () => {
		/*
		 * NOT "every printed code is unique", WHICH IS THE WRONG CONTRACT AND
		 * THIS ASSERTION FAILED ON IT FIRST. The three IDEA 209H sections
		 * deliberately share one code: they are three YEAR BANDS of one offering
		 * (Sophomore, Junior, Senior), which is why they always collapsed
		 * correctly and why they were never the bug. A rotation is what a code
		 * must distinguish; a year band is distinguished by `year`.
		 *
		 * So the real rule is that no two sections are the same row: the pair
		 * (printed code, year, term) separates every section from every other.
		 * That is what makes a picker's label honest whichever of the three
		 * fields it happens to print.
		 */
		const keys = SECTIONS.map((s) => `${sectionCode(s)}|${s.year}|${s.term}`);
		expect(new Set(keys).size, `two sections are indistinguishable: ${keys.join(', ')}`).toBe(
			keys.length
		);
	});

	it('round-trips: the printed code is the course when there is no rotation', () => {
		expect(sectionCode({ course: 'IDEA 209H' })).toBe('IDEA 209H');
		expect(sectionCode({ course: 'IDEA 209H', rotation: undefined })).toBe('IDEA 209H');
		expect(sectionCode({ course: 'IDEA 100', rotation: 1 })).toBe('IDEA 100-1');
		expect(sectionCode({ course: 'IDEA 100', rotation: 12 })).toBe('IDEA 100-12');
	});

	it('composes exactly the strings the pre-split `course` field held', () => {
		// The one place today's catalog is named on purpose: these five strings
		// were in `course` before the split and are on handouts and in stored
		// habits, so the composition has to reproduce them rather than merely be
		// self-consistent. A section RETIRED from the catalog drops out of this
		// check; one that changes its printed code reddens it, which is correct
		// -- that is a decision, not a refactor.
		const printed = new Map(SECTIONS.map((s) => [s.id, sectionCode(s)]));
		const wasStored: Record<string, string> = {
			'summer-2026': 'IDEA FSP',
			'intro-100-1': 'IDEA 100-1',
			'intro-100-2': 'IDEA 100-2',
			'intro-100-3': 'IDEA 100-3',
			'eng1h-sophomore': 'IDEA 209H',
			'eng1h-junior': 'IDEA 209H',
			'eng1h-senior': 'IDEA 209H'
		};
		for (const [id, code] of Object.entries(wasStored)) {
			if (!printed.has(id)) continue;
			expect(printed.get(id), `${id} no longer prints the code it was stored under`).toBe(code);
		}
	});
});

describe('curriculum: activeCourseCount counts courses', () => {
	it('counts DISTINCT course values, excluding a concluded programme', () => {
		// Derived from the same catalog by a different route than the function
		// uses, so the two can disagree: the function maps then Sets, this one
		// filters then Sets over an independently written predicate.
		const expected = new Set(
			SECTIONS.filter((s) => !(s.id === 'summer-2026' && FSP_CONCLUDED)).map((s) => s.course)
		).size;
		expect(activeCourseCount()).toBe(expected);
	});

	it('collapses every rotation of one course into one count', () => {
		// The defect, stated as a property rather than as the number 2: however
		// many sections a course has and however they are distinguished, a course
		// contributes exactly one to the tile.
		const live = SECTIONS.filter((s) => !(s.id === 'summer-2026' && FSP_CONCLUDED));
		const courses = new Set(live.map((s) => s.course));
		expect(activeCourseCount()).toBe(courses.size);
		expect(activeCourseCount()).toBeLessThan(live.length);
	});

	it('is not fooled by two sections that differ only in rotation', () => {
		// A constructed pair, so the check is real even on a catalog that happens
		// to hold no rotated course.
		const a: Pick<Section, 'course' | 'rotation'> = { course: 'IDEA 999', rotation: 1 };
		const b: Pick<Section, 'course' | 'rotation'> = { course: 'IDEA 999', rotation: 2 };
		expect(new Set([a.course, b.course]).size).toBe(1);
		expect(sectionCode(a)).not.toBe(sectionCode(b));
	});
});

describe('curriculum: the catalog stays resolvable', () => {
	it('resolves every id, so no stored section_id was orphaned by the split', () => {
		for (const s of SECTIONS) {
			expect(sectionById(s.id)?.id, `${s.id} stopped resolving`).toBe(s.id);
		}
		expect(sectionById('summer-2026')?.id).toBe('summer-2026');
	});
});
