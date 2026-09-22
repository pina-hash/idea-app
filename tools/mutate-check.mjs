/**
 * A MUTATION PROOF THAT CANNOT REPORT A FALSE CLEAN READING.
 *
 * Three traps CLAUDE.md names, all three of which have produced a clean-looking
 * run over code that was never tested, and all three are answered here:
 *
 *  1. RESTORE FROM A BYTE COPY, NEVER FROM GIT. `git checkout -- <file>` is a
 *     discard-to-HEAD, not a scoped undo: run against an uncommitted tree it
 *     takes the session's own work with the mutation, after which every
 *     remaining mutant applies to a pristine file and "passes". The tell is a
 *     mutation suite that suddenly all passes. Every file is read into memory
 *     first and written back from that string; the md5 is compared afterwards.
 *
 *  2. NEVER JUDGE BY VITEST'S EXIT CODE. Measured on this tree: a clean
 *     assertion failure in the `node` project left `vitest run <file>` exiting
 *     0. The SUMMARY LINE is parsed instead, and a run whose summary cannot be
 *     found at all is an INSTRUMENT FAILURE, never a pass.
 *
 *  3. READ BOTH STREAMS. A mutation that makes a migration refuse to apply
 *     puts the entire failure report on stderr while vitest still exits 0, so
 *     a reader taking only stdout gets `no summary line` for a genuine kill.
 *     `spawnSync` hands back both and they are concatenated on every path.
 *
 * Usage: node tools/mutate-check.mjs <spec.json>
 *   [{ label, file, find, replace, tests: [..] }, ...]
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const md5 = (s) => createHash('md5').update(s).digest('hex');
const mutants = JSON.parse(readFileSync(process.argv[2], 'utf8'));

function runTests(tests) {
	const r = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...tests], {
		cwd: '/home/user/idea-app',
		encoding: 'utf8',
		timeout: 900_000,
		env: { ...process.env, CI: '1', FORCE_COLOR: '0' }
	});
	const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
	const failed = out.match(/Tests\s+(\d+)\s+failed/);
	const passedOnly = out.match(/Tests\s+(\d+)\s+passed/);
	const suiteFailed = /Failed Suites|failed to apply|Unhandled Error/.test(out);
	if (failed) return { verdict: 'KILLED', detail: `${failed[1]} test(s) failed` };
	if (suiteFailed) return { verdict: 'KILLED', detail: 'suite failed to run (apply refusal or import error)' };
	if (passedOnly) return { verdict: 'SURVIVED', detail: `${passedOnly[1]} passed, none failed` };
	return { verdict: 'INSTRUMENT FAILURE', detail: 'no summary line in either stream' };
}

// The CONTROL: the clean tree must be green, or every verdict below is noise.
console.log('--- control (clean tree) ---');
const allTests = [...new Set(mutants.flatMap((m) => m.tests))];
const control = runTests(allTests);
console.log(`control: ${control.verdict} (${control.detail})`);
if (control.verdict !== 'SURVIVED') {
	console.log('THE CONTROL IS NOT GREEN. Every verdict below would be meaningless. Stopping.');
	process.exit(1);
}

for (const m of mutants) {
	const original = readFileSync(m.file, 'utf8');
	const before = md5(original);
	const count = original.split(m.find).length - 1;
	if (count !== 1) {
		console.log(`\n${m.label}\n  NOT APPLIED: the target text appears ${count} times, needs exactly 1.`);
		continue;
	}
	writeFileSync(m.file, original.replace(m.find, m.replace));
	let res;
	try {
		res = runTests(m.tests);
	} finally {
		writeFileSync(m.file, original);
		const after = md5(readFileSync(m.file, 'utf8'));
		if (after !== before) throw new Error(`RESTORE FAILED for ${m.file}: ${before} -> ${after}`);
	}
	console.log(`\n${m.label}\n  ${res.verdict}: ${res.detail}\n  (restored byte-identical, md5 ${before})`);
}
