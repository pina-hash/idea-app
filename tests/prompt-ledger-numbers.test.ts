// tests/prompt-ledger-numbers.test.ts
//
// LEDGER 0458, REPORT fb08d358: ONE LEDGER NUMBER, ONE ENTRY FILE.
//
// Two entries took 0453 the same morning (2026-10-28: the FRC sources and
// authoring 2.15, which then moved to 0459), and nothing said so. A number is
// how a prompt, a history entry and a migration claim name one session, so two
// files under one number are two sessions answering to the same name. This
// holds every `docs/prompt-ledger/entries/NNNN-*.md` number to one file, the
// way `apply-migration-claimants.test.ts` holds a migration to one claimant.
//
// THE TWO PAIRS ALREADY IN THE TREE ARE NAMED, NOT IGNORED: 0438 and 0439 each
// carry two entries from 2026-10-23, both landed and referenced by their file
// names, and renaming either now would break those references. Any other
// repeat, or a third file under either, fails.

import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = 'docs/prompt-ledger/entries';
const KNOWN_PAIRS: Readonly<Record<string, number>> = { '0438': 2, '0439': 2 };

function byNumber(names: readonly string[]): Map<string, string[]> {
	const out = new Map<string, string[]>();
	for (const name of names) {
		const m = /^(\d{4})-.+\.md$/.exec(name);
		if (!m) continue;
		out.set(m[1], [...(out.get(m[1]) ?? []), name]);
	}
	return out;
}

/** The numbers taken by more files than the frozen list allows. */
export function repeatedLedgerNumbers(names: readonly string[]): Array<{ number: string; files: string[] }> {
	return [...byNumber(names)]
		.filter(([n, files]) => files.length > (KNOWN_PAIRS[n] ?? 1))
		.map(([number, files]) => ({ number, files: files.sort() }));
}

describe('every ledger number names one entry', () => {
	const names = readdirSync(DIR);

	it('reads a real ledger', () => {
		expect(byNumber(names).size).toBeGreaterThan(400);
	});

	it('no number is taken twice, apart from the two pairs already landed', () => {
		expect(repeatedLedgerNumbers(names)).toEqual([]);
		for (const [n, count] of Object.entries(KNOWN_PAIRS)) expect(byNumber(names).get(n)?.length, n).toBe(count);
	});

	it('positive control: a second file under a free number is caught, and so is a third under a known pair', () => {
		expect(repeatedLedgerNumbers([...names, '0458-another-session.md'])).toEqual([
			{ number: '0458', files: ['0458-another-session.md', '0458-html-program-site-side.md'] }
		]);
		expect(repeatedLedgerNumbers([...names, '0438-third.md']).map((r) => r.number)).toEqual(['0438']);
	});
});
