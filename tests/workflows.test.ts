// tests/workflows.test.ts
//
// The workflow files, checked for the things a YAML parser cannot see.
//
// WHY THIS EXISTS, AND IT IS NOT A HYPOTHETICAL. In the FRC team's repo,
// `deploy.yml` was validated with PyYAML, committed and pushed, and GitHub
// rejected the WHOLE FILE. The cause was a shell comment inside a `run:` block
// carrying an EMPTY `${{ }}` interpolation, written to ILLUSTRATE the injection
// risk the comment was warning about. GitHub evaluates expressions inside a
// `run:` body regardless of the `#` in front of them, an empty expression does
// not parse, and the file was refused whole.
//
// WHAT THAT LOOKS LIKE FROM OUTSIDE, because none of it says "invalid" in
// words: a failed run named by the file's PATH rather than by its `name:`,
// triggered by `push`, on a workflow declaring only `workflow_dispatch`, with
// no job and no log to open. The IDENTICAL sentence in that repo's
// `integrate.yml` was a YAML comment rather than shell text, never reached the
// expression parser, and was harmless -- which is exactly the distinction a
// person re-reading their own diff does not make, and exactly the distinction
// both obvious scanners get wrong. A raw-text grep flags the harmless one; a
// scan that only reads parsed YAML values reports nothing at all, because a
// YAML parser discards comments before anyone can look at them.
//
// This repo is currently in the second state and the first: it has ZERO empty
// interpolations in any `run:` body, and TWO raw `${{ }}` occurrences that are
// YAML comments sitting in an `env:` mapping (deploy.yml and integrate.yml,
// both explaining why a branch name and a typed input are read THROUGH env
// rather than interpolated). Both directions are pinned below, because a
// scanner that cannot tell those two cases apart is a scanner somebody turns
// off inside a week.
//
// WHAT THIS CAN AND CANNOT SEE. It is not GitHub's validator and must not
// pretend to be, exactly as the original states of itself. It checks the shapes
// that have actually bitten, plus the invariants THESE workflows are required
// to hold. A file that passes here can still be rejected by GitHub for
// something nobody has hit yet.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = fileURLToPath(new URL('../.github/workflows/', import.meta.url));
const FILES = readdirSync(DIR)
	.filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
	.sort();

/** CRLF normalized once, so every line and indent measurement below is on `\n`. */
const read = (f: string): string => readFileSync(join(DIR, f), 'utf8').replace(/\r\n/g, '\n');

const SOURCES = new Map(FILES.map((f) => [f, read(f)]));
const src = (f: string): string => SOURCES.get(f)!;

/**
 * Synthetic workflow text, registered under a name so every reader below sees
 * it exactly as it sees a real file. Nothing is written to disk, and `FILES` is
 * not touched, so a fixture never joins the sweeps over the real workflows.
 */
const fixtureFile = (name: string, text: string): string => {
	SOURCES.set(name, text.replace(/\r\n/g, '\n'));
	return name;
};

// ---------------------------------------------------------------------------
// THE SUBSET READER.
//
// THERE IS NO YAML PARSER IN THIS REPO AND THIS TEST MAY NOT ADD ONE. Measured
// rather than assumed: `yaml` appears in package-lock.json exactly twice, both
// times as an OPTIONAL PEER dependency of vite; it is in neither `dependencies`
// nor `devDependencies`, it is not in node_modules, and `require.resolve('yaml')`
// answers MODULE_NOT_FOUND. Installing one would rewrite a 4,649-line lockfile
// (npm reformats it to match package.json's tabs) for a fifty-line parse.
//
// So this is a PURPOSE-BUILT SUBSET READER, not a YAML parser, and it is
// written to be honest about that. It knows exactly one thing: where a `run:`
// scalar's BODY starts and stops. That is a bounded question, because a
// workflow `run:` is either
//
//   * a BLOCK SCALAR (`run: |`, `run: >`, with optional `-`/`+` chomping and an
//     explicit indent digit), whose body is the following lines indented deeper
//     than the `run` key itself; or
//   * a PLAIN SCALAR (`run: npm test`), whose body is the rest of that line AND
//     any CONTINUATION LINES indented deeper than the key.
//
// THE CONTINUATION LINES ARE NOT OPTIONAL TO READ, and this reader used to stop
// at the first line. A plain scalar wrapped across lines is ordinary YAML that
// GitHub accepts, so `run: echo one` / `  && echo "${{ }}"` put the defect this
// file exists for on the second line, where the test that EXPLAINS the danger
// never looked -- it was caught only incidentally by the raw-text backstop
// below, whose message says "YAML comment" and sends the reader to the wrong
// place. The folding rules here were measured against PyYAML rather than
// assumed: a deeper-indented line folds in with a SPACE, a blank line folds as
// a NEWLINE, and a comment line ENDS the scalar (a continuation line after one
// is a parse error, so that shape cannot reach GitHub at all).
//
// It tracks block scalars for EVERY key, not only `run:`, and collects the body
// of the `run:` ones. That is deliberate: `integrate.yml`'s job condition is an
// `if: >-` folded scalar, and a reader that only entered block mode for `run:`
// would go on reading that condition's continuation lines as mapping syntax.
//
// THE COMMENT RULE IS THE WHOLE POINT AND IT RUNS BOTH WAYS. Outside a block
// scalar a line whose first non-space character is `#` is a YAML comment and is
// skipped. INSIDE a block scalar a `#` is literal shell text and is KEPT, which
// is precisely where the defect that earned this file lived.
//
// WHAT IT DOES NOT DO, stated so nobody reads more into a green run than is
// there: it does not resolve anchors, aliases, flow mappings, multi-document
// streams or quoted keys, it reads a QUOTED scalar (`run: "npm test"`) as one
// line only rather than following its continuations, and it does not validate
// anything about the file's structure. Nothing in `.github/workflows/` uses any
// of that, and a file that started to would need this reader extended rather
// than trusted. What it DOES cover was checked against a real PyYAML parse of
// all three workflows and matched body for body (ci 6, deploy 5, integrate 2);
// `docs/history/standards-4-19-ledger-gate-vn3pva.md` records that comparison.
// Re-run it if the reader is touched: `python3 -c 'import yaml'` works in the
// cloud container, and a reader that has drifted from the real parse is a
// reader whose green run means nothing.
// ---------------------------------------------------------------------------

/** A `run:` scalar's body, with enough context to name it in a failure. */
type RunBlock = {
	file: string;
	/** 1-based line of the `run:` key itself. */
	line: number;
	/** The nearest enclosing `name:`, which for a workflow step is its label. */
	step: string;
	/** The body as GitHub would hand it to the shell: comments included. */
	body: string;
};

/** `- run: |` puts the key at column 8, not column 6. The dash is prefix, not indent. */
const KEY_LINE = /^([ ]*(?:-[ ]+)*)([A-Za-z_][A-Za-z0-9_.-]*):(?:[ ]+(.*))?$/;

/** `|`, `>`, `|-`, `>+`, `|2`, and a trailing YAML comment after any of them. */
const BLOCK_HEADER = /^([|>])[0-9]*[-+]?[ ]*(?:#.*)?$/;

const indentOf = (line: string): number => line.length - line.replace(/^[ ]+/, '').length;

/**
 * Every `run:` body in one workflow file.
 *
 * A returned body is the text GitHub evaluates, not the text a YAML value
 * lookup would give you: for a block scalar that is every line of the block
 * verbatim, `#` lines and all.
 */
function runBlocks(file: string): RunBlock[] {
	const lines = src(file).split('\n');
	const out: RunBlock[] = [];
	let step = '(unnamed)';

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line.trim() === '' || line.trim().startsWith('#')) continue;

		const m = KEY_LINE.exec(line);
		if (!m) continue;

		const keyColumn = m[1].length;
		const key = m[2];
		const value = (m[3] ?? '').trim();

		// The nearest indented `name:` labels whatever follows it. The
		// workflow's own top-level `name:` is at column 0 and is not a step.
		if (key === 'name' && keyColumn > 0) step = value.replace(/^['"]|['"]$/g, '');

		if (BLOCK_HEADER.test(value)) {
			// A block scalar's body is every following line that is blank or
			// indented DEEPER than the key. The first line at or left of the
			// key column ends it, which is also how a `run:` block ends when
			// the next step begins.
			const body: string[] = [];
			let j = i + 1;
			for (; j < lines.length; j++) {
				const b = lines[j];
				if (b.trim() !== '' && indentOf(b) <= keyColumn) break;
				body.push(b);
			}
			if (key === 'run') out.push({ file, line: i + 1, step, body: body.join('\n') });
			i = j - 1;
			continue;
		}

		if (key === 'run' && value !== '') {
			if (/^['"]/.test(value)) {
				// A quoted scalar, read as one line. See the limitations note.
				out.push({ file, line: i + 1, step, body: value.slice(1, value.lastIndexOf(value[0])) });
				continue;
			}

			// A PLAIN SCALAR CONTINUES onto every following line indented
			// deeper than the key. Reading only the first line is how a
			// `${{ }}` on a wrapped command's second line goes unseen.
			const at = i + 1; // the `run:` key's own line, before `i` moves
			const cont: string[] = [];
			let j = i + 1;
			for (; j < lines.length; j++) {
				const b = lines[j];
				if (b.trim() === '') {
					cont.push('');
					continue;
				}
				// A comment ends a plain scalar, and so does anything back at
				// or left of the key column (the next key, or the next step).
				if (indentOf(b) <= keyColumn || b.trim().startsWith('#')) break;
				cont.push(b.trim());
			}
			// Trailing blank lines belong to whatever comes next, not to this
			// scalar, exactly as YAML's own chomping treats them.
			while (cont.length > 0 && cont.at(-1) === '') cont.pop();
			i = j - 1;

			// A trailing unquoted ` #` is a YAML comment GitHub never sees, so
			// including it would manufacture the very false positive this file
			// exists to avoid. It is stripped ONLY on a single-line scalar: a
			// comment followed by a continuation line is a YAML parse error, so
			// a wrapped scalar cannot legally carry one.
			let body = cont.length === 0 ? value.replace(/[ ]+#.*$/, '') : value;
			for (const c of cont) body += c === '' ? '\n' : body.endsWith('\n') ? c : ` ${c}`;
			out.push({ file, line: at, step, body });
		}
	}

	return out;
}

/** Every `${{ ... }}` inside a `run:` body, with where it was found. */
function runInterpolations(file: string) {
	const out: { file: string; line: number; step: string; expr: string }[] = [];
	for (const block of runBlocks(file)) {
		for (const m of block.body.matchAll(/\$\{\{(.*?)\}\}/gs)) {
			out.push({ file: block.file, line: block.line, step: block.step, expr: m[1] });
		}
	}
	return out;
}

const emptyInterpolations = (file: string) =>
	runInterpolations(file).filter((x) => x.expr.trim() === '');

/**
 * Every sequence item that is a mapping, as its own key/value record.
 *
 * A STEP IS THE UNIT, NEVER A REGEX WINDOW. The gate sweep below used to find
 * its steps with `id:[\s\S]{0,120}?continue-on-error:`, which is both
 * order-dependent and distance-dependent: a gate written with
 * `continue-on-error:` ABOVE its `id:`, or with a `uses:`/`with:` block between
 * the two, is simply not collected -- and the loop that checks each gate is
 * named in the final step then examines a set the missing gate is not in, and
 * passes. That is the exact failure the sweep exists to catch, reproduced one
 * level up, and it FAILS OPEN. Collecting per step makes the order and the
 * distance irrelevant.
 *
 * An item's keys are the lines at the key column the `- ` opened; anything
 * deeper is a nested mapping or a block scalar body and is not this item's key,
 * and anything at or left of it ends the item.
 */
function listItems(file: string): { file: string; line: number; keys: Record<string, string> }[] {
	const lines = src(file).split('\n');
	const out: { file: string; line: number; keys: Record<string, string> }[] = [];
	let cur: (typeof out)[number] | null = null;
	let column = -1;

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i];
		if (raw.trim() === '' || raw.trim().startsWith('#')) continue;

		const m = KEY_LINE.exec(raw);
		if (!m) {
			// Block scalar bodies live deeper than the key column; anything at
			// or left of it is structure, and this item is over.
			if (cur && indentOf(raw) <= column) cur = null;
			continue;
		}

		const col = m[1].length;
		const key = m[2];
		const value = (m[3] ?? '').trim();

		if (m[1].includes('-')) {
			cur = { file, line: i + 1, keys: { [key]: value } };
			column = col;
			out.push(cur);
			continue;
		}
		if (!cur) continue;
		if (col === column) cur.keys[key] = value;
		else if (col < column) cur = null;
	}

	return out;
}

/** A top-level block: `on:` and everything indented under it, up to the next column-0 key. */
function topLevelBlock(file: string, key: string): string {
	const lines = src(file).split('\n');
	const start = lines.findIndex((l) => l === `${key}:` || l.startsWith(`${key}: `));
	if (start === -1) return '';
	const body: string[] = [];
	for (let i = start + 1; i < lines.length; i++) {
		if (lines[i].trim() !== '' && indentOf(lines[i]) === 0) break;
		body.push(lines[i]);
	}
	return body.join('\n');
}

/** The trigger names declared under a top-level `on:`, ignoring its comments. */
const triggersOf = (file: string): string[] =>
	topLevelBlock(file, 'on')
		.split('\n')
		.map((l) => /^[ ]{2}([A-Za-z_][A-Za-z0-9_]*):/.exec(l)?.[1])
		.filter((k): k is string => Boolean(k));

/** The workflow's own `name:`, which is what GitHub lists a run by when it parses. */
const nameOf = (file: string): string | undefined =>
	/^name:[ ]+(.+)$/m.exec(src(file))?.[1].trim().replace(/^['"]|['"]$/g, '');

/**
 * THE THREE SPELLINGS, because CLAUDE.md names three and the pattern here used
 * to catch one. "Never force-push `main`. Not `--force`, not `-f`, not
 * `--force-with-lease`." A `push[^\n]*--force(?!-with-lease="refs)` sees only
 * the long flag, and MEASURED, every one of these left the whole suite green
 * when planted into the real ci.yml:
 *
 *   git push -f origin main
 *   git push origin +main:main
 *   git push origin +refs/heads/main
 *   git push --force-with-lease="refs/heads/main:$sha" origin main
 *
 * The last one is the old carve-out being used as the hole: exempting every
 * refs-pinned lease exempts a lease pinned to `main`. `ci.yml` and `deploy.yml`
 * carry no compensating check of their own, so for two of the three files the
 * miss was total.
 *
 * A LEADING-PLUS REFSPEC IS A FORCE PUSH AND LOOKS LIKE NOTHING. `git push
 * origin +main:main` overwrites the remote branch exactly as `--force` does,
 * with no flag anywhere on the line to read.
 */
const FORCE_SPELLINGS: readonly { readonly why: string; readonly re: RegExp }[] = [
	{ why: '--force', re: /(?:^|\s)--force(?![\w-])/ },
	{ why: '--force-with-lease', re: /(?:^|\s)--force-with-lease(?![\w-])/ },
	// `-f`, alone or bundled (`-fq`). Bounded on both sides so a long flag's
	// interior and a `[ -f file ]` test cannot supply the match.
	{ why: '-f', re: /(?:^|\s)-[A-Za-z]*f[A-Za-z]*(?=[\s'"]|$)/ },
	{ why: '+refspec', re: /(?:^|\s)['"]?\+[A-Za-z0-9_][\w./*-]*(?=[:\s'"]|$)/ }
];

/** Only a `git push` counts. `gh api ... -f event=push` is not one. */
const GIT_PUSH = /\bgit\b[^\n]*?\bpush\b/;

/**
 * THE ONE LEGITIMATE FORCE IN THIS REPO, and the carve-out is written as
 * narrowly as the line allows. `integrate.yml` DELETES a merged branch with
 * `--force-with-lease="refs/heads/<branch>:<sha>"`, where the lease is what
 * makes the delete refuse if the session pushed another commit while the job
 * was running. The exemption therefore requires all three of: the only force
 * spelling on the line is the lease, the lease is PINNED to a ref AND a sha,
 * and the refspec being pushed is a DELETE (an empty source, `:refs/heads/...`).
 * A lease-pinned push that writes a branch instead of deleting one is not
 * exempt, whatever it is pinned to.
 */
const LEASE_PINNED = /--force-with-lease=(['"]?)refs\/heads\/[^\s'"]+:[^\s'"]+\1/;
const DELETE_REFSPEC = /(?:^|\s)['"]?:refs\/heads\/\S/;

/**
 * The cut points `tools/integrate-gate-proof.sh` reads out of `integrate.yml`.
 * Spelled here as the constants the harness greps for, so a rename reddens on
 * both sides of the contract rather than only in a script nobody runs.
 */
const MARKER_BEGIN = '# ledger_gate_marker:begin';
const MARKER_END = '# ledger_gate_marker:end';

/** Everything wrong with the marker pair, so a failure says which half moved. */
function markerFindings(text: string): string[] {
	const found: string[] = [];
	const count = (needle: string) => text.split(needle).length - 1;

	const begins = count(MARKER_BEGIN);
	const ends = count(MARKER_END);
	if (begins !== 1) found.push(`${MARKER_BEGIN} appears ${begins} times, expected exactly 1`);
	if (ends !== 1) found.push(`${MARKER_END} appears ${ends} times, expected exactly 1`);
	if (found.length > 0) return found;

	const from = text.indexOf(MARKER_BEGIN) + MARKER_BEGIN.length;
	const to = text.indexOf(MARKER_END);
	if (to < from) return [`${MARKER_END} comes before ${MARKER_BEGIN}, so the cut is empty`];

	const body = text.slice(from, to);
	if (body.trim() === '') found.push('the text between the markers is empty');
	// The harness sources the cut text and calls `ledger_gate`, so a cut that
	// does not DEFINE it fails there however well-formed the markers are.
	if (!/(?:^|\s)ledger_gate[ ]*\([ ]*\)[ ]*\{/m.test(body)) {
		found.push('the text between the markers does not define ledger_gate()');
	}
	return found;
}

/**
 * The gate's CALL SITE, which the proof harness explicitly does not cover: it
 * drives `ledger_gate` directly, so a gate nothing calls, or whose reason never
 * reaches the job summary, is green there and silent in production.
 */
function callSiteFindings(text: string): string[] {
	const lines = text.split('\n');
	const call = lines.findIndex((l) => l.includes('ledger_gate "$ref"'));
	if (call === -1) return ['integrate.yml never calls ledger_gate "$ref"'];
	// The reason goes into the same `skipped` array every other one does, which
	// is what puts a left-alone branch under "Left alone" in the summary.
	if (!/skipped\+=\(/.test(lines.slice(call, call + 6).join('\n'))) {
		return ['the ledger gate reason no longer feeds the skipped+=() array'];
	}
	return [];
}

type ForcePush = { line: number; text: string; why: string };

/**
 * SHELL LOGICAL LINES. A trailing backslash continues a command onto the next
 * physical line, so `git push origin \` followed by `  --force main` is ONE
 * command that a per-physical-line scan cannot see: the `git push` is on one
 * line and the force spelling is on another, and neither line matches both.
 *
 * Measured, one backslash past the four spellings below: planting exactly that
 * pair into `ci.yml`'s `Install dependencies` block left the WHOLE SUITE green
 * at 27 passed. This is the repo's single most protected invariant, so the
 * scan folds first and matches after.
 *
 * The reported line is the one the command STARTS on, which is where a reader
 * looks when the message names a line.
 */
function logicalLines(text: string): { readonly line: number; readonly text: string }[] {
	const out: { line: number; text: string }[] = [];
	const raw = text.split('\n');
	let i = 0;
	while (i < raw.length) {
		const start = i;
		let joined = raw[i];
		// A line ending in an ODD number of backslashes continues; an even
		// number is an escaped backslash and ends the command.
		while (i + 1 < raw.length && /(?:^|[^\\])(?:\\\\)*\\$/.test(joined.trimEnd())) {
			joined = `${joined.trimEnd().slice(0, -1)} ${raw[i + 1]}`;
			i += 1;
		}
		out.push({ line: start + 1, text: joined.trim() });
		i += 1;
	}
	return out;
}

function forcePushes(text: string): ForcePush[] {
	const out: ForcePush[] = [];
	logicalLines(text).forEach(({ line: lineNo, text: raw }) => {
		const line = raw.trim();
		// A whole-line comment is not a command, in YAML or in shell.
		// `deploy.yml` explains in prose why it never forces.
		if (line.startsWith('#') || !GIT_PUSH.test(line)) return;

		const why = FORCE_SPELLINGS.filter((s) => s.re.test(line)).map((s) => s.why);
		if (why.length === 0) return;
		if (
			why.length === 1 &&
			why[0] === '--force-with-lease' &&
			LEASE_PINNED.test(line) &&
			DELETE_REFSPEC.test(line)
		) {
			return;
		}
		out.push({ line: lineNo, text: line, why: why.join(', ') });
	});
	return out;
}

describe('the workflow files are shaped the way GitHub needs them to be', () => {
	it('there are workflows to check, and the three this repo runs on are among them', () => {
		// A sweep that swept nothing would make every absence assertion below
		// pass vacuously, so the denominator is asserted before anything else.
		expect(FILES.length).toBeGreaterThanOrEqual(3);
		expect(FILES).toEqual(expect.arrayContaining(['ci.yml', 'deploy.yml', 'integrate.yml']));
	});

	it.each(FILES)('%s declares a name, a trigger and a job', (f) => {
		expect(nameOf(f), `${f} has no top-level name:, so GitHub would list it by path`).toBeTruthy();
		expect(triggersOf(f).length, `${f} declares no trigger`).toBeGreaterThan(0);
		expect(src(f), `${f} declares no jobs:`).toMatch(/^jobs:$/m);
	});

	it('the subset reader actually finds run: blocks in the real files', () => {
		// THE READER'S OWN POSITIVE CONTROL. Every "no defect found" assertion
		// below is a claim about a set this function produced, so a reader that
		// quietly returned nothing would make all of them green while checking
		// nothing at all -- which is the failure mode this repo has already
		// shipped once, in a scan that read the wrong property.
		const counts = Object.fromEntries(FILES.map((f) => [f, runBlocks(f).length]));
		expect(counts['ci.yml'], 'no run: block found in ci.yml').toBeGreaterThanOrEqual(5);
		expect(counts['integrate.yml']).toBeGreaterThanOrEqual(2);
		expect(counts['deploy.yml']).toBeGreaterThanOrEqual(4);

		// And it reads the BODY, not just the header: ci.yml's final gate is a
		// multi-line block whose last line is an `exit 1` far below the key.
		const gate = runBlocks('ci.yml').at(-1)!;
		expect(gate.body).toMatch(/steps\.history-verify\.outcome/);
		expect(gate.body.split('\n').length).toBeGreaterThan(5);
	});

	it.each(FILES)('%s has no EMPTY expression interpolation in any run: block', (f) => {
		// NOT VACUOUS, PER FILE. The reader's global control below says it
		// works; this says it worked on THIS file. A `run:` key the reader
		// walked past contributes no body, and an absence assertion over a set
		// that was never populated is green forever.
		expect(
			runBlocks(f).length,
			`${f} has run: keys the reader did not collect a body for`
		).toBe((src(f).match(/^[ ]*(?:-[ ]+)?run:/gm) ?? []).length);

		const empty = emptyInterpolations(f);
		expect(
			empty.map((x) => `${x.file}:${x.line} (${x.step})`),
			`an empty \${{ }} inside a run: block makes the WHOLE file invalid to GitHub, even inside a shell comment -- GitHub evaluates the expression before the shell ever sees the #`
		).toEqual([]);
	});

	it('the raw ${{ }} occurrences in this repo are YAML comments, and the reader knows it', () => {
		// BOTH DIRECTIONS, IN ONE READING. A raw-text scan reports these as
		// defects and is WRONG; a parsed-values scan reports nothing and is
		// also wrong, because it never sees a comment at all. This asserts the
		// discrimination itself: the occurrences EXIST (so the case is real and
		// this is not vacuous), every one of them is on a comment line, and
		// none of them is inside a run: body.
		const raw: string[] = [];
		for (const f of FILES) {
			src(f)
				.split('\n')
				.forEach((line, i) => {
					if (/\$\{\{[ \t]*\}\}/.test(line)) raw.push(`${f}:${i + 1}:${line.trim()}`);
				});
		}
		expect(raw.length, 'no raw empty ${{ }} found at all, so this proves nothing').toBeGreaterThanOrEqual(2);
		for (const hit of raw) {
			const text = hit.slice(hit.indexOf(':', hit.indexOf(':') + 1) + 1);
			expect(text.startsWith('#'), `${hit} is not a YAML comment`).toBe(true);
		}
		// The other half is an absence, so it carries its own denominator: the
		// bodies those interpolations would have had to be inside were read.
		expect(
			FILES.flatMap(runBlocks).length,
			'no run: body read at all, so the absence below proves nothing'
		).toBeGreaterThanOrEqual(10);
		expect(FILES.flatMap(emptyInterpolations)).toEqual([]);
	});
});

describe('POSITIVE CONTROLS: the reader catches what it claims to', () => {
	// The real files are correct, so every green assertion above says nothing on
	// its own about whether this reader works. These drive it over synthetic
	// workflow text carrying exactly the defects it exists to find. A control
	// that does not redden when the thing it guards is broken is not a control.
	//
	// The text is written to disk nowhere: `fixtureFile` registers it in the
	// same map the real files live in, which is what `src` reads.
	const fixture = fixtureFile;

	const withRun = (name: string, body: string) =>
		fixture(
			name,
			[
				'name: X',
				'on:',
				'  push:',
				'jobs:',
				'  j:',
				'    steps:',
				'      - name: S',
				'        run: |',
				...body.split('\n').map((l) => `          ${l}`),
				''
			].join('\n')
		);

	it('an empty interpolation inside a SHELL comment IS found', () => {
		const f = withRun('control-shell-comment.yml', 'set -e\n# a comment mentioning ${{ }} in passing\necho hi');
		const empty = emptyInterpolations(f);
		expect(empty).toHaveLength(1);
		expect(empty[0].step).toBe('S');
	});

	it('the exact sentence that broke the FRC deploy.yml IS found', () => {
		const f = withRun(
			'control-frc-sentence.yml',
			'# a typed input is text a person controls, and `${{ }}` pastes it into\n# the shell before bash ever sees a quote.\necho ok'
		);
		expect(emptyInterpolations(f)).toHaveLength(1);
	});

	it('the SAME sentence as a YAML comment above the run: block is NOT found', () => {
		// This is the half a raw-text grep gets wrong, and it is the shape both
		// of this repo's real occurrences take: the comment sits in the step's
		// env: mapping, one key above the run:.
		const f = fixture(
			'control-yaml-comment.yml',
			[
				'name: X',
				'on:',
				'  push:',
				'jobs:',
				'  j:',
				'    steps:',
				'      - name: S',
				'        env:',
				'          # read through env, never interpolated: `${{ }}` pastes the',
				'          # value into the shell before bash sees a quote.',
				'          BRANCH: ${{ github.event.workflow_run.head_branch }}',
				'        run: |',
				'          echo "$BRANCH"',
				''
			].join('\n')
		);
		expect(emptyInterpolations(f)).toEqual([]);
		// and the raw text DOES carry it, which is what makes the line above a
		// discrimination rather than an absence.
		expect(src(f)).toMatch(/\$\{\{[ ]*\}\}/);
		// The run: body was still read, so this is not passing by reading nothing.
		expect(runBlocks(f).map((b) => b.body.trim())).toEqual(['echo "$BRANCH"']);
	});

	it('a legitimate interpolation is read but NOT flagged', () => {
		const f = withRun('control-real-expr.yml', 'echo "${{ github.sha }}"');
		expect(runInterpolations(f)).toHaveLength(1);
		expect(emptyInterpolations(f)).toEqual([]);
	});

	it('a shell parameter expansion is not mistaken for an interpolation', () => {
		// `${VAR:-default}` and `${SHA:0:7}` are shell, not GitHub, and both are
		// in this repo's real summary steps. A scanner that saw them would fire
		// on every push and get switched off, which costs the empty-${{ }} check
		// as well.
		const f = withRun('control-shell-expansion.yml', 'echo "${MERGED:-no}" "${SOURCE_SHA:0:7}"');
		// NOT VACUOUS, and it used to be. `toEqual([])` on its own is green
		// whether the reader correctly ignored `${MERGED:-no}` or simply never
		// read the body: breaking the fixture so no run: body is readable
		// reddened three sibling controls and left THIS ONE PASSING. The guard
		// is the body itself, so an empty read cannot answer for a clean scan.
		expect(runBlocks(f).map((b) => b.body.trim())).toEqual([
			'echo "${MERGED:-no}" "${SOURCE_SHA:0:7}"'
		]);
		expect(runInterpolations(f)).toEqual([]);
	});

	it('a plain run: scalar wrapped onto a second line is read whole', () => {
		// THE READER USED TO STOP AT THE FIRST LINE, so a `${{ }}` on the
		// continuation was invisible to the check that explains the danger and
		// showed up only in the raw-text backstop, whose message names YAML
		// comments and sends the reader somewhere else entirely.
		const f = fixture(
			'control-plain-continuation.yml',
			[
				'name: X',
				'on:',
				'  push:',
				'jobs:',
				'  j:',
				'    steps:',
				'      - name: S',
				'        run: echo one',
				'          && echo "${{ }}"',
				'        id: after',
				''
			].join('\n')
		);
		expect(runBlocks(f).map((b) => b.body)).toEqual(['echo one && echo "${{ }}"']);
		expect(emptyInterpolations(f)).toHaveLength(1);
		// And the scalar STOPS at the next key, or the step after it would be
		// read as shell text.
		expect(runBlocks(f)[0].body).not.toContain('id: after');
	});

	it('the real files DO contain those shell expansions, so that control is not academic', () => {
		const bodies = FILES.flatMap(runBlocks)
			.map((b) => b.body)
			.join('\n');
		expect(bodies).toMatch(/\$\{[A-Za-z_][A-Za-z0-9_]*:[-0-9]/);
	});

	it('an inline run: keeps its command and drops its trailing YAML comment', () => {
		const f = fixture(
			'control-inline.yml',
			['name: X', 'on:', '  push:', 'jobs:', '  j:', '    steps:', '      - run: npm test # not shell text', ''].join('\n')
		);
		expect(runBlocks(f).map((b) => b.body)).toEqual(['npm test']);
	});

	it('a run: block ends where the next step begins', () => {
		// The body must not swallow the following mapping keys, or a `${{ }}` in
		// the NEXT step's `with:` would be reported as shell text.
		const f = fixture(
			'control-block-end.yml',
			[
				'name: X',
				'on:',
				'  push:',
				'jobs:',
				'  j:',
				'    steps:',
				'      - name: A',
				'        run: |',
				'          echo one',
				'      - name: B',
				'        uses: actions/checkout@v4',
				'        with:',
				'          ref: ${{ }}',
				''
			].join('\n')
		);
		expect(runBlocks(f).map((b) => b.body.trim())).toEqual(['echo one']);
		expect(emptyInterpolations(f)).toEqual([]);
	});
});

describe('the invariants these particular workflows have to hold', () => {
	it('integrate.yml can never write to the deploy branch', () => {
		const s = src('integrate.yml');
		// Both halves: the target IS `integration`, and the refusal that fails
		// the job if a future edit ever repoints it is still in the script.
		// Every push to main deploys ideabosco.com while students are on it, so
		// the refusal is the mechanism and the constant is only the current
		// value.
		expect(s).toMatch(/TARGET=integration/);
		expect(s).toMatch(/refusing to run: this workflow may never write to the deploy branch/);
		expect(s).not.toMatch(/git push origin main/);
		expect(s, 'integrate.yml names main in a git push').not.toMatch(/git push[^\n]*\bmain\b/);
	});

	it('integrate.yml keys on a CI workflow that exists, by BOTH of its names', () => {
		// The FRC repo shipped this keyed on a filename that did not exist. It
		// fails closed there (every branch reads "CI: unknown" and nothing is
		// merged), which is the safe direction and also the silent one: an
		// integration queue that has simply stopped moving looks like a quiet
		// week.
		const s = src('integrate.yml');

		const file = /CI_WORKFLOW_FILE:[ ]+(\S+)/.exec(s)?.[1];
		expect(file, 'integrate.yml names no CI_WORKFLOW_FILE').toBeTruthy();
		expect(FILES, `CI_WORKFLOW_FILE is ${file}, which is not in .github/workflows/`).toContain(file!);

		// The `workflow_run` trigger keys on a workflow's `name:`, not its
		// filename, so the two are independent spellings of one dependency and
		// either can drift alone.
		const listed = /workflow_run:[\s\S]*?workflows:[ ]*\[([^\]]*)\]/
			.exec(s)?.[1]
			.split(',')
			.map((w) => w.trim().replace(/^['"]|['"]$/g, ''))
			.filter(Boolean);
		expect(listed, 'integrate.yml has no workflow_run workflows: list').toBeTruthy();
		expect(listed).toContain(nameOf(file!));
	});

	it('deploy.yml is workflow_dispatch ONLY and requires its typed confirmation', () => {
		// Dispatch-only is the judgement `integrate.yml`'s header exists to
		// preserve: migrations here are applied BY HAND, CI cannot see
		// production's catalog, and a scheduled merge would ship an RPC call to
		// a function the database does not have yet.
		expect(triggersOf('deploy.yml')).toEqual(['workflow_dispatch']);

		const s = src('deploy.yml');
		expect(s, 'deploy.yml has no required confirm input').toMatch(
			/confirm:[\s\S]{0,300}?required:[ ]+true/
		);

		// AND THE TWO SPELLINGS OF THE PHRASE AGREE. The input's `description:`
		// is what the person reads and types; `EXPECTED` in the guard script is
		// what the job compares against. Drift between them is a deploy button
		// that refuses everyone who does exactly what the form asked.
		const asked = /description:[ ]*'Type exactly:[ ]*(.+?)'/.exec(s)?.[1];
		const expected = /EXPECTED='([^']+)'/.exec(s)?.[1];
		expect(asked, 'deploy.yml does not tell the person what to type').toBeTruthy();
		expect(expected, 'deploy.yml compares against no expected phrase').toBeTruthy();
		expect(asked).toBe(expected);
	});

	it('no workflow force-pushes, in any of the three spellings', () => {
		for (const f of FILES) {
			const hits = forcePushes(src(f));
			expect(
				hits.map((h) => `${f}:${h.line} [${h.why}] ${h.text}`),
				`${f} force-pushes. Every push to main deploys ideabosco.com during class, and the repo holds the only archive of exported material revisions.`
			).toEqual([]);
		}
		// NOT VACUOUS, AND THE DENOMINATOR IS PER FILE. An aggregate count
		// hides which file was actually read: `ci.yml` has no `git push` at
		// all today, so its iteration above checks nothing, and an aggregate
		// guard is satisfied entirely by the other two. Reporting the shape
		// per file means the day `ci.yml` gains a push, the sweep says so.
		//
		// IT USES THE SWEEP'S OWN PREDICATE, not a tighter one, because the
		// question is what the SWEEP read rather than how many pushes exist.
		// That is why `integrate.yml` counts 3 and not 2: its third is the
		// prose inside the conflict-summary `echo`, which reads
		// "`git fetch origin && ... && git merge ...`, push". `forcePushes`
		// looks at that line and finds no force spelling, which is correct;
		// a denominator that quietly excluded it would stop measuring the
		// thing above it.
		const pushLinesPerFile = Object.fromEntries(
			FILES.map((f) => [
				f,
				logicalLines(src(f)).filter((l) => !l.text.startsWith('#') && GIT_PUSH.test(l.text)).length
			])
		);
		expect(
			pushLinesPerFile,
			'the per-file push shape moved; a file that gained or lost a push line needs a look'
		).toEqual({ 'ci.yml': 0, 'deploy.yml': 1, 'integrate.yml': 3 });
	});

	it('POSITIVE CONTROL: every spelling of a force-push is caught, and the lease-pinned delete is not', () => {
		// All four spellings that were MEASURED to leave the old pattern green,
		// plus the long form it did catch. Each is checked on its own so a
		// failure names which spelling regressed.
		const caught = [
			'          git push origin --force main',
			'          git push -f origin main',
			'          git push origin +main:main',
			'          git push origin +refs/heads/main',
			'          git push --force-with-lease="refs/heads/main:$sha" origin main'
		];
		for (const line of caught) {
			expect(forcePushes(line).length, `not caught: ${line.trim()}`).toBe(1);
		}

		// The ONE legitimate use in this repo, verbatim from integrate.yml's
		// branch delete. The lease pins the sha this run merged, so a session
		// that pushed another commit mid-run keeps its branch.
		const lease = 'if ! git push origin --force-with-lease="refs/heads/$b:$s" ":refs/heads/$b"; then';
		expect(forcePushes(lease)).toEqual([]);
		// and that line really is in the file, so the exemption is not academic.
		expect(src('integrate.yml')).toContain('--force-with-lease="refs/heads/$b:$s"');

		// The shapes a false positive would come from, and a false positive is
		// how a check gets switched off: an ordinary push, a fetch refspec that
		// really does lead with `+`, a `gh api` call carrying `-f event=push`,
		// and a shell test using `-f`.
		expect(forcePushes('          if ! git push origin HEAD:refs/heads/main; then')).toEqual([]);
		expect(forcePushes("          git fetch --prune origin '+refs/heads/*:refs/remotes/origin/*'")).toEqual([]);
		expect(forcePushes('            -f branch="$branch" -f event=push -f status=completed \\')).toEqual([]);
		expect(forcePushes('          if [ -f package-lock.json ]; then npm ci; fi')).toEqual([]);
	});

	it('the ledger gate is still cuttable at the markers its proof harness reads', () => {
		// THE MARKERS ARE A CONTRACT BETWEEN TWO FILES AND NOTHING KNEW IT.
		// `tools/integrate-gate-proof.sh` proves the gate by CUTTING the text
		// between `# ledger_gate_marker:begin` and `# ledger_gate_marker:end`
		// out of integrate.yml and running those exact characters, so the proof
		// cannot drift into testing its own copy of the rule. Rename a marker,
		// move the body out from between them, or drop the call site, and the
		// harness stops proving the gate -- and nobody finds out until somebody
		// runs it by hand, because it is not an npm script and CI never calls
		// it. This asserts the cut points, not the gate's wording, which is
		// somebody else's to edit.
		const s = src('integrate.yml');
		expect(markerFindings(s), 'integrate.yml no longer cuts at the ledger gate markers').toEqual(
			[]
		);

		// THE CALL SITE IS THE HALF THE HARNESS CANNOT PROVE. It drives the
		// function directly, so a gate that is never called, or whose reason
		// never reaches the summary, is green there.
		expect(callSiteFindings(s), 'the ledger gate call site moved').toEqual([]);

		// And the harness is where the workflow says it is, still reading both
		// marker names. A proof script that stopped naming them cut nothing.
		const proof = readFileSync(
			fileURLToPath(new URL('../tools/integrate-gate-proof.sh', import.meta.url)),
			'utf8'
		);
		expect(proof).toContain(MARKER_BEGIN.replace('# ', ''));
		expect(proof).toContain(MARKER_END.replace('# ', ''));
	});

	it('POSITIVE CONTROL: a renamed, reordered or emptied marker pair is caught', () => {
		const s = src('integrate.yml');
		// Renamed: exactly the silent break this assertion exists for.
		expect(markerFindings(s.replace(MARKER_BEGIN, '# ledger_gate_start'))).not.toEqual([]);
		expect(markerFindings(s.replace(MARKER_END, '# ledger_gate_finish'))).not.toEqual([]);
		// Duplicated, which makes the cut ambiguous rather than empty.
		expect(markerFindings(`${s}\n${MARKER_BEGIN}\n`)).not.toEqual([]);
		// Reversed, which cuts nothing at all.
		expect(
			markerFindings(
				s.replace(MARKER_BEGIN, '# TMP').replace(MARKER_END, MARKER_BEGIN).replace('# TMP', MARKER_END)
			)
		).not.toEqual([]);
		// Present, in order, but with the function moved out from between them.
		expect(
			markerFindings(
				`${MARKER_BEGIN}\n          echo nothing to see here\n${MARKER_END}\n`
			)
		).not.toEqual([]);

		// And the call site, whose two halves fail in different places: a gate
		// nothing calls, and a gate whose reason never reaches the summary.
		expect(callSiteFindings(s.replace('ledger_gate "$ref"', 'ledger_gate_v2 "$ref"'))).not.toEqual(
			[]
		);
		expect(callSiteFindings(s.replace(/skipped\+=\(/g, 'ignored+=('))).not.toEqual([]);
	});

	it('ci.yml fails the job when any continue-on-error gate failed', () => {
		// Every gate runs with `continue-on-error: true` so one push reports all
		// of them, which means the job's own conclusion comes ENTIRELY from the
		// final step reading each `outcome`. A gate added without being named
		// there is green forever, and nothing on screen says so -- the step
		// runs, it reports its failure, and the job passes.
		const gates = listItems('ci.yml').filter((s) => s.keys['continue-on-error'] === 'true');
		expect(gates.length, 'no continue-on-error gates found in ci.yml').toBeGreaterThanOrEqual(4);

		const final = runBlocks('ci.yml').at(-1)!.body;
		for (const gate of gates) {
			// A gate with no id has no `outcome` to read AT ALL, which is the
			// same silence one step earlier.
			expect(
				gate.keys.id,
				`ci.yml:${gate.line} is continue-on-error with no id:, so its failure can never be read`
			).toBeTruthy();
			expect(
				final,
				`ci.yml's final step never inspects steps.${gate.keys.id}.outcome`
			).toContain(`steps.${gate.keys.id}.outcome`);
		}
	});

	it('POSITIVE CONTROL: a gate is collected whatever order and distance its keys sit at', () => {
		// The two shapes the old proximity regex dropped, which is what made it
		// fail OPEN: `continue-on-error:` before `id:`, and the two separated by
		// a uses:/with: block wider than the 120-character window.
		const before = fixtureFile(
			'control-gate-order.yml',
			[
				'name: X',
				'on:',
				'  push:',
				'jobs:',
				'  j:',
				'    steps:',
				'      - name: S',
				'        continue-on-error: true',
				'        id: reversed',
				'        run: npm test',
				''
			].join('\n')
		);
		expect(
			listItems(before)
				.filter((s) => s.keys['continue-on-error'] === 'true')
				.map((s) => s.keys.id)
		).toEqual(['reversed']);

		const far = fixtureFile(
			'control-gate-distance.yml',
			[
				'name: X',
				'on:',
				'  push:',
				'jobs:',
				'  j:',
				'    steps:',
				'      - name: A step whose id and gate flag sit far apart',
				'        id: distant',
				'        uses: actions/some-very-long-action-name-here@v4',
				'        with:',
				'          one: a value long enough to push the two keys past any window',
				'          two: another value doing the same job as the one above it',
				'        continue-on-error: true',
				''
			].join('\n')
		);
		expect(
			listItems(far)
				.filter((s) => s.keys['continue-on-error'] === 'true')
				.map((s) => s.keys.id)
		).toEqual(['distant']);

		// And a nested `with:` key is NOT read as the step's own, or a step
		// could inherit a flag from something it merely configures.
		expect(listItems(far)[0].keys.one).toBeUndefined();
	});
});
