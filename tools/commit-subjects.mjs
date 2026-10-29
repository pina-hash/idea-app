#!/usr/bin/env node
/**
 * THE FIRST LINE OF EVERY PUSHED COMMIT, CHECKED (ledger 0458, report fb08d358).
 *
 *   node tools/commit-subjects.mjs <from>..<to>
 *   node tools/commit-subjects.mjs --subject "One line to check"
 *
 * Lists each non-merge commit in the range whose first line breaks the rule in
 * `src/lib/commit-subject.ts` (over 100 characters, or clauses joined with
 * " - "), and exits 1 when any does. Commits the site and its workflows write
 * on their own (the classroom export, recorded migrations, regenerated
 * connector tools) are not a person's copy and are skipped. A first line that
 * already landed is split on the update list either way.
 */
import { execFileSync } from 'node:child_process';
import { subjectProblems } from '../src/lib/commit-subject.ts';

const MACHINE = [/^classroom: /, /^Record migration \d{4} applied/i, /^Connector tools regenerated/i];

const args = process.argv.slice(2);
let subjects;
if (args[0] === '--subject') subjects = [{ sha: 'given', subject: args.slice(1).join(' ') }];
else {
	const range = args[0];
	if (!range) {
		console.error('usage: node tools/commit-subjects.mjs <from>..<to> | --subject "<line>"');
		process.exit(2);
	}
	const raw = execFileSync('git', ['log', '--no-merges', '--format=%h%x09%s', range], { encoding: 'utf8' });
	subjects = raw.split('\n').filter(Boolean).map((l) => ({ sha: l.slice(0, l.indexOf('\t')), subject: l.slice(l.indexOf('\t') + 1) }));
}
let bad = 0;
for (const { sha, subject } of subjects) {
	if (MACHINE.some((m) => m.test(subject))) continue;
	const problems = subjectProblems(subject);
	if (!problems.length) continue;
	bad += 1;
	console.log(`${sha}  "${subject}"\n    ${problems.join('\n    ')}`);
}
console.log(bad ? `${bad} commit first line(s) to fix next time.` : `${subjects.length} first line(s) checked, all fine.`);
process.exit(bad ? 1 : 0);
