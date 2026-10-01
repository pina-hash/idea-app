/**
 * "NO PATHWAY YET" (ledger 0360, report R18): the one rule for who the
 * first-sign-in sheet asks, and that every surface asking it calls the rule
 * rather than spelling its own.
 *
 * The dates are PINNED: the rule takes `today` as a string, so nothing here
 * reads a clock, and the two days either side of the school year's start
 * (1 August, Los Angeles) are both asserted.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	NO_PATHWAY_LABEL,
	PATHWAY_PREFERENCES_NAMESPACE,
	notYetPreference,
	pathwayNotYetHolds,
	pathwayPromptWanted,
	readPathwayNotYet,
	schoolYearStartDay,
	todaySchoolDay
} from '$lib/pathway-choice';
import { mergeNamespace } from '$lib/preferences/profile-io';

const prefsWith = (value: unknown) => ({ homepage: { pinned: ['x'] }, [PATHWAY_PREFERENCES_NAMESPACE]: value });

describe('the stored answer is read strictly', () => {
	it('reads a well-formed answer', () => {
		expect(readPathwayNotYet(prefsWith({ v: 1, day: '2026-09-30' }))).toEqual({ v: 1, day: '2026-09-30' });
	});

	it('drops an unknown version, a malformed day, an array and null, never coercing one', () => {
		expect(readPathwayNotYet(prefsWith({ v: 2, day: '2026-09-30' }))).toBeNull();
		expect(readPathwayNotYet(prefsWith({ v: 1, day: 'yesterday' }))).toBeNull();
		expect(readPathwayNotYet(prefsWith({ v: 1, day: '2026-13-01' }))).toBeNull();
		expect(readPathwayNotYet(prefsWith({ v: 1, day: 20260930 }))).toBeNull();
		expect(readPathwayNotYet(prefsWith(['2026-09-30']))).toBeNull();
		expect(readPathwayNotYet(prefsWith(null))).toBeNull();
		expect(readPathwayNotYet(null)).toBeNull();
		expect(readPathwayNotYet([])).toBeNull();
		expect(readPathwayNotYet({})).toBeNull();
	});

	it('stores exactly what it reads back, under its own namespace, next to every sibling', () => {
		const blob = mergeNamespace({ homepage: { pinned: ['x'] } }, PATHWAY_PREFERENCES_NAMESPACE, notYetPreference('2026-10-01'));
		expect(blob.homepage).toEqual({ pinned: ['x'] });
		expect(readPathwayNotYet(blob)).toEqual(notYetPreference('2026-10-01'));
	});
});

describe('the school year starts on 1 August', () => {
	it('either side of the boundary', () => {
		expect(schoolYearStartDay('2026-07-31')).toBe('2025-08-01');
		expect(schoolYearStartDay('2026-08-01')).toBe('2026-08-01');
		expect(schoolYearStartDay('2026-12-31')).toBe('2026-08-01');
		expect(schoolYearStartDay('2027-01-04')).toBe('2026-08-01');
	});

	it('an answer holds for the year it was given in and no longer', () => {
		const prefs = prefsWith(notYetPreference('2026-09-15'));
		expect(pathwayNotYetHolds(prefs, '2026-09-15')).toBe(true);
		expect(pathwayNotYetHolds(prefs, '2027-07-31')).toBe(true);
		expect(pathwayNotYetHolds(prefs, '2027-08-01')).toBe(false);
	});

	it('todaySchoolDay is the Los Angeles calendar day, not UTC', () => {
		/* 8pm Pacific on 27 August is already 28 August in UTC. */
		expect(todaySchoolDay(new Date('2026-08-28T03:00:00Z'))).toBe('2026-08-27');
	});
});

describe('pathwayPromptWanted, in both directions', () => {
	const TODAY = '2026-10-01';
	const student = { role: 'student', pathway: null, preferences: {} };

	it('asks an unset student who has not answered', () => {
		expect(pathwayPromptWanted(student, TODAY)).toBe(true);
	});

	it('does not ask a student who answered "not yet" this school year', () => {
		expect(pathwayPromptWanted({ ...student, preferences: prefsWith(notYetPreference('2026-08-20')) }, TODAY)).toBe(false);
	});

	it('asks again once a new school year has started', () => {
		expect(pathwayPromptWanted({ ...student, preferences: prefsWith(notYetPreference('2026-07-31')) }, TODAY)).toBe(true);
	});

	it('asks again when the stored answer is unreadable', () => {
		expect(pathwayPromptWanted({ ...student, preferences: prefsWith({ v: 9, day: '2026-09-01' }) }, TODAY)).toBe(true);
	});

	it('never asks a teacher, a visitor, nobody, or a student with a pathway', () => {
		expect(pathwayPromptWanted({ ...student, role: 'teacher' }, TODAY)).toBe(false);
		expect(pathwayPromptWanted({ ...student, role: 'visitor' }, TODAY)).toBe(false);
		expect(pathwayPromptWanted(null, TODAY)).toBe(false);
		expect(pathwayPromptWanted({ ...student, pathway: 'CSEE' }, TODAY)).toBe(false);
	});

	it('never reads an email address (no class-of-year guess)', () => {
		const src = readFileSync('src/lib/pathway-choice.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
		expect(src).not.toMatch(/email/i);
		/* Positive control: an address on the profile changes nothing. */
		expect(pathwayPromptWanted({ ...student, email: 'fresh.man.30@boscotech.net' } as never, TODAY)).toBe(true);
	});
});

describe('every surface that asks calls the one rule', () => {
	const CALLERS = ['src/lib/PathwayPicker.svelte', 'src/lib/tour/HomeTour.svelte', 'src/lib/tour/HomeTourOffer.svelte'];
	/* The old inline spelling of the show rule, in any of the three forms it took. */
	const INLINE = /role\s*(?:===|!==)\s*'student'\s*(?:&&|\|\|)\s*!?\s*\w*\??\.?pathway/;

	it('imports pathwayPromptWanted and spells no copy of it', () => {
		for (const f of CALLERS) {
			const src = readFileSync(f, 'utf8');
			expect(src, `${f} does not import the rule`).toMatch(
				/import\s*\{[^}]*\bpathwayPromptWanted\b[^}]*\}\s*from\s*'\$lib\/pathway-choice'/
			);
			expect(src, `${f} calls no rule`).toMatch(/pathwayPromptWanted\(/);
			expect(src, `${f} still spells the old rule inline`).not.toMatch(INLINE);
		}
	});

	it('and the sweep would find the old spelling (its positive control)', () => {
		expect(`profile?.role === 'student' && !profile.pathway`).toMatch(INLINE);
		expect(`if (!claims || profile?.role !== 'student' || profile?.pathway) return false;`).toMatch(INLINE);
		expect(`p?.role === 'student' && !p?.pathway`).toMatch(INLINE);
	});
});

describe('the profile menu offers the choice', () => {
	it('is always present and pickable, never a disabled placeholder', () => {
		const src = readFileSync('src/lib/ProfileMenu.svelte', 'utf8');
		expect(src).toContain('<option value="">{NO_PATHWAY_LABEL}</option>');
		expect(src).not.toMatch(/<option value="" disabled>/);
		expect(NO_PATHWAY_LABEL).toBe('No pathway yet');
	});

});
