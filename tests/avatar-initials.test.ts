// tests/avatar-initials.test.ts
//
// THE TILE MUST NEVER SPELL A NAME NOBODY HAS.
//
// `displayName()` in `$lib/profile.ts` ends its ladder on the literal sentence
// 'Signed in' -- which is correct where it was written, because `ProfileMenu`
// is always describing the person holding the session. `initials()` then takes
// the FIRST LETTERS of whatever that ladder returned, and for a row with no
// display name, no full name and no address that is **SI**: two capitals that
// read as a person called S. I. rather than as an absence.
//
// 0033 found this and fixed HALF of it. `subjectAvatar`/`subjectInitials`
// correct the tile's text for a SUBJECT (anybody who is not the viewer), and
// this bundle's surfaces all go through that. What 0033 left is the `profile`
// path: `avatarSource(profile)` builds its own text with `initials()`, and
// `Avatar.svelte` used to render that text verbatim -- so the viewer's own
// nameless row still painted 'SI'.
//
// WHAT THIS FILE PINS, and why each half is here:
//
//   1. THE DEFECT IS REAL AND STILL LIVES IN `initials()`. Asserted against
//      the real exported function rather than described, so nobody has to
//      take this comment's word for it -- and so that the day somebody fixes
//      `initials()` itself (a `$lib/profile.ts` change this bundle did not
//      own) this test fails LOUDLY and is corrected rather than quietly
//      becoming a claim about nothing.
//   2. NOTHING RENDERS IT ANY MORE. `avatarSource` is the only caller left,
//      and `Avatar.svelte` no longer reads its text. A SWEEP of `src/` holds
//      that: a new direct caller of `initials(` is a new way back to 'SI'.
//
// The rendering half is asserted by MOUNTING in
// `tests/dom/avatar-fallback-mount.svelte.test.ts` -- effects only run in that
// project -- and the geometry half is measured in the browser harness. Nothing
// here touches either.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initials, displayName, avatarSource, type UserProfile } from '$lib/profile';
import { subjectInitials, subjectAvatar, gridStudentSubject, rosterSubject } from '$lib/avatars';

const NAMELESS: UserProfile = {
	id: 'u1',
	email: null,
	full_name: null,
	display_name: null,
	avatar_url: null,
	avatar: null,
	role: '',
	section_id: null,
	pathway: null,
	preferences: {}
};

describe('the defect, on the real functions', () => {
	it("displayName's last rung is a SENTENCE, which is what makes initials wrong", () => {
		expect(displayName(NAMELESS)).toBe('Signed in');
		expect(displayName(null)).toBe('Signed in');
	});

	it("initials() STILL answers 'SI' -- unfixed, and this test is its tripwire", () => {
		// If this ever fails, `$lib/profile.ts` was corrected at the source.
		// That is a GOOD outcome: delete this expectation and say so, do not
		// weaken it. What must never happen is it failing unnoticed.
		expect(initials(NAMELESS)).toBe('SI');
		expect(initials(null)).toBe('SI');
	});

	it('and avatarSource carries that text into its initials source', () => {
		const src = avatarSource(NAMELESS);
		expect(src.kind).toBe('initials');
		expect(src.kind === 'initials' && src.text).toBe('SI');
	});
});

describe('the correction, which every rendered tile now goes through', () => {
	it("subjectInitials answers '?' for a subject with no identity at all", () => {
		expect(subjectInitials(null)).toBe('?');
		expect(subjectInitials(undefined)).toBe('?');
		expect(subjectInitials({})).toBe('?');
		expect(subjectInitials({ display_name: null, full_name: null, email: null })).toBe('?');
		// WHITESPACE IS NOT A NAME. A roster row imported from a spreadsheet
		// with a stray space in the name column is the ordinary way to reach
		// this, and it must not be treated as identified.
		expect(subjectInitials({ display_name: '   ', full_name: '\t', email: ' ' })).toBe('?');
	});

	it('AND STILL ANSWERS NORMALLY FOR EVERYBODY ELSE -- the positive control', () => {
		expect(subjectInitials({ display_name: 'Alice Alvarez' })).toBe('AA');
		expect(subjectInitials({ full_name: 'Bruno Barros' })).toBe('BB');
		expect(subjectInitials({ email: 'carla.cruz@boscotech.net' })).toBe('CC');
		// The ladder's own order: display_name outranks full_name outranks email.
		expect(
			subjectInitials({
				display_name: 'Zed Zephyr',
				full_name: 'Bruno Barros',
				email: 'carla@boscotech.net'
			})
		).toBe('ZZ');
	});

	it('subjectAvatar corrects the TEXT and leaves the priority order alone', () => {
		const empty = subjectAvatar({});
		expect(empty).toEqual({ kind: 'initials', text: '?' });
		// A chosen preset still wins, untouched -- the correction is text-only.
		expect(subjectAvatar({ avatar: 'preset:hex' }).kind).toBe('preset');
		expect(subjectAvatar({ avatar_url: 'https://x.example/p.png' })).toEqual({
			kind: 'image',
			url: 'https://x.example/p.png'
		});
	});

	it('BOTH ROW ADAPTERS reach it, so no surface has its own answer', () => {
		expect(subjectInitials(rosterSubject({ student_email: null, display_name: null }))).toBe('?');
		expect(subjectInitials(gridStudentSubject({ name: null, email: null }))).toBe('?');
		// Positive control on the same call.
		expect(subjectInitials(rosterSubject({ student_email: 'ann.b@boscotech.net' }))).toBe('AB');
		expect(subjectInitials(gridStudentSubject({ name: 'Dana Diaz' }))).toBe('DD');
	});
});

// ---------------------------------------------------------------------------
// THE SWEEP. `initials()` is exported and still wrong; what keeps it off a
// screen is that nothing reads its answer. That is a property of the tree, so
// it is measured against the tree.
// ---------------------------------------------------------------------------
function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (/\.(svelte|ts)$/.test(name)) out.push(full);
	}
	return out;
}

describe('the sweep: no second way back to a name nobody has', () => {
	const files = walk('src');

	it('finds a real corpus -- a sweep over nothing passes vacuously', () => {
		// The positive control on the sweep itself: assert it actually read the
		// tree, so "no hits" cannot be told apart from "read no files".
		expect(files.length).toBeGreaterThan(300);
		expect(files).toContain(join('src', 'lib', 'Avatar.svelte'));
		expect(files).toContain(join('src', 'lib', 'profile.ts'));
	});

	/**
	 * COMMENTS ARE STRIPPED FIRST, and that is not tidiness. Both files below
	 * DISCUSS the defect at length, quoting the very expressions this sweep
	 * looks for, so a raw text search matches the explanation of the bug as
	 * readily as the bug. A checker that cannot tell code from prose is a
	 * checker that reddens when somebody documents a fix.
	 */
	const code = (f: string) =>
		readFileSync(f, 'utf8')
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/(^|[^:])\/\/.*$/gm, '$1');

	it('EXACTLY TWO call sites of initials(), both of them the delegation', () => {
		const sites: string[] = [];
		for (const f of files) {
			for (const line of code(f).split('\n')) {
				// `subjectInitials(` must not count, so the character before the
				// identifier must not be a word character -- the same guard the
				// preflight scanner uses for `fetch`. The definition itself is
				// excluded by name.
				if (/(^|[^\w$])initials\(/.test(line) && !/function initials/.test(line)) {
					sites.push(`${f}: ${line.trim()}`);
				}
			}
		}
		// BOTH ARE CORRECT AND NEITHER REACHES A SCREEN:
		//   * `avatars.ts` is `subjectInitials` delegating for an IDENTIFIED
		//     subject, which is the whole point of that function -- "which
		//     letters" has one implementation and it is `initials`.
		//   * `profile.ts` is `avatarSource` filling in `AvatarSource.text`,
		//     which `Avatar.svelte` no longer reads (asserted below).
		// A THIRD is a new way back to 'SI' and must be looked at.
		expect(sites.sort()).toEqual(
			[
				`${join('src', 'lib', 'avatars.ts')}: return initials({`,
				`${join('src', 'lib', 'profile.ts')}: return { kind: 'initials', text: initials(profile) };`
			].sort()
		);
	});

	it("Avatar.svelte's tile text comes from subjectInitials, never from source.text", () => {
		const src = code(join('src', 'lib', 'Avatar.svelte'));
		// The exact expression, so a refactor that reintroduces the branch is a
		// failure rather than a silent regression.
		expect(src).toContain('const fallbackText = $derived(subjectInitials(profile ?? subject));');
		expect(src).not.toContain("source.kind === 'initials' ? source.text");
		// Positive control on the stripper: the comment that QUOTES the old
		// expression is genuinely in the file, and genuinely removed here.
		expect(readFileSync(join('src', 'lib', 'Avatar.svelte'), 'utf8')).toContain(
			"source.kind === 'initials' ? source.text"
		);
	});
});
