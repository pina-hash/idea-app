// tests/foundry-author-name.test.ts
//
// WHOSE NAME GOES UNDER A PUBLISHED APP, AND THE RUNG THAT MUST NEVER BE
// REACHED.
//
// The portal has a three-rung name helper -- `displayName()` in $lib/profile --
// whose third rung is the EMAIL ADDRESS. That is correct for a profile menu the
// account holder is looking at. On a Foundry surface it is a disclosure: every
// signed-in student can read the gallery, so a card that fell through to the
// third rung would print a classmate's school address to the whole school.
//
// THE REGRESSION IS SILENT IN THE WORST WAY. It only fires for a profile with
// no `full_name`, so a developer testing with their own populated account sees
// a name and concludes it works. And it is not hypothetical: `foundryAuthorName`
// is three lines, and "why not just call the helper we already have" is the
// obvious simplification for someone who has not read this file.
//
// SAMPLED AGAINST PRODUCTION (ten students, none with a chosen display name):
// `full_name` is the NORMAL path, not an exceptional fallback. So the case that
// runs every time is the second rung, which makes the first rung the one that
// gets dropped by accident and the third the one that gets added by accident.
// Both directions are pinned below.
//
// AND `owner_class` NULL IS A FIRST-CLASS ANSWER (0132): an app outlives an
// enrollment, a roster import lags a term, a student transfers, an alumnus
// keeps a published app. It renders as NOTHING -- no placeholder, no label, no
// colon, no stranded separator -- which is asserted here as arithmetic and in
// tests/foundry-gallery.test.ts as rendered markup.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
	foundryAuthorClass,
	foundryAuthorLine,
	foundryAuthorName
} from '../src/lib/foundry/surface';
import { displayName } from '../src/lib/profile';

/** The address that must never come out of any of these. */
const EMAIL = 'student@boscotech.net';

describe('the author name is two rungs, never three', () => {
	it('prefers a chosen display name', () => {
		expect(
			foundryAuthorName({ owner_display_name: 'Ana R.', owner_full_name: 'Ana Reyes' })
		).toBe('Ana R.');
	});

	it('falls back to the full name, which production says is the normal path', () => {
		expect(foundryAuthorName({ owner_display_name: null, owner_full_name: 'Ana Reyes' })).toBe(
			'Ana Reyes'
		);
	});

	it('treats a whitespace-only display name as unset rather than as a name', () => {
		// A stored '   ' would otherwise win the first rung and render a blank
		// where a name goes, which reads as a broken card rather than as a
		// missing value.
		expect(foundryAuthorName({ owner_display_name: '   ', owner_full_name: 'Ana Reyes' })).toBe(
			'Ana Reyes'
		);
	});

	it('answers NULL rather than inventing a label when there is no name at all', () => {
		expect(foundryAuthorName({ owner_display_name: null, owner_full_name: null })).toBeNull();
		expect(foundryAuthorName({ owner_display_name: '', owner_full_name: '  ' })).toBeNull();
	});

	/**
	 * THE THIRD RUNG, ASSERTED AGAINST THE HELPER THAT HAS ONE.
	 *
	 * The expected value here comes from the FIXTURE -- the address is written
	 * above and is what a profile row would carry -- not from what either
	 * function returned. The positive control is that `displayName` really does
	 * fall through to it on the identical input, so "Foundry does not return the
	 * email" is a statement about Foundry rather than about an input that had no
	 * email in it.
	 */
	it('never falls through to the email, where the portal helper does', () => {
		const profile = { display_name: null, full_name: null, email: EMAIL } as never;
		// POSITIVE CONTROL: the three-rung helper DOES return the address here.
		expect(displayName(profile)).toBe(EMAIL);

		expect(
			foundryAuthorName({ owner_display_name: null, owner_full_name: null })
		).not.toBe(EMAIL);
		expect(foundryAuthorLine({ owner_display_name: null, owner_full_name: null })).toBe('');
	});

	/**
	 * THE PAYLOAD HAS NO EMAIL FIELD TO FALL THROUGH TO, which is the structural
	 * half of the same guarantee: 0132's two definers project no address, so
	 * even a helper that wanted the third rung would have nothing to read.
	 * Pinned on the TYPE's own declaration, because a field added there later is
	 * exactly how the rung would come back.
	 */
	it('has no owner email anywhere in the payload type', () => {
		const src = readFileSync('src/lib/foundry/transports.ts', 'utf8');
		const author = src.slice(
			src.indexOf('export interface FoundryAuthor'),
			src.indexOf('export interface FoundryApp')
		);
		// Positive control: the slice really did find the interface.
		expect(author).toContain('owner_display_name');
		expect(author).toContain('owner_full_name');
		expect(author).toContain('owner_class');
		expect(author).not.toMatch(/owner_email|\bemail\b\s*:/);
	});
});

describe('the class is optional and renders as nothing', () => {
	it('passes a class through, trimmed', () => {
		expect(foundryAuthorClass({ owner_class: ' Engineering I Honors ' })).toBe(
			'Engineering I Honors'
		);
	});

	it('answers null for absent, empty and whitespace-only', () => {
		expect(foundryAuthorClass({ owner_class: null })).toBeNull();
		expect(foundryAuthorClass({})).toBeNull();
		expect(foundryAuthorClass({ owner_class: '  ' })).toBeNull();
	});

	/**
	 * THE SEPARATOR IS THE THING THAT SURVIVES A NULL. `name + (cls ? ' · ' +
	 * cls : '')` written inline at two call sites is where a card ends up
	 * reading "Ana Reyes ·", so the join is done once and asserted here.
	 */
	it('joins name and class only when BOTH are present', () => {
		const both = {
			owner_display_name: null,
			owner_full_name: 'Ana Reyes',
			owner_class: 'Engineering I Honors'
		};
		expect(foundryAuthorLine(both)).toBe('Ana Reyes · Engineering I Honors');

		const nameOnly = { owner_display_name: null, owner_full_name: 'Ana Reyes', owner_class: null };
		expect(foundryAuthorLine(nameOnly)).toBe('Ana Reyes');
		expect(foundryAuthorLine(nameOnly)).not.toContain('·');

		const classOnly = { owner_display_name: null, owner_full_name: null, owner_class: 'Intro to IDEA' };
		expect(foundryAuthorLine(classOnly)).toBe('Intro to IDEA');
		expect(foundryAuthorLine(classOnly)).not.toContain('·');

		expect(foundryAuthorLine({ owner_display_name: null, owner_full_name: null, owner_class: null })).toBe('');
	});
});

/**
 * NO FOUNDRY MODULE MAY CALL THE THREE-RUNG HELPER. The two functions above
 * being correct says nothing about whether a surface reached past them, and
 * that is the mistake this sweep exists to catch -- it is one import away at
 * any time.
 */
describe('no Foundry surface imports the three-rung helper', () => {
	const FILES = [
		'src/lib/foundry/FoundryGallery.svelte',
		'src/lib/foundry/FoundryDetail.svelte',
		'src/lib/foundry/ReviewQueue.svelte',
		'src/lib/foundry/FoundryInspector.svelte',
		'src/lib/foundry/surface.ts',
		'src/routes/foundry/+page.svelte',
		'src/routes/foundry/review/+page.svelte'
	];

	it('imports displayName nowhere, and does render the author line somewhere', () => {
		let renders = 0;
		for (const file of FILES) {
			const src = readFileSync(file, 'utf8');
			expect(src, `${file} imports the three-rung name helper`).not.toMatch(
				/from ['"]\$lib\/profile['"]/
			);
			if (/foundryAuthor(Name|Line)/.test(src)) renders += 1;
		}
		// POSITIVE CONTROL: the sweep can SEE a name being rendered, so "none of
		// them import the wrong helper" is not passing because none of them
		// render a name at all.
		expect(renders, 'no Foundry surface renders an author name').toBeGreaterThan(1);
		expect(FILES).toHaveLength(7);
	});
});
