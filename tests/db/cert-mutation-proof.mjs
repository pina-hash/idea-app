// tests/db/cert-mutation-proof.mjs
//
// MUTATION PROOF for the IDEA Certification Portal's database gates (ledger
// 0391, migrations 0260 to 0264). Run with `node tests/db/cert-mutation-proof.mjs`.
//
// A gate whose wrong answer is invisible in normal use has to be shown to be
// GUARDED, not merely present: each mutant below opens one gate in the
// PERMISSIVE direction (the real leak, never a commented-out check that fails
// closed), the ONE test file that owns that gate is run against the mutant, and
// the mutant counts as killed only when that run reports a failure of its own.
//
// The three traps CLAUDE.md records for a script of this shape, each answered:
//   - the file is restored FROM THE BYTES READ INTO MEMORY (and a .bak copy in
//     a temp directory), never with git checkout, which discards uncommitted
//     work; the restore is md5-verified against the original;
//   - vitest's exit code is not read at all: stdout AND stderr are concatenated
//     (a refused apply reports on stderr alone) and the `Tests N failed` summary
//     line is parsed; a run with no summary line is an INSTRUMENT failure, never
//     a pass;
//   - a migration whose own apply-time self-check refuses the mutant is the
//     strongest kill available and gets its own verdict (`killed (apply refused)`).
//
// Exit status: 0 only when every mutant was killed and every restore verified.

import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

/** @typedef {{ name: string, gate: string, file: string, from: string, to: string, test: string, expect: 'test' | 'apply' }} Mutant */

/** @type {Mutant[]} */
const MUTANTS = [
	{
		name: 'a certifier reviews their own attempt',
		gate: 'cert_review: certifier never acts on their own attempt',
		file: '0261_cert_attempts.sql',
		from: "\tif t.email = v_me then\n\t\treturn public._cert_refuse('self', 'You cannot review your own attempt.');",
		to: "\tif false then\n\t\treturn public._cert_refuse('self', 'You cannot review your own attempt.');",
		test: 'tests/db/cert-0261-attempts.test.ts',
		expect: 'test'
	},
	{
		name: 'anon keeps execute on cert_award_commit',
		gate: 'cert_award_commit: revoked from anon by name',
		file: '0263_cert_awards.sql',
		from: 'revoke all on function public.cert_award_commit(uuid, text, text, text, jsonb) from public, anon, authenticated, service_role;',
		to: 'revoke all on function public.cert_award_commit(uuid, text, text, text, jsonb) from public, authenticated, service_role;',
		test: 'tests/db/cert-0263-awards.test.ts',
		expect: 'apply'
	},
	{
		name: 'a seat is requested inside the 7-day cooldown',
		gate: 'cert_seat_request: the cooldown after a failed exam',
		file: '0262_cert_exam.sql',
		from: "\tif v_cooldown is not null and v_cooldown > now() then\n\t\treturn public._cert_refuse('cooldown', 'You can take this exam again on '",
		to: "\tif false then\n\t\treturn public._cert_refuse('cooldown', 'You can take this exam again on '",
		test: 'tests/db/cert-0262-exam.test.ts',
		expect: 'test'
	},
	{
		name: 'the answer key rides the question a student receives',
		gate: 'cert_exam_open / cert_exam_answer: the key never leaves',
		file: '0262_cert_exam.sql',
		from: "\t\t'deadline', e.deadline\n",
		to: "\t\t'deadline', e.deadline,\n\t\t'answer', q.answer\n",
		test: 'tests/db/cert-0262-exam.test.ts',
		expect: 'test'
	}
];

const md5 = (bytes) => createHash('md5').update(bytes).digest('hex');

/** @returns {{ verdict: string, detail: string, killed: boolean }} */
function judge(output, mutant) {
	const refused = /self-check refused/.test(output);
	const summary = output.match(/Tests\s+(\d+) failed/);
	if (refused) {
		return { verdict: 'killed (apply refused)', detail: (output.match(/\d{4} self-check refused: [^\n]{0,120}/) ?? [''])[0], killed: true };
	}
	if (!summary) {
		const suites = output.match(/Test Files\s+(\d+) failed/);
		if (suites) {
			return { verdict: 'INSTRUMENT: suite failed without a self-check sentence', detail: 'read the run by hand', killed: false };
		}
		return { verdict: 'INSTRUMENT: no summary line', detail: 'vitest printed no `Tests N failed`; the run itself is suspect', killed: false };
	}
	const failed = Number(summary[1]);
	if (mutant.expect === 'apply') {
		return { verdict: failed > 0 ? 'killed (test failed, apply did not refuse)' : 'SURVIVED', detail: `${failed} failed`, killed: failed > 0 };
	}
	return { verdict: failed > 0 ? 'killed' : 'SURVIVED', detail: `${failed} failed`, killed: failed > 0 };
}

function run(file) {
	const out = spawnSync('npm', ['test', '--', file], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, CI: '1' } });
	return `${out.stdout ?? ''}\n${out.stderr ?? ''}${out.error ? `\nSPAWN ERROR: ${out.error.message}` : ''}`;
}

const backups = mkdtempSync(join(tmpdir(), 'cert-mutation-'));
const rows = [];
let allGood = true;

// Restore every file on any exit path, including an interrupt.
const originals = new Map();
const restoreAll = () => {
	for (const [path, bytes] of originals) {
		try {
			writeFileSync(path, bytes);
		} catch (error) {
			console.error(`RESTORE FAILED for ${path}: ${error.message}; the .bak is in ${backups}`);
		}
	}
};
process.on('SIGINT', () => {
	restoreAll();
	process.exit(130);
});

for (const mutant of MUTANTS) {
	const path = join(MIGRATIONS, mutant.file);
	const original = readFileSync(path);
	const originalMd5 = md5(original);
	const bak = join(backups, `${mutant.file}.bak`);
	writeFileSync(bak, original);
	originals.set(path, original);
	const text = original.toString('utf8');
	const occurrences = text.split(mutant.from).length - 1;
	let verdict;
	let detail;
	let killed = false;
	let restored = false;
	if (occurrences !== 1) {
		verdict = 'INSTRUMENT: mutation site not unique';
		detail = `${occurrences} occurrence(s) of the anchor`;
	} else {
		try {
			writeFileSync(path, text.replace(mutant.from, mutant.to));
			const started = Date.now();
			const output = run(mutant.test);
			const judged = judge(output, mutant);
			verdict = judged.verdict;
			detail = `${judged.detail} in ${((Date.now() - started) / 1000).toFixed(1)}s`;
			killed = judged.killed;
		} finally {
			writeFileSync(path, original);
		}
	}
	const after = readFileSync(path);
	restored = md5(after) === originalMd5 && md5(readFileSync(bak)) === originalMd5;
	if (!restored) {
		verdict = `${verdict}; RESTORE MISMATCH`;
	}
	originals.delete(path);
	rows.push({ mutant: mutant.name, gate: mutant.gate, file: mutant.file, test: mutant.test, verdict, detail, restored: restored ? `md5 ${originalMd5.slice(0, 8)} ok` : 'MISMATCH' });
	if (!killed || !restored) allGood = false;
}

rmSync(backups, { recursive: true, force: true });

const width = (key) => Math.max(key.length, ...rows.map((r) => String(r[key]).length));
const columns = ['mutant', 'gate', 'file', 'test', 'verdict', 'detail', 'restored'];
const line = (r) => columns.map((c) => String(r[c]).padEnd(width(c))).join(' | ');
console.log(line(Object.fromEntries(columns.map((c) => [c, c]))));
console.log(columns.map((c) => '-'.repeat(width(c))).join('-+-'));
for (const r of rows) console.log(line(r));
console.log('');
console.log(`${rows.filter((r) => r.verdict.startsWith('killed')).length} of ${rows.length} mutants killed; every file restored: ${rows.every((r) => r.restored.endsWith('ok'))}`);
process.exit(allGood ? 0 : 1);
