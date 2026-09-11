// tests/html-assignment-manifest-parity.test.ts
//
// THE TWO PLACES A PORTED DOCUMENT IS JUDGED, held to the same rules.
//
// `src/lib/classroom/html-assignment/manifest.ts` is what the composer runs at
// import; `tools/validate-assignment-spec.py` is what an author runs before
// delivery. Python cannot import TypeScript and a browser cannot run the python
// tool, so a handful of rules exist twice -- which `CLAUDE.md` allows only where
// the two are a MIRROR in the sense `docText` mirrors `_classroom_doc_text`, and
// only where something compares them. This file is that something.
//
// WITHOUT IT, THE DRIFT IS SILENT AND IT RUNS THE WRONG WAY. A weekday added to
// one list and not the other means a document that passes pre-delivery
// validation and is then refused at import, or -- worse -- one that is waved
// through at import having been refused by the tool nobody re-ran. Neither
// throws, neither type-checks, and the only symptom is an author being told two
// different things about one file.
//
// WHAT THIS FILE DOES **NOT** CLAIM: that the two sides SCAN the same text.
// The opaque-origin trap warnings read `documentScripts` in TypeScript and the
// raw bytes in python, which is a deliberate difference rather than drift --
// those are WARNINGS, where a mention in prose costs a sentence, and the python
// scan predates the split. The handshake REFUSAL is script-scoped on both
// sides, and the test below pins that, because a refusal a comment can satisfy
// is not a refusal.
//
// IT READS THE PYTHON SOURCE AS TEXT, deliberately: the point is to compare the
// SHIPPED lists, not two copies of a fixture. A positive control sits under each
// comparison, because a regex that stopped matching the file would otherwise
// report an empty list equal to an empty list.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	BRITISH_SPELLING_RE,
	HTML_BLOCK_TYPES,
	HTML_ID_RE,
	HTML_MANIFEST_SCRIPT_ID,
	HX_SANDBOX_TRAPS,
	HTML_SHORT_MAX_WORDS,
	WEEKDAYS
} from '../src/lib/classroom/html-assignment/manifest';
import { MIN_LEVELS, MAX_LEVELS } from '../src/lib/classroom/assignment-spec';
import { HX_READY_TYPE } from '../src/lib/classroom/html-assignment/bridge';

const PY = readFileSync(
	fileURLToPath(new URL('../tools/validate-assignment-spec.py', import.meta.url)),
	'utf8'
);

/**
 * The value of a python parenthesised assignment, by name, ending at the
 * MATCHING close paren.
 *
 * Not "up to the next blank line", which was the first shape and was wrong in a
 * way that read as a real failure: `HTML_BLOCK_TYPES` is followed immediately by
 * `MANIFEST_SCRIPT_ID` with no blank line between them, so the slice swallowed
 * the neighbour and the count came back 8 instead of 6. A reader would have
 * gone looking for two extra block types that do not exist.
 */
function pySource(name: string): string {
	const at = PY.indexOf(`${name} = (`);
	expect(at, `${name} is not a parenthesised assignment in the python tool`).toBeGreaterThan(-1);
	const open = PY.indexOf('(', at);
	let depth = 0;
	for (let i = open; i < PY.length; i += 1) {
		if (PY[i] === '(') depth += 1;
		else if (PY[i] === ')') {
			depth -= 1;
			if (depth === 0) return PY.slice(open + 1, i);
		}
	}
	throw new Error(`${name} has no matching close paren`);
}

describe('the manifest rules that exist in two languages', () => {
	it('names the same weekdays, in the same order', () => {
		const src = pySource('WEEKDAYS');
		const found = [...src.matchAll(/"([A-Z][a-z]+day)"/g)].map((m) => m[1]);
		// POSITIVE CONTROL: a regex that stopped matching would give [] here and
		// the comparison below would be an empty list against a real one.
		expect(found.length).toBe(7);
		expect(found).toEqual([...WEEKDAYS]);
	});

	it('refuses the same British spellings', () => {
		const src = pySource('BRITISH');
		// The python literal is a wrapped raw string; strip the wrapping so what
		// is left is the alternation itself.
		const alternation = src
			.replace(/r"/g, '')
			.replace(/"/g, '')
			.replace(/\s+/g, '');
		const terms = (s: string) =>
			s
				.replace(/^\\b\(/, '')
				.replace(/\)\\b$/, '')
				.split('|')
				.sort();
		const pyTerms = terms(alternation);
		const tsTerms = terms(BRITISH_SPELLING_RE.source);
		expect(pyTerms.length).toBeGreaterThan(5); // positive control
		expect(pyTerms).toEqual(tsTerms);
	});

	it('uses the same id pattern, which is classroom_responses.block_id\'s', () => {
		expect(PY).toContain('r"^[A-Za-z0-9_-]{1,40}$"');
		expect(HTML_ID_RE.source).toBe('^[A-Za-z0-9_-]{1,40}$');
	});

	it('accepts the same block types', () => {
		const src = pySource('HTML_BLOCK_TYPES');
		const found = [...src.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]);
		expect(found.length).toBe(6); // positive control
		expect(found).toEqual([...HTML_BLOCK_TYPES]);
	});

	it('looks for the manifest under the same element id', () => {
		expect(PY).toContain(`MANIFEST_SCRIPT_ID = "${HTML_MANIFEST_SCRIPT_ID}"`);
	});

	it('caps a short form at the same number of words', () => {
		expect(HTML_SHORT_MAX_WORDS).toBe(6);
		// The python tool spells the cap inline in its message and its test.
		expect(PY).toContain('words, maximum 6');
		expect(PY).toContain('len(sh.split()) > 6');
	});

	it('asks for the same handshake, by the same name', () => {
		// A refusal keyed on one spelling of a token the other side calls
		// something else is a refusal that bites in one language only, and the
		// author is then told two different things about one file.
		expect(HX_READY_TYPE).toBe('idea:ready');
		expect(PY).toContain(`READY_TYPE = "${HX_READY_TYPE}"`);
		// And the python side scans SCRIPTS for it, not raw bytes -- a refusal a
		// comment can satisfy is not a refusal.
		expect(PY).toContain('if READY_TYPE not in document_scripts(html)');
	});

	it('warns about the same opaque-origin traps, in the same order', () => {
		const py = pySource('SANDBOX_TRAPS');
		const names = [...py.matchAll(/\(\s*"([^"]+)"/g)].map((m) => m[1]);
		// The positive control: a regex that stopped matching the file would
		// otherwise report an empty list equal to an empty list.
		expect(names.length, 'the python trap list should not read as empty').toBeGreaterThan(3);
		expect(names).toEqual(HX_SANDBOX_TRAPS.map((t) => t.name));
	});

	it('takes the level count from assignment-spec, not from a third number', () => {
		// The TS validator CALLS criterionIssues, so this is the count both the
		// spec importer and the rubric builder already enforce; the python tool
		// spells the same pair, and a change to one has to move the other.
		expect([MIN_LEVELS, MAX_LEVELS]).toEqual([3, 4]);
		expect(PY).toContain('needs 3 or 4');
		expect(PY).toContain('maximum is 4');
	});
});

describe('the python tool keeps ONE copy of the rubric rules', () => {
	it('calls level_errors from both paths rather than restating them', () => {
		// A level rule that held for a spec and not for a manifest is exactly the
		// drift the shared helper exists to prevent.
		const calls = [...PY.matchAll(/level_errors\(/g)].length;
		// One definition, two call sites.
		expect(calls).toBe(3);
		expect(PY).toContain('def level_errors(');
	});

	it('routes a manifest and a spec through one entry point', () => {
		expect(PY).toContain('def check_path(');
		expect(PY).toContain('errs, warns = check_path(path)');
	});
});
