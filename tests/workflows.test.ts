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
import {
	buildSql,
	exitFor,
	EXIT,
	redact,
	toCatalogOnly,
	verdicts
} from '../tools/deploy-probe.mjs';

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

/** Only a `git push` counts. `gh api ... -f status=completed` is not one. */
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
 * EVERY CUTTABLE GATE IN THE FILE, AND THIS USED TO BE ONE HARDCODED PAIR.
 * `integrate.yml` now carries three functions written to be cut out of it and
 * run against throwaway repositories -- `ledger_gate`, `contained_delete_gate`
 * and, since the deadlock fix, `target_push_gate`. The pin below was spelled
 * for `ledger_gate` alone, so the two later ones could have their markers
 * renamed with the whole suite green.
 *
 * Generalised rather than duplicated, per this repo's no-second-copy rule: one
 * predicate over a table, so a FOURTH gate is a row here and not a fourth
 * near-identical block. The count is pinned below so a gate that quietly LOSES
 * its markers cannot shrink the table instead of failing.
 *
 * `harness` names the in-repo script that actually performs the cut, or null
 * where there is not one yet. Two of the three have no harness committed:
 * `integrate.yml`'s own comments say so at each site, and the pin records the
 * gap rather than papering over it -- a null here is a claim that nothing in
 * the repo cuts these markers, which is itself worth reddening if it changes.
 */
const CUTTABLE_GATES = [
	{ fn: 'ledger_gate', marker: 'ledger_gate_marker', harness: 'tools/integrate-gate-proof.sh' },
	{ fn: 'contained_delete_gate', marker: 'contained_delete_marker', harness: null },
	{ fn: 'target_push_gate', marker: 'target_push_marker', harness: null },
	{ fn: 'auto_resolve', marker: 'auto_resolve_marker', harness: 'tools/integrate-gate-proof.sh' },
	{ fn: 'ci_conclusion', marker: 'ci_gate_marker', harness: 'tools/integrate-gate-proof.sh' }
] as const;

/**
 * THE CI GATE'S OWN TEXT, CUT THE WAY THE PROOF HARNESS CUTS IT.
 *
 * `tools/integrate-gate-proof.sh` takes the characters between
 * `# ci_gate_marker:begin` and `# ci_gate_marker:end` out of `integrate.yml`,
 * sources them and calls the function. Asserting a property against THAT text
 * rather than against the whole file is what stops a guard being satisfied by
 * a comment -- see the test that drives the mutation.
 *
 * The marker name comes from `CUTTABLE_GATES` rather than being retyped, so a
 * rename moves both the harness assertion and this one together.
 */
function cutRegion(text: string, marker: string): string {
	const begin = `# ${marker}:begin`;
	const end = `# ${marker}:end`;
	const from = text.indexOf(begin);
	const to = text.indexOf(end);
	if (from < 0 || to < from) return '';
	return text.slice(from + begin.length, to);
}

const CI_GATE_MARKER = CUTTABLE_GATES.find((g) => g.fn === 'ci_conclusion')!.marker;

/** The cut region as it stands, comments and all. */
const ciGateRaw = (): string => cutRegion(src('integrate.yml'), CI_GATE_MARKER);

/**
 * Shell comments removed, so a property can only be satisfied by code.
 *
 * WHOLE-LINE COMMENTS ONLY, deliberately. A `#` inside the jq program is a
 * character in a string as far as bash is concerned, and stripping from the
 * first `#` on any line would eat the program. Every comment in this region is
 * its own line, which is the shape the strip is written for; a trailing
 * comment appearing later would survive it, and that is the safe direction --
 * it can only make an assertion harder to satisfy, never easier.
 */
function stripShellComments(text: string): string {
	return text
		.split('\n')
		.filter((l) => !/^\s*#/.test(l))
		.join('\n');
}

/** The function's actual code, which is what every property is asserted against. */
const ciGateBody = (): string => stripShellComments(ciGateRaw());

/**
 * Everything wrong with one gate's marker pair, so a failure says which half
 * moved AND which gate it was.
 */
function markerFindings(text: string, gate: { fn: string; marker: string }): string[] {
	const begin = `# ${gate.marker}:begin`;
	const end = `# ${gate.marker}:end`;
	const found: string[] = [];
	const count = (needle: string) => text.split(needle).length - 1;

	const begins = count(begin);
	const ends = count(end);
	if (begins !== 1) found.push(`${begin} appears ${begins} times, expected exactly 1`);
	if (ends !== 1) found.push(`${end} appears ${ends} times, expected exactly 1`);
	if (found.length > 0) return found;

	const from = text.indexOf(begin) + begin.length;
	const to = text.indexOf(end);
	if (to < from) return [`${end} comes before ${begin}, so the cut is empty`];

	const body = text.slice(from, to);
	if (body.trim() === '') found.push(`the text between the ${gate.marker} markers is empty`);
	// The harness sources the cut text and calls the function, so a cut that
	// does not DEFINE it fails there however well-formed the markers are.
	if (!new RegExp(`(?:^|\\s)${gate.fn}[ ]*\\([ ]*\\)[ ]*\\{`, 'm').test(body)) {
		found.push(`the text between the ${gate.marker} markers does not define ${gate.fn}()`);
	}
	return found;
}

/**
 * THE PUSH CONDITION, PINNED BY WHAT IT ASKS RATHER THAN BY ITS CHARACTERS.
 *
 * The deadlock this replaced: the step merged `origin/main` into the target and
 * then pushed only `if [ ${#merged[@]} -gt 0 ]`, so a run where every
 * outstanding branch conflicted computed the main-merge and threw it away.
 * `deploy.yml` refuses while `main` is not an ancestor of `integration` and
 * tells the operator to press Integrate first, which is why the pair could not
 * terminate. Executed against throwaway repositories on 2026-09-04: under the
 * old condition that case ends with `caught_up=yes`, nothing pushed and `main`
 * still not an ancestor.
 *
 * The regression is one edit away and looks like a tidy-up -- a `merged` array
 * is right there beside the push -- so it is asserted rather than trusted. Two
 * findings, and they fail in different places on purpose: the push must be
 * decided by the cuttable gate, and the gate must be handed the tip the REMOTE
 * already has rather than anything this run computed.
 */
function pushConditionFindings(text: string): string[] {
	const found: string[] = [];
	const lines = text.split('\n');
	const at = lines.findIndex((l) => /^\s*if target_push_gate\b/.test(l));
	if (at === -1) {
		return ['the push to the target is no longer decided by target_push_gate'];
	}
	// The two arguments, in order: the remote's tip and HEAD as it stands now.
	if (!/target_push_gate\s+"\$\{remote_tip:-\}"\s+"\$\(git rev-parse HEAD\)"/.test(lines[at])) {
		found.push('target_push_gate is no longer asked about remote_tip against HEAD');
	}
	// And the push itself is inside that branch, not beside it.
	if (!/git push origin "HEAD:refs\/heads\/\$TARGET"/.test(lines.slice(at, at + 12).join('\n'))) {
		found.push('the target push is no longer inside the target_push_gate branch');
	}
	// The condition this replaced must not come back on the target push. It is
	// still legitimate in the SUMMARY, where "did any branch merge" is exactly
	// the question, so this looks only at the push branch.
	if (/if \[ \$\{#merged\[@\]\} -gt 0 \]; then\n\s*(#[^\n]*\n\s*)*if git push origin "HEAD/.test(text)) {
		found.push('the target push is gated on `merged` again -- this is the deadlock');
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

	it('deploy.yml is scheduled AND dispatchable, and the typed phrase still agrees with itself', () => {
		// IT WAS DISPATCH-ONLY, AND WHAT MADE IT SO IS GONE. The judgement
		// `integrate.yml`'s header exists to preserve is that migrations here
		// are applied BY HAND and CI could not see production's catalog. A
		// workflow can see it now (`tools/deploy-probe.mjs`), so the schedule
		// is what decision 0010 said would unblock it. Both triggers, sorted,
		// and nothing else -- a `push:` here would deploy on every commit.
		expect([...triggersOf('deploy.yml')].sort()).toEqual(['schedule', 'workflow_dispatch']);

		const s = src('deploy.yml');

		// THE CONFIRMATION IS NO LONGER REQUIRED, and that is the point rather
		// than a relaxation: an empty field means "let the probe answer", which
		// is the ordinary path, and a scheduled run has nobody to type it. It
		// is still what carries a run the probe cannot speak for.
		expect(s, 'the confirm input is required again, which a schedule cannot satisfy').toMatch(
			/confirm:[\s\S]{0,400}?required:[ ]+false/
		);

		// AND THE TWO SPELLINGS OF THE PHRASE AGREE. The input's `description:`
		// is what the person reads and types; `EXPECTED` in the guard script is
		// what the job compares against. Drift between them is a deploy button
		// that refuses everyone who does exactly what the form asked.
		const asked = /description:[ ]*'[^']*?Type exactly:[ ]*(.+?)'/.exec(s)?.[1];
		const expected = /EXPECTED='([^']+)'/.exec(s)?.[1];
		expect(asked, 'deploy.yml does not tell the person what to type').toBeTruthy();
		expect(expected, 'deploy.yml compares against no expected phrase').toBeTruthy();
		expect(asked).toBe(expected);
	});

	it('the deploy runs on THREE gates, and each is a separate needs', () => {
		// ALL THREE OR IT DOES NOT RUN: `main` contained in `integration` and
		// something to deploy (guard), production's applied set (migrations),
		// and CI green on that exact sha (checks). Each is a JOB, so a failure
		// or a skip in any of them takes the deploy with it -- which is the
		// mechanism, not the `if` below.
		// SCOPED TO THE `jobs:` BLOCK. Read off the whole file, `schedule:` and
		// `workflow_dispatch:` under `on:` sit at the same indent and arrive as
		// two extra "jobs".
		const s = topLevelBlock('deploy.yml', 'jobs');
		// SPLIT ON THE JOB KEYS RATHER THAN WITH A LOOKAHEAD. `\\Z` is not a
		// JavaScript escape -- it is the letter Z -- so a "to the next job or
		// the end" regex silently cannot match the LAST job in the file, which
		// here is the one that deploys.
		const jobLines = s.split('\n');
		const jobs = new Map<string, string>();
		let current: string | null = null;
		for (const l of jobLines) {
			const m = /^  ([a-z][a-z_-]*):$/.exec(l);
			if (m) {
				current = m[1];
				jobs.set(current, '');
				continue;
			}
			if (current) jobs.set(current, `${jobs.get(current)}${l}\n`);
		}
		const job = (name: string) => {
			expect(jobs.has(name), `deploy.yml has no ${name} job`).toBe(true);
			return jobs.get(name) as string;
		};
		const jobNames = [...jobs.keys()];
		expect(jobNames.sort()).toEqual(['checks', 'deploy', 'guard', 'migrations']);

		expect(job('deploy')).toMatch(/needs:[ ]*\[guard, migrations, checks\]/);
		expect(job('checks')).toMatch(/needs:[ ]*\[guard, migrations\]/);

		// AND THE ONE OUTCOME THAT IS A STOP RATHER THAN A FAILURE HAS TO BE
		// READ. A scheduled run the probe cannot speak for exits 0, because a
		// red mark every night is a red mark nobody reads -- so `migrations`
		// succeeding is NOT on its own permission to deploy, and both
		// downstream jobs ask its flag.
		expect(job('checks')).toContain("needs.migrations.outputs.go == 'yes'");
		expect(job('deploy')).toContain("needs.migrations.outputs.go == 'yes'");
		expect(job('migrations')).toMatch(/go:[ ]*\$\{\{[ ]*steps\.probe\.outputs\.go[ ]*\}\}/);
	});

	it('a NOT-APPLIED migration is refused whatever was typed and whatever the trigger', () => {
		// THE ONE THING NO PERSON MAY OVERRIDE. Probe status 2 is a
		// machine-read fact about production: the code about to go live calls
		// something the database does not have. The typed confirmation carries
		// statuses 1 and 3, where the machine is SILENT; it must never appear
		// in the branch that handles 2.
		// BY THE THING ONLY THE PROBE STEP HAS. `deploy-probe.mjs` also appears
		// in the guard's own prose, and matching on the name picked that block
		// instead -- which then had no case arm and read as a missing one.
		const step = runBlocks('deploy.yml').find((b) => b.body.includes('case "$PROBE"'));
		expect(step, 'no deploy.yml step runs the probe').toBeTruthy();
		const body = step!.body;

		// The `2)` arm, from its label to the `;;` that closes it.
		const arm = /\n\s+2\)\n([\s\S]*?)\n\s+;;/.exec(body)?.[1];
		expect(arm, 'deploy.yml has no case arm for probe status 2').toBeTruthy();
		expect(arm, 'the NOT-APPLIED arm reads the typed confirmation').not.toMatch(/CONFIRMED/);
		expect(arm, 'the NOT-APPLIED arm lets the deploy proceed').not.toMatch(/go=yes/);
		expect(arm, 'the NOT-APPLIED arm does not fail the job').toMatch(/exit 1/);

		// AND IT HANDS BACK THE SQL. Applying a migration needs a write
		// credential no workflow may hold, so the whole of what is left for a
		// person is paste and run -- which means the summary has to carry the
		// file, not just its number.
		expect(arm).toMatch(/```sql/);
		expect(arm).toMatch(/git show "\$SHA:\$p"/);
	});

	it('the probe is never read as "applied" when it could not run', () => {
		// FAIL CLOSED. `go=yes` is written by exactly two arms: the one where
		// every migration in range came back applied, and the one where a
		// person typed the confirmation. Any third is a run that deployed on an
		// unknown, and the flag defaults to `no` before the branches so a path
		// that writes nothing cannot read as permission.
		const step = runBlocks('deploy.yml').find((b) => b.body.includes('case "$PROBE"'));
		expect(step, 'no deploy.yml step runs the probe').toBeTruthy();
		const gos = (step!.body.match(/go=yes/g) ?? []).length;
		expect(gos, 'deploy.yml writes go=yes somewhere new').toBe(2);
		expect(step!.body, 'the default flag is not written before the branches').toMatch(
			/echo "go=no" >> "\$GITHUB_OUTPUT"[\s\S]*case "\$PROBE"/
		);

		// THE SECRET IS PASSED AS AN ENV VAR AND IS NEVER INTERPOLATED INTO THE
		// SCRIPT BODY. `${{ }}` pastes a value into the shell before bash sees
		// a quote, and this one is a connection string with a password in it.
		expect(step!.body, 'the connection string is interpolated into the script').not.toMatch(
			/\$\{\{[^}]*DEPLOY_PROBE_URL/
		);
		expect(src('deploy.yml')).toMatch(
			/DEPLOY_PROBE_URL:[ ]*\$\{\{[ ]*secrets\.DEPLOY_PROBE_URL[ ]*\}\}/
		);
	});

	it('every probe shape the derivation can emit reads pg_catalog, never information_schema', () => {
		// THE TRAP THAT DECIDES THE PROBE. `information_schema` is
		// PRIVILEGE-FILTERED: a view there shows a row only when the querying
		// role holds some privilege on the table, and the role this ships with
		// holds nothing but CONNECT. Measured on a throwaway Postgres 16 with
		// exactly that role: `select count(*) from information_schema.columns
		// where table_schema = 'public'` returns **0**, the three column probes
		// answer **false** for columns that exist, and the `pg_attribute` form
		// answers **true** for the same three. So a deploy built on
		// `information_schema` refuses forever, and nothing on screen says why.
		//
		// This is asserted against `tools/idea-status.py`'s OWN TEMPLATE rather
		// than against a fixture somebody typed, and it is read from the source
		// rather than run, because CI checks out shallow and that tool reads
		// `origin/main`.
		const status = readFileSync(
			fileURLToPath(new URL('../tools/idea-status.py', import.meta.url)),
			'utf8'
		);

		// EVERY EMITTED SQL FRAGMENT NAMING IT. A fragment is an f-string; the
		// two prose mentions in that file's comments are not.
		const emitted = status
			.split('\n')
			.filter((l) => /f"[^"]*information_schema/.test(l))
			.map((l) => l.trim());
		expect(emitted.length, 'tools/idea-status.py emits a NEW information_schema probe').toBe(1);

		// Materialise the template with the literals its own `sql_lit` would
		// produce, so what goes through the translator is the string the tool
		// actually sends.
		const template =
			'exists (select 1 from information_schema.columns where table_schema = ' +
			"'public' and table_name = 'app_feedback' and column_name = 'tried')";
		expect(
			emitted[0].replace(/\{sql_lit\((ts|tn|col)\)\}/g, '@'),
			'the emitted template no longer has the shape toCatalogOnly knows'
		).toContain('information_schema.columns where table_schema = @');

		const t = toCatalogOnly(template);
		expect(t.ok).toBe(true);
		expect(t.ok && t.changed, 'the column probe was not translated').toBe(true);
		expect(t.ok && t.sql).toContain('pg_catalog.pg_attribute');
		expect(t.ok && t.sql).not.toMatch(/information_schema/);

		// AND AN UNRECOGNISED SHAPE IS REFUSED, NOT REWRITTEN. A probe whose
		// answer depends on a grant nobody made is worse than no probe, and a
		// regex that rewrote it anyway would be guessing.
		expect(
			toCatalogOnly("exists (select 1 from information_schema.tables where table_name = 'x')").ok,
			'an information_schema shape nobody taught it was rewritten anyway'
		).toBe(false);

		// A pg_catalog probe passes through untouched, which is what makes
		// `changed` meaningful above.
		const same = toCatalogOnly("exists (select 1 from pg_proc where proname = 'x')");
		expect(same.ok && same.changed).toBe(false);
	});

	it('the probe writes nothing, and the query it sends is what says so', () => {
		// EVERY STATEMENT IS A SELECT, and the transaction is read only on top
		// of a role that holds nothing but CONNECT. Built through the module's
		// own `buildSql`, so this is the query that reaches the database.
		const sql = buildSql([
			{
				num: '0170',
				file: '0170_a.sql',
				kind: 'object',
				object: 'column public.app_feedback.tried',
				sql: "exists (select 1 from pg_catalog.pg_class where relname = 'app_feedback')",
				translated: true,
				refused: null
			},
			{
				num: '0177',
				file: '0177_b.sql',
				kind: 'none',
				object: 'no probe',
				sql: null,
				translated: false,
				refused: null
			}
		]);
		expect(sql.split('\n')[0]).toBe('set transaction read only;');
		expect(sql).not.toMatch(/\b(insert|update|delete|drop|alter|grant|revoke|truncate|create)\b/i);
		// A migration with NO probe contributes no row, so it can never come
		// back `true` by accident -- `verdicts` reports it as unknown instead.
		expect((sql.match(/select \d+ as i/g) ?? []).length).toBe(1);
	});

	it('the probe never reports an unknown as applied', () => {
		// THE FOUR EXITS ARE THE CONTRACT deploy.yml reads, and this is the
		// only place they are asserted end to end without a database. A probe
		// with no SQL, and a probe whose row never came back, are both
		// `unknown` -- never `applied` -- and either one blocks.
		const base = { file: 'x.sql', kind: 'object', translated: false, refused: null } as const;
		const probes = [
			{ ...base, num: '0001', object: 'function a', sql: 'exists (select 1)' },
			{ ...base, num: '0002', object: 'function b', sql: 'exists (select 1)' },
			{ ...base, num: '0003', object: 'no probe', sql: null }
		];
		// Row 1 answered, row 0 did NOT come back at all.
		const findings = verdicts(probes, new Map([[1, true]]));
		expect(findings.map((f) => f.state)).toEqual(['unknown', 'applied', 'unknown']);
		expect(exitFor(findings)).toBe(EXIT.cannotConfirm);

		expect(exitFor(verdicts(probes.slice(0, 2), new Map([[0, true], [1, false]])))).toBe(
			EXIT.notApplied
		);
		expect(exitFor(verdicts(probes.slice(0, 2), new Map([[0, true], [1, true]])))).toBe(
			EXIT.allApplied
		);
		// NOT-APPLIED OUTRANKS UNKNOWN, so a run carrying both is reported as
		// the thing a person has to act on rather than as the thing they have
		// to assert.
		expect(exitFor(verdicts(probes, new Map([[0, false], [1, true]])))).toBe(EXIT.notApplied);
	});

	it('nothing the probe prints can carry the connection string', () => {
		// libpq puts the connection string into its own error text, and this
		// tool prints that text into a job summary a screenshot can reach.
		const url = 'postgresql://deploy_probe:s3cr3t-pw@db.example.supabase.co:5432/postgres';
		const out = redact(`connection to ${url} failed; password was s3cr3t-pw`, url);
		expect(out).not.toContain(url);
		expect(out).not.toContain('s3cr3t-pw');
		expect(out).toContain('<connection string>');
		expect(out).toContain('<redacted>');
	});

	it('the mechanical resolver can only ever touch two files, both named in the workflow', () => {
		// THE ALLOWLIST IS THE WHOLE BOUNDARY. `auto_resolve` commits a merge
		// git itself refused, so what stops it resolving somebody's writing is
		// that it asks about EVERY unmerged path against two literals before it
		// touches one of them. A third literal here is a decision, not an edit.
		const gate = /# auto_resolve_marker:begin\n([\s\S]*?)# auto_resolve_marker:end/.exec(
			src('integrate.yml')
		)?.[1];
		expect(gate, 'integrate.yml no longer carries the resolver between its markers').toBeTruthy();

		const allowed = [...gate!.matchAll(/^\s*local (readme|updates)='([^']+)'$/gm)].map((m) => m[2]);
		expect(allowed.sort()).toEqual(['classroom-updates.json', 'tools/browser-verify/README.md']);

		// AND THE ALLOWLIST IS ASKED BEFORE ANYTHING IS TOUCHED. Asked per file
		// as each is resolved, one path outside it would be found only after
		// another had already been written.
		const check = gate!.indexOf('*) return 1 ;;');
		const firstResolve = gate!.indexOf('_counts_resolve "$path"');
		expect(check, 'the resolver has no reject-everything-else arm').toBeGreaterThan(-1);
		expect(check, 'a file is resolved before the allowlist is asked about all of them').toBeLessThan(
			firstResolve
		);

		// THE COUNTS FIX IS CONFINED TO THE GENERATED REGION BY A COMPARISON,
		// not by a marker parser. Both halves have to be there: a prose
		// conflict above the block and a prose conflict below it are two
		// different edits and only one of them is caught by either `cmp`.
		expect(gate).toContain('cmp -s "$d/pre-a" "$d/pre-b" || return 1');
		expect(gate).toContain('cmp -s "$d/post-a" "$d/post-b" || return 1');

		// AND IT REGENERATES RATHER THAN PICKING A NUMBER. The merged tree's
		// answer is neither side's, and it costs a tree read.
		expect(gate).toContain('node tools/browser-verify/readme-counts.mjs --static');

		// NOTHING LEAVES CARRYING A MARKER. `=======` is deliberately not one
		// of the three: it is also a markdown setext underline and this runs
		// over a markdown file.
		expect(gate).toMatch(/grep -qE '\^\(<<<<<<< \|/);
		expect(gate, 'the resolver checks for a bare ======= and would refuse a heading').not.toMatch(
			/\^=======/
		);
	});

	it('the resolver never takes a whole side of a file', () => {
		// THE ONE THING IT MAY NOT DO. `git checkout --ours`/`--theirs`, and
		// `git merge -X ours`/`-X theirs`, resolve by DISCARDING one side; the
		// resolver takes the target's side only within a conflicting hunk, and
		// only inside the generated markers, with everything git merged cleanly
		// left merged. Swept over the whole file, because a second copy
		// elsewhere in the step would be just as fatal.
		const s = src('integrate.yml');
		expect(s, 'integrate.yml resolves by taking a whole side').not.toMatch(
			/git checkout\s+--(ours|theirs)\b/
		);
		expect(s, 'integrate.yml merges with a side-picking strategy option').not.toMatch(
			/-X\s*(ours|theirs)\b/
		);
		expect(s).not.toMatch(/--strategy-option[= ](ours|theirs)\b/);
		expect(s, 'integrate.yml resolves a conflict with a union merge').not.toMatch(
			/merge-file[^\n]*--union/
		);

		// POSITIVE CONTROL: each of those spellings is caught when planted, so
		// "no hits" is a result rather than a regex that matches nothing.
		for (const planted of [
			'git checkout --ours -- path',
			'git checkout  --theirs -- path',
			'git merge -X ours branch',
			'git merge --strategy-option=theirs branch',
			'git merge-file -p --union a b c'
		]) {
			const withIt = `${s}\n          ${planted}\n`;
			const caught =
				/git checkout\s+--(ours|theirs)\b/.test(withIt) ||
				/-X\s*(ours|theirs)\b/.test(withIt) ||
				/--strategy-option[= ](ours|theirs)\b/.test(withIt) ||
				/merge-file[^\n]*--union/.test(withIt);
			expect(caught, `the sweep does not catch: ${planted}`).toBe(true);
		}
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
		// really does lead with `+`, a `gh api` call carrying `-f` parameters,
		// and a shell test using `-f`.
		//
		// THE `gh api` FIXTURE IS THE LINE THAT IS ACTUALLY IN THE FILE, and it
		// is worth keeping true: it used to read `-f event=push`, which the CI
		// trigger fix removed, so the fixture was covering a shape nothing
		// produces any more while the real line went uncovered.
		expect(forcePushes('          if ! git push origin HEAD:refs/heads/main; then')).toEqual([]);
		expect(forcePushes("          git fetch --prune origin '+refs/heads/*:refs/remotes/origin/*'")).toEqual([]);
		const ghApiLine = '                      -f branch="$branch" -f status=completed -f per_page=50 \\';
		expect(forcePushes(ghApiLine)).toEqual([]);
		expect(src('integrate.yml'), 'the gh api fixture is no longer a line in the file').toContain(
			ghApiLine.trim().replace(/ \\$/, '')
		);
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

		// ALL THREE CUTTABLE GATES, reported by name so a failure says which
		// one moved. This was `ledger_gate` alone until the deadlock fix; the
		// other two could have been renamed with the suite green.
		expect(
			Object.fromEntries(CUTTABLE_GATES.map((g) => [g.fn, markerFindings(s, g)])),
			'integrate.yml no longer cuts at one of its gate markers'
		).toEqual(Object.fromEntries(CUTTABLE_GATES.map((g) => [g.fn, []])));

		// NOT VACUOUS: a gate that lost its markers entirely would otherwise
		// leave a shorter table that still matches itself.
		expect(CUTTABLE_GATES.length, 'a cuttable gate was added or removed').toBe(5);

		// THE CALL SITE IS THE HALF THE HARNESS CANNOT PROVE. It drives the
		// function directly, so a gate that is never called, or whose reason
		// never reaches the summary, is green there.
		expect(callSiteFindings(s), 'the ledger gate call site moved').toEqual([]);

		// Same argument for the push gate, whose call site is the whole of the
		// deadlock fix: a `target_push_gate` nothing asks, or asks about the
		// wrong two shas, is green in any harness that drives it directly.
		expect(pushConditionFindings(s), 'the target push condition moved').toEqual([]);

		// And the harness is where the workflow says it is, still reading both
		// marker names. A proof script that stopped naming them cut nothing.
		// ONLY `ledger_gate` HAS ONE IN THE REPO; the other two rows carry
		// `harness: null`, which integrate.yml's own comments say out loud at
		// each site. Asserting that emptiness is what makes a harness ARRIVING
		// for one of them visible here rather than silent.
		for (const g of CUTTABLE_GATES) {
			if (g.harness === null) continue;
			const proof = readFileSync(
				fileURLToPath(new URL(`../${g.harness}`, import.meta.url)),
				'utf8'
			);
			expect(proof, `${g.harness} no longer names the ${g.marker} cut points`).toContain(
				`${g.marker}:begin`
			);
			expect(proof).toContain(`${g.marker}:end`);
		}
		expect(
			CUTTABLE_GATES.filter((g) => g.harness === null).map((g) => g.fn),
			'a gate gained or lost its in-repo proof harness'
		).toEqual(['contained_delete_gate', 'target_push_gate']);
	});

	it('the per-branch CI query asks for a run on the SHA, not for a run from a TRIGGER', () => {
		// THE 2026-09-04 DEADLOCK, AS A STANDING ASSERTION. The query passed
		// `-f event=push`, so it asked GitHub only for CI runs a PUSH had
		// started. Three finished branches had been re-run green by
		// `workflow_dispatch`; the query returned nothing for their shas; all
		// three read as `unknown`; the sweep skipped every one; nothing merged,
		// so the push was discarded, so the deploy stayed blocked. A person
		// merged all three by pull request instead.
		//
		// `tools/integrate-gate-proof.sh` proves the DECISION -- it cuts
		// `ci_conclusion` out of the workflow and drives it on fixture payloads,
		// green-per-trigger, red, older sha, no run, and both re-run
		// directions. What it cannot see is the `gh api` call, because that
		// needs a token and a network. So the parameters the query sends are
		// asserted here, off the file, and the two halves together cover the
		// whole path.
		const s = src('integrate.yml');
		// The query's own lines: the `gh api` call and its backslash
		// continuations. COMMENTS ARE EXCLUDED, and that exclusion is the whole
		// reason this is a line filter rather than a grep over the file -- the
		// comments above `ci_conclusion` spell `event=push` twice while
		// explaining why it is gone, and a check that could not tell an
		// explanation from a parameter would have to forbid the explanation.
		const isQueryLine = (l: string) =>
			!/^\s*#/.test(l) && (/gh api/.test(l) || /-f (branch|status|per_page|event)=/.test(l));
		const ghApi = s
			.split('\n')
			.map((l, i) => [i + 1, l] as const)
			.filter(([, l]) => isQueryLine(l));
		expect(ghApi.length, 'integrate.yml no longer makes the per-branch CI query').toBeGreaterThan(0);

		// NO TRIGGER FILTER, on any line of the query. Asserted against the
		// PARAMETER LINES rather than the whole file, because the comments
		// above `ci_conclusion` legitimately spell `event=push` while
		// explaining why it is gone -- a file-wide grep would either forbid the
		// explanation or pass on the bug.
		expect(
			ghApi.filter(([, l]) => /-f\s*event=/.test(l)).map(([n, l]) => `${n}: ${l.trim()}`),
			'the per-branch CI query filters on a TRIGGER again, which is the deadlock'
		).toEqual([]);

		// POSITIVE CONTROL: the predicate finds one when there is one. Without
		// this the assertion above passes just as happily on a file that has no
		// query in it at all.
		const withFilter = s.replace('-f branch="$branch"', '-f branch="$branch" -f event=push');
		expect(
			withFilter.split('\n').filter(isQueryLine).filter((l) => /-f\s*event=/.test(l)).length,
			'the trigger-filter check cannot see a trigger filter that is really there'
		).toBeGreaterThan(0);
		// SECOND CONTROL, the other direction: the comments as they stand must
		// NOT be what makes the check green or red. On the real file the filter
		// keeps the query lines and drops the prose, so the prose can say
		// `event=push` as often as it needs to.
		expect(
			s.split('\n').filter((l) => /-f\s*event=/.test(l)).length,
			'the file no longer explains why the trigger filter was removed'
		).toBeGreaterThan(0);

		// AND THE SHA MATCH IS THE HALF THAT MUST NOT WEAKEN. Widening which
		// TRIGGERS count must never widen which COMMIT counts: a green run
		// against a different commit says nothing about this one. The verdict
		// is proved in the harness (case 39); that the selection is written at
		// all is asserted here.
		expect(s, 'ci_conclusion no longer pins the run to the branch tip').toContain(
			'select(.head_sha == $sha)'
		);
		// The fork guard that replaced what `event=push` was quietly providing:
		// a fork's run reaches our Actions as a `pull_request` run, which the
		// trigger filter excluded as a side effect.
		expect(s, 'ci_conclusion no longer refuses a run from a fork').toContain(
			'select(.head_repository.full_name == $repo)'
		);
		// Newest wins, which matters more with every trigger admitted: one sha
		// can now carry a red push run and the green re-run that fixed it.
		expect(s, 'ci_conclusion no longer takes the NEWEST run for the sha').toContain(
			'sort_by(.run_number) | last'
		);
	});

	it('the CI query is guarded where it LIVES, not merely where the string appears', () => {
		// THE HOLE THIS CLOSES, MEASURED RATHER THAN IMAGINED. Prompt 0037 left
		// this test asymmetric: its NEGATIVE assertion (no `-f event=`) excludes
		// comment lines, because the prose above `ci_conclusion` legitimately
		// spells `event=push` while explaining why it went. Its three POSITIVE
		// assertions did not get the same narrowing -- they were plain
		// `toContain` over the whole file. So the sha match could be DELETED
		// FROM THE FUNCTION and the suite stayed green as long as the string
		// survived anywhere, including in a comment saying it used to be there.
		// Driven, before this was written: the jq line removed and
		// `# historical note: this used to say select(.head_sha == $sha)` added
		// in its place, and `npm test` reported 37 passed.
		//
		// A guard that a tidy-up can satisfy by writing prose is not a guard.
		// Every property below is asserted against the CUT REGION with its
		// comments stripped -- the same characters `tools/integrate-gate-proof.sh`
		// sources and runs -- so the only way to satisfy it is to mean it.
		const body = ciGateBody();

		// Each property, with what it is FOR, because a bare string in a list
		// is the thing that gets deleted by somebody who cannot see the cost.
		const REQUIRED: readonly { readonly needle: string; readonly why: string }[] = [
			{
				needle: 'select(.head_sha == $sha)',
				why: 'THE SECURITY PROPERTY: a green run against a different commit authorises nothing, so a branch that was green two commits ago is not green'
			},
			{
				needle: 'select(.head_repository.full_name == $repo)',
				why: "THE FORK GUARD: a fork's run reaches our Actions as a `pull_request` run, which the retired `event=push` filter was excluding as a side effect"
			},
			{
				needle: 'sort_by(.run_number) | last',
				why: 'NEWEST WINS: one sha can carry a red push run and the green hand re-run that fixed it, and it can carry them the other way round too'
			},
			{
				needle: '.workflow_runs // []',
				why: 'FAILS CLOSED on a payload with no runs key -- a 404 or rate-limit body -- instead of aborting the whole step under pipefail'
			},
			{
				needle: "|| printf 'unknown\\n'",
				why: 'FAILS CLOSED when jq refuses the input at all, rather than answering success on no evidence'
			}
		];

		expect(
			REQUIRED.filter((r) => !body.includes(r.needle)).map((r) => `${r.needle} -- ${r.why}`),
			'a load-bearing property left ci_conclusion'
		).toEqual([]);

		// NOT VACUOUS IN EITHER DIRECTION.
		//
		// One: the cut has to have found the function. An empty or missing
		// region makes every `includes` above false, which would fail loudly --
		// but a region that cut the WRONG text could satisfy them by accident,
		// so the shape is checked too.
		expect(body, 'the ci_gate cut did not find the function').toContain('ci_conclusion()');
		expect(body.length, 'the ci_gate cut came back suspiciously short').toBeGreaterThan(200);

		// Two: THE COMMENT STRIP IS THE WHOLE POINT, so prove it strips -- and
		// prove it SYNTHETICALLY rather than by naming a phrase that happens to
		// be in the region's prose today. The first draft of this asserted that
		// `event=push` was in the raw region and gone from the body, and it was
		// WRONG: that phrase lives in the long comment ABOVE the marker, not
		// inside the cut. A strip proof anchored to somebody's wording is a
		// proof that breaks when they reword it, for a reason that has nothing
		// to do with the property.
		const marked = `${ciGateRaw()}\n            # a comment carrying not-real-code\n`;
		expect(marked.includes('not-real-code'), 'the fixture did not take').toBe(true);
		expect(
			stripShellComments(marked).includes('not-real-code'),
			'stripShellComments is not removing whole-line comments'
		).toBe(false);
		// And it must NOT eat code while doing it: everything the region really
		// declares has to survive the strip.
		expect(stripShellComments(marked), 'the strip ate the function').toContain('ci_conclusion()');

		// Three, and this is the control that matters: each property, deleted
		// from the FUNCTION and pasted into a COMMENT, must still be reported.
		// That is precisely the mutation the old assertion passed.
		//
		// THE FIXTURE IS BUILT FROM THE CODE SIDE, and the first draft was not:
		// it removed the needle from the RAW region, which for two of these
		// deletes the copy sitting in the region's own prose and leaves the
		// code untouched. The control caught that, which is what a control is
		// for -- but a control that only ever fails on its own fixture proves
		// nothing about the guard. So: start from the code, delete the
		// property there, then hand it back as a comment.
		for (const { needle } of REQUIRED) {
			const code = ciGateBody();
			expect(code.includes(needle), `${needle} is not in the code to begin with`).toBe(true);
			const smuggled = `${code.replace(needle, '')}\n            # historical note: this used to say ${needle}\n`;
			expect(
				smuggled.includes(needle),
				`${needle}: the fixture did not smuggle it into a comment`
			).toBe(true);
			expect(
				stripShellComments(smuggled).includes(needle),
				`${needle} can still be satisfied by a comment`
			).toBe(false);
		}
	});

	it('the properties the CI query relies on are still PROVED, and the harness is not run by CI', () => {
		// `tools/integrate-gate-proof.sh` is referenced by no workflow, no npm
		// script and not by `tools/run-tests.mjs` -- swept, not assumed, below.
		// It runs only when a person types it. So its 51 cases prove nothing on
		// any automated run, and a case deleted from it is invisible until
		// somebody happens to look. This file DOES run in CI, so the existence
		// of the cases is asserted from here.
		//
		// It asserts the cases EXIST, never their verdicts -- those are the
		// harness's to make against real fixtures, and restating one here would
		// be a second copy of the rule.
		const proof = readFileSync(
			fileURLToPath(new URL('../tools/integrate-gate-proof.sh', import.meta.url)),
			'utf8'
		);

		// One case per property, named by the sentence the harness prints.
		const CASES: readonly string[] = [
			'newest run on the tip is a green push',
			'newest run on the tip is a green workflow_dispatch',
			'newest run on the tip is a green schedule',
			'newest run on the tip is red, from any trigger',
			'a green run exists, but on an OLDER sha',
			'no run at all on the tip',
			'a red push then a green workflow_dispatch re-run, same tip',
			'a green push then a red workflow_dispatch re-run, same tip',
			"a green run on our tip from a FORK's repository",
			'a payload carrying no workflow_runs key at all',
			'a payload that is not JSON'
		];
		expect(
			CASES.filter((c) => !proof.includes(c)),
			'a case proving the CI query is gone from the proof harness'
		).toEqual([]);

		// THE COUNT IS PINNED because a deleted case that nobody replaces
		// leaves a shorter list matching itself. The harness asserts its own
		// total too; this asserts the CI half of it specifically.
		expect(
			(proof.match(/^check_ci /gm) ?? []).length,
			'a CI case was added to or removed from the proof harness without moving this number'
		).toBe(12);

		// AND THE CLAIM THAT IT IS HAND-RUN ONLY IS SWEPT, not asserted from
		// memory: the day somebody wires it into CI, this reddens and the
		// paragraph above is what needs rewriting.
		const callers = [...FILES.map((f) => src(f)), readFileSync(
			fileURLToPath(new URL('../package.json', import.meta.url)),
			'utf8'
		), readFileSync(fileURLToPath(new URL('../tools/run-tests.mjs', import.meta.url)), 'utf8')];
		const invoked = callers.filter((t) =>
			/(?:bash|sh|\.\/)?\s*tools\/integrate-gate-proof\.sh/.test(
				t.split('\n').filter((l) => !/^\s*(#|\/\/|\*)/.test(l)).join('\n')
			)
		);
		expect(
			invoked.length,
			'integrate-gate-proof.sh is now invoked somewhere -- good, but this test says it is not'
		).toBe(0);
	});

	it('the nightly runs inside the hours a day-boundary defect shows, in BOTH halves of the year', () => {
		// WHY THIS IS PINNED AT ALL: before this, NOTHING in the suite asserted
		// any cron, any trigger or any schedule in any workflow. The hour was a
		// bare string one tidy-up away from being rounded to something neat,
		// and the cost of moving it is invisible from the file.
		//
		// `tests/db/classroom-hall-pass-limits.test.ts` failed only between
		// 00:00 and 02:00 America/Los_Angeles and passed every CI run for weeks.
		// GitHub cron is UTC and does not shift with daylight saving, so one
		// entry lands on two different local hours across the year and BOTH
		// have to be inside the window or the nightly only covers half of it.
		const cron = /-\s*cron:\s*'([^']+)'/.exec(src('ci.yml'))?.[1];
		expect(cron, 'ci.yml declares no cron').toBeTruthy();
		const [minute, hour] = cron!.split(/\s+/);
		expect(`${minute} ${hour}`, 'the nightly cron is no longer a fixed daily hour').toMatch(
			/^\d{1,2} \d{1,2}$/
		);

		// The local hours are DERIVED, never written down: a hardcoded pair is
		// a second statement of the same fact and is what stops agreeing.
		const localHour = (month: number) => {
			const utc = new Date(Date.UTC(2026, month - 1, 15, Number(hour), Number(minute)));
			const parts = new Intl.DateTimeFormat('en-US', {
				timeZone: 'America/Los_Angeles',
				hour: '2-digit',
				minute: '2-digit',
				hour12: false
			}).formatToParts(utc);
			const h = Number(parts.find((p) => p.type === 'hour')!.value);
			const m = Number(parts.find((p) => p.type === 'minute')!.value);
			return h + m / 60;
		};
		const daylight = localHour(7); // July, PDT (UTC-7)
		const standard = localHour(1); // January, PST (UTC-8)

		// The window's edges are the FIXTURES' doing, not a preference: the
		// deepest backdate in that file is 120 minutes, so the last failure
		// clears at 02:00, and nothing before midnight crosses the day boundary
		// at all (measured 24/24 passing at 23:00 and 23:30).
		for (const [label, at] of [
			['daylight (July)', daylight],
			['standard (January)', standard]
		] as const) {
			expect(
				at,
				`the nightly runs at ${at} Pacific in ${label}, outside the 00:00-02:00 window a day-boundary defect shows in`
			).toBeGreaterThanOrEqual(0);
			expect(at, `the nightly runs at ${at} Pacific in ${label}, past the 02:00 edge`).toBeLessThan(2);
		}

		// AND AT OR BEFORE 01:00, which is a strictly stronger claim than being
		// in the window. Detection DEGRADES across it: measured 6 failures at
		// 00:05, 00:30 and 01:00, but only 2 at 01:30 and 0 at 02:05. An hour
		// inside the window but past 01:00 catches a third of the defect and
		// reports it as a pass for the rest.
		expect(
			Math.max(daylight, standard),
			'the nightly is inside the window but past the last full-strength reading (01:00)'
		).toBeLessThanOrEqual(1);

		// POSITIVE CONTROL, both directions, so "in the window" cannot pass on
		// arithmetic that always answers yes. The retired hour is the real
		// negative case and the chosen one is the real positive case.
		const at = (c: string) => {
			const [mm, hh] = c.split(/\s+/);
			const d = new Date(Date.UTC(2026, 6, 15, Number(hh), Number(mm)));
			return Number(
				new Intl.DateTimeFormat('en-US', {
					timeZone: 'America/Los_Angeles',
					hour: '2-digit',
					hour12: false
				}).format(d)
			);
		};
		expect(at('30 4 * * *'), 'the retired 30 4 cron must read as 21:00-ish Pacific').toBe(21);
		expect(at(cron!), 'the chosen cron must read as inside the window').toBeLessThan(2);
	});

	it('POSITIVE CONTROL: a renamed, reordered or emptied marker pair is caught', () => {
		const s = src('integrate.yml');
		// EVERY GATE, NOT JUST THE FIRST. Each mutation is applied to each
		// gate's own markers, so a predicate that quietly only ever looked at
		// `ledger_gate` cannot pass this.
		for (const g of CUTTABLE_GATES) {
			const begin = `# ${g.marker}:begin`;
			const end = `# ${g.marker}:end`;
			// Renamed: exactly the silent break this assertion exists for.
			expect(markerFindings(s.replace(begin, '# renamed_start'), g), `${g.fn}: renamed begin`).not.toEqual([]);
			expect(markerFindings(s.replace(end, '# renamed_finish'), g), `${g.fn}: renamed end`).not.toEqual([]);
			// Duplicated, which makes the cut ambiguous rather than empty.
			expect(markerFindings(`${s}\n${begin}\n`, g), `${g.fn}: duplicated begin`).not.toEqual([]);
			// Reversed, which cuts nothing at all.
			expect(
				markerFindings(
					s.replace(begin, '# TMP').replace(end, begin).replace('# TMP', end),
					g
				),
				`${g.fn}: reversed pair`
			).not.toEqual([]);
			// Present, in order, but with the function moved out from between them.
			expect(
				markerFindings(`${begin}\n          echo nothing to see here\n${end}\n`, g),
				`${g.fn}: emptied body`
			).not.toEqual([]);
		}

		// And the call site, whose two halves fail in different places: a gate
		// nothing calls, and a gate whose reason never reaches the summary.
		expect(callSiteFindings(s.replace('ledger_gate "$ref"', 'ledger_gate_v2 "$ref"'))).not.toEqual(
			[]
		);
		expect(callSiteFindings(s.replace(/skipped\+=\(/g, 'ignored+=('))).not.toEqual([]);

		// THE DEADLOCK, PUT BACK. Each of the three is the shape a plausible
		// edit would produce, and each must redden on its own.
		expect(
			pushConditionFindings(
				s.replace(
					'if target_push_gate "${remote_tip:-}" "$(git rev-parse HEAD)"; then',
					'if [ ${#merged[@]} -gt 0 ]; then'
				)
			),
			'the pre-fix condition put back is not caught'
		).not.toEqual([]);
		expect(
			pushConditionFindings(
				s.replace('target_push_gate "${remote_tip:-}"', 'target_push_gate "$target_start"')
			),
			'asking the gate about the wrong base is not caught'
		).not.toEqual([]);
		expect(
			pushConditionFindings(s.replace('git push origin "HEAD:refs/heads/$TARGET"', 'true')),
			'a push moved out of the gate branch is not caught'
		).not.toEqual([]);
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
