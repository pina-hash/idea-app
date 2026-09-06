#!/usr/bin/env node
/**
 * apply-migration: apply ONE named migration file to a database, as the scoped
 * `idea_migrator` role, and verify afterwards that what it claims to create
 * exists.
 *
 *   node tools/apply-migration.mjs 0181                 # by number
 *   node tools/apply-migration.mjs supabase/migrations/0181_x.sql
 *   node tools/apply-migration.mjs 0181 --dry-run       # every check, no apply
 *   node tools/apply-migration.mjs 0181 --json
 *   node tools/apply-migration.mjs 0181 --ledger 0066   # name the authorising
 *                                                       # bundle, when the tool
 *                                                       # cannot infer it
 *
 * ---------------------------------------------------------------------------
 * ONE FILE. NEVER A DIRECTORY, NEVER A LOOP, NEVER `supabase db push`.
 *
 * `supabase db push` is forbidden on this project and stays forbidden, and the
 * reason has not changed: the remote has no `supabase_migrations.schema_migrations`
 * table at all, so `db push` treats EVERY local file as unapplied and would
 * replay one-time imports and backfills (`0084`, `0100`) over real student data.
 * That rule is about one command. Handing ONE named file to one connection is a
 * different act, and it is the only act this tool can perform: the argument is a
 * single migration, there is no flag that takes a range, and the ordering check
 * below refuses anything that is not the LOWEST unapplied file.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT REFUSES BEFORE IT CONNECTS, AND WHY THAT IS NOW THE WHOLE OF THE
 * PROTECTION. `scanFile` splits the file into top-level statements
 * (dollar-quoting, quoted strings and comments respected, interior comments
 * included) and refuses the destructive ones.
 *
 * THIS IS THE ONLY CONTROL THAT EXISTS. It used to be the outer half of a pair:
 * the database carried an event-trigger guard that refused `drop table` and
 * friends from `idea_migrator`, and this scan covered the two things that guard
 * measurably could not (`truncate`, which never fires an event trigger, and
 * top-level DML, which never fires one either). THE DATABASE HALF WAS NEVER
 * INSTALLED AND CANNOT BE: `create event trigger` requires superuser and
 * Supabase's `postgres` is not one. See `supabase/roles/idea_migrator.sql`,
 * section "WHAT DOES NOT PROTECT YOU".
 *
 * So this is a CLIENT-SIDE control, it is bypassable in one line by anyone
 * holding the credential and a `psql` prompt, and there is nothing behind it.
 * That is why the scanner strips comments from the MIDDLE of a statement and
 * not only from the front: a keyword hidden behind `drop /* x *\/ table` used to
 * be sent, and used to be caught by the database. Now nothing would catch it.
 *
 * ---------------------------------------------------------------------------
 * IT DOES NOT DERIVE "IS THIS APPLIED" ITSELF. `tools/idea-status.py` turns a
 * migration into a catalog probe and `tools/deploy-probe.mjs` translates and
 * runs them; this imports both rather than writing a third derivation. What it
 * DOES derive for itself is a different question, asked after the apply: not
 * "did this migration land" (one marker object) but "did EVERY object this file
 * names land" (all of them). Two questions, two derivations, said out loud here
 * so the next reader does not fold them together.
 *
 * ---------------------------------------------------------------------------
 * WHO ASKED FOR THIS MIGRATION. Before it opens a connection, this reads the
 * ledger entry for the bundle it is running under and refuses unless that entry
 * permits a migration. Every bundle has declared this in writing since prompt
 * 0001 and nothing read it until 0066. The ordering rule below is not a
 * substitute: a migration a session invented and nobody asked for IS the lowest
 * unapplied file the moment it is committed. See the ledger-gate section.
 *
 * ---------------------------------------------------------------------------
 * IT WRITES NOTHING ANYWHERE ON FAILURE, AND EXACTLY ONE FILE ON SUCCESS.
 *
 * The failure half is unchanged and is the older promise: the apply is one
 * transaction; a raise from the file's own self-check, a refusal, or any other
 * error rolls the whole thing back, and nothing is written anywhere. There is
 * no state to clean up after a failed run because there is none to begin with.
 *
 * The success half is new in prompt 0066 and is the point of it. A migration
 * that applies itself with nobody watching has to leave something a person can
 * find afterwards, so a run that COMMITS writes one file under
 * `docs/migrations-applied/`, named `<nnnn>-<branch slug>.md`, carrying the
 * migration's number and sha256, the branch and commit it ran from, the ledger
 * entry that authorised it, the UTC instant, every notice in order with its
 * severity, and the per-object verification. The session commits it with its
 * work. It carries nothing from the connection string; see
 * `renderAppliedRecord` for exactly what is and is not in it and why.
 *
 * THE TWO HALVES MEET AT ONE LINE. The write sits after the apply has
 * committed and after verification, so every path that applied nothing returns
 * before reaching it -- which is the mechanism, rather than a flag somebody has
 * to keep true.
 *
 * ---------------------------------------------------------------------------
 * THE CONNECTION STRING IS READ FROM `IDEA_MIGRATION_URL` AND IS NEVER PRINTED.
 * Not in a message, not in an error, not in `--json`. `deploy-probe.mjs`'s
 * `redact` is the one implementation of that and this calls it.
 *
 * A CLOUD CONTAINER CANNOT OPEN A TCP SOCKET TO PORT 5432. Measured in the
 * remote session this tool was written in: outbound 5432 and 6543 are both
 * refused and only 443 is open, through an HTTP CONNECT proxy named by
 * `HTTPS_PROXY`. That proxy DOES answer `200 Connection Established` for a
 * CONNECT to 5432, so this tunnels through it when `HTTPS_PROXY` is set and the
 * host is not in `NO_PROXY`. That is why this speaks the wire protocol through
 * `pg` rather than shelling out to `psql`, which has no proxy support at all --
 * and it is also what lets every notice be read in order with its severity,
 * which `psql`'s interleaved stderr does not give.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, basename } from 'node:path';
import net from 'node:net';
import pg from 'pg';
import { readProbes, prepare, buildSql, verdicts, redact } from './deploy-probe.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..');
export const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');
/** Ledger entries, one per bundle. The authorisation this tool reads. */
export const LEDGER_DIR = join(REPO_ROOT, 'docs', 'prompt-ledger', 'entries');
/** The committed trace, one file per successful apply. */
export const APPLIED_DIR = join(REPO_ROOT, 'docs', 'migrations-applied');

/** The environment variable holding the scoped role's connection string. */
export const URL_VAR = 'IDEA_MIGRATION_URL';

/**
 * The event-trigger guard this tool USED to expect. It is not installed on this
 * project and cannot be -- `create event trigger` needs superuser. The
 * fingerprint check is kept because it costs one query and it is the only thing
 * that would notice if one ever appeared, or moved; its ABSENCE is the normal
 * state and is reported as such rather than as a missing step.
 */
export const GUARD_FUNCTION = 'idea_guard.applier_guard()';

/**
 * Exit statuses. A refusal and a failure are different outcomes and only one of
 * them means the file is wrong.
 */
export const EXIT = {
	/** Applied and every object verified. */
	applied: 0,
	/** The tool could not run at all: no URL, no file, no connection. */
	cannotRun: 1,
	/** A considered refusal BEFORE anything was sent. Nothing was applied. */
	refused: 2,
	/** The migration ran and something raised. Rolled back; nothing applied. */
	raised: 3,
	/** It applied, and the post-apply verification could not confirm an object. */
	unverified: 4
};

/* ------------------------------------------------------------------------ */
/* The ledger gate: WHO ASKED FOR THIS MIGRATION.                            */
/* ------------------------------------------------------------------------ */

/**
 * THE ORDERING RULE IS NOT AN AUTHORISATION RULE, WHICH IS WHY THIS EXISTS.
 * `orderVerdict` refuses anything that is not the LOWEST unapplied file. That
 * is a correctness check and it is a good one, but a migration a session
 * invented and nobody asked for IS the lowest unapplied file the moment it is
 * committed, so the ordering rule waves it straight through. Nothing in this
 * tool has ever asked whether the bundle it is running under was permitted a
 * migration at all -- and every bundle has said so, in writing, in its ledger
 * entry, since prompt 0001.
 *
 * Read across all 66 entries on `origin/integration`, the line has exactly two
 * meanings and many spellings:
 *
 *   REFUSING    "no. Highest on origin/main at issue: 0184"
 *               "no. The role file carries a password and is not a migration."
 *   PERMITTING  "at most one, number taken at commit time. Highest ...: 0180"
 *               "exactly one, 0176. Highest on origin/main at issue: 0175"
 *               "yes, exactly one, 0170. Highest ...: 0169"
 *               "at most one, conditional. Highest ...: 0180"
 *               "only if A3 proved it. Highest ...: 0180. NONE WRITTEN: ..."
 *
 * So the partition is `^no\b` and nothing cleverer. Anything else permits at
 * most one file, which is what every permitting spelling in the corpus means:
 * not one of them permits two.
 */

/** The one place the permission line is named, so a rename is one edit. */
export const PERMISSION_FIELD = 'Migration permitted';

/**
 * `- Migration permitted: <this>` from a ledger entry's body, or null when the
 * line is absent. Read off the FIRST match: an entry is a list of fields and a
 * later mention inside the prose of `Notes:` is prose.
 *
 * @param {string} text
 * @returns {string | null}
 */
export function permissionLine(text) {
	const m = new RegExp(`^-\\s*${PERMISSION_FIELD}:\\s*(.*)$`, 'm').exec(text);
	return m ? m[1].trim() : null;
}

/**
 * Whether a ledger entry permits a migration, and which number it named.
 *
 * THE NUMBER IS ADVISORY AND THE PERMISSION IS NOT, and that asymmetry is
 * deliberate. 23 of the 66 entries say "number taken at commit time" precisely
 * because the number is not knowable when the entry is written: prompt 0056
 * renumbered mid-session, and prompt 0064's own line records taking 0184 after
 * 0183 landed on main mid-flight. A gate that refused on a number mismatch
 * would refuse the ordinary case. So a mismatch is a WARNING carried into the
 * record, where a person reading the trace afterwards can see it, and the
 * refusal is reserved for the one thing the entry can state unambiguously at
 * issue time: whether a migration was permitted at all.
 *
 * A NUMBER IS ONLY READ FROM THE PERMITTING CLAUSE, never from the whole line.
 * Every entry -- including every refusing one -- carries
 * "Highest on origin/main at issue: 0184", and a naive four-digit scan would
 * read that as the permitted number and then "confirm" it against a file that
 * has nothing to do with it.
 *
 * @param {string} text
 * @returns {{ permitted: boolean, raw: string | null, number: string | null }}
 */
export function ledgerPermission(text) {
	const raw = permissionLine(text);
	if (raw === null) return { permitted: false, raw: null, number: null };
	const lower = raw.toLowerCase();
	if (/^no\b/.test(lower)) return { permitted: false, raw, number: null };
	// Drop the context clause before looking for a number.
	const clause = raw.split(/highest on origin\/main at issue/i)[0];
	const num = /\b(\d{4})\b/.exec(clause);
	return { permitted: true, raw, number: num ? num[1] : null };
}

/**
 * The ledger entries this branch ADDS, newest-numbered last.
 *
 * HOW THE TOOL LEARNS WHICH BUNDLE IT IS RUNNING UNDER, and why this and not
 * the branch name. Every ledger entry carries a `Branch:` line, but it is a
 * human sentence -- "none on the remote", "`claude/x` at `0d73f72`, swept into
 * integration as ...", and, for the bundle currently running, "assigned by the
 * harness", because the line is filled in at the END. Keying on it would key on
 * the one field that is reliably wrong while the bundle is in flight.
 *
 * What IS reliable is the repository's own standing rule: a bundle's FIRST
 * commit is its ledger entry. So the entry this branch introduces, relative to
 * the branch it came off, is the bundle. `origin/integration` is tried first
 * because that is what sessions branch from; `origin/main` is the fallback for
 * a lane cut from main. The first base that yields exactly one added entry
 * wins, and anything else is "cannot tell", which refuses.
 *
 * @param {string} [cwd]
 * @returns {{ id: string, file: string } | null}
 */
export function inferLedgerEntry(cwd = REPO_ROOT) {
	for (const base of ['origin/integration', 'origin/main']) {
		let out;
		try {
			out = execFileSync(
				'git',
				['diff', '--name-only', '--diff-filter=A', `${base}...HEAD`, '--', 'docs/prompt-ledger/entries/'],
				{ cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
			);
		} catch {
			continue;
		}
		const added = out
			.split('\n')
			.map((l) => l.trim())
			.filter((l) => /\/\d{4}-[^/]+\.md$/.test(l));
		if (added.length === 1) {
			const file = basename(added[0]);
			return { id: file.slice(0, 4), file };
		}
	}
	return null;
}

/**
 * @typedef {{ ok: true, id: string, file: string, raw: string, number: string | null }
 *   | { ok: false, why: string, how: string }} LedgerVerdict
 */

/**
 * Resolve and read the authorising ledger entry.
 *
 * FAILING CLOSED IS RIGHT AND BEING UNUSABLE IS NOT, so every refusal here
 * carries the one flag that recovers it. `--ledger 0066` names the entry
 * outright, which is what a person does when the inference cannot decide --
 * a branch carrying two bundles' entries, a detached HEAD, a checkout with no
 * `origin/integration`.
 *
 * @param {string | undefined} explicit
 * @param {string} [dir]
 * @returns {LedgerVerdict}
 */
export function resolveLedger(explicit, dir = LEDGER_DIR) {
	/** @type {{ id: string, file: string } | null} */
	let found = null;
	if (explicit) {
		const id = String(explicit).padStart(4, '0');
		/** @type {string[]} */
		let names = [];
		try {
			names = readdirSync(dir).filter((f) => f.startsWith(`${id}-`) && f.endsWith('.md'));
		} catch {
			names = [];
		}
		if (names.length !== 1) {
			return {
				ok: false,
				why:
					names.length === 0
						? `no ledger entry ${id} in docs/prompt-ledger/entries/.`
						: `${names.length} ledger entries claim ${id} (${names.join(', ')}).`,
				how: `Check the number. Entries are docs/prompt-ledger/entries/<nnnn>-<slug>.md.`
			};
		}
		found = { id, file: names[0] };
	} else {
		found = inferLedgerEntry();
		if (!found) {
			return {
				ok: false,
				why: 'could not tell which bundle this is: this branch adds no ledger entry, or more than one, relative to origin/integration and origin/main.',
				how: 'Name it: --ledger <nnnn>. A bundle writes its ledger entry as its first commit, which is what the inference looks for.'
			};
		}
	}

	let text;
	try {
		text = readFileSync(join(dir, found.file), 'utf8');
	} catch {
		return {
			ok: false,
			why: `ledger entry ${found.file} could not be read.`,
			how: 'Name a different one with --ledger <nnnn>.'
		};
	}
	const perm = ledgerPermission(text);
	if (perm.raw === null) {
		return {
			ok: false,
			why: `ledger entry ${found.file} has no "${PERMISSION_FIELD}:" line, so it does not say whether a migration was permitted.`,
			how: `Every entry carries one. Add it to the entry, or name a different entry with --ledger <nnnn>.`
		};
	}
	if (!perm.permitted) {
		return {
			ok: false,
			why: `ledger entry ${found.file} says "${PERMISSION_FIELD}: ${perm.raw}".`,
			how: 'This bundle was not asked for a migration. If that is wrong, the entry is what changes, and it is the router chat that changes it -- not this tool and not the session.'
		};
	}
	return { ok: true, id: found.id, file: found.file, raw: perm.raw, number: perm.number };
}

/**
 * Applies already recorded under this ledger entry, read off the committed
 * trace. This is what makes "at most one" mean one across INVOCATIONS rather
 * than one per command line: a session that applied 0185 and then tried 0186
 * under the same entry would otherwise be two perfectly ordinary runs.
 *
 * @param {string} ledgerId
 * @param {string} [dir]
 * @returns {string[]} filenames of existing records
 */
export function appliesUnderLedger(ledgerId, dir = APPLIED_DIR) {
	let names;
	try {
		names = readdirSync(dir).filter((f) => f.endsWith('.md'));
	} catch {
		return [];
	}
	const out = [];
	for (const n of names) {
		let text;
		try {
			text = readFileSync(join(dir, n), 'utf8');
		} catch {
			continue;
		}
		const m = /^ledger:\s*"?(\d{4})/m.exec(text);
		if (m && m[1] === ledgerId) out.push(n);
	}
	return out.sort();
}

/* ------------------------------------------------------------------------ */
/* The trace.                                                                */
/* ------------------------------------------------------------------------ */

/**
 * The branch this is running on, with the `claude/` or `lane/` prefix removed
 * -- the same slug `docs/history/` names its entries by, and for the same
 * reason: the harness mints one branch per session and a branch name cannot be
 * taken twice, so it is collision-free BY CONSTRUCTION rather than by anyone
 * checking. Falls back to the commit when there is no branch (detached HEAD).
 *
 * @param {string} [cwd]
 */
export function branchSlug(cwd = REPO_ROOT) {
	const run = (/** @type {string[]} */ args) => {
		try {
			return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
		} catch {
			return '';
		}
	};
	const branch = run(['rev-parse', '--abbrev-ref', 'HEAD']);
	if (branch && branch !== 'HEAD') return branch.replace(/^(claude|lane)\//, '').replace(/\//g, '-');
	const sha = run(['rev-parse', '--short', 'HEAD']);
	return sha ? `detached-${sha}` : 'unknown';
}

/** @param {string} [cwd] */
export function headCommit(cwd = REPO_ROOT) {
	try {
		return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
	} catch {
		return 'unknown';
	}
}

/**
 * The record's path. `<nnnn>-<branch slug>.md`, which cannot collide even in
 * the race the number alone would lose: two sessions that both saw a migration
 * unapplied and both applied it are two branches, and two branches are two
 * names. See `branchSlug`.
 *
 * @param {string} migrationNum
 * @param {string} slug
 * @param {string} [dir]
 */
export function appliedRecordPath(migrationNum, slug, dir = APPLIED_DIR) {
	return join(dir, `${migrationNum}-${slug}.md`);
}

/**
 * @typedef {{
 *   migrationNum: string, migrationFile: string, sha256: string,
 *   branch: string, slug: string, commit: string,
 *   ledgerId: string, ledgerFile: string, ledgerRaw: string,
 *   numberWarning: string | null,
 *   sessionUser: string, database: string,
 *   at: string,
 *   notices: Notice[],
 *   objects: { kind: string, name: string, present: boolean }[],
 *   exit: string
 * }} AppliedRecord
 */

/**
 * Render the trace.
 *
 * WHAT IS DELIBERATELY NOT IN IT: the connection string, in any form. No host,
 * no port, no password, and the URL itself never reaches this function. What IS
 * here is `session_user` and `current_database()` -- answers the SERVER gave to
 * a query, not strings parsed out of the URL -- because "this ran as postgres
 * rather than idea_migrator" is exactly the fact a person reading a trace
 * afterwards needs, and withholding it would make the record unable to answer
 * the question it exists for. Every free-text field still goes through
 * `redact`, so if a URL ever turns up inside a notice it is masked rather than
 * committed to a public repository.
 *
 * @param {AppliedRecord} r
 * @param {string} url the connection string, used ONLY to redact it back out
 */
export function renderAppliedRecord(r, url) {
	const clean = (/** @type {string} */ t) => redact(t ?? '', url);
	const lines = [];
	lines.push('---');
	lines.push(`migration: "${r.migrationNum}"`);
	lines.push(`file: ${r.migrationFile}`);
	lines.push(`sha256: ${r.sha256}`);
	lines.push(`applied_at: ${r.at}`);
	lines.push(`ledger: "${r.ledgerId}"`);
	lines.push(`branch: ${r.branch}`);
	lines.push(`commit: ${r.commit}`);
	lines.push(`session_user: ${clean(r.sessionUser)}`);
	lines.push(`database: ${clean(r.database)}`);
	lines.push(`outcome: ${r.exit}`);
	lines.push('---');
	lines.push('');
	lines.push(`# ${r.migrationNum} applied from ${r.branch}`);
	lines.push('');
	lines.push(
		`\`${r.migrationFile}\` was applied at ${r.at} by \`tools/apply-migration.mjs\`, running on branch \`${r.branch}\` at commit \`${r.commit}\`.`
	);
	lines.push('');
	lines.push('## Authorisation');
	lines.push('');
	lines.push(`- Ledger entry: \`docs/prompt-ledger/entries/${r.ledgerFile}\``);
	lines.push(`- \`${PERMISSION_FIELD}: ${clean(r.ledgerRaw)}\``);
	if (r.numberWarning) {
		lines.push(`- **WARNING: ${r.numberWarning}**`);
	}
	lines.push('');
	lines.push('## What the database said');
	lines.push('');
	if (r.notices.length === 0) {
		lines.push('The migration raised no notices.');
	} else {
		lines.push(`${r.notices.length} notice(s), in the order they arrived:`);
		lines.push('');
		for (const n of r.notices) lines.push(`- \`${n.severity}\` ${clean(n.message)}`);
	}
	lines.push('');
	lines.push('## Verification, object by object');
	lines.push('');
	if (r.objects.length === 0) {
		lines.push('This file names no object the post-apply probe could derive.');
	} else {
		lines.push('| object | present |');
		lines.push('| --- | --- |');
		for (const o of r.objects) {
			lines.push(`| ${o.kind} \`${clean(o.name)}\` | ${o.present ? 'yes' : '**NO**'} |`);
		}
	}
	lines.push('');
	return lines.join('\n');
}

/**
 * Write the trace. Called on SUCCESS ONLY -- see `main`, where the single call
 * site sits after the apply has committed and after verification.
 *
 * @param {AppliedRecord} r
 * @param {string} url
 * @param {string} [dir]
 * @returns {string} the path written
 */
export function writeAppliedRecord(r, url, dir = APPLIED_DIR) {
	mkdirSync(dir, { recursive: true });
	const path = appliedRecordPath(r.migrationNum, r.slug, dir);
	writeFileSync(path, renderAppliedRecord(r, url), 'utf8');
	return path;
}

/** @param {string} text */
export function sha256(text) {
	return createHash('sha256').update(text, 'utf8').digest('hex');
}

/* ------------------------------------------------------------------------ */
/* Splitting SQL.                                                            */
/* ------------------------------------------------------------------------ */

/**
 * Split SQL into top-level statements. Dollar-quoted bodies, single-quoted
 * literals (with `''` escapes), double-quoted identifiers, `--` line comments
 * and block comments are all skipped over, so a `;` inside any of them does not
 * end a statement and a `drop table` inside a function BODY is not mistaken for
 * one at the top level.
 *
 * @param {string} sql
 * @returns {{ text: string, line: number }[]}
 */
export function splitStatements(sql) {
	/** @type {{ text: string, line: number }[]} */
	const out = [];
	let buf = '';
	let i = 0;
	let line = 1;
	let startLine = 1;
	const n = sql.length;
	const take = (/** @type {number} */ to) => {
		const chunk = sql.slice(i, to);
		for (let k = 0; k < chunk.length; k += 1) if (chunk[k] === '\n') line += 1;
		buf += chunk;
		i = to;
	};
	while (i < n) {
		const c = sql[i];
		if (buf.trim() === '') startLine = line;
		if (c === '-' && sql[i + 1] === '-') {
			const nl = sql.indexOf('\n', i);
			take(nl === -1 ? n : nl);
			continue;
		}
		if (c === '/' && sql[i + 1] === '*') {
			const end = sql.indexOf('*/', i + 2);
			take(end === -1 ? n : end + 2);
			continue;
		}
		if (c === "'") {
			let j = i + 1;
			while (j < n) {
				if (sql[j] === "'" && sql[j + 1] === "'") {
					j += 2;
					continue;
				}
				if (sql[j] === "'") {
					j += 1;
					break;
				}
				j += 1;
			}
			take(j);
			continue;
		}
		if (c === '"') {
			let j = i + 1;
			while (j < n && sql[j] !== '"') j += 1;
			take(Math.min(j + 1, n));
			continue;
		}
		if (c === '$') {
			const m = /^\$[A-Za-z_-￿][A-Za-z0-9_-￿]*\$|^\$\$/.exec(sql.slice(i));
			if (m) {
				const tag = m[0];
				const end = sql.indexOf(tag, i + tag.length);
				take(end === -1 ? n : end + tag.length);
				continue;
			}
		}
		if (c === ';') {
			take(i + 1);
			if (buf.trim()) out.push({ text: buf.trim(), line: startLine });
			buf = '';
			continue;
		}
		take(i + 1);
	}
	if (buf.trim()) out.push({ text: buf.trim(), line: startLine });
	return out;
}

/**
 * Every comment in `sql` replaced by a single space, with quoted strings,
 * quoted identifiers and dollar-quoted bodies left exactly as they are.
 *
 * THIS IS WHAT CLOSES THE HOLE THE `head()` BELOW USED TO HAVE. `head()` only
 * ever stripped comments from the FRONT of a statement, so a comment in the
 * MIDDLE of one hid the keyword pair the refusal list matches on. Measured
 * against the shipping scanner before this existed: `drop table public.x;` was
 * refused, and BOTH `drop /* hi *\/ table public.x;` and `drop -- hi\ntable
 * public.x;` were sent, because the collapsed head read `drop /* hi *\/ table`
 * and `drop -- hi table`, neither of which matches `^drop table\b`. There is
 * no guard in the database any more (see `supabase/roles/idea_migrator.sql`),
 * so a statement this scanner sends is a statement nothing else will refuse.
 *
 * A comment becomes a SPACE rather than nothing, because `drop/*x*\/table` is
 * one token to a naive join and two to Postgres.
 *
 * The scan respects quoting for the same reason `splitStatements` does: a `--`
 * inside a string literal is not a comment, and removing it would change a
 * statement's meaning rather than reveal it.
 *
 * @param {string} sql
 * @returns {string}
 */
export function stripComments(sql) {
	let out = '';
	let i = 0;
	const n = sql.length;
	while (i < n) {
		const c = sql[i];
		if (c === '-' && sql[i + 1] === '-') {
			const nl = sql.indexOf('\n', i);
			i = nl === -1 ? n : nl;
			out += ' ';
			continue;
		}
		if (c === '/' && sql[i + 1] === '*') {
			// Postgres block comments NEST, so a naive indexOf('*\/') stops at the
			// first inner close and leaves the rest of the outer comment as code.
			let depth = 1;
			let j = i + 2;
			while (j < n && depth > 0) {
				if (sql[j] === '/' && sql[j + 1] === '*') {
					depth += 1;
					j += 2;
					continue;
				}
				if (sql[j] === '*' && sql[j + 1] === '/') {
					depth -= 1;
					j += 2;
					continue;
				}
				j += 1;
			}
			i = j;
			out += ' ';
			continue;
		}
		if (c === "'") {
			let j = i + 1;
			while (j < n) {
				if (sql[j] === "'" && sql[j + 1] === "'") {
					j += 2;
					continue;
				}
				if (sql[j] === "'") {
					j += 1;
					break;
				}
				j += 1;
			}
			out += sql.slice(i, j);
			i = j;
			continue;
		}
		if (c === '"') {
			let j = i + 1;
			while (j < n && sql[j] !== '"') j += 1;
			j = Math.min(j + 1, n);
			out += sql.slice(i, j);
			i = j;
			continue;
		}
		if (c === '$') {
			const m = /^\$[A-Za-z_\u0080-\uffff][A-Za-z0-9_\u0080-\uffff]*\$|^\$\$/.exec(sql.slice(i));
			if (m) {
				const tag = m[0];
				const end = sql.indexOf(tag, i + tag.length);
				const j = end === -1 ? n : end + tag.length;
				out += sql.slice(i, j);
				i = j;
				continue;
			}
		}
		out += c;
		i += 1;
	}
	return out;
}

/**
 * A statement with EVERY comment removed, lowercased and with runs of
 * whitespace collapsed. Comparing against the raw text is how a scanner comes
 * back clean over a file whose every statement is preceded by the paragraph of
 * prose these migrations all carry -- and removing the INTERIOR comments too is
 * how it comes back correct over one whose author put a comment inside the
 * statement instead of in front of it. See `stripComments`.
 *
 * A dollar-quoted body is left intact, so a `drop table` inside a function body
 * or a `do` block still does not look like a top-level one: the head then
 * begins `create function` or `do $$`, which no refusal matches.
 *
 * @param {string} stmt
 */
export function head(stmt) {
	return stripComments(stmt).replace(/\s+/g, ' ').toLowerCase().trim();
}

/**
 * The line the statement's first real token is on, given the line its TEXT
 * starts on. A statement here routinely opens with a paragraph of prose, so the
 * text's own first line is the comment's line and not the code's -- which is
 * how a scanner ends up reporting every finding in a file at line 1.
 *
 * @param {string} text
 * @param {number} startLine
 */
export function headLine(text, startLine) {
	let s = text;
	let extra = 0;
	const bump = (/** @type {string} */ chunk) => {
		for (const ch of chunk) if (ch === '\n') extra += 1;
	};
	for (;;) {
		const ws = /^\s*/.exec(s)?.[0] ?? '';
		bump(ws);
		s = s.slice(ws.length);
		if (s.startsWith('--')) {
			const nl = s.indexOf('\n');
			if (nl === -1) return startLine + extra;
			bump(s.slice(0, nl + 1));
			s = s.slice(nl + 1);
			continue;
		}
		if (s.startsWith('/*')) {
			const e = s.indexOf('*/');
			if (e === -1) return startLine + extra;
			bump(s.slice(0, e + 2));
			s = s.slice(e + 2);
			continue;
		}
		return startLine + extra;
	}
}

/* ------------------------------------------------------------------------ */
/* The client-side refusal.                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Statements this tool will not send, and why. Order matters only for which
 * sentence a reader gets first.
 *
 * `insert into` and `update` at the top level are STILL REFUSED BY DEFAULT --
 * `main()` returns EXIT.refused for them and sends nothing -- but they carry
 * kind 'warn' because `--allow-dml` can release them, which `delete` and
 * `truncate` cannot. The census is why the release exists at all: 2 inserts and
 * 1 update across the last twenty migrations, every one of them against
 * `storage.buckets`. `delete` and `truncate` have ZERO occurrences, so there is
 * no legitimate case to release and no flag that releases them.
 */
const REFUSALS = [
	[
		/^drop table\b/,
		'drop table',
		'a migration in this repository has never dropped a table (0161..0180: zero occurrences), and NOTHING IN THE DATABASE REFUSES IT -- this line is the only refusal there is'
	],
	[/^drop schema\b/, 'drop schema', 'it takes everything in the schema with it'],
	[/^drop database\b/, 'drop database', 'nothing in a migration file has any business doing this'],
	[
		/^drop owned\b/,
		'drop owned',
		'it deletes by owner rather than by name, so what it removes is not readable from the file'
	],
	[
		/^truncate\b/,
		'truncate',
		'an event trigger never fires for it -- measured -- and there is no event trigger anyway, so this refusal is the only thing standing between the file and an emptied table'
	],
	[
		/^delete\b/,
		'top-level delete',
		'event triggers do not fire on DML, so the database will not refuse it; a delete inside a function body runs as the definer and is not this'
	],
	[
		/^create extension\b/,
		'create extension',
		'it needs a privilege the scoped role does not have; paste this file by hand in the SQL editor instead'
	],
	[
		/^alter (event trigger|system)\b/,
		'alter event trigger / alter system',
		'no event trigger fires for either, and there is no event trigger to fire'
	],
	[/^drop event trigger\b/, 'drop event trigger', 'this is how the guard is removed'],
	[
		/^(create|alter|drop) role\b/,
		'role management',
		'a credential is created by a person pasting supabase/roles/, never by a migration'
	],
	[
		/^grant [a-z_"][a-z0-9_"]* to\b/,
		'granting role membership',
		'membership is a credential decision, not a migration'
	]
];

/** `alter table ... drop column` hides under the ordinary 'ALTER TABLE' tag. */
const ALTER_DROP_COLUMN = /^alter table\b[\s\S]*\bdrop column\b/;

/**
 * @typedef {{ kind: 'refuse'|'warn', what: string, why: string, line: number, sql: string }} Finding
 * @typedef {{ findings: Finding[], selfManagedTransaction: boolean, statements: number }} Scan
 */

/**
 * @param {string} sql
 * @returns {Scan}
 */
export function scanFile(sql) {
	const stmts = splitStatements(sql);
	/** @type {Finding[]} */
	const findings = [];
	let opens = 0;
	for (const s of stmts) {
		const h = head(s.text);
		if (h === '') continue;
		const brief = head(s.text).slice(0, 90);
		const at = headLine(s.text, s.line);
		if (/^begin\b/.test(h) || /^start transaction\b/.test(h)) opens += 1;
		for (const [re, what, why] of REFUSALS) {
			if (/** @type {RegExp} */ (re).test(h)) {
				findings.push({
					kind: 'refuse',
					what: /** @type {string} */ (what),
					why: /** @type {string} */ (why),
					line: at,
					sql: brief
				});
			}
		}
		if (ALTER_DROP_COLUMN.test(h)) {
			findings.push({
				kind: 'refuse',
				what: 'alter table ... drop column',
				why: 'the column and its data go with it, and nothing in the database refuses it',
				line: at,
				sql: brief
			});
		}
		if (/^(insert into|update)\b/.test(h)) {
			findings.push({
				kind: 'warn',
				what: 'top-level DML',
				why: 'it runs as the applying role and nothing in the database sees it; the census says these are the two storage.buckets writes, so pass --allow-dml if that is what this is',
				line: at,
				sql: brief
			});
		}
	}
	return { findings, selfManagedTransaction: opens > 0, statements: stmts.length };
}

/* ------------------------------------------------------------------------ */
/* What the file claims to create.                                           */
/* ------------------------------------------------------------------------ */

/**
 * @typedef {{ kind: string, name: string, sql: string }} Claim
 */

const ID = '(?:"[^"]+"|[a-z_][a-z0-9_$]*)';

/**
 * Every object the file names into existence, with the `pg_catalog` question
 * that answers whether it is there. Existence only: a function is checked by
 * schema and name, NOT by signature, because reconstructing an argument type
 * list from a parameter list with modes and defaults is a second SQL parser and
 * a wrong one would report a perfectly applied migration as unverified.
 *
 * @param {string} sql
 * @returns {Claim[]}
 */
export function claims(sql) {
	/** @type {Map<string, Claim>} */
	const found = new Map();
	const add = (/** @type {string} */ kind, /** @type {string} */ name, /** @type {string} */ q) => {
		found.set(`${kind}:${name}`, { kind, name, sql: q });
	};
	const lit = (/** @type {string} */ s) => "'" + s.replace(/"/g, '').replace(/'/g, "''") + "'";
	const parts = (/** @type {string} */ qualified) => {
		const bits = qualified.split('.').map((b) => b.replace(/"/g, ''));
		return bits.length === 2 ? bits : ['public', bits[0]];
	};
	for (const s of splitStatements(sql)) {
		const h = head(s.text);
		let m;
		if ((m = new RegExp(`^create table (?:if not exists )?(${ID}(?:\\.${ID})?)`).exec(h))) {
			const [sc, nm] = parts(m[1]);
			add(
				'table',
				`${sc}.${nm}`,
				`exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = ${lit(sc)} and c.relname = ${lit(nm)} and c.relkind in ('r','p'))`
			);
		} else if (
			(m = new RegExp(
				`^create (?:or replace )?(?:materialized )?view (?:if not exists )?(${ID}(?:\\.${ID})?)`
			).exec(h))
		) {
			const [sc, nm] = parts(m[1]);
			add(
				'view',
				`${sc}.${nm}`,
				`exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = ${lit(sc)} and c.relname = ${lit(nm)} and c.relkind in ('v','m'))`
			);
		} else if ((m = new RegExp(`^create (?:or replace )?function (${ID}(?:\\.${ID})?)`).exec(h))) {
			const [sc, nm] = parts(m[1]);
			add(
				'function',
				`${sc}.${nm}`,
				`exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = ${lit(sc)} and p.proname = ${lit(nm)})`
			);
		} else if (
			(m = new RegExp(
				`^create (?:unique )?index (?:concurrently )?(?:if not exists )?(${ID}) on (${ID}(?:\\.${ID})?)`
			).exec(h))
		) {
			const [sc] = parts(m[2]);
			const nm = m[1].replace(/"/g, '');
			add(
				'index',
				`${sc}.${nm}`,
				`exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = ${lit(sc)} and c.relname = ${lit(nm)} and c.relkind = 'i')`
			);
		} else if ((m = new RegExp(`^create policy (${ID}) on (${ID}(?:\\.${ID})?)`).exec(h))) {
			const [sc, tb] = parts(m[2]);
			const nm = m[1].replace(/"/g, '');
			add(
				'policy',
				`${sc}.${tb}:${nm}`,
				`exists (select 1 from pg_catalog.pg_policy pol join pg_catalog.pg_class c on c.oid = pol.polrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = ${lit(sc)} and c.relname = ${lit(tb)} and pol.polname = ${lit(nm)})`
			);
		} else if (
			(m = new RegExp(
				`^create (?:or replace )?(?:constraint )?trigger (${ID})[\\s\\S]*? on (${ID}(?:\\.${ID})?)`
			).exec(h))
		) {
			const [sc, tb] = parts(m[2]);
			const nm = m[1].replace(/"/g, '');
			add(
				'trigger',
				`${sc}.${tb}:${nm}`,
				`exists (select 1 from pg_catalog.pg_trigger tg join pg_catalog.pg_class c on c.oid = tg.tgrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = ${lit(sc)} and c.relname = ${lit(tb)} and tg.tgname = ${lit(nm)})`
			);
		} else if ((m = new RegExp(`^create schema (?:if not exists )?(${ID})`).exec(h))) {
			const nm = m[1].replace(/"/g, '');
			add('schema', nm, `exists (select 1 from pg_catalog.pg_namespace where nspname = ${lit(nm)})`);
		}
		// `alter table t add column [if not exists] c` -- one statement can add
		// several, and these migrations routinely wrap three in one.
		if (/^alter table\b/.test(h)) {
			const t = new RegExp(`^alter table (?:if exists )?(?:only )?(${ID}(?:\\.${ID})?)`).exec(h);
			if (t) {
				const [sc, tb] = parts(t[1]);
				for (const cm of h.matchAll(new RegExp(`add column (?:if not exists )?(${ID})`, 'g'))) {
					const col = cm[1].replace(/"/g, '');
					add(
						'column',
						`${sc}.${tb}.${col}`,
						`exists (select 1 from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid = a.attrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = ${lit(sc)} and c.relname = ${lit(tb)} and a.attname = ${lit(col)} and a.attnum > 0 and not a.attisdropped)`
					);
				}
			}
		}
	}
	return [...found.values()];
}

/* ------------------------------------------------------------------------ */
/* Connecting, through an HTTP CONNECT proxy when there is one.              */
/* ------------------------------------------------------------------------ */

/**
 * True when `host` is covered by a `NO_PROXY` list.
 * @param {string} host
 * @param {string} noProxy
 */
export function bypassesProxy(host, noProxy) {
	if (!noProxy) return false;
	const h = host.toLowerCase();
	return noProxy
		.split(',')
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean)
		.some((e) => {
			if (e === '*') return true;
			const bare = e.replace(/^\*?\./, '');
			return h === bare || h.endsWith('.' + bare) || h === e;
		});
}

/**
 * Open a TCP socket to `host:port` through an HTTP CONNECT proxy and resolve it
 * only once the proxy has answered 2xx. Rejecting on anything else is the point:
 * a proxy that answers 403 must not look like a database that is down.
 *
 * @param {string} proxyUrl
 * @param {string} host
 * @param {number} port
 * @returns {Promise<net.Socket>}
 */
export function connectThroughProxy(proxyUrl, host, port) {
	const p = new URL(proxyUrl);
	return new Promise((ok, fail) => {
		const sock = net.connect(
			{ host: p.hostname, port: Number(p.port || (p.protocol === 'https:' ? 443 : 80)) },
			() => {
				sock.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`);
			}
		);
		let banner = '';
		const onData = (/** @type {Buffer} */ b) => {
			banner += b.toString('latin1');
			const end = banner.indexOf('\r\n\r\n');
			if (end === -1) {
				if (banner.length > 8192) {
					sock.destroy();
					fail(new Error('the proxy sent no usable CONNECT response'));
				}
				return;
			}
			const status = /^HTTP\/1\.[01] (\d{3})/.exec(banner);
			sock.removeListener('data', onData);
			if (!status || status[1][0] !== '2') {
				sock.destroy();
				fail(
					new Error(
						`the proxy refused CONNECT to port ${port} (${status ? status[1] : 'unparseable response'})`
					)
				);
				return;
			}
			const rest = banner.slice(end + 4);
			if (rest.length) sock.unshift(Buffer.from(rest, 'latin1'));
			ok(sock);
		};
		sock.on('data', onData);
		sock.once('error', fail);
	});
}

/**
 * A `pg` client for `url`, tunnelled when this container cannot reach the port
 * directly. `pg` calls `stream.connect(port, host)` and then waits for a
 * `connect` event, so an ALREADY connected socket is handed over with its
 * `connect` stubbed to re-emit; nothing is written before the tunnel is up.
 *
 * @param {string} url
 * @param {{ proxy?: string, noProxy?: string }} [env]
 */
export async function makeClient(url, env = {}) {
	const proxy = env.proxy ?? process.env.HTTPS_PROXY ?? process.env.https_proxy ?? '';
	const noProxy = env.noProxy ?? process.env.NO_PROXY ?? process.env.no_proxy ?? '';
	const u = new URL(url);
	const host = u.hostname;
	const port = Number(u.port || 5432);
	const ssl = /sslmode=disable/.test(u.search) ? false : { rejectUnauthorized: false };

	if (!proxy || bypassesProxy(host, noProxy)) {
		return { client: new pg.Client({ connectionString: url, ssl }), tunnelled: false };
	}
	const sock = await connectThroughProxy(proxy, host, port);
	// pg attaches its `connect` listener AFTER calling connect(), so the event
	// has to arrive on a later tick than the call.
	Object.defineProperty(sock, 'connect', {
		value: () => {
			process.nextTick(() => sock.emit('connect'));
			return sock;
		},
		writable: true,
		configurable: true
	});
	return {
		client: new pg.Client({ connectionString: url, ssl, stream: () => sock }),
		tunnelled: true
	};
}

/* ------------------------------------------------------------------------ */
/* Resolving the file, and the ordering rule.                                */
/* ------------------------------------------------------------------------ */

/** @param {string} arg */
export function resolveMigration(arg, dir = MIGRATIONS_DIR) {
	const files = readdirSync(dir)
		.filter((f) => /^\d{4}_.*\.sql$/.test(f))
		.sort();
	if (/^\d{1,4}$/.test(arg)) {
		const num = arg.padStart(4, '0');
		const hit = files.filter((f) => f.startsWith(num + '_'));
		if (hit.length !== 1) throw new Error(`${hit.length} migration files start with ${num}_`);
		return { file: hit[0], path: join(dir, hit[0]), num };
	}
	const name = basename(arg);
	if (!files.includes(name)) throw new Error(`${name} is not a migration file in supabase/migrations`);
	return { file: name, path: join(dir, name), num: name.slice(0, 4) };
}

/**
 * The ordering rule, read off the probe findings.
 *
 * It is only as strong as the probe FLOOR: nothing below `--since` is asked
 * about at all, so "the lowest unapplied" means the lowest at or above the
 * floor. That is stated rather than smoothed over.
 *
 * @param {{ num: string, file: string, object: string, state: string, why: string }[]} findings
 * @param {string} targetNum
 * @returns {{ ok: true } | { ok: false, why: string }}
 */
export function orderVerdict(findings, targetNum) {
	const below = findings.filter((f) => f.num < targetNum);
	const notApplied = below.filter((f) => f.state === 'not-applied');
	if (notApplied.length) {
		return {
			ok: false,
			why: `${notApplied.length} migration(s) below ${targetNum} are NOT applied (${notApplied.map((f) => f.num).join(', ')}). This file is not the lowest unapplied one.`
		};
	}
	const unknown = below.filter((f) => f.state === 'unknown');
	if (unknown.length) {
		return {
			ok: false,
			why: `${unknown.length} migration(s) below ${targetNum} cannot be confirmed applied (${unknown.map((f) => f.num).join(', ')}). Cannot say is never a pass.`
		};
	}
	const self = findings.filter((f) => f.num === targetNum);
	if (self.length === 0) {
		return {
			ok: false,
			why: `the probe has no row for ${targetNum} at all, so it cannot say whether it is already applied.`
		};
	}
	if (self.some((f) => f.state === 'applied')) {
		return {
			ok: false,
			why: `${targetNum} is ALREADY applied to this database. Applying it again is not this tool's job.`
		};
	}
	if (self.some((f) => f.state === 'unknown')) {
		return {
			ok: false,
			why: `the probe cannot say whether ${targetNum} is applied (${self[0].why}). Cannot say is never a pass.`
		};
	}
	return { ok: true };
}

/* ------------------------------------------------------------------------ */
/* Running it.                                                               */
/* ------------------------------------------------------------------------ */

/** @param {pg.Client} client */
export async function guardFingerprint(client) {
	const r = await client.query(
		`select md5(pg_catalog.pg_get_functiondef(p.oid)) as fp
		 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
		 where n.nspname = 'idea_guard' and p.proname = 'applier_guard'`
	);
	return r.rows[0]?.fp ?? null;
}

/**
 * @typedef {{ severity: string, message: string }} Notice
 */

/**
 * Apply one file inside one transaction, collecting every notice in order.
 *
 * A file that opens its own transaction is NOT wrapped: an inner `commit` would
 * commit this tool's wrapper early, and every statement after it would then be
 * outside any transaction with the rollback below silently doing nothing.
 *
 * @param {pg.Client} client
 * @param {string} sql
 * @param {boolean} selfManaged
 * @param {Notice[]} notices
 */
export async function applyInTransaction(client, sql, selfManaged, notices) {
	if (!selfManaged) await client.query('begin');
	try {
		await client.query(sql);
		if (!selfManaged) await client.query('commit');
		return { ok: /** @type {const} */ (true) };
	} catch (err) {
		const e = /** @type {Error & { code?: string, where?: string }} */ (err);
		try {
			await client.query('rollback');
		} catch {
			/* the server may have aborted it already */
		}
		return {
			ok: /** @type {const} */ (false),
			code: e.code ?? '',
			message: e.message ?? String(err),
			where: e.where ?? '',
			// P0001 is `raise exception` -- a migration's own self-check saying
			// no. 42501 is the event trigger guard, or an RLS/privilege refusal.
			// Either is a considered answer; anything else is a failure.
			refusal: e.code === 'P0001' || e.code === '42501',
			notices: notices.length
		};
	}
}

/* ------------------------------------------------------------------------ */
/* CLI.                                                                      */
/* ------------------------------------------------------------------------ */

/** @param {string[]} argv */
export function parseArgs(argv) {
	const o = {
		target: '',
		since: 151,
		ref: 'origin/integration',
		json: false,
		dryRun: false,
		allowDml: false,
		/** @type {string | undefined} */
		ledger: undefined
	};
	for (let i = 0; i < argv.length; i += 1) {
		const a = argv[i];
		if (a === '--since') o.since = Number.parseInt(argv[++i], 10);
		else if (a === '--ref') o.ref = argv[++i];
		else if (a === '--json') o.json = true;
		else if (a === '--dry-run') o.dryRun = true;
		else if (a === '--allow-dml') o.allowDml = true;
		else if (a === '--ledger') o.ledger = argv[++i];
		else if (a.startsWith('--')) throw new Error(`unknown argument: ${a}`);
		else if (!o.target) o.target = a;
		else throw new Error('exactly one migration may be named');
	}
	if (!o.target) throw new Error('name the migration to apply, by number or by path');
	if (!Number.isInteger(o.since)) throw new Error('--since needs a whole number');
	return o;
}

const STATE_WORD = { applied: 'APPLIED', 'not-applied': 'NOT APPLIED', unknown: 'CANNOT SAY' };

/** @param {string} s */
const say = (s) => process.stdout.write(s + '\n');

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	/** @type {Record<string, unknown>} */
	const report = { target: opts.target, applied: false };

	let target;
	try {
		target = resolveMigration(opts.target);
	} catch (err) {
		console.error(`apply-migration: ${/** @type {Error} */ (err).message}`);
		return EXIT.cannotRun;
	}
	report.file = target.file;
	say(`apply-migration: ${target.file}`);

	const sql = readFileSync(target.path, 'utf8');
	const scan = scanFile(sql);
	report.statements = scan.statements;
	report.selfManagedTransaction = scan.selfManagedTransaction;
	say(
		`  ${scan.statements} top-level statement(s); ${scan.selfManagedTransaction ? 'the FILE opens its own transaction, so this tool adds none' : 'this tool wraps it in one transaction'}`
	);

	const refusals = scan.findings.filter((f) => f.kind === 'refuse');
	const warns = scan.findings.filter((f) => f.kind === 'warn');
	for (const f of scan.findings) {
		say(`  ${f.kind === 'refuse' ? 'REFUSE' : 'NOTE  '}  line ${f.line}: ${f.what} -- ${f.why}`);
		say(`            ${f.sql}`);
	}
	report.findings = scan.findings;
	if (refusals.length) {
		say(
			`\nREFUSING to send ${target.file}: ${refusals.length} statement(s) this tool does not apply. Nothing was sent.`
		);
		if (opts.json) say(JSON.stringify(report, null, 2));
		return EXIT.refused;
	}
	if (warns.length && !opts.allowDml) {
		say(
			`\nREFUSING: ${warns.length} top-level DML statement(s). Re-run with --allow-dml if that is deliberate. Nothing was sent.`
		);
		if (opts.json) say(JSON.stringify(report, null, 2));
		return EXIT.refused;
	}

	// --- the ledger gate ------------------------------------------------
	// BEFORE the connection, deliberately: an unauthorised bundle should not
	// even open a socket to the production database, and every check here is
	// local. See `resolveLedger` for how the entry is found and why.
	const ledger = resolveLedger(opts.ledger);
	if (!ledger.ok) {
		say('');
		say(`REFUSING to apply ${target.file}: ${ledger.why}`);
		say(`  ${ledger.how}`);
		say('  Nothing was sent, and no connection was opened.');
		report.ledger = { ok: false, why: ledger.why };
		if (opts.json) say(JSON.stringify(report, null, 2));
		return EXIT.refused;
	}
	say(`  ledger ${ledger.file} permits a migration ("${ledger.raw}")`);

	// "At most one" has to mean one across INVOCATIONS, not one per command
	// line, or a session applies 0185 and then 0186 as two ordinary runs. The
	// committed trace from B1 is what makes that answerable.
	const already = appliesUnderLedger(ledger.id);
	if (already.length) {
		say('');
		say(
			`REFUSING to apply ${target.file}: ledger entry ${ledger.file} has already applied a migration -- docs/migrations-applied/${already.join(', ')}.`
		);
		say(
			'  Every permitting spelling in the ledger permits AT MOST ONE. A second migration is a second bundle, with its own entry.'
		);
		say('  Nothing was sent, and no connection was opened.');
		report.ledger = { ok: false, why: 'a migration is already recorded under this ledger entry', already };
		if (opts.json) say(JSON.stringify(report, null, 2));
		return EXIT.refused;
	}

	// The number is ADVISORY. See `ledgerPermission` for why a mismatch is a
	// warning carried into the record rather than a refusal.
	const numberWarning =
		ledger.number && ledger.number !== target.num
			? `the ledger entry names migration ${ledger.number} and this is ${target.num}. The number in an entry is written at issue time and is routinely stale (prompt 0056 renumbered mid-session); the permission is what was checked.`
			: null;
	if (numberWarning) say(`  NOTE: ${numberWarning}`);
	report.ledger = { ok: true, id: ledger.id, file: ledger.file, raw: ledger.raw, number: ledger.number, numberWarning };

	const url = process.env[URL_VAR];
	if (!url) {
		console.error(`apply-migration: ${URL_VAR} is not set, so there is nothing to apply to.`);
		return EXIT.cannotRun;
	}

	/** @type {Notice[]} */
	const notices = [];
	let client;
	let tunnelled = false;
	try {
		const made = await makeClient(url);
		client = made.client;
		tunnelled = made.tunnelled;
		client.on('notice', (n) =>
			notices.push({ severity: n.severity ?? 'NOTICE', message: n.message ?? '' })
		);
		await client.connect();
	} catch (err) {
		console.error(`apply-migration: could not connect (${redact(/** @type {Error} */ (err).message, url)})`);
		return EXIT.cannotRun;
	}
	say(`  connected${tunnelled ? ' through the HTTP CONNECT proxy' : ' directly'}`);

	try {
		const who = await client.query(
			'select current_user as cu, session_user as su, current_database() as db'
		);
		report.sessionUser = who.rows[0].su;
		say(
			`  session_user ${who.rows[0].su}, current_user ${who.rows[0].cu}, database ${who.rows[0].db}`
		);

		const fpBefore = await guardFingerprint(client);
		report.guardBefore = fpBefore;
		if (fpBefore === null) {
			say(
				`  no database guard (${GUARD_FUNCTION} is absent, which is the NORMAL and permanent state: CREATE EVENT TRIGGER needs superuser and Supabase does not grant it). Nothing in the database will refuse a destructive statement from this role -- this tool's own scan, already run above, is the only control there is.`
			);
		} else {
			say(
				`  UNEXPECTED: ${GUARD_FUNCTION} IS present (fingerprint ${fpBefore.slice(0, 12)}). This project was measured as unable to create an event trigger, so either something changed or this function is dead code that refuses nothing. Read supabase/roles/idea_migrator.sql before treating it as a control.`
			);
		}
		if (who.rows[0].su !== 'idea_migrator') {
			say(
				`  WARNING: session_user is "${who.rows[0].su}", not "idea_migrator". The guard keys on session_user and will NOT fire for this connection. This is more privilege than the scoped role, and this tool cannot narrow it -- it can only say so.`
			);
			report.overPrivileged = true;
		}

		// --- the ordering rule -------------------------------------------
		let findings;
		try {
			const probes = prepare(readProbes({ since: opts.since, ref: opts.ref }));
			const probeSql = buildSql(probes);
			/** @type {Map<number, boolean>} */
			const rows = new Map();
			if (probeSql) {
				await client.query('begin read only');
				const res = await client.query(probeSql.replace(/^set transaction read only;\n/, ''));
				await client.query('rollback');
				for (const r of res.rows) rows.set(Number(r.i), r.applied === true);
			}
			findings = verdicts(probes, rows);
		} catch (err) {
			say(
				`  REFUSING: the applied set could not be read (${redact(/** @type {Error} */ (err).message, url)}). Cannot say is never a pass.`
			);
			return EXIT.refused;
		}
		report.probe = findings;
		for (const f of findings) {
			say(
				`    ${f.num}  ${STATE_WORD[f.state].padEnd(11)}  ${f.object}${f.why ? `  -- ${f.why}` : ''}`
			);
		}
		const order = orderVerdict(findings, target.num);
		if (!order.ok) {
			say(`\nREFUSING to apply ${target.file}: ${order.why}`);
			if (opts.json) say(JSON.stringify(report, null, 2));
			return EXIT.refused;
		}
		say(
			`  ordering: ${target.num} is the lowest unapplied migration at or above ${String(opts.since).padStart(4, '0')}.`
		);

		if (opts.dryRun) {
			say(`\nDRY RUN: every check passed and nothing was applied.`);
			if (opts.json) say(JSON.stringify(report, null, 2));
			return EXIT.applied;
		}

		// --- the apply ----------------------------------------------------
		const result = await applyInTransaction(client, sql, scan.selfManagedTransaction, notices);
		say('');
		for (const n of notices) say(`  ${n.severity}: ${n.message}`);
		report.notices = notices;
		if (!result.ok) {
			say('');
			say(
				result.refusal
					? `REFUSED by the database [${result.code}]: ${result.message}`
					: `FAILED [${result.code}]: ${result.message}`
			);
			if (result.where) say(`  at: ${result.where.split('\n')[0]}`);
			say(
				`The transaction was rolled back. The ${notices.length} notice(s) above are what it said before it stopped; nothing it did survives.`
			);
			report.error = { code: result.code, message: result.message, refusal: result.refusal };
			if (opts.json) say(JSON.stringify(report, null, 2));
			return EXIT.raised;
		}
		say('');
		say(`  applied. ${notices.length} notice(s).`);
		report.applied = true;

		// --- the verification --------------------------------------------
		const want = claims(sql);
		/** @type {{ kind: string, name: string, present: boolean }[]} */
		const objects = [];
		if (want.length) {
			const q = 'select ' + want.map((c, i) => `(${c.sql}) as o${i}`).join(', ');
			const r = await client.query(q);
			want.forEach((c, i) =>
				objects.push({ kind: c.kind, name: c.name, present: r.rows[0][`o${i}`] === true })
			);
		}
		report.objects = objects;
		say(`  ${objects.length} object(s) this file names:`);
		for (const o of objects) say(`    ${o.present ? 'PRESENT' : 'MISSING'}  ${o.kind} ${o.name}`);

		const fpAfter = await guardFingerprint(client);
		report.guardAfter = fpAfter;
		const guardMoved = fpBefore !== fpAfter;
		if (guardMoved) {
			say(
				`  THE GUARD MOVED. ${GUARD_FUNCTION} was ${fpBefore ?? 'absent'} and is now ${fpAfter ?? 'absent'}. This file changed the thing that refuses destructive DDL. Read it before doing anything else.`
			);
		} else if (fpAfter !== null) {
			say(`  guard unchanged (${fpAfter.slice(0, 12)}).`);
		}

		// --- the trace ------------------------------------------------------
		// THE APPLY HAS COMMITTED BY THIS POINT AND CANNOT BE UNDONE, so the
		// record is written for `unverified` too: "it applied and one object is
		// missing" is exactly the run somebody needs to find afterwards, and a
		// trace that only covered the clean case would be missing the
		// interesting half. What it is NOT written for is any path where nothing
		// was applied -- a scan refusal, a ledger refusal, an ordering refusal, a
		// dry run, a failed connection, or a raise that rolled back. Those all
		// return above this line, which is the whole mechanism.
		const missing = objects.filter((o) => !o.present);
		const outcome = missing.length || guardMoved ? 'unverified' : 'applied';
		let recordPath = null;
		try {
			recordPath = writeAppliedRecord(
				{
					migrationNum: target.num,
					migrationFile: target.file,
					sha256: sha256(sql),
					branch: branchSlug(),
					slug: branchSlug(),
					commit: headCommit(),
					ledgerId: ledger.id,
					ledgerFile: ledger.file,
					ledgerRaw: ledger.raw,
					numberWarning,
					sessionUser: String(who.rows[0].su ?? ''),
					database: String(who.rows[0].db ?? ''),
					at: new Date().toISOString(),
					notices,
					objects,
					exit: outcome
				},
				url
			);
			report.record = recordPath;
			say(`  recorded: ${recordPath.slice(REPO_ROOT.length + 1)}`);
		} catch (err) {
			// THE APPLY STILL HAPPENED. A record that could not be written is a
			// finding to shout about, never a reason to report the apply as
			// having failed -- that is how somebody runs it a second time.
			say(
				`  COULD NOT WRITE THE RECORD (${redact(/** @type {Error} */ (err).message, url)}). THE MIGRATION IS APPLIED ANYWAY. Write docs/migrations-applied/${target.num}-${branchSlug()}.md by hand from the output above.`
			);
			report.recordError = redact(/** @type {Error} */ (err).message, url);
		}

		if (missing.length || guardMoved) {
			say('');
			say(
				missing.length
					? `APPLIED, BUT ${missing.length} object(s) this file names are not in the catalog. The transaction committed; something in the file did not create what its text says it does.`
					: 'APPLIED, but the guard moved.'
			);
			if (opts.json) say(JSON.stringify(report, null, 2));
			return EXIT.unverified;
		}
		say('');
		say(`${target.file} is applied and every object it names is present.`);
		say(`Commit the record with your work: git add docs/migrations-applied/`);
		if (opts.json) say(JSON.stringify(report, null, 2));
		return EXIT.applied;
	} finally {
		await client.end().catch(() => {});
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().then(
		(code) => process.exit(code),
		(err) => {
			const url = process.env[URL_VAR] ?? '';
			console.error(`apply-migration: ${redact(err?.message ?? String(err), url)}`);
			process.exit(EXIT.cannotRun);
		}
	);
}
