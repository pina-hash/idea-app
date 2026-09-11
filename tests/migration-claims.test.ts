// tests/migration-claims.test.ts
//
// `tools/migration-claims.mjs` answers the one question `ls
// supabase/migrations/` cannot: which migration numbers are LANDED, which a
// lane in flight is already HOLDING, and which are actually free.
//
// WHY THIS EARNS A TEST, against this repo's default of verifying by dev
// harness. Every way it can be wrong is silent, and the failure it exists to
// prevent is a file with a name somebody else already used:
//
//   * A CLAIM IT FAILS TO SEE reads as a free number. The tool says `0187`,
//     the session writes `0187`, and the collision happens with a tool in the
//     loop that said it was fine -- which is worse than no tool, because
//     nothing else gets checked afterwards.
//   * A CLAIM IT INVENTS burns a number nobody is using, and the next lane
//     skips it. The `0069` case below is the live version of this: entry 0083
//     reads "exactly one, the file 0069 wrote", where `0069` is a PROMPT
//     number, and a regex one character looser claims migration 0069 -- which
//     landed in July.
//   * A NUMBER BOTH CLAIMED AND LANDED counted twice reads as a contested
//     number that nobody is contesting.
//
// THE FIXTURES ARE THE TEST AND THE LIVE REFS ARE NOT. `classify()` is pure
// and takes an inventory, so every case here is built by hand and stays true
// next week. A test that read `origin/claude/**` would pass or fail on
// whatever happens to be in flight that afternoon, which is a ratchet
// recording what last happened rather than a check.
//
// THE CORPUS SWEEP IS THE OTHER HALF. Fixtures prove the parser does what its
// author meant; putting all of the committed `Migration permitted` lines
// through it proves it agrees with what people have actually written, in the
// dozen shapes a month of hand-written entries produced.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	claimMap,
	classify,
	contestedBranches,
	AGENT_BRANCH_PREFIXES,
	inFlightHoles,
	migrationNumber,
	normaliseStatus,
	parseEntry,
	parsePermitted,
	unexplainedHoles
} from '../tools/migration-claims.mjs';

const LEDGER_DIR = fileURLToPath(new URL('../docs/prompt-ledger/entries', import.meta.url));

type LedgerBlob = { file: string; text: string };
type FixtureBranch = { branch: string; migrations?: string[]; entries?: LedgerBlob[] };

/** A ledger entry in the shape a real one is written in. */
function entry({
	id,
	status = 'issued',
	permitted = 'no.'
}: {
	id: string;
	status?: string;
	permitted?: string;
}): LedgerBlob {
	return {
		file: `${id}-fixture.md`,
		text: [
			`# ${id} A fixture entry`,
			'- Issued: 2026-09-06',
			'- By: a test',
			'- Owns: nothing',
			`- Migration permitted: ${permitted}`,
			`- Status: ${status}`,
			'- Branch: assigned by the harness',
			'- Notes: none'
		].join('\n')
	};
}

function inventory({
	landedFiles = [],
	branches = []
}: {
	landedFiles?: string[];
	branches?: FixtureBranch[];
}) {
	return {
		refsVisible: true,
		refs: [
			{
				ref: 'origin/main',
				branch: 'origin/main',
				landed: true,
				migrations: landedFiles.map((f) => `supabase/migrations/${f}`),
				entries: []
			},
			...branches.map((b) => ({
				ref: `origin/${b.branch}`,
				branch: b.branch,
				landed: false,
				migrations: (b.migrations ?? []).map((f) => `supabase/migrations/${f}`),
				entries: b.entries ?? []
			}))
		]
	};
}

const LANDED_0001_TO_0185 = Array.from({ length: 185 }, (_, i) =>
	`${String(i + 1).padStart(4, '0')}_landed.sql`
);

describe('parsePermitted', () => {
	it('reads a refusal as no claim', () => {
		for (const line of [
			'- Migration permitted: no. Highest on origin/main at issue: 0185',
			'- Migration permitted: no.',
			'- Migration permitted: no. The role file carries a password and is not a migration.'
		]) {
			const p = parsePermitted(line);
			expect(p.numbers, line).toEqual([]);
			expect(p.permits, line).toBe(false);
		}
	});

	it('never mistakes the highest-at-issue number for a claim', () => {
		// THE FAILURE THIS PREVENTS: every refusing entry claiming the top of
		// the series, so the whole report reads as contested.
		expect(parsePermitted('- Migration permitted: no. Highest on origin/main at issue: 0185').numbers)
			.toEqual([]);
		expect(
			parsePermitted(
				'- Migration permitted: at most one, number taken at commit time. Highest on origin/main at issue: 0184'
			).numbers
		).toEqual([]);
	});

	it('reads an intent that names a number', () => {
		expect(parsePermitted('- Migration permitted: exactly one, 0176. Highest on origin/main at issue: 0175').numbers)
			.toEqual([176]);
		expect(
			parsePermitted(
				'- Migration permitted: at most one, 0175, only if proven necessary. Highest on origin/main at issue: 0174'
			).numbers
		).toEqual([175]);
		expect(
			parsePermitted('- Migration permitted: yes, exactly one, 0186. Highest on origin/main at issue: 0185').numbers
		).toEqual([186]);
	});

	it('does not claim a number that is only RESERVED for another prompt', () => {
		// The reservation belongs to the prompt it names, and that prompt's own
		// entry claims it. Claiming it here attributes the hold to the wrong
		// lane, and a reader chasing it finds a branch that never touched it.
		const p = parsePermitted(
			'- Migration permitted: exactly one, 0172. 0171 is RESERVED for prompt 0011. Highest on origin/main at issue: 0170'
		);
		expect(p.numbers).toEqual([172]);
	});

	it('does not read a PROMPT number as a migration number', () => {
		// Entry 0083, verbatim in shape. `0069` is a prompt, and migration 0069
		// landed months ago.
		const p = parsePermitted(
			'- Migration permitted: exactly one, the file 0069 wrote, number re-verified at commit time. Highest on origin/main at issue: 0184'
		);
		expect(p.numbers).toEqual([]);
		expect(p.resolution).toBe('unspecified');
	});

	it('prefers a recorded outcome over a stated intent', () => {
		const took = parsePermitted(
			'- Migration permitted: at most one, number taken at commit time. Highest on origin/main at issue: 0184. TAKEN: `0186_maps_media_no_anon_listing.sql` (0185 landed on `origin/main` between issue and commit; 0186 verified free)'
		);
		expect(took.numbers).toEqual([186]);
		expect(took.resolution).toBe('taken');

		const none = parsePermitted(
			'- Migration permitted: at most one, number taken at commit time. Highest on origin/main at issue: 0179. NONE TAKEN: Phase A established the schema needs no change.'
		);
		expect(none.numbers).toEqual([]);
		expect(none.resolution).toBe('none-taken');
	});

	it('reads the explicit Claims: token, which outranks every prose shape', () => {
		expect(parsePermitted('- Migration permitted: yes, exactly one. Claims: 0189. Highest on origin/main at issue: 0185').numbers)
			.toEqual([189]);
		expect(parsePermitted('- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0185').numbers)
			.toEqual([]);
		expect(parsePermitted('- Migration permitted: yes, two. Claims: 0190, 0191.').numbers).toEqual([190, 191]);
	});

	it('reports a permission that names no number as unspecified, never as none', () => {
		// The distinction is the whole point: "no migration" and "a migration
		// whose number nobody has stated" are different risks, and folding the
		// second into the first is what every collision to date looked like.
		const p = parsePermitted(
			'- Migration permitted: at most one, number taken at commit time. Highest on origin/main at issue: 0184'
		);
		expect(p.resolution).toBe('unspecified');
		expect(p.permits).toBe(true);
		expect(p.numbers).toEqual([]);
	});
});

describe('classify', () => {
	it('CONTROL 1: a claimed, unlanded number is reported as claimed and names the branch', () => {
		const withClaim = classify(
			inventory({
				landedFiles: LANDED_0001_TO_0185,
				branches: [
					{
						branch: 'claude/example-lane-abc123',
						entries: [entry({ id: '0090', permitted: 'yes, exactly one. Claims: 0186.' })]
					}
				]
			})
		);
		expect(withClaim.claimed.map((c) => c.number)).toEqual([186]);
		expect(withClaim.claimed[0].holders.map((h) => h.branch)).toEqual(['claude/example-lane-abc123']);
		expect(withClaim.claimed[0].holders[0].sources).toEqual(['ledger']);
		expect(withClaim.next).toBe(187);

		// ...AND THE MUTATION: remove the claim, nothing else, and 0186 reads free.
		const withoutClaim = classify(
			inventory({
				landedFiles: LANDED_0001_TO_0185,
				branches: [
					{
						branch: 'claude/example-lane-abc123',
						entries: [entry({ id: '0090', permitted: 'no.' })]
					}
				]
			})
		);
		expect(withoutClaim.claimed).toEqual([]);
		expect(withoutClaim.next).toBe(186);
	});

	it('CONTROL 2: a number both claimed and landed reads as landed once, not twice', () => {
		const r = classify(
			inventory({
				landedFiles: LANDED_0001_TO_0185,
				branches: [
					{
						branch: 'claude/example-lane-abc123',
						migrations: ['0185_landed.sql'],
						entries: [entry({ id: '0090', permitted: 'yes, exactly one. Claims: 0185.' })]
					}
				]
			})
		);
		expect(r.claimed).toEqual([]);
		expect(r.landed.filter((l) => l.number === 185)).toHaveLength(1);
		expect(r.next).toBe(186);
		expect(r.contested).toEqual([]);
	});

	it('a migration FILE on a branch is a claim, with or without a ledger line', () => {
		const r = classify(
			inventory({
				landedFiles: LANDED_0001_TO_0185,
				branches: [{ branch: 'claude/file-only-xyz', migrations: ['0186_something.sql'] }]
			})
		);
		expect(r.claimed.map((c) => c.number)).toEqual([186]);
		expect(r.claimed[0].holders[0].sources).toEqual(['file']);
		expect(r.claimed[0].holders[0].files).toEqual(['0186_something.sql']);
	});

	it('one branch holding a number by BOTH file and ledger is one holder, two sources', () => {
		const r = classify(
			inventory({
				landedFiles: LANDED_0001_TO_0185,
				branches: [
					{
						branch: 'claude/both-ways-xyz',
						migrations: ['0186_something.sql'],
						entries: [entry({ id: '0090', permitted: 'yes, exactly one. Claims: 0186.' })]
					}
				]
			})
		);
		expect(r.claimed[0].holders).toHaveLength(1);
		expect(r.claimed[0].holders[0].sources.sort()).toEqual(['file', 'ledger']);
		expect(r.contested).toEqual([]);
	});

	it('two branches holding one number is reported as CONTESTED', () => {
		const r = classify(
			inventory({
				landedFiles: LANDED_0001_TO_0185,
				branches: [
					{ branch: 'claude/lane-one-aaa', migrations: ['0186_one.sql'] },
					{ branch: 'claude/lane-two-bbb', migrations: ['0186_two.sql'] }
				]
			})
		);
		expect(r.contested.map((c) => c.number)).toEqual([186]);
		expect(r.contested[0].holders.map((h) => h.branch).sort()).toEqual([
			'claude/lane-one-aaa',
			'claude/lane-two-bbb'
		]);
	});

	it('a TERMINAL status releases a ledger claim; an unreadable one does not', () => {
		const held = (status: string) =>
			classify(
				inventory({
					landedFiles: LANDED_0001_TO_0185,
					branches: [
						{
							branch: 'claude/lane-aaa',
							entries: [entry({ id: '0090', status, permitted: 'yes, exactly one. Claims: 0186.' })]
						}
					]
				})
			).claimed.length;

		expect(held('issued')).toBe(1);
		expect(held('pushed')).toBe(1);
		expect(held('in-integration')).toBe(1);
		expect(held('deployed')).toBe(0);
		expect(held('withdrawn')).toBe(0);
		// A status no tool recognises must never silently RELEASE a number
		// somebody is holding. It fails toward the number staying held, which
		// is the opposite direction from the merge gate, and deliberately so:
		// there, an unreadable status costs a branch standing open; here it
		// would cost two files the same name.
		expect(held('partly landed. its migration is on main')).toBe(1);
	});

	it('holes are split into the two kinds, and only one of them is a defect', () => {
		const r = classify(
			inventory({
				landedFiles: [...LANDED_0001_TO_0185.filter((f) => !f.startsWith('0184')), '0187_later.sql'],
				branches: [{ branch: 'claude/lane-aaa', migrations: ['0186_held.sql'] }]
			})
		);
		expect(r.inFlightHoles).toEqual([186]);
		expect(r.unexplainedHoles).toEqual([184]);
	});
});

describe('contestedBranches -- what the sweep gate reads', () => {
	// THIS IS THE ONE QUESTION NO BRANCH CAN ANSWER FOR ITSELF, so the only
	// caller is `.github/workflows/integrate.yml`, which shells out to
	// `--contested-branches`. It gates whether a branch is merged and deleted,
	// so both directions matter and a false positive is as real a defect as a
	// false negative: it holds somebody's finished branch open.

	it('names both branches of a real contest', () => {
		const r = classify(
			inventory({
				landedFiles: ['0001_landed.sql'],
				branches: [
					{ branch: 'claude/lane-a', migrations: ['0002_a.sql'] },
					{ branch: 'claude/lane-b', migrations: ['0002_b.sql'] }
				]
			})
		);
		expect(contestedBranches(r)).toEqual(['claude/lane-a', 'claude/lane-b']);
	});

	it('says nothing when two branches take two numbers', () => {
		const r = classify(
			inventory({
				landedFiles: ['0001_landed.sql'],
				branches: [
					{ branch: 'claude/lane-a', migrations: ['0002_a.sql'] },
					{ branch: 'claude/lane-b', migrations: ['0003_b.sql'] }
				]
			})
		);
		expect(r.contested).toEqual([]);
		expect(contestedBranches(r)).toEqual([]);
	});

	it('THE FALSE POSITIVE IT EXISTS TO PREVENT: the working tree is not a second branch', () => {
		// `collect()` deliberately reports the WORKING TREE as a holder, because
		// the person running this by hand is usually the session holding the
		// number. On the sweep runner the working tree IS `integration`
		// mid-merge, so without the `claude/**` filter every number integration
		// carries would read as a second holder and skip the very branch that
		// wrote it. The row is still CONTESTED -- two holders is two holders --
		// and it must still name nobody.
		const shared = { file: '0090-fixture.md', text: entry({ id: '0090', permitted: 'yes. Claims: 0002.' }).text };
		const r = classify({
			refsVisible: true,
			refs: [
				{ ref: 'origin/main', branch: 'origin/main', landed: true, migrations: [], entries: [] },
				{
					ref: '(working tree)',
					branch: 'integration',
					landed: false,
					migrations: ['supabase/migrations/0002_a.sql'],
					entries: [shared]
				},
				{
					ref: 'origin/claude/lane-a',
					branch: 'claude/lane-a',
					landed: false,
					migrations: ['supabase/migrations/0002_a.sql'],
					entries: [shared]
				}
			]
		});
		expect(r.contested.map((row) => row.number), 'the row itself is still contested').toEqual([2]);
		expect(contestedBranches(r), 'a branch was held against the runner it is being merged on').toEqual([]);
	});

	it('one branch holding a number by BOTH a file and an entry is one branch, not two', () => {
		// `holders.length > 1` is what makes a row contested, and a single lane
		// that has written its migration AND its ledger claim is the ORDINARY
		// shape. Counting holders rather than distinct branches would skip every
		// such branch.
		const r = classify(
			inventory({
				branches: [
					{
						branch: 'claude/lane-a',
						migrations: ['0002_a.sql'],
						entries: [entry({ id: '0090', permitted: 'yes. Claims: 0002.' })]
					}
				]
			})
		);
		expect(contestedBranches(r)).toEqual([]);
	});

	it('is empty, never a throw, on a classification it cannot read', () => {
		// The workflow distinguishes "no contest" (empty output, exit 0) from
		// "could not answer" (non-zero) and takes the sweep in OPPOSITE
		// directions on the two. A throw in here would be read as the second,
		// which is the safe direction -- but a throw on a well-formed absence
		// would report a broken tool on every ordinary run.
		expect(contestedBranches(null)).toEqual([]);
		expect(contestedBranches(undefined)).toEqual([]);
		expect(contestedBranches({ contested: [] } as never)).toEqual([]);
		expect(contestedBranches({ contested: [{ holders: [] }] } as never)).toEqual([]);
	});
});

describe('unexplainedHoles / inFlightHoles', () => {
	// These two are what `tests/db/migration-0177-tombstone.test.ts` consumes.
	const nums = [1, 2, 3, 5, 6];

	it('a hole nothing claims is reported, by number', () => {
		expect(unexplainedHoles(nums, {})).toEqual([4]);
		expect(inFlightHoles(nums, {})).toEqual([]);
	});

	it('the same hole with a claim on a branch is not a defect, and names the branch', () => {
		const claims = { 4: ['claude/example-lane-abc123'] };
		expect(unexplainedHoles(nums, claims)).toEqual([]);
		expect(inFlightHoles(nums, claims)).toEqual([
			{ number: 4, branches: ['claude/example-lane-abc123'] }
		]);
	});

	it('a contiguous series has no holes of either kind', () => {
		expect(unexplainedHoles([1, 2, 3, 4, 5], {})).toEqual([]);
		expect(inFlightHoles([1, 2, 3, 4, 5], {})).toEqual([]);
	});

	it('claimMap turns a classification into the shape those two take', () => {
		const r = classify(
			inventory({
				landedFiles: LANDED_0001_TO_0185,
				branches: [{ branch: 'claude/lane-aaa', migrations: ['0187_held.sql'] }]
			})
		);
		expect(claimMap(r)).toEqual({ 187: ['claude/lane-aaa'] });
	});
});

describe('small readers', () => {
	it('migrationNumber reads a numbered migration and refuses anything else', () => {
		expect(migrationNumber('supabase/migrations/0186_x.sql')).toBe(186);
		expect(migrationNumber('0001_a.sql')).toBe(1);
		expect(migrationNumber('README.md')).toBeNull();
		expect(migrationNumber('186_x.sql')).toBeNull();
		expect(migrationNumber('0186_x.txt')).toBeNull();
	});

	it('normaliseStatus is the superset the ledger README describes', () => {
		expect(normaliseStatus('issued')).toBe('issued');
		expect(normaliseStatus('  Issued  ')).toBe('issued');
		expect(normaliseStatus('"issued"')).toBe('issued');
		expect(normaliseStatus('issued;')).toBe('issued');
		expect(normaliseStatus('in-integration')).toBe('in-integration');
		expect(normaliseStatus('')).toBe('');
	});

	it('parseEntry reads a value folded onto a continuation line', () => {
		const { fields } = parseEntry(
			['# 0090 A title', '- Migration permitted: yes, exactly one.', '  Claims: 0186.', '- Status: issued'].join('\n')
		);
		expect(parsePermitted(fields['Migration permitted']).numbers).toEqual([186]);
	});
});

describe('the committed corpus', () => {
	const files = readdirSync(LEDGER_DIR).filter((f) => f.endsWith('.md'));
	const lines = files
		.map((f) => ({
			file: f,
			line: readFileSync(join(LEDGER_DIR, f), 'utf8')
				.split(/\r?\n/)
				.find((l) => /^\s*[-*]\s*Migration permitted:/i.test(l))
		}))
		.filter((r): r is { file: string; line: string } => Boolean(r.line));

	it('every committed entry carries a Migration permitted line', () => {
		// NOT VACUOUS: assert the sweep found something, and that it found one
		// for every entry. A sweep that generated nothing passes silently.
		expect(files.length).toBeGreaterThan(50);
		expect(lines.length).toBe(files.length);
	});

	it('every committed line parses to a definite verdict', () => {
		const bad: string[] = [];
		for (const { file, line } of lines) {
			const p = parsePermitted(line);
			if (!p.resolution) bad.push(file);
			// A claim is a four-digit migration number, never a stray year or a
			// prompt id that happened to be in the sentence.
			for (const n of p.numbers) {
				if (!Number.isInteger(n) || n < 1 || n > 9999) bad.push(`${file}: ${n}`);
			}
		}
		expect(bad, 'entries whose Migration permitted line does not parse').toEqual([]);
	});

	it('a committed claim runs ABOVE the highest number the entry read, unless it is a tombstone', () => {
		// A lane takes a number above what was landed when it was issued, so a
		// claim BELOW that is the parser having picked the wrong number out of
		// the sentence -- the `0069` failure, put to real text rather than to a
		// fixture. The one legitimate exception is a TOMBSTONE, which exists to
		// fill a number reserved earlier and skipped: entry 0034 claims `0177`
		// having read `0178` as the highest, correctly. So the exception is
		// recognised by what the entry SAYS it is, not by a filename allowlist
		// that a second tombstone would have to be added to.
		const wrong: string[] = [];
		for (const { file, line } of lines) {
			const at = /Highest on origin\/main at issue:\s*(\d{4})/i.exec(line);
			if (!at) continue;
			const highest = Number(at[1]);
			const tombstone = /tombstone/i.test(line);
			for (const n of parsePermitted(line).numbers) {
				if (n <= highest && !tombstone) wrong.push(`${file}: claims ${n}, read ${highest} as highest`);
			}
		}
		expect(wrong, 'a claim at or below the highest number the entry says it read').toEqual([]);
	});

	it('no two entries STILL RUNNING claim the same migration number', () => {
		// THE COLLISION CHECK ITSELF, run over the corpus. It is the whole
		// subject of this bundle, and it is cheap: a number claimed twice is
		// two files that will be given one name.
		//
		// SCOPED TO `issued`, AND THE SCOPE IS A MEASUREMENT RATHER THAN A
		// CONVENIENCE. Putting every non-terminal entry through it reports two
		// real historical pairs -- 0014 and 0015 both naming `0173`, 0031 and
		// 0034 both naming `0177` -- and both were harmless, because a
		// conditional claim that the lane did not exercise costs nothing and
		// `0177` was later filled by 0034's tombstone precisely BECAUSE 0031
		// reserved it and never wrote it. Neither has been advanced past
		// `pushed`, so neither will ever leave that set. A rule that is red on
		// two closed cases from July is a rule people learn to ignore, and the
		// state that can still do damage is two sessions RUNNING NOW.
		//
		// It sees only the entries in THIS working tree, which is the limit
		// `tools/migration-claims.mjs` exists to lift: the tool reads every ref
		// and this reads one.
		const held = new Map<number, string[]>();
		for (const { file, line } of lines) {
			const text = readFileSync(join(LEDGER_DIR, file), 'utf8');
			const status = normaliseStatus(/^\s*[-*]\s*Status:\s*(.*)$/im.exec(text)?.[1] ?? '');
			if (status !== 'issued') continue;
			for (const n of parsePermitted(line).numbers) {
				held.set(n, [...(held.get(n) ?? []), file]);
			}
		}
		const contested = [...held.entries()]
			.filter(([, who]) => who.length > 1)
			.map(([n, who]) => `${n}: ${who.join(' vs ')}`);
		expect(contested, 'two running lanes claim one migration number').toEqual([]);

		// NOT VACUOUS: the same walk over two entries that DO claim one number
		// must report it, so a corpus that happens to hold none cannot pass for
		// a walk that reads nothing.
		const fixture = new Map<number, string[]>();
		for (const f of ['a.md', 'b.md']) {
			for (const n of parsePermitted('- Migration permitted: yes, exactly one. Claims: 0190.').numbers) {
				fixture.set(n, [...(fixture.get(n) ?? []), f]);
			}
		}
		expect([...fixture.entries()].filter(([, who]) => who.length > 1).map(([n]) => n)).toEqual([190]);
	});
	it('treats a codex branch as a held-number owner and mirrors the canonical prefixes', () => {
		expect(AGENT_BRANCH_PREFIXES).toEqual(['claude/', 'codex/']);
		const result = classify(inventory({
			branches: [
				{ branch: 'claude/lane-a', migrations: ['0186_a.sql'] },
				{ branch: 'codex/lane-b', migrations: ['0186_b.sql'] }
			]
		}));
		expect(contestedBranches(result)).toEqual(['claude/lane-a', 'codex/lane-b']);
		expect(result.claimed.find((row) => row.number === 186)?.holders.map((h) => h.branch)).toContain('codex/lane-b');
	});

});
