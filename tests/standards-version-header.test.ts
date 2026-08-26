// tests/standards-version-header.test.ts
//
// A standards document under docs/standards/ (one that carries a
// `**Version X.Y ...**` header in its first few lines) states its version in
// up to three places, and this asserts they agree wherever a document states
// more than one:
//
//   1. the header line itself;
//   2. the newest entry of its own `## Changelog` section, when that
//      changelog is VERSION-KEYED (an entry shaped `- **X.Y (date)** - ...`);
//   3. its row in REGISTER.md, the one place outside the file itself that
//      also claims to know its version.
//
// WHY THIS IS A TEST. A header that has fallen behind its own changelog, or a
// register row that has fallen behind the file it describes, is invisible:
// the document reads correctly end to end, every rule in it is current, and
// the only thing wrong is the number a reader quotes when they say which
// version they built against. That is enough to do real damage -- it has
// already caused a document to be rewritten from a stale base, and separately
// caused `IDEA_instructions.md` to sit in this mirror at 4.2 while the
// register also said 4.2 and project knowledge said 4.3, with nothing
// anywhere comparing the register to the directory. Both
// `IDEA_RUBRIC_STANDARDS` 1.2 and `IDEA_INTERFACE_STANDARDS` 2.0 carry a
// changelog line recording the header-vs-changelog version of this same
// correction being made by hand after the fact.
//
// These files are COPIES of documents authored outside this repo (see
// CLAUDE.md, "Standards mirrored from project knowledge"). This test
// therefore fixes nothing: it REFUSES a copy whose version statements
// disagree, so the mismatch is caught at the moment the copy lands rather
// than months later by whoever quotes the wrong number.
//
// FOUR THINGS IN THIS DIRECTORY ARE DELIBERATELY EXEMPT FROM THE
// HEADER-VS-CHANGELOG COMPARISON, and each is exempted structurally (by what
// the file actually contains) rather than by name, so a future file of the
// same shape is exempted automatically with no edit here:
//
//   - `REGISTER.md` and `README.md` carry no `**Version X.Y ...**` header at
//     all -- one is an index, the other explains the directory -- so neither
//     is a "standards document" this comparison applies to.
//   - `IDEA_instructions.md` keys its changelog by DATE, not by version
//     (`2026-08-19`, `19b`, `19c`, `19d` are four distinct corrections that no
//     single version number could tell apart), so its changelog has no
//     version to compare the header against.
//   - `IDEA_REFERENCE_LIBRARY.md` keys its changelog entries in a different
//     shape again (`**v4.1 - August 26, 2026**`, with no leading list bullet),
//     which is likewise not the `- **X.Y (date)**` shape this test can read a
//     version out of.
//   - `IDEA_PRINT_STANDARDS.md` has no `## Changelog` section at all.
//
// In every one of those cases the header is still required to exist; only the
// second, changelog-shaped statement of the version is optional.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STANDARDS_DIR = fileURLToPath(new URL('../docs/standards', import.meta.url));

/**
 * GLOBBED, not listed. `coin-symbol.test.ts` lists its sources explicitly
 * because a glob would quietly stop covering a file that moved; here the
 * opposite is true. This directory is a COPY-IN TARGET -- the next standard
 * written outside the repo arrives as a NEW file in it, and a hand-kept list
 * would leave that file unchecked on exactly the copy that introduced it.
 *
 * The count assertion below is what keeps the sweep honest: a glob that matched
 * nothing would otherwise pass by never running a per-file assertion at all.
 */
const files = readdirSync(STANDARDS_DIR)
	.filter((name) => name.endsWith('.md'))
	.sort();

/**
 * The header line, e.g. `**Version 2.4 - 2026-08-21**`. Searched only in the
 * opening lines, because these documents discuss their own version numbers in
 * prose ("stale at 1.1 since that version") and a body mention must never be
 * mistaken for the header. A file with no match here is not a standards
 * document this test covers at all (see `REGISTER.md` / `README.md` above).
 */
const HEADER_VERSION = /^\*\*Version\s+(\d+(?:\.\d+)*)\b/m;

/**
 * The first changelog entry, e.g. `- **2.4 (2026-08-21)** - ...`. Deliberately
 * narrow: it must NOT match a date-keyed entry (`- **2026-08-26e** - ...`) or
 * `IDEA_REFERENCE_LIBRARY.md`'s unbulleted `**v4.1 - <date>**` shape, because
 * both of those are cases where there genuinely is no changelog version to
 * compare against the header, not cases this regex merely fails to parse.
 */
const ENTRY_VERSION = /^-\s+\*\*(\d+(?:\.\d+)*)\s*\(/m;

/** A row of REGISTER.md, e.g. `` | `IDEA_RUBRIC_STANDARDS.md` | 1.3 | ... ``. */
const REGISTER_ROW = /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|/gm;

const HEADER_LINES = 10;

function headerVersion(text: string): string | null {
	const head = text.split('\n').slice(0, HEADER_LINES).join('\n');
	return HEADER_VERSION.exec(head)?.[1] ?? null;
}

/** Returns the changelog's version-keyed newest entry, or null if there is no
 * `## Changelog` heading, or its newest entry is not version-keyed. */
function changelogVersion(text: string): string | null {
	const heading = /^##\s+Changelog\s*$/m.exec(text);
	if (!heading) return null;
	// From the heading to the next `## ` heading, or the end of the file.
	const rest = text.slice(heading.index + heading[0].length);
	const nextHeading = /^##\s/m.exec(rest);
	const section = nextHeading ? rest.slice(0, nextHeading.index) : rest;
	return ENTRY_VERSION.exec(section)?.[1] ?? null;
}

function hasChangelogHeading(text: string): boolean {
	return /^##\s+Changelog\s*$/m.test(text);
}

describe('docs/standards version headers', () => {
	it('covers every standards document', () => {
		// The sweep's own case count, plus the three documents known to be
		// here. Named individually so that deleting one is a failure rather
		// than a silently smaller sweep.
		expect(files.length).toBeGreaterThanOrEqual(3);
		expect(files).toContain('IDEA_INTERFACE_STANDARDS.md');
		expect(files).toContain('IDEA_MATERIAL_SPEC_v2.md');
		expect(files).toContain('IDEA_RUBRIC_STANDARDS.md');
	});

	// A "standards document" for the rest of this file means: carries a
	// `**Version X.Y ...**` header. That is a structural test, not a name
	// check, so `REGISTER.md` and `README.md` -- and the next non-standard
	// file dropped into this directory -- are excluded with no edit here.
	const standards = files
		.map((name) => ({ name, text: readFileSync(join(STANDARDS_DIR, name), 'utf8') }))
		.filter(({ text }) => headerVersion(text) !== null);

	it('found at least one standards document with a version header', () => {
		// Same purpose as the count assertion above, one level in: a change to
		// `headerVersion` that stopped matching anything would otherwise leave
		// every per-file assertion below running zero real cases.
		expect(standards.length).toBeGreaterThan(0);
	});

	it.each(standards)('$name states a consistent version', ({ name, text }) => {
		const header = headerVersion(text);
		expect(
			header,
			`${name}: no "**Version X.Y ..." line in the first ${HEADER_LINES} lines`
		).not.toBeNull();

		if (!hasChangelogHeading(text)) {
			// e.g. IDEA_PRINT_STANDARDS.md -- no Changelog section exists to
			// compare the header against. The header itself was just asserted
			// above; there is nothing further this document states to check.
			return;
		}

		const changelog = changelogVersion(text);
		if (changelog === null) {
			// A Changelog section exists, but its newest entry is not
			// version-keyed -- e.g. IDEA_instructions.md (date-keyed) or
			// IDEA_REFERENCE_LIBRARY.md (a different, unbulleted shape). Neither
			// makes a second version claim this test can read, so there is
			// nothing to compare it against.
			return;
		}

		expect(
			header,
			`${name}: the header says ${header}, but the newest changelog entry is ${changelog}. ` +
				'The header has fallen behind its own changelog. Correct it UPSTREAM and copy the ' +
				'document in again; do not edit it here.'
		).toBe(changelog);
	});

	it('every standards document is registered in REGISTER.md at its own version', () => {
		const registerText = readFileSync(join(STANDARDS_DIR, 'REGISTER.md'), 'utf8');

		const registered = new Map<string, string>();
		for (const match of registerText.matchAll(REGISTER_ROW)) {
			registered.set(match[1], match[2].trim());
		}

		// Same shape of honesty check as the sweep's own count assertion above:
		// a parser that stopped matching REGISTER.md's rows would otherwise let
		// every comparison below pass by finding nothing to disagree with.
		expect(registered.size).toBeGreaterThan(0);

		for (const { name, text } of standards) {
			const header = headerVersion(text);
			expect(
				registered.has(name),
				`${name}: has a version header but no row in REGISTER.md naming it`
			).toBe(true);
			expect(
				registered.get(name),
				`${name}: REGISTER.md says ${registered.get(name)}, but the file's own header says ${header}. ` +
					'Update the row in REGISTER.md to match.'
			).toBe(header);
		}
	});
});
