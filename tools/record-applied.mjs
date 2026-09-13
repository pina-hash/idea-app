#!/usr/bin/env node
/**
 * record-applied -- write `docs/migrations-applied/<nnnn>-<slug>.md` for a
 * migration that was applied BY HAND, from the report of the person who
 * pasted it. It opens no socket, reads no connection string, and has no
 * database code path at all.
 *
 * WHY THIS EXISTS BESIDE `apply-migration.mjs` RATHER THAN INSIDE IT.
 * That tool writes the record from a transaction it watched commit and a
 * catalog it queried afterwards, and its whole contract -- stated in
 * `docs/migrations-applied/README.md` -- is that "a file exists if and only if
 * a transaction committed", enforced structurally by the single call site
 * sitting below the commit. An `--offline` flag on it would make that sentence
 * false and would put a MEASUREMENT and a REPORT behind one code path, where a
 * reader of the directory could no longer tell them apart. So this is a second
 * tool with a second name that stamps `source: report`, and the two kinds of
 * record are distinguishable by `grep` forever.
 *
 * WHY IT CANNOT JUST CONNECT. A cloud session's egress proxy accepts a CONNECT
 * to port 5432 and then carries no bytes, permanently -- measured, and recorded
 * in `docs/standards/IDEA_instructions.md` as the reason no prompt may plan
 * around a session applying its own migration. `IDEA_MIGRATION_URL` is not set
 * in a session and must not be. Every migration from `0193` onward was
 * therefore pasted into the Supabase SQL editor by Mr. Pina, and the repository
 * had no way to say which of them are live. That is what this closes.
 *
 * IT FITS THE LOOP HE ALREADY RUNS rather than adding one beside it. He pastes
 * the migration, reads the notices, then pastes a verification query and reads
 * the rows back. So:
 *
 *     node tools/record-applied.mjs 0209 --query
 *         Prints the read-only catalog probe for 0209 -- the SAME probe
 *         `deploy-probe.mjs` would have run, derived locally through its own
 *         `readProbes`/`prepare`/`buildSql`, so this is not a second idea of
 *         what to check. Paste it after the migration.
 *
 *     node tools/record-applied.mjs 0209 --by "Mr. Pina" --on 2026-09-13 \
 *         --evidence rows.txt
 *         Writes the record. `--evidence -` reads the pasted output from stdin.
 *
 * WHAT IT REFUSES TO CLAIM. A record written here never carries `session_user`
 * or `database`: those two fields exist because they are answers the SERVER
 * gave to a query, and a tool that has spoken to no server has no honest value
 * for them. Their ABSENCE is the signal, exactly as an omitted transport is the
 * mechanism elsewhere in this repository. `outcome` is `applied` only where
 * evidence was supplied; without it the record says `reported` and the body
 * says so in its first sentence.
 *
 * NOTHING SENSITIVE CAN REACH A FILE. Evidence is free text somebody pasted, so
 * it goes through `deploy-probe.mjs`'s own `redact` against any connection
 * string in the environment, and through a scrub for anything shaped like a
 * postgres URL even when no variable is set -- because the person pasting is
 * pasting out of a browser tab that has one.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

import { readProbes, prepare, buildSql, redact, URL_VAR } from './deploy-probe.mjs';
import { collect, parseEntry, parsePermitted, migrationNumber } from './migration-claims.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..');
export const APPLIED_DIR = join(REPO_ROOT, 'docs', 'migrations-applied');
export const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');

/** Exit codes. `2` is "cannot say", which is never a pass. */
export const EXIT = { ok: 0, refused: 1, cannotRun: 2 };

/* ------------------------------------------------------------------------ */
/* Redaction.                                                               */
/* ------------------------------------------------------------------------ */

/**
 * A postgres connection string in any of the spellings a Supabase dashboard
 * hands out. This runs IN ADDITION to `redact`, which can only mask a URL it
 * was given: the person pasting evidence has a live connection string on their
 * clipboard history and this repository is public, so a scrub that needs to be
 * told the secret first is the wrong shape for this input.
 */
const URLISH = /\b(?:postgres(?:ql)?):\/\/[^\s'"`<>]+/gi;

/**
 * @param {string} text
 * @param {string} [url]
 * @returns {string}
 */
export function scrub(text, url = process.env[URL_VAR] ?? '') {
	return redact(String(text ?? ''), url).replace(URLISH, '<connection string>');
}

/* ------------------------------------------------------------------------ */
/* Reading the tree. No network, no database.                                */
/* ------------------------------------------------------------------------ */

/** @param {string} text */
export function sha256(text) {
	return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * The migration file for a four-digit number, from the working tree.
 * @param {string} num
 * @param {string} [dir]
 * @returns {{ ok: true, file: string, sql: string } | { ok: false, why: string }}
 */
export function migrationFor(num, dir = MIGRATIONS_DIR) {
	let names;
	try {
		names = readdirSync(dir).filter((f) => f.endsWith('.sql'));
	} catch {
		return { ok: false, why: `cannot read ${dir}` };
	}
	const hits = names.filter((f) => f.startsWith(`${num}_`));
	if (hits.length === 0) return { ok: false, why: `no migration ${num} in supabase/migrations` };
	if (hits.length > 1) return { ok: false, why: `${hits.length} files claim ${num}: ${hits.join(', ')}` };
	return { ok: true, file: hits[0], sql: readFileSync(join(dir, hits[0]), 'utf8') };
}

/**
 * The ledger entry that AUTHORISED this migration -- never the entry that
 * happens to be recording it. `apply-migration.mjs`'s `appliesUnderLedger`
 * greps `^ledger:` to answer "has this bundle already applied a migration", so
 * writing the recording bundle's id there would make that question answer about
 * the wrong bundle and would attribute eighteen migrations to one lane that
 * wrote none of them.
 *
 * It reuses `parsePermitted`, deliberately: "which number does this entry
 * claim" already has one implementation and a second one is the pair that stops
 * agreeing. It walks EVERY ref `collect` sees, because an entry can still be
 * sitting on an unmerged branch.
 *
 * @param {string} num
 * @param {ReturnType<typeof collect>} [inventory]
 * @returns {{ id: string, file: string, raw: string, branch: string } | null}
 */
export function authorisingEntry(num, inventory = collect(REPO_ROOT)) {
	const want = Number(num);
	/** @type {Map<string, { id: string, file: string, raw: string, branch: string }>} */
	const found = new Map();
	for (const ref of inventory?.refs ?? []) {
		for (const e of ref.entries ?? []) {
			const { id, fields } = parseEntry(e.text);
			const permitted = parsePermitted(fields['Migration permitted']);
			if (!permitted.numbers.includes(want)) continue;
			// A RELEASED claim is not an authorisation. An entry that says it
			// wrote none took the number and gave it back; recording it as the
			// author would name the wrong bundle, which is the 0204 case (0174
			// claimed it, released it unused, and 0177 wrote the file).
			if (/\bNONE\s+(?:WRITTEN|TAKEN)\b|\bRELEASED\b/i.test(permitted.raw)) continue;
			const branch = (/(?:claude|codex)\/[A-Za-z0-9._-]+/.exec(fields['Branch'] ?? '') ?? [''])[0];
			if (!found.has(id)) found.set(id, { id, file: e.file, raw: permitted.raw, branch });
			else if (branch && !found.get(id)?.branch) found.set(id, { id, file: e.file, raw: permitted.raw, branch });
		}
	}
	if (found.size !== 1) return null; // "cannot say" is never a guess.
	return [...found.values()][0];
}

/**
 * The slug a record is named by. `docs/migrations-applied/README.md` takes it
 * from the branch, because two sessions that both applied one migration are two
 * branches. A HAND APPLY has one applier and no race, so the slug here is doing
 * attribution rather than race-breaking: it names the branch the migration came
 * FROM, which is the thing a reader of `0209-...md` actually wants.
 *
 * @param {string} branch
 * @returns {string}
 */
export function slugFor(branch) {
	return String(branch ?? '')
		.replace(/^(?:origin\/)?(?:claude|codex|lane)\//, '')
		.replace(/\.md$/i, '')
		.replace(/[^A-Za-z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** @param {string[]} args */
function git(args) {
	return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

/** @returns {string} */
export function headCommit() {
	try {
		return git(['rev-parse', 'HEAD']);
	} catch {
		return 'unknown';
	}
}

/* ------------------------------------------------------------------------ */
/* The verification query. Derived, never invented.                          */
/* ------------------------------------------------------------------------ */

/**
 * The read-only catalog probe for one migration, or a refusal.
 *
 * IT REFUSES RATHER THAN GUESSING, and the refusal is the common case for a
 * migration that has not reached `origin/main` yet: `idea-status.py` derives
 * probes from `origin/main` by rule, so a file sitting only on `integration`
 * gets none. `CLAUDE.md` states that outcome and states the answer -- "Do not
 * widen the probe to guess" -- so this prints what it cannot do and stops.
 *
 * @param {string} num
 * @returns {{ ok: true, sql: string, objects: string[] } | { ok: false, why: string }}
 */
export function verificationQuery(num) {
	const since = Math.max(1, Number(num) - 1);
	let probes;
	try {
		probes = prepare(readProbes({ root: REPO_ROOT, since, ref: 'HEAD' }));
	} catch (err) {
		return { ok: false, why: `could not derive probes (${/** @type {Error} */ (err).message})` };
	}
	const mine = probes.filter((p) => p.num === num && p.sql);
	if (mine.length === 0) {
		return {
			ok: false,
			why: `no probe could be derived for ${num}. That is the expected answer while the file is only on a branch: probes come from origin/main. Write the verification query by hand and pass its output to --evidence.`
		};
	}
	return { ok: true, sql: buildSql(mine), objects: mine.map((p) => `${p.kind} ${p.object}`) };
}

/* ------------------------------------------------------------------------ */
/* Rendering.                                                                */
/* ------------------------------------------------------------------------ */

/**
 * @typedef {{
 *   num: string, file: string, sha256: string,
 *   ledgerId: string, ledgerFile: string, ledgerRaw: string,
 *   slug: string, sourceBranch: string,
 *   by: string, appliedOn: string, recordedAt: string,
 *   recordedByLedger: string, commit: string,
 *   objects: string[], evidence: string | null, note: string | null
 * }} ReportedRecord
 */

/**
 * @param {ReportedRecord} r
 * @returns {string}
 */
export function renderReportedRecord(r) {
	const has = Boolean(r.evidence && r.evidence.trim());
	const out = [];
	out.push('---');
	out.push(`migration: "${r.num}"`);
	out.push(`file: ${r.file}`);
	out.push(`sha256: ${r.sha256}`);
	out.push(`sha256_covers: repo bytes at commit ${r.commit}`);
	out.push(`applied_at: ${r.appliedOn}`);
	out.push(`recorded_at: ${r.recordedAt}`);
	out.push('source: report');
	out.push(`attested_by: ${scrub(r.by)}`);
	out.push(`evidence: ${has ? 'verification-output' : 'report-only'}`);
	out.push(`ledger: "${r.ledgerId}"`);
	out.push(`recorded_by_ledger: "${r.recordedByLedger}"`);
	out.push(`branch: ${r.sourceBranch}`);
	out.push(`commit: ${r.commit}`);
	out.push(`outcome: ${has ? 'applied' : 'reported'}`);
	out.push('---');
	out.push('');
	out.push(`# ${r.num} applied by hand`);
	out.push('');
	out.push(
		`**This record rests on ${scrub(r.by)}'s report of ${r.appliedOn}, not on a measurement made by this repository.** ` +
			'No process in this repository has ever connected to the production database. ' +
			`\`${r.file}\` was pasted into the Supabase SQL editor by hand; what is written below is what was reported back, ` +
			'and nothing here was observed by the tool that wrote it.'
	);
	out.push('');
	out.push(
		'`session_user` and `database` are absent on purpose. In a record written by ' +
			'`tools/apply-migration.mjs` they are answers the SERVER gave to a query, and this tool ' +
			'spoke to no server, so it has no honest value for either. The absence is the signal.'
	);
	out.push('');
	out.push('## Authorisation');
	out.push('');
	out.push(`- Ledger entry: \`docs/prompt-ledger/entries/${r.ledgerFile}\``);
	out.push(`- \`Migration permitted: ${scrub(r.ledgerRaw)}\``);
	out.push(`- Written on \`${r.sourceBranch}\`.`);
	out.push(
		`- Recorded, later and separately, by ledger \`${r.recordedByLedger}\`. That bundle did not write this migration and did not apply it.`
	);
	out.push('');
	out.push('## What was reported back');
	out.push('');
	if (has) {
		out.push(
			'As supplied to this tool, with anything shaped like a connection string masked. ' +
				'The values are reproduced and NOT interpreted: whether a particular `false` is a pass ' +
				'or a failure is a question about the query that produced it, and this tool did not write ' +
				'that query and did not run it.'
		);
		out.push('');
		out.push('```');
		out.push(scrub(/** @type {string} */ (r.evidence)).replace(/```/g, "'''"));
		out.push('```');
	} else {
		out.push(
			'**No verification output was supplied.** The whole of the evidence is the report ' +
				'that the file was pasted and applied. This record says the migration is live; it does ' +
				'not say that any object the file names was seen afterwards.'
		);
	}
	if (r.note) {
		out.push('');
		out.push(scrub(r.note));
	}
	out.push('');
	out.push('## What a verification query would cover');
	out.push('');
	if (r.objects.length === 0) {
		out.push(
			'No probe could be derived for this file, so this record names no object list. ' +
				'`tools/idea-status.py` derives a probe from a migration\'s FIRST object and answers ' +
				'nothing for some shapes; that is a limit of the derivation and not a claim about the file.'
		);
	} else {
		out.push('Derived locally by `tools/record-applied.mjs --query`, and never run from here:');
		out.push('');
		for (const o of r.objects) out.push(`- ${o}`);
	}
	out.push('');
	out.push('## What this record does not prove');
	out.push('');
	out.push(
		'That the migration was a good idea, that a backfill inside it did the right thing, or ' +
			'that the database still holds what it held on the day above. It is one person\'s report, ' +
			'written down where the next session can find it instead of nowhere.'
	);
	out.push('');
	return out.join('\n');
}

/* ------------------------------------------------------------------------ */
/* CLI.                                                                      */
/* ------------------------------------------------------------------------ */

/** @param {string[]} argv */
export function parseArgs(argv) {
	/** @type {Record<string, string | boolean>} */
	const opts = {};
	let num = '';
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (/^\d{4}$/.test(a)) {
			num = a;
			continue;
		}
		if (!a.startsWith('--')) continue;
		const key = a.slice(2);
		if (key === 'query' || key === 'help' || key === 'force') opts[key] = true;
		else opts[key] = argv[++i] ?? '';
	}
	return { num, opts };
}

const USAGE = `record-applied -- write a docs/migrations-applied/ record for a HAND-APPLIED migration.
Opens no socket. Reads no connection string. Has no database code path.

  node tools/record-applied.mjs <nnnn> --query
      Print the read-only catalog probe for <nnnn>, to paste after the migration.

  node tools/record-applied.mjs <nnnn> --by "<who>" --on <YYYY-MM-DD> \\
      [--evidence <file>|-] [--note "<text>"] [--recorded-by <ledger nnnn>] [--force]

      Write docs/migrations-applied/<nnnn>-<slug>.md from what came back.
      --evidence -   reads the pasted output from stdin.
      Without --evidence the record says outcome: reported, and says why in words.
      --force overwrites an existing record.`;

/** @returns {number} */
export function main(argv = process.argv.slice(2)) {
	const { num, opts } = parseArgs(argv);
	if (opts.help || (!num && argv.length === 0)) {
		console.log(USAGE);
		return EXIT.ok;
	}
	if (!num) {
		console.error('record-applied: name a four-digit migration number.');
		return EXIT.cannotRun;
	}

	const mig = migrationFor(num);
	if (!mig.ok) {
		console.error(`record-applied: ${mig.why}`);
		return EXIT.cannotRun;
	}

	if (opts.query) {
		const q = verificationQuery(num);
		if (!q.ok) {
			console.error(`record-applied: ${q.why}`);
			return EXIT.cannotRun;
		}
		console.log(`-- verification for ${mig.file}, read only. Paste after the migration.`);
		for (const o of q.objects) console.log(`--   ${o}`);
		console.log(q.sql);
		return EXIT.ok;
	}

	const by = String(opts.by ?? '').trim();
	const on = String(opts.on ?? '').trim();
	if (!by) {
		console.error('record-applied: --by is required. A record with no attester claims nobody said it.');
		return EXIT.refused;
	}
	if (!/^\d{4}-\d{2}-\d{2}/.test(on)) {
		console.error('record-applied: --on <YYYY-MM-DD> is required. A report with no date cannot be aged.');
		return EXIT.refused;
	}

	const entry = authorisingEntry(num);
	const ledgerId = String(opts.ledger ?? entry?.id ?? '').trim();
	const sourceBranch = String(opts.branch ?? entry?.branch ?? '').trim();
	if (!ledgerId) {
		console.error(
			`record-applied: could not establish which ledger entry authorised ${num}, and will not guess. Pass --ledger <nnnn>.`
		);
		return EXIT.refused;
	}

	let evidence = null;
	if (opts.evidence === '-') evidence = readFileSync(0, 'utf8');
	else if (opts.evidence) evidence = readFileSync(String(opts.evidence), 'utf8');

	const q = verificationQuery(num);
	const slug = slugFor(sourceBranch) || `ledger-${ledgerId}`;
	const path = join(APPLIED_DIR, `${num}-${slug}.md`);

	const body = renderReportedRecord({
		num,
		file: mig.file,
		sha256: sha256(mig.sql),
		ledgerId,
		ledgerFile: String(opts['ledger-file'] ?? entry?.file ?? `${ledgerId}-*.md`),
		ledgerRaw: String(opts['ledger-raw'] ?? entry?.raw ?? 'not read'),
		slug,
		sourceBranch: sourceBranch || 'unknown',
		by,
		appliedOn: on,
		recordedAt: new Date().toISOString(),
		recordedByLedger: String(opts['recorded-by'] ?? '0197'),
		commit: headCommit(),
		objects: q.ok ? q.objects : [],
		evidence,
		note: opts.note ? String(opts.note) : null
	});

	mkdirSync(APPLIED_DIR, { recursive: true });
	try {
		if (!opts.force) readFileSync(path, 'utf8');
		if (!opts.force) {
			console.error(`record-applied: ${path} already exists. Pass --force to overwrite.`);
			return EXIT.refused;
		}
	} catch {
		/* not there, which is the ordinary case */
	}
	writeFileSync(path, body, 'utf8');
	console.log(`wrote docs/migrations-applied/${num}-${slug}.md (source: report, attested by ${by} on ${on})`);
	return EXIT.ok;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	process.exit(main());
}
