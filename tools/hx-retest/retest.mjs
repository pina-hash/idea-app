#!/usr/bin/env node
/**
 * EVERY COMMITTED ASSIGNMENT SOURCE, REBUILT ON THE KIT IN THIS TREE AND PUT
 * THROUGH THE KIT'S OWN TEST (ledger 0458, report 23b3776c).
 *
 *   node tools/hx-retest/retest.mjs [--out <dir>] [--summary <file>] [<source> ...]
 *
 * For each `assignment-sources/**\/*.src.html` (or the sources named), it runs
 * `tools/hx-kit/build.mjs` into a scratch directory and then
 * `tools/hx-kit/test.mjs` on the built page, and reads the test's own last line
 * ("N FAIL, N WARN, N PASS.") and its FAIL lines. It writes one markdown table
 * (page, FAIL, WARN, the failing checks) to `--summary` (the job summary in
 * CI) and to stdout. On 2026-10-27 a one-line kit change moved a live page
 * 14px and only a manual rerun caught it; this runs on every push that touches
 * the kit or a source.
 *
 * IT REPORTS, IT DOES NOT GATE. A source failing the kit's test is authoring
 * work for its course chat, and a red job on a kit change nobody can fix in
 * that push would only teach people to ignore it, so it exits 0 unless a
 * source could not be built or tested at all (exit 1), which is the run itself
 * being broken. `--strict` exits 1 on any FAIL too.
 *
 * It lives outside `tools/hx-kit/` on purpose: the kit belongs to the HTML
 * standards chat, and this only calls its two tools as an author would.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = (name) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : null;
};
const OUT = resolve(flag('--out') ?? join(REPO, '.hx-retest'));
const SUMMARY = flag('--summary');
const STRICT = args.includes('--strict');
const named = args.filter((a, i) => !a.startsWith('--') && !['--out', '--summary'].includes(args[i - 1]));

export function sourcesUnder(dir) {
	const out = [];
	let entries = [];
	try {
		entries = readdirSync(dir);
	} catch {
		return out;
	}
	for (const e of entries) {
		const p = join(dir, e);
		if (statSync(p).isDirectory()) out.push(...sourcesUnder(p));
		else if (e.endsWith('.src.html')) out.push(p);
	}
	return out.sort();
}

/** The test's own verdict line and its FAIL lines, read off its output. */
export function readVerdict(text) {
	const m = /(\d+) FAIL, (\d+) WARN, (\d+) PASS\./.exec(text);
	const fails = text
		.split('\n')
		.filter((l) => l.startsWith('FAIL '))
		.map((l) => l.replace(/^FAIL\s+/, '').replace(/\s{2,}::.*$/, '').replace(/\s+/g, ' ').trim());
	return m ? { fail: Number(m[1]), warn: Number(m[2]), pass: Number(m[3]), fails } : null;
}

/** One markdown table, the job summary's. A `|` in a check's words is escaped. */
export function summaryTable(rows) {
	const cell = (s) => String(s).replace(/\|/g, '\\|');
	const lines = ['| Page | FAIL | WARN | Failing checks |', '| --- | ---: | ---: | --- |'];
	for (const r of rows) {
		lines.push(`| ${cell(r.page)} | ${r.error ? 'not run' : r.fail} | ${r.error ? '' : r.warn} | ${cell(r.error ?? ([...new Set(r.fails)].join('; ') || 'none'))} |`);
	}
	return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const sources = named.length ? named.map((n) => resolve(n)) : sourcesUnder(join(REPO, 'assignment-sources'));
	mkdirSync(OUT, { recursive: true });
	const rows = [];
	for (const src of sources) {
		const page = relative(REPO, src);
		const dir = join(OUT, basename(src, '.src.html'));
		mkdirSync(dir, { recursive: true });
		const built = join(dir, basename(src).replace(/\.src\.html$/, '.html'));
		try {
			execFileSync(process.execPath, [join(REPO, 'tools/hx-kit/build.mjs'), src, '-o', built], { encoding: 'utf8', stdio: 'pipe' });
		} catch (e) {
			rows.push({ page, error: `build failed: ${String(e.stderr || e.message).trim().split('\n').pop()}` });
			continue;
		}
		const run = spawnSync(process.execPath, [join(REPO, 'tools/hx-kit/test.mjs'), built], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
		const verdict = readVerdict(`${run.stdout ?? ''}\n${run.stderr ?? ''}`);
		rows.push(verdict ? { page, ...verdict } : { page, error: `test did not finish: ${String(run.stderr || '').trim().split('\n').filter(Boolean).pop() ?? 'no output'}` });
	}
	const table = `### Kit retest: ${rows.length} committed sources\n\n${summaryTable(rows)}\n`;
	console.log(table);
	if (SUMMARY) appendFileSync(SUMMARY, `${table}\n`);
	writeFileSync(join(OUT, 'results.json'), `${JSON.stringify(rows, null, 2)}\n`);
	const broken = rows.filter((r) => r.error).length;
	const failing = rows.filter((r) => !r.error && r.fail > 0).length;
	console.log(`${rows.length} sources, ${failing} with a FAIL, ${broken} not run.`);
	process.exit(broken || (STRICT && failing) ? 1 : 0);
}
