// tests/standards-version-header.test.ts
//
// Every document under docs/standards/ states its version twice: once in the
// header line at the top, and once as the first entry of its Changelog. This
// asserts the two agree.
//
// WHY THIS IS A TEST. A header that has fallen behind its own changelog is
// invisible: the document reads correctly end to end, every rule in it is
// current, and the only thing wrong is the number a reader quotes when they say
// which version they built against. That is enough to do real damage -- it has
// already caused a document to be rewritten from a stale base -- and both
// `IDEA_RUBRIC_STANDARDS` 1.2 and `IDEA_INTERFACE_STANDARDS` 2.0 carry a
// changelog line recording the same correction being made by hand after the
// fact, which is the pattern this closes.
//
// These files are COPIES of documents authored outside this repo (see
// CLAUDE.md, "Standards copied in from outside"). This test therefore fixes
// nothing: it REFUSES a copy whose two version statements disagree, so the
// mismatch is caught at the moment the copy lands rather than months later by
// whoever quotes the wrong number.

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
 * mistaken for the header.
 */
const HEADER_VERSION = /^\*\*Version\s+(\d+(?:\.\d+)*)\b/m;

/** The first changelog entry, e.g. `- **2.4 (2026-08-21)** - ...`. */
const ENTRY_VERSION = /^-\s+\*\*(\d+(?:\.\d+)*)\s*\(/m;

const HEADER_LINES = 10;

function headerVersion(text: string): string | null {
	const head = text.split('\n').slice(0, HEADER_LINES).join('\n');
	return HEADER_VERSION.exec(head)?.[1] ?? null;
}

function changelogVersion(text: string): string | null {
	const heading = /^##\s+Changelog\s*$/m.exec(text);
	if (!heading) return null;
	// From the heading to the next `## ` heading, or the end of the file.
	const rest = text.slice(heading.index + heading[0].length);
	const nextHeading = /^##\s/m.exec(rest);
	const section = nextHeading ? rest.slice(0, nextHeading.index) : rest;
	return ENTRY_VERSION.exec(section)?.[1] ?? null;
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

	it.each(files)('%s states the same version in both places', (name) => {
		const text = readFileSync(join(STANDARDS_DIR, name), 'utf8');

		const header = headerVersion(text);
		const changelog = changelogVersion(text);

		// Checked separately from the equality below so a document missing a
		// header line or a Changelog section says WHICH, rather than failing
		// as an uninformative `null !== null`.
		expect(
			header,
			`${name}: no "**Version X.Y ..." line in the first ${HEADER_LINES} lines`
		).not.toBeNull();
		expect(
			changelog,
			`${name}: no "- **X.Y (date)** ..." entry under a "## Changelog" heading`
		).not.toBeNull();

		expect(
			header,
			`${name}: the header says ${header}, but the newest changelog entry is ${changelog}. ` +
				'The header has fallen behind its own changelog. Correct it UPSTREAM and copy the ' +
				'document in again; do not edit it here.'
		).toBe(changelog);
	});
});
